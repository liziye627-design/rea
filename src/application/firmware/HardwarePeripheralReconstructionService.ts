import { z } from "zod";
import type {
  AnalysisOperationPort,
  ExecutionOptions,
} from "../AnalysisProvider.js";
import {
  attributeHardwareAccess,
  summarizeHardwarePeripheralInteractions,
  type AnalyzedInstructionReference,
  type HardwareAccessAttribution,
  type HardwarePeripheralBlockSummary,
} from "../../domain/firmware/hardwarePeripheralAttribution.js";
import {
  type HardwareArchitecture,
  hardwareArchitectureSchema,
  hardwareMemoryRegionKindSchema,
} from "../../domain/firmware/hardwareMemoryMap.js";
import {
  detectSocPlatform,
  lookupSocPeripheral,
  type SocPlatform,
  socPlatformSchema,
  type SocPlatformMatchCandidate,
} from "../../domain/firmware/socPeripheralDatabase.js";
import {
  type ArmVectorTable,
  armVectorTableSchema,
} from "../../domain/firmware/armVectorTable.js";
import {
  type RiscvTrapTable,
  riscvTrapTableSchema,
} from "../../domain/firmware/riscvTrapVector.js";
import {
  AnalysisCancelledError,
  AnalysisInputError,
  AnalysisOutputError,
} from "../../domain/analysisErrorCore.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { err, ok, type Result } from "../../domain/result.js";
import { referenceKindSchema } from "../../domain/hopperValues.js";

const procedureReferencesResultSchema = z.strictObject({
  reference_kinds_available: z.boolean(),
  references: z.array(
    z.strictObject({
      source_address: z.string(),
      target_address: z.string(),
      target_procedure: z
        .strictObject({ address: z.string(), name: z.string().optional() })
        .nullable()
        .optional(),
      kind: referenceKindSchema,
    }),
  ),
  unresolved_calls: z.array(
    z.strictObject({ address: z.string(), reason: z.string() }),
  ),
});

/** Input parameters for reconstructing a procedure's hardware peripheral interactions. */
export const reconstructProcedureHardwareInputSchema = z.strictObject({
  procedure: z
    .string()
    .min(1)
    .describe("Target procedure symbol name or canonical entrypoint address"),
  architecture: hardwareArchitectureSchema.describe(
    "Target hardware CPU architecture for memory map and register resolution",
  ),
  platform: socPlatformSchema
    .optional()
    .describe(
      "Optional explicit target SoC family (stm32f1, stm32f4, gd32f1, esp32, rp2040, nrf52) for device-specific register mapping",
    ),
  vectorTable: armVectorTableSchema
    .optional()
    .describe(
      "Optional decoded firmware vector table to identify procedure as a hardware interrupt handler",
    ),
  trapTable: riscvTrapTableSchema
    .optional()
    .describe(
      "Optional decoded RISC-V firmware trap table to identify procedure as a hardware interrupt or exception handler",
    ),
});
export type ReconstructProcedureHardwareInput = z.infer<
  typeof reconstructProcedureHardwareInputSchema
>;

/** Enriched peripheral block with optional SoC-specific controller identification. */
export interface ReconstructedPeripheralBlock extends HardwarePeripheralBlockSummary {
  readonly socPeripheralName?: string | null;
  readonly socPeripheralBus?: string | null;
}

/** Output result detailing reconstructed hardware peripheral interactions for a procedure. */
export interface HardwarePeripheralReconstruction {
  readonly procedure: string;
  readonly architecture: HardwareArchitecture;
  readonly platform: SocPlatform | null;
  readonly vectorHandlerName?: string | null;
  readonly totalReferencesExamined: number;
  readonly mmioAccessCount: number;
  readonly nonMmioAccessCount: number;
  readonly peripheralBlocks: readonly ReconstructedPeripheralBlock[];
  readonly attributions: readonly HardwareAccessAttribution[];
  readonly detectedPlatforms: readonly SocPlatformMatchCandidate[];
  readonly limitations: readonly string[];
}

export const hardwarePeripheralReconstructionSchema = z.strictObject({
  procedure: z.string(),
  architecture: hardwareArchitectureSchema,
  platform: socPlatformSchema.nullable().optional(),
  vectorHandlerName: z.string().nullable().optional(),
  totalReferencesExamined: z.number().int().min(0),
  mmioAccessCount: z.number().int().min(0),
  nonMmioAccessCount: z.number().int().min(0),
  peripheralBlocks: z.array(
    z.strictObject({
      blockBase: z.string(),
      regionName: z.string(),
      regionKind: hardwareMemoryRegionKindSchema,
      totalAccesses: z.number().int().min(0),
      readCount: z.number().int().min(0),
      writeCount: z.number().int().min(0),
      uniqueAddresses: z.array(z.string()),
      observedOffsets: z.array(z.string()),
      knownRegisters: z.array(z.string()),
      socPeripheralName: z.string().nullable().optional(),
      socPeripheralBus: z.string().nullable().optional(),
    }),
  ),
  attributions: z.array(
    z.strictObject({
      targetAddress: z.string(),
      addressValue: z.bigint(),
      architecture: hardwareArchitectureSchema,
      regionKind: hardwareMemoryRegionKindSchema,
      regionName: z.string(),
      isMmio: z.boolean(),
      accessKind: z.enum(["read", "write", "read_write", "unknown"]),
      peripheralBlockBase: z.string(),
      peripheralBlockOffset: z.string(),
      registerName: z.string().nullable().optional(),
      registerMnemonic: z.string().nullable().optional(),
      sourceAddress: z.string().nullable().optional(),
      operandIndex: z.number().nullable().optional(),
      provenance: z.string().nullable().optional(),
    }),
  ),
  detectedPlatforms: z.array(
    z.strictObject({
      platform: socPlatformSchema,
      matchedCount: z.number().int().min(0),
      totalAddresses: z.number().int().min(0),
      confidence: z.number(),
      matchedPeripherals: z.array(z.string()),
    }),
  ),
  limitations: z.array(z.string()),
});

/** Optional context parameters for hardware reconstruction. */
export interface ReconstructHardwareOptions {
  readonly procedure?: string;
  readonly platform?: SocPlatform | null;
  readonly vectorTable?: ArmVectorTable | null;
  readonly trapTable?: RiscvTrapTable | null;
}

/**
 * Reconstruct hardware peripheral interactions from a set of analyzed instruction references.
 * Pure deterministic domain workflow for offline and provider-decoupled analysis.
 */
export const reconstructHardwareFromReferences = (
  references: readonly AnalyzedInstructionReference[],
  architecture: HardwareArchitecture,
  procedureOrOptions: string | ReconstructHardwareOptions = "detached",
  legacyPlatform: SocPlatform | null = null,
): HardwarePeripheralReconstruction => {
  const options: ReconstructHardwareOptions =
    typeof procedureOrOptions === "string"
      ? { procedure: procedureOrOptions, platform: legacyPlatform }
      : procedureOrOptions;

  const procedure = options.procedure ?? "detached";
  const platform = options.platform ?? null;
  const vectorTable = options.vectorTable ?? null;
  const trapTable = options.trapTable ?? null;

  const attributions: HardwareAccessAttribution[] = [];
  const limitations: string[] = [];

  const candidateAddresses = references.map((r) => r.target_address);
  const detectedPlatforms =
    platform === null ? detectSocPlatform(candidateAddresses) : [];

  const activePlatform = platform ?? null;

  for (const ref of references) {
    const attributed = attributeHardwareAccess(
      ref,
      architecture,
      activePlatform,
    );
    if (attributed.ok) {
      attributions.push(attributed.value);
    } else {
      limitations.push(
        `Failed to attribute reference to ${ref.target_address}: ${attributed.error}`,
      );
    }
  }

  const summary = summarizeHardwarePeripheralInteractions(
    attributions,
    architecture,
  );

  const peripheralBlocks: ReconstructedPeripheralBlock[] =
    summary.peripheralBlocks.map((block) => {
      const matchedNames = new Set<string>();
      let primaryBus: string | null = null;

      if (activePlatform) {
        const baseDef = lookupSocPeripheral(block.blockBase, activePlatform);
        if (baseDef) {
          matchedNames.add(baseDef.name);
          primaryBus = baseDef.bus;
        }
        for (const addr of block.uniqueAddresses) {
          const def = lookupSocPeripheral(addr, activePlatform);
          if (def) {
            matchedNames.add(def.name);
            primaryBus = def.bus;
          }
        }
      }

      return {
        ...block,
        socPeripheralName:
          matchedNames.size > 0
            ? Array.from(matchedNames).sort().join(", ")
            : null,
        socPeripheralBus: primaryBus,
      };
    });

  const matchingVector = vectorTable?.vectors.find(
    (v) =>
      v.executionAddress.toLowerCase() === procedure.toLowerCase() ||
      v.targetAddress.toLowerCase() === procedure.toLowerCase() ||
      v.name.toLowerCase() === procedure.toLowerCase(),
  );
  let vectorHandlerName = matchingVector?.name ?? null;

  if (vectorHandlerName === null && trapTable != null) {
    const matchingTrap = trapTable.entries.find(
      (e) =>
        e.targetAddress.toLowerCase() === procedure.toLowerCase() ||
        e.name.toLowerCase() === procedure.toLowerCase(),
    );
    if (matchingTrap) {
      vectorHandlerName = matchingTrap.name;
    }
  }

  return {
    procedure,
    architecture,
    platform,
    vectorHandlerName,
    totalReferencesExamined: summary.totalReferencesExamined,
    mmioAccessCount: summary.mmioAccessCount,
    nonMmioAccessCount: summary.nonMmioAccessCount,
    peripheralBlocks,
    attributions,
    detectedPlatforms,
    limitations,
  };
};

type RawReferenceEdge = z.infer<
  typeof procedureReferencesResultSchema
>["references"][number];

const toAnalyzedReference = (
  edge: RawReferenceEdge,
): AnalyzedInstructionReference | null => {
  const kind = edge.kind;
  if (!kind.available) {
    return {
      target_address: edge.target_address,
      source_address: edge.source_address,
      read: null,
      write: null,
      data: null,
      call: false,
      jump: false,
      provenance: null,
    };
  }

  // Ignore direct calls and jumps to other code procedures when analyzing data/MMIO accesses
  if ((kind.call || kind.jump) && !kind.data) {
    return null;
  }

  return {
    target_address: edge.target_address,
    source_address: edge.source_address,
    read: kind.read,
    write: kind.write,
    data: kind.data,
    call: kind.call,
    jump: kind.jump,
    ...(typeof kind.operand_index === "number"
      ? { operand_index: kind.operand_index }
      : {}),
    provenance: kind.provenance,
  };
};

/**
 * High-level application workflow: Reconstruct hardware peripheral interactions for a given procedure.
 * Queries provider procedure references, classifies physical memory regions, resolves standard architectural
 * registers, and aggregates interactions into cohesive 4 KiB hardware peripheral blocks.
 */
export const reconstructProcedureHardwareInteractions = async (
  analysis: AnalysisOperationPort,
  parameters: unknown,
  options?: ExecutionOptions,
): Promise<Result<HardwarePeripheralReconstruction, AnalysisError>> => {
  if (options?.signal?.aborted) {
    return err(
      new AnalysisCancelledError("reconstruct_procedure_hardware_interactions"),
    );
  }

  const parsed = reconstructProcedureHardwareInputSchema.safeParse(parameters);
  if (!parsed.success) {
    return err(
      new AnalysisInputError("reconstruct_procedure_hardware_interactions", {
        cause: parsed.error,
      }),
    );
  }

  const { procedure, architecture, platform, vectorTable, trapTable } =
    parsed.data;

  const execution = await analysis.execute(
    "procedure_references",
    { procedure, direction: "outgoing" },
    options,
  );

  if (!execution.ok) {
    return execution;
  }

  const parsedReferences = procedureReferencesResultSchema.safeParse(
    execution.value.result,
  );

  if (!parsedReferences.success) {
    return err(
      new AnalysisOutputError(
        "procedure_references",
        "Procedure references output did not match expected reference edge schema",
      ),
    );
  }

  const analyzedReferences: AnalyzedInstructionReference[] = [];
  for (const edge of parsedReferences.data.references) {
    const ref = toAnalyzedReference(edge);
    if (ref !== null) {
      analyzedReferences.push(ref);
    }
  }

  const result = reconstructHardwareFromReferences(
    analyzedReferences,
    architecture,
    {
      procedure,
      platform: platform ?? null,
      vectorTable: vectorTable ?? null,
      trapTable: trapTable ?? null,
    },
  );

  return ok(result);
};
