import { z } from "zod";
import type { AnalysisParameterLimit } from "../analysisSettings.js";
import { knownCoverageStatusSchema } from "../coverage.js";
import { absoluteLocalPathStringSchema } from "../localPath.js";
import {
  parameterBudgetLimitFor,
  parameterBudgetSchema,
  type ParameterBudget,
} from "../parameterBudget.js";

/**
 * Fixed-width and compressed RISC instruction sets that synthesize 32-bit or
 * 64-bit peripheral register addresses across split high/low instruction pairs.
 */
export const FIRMWARE_MMIO_ARCHITECTURES = [
  "riscv32",
  "riscv64",
  "mips32le",
  "mips32be",
  "ppc32be",
  "arm64",
] as const;

export const firmwareMmioArchitectureSchema = z.enum(
  FIRMWARE_MMIO_ARCHITECTURES,
);
export type FirmwareMmioArchitecture = z.infer<
  typeof firmwareMmioArchitectureSchema
>;

export const formatHexAddress = (value: bigint): string =>
  `0x${value.toString(16)}`;

export const DEFAULT_MMIO_SYNTHESIS_MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_MMIO_SYNTHESIS_FILE_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MMIO_SYNTHESIS_MAX_SCAN_BYTES = 256 * 1024;
export const MAX_MMIO_SYNTHESIS_SCAN_BYTES = 4 * 1024 * 1024;
export const DEFAULT_MMIO_SYNTHESIS_MAX_SYNTHESES = 512;
export const MAX_MMIO_SYNTHESIS_SYNTHESES = 4096;
export const DEFAULT_MMIO_SYNTHESIS_WINDOW_INSTRUCTIONS = 16;
export const MAX_MMIO_SYNTHESIS_WINDOW_INSTRUCTIONS = 64;
export const MAX_SVD_XML_CHARS = 4 * 1024 * 1024;
export const DEFAULT_SVD_XML_NODES = 200_000;
export const MAX_SVD_XML_NODES = 1_000_000;
export const DEFAULT_SVD_EXPANDED_CHARS = 1 * 1024 * 1024;
export const MAX_SVD_EXPANDED_CHARS = 8 * 1024 * 1024;

export const FIRMWARE_MMIO_SYNTHESIS_BUDGETS = {
  max_scan_bytes: {
    minimum: 4,
    maximum: MAX_MMIO_SYNTHESIS_SCAN_BYTES,
    default_value: DEFAULT_MMIO_SYNTHESIS_MAX_SCAN_BYTES,
    unit: "bytes",
  },
  max_syntheses: {
    minimum: 1,
    maximum: MAX_MMIO_SYNTHESIS_SYNTHESES,
    default_value: DEFAULT_MMIO_SYNTHESIS_MAX_SYNTHESES,
    unit: "count",
  },
  max_window_instructions: {
    minimum: 1,
    maximum: MAX_MMIO_SYNTHESIS_WINDOW_INSTRUCTIONS,
    default_value: DEFAULT_MMIO_SYNTHESIS_WINDOW_INSTRUCTIONS,
    unit: "count",
  },
  max_file_bytes: {
    minimum: 4,
    maximum: MAX_MMIO_SYNTHESIS_FILE_BYTES,
    default_value: DEFAULT_MMIO_SYNTHESIS_MAX_FILE_BYTES,
    unit: "bytes",
  },
  max_svd_xml_nodes: {
    minimum: 1,
    maximum: MAX_SVD_XML_NODES,
    default_value: DEFAULT_SVD_XML_NODES,
    unit: "count",
  },
  max_svd_expanded_chars: {
    minimum: 64,
    maximum: MAX_SVD_EXPANDED_CHARS,
    default_value: DEFAULT_SVD_EXPANDED_CHARS,
    unit: "count",
  },
} as const satisfies Record<string, ParameterBudget>;

export type FirmwareMmioBudgetParameter =
  keyof typeof FIRMWARE_MMIO_SYNTHESIS_BUDGETS;

export const firmwareMmioBudgetLimit: (
  parameter: FirmwareMmioBudgetParameter,
  effectiveValue: number,
) => AnalysisParameterLimit = parameterBudgetLimitFor(
  FIRMWARE_MMIO_SYNTHESIS_BUDGETS,
);

export const inspectFirmwareMmioSynthesisInputSchema = z.strictObject({
  path: absoluteLocalPathStringSchema.describe(
    "Local bare-metal firmware binary or flash image path to inspect without executing it.",
  ),
  architecture: firmwareMmioArchitectureSchema.describe(
    "Explicit instruction set for split-immediate disassembly: riscv32, riscv64, mips32le, mips32be, ppc32be, or arm64.",
  ),
  base_address: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{1,16}$/u,
      "base_address must be a hex load address such as 0x08000000 or 0xbfc00000",
    )
    .describe(
      "Explicit hex load base address corresponding to file offset 0 (32-bit for riscv32/mips32/ppc32be, up to 64-bit for riscv64/arm64).",
    ),
  scan_offset: z
    .number()
    .int()
    .min(0)
    .max(MAX_MMIO_SYNTHESIS_FILE_BYTES)
    .multipleOf(2)
    .default(0)
    .describe(
      "Instruction-aligned byte offset inside the file where linear disassembly starts (2-byte aligned on RISC-V, 4-byte aligned elsewhere). Defaults to 0.",
    ),
  max_scan_bytes: parameterBudgetSchema(
    FIRMWARE_MMIO_SYNTHESIS_BUDGETS.max_scan_bytes,
  ).describe(
    "Maximum bytes of instruction stream scanned starting at scan_offset.",
  ),
  max_syntheses: parameterBudgetSchema(
    FIRMWARE_MMIO_SYNTHESIS_BUDGETS.max_syntheses,
  ).describe("Maximum split-immediate address syntheses returned."),
  max_window_instructions: parameterBudgetSchema(
    FIRMWARE_MMIO_SYNTHESIS_BUDGETS.max_window_instructions,
  ).describe(
    "Maximum forward instructions tracked after a high-immediate producer before expiring register state.",
  ),
  mmio_only: z
    .boolean()
    .default(true)
    .describe(
      "When true (default), emit only addresses classified as architectural MMIO/uncached peripheral space or matched by svd_xml; when false, include RAM/Flash/other split-immediate syntheses.",
    ),
  svd_xml: z
    .string()
    .min(1)
    .max(MAX_SVD_XML_CHARS)
    .optional()
    .describe(
      "Optional CMSIS-SVD XML document text used to bind synthesized addresses to declared peripheral blocks and exact register offsets.",
    ),
  max_svd_xml_nodes: parameterBudgetSchema(
    FIRMWARE_MMIO_SYNTHESIS_BUDGETS.max_svd_xml_nodes,
  ).describe("Maximum XML nodes admitted when parsing svd_xml."),
  max_svd_expanded_chars: parameterBudgetSchema(
    FIRMWARE_MMIO_SYNTHESIS_BUDGETS.max_svd_expanded_chars,
  ).describe(
    "Maximum cumulative CMSIS-SVD peripheral and register identifier characters expanded.",
  ),
  max_file_bytes: parameterBudgetSchema(
    FIRMWARE_MMIO_SYNTHESIS_BUDGETS.max_file_bytes,
  ).describe("Maximum input file size admitted for reading."),
});

export type InspectFirmwareMmioSynthesisInput = z.output<
  typeof inspectFirmwareMmioSynthesisInputSchema
>;

export const mmioRegionClassSchema = z.enum([
  "svd_peripheral",
  "mips_kseg1_mmio",
  "architectural_mmio",
  "non_mmio_or_ram_flash",
]);
export type MmioRegionClass = z.infer<typeof mmioRegionClassSchema>;

export const mmioAccessKindSchema = z.enum([
  "load",
  "store",
  "address_materialization",
]);
export type MmioAccessKind = z.infer<typeof mmioAccessKindSchema>;

export const firmwareMmioSynthesisItemSchema = z.strictObject({
  high_file_offset: z.number().int().min(0),
  high_instruction_address: z.string(),
  high_mnemonic: z.string(),
  low_file_offset: z.number().int().min(0),
  low_instruction_address: z.string(),
  low_mnemonic: z.string(),
  base_register: z.string(),
  pattern: z.string(),
  access_kind: mmioAccessKindSchema,
  access_width_bytes: z.number().int().min(1).max(8).nullable(),
  synthesized_address: z.string(),
  physical_address: z.string().nullable(),
  region_class: mmioRegionClassSchema,
  peripheral_name: z.string().nullable(),
  peripheral_base: z.string().nullable(),
  register_offset: z.string().nullable(),
  register_name: z.string().nullable(),
});
export type FirmwareMmioSynthesisItem = z.infer<
  typeof firmwareMmioSynthesisItemSchema
>;

export const firmwareMmioPeripheralGroupSchema = z.strictObject({
  group_base_address: z.string(),
  peripheral_name: z.string().nullable(),
  region_class: mmioRegionClassSchema,
  access_count: z.number().int().min(1),
  load_count: z.number().int().min(0),
  store_count: z.number().int().min(0),
  materialization_count: z.number().int().min(0),
  distinct_offsets: z.array(z.string()),
  register_names: z.array(z.string()),
});
export type FirmwareMmioPeripheralGroup = z.infer<
  typeof firmwareMmioPeripheralGroupSchema
>;

export const svdPeripheralSummarySchema = z.strictObject({
  supplied: z.boolean(),
  peripheral_count: z.number().int().min(0),
  matched_synthesis_count: z.number().int().min(0),
  exact_register_match_count: z.number().int().min(0),
});

export const firmwareMmioSynthesisSchema = z.strictObject({
  artifact: z.strictObject({
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    bytes: z.number().int().min(0),
  }),
  architecture: firmwareMmioArchitectureSchema,
  base_address: z.string(),
  scan_offset: z.number().int().min(0),
  scan_start_address: z.string(),
  mmio_only: z.boolean(),
  decoded_instructions: z.number().int().min(0),
  scan_file_range: z.strictObject({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }),
  coverage: z.strictObject({
    status: knownCoverageStatusSchema,
    examined_bytes: z.number().int().min(0),
    available_from_offset_bytes: z.number().int().min(0),
  }),
  syntheses: z.array(firmwareMmioSynthesisItemSchema),
  load_synthesis_count: z.number().int().min(0),
  store_synthesis_count: z.number().int().min(0),
  materialization_synthesis_count: z.number().int().min(0),
  peripheral_groups: z.array(firmwareMmioPeripheralGroupSchema),
  svd_peripherals: svdPeripheralSummarySchema,
  anomalies: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type FirmwareMmioSynthesis = z.infer<typeof firmwareMmioSynthesisSchema>;

/** Verify that stored access-kind counts match `syntheses`. */
export const mmioSynthesisCountsMatch = (
  report: FirmwareMmioSynthesis,
): boolean => {
  // not-an-allowance: recount of load syntheses
  let loads = 0;
  // not-an-allowance: recount of store syntheses
  let stores = 0;
  // not-an-allowance: recount of address materializations
  let mats = 0;
  for (const item of report.syntheses) {
    if (item.access_kind === "load") loads += 1;
    else if (item.access_kind === "store") stores += 1;
    else mats += 1;
  }
  return (
    loads === report.load_synthesis_count &&
    stores === report.store_synthesis_count &&
    mats === report.materialization_synthesis_count
  );
};
