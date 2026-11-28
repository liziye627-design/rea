import { describe, expect, it } from "vitest";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { FirmwareMmioSynthesisService } from "./FirmwareMmioSynthesisService.js";
import { FIRMWARE_MMIO_SYNTHESIS_PROVIDER } from "../../domain/investigationProviders.js";
import { decodeLimit } from "../../domain/parseFailure.js";
import { parseLimitConstraint } from "../../domain/parseFailureAnalysisError.js";
import {
  firmwareMmioBudgetLimit,
  type FirmwareMmioSynthesis,
} from "../../domain/firmware/firmwareMmioSynthesis.js";
import { err, ok } from "../../domain/result.js";
import type { FirmwareMmioSynthesisPort } from "../../ports/binaryDiagnostics/FirmwareMmioSynthesisPort.js";

const sampleReport = (
  path: string,
  scanOffset: number,
): FirmwareMmioSynthesis => ({
  artifact: {
    path,
    sha256: "f".repeat(64),
    bytes: 256,
  },
  architecture: "riscv32",
  base_address: "0x8000000",
  scan_offset: scanOffset,
  scan_start_address: `0x${(0x08000000 + scanOffset).toString(16)}`,
  mmio_only: true,
  decoded_instructions: 4,
  scan_file_range: { start: scanOffset, end: scanOffset + 16 },
  coverage: {
    status: "partial",
    examined_bytes: 16,
    available_from_offset_bytes: 256 - scanOffset,
  },
  syntheses: [],
  load_synthesis_count: 0,
  store_synthesis_count: 0,
  materialization_synthesis_count: 0,
  peripheral_groups: [],
  svd_peripherals: {
    supplied: true,
    peripheral_count: 0,
    matched_synthesis_count: 0,
    exact_register_match_count: 0,
  },
  anomalies: [],
  limitations: ["Scanned 16 bytes up to max_scan_bytes."],
});

describe("FirmwareMmioSynthesisService", () => {
  it("refuses a provider report whose stored synthesis counts disagree with syntheses", async () => {
    const mockPort: FirmwareMmioSynthesisPort = {
      identity: FIRMWARE_MMIO_SYNTHESIS_PROVIDER,
      inspect: async (input) =>
        ok({
          ...sampleReport(input.path, input.scan_offset),
          load_synthesis_count: 1,
        }),
    };
    const res = await new FirmwareMmioSynthesisService(mockPort).inspect({
      path: "/tmp/riscv.bin",
      architecture: "riscv32",
      base_address: "0x08000000",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("malformed output");
  });

  it("records sha256-bound Evidence, file-offset-range location, and hashed svd_xml provenance", async () => {
    const mockPort: FirmwareMmioSynthesisPort = {
      identity: FIRMWARE_MMIO_SYNTHESIS_PROVIDER,
      inspect: async (input) => ok(sampleReport(input.path, input.scan_offset)),
    };
    const service = new FirmwareMmioSynthesisService(mockPort);
    const res = await service.inspect({
      path: "/tmp/riscv.bin",
      architecture: "riscv32",
      base_address: "0x08000000",
      svd_xml: "<device><peripherals/></device>",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.operation).toBe("inspect_firmware_mmio_synthesis");
    expect(res.value.parameters).toEqual({
      path: "/tmp/riscv.bin",
      architecture: "riscv32",
      base_address: "0x08000000",
      svd_xml_sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(res.value.locations).toEqual([
      { kind: "artifact-path", path: "/tmp/riscv.bin" },
      { kind: "file-offset-range", start: 0, end: 16 },
    ]);
  });

  it("retains completed Evidence and caller selections on late cancellation", async () => {
    const controller = new AbortController();
    const reason = { source: "mmio synthesis completion" };
    const report = sampleReport("/tmp/riscv.bin", 0);
    const service = new FirmwareMmioSynthesisService({
      identity: FIRMWARE_MMIO_SYNTHESIS_PROVIDER,
      inspect: async () => {
        controller.abort(reason);
        return ok(report);
      },
    });
    const result = await service.inspect(
      {
        path: "/tmp/riscv.bin",
        architecture: "riscv32",
        base_address: "0x08000000",
      },
      { signal: controller.signal },
    );
    if (result.ok) throw new Error("Expected late cancellation");
    expect(result.error).toBeInstanceOf(AnalysisCancelledError);
    expect(result.error.cause).toBe(reason);
    expect(result.error.partialObservation).toMatchObject({
      operation: "inspect_firmware_mmio_synthesis",
      normalized_result: report,
    });
  });

  it("propagates parameter limit refusals with control_kind: parameter", async () => {
    const mockPort: FirmwareMmioSynthesisPort = {
      identity: FIRMWARE_MMIO_SYNTHESIS_PROVIDER,
      inspect: async (input) =>
        err(
          parseLimitConstraint(
            "inspect_firmware_mmio_synthesis",
            "file-size",
            decodeLimit(
              "firmware-mmio-synthesis",
              "File exceeds max_file_bytes",
              {
                name: "max_file_bytes",
                maximum: input.max_file_bytes,
              },
            ),
            {
              retryable: false,
              limit: firmwareMmioBudgetLimit(
                "max_file_bytes",
                input.max_file_bytes,
              ),
            },
          ),
        ),
    };
    const res = await new FirmwareMmioSynthesisService(mockPort).inspect({
      path: "/tmp/huge.bin",
      architecture: "riscv32",
      base_address: "0x08000000",
      max_file_bytes: 16,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.limit).toMatchObject({
      control_kind: "parameter",
      parameter: "max_file_bytes",
      effective_value: 16,
    });
  });
});
