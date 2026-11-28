import { createHash } from "node:crypto";
import { lstat, open, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnalysisArtifactChangedError,
  AnalysisCancelledError,
  AnalysisInputError,
  AnalysisResourceConstraintError,
  AnalysisTargetFailureError,
} from "../../domain/analysisErrorCore.js";
import { projectAnalysisError } from "../../domain/analysisErrorProjection.js";
import { inspectFirmwareMmioSynthesisInputSchema } from "../../domain/firmware/firmwareMmioSynthesis.js";
import { createTestTempDirectory } from "../../../tests/fixtures/temporaryDirectory.js";
import { FirmwareMmioSynthesisProvider } from "./FirmwareMmioSynthesisProvider.js";
import {
  analysisRefusalRemediation,
  type AdjustableBudget,
} from "../../domain/analysisRefusal.js";

const formattedRecovery = (projected: { readonly details?: unknown }): string =>
  analysisRefusalRemediation({
    kind: "adjustable_budget",
    operation: "inspect_firmware_mmio_synthesis",
    budget: (projected.details as { readonly limit: AdjustableBudget }).limit,
  });

describe("FirmwareMmioSynthesisProvider", () => {
  it("streams whole-file SHA-256 and reads only the bounded scan slice at non-zero offsets", async () => {
    const dir = await createTestTempDirectory("rea-fw-mmio-slice-");
    const fwPath = join(dir, "large.bin");
    const image = Buffer.alloc(128 * 1024, 0);
    const offset = 0x10040;
    // RISC-V: LUI a5 (x15), 0x40013 (0x400137b7); LW a4 (x14), 4(a5) (0x0047a703)
    image.writeUInt32LE(0x400137b7, offset);
    image.writeUInt32LE(0x0047a703, offset + 4);
    await writeFile(fwPath, image);
    const expectedSha256 = createHash("sha256").update(image).digest("hex");

    const positionalLengths: number[] = [];
    const provider = new FirmwareMmioSynthesisProvider({
      fileSystem: {
        lstat: (path) => lstat(path, { bigint: true }),
        realpath,
        open: async (path, flags, mode) => {
          const handle = await open(path, flags, mode);
          const originalRead = handle.read.bind(handle);
          handle.read = (async (
            buffer: Buffer,
            bufOffset?: number | null,
            length?: number | null,
            position?: number | bigint | null,
          ) => {
            if (typeof position === "number" && position === offset) {
              positionalLengths.push(length ?? 0);
            }
            return originalRead(
              buffer,
              bufOffset ?? 0,
              length ?? buffer.length,
              position ?? null,
            );
          }) as typeof handle.read;
          return handle;
        },
      },
    });

    const input = inspectFirmwareMmioSynthesisInputSchema.parse({
      path: fwPath,
      architecture: "riscv32",
      base_address: "0x08000000",
      scan_offset: offset,
      max_scan_bytes: 32,
    });
    const res = await provider.inspect(input);
    await provider.close();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.artifact).toEqual({
      path: fwPath,
      sha256: expectedSha256,
      bytes: image.length,
    });
    expect(res.value.syntheses[0]?.synthesized_address).toBe("0x40013004");
    expect(positionalLengths).toEqual([32]);
  });

  it("returns typed resource, integrity, and cancellation failures", async () => {
    const dir = await createTestTempDirectory("rea-fw-mmio-failures-");
    const fwPath = join(dir, "fw.bin");
    const image = Buffer.alloc(128, 0);
    image.writeUInt32LE(0x400137b7, 0);
    image.writeUInt32LE(0x0047a703, 4);
    await writeFile(fwPath, image);

    const provider = new FirmwareMmioSynthesisProvider();

    const tooSmall = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        max_file_bytes: 32,
      }),
    );
    if (
      tooSmall.ok ||
      !(tooSmall.error instanceof AnalysisResourceConstraintError)
    )
      throw new Error("Expected file-size refusal");
    const projectedTooSmall = projectAnalysisError(tooSmall.error);
    expect(projectedTooSmall.remediation.action).toBe(
      formattedRecovery(projectedTooSmall),
    );

    const tooManyNodes = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        svd_xml:
          "<device><peripherals><peripheral><name>TIM2</name><baseAddress>0x40000000</baseAddress></peripheral></peripherals></device>",
        max_svd_xml_nodes: 3,
      }),
    );
    if (
      tooManyNodes.ok ||
      !(tooManyNodes.error instanceof AnalysisResourceConstraintError)
    )
      throw new Error("Expected max_svd_xml_nodes refusal");
    expect(projectAnalysisError(tooManyNodes.error).remediation.action).toBe(
      formattedRecovery(projectAnalysisError(tooManyNodes.error)),
    );

    const longName = "P".repeat(128);
    const expandedRefusal = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        svd_xml: `<device><peripherals><peripheral><name>${longName}</name><baseAddress>0x40000000</baseAddress></peripheral></peripherals></device>`,
        max_svd_expanded_chars: 64,
      }),
    );
    if (
      expandedRefusal.ok ||
      !(expandedRefusal.error instanceof AnalysisResourceConstraintError)
    )
      throw new Error("Expected max_svd_expanded_chars refusal");
    expect(projectAnalysisError(expandedRefusal.error).remediation.action).toBe(
      formattedRecovery(projectAnalysisError(expandedRefusal.error)),
    );

    const abortReason = { reason: "caller-aborted-mmio-read" };
    const cancelled = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
      }),
      { signal: AbortSignal.abort(abortReason) },
    );
    if (cancelled.ok) throw new Error("Expected cancellation");
    expect(cancelled.error).toBeInstanceOf(AnalysisCancelledError);
    expect(cancelled.error.cause).toBe(abortReason);

    const shortReadProvider = new FirmwareMmioSynthesisProvider({
      fileSystem: {
        lstat: (path) => lstat(path, { bigint: true }),
        realpath,
        open: async (path, flags, mode) => {
          const handle = await open(path, flags, mode);
          const originalRead = handle.read.bind(handle);
          let streamed = false;
          handle.read = (async (
            buffer: Buffer,
            bufOffset?: number | null,
            length?: number | null,
            position?: number | bigint | null,
          ) => {
            const res = await originalRead(
              buffer,
              bufOffset ?? 0,
              length ?? buffer.length,
              position ?? null,
            );
            if (res.bytesRead === 0) streamed = true;
            else if (streamed && typeof position === "number" && position > 0) {
              return { bytesRead: 0, buffer };
            }
            return res;
          }) as typeof handle.read;
          return handle;
        },
      },
    });
    const integrityRes = await shortReadProvider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        scan_offset: 32,
        max_scan_bytes: 32,
      }),
    );
    await shortReadProvider.close();
    await provider.close();
    if (integrityRes.ok) throw new Error("Expected read-coverage failure");
    expect(integrityRes.error).toBeInstanceOf(AnalysisArtifactChangedError);
  });

  it("attributes misaligned scan_offset, bad svd_xml, and address overflow to caller inputs while treating 1-byte files at offset 0 as target failures", async () => {
    const dir = await createTestTempDirectory("rea-fw-mmio-inputs-");
    const fwPath = join(dir, "fw.bin");
    const tinyPath = join(dir, "tiny.bin");
    await writeFile(fwPath, Buffer.alloc(64, 0));
    await writeFile(tinyPath, Buffer.alloc(1, 0));

    const provider = new FirmwareMmioSynthesisProvider();

    // Misaligned 2-byte offset on 4-byte MIPS32
    const alignRes = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "mips32be",
        base_address: "0xbfc00000",
        scan_offset: 2,
      }),
    );
    if (alignRes.ok || !(alignRes.error instanceof AnalysisInputError))
      throw new Error("Expected scan_offset alignment error");
    expect(projectAnalysisError(alignRes.error).code).toBe("invalid_request");

    // 64-bit base_address on 32-bit riscv32
    const overflowRes = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x100000000",
      }),
    );
    if (overflowRes.ok || !(overflowRes.error instanceof AnalysisInputError))
      throw new Error("Expected base_address overflow error");
    expect(projectAnalysisError(overflowRes.error).details).toMatchObject({
      issues: [{ path: ["base_address"], reason: "out_of_range" }],
    });

    // Too-short 1-byte file at offset 0
    const tinyRes = await provider.inspect(
      inspectFirmwareMmioSynthesisInputSchema.parse({
        path: tinyPath,
        architecture: "riscv32",
        base_address: "0x08000000",
      }),
    );
    await provider.close();
    if (tinyRes.ok) throw new Error("Expected short target failure");
    expect(tinyRes.error).toBeInstanceOf(AnalysisTargetFailureError);
  });
});
