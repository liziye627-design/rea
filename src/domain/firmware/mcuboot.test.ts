import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  MCUBOOT_LEGACY_V1_MAGIC,
  MCUBOOT_MAGIC,
  MCUBOOT_PROTECTED_TLV_MAGIC,
  MCUBOOT_TLV_MAGIC,
  parseMcubootHeader,
  parseMcubootTlvArea,
  parseMcubootTlvInfo,
  recognizeMcubootPrefix,
} from "./mcuboot.js";
import { buildMcubootImage } from "./mcuboot.fixture.js";

describe("mcuboot domain parser", () => {
  it("recognizes 0x96f3b83d and legacy 0x96f3b83c prefixes", () => {
    expect(recognizeMcubootPrefix(buildMcubootImage())).toBe("mcuboot");
    expect(
      recognizeMcubootPrefix(
        buildMcubootImage({ magic: MCUBOOT_LEGACY_V1_MAGIC }),
      ),
    ).toBe("mcuboot-v1");
    expect(
      recognizeMcubootPrefix(Buffer.from([0x3d, 0xb8, 0xf3])),
    ).toBeUndefined();
    expect(recognizeMcubootPrefix(Buffer.from("ANDROID!"))).toBeUndefined();
  });

  it("parses the 32-byte little-endian image_header and classifies known and unknown flags", () => {
    const image = buildMcubootImage({
      loadAddress: 0x0802_0000,
      headerSize: 512,
      declaredImageSize: 4096,
      flags: (0x0000_0020 | 0x0000_0400 | 0x8000_0000) >>> 0,
      version: { major: 2, minor: 5, revision: 14, buildNum: 9001 },
      pad1: 0xdead_beef,
      protectedTlvs: [{ type: 0x50, value: Buffer.from([1, 0, 0, 0]) }],
      omitUnprotectedTlv: true,
    });
    const parsed = parseMcubootHeader(image);
    expect(parsed).toEqual({
      ok: true,
      value: {
        magic: MCUBOOT_MAGIC,
        loadAddress: 0x0802_0000,
        headerSize: 512,
        protectedTlvSize: 12,
        imageSize: 4096,
        flags: 0x8000_0420,
        flagNames: ["ram-load", "compressed-lzma2"],
        unknownFlags: 0x8000_0000,
        encryptedFlag: false,
        compressedFlag: true,
        version: {
          major: 2,
          minor: 5,
          revision: 14,
          buildNum: 9001,
          text: "2.5.14+9001",
        },
        pad1: 0xdead_beef,
      },
    });
  });

  it("refuses truncated or malformed image_header fields", () => {
    expect(parseMcubootHeader(Buffer.alloc(20))).toEqual({
      ok: false,
      error: {
        kind: "truncated",
        message: "MCUboot header is truncated: 20 bytes, expected at least 32",
        availableBytes: 20,
        requiredBytes: 32,
      },
    });

    const wrongMagic = buildMcubootImage({ magic: MCUBOOT_LEGACY_V1_MAGIC });
    expect(parseMcubootHeader(wrongMagic)).toMatchObject({
      ok: false,
      error: { kind: "malformed" },
    });

    const tinyHeader = buildMcubootImage();
    tinyHeader.writeUInt16LE(16, 8);
    expect(parseMcubootHeader(tinyHeader)).toEqual({
      ok: false,
      error: {
        kind: "malformed",
        message:
          "byte offset 8: ih_hdr_size 16 is smaller than the 32-byte MCUboot image_header",
      },
    });

    const tinyProtected = buildMcubootImage();
    tinyProtected.writeUInt16LE(2, 10);
    expect(parseMcubootHeader(tinyProtected)).toEqual({
      ok: false,
      error: {
        kind: "malformed",
        message:
          "byte offset 10: nonzero ih_protect_tlv_size 2 is smaller than the 4-byte image_tlv_info header",
      },
    });
  });

  it("parses protected and unprotected TLV areas without copying wrapped encryption keys", () => {
    const dep = Buffer.alloc(12);
    dep[0] = 1; // image_id
    dep[4] = 3; // major
    dep[5] = 1; // minor
    dep.writeUInt16LE(7, 6); // revision
    dep.writeUInt32LE(99, 8); // build_num

    const secCnt = Buffer.alloc(4);
    secCnt.writeUInt32LE(42, 0);

    const keyhash = createHash("sha256").update("signer-pub-key").digest();
    const signature = Buffer.alloc(64, 0xaa);
    const secondSignature = Buffer.alloc(64, 0xbb);
    const wrappedAesKey = Buffer.from(
      "00112233445566778899aabbccddeeff",
      "hex",
    );
    const sha384 = Buffer.alloc(48, 0x38);
    const sha512 = Buffer.alloc(64, 0x51);

    const image = buildMcubootImage({
      protectedTlvs: [
        { type: 0x40, value: dep },
        { type: 0x50, value: secCnt },
        { type: 0x99, value: Buffer.from([0xca, 0xfe]) },
      ],
      unprotectedTlvs: [
        { type: 0x13, value: sha384 },
        { type: 0x14, value: sha512 },
        { type: 0x01, value: keyhash },
        { type: 0x24, value: signature },
        { type: 0x22, value: secondSignature },
        { type: 0x31, value: wrappedAesKey },
      ],
    });

    const header = parseMcubootHeader(image);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const protectedOffset = header.value.headerSize + header.value.imageSize;
    const protectedParsed = parseMcubootTlvArea(
      image.subarray(
        protectedOffset,
        protectedOffset + header.value.protectedTlvSize,
      ),
      "protected",
      protectedOffset,
    );
    expect(protectedParsed).toEqual({
      ok: true,
      value: {
        area: "protected",
        magic: MCUBOOT_PROTECTED_TLV_MAGIC,
        totalBytes: header.value.protectedTlvSize,
        records: [
          {
            area: "protected",
            index: 0,
            type: 0x40,
            type_name: "dependency",
            offset: protectedOffset + 4,
            length: 12,
          },
          {
            area: "protected",
            index: 1,
            type: 0x50,
            type_name: "sec-cnt",
            offset: protectedOffset + 20,
            length: 4,
          },
          {
            area: "protected",
            index: 2,
            type: 0x99,
            type_name: null,
            offset: protectedOffset + 28,
            length: 2,
          },
        ],
        digests: [],
        signatures: [],
        dependencies: [
          {
            image_id: 1,
            major: 3,
            minor: 1,
            revision: 7,
            build_num: 99,
            version_text: "3.1.7+99",
          },
        ],
        securityCounter: 42,
        encryptionTlvs: [],
      },
    });

    const unprotectedOffset = protectedOffset + header.value.protectedTlvSize;
    const unprotectedParsed = parseMcubootTlvArea(
      image.subarray(unprotectedOffset),
      "unprotected",
      unprotectedOffset,
    );
    expect(unprotectedParsed.ok).toBe(true);
    if (!unprotectedParsed.ok) return;

    expect(unprotectedParsed.value.magic).toBe(MCUBOOT_TLV_MAGIC);
    expect(unprotectedParsed.value.digests.map((d) => d.algorithm)).toEqual([
      "sha256",
      "sha384",
      "sha512",
    ]);
    expect(unprotectedParsed.value.signatures).toEqual([
      {
        area: "unprotected",
        type: 0x24,
        algorithm: "ed25519",
        length: 64,
        keyhash_sha256: keyhash.toString("hex"),
      },
      {
        area: "unprotected",
        type: 0x22,
        algorithm: "ecdsa-sig",
        length: 64,
        keyhash_sha256: null,
      },
    ]);
    expect(unprotectedParsed.value.encryptionTlvs).toEqual(["enc-kw"]);
    expect(JSON.stringify(unprotectedParsed.value)).not.toContain(
      wrappedAesKey.toString("hex"),
    );
  });

  it("refuses malformed or truncated TLV info headers and records", () => {
    expect(
      parseMcubootTlvInfo(Buffer.from([0x07, 0x69]), MCUBOOT_TLV_MAGIC, 64),
    ).toEqual({
      ok: false,
      error: {
        kind: "truncated",
        message:
          "byte offset 64: MCUboot TLV info header is truncated (2 of 4 bytes)",
        availableBytes: 66,
        requiredBytes: 68,
      },
    });

    expect(
      parseMcubootTlvInfo(
        Buffer.from([0x07, 0x69, 0x02, 0x00]),
        MCUBOOT_TLV_MAGIC,
        64,
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "malformed",
        message:
          "byte offset 66: it_tlv_tot 2 is smaller than the 4-byte TLV info header",
      },
    });

    // Declared totalBytes = 12, only 6 bytes supplied.
    expect(
      parseMcubootTlvArea(
        Buffer.from([0x07, 0x69, 12, 0, 0x10, 0x00]),
        "unprotected",
        100,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "truncated",
        availableBytes: 106,
        requiredBytes: 112,
      },
    });

    // Trailing 2-byte partial record header inside totalBytes = 6.
    expect(
      parseMcubootTlvArea(
        Buffer.from([0x07, 0x69, 6, 0, 0x10, 0x00]),
        "unprotected",
        100,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "malformed" },
    });

    // Record declares length = 20 inside totalBytes = 8.
    expect(
      parseMcubootTlvArea(
        Buffer.from([0x07, 0x69, 8, 0, 0x99, 0x00, 20, 0]),
        "unprotected",
        100,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "malformed" },
    });

    // Wrong fixed-size TLV lengths (sha256 = 16 B, keyhash = 8 B, dependency = 4 B, sec-cnt = 2 B).
    for (const [type, badLen] of [
      [0x10, 16],
      [0x01, 8],
      [0x40, 4],
      [0x50, 2],
    ] as const) {
      const image = buildMcubootImage({
        includeSha256: false,
        unprotectedTlvs: [{ type, value: Buffer.alloc(badLen) }],
      });
      const offset = 32 + 8;
      expect(
        parseMcubootTlvArea(image.subarray(offset), "unprotected", offset),
      ).toMatchObject({
        ok: false,
        error: { kind: "malformed" },
      });
    }
  });
});
