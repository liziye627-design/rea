import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";

import { expect, it } from "vitest";

import { McubootArtifactReader } from "./McubootArtifactReader.js";
import { extractArtifact } from "./extraction/ArtifactExtraction.js";
import { ArtifactResourceScope } from "../resources/ArtifactResourceScope.js";
import { MCUBOOT_INLINE_TLV_LIMIT } from "../domain/firmware/mcuboot.js";
import { buildMcubootImage } from "../domain/firmware/mcuboot.fixture.js";
import {
  createTestTempDirectory,
  createTestTempFile,
} from "../../tests/fixtures/temporaryDirectory.js";
import { scanCanonicalArtifactInventory } from "../../tests/fixtures/artifactInventory.js";

const writeMcuboot = (name: string, bytes: Buffer): Promise<string> =>
  createTestTempFile("rea-mcuboot-", name, bytes);

const readAll = async (reader: McubootArtifactReader) => {
  const coverage: unknown[] = [];
  const entries = [];
  for await (const entry of reader.entries(undefined, {
    onCoverage: (value) => coverage.push(value),
  }))
    entries.push(entry);
  return { entries, coverage };
};

it("inventories and extracts a signed MCUboot image with protected and unprotected TLVs", async () => {
  const payload = Buffer.from([
    0x00, 0x80, 0x00, 0x20, 0x01, 0x02, 0x02, 0x08, 0x70, 0x47, 0x00, 0xbf,
  ]);
  const secCnt = Buffer.alloc(4);
  secCnt.writeUInt32LE(7, 0);
  const dep = Buffer.alloc(12);
  dep[0] = 1;
  dep[4] = 2;
  dep[5] = 0;
  dep.writeUInt16LE(1, 6);
  dep.writeUInt32LE(5, 8);

  const keyhash = createHash("sha256").update("mcuboot-ec256-pub").digest();
  const sig = Buffer.alloc(70, 0x30);
  const image = buildMcubootImage({
    loadAddress: 0x0802_0000,
    headerSize: 512,
    payload,
    protectedTlvs: [
      { type: 0x50, value: secCnt },
      { type: 0x40, value: dep },
    ],
    unprotectedTlvs: [
      { type: 0x01, value: keyhash },
      { type: 0x22, value: sig },
    ],
  });

  const path = await writeMcuboot("zephyr.signed.bin", image);
  const snapshot = await scanCanonicalArtifactInventory(path);
  expect(snapshot.manifest.root_format).toBe("mcuboot");
  expect(snapshot.coverage).toMatchObject({
    scope: "container-entries",
    status: "complete",
  });
  expect(
    snapshot.occurrences.find((row) => row.logical_path === "."),
  ).toMatchObject({
    format_metadata: {
      kind: "mcuboot",
      load_address: 0x0802_0000,
      header_size: 512,
      protected_tlv_size: 28,
      image_size: payload.length,
      encrypted: false,
      compressed: false,
      security_counter: 7,
      trailing_bytes: 0,
      trailing_erased_only: true,
      version: {
        major: 1,
        minor: 2,
        revision: 3,
        build_num: 42,
        text: "1.2.3+42",
      },
      digests: [
        {
          area: "unprotected",
          algorithm: "sha256",
          status: "valid",
        },
      ],
      signatures: [
        {
          area: "unprotected",
          algorithm: "ecdsa-sig",
          length: 70,
          keyhash_sha256: keyhash.toString("hex"),
          status: "unverified",
        },
      ],
      dependencies: [
        {
          image_id: 1,
          version_text: "2.0.1+5",
        },
      ],
      omitted_tlv_records: 0,
    },
  });

  const regions = Object.fromEntries(
    snapshot.occurrences
      .filter((row) => row.logical_path !== ".")
      .map((row) => [row.logical_path, row.source_location]),
  );
  expect(regions).toEqual({
    "payload.bin": { offset: 512, length: payload.length },
    "protected-tlv.bin": {
      offset: 512 + payload.length,
      length: 28,
    },
    "tlv.bin": {
      offset: 512 + payload.length + 28,
      length: image.length - (512 + payload.length + 28),
    },
  });

  const outDir = await createTestTempDirectory("rea-mcuboot-out-");
  const resourceScope = new ArtifactResourceScope();
  try {
    const extracted = await extractArtifact({
      inputPath: path,
      inputFormat: "mcuboot",
      outputRoot: join(outDir, "out"),
      environment: process.env,
      integrityPolicy: "fail",
      resourceScope,
    });
    const extractedPayload = await readFile(
      join(extracted.output_root, "payload.bin"),
    );
    expect(extractedPayload.equals(payload)).toBe(true);
  } finally {
    await resourceScope.close();
  }
});

it("enforces SHA-256 integrity under fail and records mismatch under record-and-continue", async () => {
  const corrupted = buildMcubootImage({ corruptSha256: true });
  const path = await writeMcuboot("corrupt.bin", corrupted);

  const strictReader = new McubootArtifactReader(path, undefined, "fail");
  try {
    await expect(readAll(strictReader)).rejects.toMatchObject({
      reason: "integrity",
      integrityCheck: "declared-digest",
    });
  } finally {
    await strictReader.close();
  }

  const lenientReader = new McubootArtifactReader(
    path,
    undefined,
    "record-and-continue",
  );
  try {
    const { entries, coverage } = await readAll(lenientReader);
    expect(entries.map((entry) => entry.path)).toEqual([
      "payload.bin",
      "tlv.bin",
    ]);
    expect(coverage).toEqual([
      {
        status: "unknown",
        limitations: [
          expect.stringContaining(
            "MCUboot unprotected sha256 TLV does not match header + payload + protected TLVs",
          ),
        ],
      },
    ]);
    expect(lenientReader.formatMetadata()?.digests).toEqual([
      expect.objectContaining({
        area: "unprotected",
        algorithm: "sha256",
        status: "invalid",
      }),
    ]);
  } finally {
    await lenientReader.close();
  }
});

it("marks encrypted MCUboot payloads unavailable without leaking wrapped key bytes", async () => {
  const wrappedKey = Buffer.from(
    "deadbeefcafebabe0123456789abcdef0011223344556677",
    "hex",
  );
  const encryptedImage = buildMcubootImage({
    flags: 0x04, // IH_F_ENCRYPTED_AES128
    unprotectedTlvs: [{ type: 0x31, value: wrappedKey }],
  });
  const path = await writeMcuboot("encrypted.bin", encryptedImage);

  const snapshot = await scanCanonicalArtifactInventory(path);
  expect(snapshot.coverage.status).toBe("unknown");
  expect(JSON.stringify(snapshot)).not.toContain(wrappedKey.toString("hex"));

  const payloadOccurrence = snapshot.occurrences.find(
    (row) => row.logical_path === "payload.bin",
  );
  expect(payloadOccurrence).toMatchObject({
    encrypted: true,
    hash_status: "unavailable",
    artifact_id: null,
  });

  const reader = new McubootArtifactReader(path);
  try {
    const { entries } = await readAll(reader);
    expect(reader.formatMetadata()).toMatchObject({
      encrypted: true,
      encryption_tlvs: ["enc-kw"],
      digests: [
        { algorithm: "sha256", status: "encrypted-unverified", computed: null },
      ],
    });
    await expect(reader.open(entries[0]!)).rejects.toMatchObject({
      reason: "unavailable",
      message: expect.stringMatching(/Encrypted MCUboot/u),
    });
    const tlvBytes = await buffer(await reader.open(entries[1]!));
    expect(tlvBytes.byteLength).toBeGreaterThan(4);
  } finally {
    await reader.close();
  }

  const outDir = await createTestTempDirectory("rea-mcuboot-enc-out-");
  const resourceScope = new ArtifactResourceScope();
  try {
    await expect(
      extractArtifact({
        inputPath: path,
        inputFormat: "mcuboot",
        outputRoot: join(outDir, "out"),
        environment: process.env,
        integrityPolicy: "fail",
        resourceScope,
      }),
    ).rejects.toThrow(/encrypted/iu);
  } finally {
    await resourceScope.close();
  }
});

it("distinguishes 0xff flash padding from non-erased swap-trailer bytes and bounds inline TLV records", async () => {
  const padded = buildMcubootImage({
    trailingBytes: Buffer.alloc(64, 0xff),
  });
  const paddedReader = new McubootArtifactReader(
    await writeMcuboot("padded.bin", padded),
  );
  try {
    const { coverage } = await readAll(paddedReader);
    expect(coverage).toEqual([
      {
        status: "complete",
        limitations: [
          expect.stringContaining(
            "64 byte(s) of 0xff flash padding/trailer follow the MCUboot image",
          ),
        ],
      },
    ]);
    expect(paddedReader.formatMetadata()).toMatchObject({
      trailing_bytes: 64,
      trailing_erased_only: true,
    });
  } finally {
    await paddedReader.close();
  }

  const manyTlvs = Array.from(
    { length: MCUBOOT_INLINE_TLV_LIMIT + 7 },
    (_, i) => ({
      type: 0x80 + (i % 16),
      value: Buffer.from([i & 0xff]),
    }),
  );
  const swapTrailer = Buffer.concat([
    Buffer.alloc(16, 0xff),
    Buffer.from([0x77, 0xc2, 0x95, 0xf3]),
  ]);
  const swapImage = buildMcubootImage({
    includeSha256: false,
    unprotectedTlvs: manyTlvs,
    trailingBytes: swapTrailer,
  });
  const swapReader = new McubootArtifactReader(
    await writeMcuboot("swap.bin", swapImage),
  );
  try {
    const { coverage } = await readAll(swapReader);
    expect(coverage).toMatchObject([{ status: "unknown" }]);
    expect(swapReader.formatMetadata()).toMatchObject({
      trailing_bytes: swapTrailer.length,
      trailing_erased_only: false,
      omitted_tlv_records: 7,
    });
    expect(swapReader.formatMetadata()?.tlv_records).toHaveLength(
      MCUBOOT_INLINE_TLV_LIMIT,
    );
  } finally {
    await swapReader.close();
  }
});

it("fails truncated payloads, truncated TLV areas, and inconsistent protected TLV sizes", async () => {
  const truncatedPayload = buildMcubootImage({
    declaredImageSize: 1024,
    omitUnprotectedTlv: true,
  });
  const r1 = new McubootArtifactReader(
    await writeMcuboot("short-payload.bin", truncatedPayload),
  );
  try {
    await expect(readAll(r1)).rejects.toMatchObject({ reason: "truncated" });
  } finally {
    await r1.close();
  }

  const full = buildMcubootImage();
  const r2 = new McubootArtifactReader(
    await writeMcuboot("short-tlv.bin", full.subarray(0, full.length - 6)),
  );
  try {
    await expect(readAll(r2)).rejects.toMatchObject({ reason: "truncated" });
  } finally {
    await r2.close();
  }

  const badProtectedTot = buildMcubootImage({
    protectedTlvs: [{ type: 0x50, value: Buffer.alloc(4) }],
  });
  // Overwrite ih_protect_tlv_size to 16 while the 0x6908 header still says 12.
  badProtectedTot.writeUInt16LE(16, 10);
  const r3 = new McubootArtifactReader(
    await writeMcuboot("bad-prot.bin", badProtectedTot),
  );
  try {
    await expect(readAll(r3)).rejects.toMatchObject({ reason: "malformed" });
  } finally {
    await r3.close();
  }
});
