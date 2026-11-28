import { AnalysisInputError } from "../../domain/analysisErrorCore.js";
import {
  decodeLimit,
  type ParseFailureError,
} from "../../domain/parseFailure.js";
import {
  isParseLimit,
  parseLimitConstraint,
} from "../../domain/parseFailureAnalysisError.js";
import {
  ArtifactResourceScope,
  artifactFilePrimaryFacts,
  assertArtifactReadActive,
  closeArtifactResources,
  projectStableArtifactFailure,
  readAdmittedRange,
  withStableArtifactHandle,
  type StableArtifactFileSystem,
} from "../../resources/index.js";
import type { ExecutionOptions } from "../../ports/AnalysisProvider.js";
import type { FirmwareMmioSynthesisPort } from "../../ports/binaryDiagnostics/FirmwareMmioSynthesisPort.js";
import {
  firmwareMmioBudgetLimit,
  type FirmwareMmioSynthesis,
  type InspectFirmwareMmioSynthesisInput,
} from "../../domain/firmware/firmwareMmioSynthesis.js";
import { parseSvdPeripheralMap } from "../../domain/firmware/firmwareSvdPeripherals.js";
import {
  maxArchAddress,
  minimumMmioInstructionAlignment,
  parseFirmwareMmioSynthesis,
} from "../../domain/firmware/firmwareMmioSynthesisParser.js";
import { FIRMWARE_MMIO_SYNTHESIS_PROVIDER } from "../../domain/investigationProviders.js";
import { err, ok } from "../../domain/result.js";
import { classifyProviderFailure } from "../../providers/classifyProviderFailure.js";
import { offlineArtifactFailureDialect } from "../../providers/offlineArtifactFailure.js";

const OPERATION = "inspect_firmware_mmio_synthesis";
const FORMAT = "firmware-mmio-synthesis";

const svdXmlInputError = (
  cause: ParseFailureError<"malformed"> | ParseFailureError<"unsupported">,
): AnalysisInputError =>
  new AnalysisInputError(
    OPERATION,
    {
      cause,
      conformsToInputContract: true,
      userMessage: `Invalid svd_xml for ${OPERATION}: ${cause.failure.detail}`,
      remediationAction:
        "Pass well-formed CMSIS-SVD XML whose root element is <device> without DOCTYPE declarations in svd_xml, or omit svd_xml to disassemble split-immediate accesses without profile names, then retry.",
      related: { parameters: ["svd_xml"] },
    },
    [
      {
        path: ["svd_xml"],
        reason: "invalid_format",
        message: cause.failure.detail,
      },
    ],
  );

const alignmentInputError = (
  input: InspectFirmwareMmioSynthesisInput,
  minAlign: number,
): AnalysisInputError => {
  const message = `scan_offset (${String(input.scan_offset)}) must be ${String(minAlign)}-byte aligned for ${input.architecture}.`;
  return new AnalysisInputError(
    OPERATION,
    {
      conformsToInputContract: true,
      userMessage: `Invalid scan_offset for ${OPERATION}: ${message}`,
      remediationAction: `Pass a ${String(minAlign)}-byte aligned scan_offset for ${input.architecture}, then retry.`,
      related: { parameters: ["scan_offset"] },
    },
    [
      {
        path: ["scan_offset"],
        reason: "invalid_format",
        message,
        observed: {
          scan_offset: input.scan_offset,
          architecture: input.architecture,
          required_alignment_bytes: minAlign,
        },
      },
    ],
  );
};

const addressRangeInputError = (
  input: InspectFirmwareMmioSynthesisInput,
  baseAddress: bigint,
  maxAddress: bigint,
  minAlign: number,
): AnalysisInputError => {
  const baseExceeds = baseAddress > maxAddress;
  const message = baseExceeds
    ? `base_address (${input.base_address}) exceeds the ${input.architecture} address space (0x0..0x${maxAddress.toString(16)}).`
    : `base_address (${input.base_address}) + scan_offset (${String(input.scan_offset)}) overflows the ${input.architecture} address space.`;
  const field = baseExceeds ? "base_address" : "scan_offset";
  return new AnalysisInputError(
    OPERATION,
    {
      conformsToInputContract: true,
      userMessage: `Invalid address selection for ${OPERATION}: ${message}`,
      remediationAction: `Reduce base_address or scan_offset so at least one ${String(minAlign)}-byte instruction fits within 0x0..0x${maxAddress.toString(16)}, then retry.`,
      related: { parameters: ["base_address", "scan_offset"] },
    },
    [
      {
        path: [field],
        reason: "out_of_range",
        message,
        observed: {
          base_address: input.base_address,
          scan_offset: input.scan_offset,
          architecture: input.architecture,
        },
      },
    ],
  );
};

const scanOffsetRangeError = (
  input: InspectFirmwareMmioSynthesisInput,
  fileBytes: number,
  minAlign: number,
): AnalysisInputError => {
  const maxOffset =
    fileBytes >= minAlign
      ? Math.floor((fileBytes - minAlign) / minAlign) * minAlign
      : null;
  const message =
    input.scan_offset >= fileBytes
      ? `Selected scan_offset (${String(input.scan_offset)}) starts at or beyond the end of the ${String(fileBytes)}-byte file.`
      : `Selected scan_offset (${String(input.scan_offset)}) leaves ${String(fileBytes - input.scan_offset)} byte(s) in the ${String(fileBytes)}-byte file; ${input.architecture} requires at least ${String(minAlign)} bytes.`;
  return new AnalysisInputError(
    OPERATION,
    {
      conformsToInputContract: true,
      userMessage: `Invalid scan_offset for ${OPERATION}: ${message}`,
      remediationAction:
        maxOffset !== null
          ? `Pass a ${String(minAlign)}-byte aligned scan_offset between 0 and ${String(maxOffset)} for this ${String(fileBytes)}-byte file, then retry.`
          : `The ${String(fileBytes)}-byte file at ${input.path} is smaller than one ${String(minAlign)}-byte ${input.architecture} instruction; select the complete firmware image or verify architecture.`,
      related: { parameters: ["scan_offset"] },
    },
    [
      {
        path: ["scan_offset"],
        reason: "out_of_range",
        message,
        ...(maxOffset === null ? {} : { maximum: maxOffset }),
        observed: {
          scan_offset: input.scan_offset,
          file_bytes: fileBytes,
          required_instruction_bytes: minAlign,
        },
      },
    ],
  );
};

/** Portable RISC-V, MIPS32, PowerPC, and ARM64 split-immediate MMIO disassembler over one regular file. */
export class FirmwareMmioSynthesisProvider implements FirmwareMmioSynthesisPort {
  readonly identity = FIRMWARE_MMIO_SYNTHESIS_PROVIDER;
  readonly #resources = new ArtifactResourceScope();
  readonly #fileSystem: StableArtifactFileSystem | undefined;

  constructor(options?: { readonly fileSystem?: StableArtifactFileSystem }) {
    this.#fileSystem = options?.fileSystem;
  }

  close(): Promise<void> {
    return closeArtifactResources(
      () => this.#resources.close(),
      FIRMWARE_MMIO_SYNTHESIS_PROVIDER,
      OPERATION,
    );
  }

  async inspect(
    input: InspectFirmwareMmioSynthesisInput,
    options?: ExecutionOptions,
  ) {
    let completed: FirmwareMmioSynthesis | undefined;
    let observed:
      | { readonly sha256: string; readonly bytes: number }
      | undefined;
    const minAlign = minimumMmioInstructionAlignment(input.architecture);
    const maxAddress = maxArchAddress(input.architecture);
    const baseAddress = BigInt(input.base_address);
    try {
      return await this.#resources.run(async () => {
        assertArtifactReadActive(options?.signal);
        if (input.scan_offset % minAlign !== 0) {
          throw alignmentInputError(input, minAlign);
        }
        const svdResult =
          input.svd_xml === undefined
            ? ok({ peripherals: [], skipped: [] })
            : parseSvdPeripheralMap(input.svd_xml, {
                maxXmlNodes: input.max_svd_xml_nodes,
                maxExpandedChars: input.max_svd_expanded_chars,
              });
        if (!svdResult.ok) {
          if (isParseLimit(svdResult.error, "cmsis-svd")) throw svdResult.error;
          throw svdXmlInputError(svdResult.error);
        }
        if (
          baseAddress > maxAddress ||
          baseAddress + BigInt(input.scan_offset) >
            maxAddress - BigInt(minAlign - 1)
        ) {
          throw addressRangeInputError(
            input,
            baseAddress,
            maxAddress,
            minAlign,
          );
        }

        const report = await withStableArtifactHandle<FirmwareMmioSynthesis>(
          input.path,
          input.max_file_bytes,
          {
            signal: options?.signal,
            ...(this.#fileSystem === undefined
              ? {}
              : { fileSystem: this.#fileSystem }),
            resourceScope: this.#resources,
            retainBytes: (size) =>
              input.scan_offset === 0
                ? Math.min(size, input.max_scan_bytes)
                : 0,
            onIdentity: (identity) => {
              observed = identity;
            },
            onVerifiedResult: (value) => {
              completed = value;
            },
          },
          async (handle) => {
            assertArtifactReadActive(options?.signal);
            if (handle.size - input.scan_offset < minAlign) {
              if (input.scan_offset > 0) {
                throw scanOffsetRangeError(input, handle.size, minAlign);
              }
            }
            let scanSlice: Buffer;
            if (input.scan_offset === 0) {
              scanSlice = handle.prefix;
            } else {
              const sliceLength = Math.min(
                handle.size - input.scan_offset,
                input.max_scan_bytes,
              );
              scanSlice = await readAdmittedRange(
                FORMAT,
                handle,
                input.scan_offset,
                sliceLength,
              );
            }
            assertArtifactReadActive(options?.signal);
            const parsed = parseFirmwareMmioSynthesis({
              artifact: {
                path: input.path,
                sha256: handle.sha256,
                bytes: handle.size,
              },
              architecture: input.architecture,
              baseAddressHex: input.base_address,
              scanOffset: input.scan_offset,
              maxScanBytes: input.max_scan_bytes,
              maxSyntheses: input.max_syntheses,
              maxWindowInstructions: input.max_window_instructions,
              mmioOnly: input.mmio_only,
              scanBytes: scanSlice,
              svdSupplied: input.svd_xml !== undefined,
              svdPeripherals: svdResult.value.peripherals,
              svdSkipped: svdResult.value.skipped,
            });
            if (!parsed.ok) throw parsed.error;
            return parsed.value;
          },
        );
        return ok(report);
      });
    } catch (cause) {
      return err(mmioSynthesisFailure(cause, input, observed, completed));
    }
  }
}

const mmioSynthesisFailure = (
  cause: unknown,
  input: InspectFirmwareMmioSynthesisInput,
  observed?: { readonly sha256: string; readonly bytes: number },
  completed?: FirmwareMmioSynthesis,
) => {
  const facts = artifactFilePrimaryFacts(cause);
  const primary = classifyProviderFailure(
    facts.cause,
    offlineArtifactFailureDialect(facts, {
      providerId: FIRMWARE_MMIO_SYNTHESIS_PROVIDER.id,
      operation: OPERATION,
      path: input.path,
      description: "firmware split-immediate MMIO stream",
      fallbackMessage: "Firmware split-immediate MMIO inspection failed.",
      recognise: (failure) => {
        if (isParseLimit(failure, "cmsis-svd")) {
          const { name, maximum } = failure.failure.limit;
          if (name === "max_svd_expanded_chars") {
            return parseLimitConstraint(OPERATION, "memory", failure, {
              retryable: false,
              limit: firmwareMmioBudgetLimit("max_svd_expanded_chars", maximum),
            });
          }
          return parseLimitConstraint(OPERATION, "capacity", failure, {
            retryable: false,
            limit: firmwareMmioBudgetLimit("max_svd_xml_nodes", maximum),
          });
        }
        return undefined;
      },
      fileSize: (failure) => {
        const requiredBytes =
          failure.observedBytes === undefined
            ? undefined
            : failure.observedBytes <= BigInt(Number.MAX_SAFE_INTEGER)
              ? Number(failure.observedBytes)
              : failure.observedBytes;
        return parseLimitConstraint(
          OPERATION,
          "file-size",
          decodeLimit(
            FORMAT,
            failure.message,
            {
              name: "max_file_bytes",
              maximum: input.max_file_bytes,
              ...(requiredBytes === undefined
                ? {}
                : { required: requiredBytes }),
            },
            { cause: failure },
          ),
          {
            retryable: false,
            limit: {
              ...firmwareMmioBudgetLimit(
                "max_file_bytes",
                input.max_file_bytes,
              ),
              ...(typeof requiredBytes === "number"
                ? { required_value: requiredBytes }
                : {}),
            },
          },
        );
      },
    }),
  );
  if (completed !== undefined) primary.retainPartialObservation(completed);
  return projectStableArtifactFailure(
    cause,
    primary,
    input.path,
    FIRMWARE_MMIO_SYNTHESIS_PROVIDER.id,
    OPERATION,
    observed,
  );
};
