import { sha256Hex } from "../../kernel/sha256Hex.js";
import type { ExecutionOptions } from "../../ports/AnalysisProvider.js";
import type { FirmwareMmioSynthesisPort } from "../../ports/binaryDiagnostics/FirmwareMmioSynthesisPort.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { createEvidence, type Evidence } from "../../domain/evidence.js";
import {
  firmwareMmioSynthesisSchema,
  inspectFirmwareMmioSynthesisInputSchema,
  mmioSynthesisCountsMatch,
  type FirmwareMmioSynthesis,
  type InspectFirmwareMmioSynthesisInput,
} from "../../domain/firmware/firmwareMmioSynthesis.js";
import type { Result } from "../../domain/result.js";
import { callerAnalysisParameters } from "../AnalysisInput.js";
import { executeArtifactInspection } from "../ArtifactInspectionExecution.js";

const OPERATION = "inspect_firmware_mmio_synthesis";

const validMmioReport = (
  report: FirmwareMmioSynthesis,
  input: InspectFirmwareMmioSynthesisInput,
): boolean => {
  if (report.artifact.path !== input.path) return false;
  if (report.artifact.bytes > input.max_file_bytes) return false;
  if (report.architecture !== input.architecture) return false;
  if (report.scan_offset !== input.scan_offset) return false;
  if (report.mmio_only !== input.mmio_only) return false;
  if (report.syntheses.length > input.max_syntheses) return false;
  if (
    report.scan_file_range.end - report.scan_file_range.start >
    input.max_scan_bytes
  )
    return false;
  if (report.scan_file_range.end > report.artifact.bytes) return false;
  return mmioSynthesisCountsMatch(report);
};

/** Shared caller validation, output parsing, and Evidence provenance for CLI/MCP. */
export class FirmwareMmioSynthesisService {
  constructor(readonly provider: FirmwareMmioSynthesisPort) {}

  close(): Promise<void> {
    return this.provider.close?.() ?? Promise.resolve();
  }

  inspect(
    rawInput: unknown,
    options?: ExecutionOptions,
  ): Promise<Result<Evidence, AnalysisError>> {
    return executeArtifactInspection(
      {
        operation: OPERATION,
        inputSchema: inspectFirmwareMmioSynthesisInputSchema,
        outputSchema: firmwareMmioSynthesisSchema,
        provider: this.provider,
        retainCompletedReport: true,
        invalidOutputMessage:
          "Firmware MMIO synthesis provider returned malformed output or mismatched artifact identity.",
        toParameters: (input) => input,
        validateReport: validMmioReport,
        buildEvidence: (value, identity, parameters) => {
          const selected = callerAnalysisParameters(rawInput)(parameters);
          const { svd_xml, ...restParams } = selected;
          const evidenceParams =
            svd_xml === undefined
              ? restParams
              : {
                  ...restParams,
                  svd_xml_sha256: sha256Hex(svd_xml),
                };
          const limitations =
            svd_xml === undefined
              ? value.limitations
              : [
                  ...value.limitations,
                  "Inline svd_xml UTF-8 text is not retained in Evidence and is unavailable from this record; parameters.svd_xml_sha256 records the SHA-256 digest of the caller-supplied svd_xml.",
                ];
          return createEvidence(
            {
              path: value.artifact.path,
              format: "file",
              sha256: value.artifact.sha256,
            },
            identity,
            {
              operation: OPERATION,
              parameters: evidenceParams,
              result: value,
              confidence: "derived",
              limitations,
              locations: [
                { kind: "artifact-path", path: value.artifact.path },
                {
                  kind: "file-offset-range",
                  start: value.scan_file_range.start,
                  end: value.scan_file_range.end,
                },
              ],
            },
          );
        },
      },
      rawInput,
      options,
    );
  }
}
