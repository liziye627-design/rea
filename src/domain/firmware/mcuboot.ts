import { BinaryReader } from "../binaryContainer.js";
import { err, ok, type Result } from "../result.js";

/**
 * MCUboot v1/v2 image header and TLV trailers (`boot/bootutil/include/bootutil/image.h`,
 * all fields little-endian). Only container headers, TLV records and declared image
 * digests are interpreted here; nothing is decrypted, decompressed, verified against
 * asymmetric keys, or executed.
 */
export const MCUBOOT_MAGIC = 0x96f3b83d;
export const MCUBOOT_LEGACY_V1_MAGIC = 0x96f3b83c;
export const MCUBOOT_HEADER_MIN_BYTES = 32;
export const MCUBOOT_TLV_INFO_BYTES = 4;
export const MCUBOOT_TLV_RECORD_HEADER_BYTES = 4;
export const MCUBOOT_PROTECTED_TLV_MAGIC = 0x6908;
export const MCUBOOT_TLV_MAGIC = 0x6907;
export const MCUBOOT_INLINE_TLV_LIMIT = 128;

export const MCUBOOT_V1_REFUSAL =
  "Legacy MCUboot v1 images (magic 0x96f3b83c) are not supported; only 0x96f3b83d MCUboot images are decoded.";

export const MCUBOOT_INVENTORY_SCOPE =
  "MCUboot inventory parses the little-endian 0x96f3b83d image header and optional 0x6908 protected and 0x6907 unprotected TLV areas, checks unencrypted SHA-256/SHA-384/SHA-512 image digests against header + payload + protected TLVs, and exposes payload.bin and present TLV blocks. Signatures are not cryptographically verified, wrapped encryption keys are not copied into metadata, encrypted or compressed payloads are not decrypted or decompressed, and nothing is executed.";

const FLAG_BITS: readonly [number, McubootFlagName][] = [
  [0x00000001, "pic"],
  [0x00000004, "encrypted-aes128"],
  [0x00000008, "encrypted-aes256"],
  [0x00000010, "non-bootable"],
  [0x00000020, "ram-load"],
  [0x00000100, "rom-fixed"],
  [0x00000200, "compressed-lzma1"],
  [0x00000400, "compressed-lzma2"],
  [0x00000800, "compressed-arm-thumb"],
];

export const MCUBOOT_FLAG_NAMES = [
  "pic",
  "encrypted-aes128",
  "encrypted-aes256",
  "non-bootable",
  "ram-load",
  "rom-fixed",
  "compressed-lzma1",
  "compressed-lzma2",
  "compressed-arm-thumb",
] as const;
export type McubootFlagName = (typeof MCUBOOT_FLAG_NAMES)[number];

const KNOWN_FLAGS_MASK = FLAG_BITS.reduce((mask, [bit]) => mask | bit, 0) >>> 0;
const ENCRYPTED_FLAGS_MASK = 0x00000004 | 0x00000008;
const COMPRESSED_FLAGS_MASK = 0x00000200 | 0x00000400 | 0x00000800;

const TLV_TYPE_NAMES: Readonly<Record<number, string>> = {
  0x01: "keyhash",
  0x02: "pubkey",
  0x10: "sha256",
  0x13: "sha384",
  0x14: "sha512",
  0x20: "rsa2048-pss",
  0x21: "ecdsa224",
  0x22: "ecdsa-sig",
  0x23: "rsa3072-pss",
  0x24: "ed25519",
  0x25: "sig-pure",
  0x30: "enc-rsa2048",
  0x31: "enc-kw",
  0x32: "enc-ec256",
  0x33: "enc-x25519",
  0x40: "dependency",
  0x50: "sec-cnt",
  0x60: "boot-record",
};

const DIGEST_SPECS: Readonly<
  Record<
    number,
    {
      readonly algorithm: "sha256" | "sha384" | "sha512";
      readonly bytes: number;
    }
  >
> = {
  0x10: { algorithm: "sha256", bytes: 32 },
  0x13: { algorithm: "sha384", bytes: 48 },
  0x14: { algorithm: "sha512", bytes: 64 },
};

const SIGNATURE_TYPES: Readonly<Record<number, string>> = {
  0x20: "rsa2048-pss",
  0x21: "ecdsa224",
  0x22: "ecdsa-sig",
  0x23: "rsa3072-pss",
  0x24: "ed25519",
  0x25: "sig-pure",
};

const ENCRYPTION_TLV_TYPES: Readonly<Record<number, string>> = {
  0x30: "enc-rsa2048",
  0x31: "enc-kw",
  0x32: "enc-ec256",
  0x33: "enc-x25519",
};

export interface McubootVersion {
  readonly major: number;
  readonly minor: number;
  readonly revision: number;
  readonly buildNum: number;
  readonly text: string;
}

export interface McubootHeaderFields {
  readonly magic: typeof MCUBOOT_MAGIC;
  readonly loadAddress: number;
  readonly headerSize: number;
  readonly protectedTlvSize: number;
  readonly imageSize: number;
  readonly flags: number;
  readonly flagNames: readonly McubootFlagName[];
  readonly unknownFlags: number;
  readonly encryptedFlag: boolean;
  readonly compressedFlag: boolean;
  readonly version: McubootVersion;
  readonly pad1: number;
}

export interface McubootTlvRecordSummary {
  readonly area: "protected" | "unprotected";
  readonly index: number;
  readonly type: number;
  readonly type_name: string | null;
  readonly offset: number;
  readonly length: number;
}

export interface McubootDeclaredDigest {
  readonly area: "protected" | "unprotected";
  readonly algorithm: "sha256" | "sha384" | "sha512";
  readonly declared: Buffer;
}

export interface McubootSignatureRecord {
  readonly area: "protected" | "unprotected";
  readonly type: number;
  readonly algorithm: string;
  readonly length: number;
  readonly keyhash_sha256: string | null;
}

export interface McubootDependencyRecord {
  readonly image_id: number;
  readonly major: number;
  readonly minor: number;
  readonly revision: number;
  readonly build_num: number;
  readonly version_text: string;
}

export interface ParsedMcubootTlvArea {
  readonly area: "protected" | "unprotected";
  readonly magic: number;
  readonly totalBytes: number;
  readonly records: readonly McubootTlvRecordSummary[];
  readonly digests: readonly McubootDeclaredDigest[];
  readonly signatures: readonly McubootSignatureRecord[];
  readonly dependencies: readonly McubootDependencyRecord[];
  readonly securityCounter: number | null;
  readonly encryptionTlvs: readonly string[];
}

export interface McubootParseError {
  readonly kind: "malformed" | "truncated";
  readonly message: string;
  readonly availableBytes?: number;
  readonly requiredBytes?: number;
}

const malformed = (message: string): McubootParseError => ({
  kind: "malformed",
  message,
});

const parseVersion = (reader: BinaryReader, offset: number): McubootVersion => {
  const major = reader.u8(offset);
  const minor = reader.u8(offset + 1);
  const revision = reader.u16(offset + 2);
  const buildNum = reader.u32(offset + 4);
  return {
    major,
    minor,
    revision,
    buildNum,
    text: `${String(major)}.${String(minor)}.${String(revision)}+${String(buildNum)}`,
  };
};

/** Recognize an MCUboot leading magic or legacy v1 magic from a file prefix. */
export const recognizeMcubootPrefix = (
  prefix: Uint8Array,
): "mcuboot" | "mcuboot-v1" | undefined => {
  if (prefix.length < 4) return undefined;
  const magic =
    ((prefix[0] ?? 0) |
      ((prefix[1] ?? 0) << 8) |
      ((prefix[2] ?? 0) << 16) |
      ((prefix[3] ?? 0) << 24)) >>>
    0;
  if (magic === MCUBOOT_MAGIC) return "mcuboot";
  if (magic === MCUBOOT_LEGACY_V1_MAGIC) return "mcuboot-v1";
  return undefined;
};

/** Parse the fixed 32-byte opening of `struct image_header`. */
export const parseMcubootHeader = (
  bytes: Uint8Array,
): Result<McubootHeaderFields, McubootParseError> => {
  if (bytes.length < MCUBOOT_HEADER_MIN_BYTES)
    return err({
      kind: "truncated",
      message: `MCUboot header is truncated: ${String(bytes.length)} bytes, expected at least ${String(MCUBOOT_HEADER_MIN_BYTES)}`,
      availableBytes: bytes.length,
      requiredBytes: MCUBOOT_HEADER_MIN_BYTES,
    });
  const reader = new BinaryReader(
    Buffer.from(bytes.buffer, bytes.byteOffset, MCUBOOT_HEADER_MIN_BYTES),
    true,
    "mcuboot",
  );
  const magic = reader.u32(0);
  if (magic !== MCUBOOT_MAGIC)
    return err(
      malformed(
        `MCUboot magic mismatch: expected 0x${MCUBOOT_MAGIC.toString(16)}, found 0x${magic.toString(16).padStart(8, "0")}`,
      ),
    );
  const loadAddress = reader.u32(4);
  const headerSize = reader.u16(8);
  if (headerSize < MCUBOOT_HEADER_MIN_BYTES)
    return err(
      malformed(
        `byte offset 8: ih_hdr_size ${String(headerSize)} is smaller than the 32-byte MCUboot image_header`,
      ),
    );
  const protectedTlvSize = reader.u16(10);
  if (protectedTlvSize !== 0 && protectedTlvSize < MCUBOOT_TLV_INFO_BYTES)
    return err(
      malformed(
        `byte offset 10: nonzero ih_protect_tlv_size ${String(protectedTlvSize)} is smaller than the 4-byte image_tlv_info header`,
      ),
    );
  const imageSize = reader.u32(12);
  const flags = reader.u32(16);
  const flagNames = FLAG_BITS.filter(([bit]) => (flags & bit) !== 0).map(
    ([, name]) => name,
  );
  const unknownFlags = (flags & ~KNOWN_FLAGS_MASK) >>> 0;
  return ok({
    magic,
    loadAddress,
    headerSize,
    protectedTlvSize,
    imageSize,
    flags,
    flagNames,
    unknownFlags,
    encryptedFlag: (flags & ENCRYPTED_FLAGS_MASK) !== 0,
    compressedFlag: (flags & COMPRESSED_FLAGS_MASK) !== 0,
    version: parseVersion(reader, 20),
    pad1: reader.u32(28),
  });
};

/** Parse a 4-byte `image_tlv_info` prefix to learn `it_tlv_tot` before reading the block. */
export const parseMcubootTlvInfo = (
  infoBytes: Uint8Array,
  expectedMagic: typeof MCUBOOT_PROTECTED_TLV_MAGIC | typeof MCUBOOT_TLV_MAGIC,
  baseOffset: number,
): Result<
  { readonly magic: number; readonly totalBytes: number },
  McubootParseError
> => {
  if (infoBytes.length < MCUBOOT_TLV_INFO_BYTES)
    return err({
      kind: "truncated",
      message: `byte offset ${String(baseOffset)}: MCUboot TLV info header is truncated (${String(infoBytes.length)} of 4 bytes)`,
      availableBytes: baseOffset + infoBytes.length,
      requiredBytes: baseOffset + MCUBOOT_TLV_INFO_BYTES,
    });
  const magic = (infoBytes[0] ?? 0) | ((infoBytes[1] ?? 0) << 8);
  const totalBytes = (infoBytes[2] ?? 0) | ((infoBytes[3] ?? 0) << 8);
  if (magic !== expectedMagic)
    return err(
      malformed(
        `byte offset ${String(baseOffset)}: expected TLV info magic 0x${expectedMagic.toString(16)}, found 0x${magic.toString(16).padStart(4, "0")}`,
      ),
    );
  if (totalBytes < MCUBOOT_TLV_INFO_BYTES)
    return err(
      malformed(
        `byte offset ${String(baseOffset + 2)}: it_tlv_tot ${String(totalBytes)} is smaller than the 4-byte TLV info header`,
      ),
    );
  return ok({ magic, totalBytes });
};

/**
 * Parse one complete protected (`0x6908`) or unprotected (`0x6907`) TLV block.
 * Wrapped encryption-key payloads (`ENC_*`) are classified by tag name only and
 * never copied into returned metadata.
 */
export const parseMcubootTlvArea = (
  block: Uint8Array,
  area: "protected" | "unprotected",
  baseOffset: number,
): Result<ParsedMcubootTlvArea, McubootParseError> => {
  const expectedMagic =
    area === "protected" ? MCUBOOT_PROTECTED_TLV_MAGIC : MCUBOOT_TLV_MAGIC;
  const info = parseMcubootTlvInfo(block, expectedMagic, baseOffset);
  if (!info.ok) return info;
  const { magic, totalBytes } = info.value;
  if (block.length < totalBytes)
    return err({
      kind: "truncated",
      message: `byte offset ${String(baseOffset)}: ${area} TLV area declares ${String(totalBytes)} bytes, but only ${String(block.length)} bytes remain`,
      availableBytes: baseOffset + block.length,
      requiredBytes: baseOffset + totalBytes,
    });
  const reader = new BinaryReader(
    Buffer.from(block.buffer, block.byteOffset, totalBytes),
    true,
    "mcuboot",
  );
  const records: McubootTlvRecordSummary[] = [];
  const digests: McubootDeclaredDigest[] = [];
  const signatures: McubootSignatureRecord[] = [];
  const dependencies: McubootDependencyRecord[] = [];
  const encryptionTlvs: string[] = [];
  let securityCounter: number | null = null;
  let pendingKeyhash: string | null = null;
  let cursor = MCUBOOT_TLV_INFO_BYTES;
  let index = 0;
  while (cursor < totalBytes) {
    if (cursor + MCUBOOT_TLV_RECORD_HEADER_BYTES > totalBytes)
      return err(
        malformed(
          `byte offset ${String(baseOffset + cursor)}: ${area} TLV entry ${String(index)} header overruns the ${String(totalBytes)}-byte TLV area`,
        ),
      );
    const type = reader.u16(cursor);
    const length = reader.u16(cursor + 2);
    const valueOffset = cursor + MCUBOOT_TLV_RECORD_HEADER_BYTES;
    if (valueOffset + length > totalBytes)
      return err(
        malformed(
          `byte offset ${String(baseOffset + cursor)}: ${area} TLV entry ${String(index)} (type 0x${type.toString(16)}) declares ${String(length)} bytes past the ${String(totalBytes)}-byte TLV area`,
        ),
      );
    const value = reader.bytes.subarray(valueOffset, valueOffset + length);
    const typeName = TLV_TYPE_NAMES[type] ?? null;
    records.push({
      area,
      index,
      type,
      type_name: typeName,
      offset: baseOffset + cursor,
      length,
    });
    const digestSpec = DIGEST_SPECS[type];
    if (digestSpec !== undefined) {
      if (length !== digestSpec.bytes)
        return err(
          malformed(
            `byte offset ${String(baseOffset + cursor)}: ${digestSpec.algorithm} TLV declares ${String(length)} bytes, expected ${String(digestSpec.bytes)}`,
          ),
        );
      digests.push({
        area,
        algorithm: digestSpec.algorithm,
        declared: Buffer.from(value),
      });
    } else if (type === 0x01) {
      if (length !== 32)
        return err(
          malformed(
            `byte offset ${String(baseOffset + cursor)}: keyhash TLV declares ${String(length)} bytes, expected 32`,
          ),
        );
      pendingKeyhash = Buffer.from(value).toString("hex");
    } else if (SIGNATURE_TYPES[type] !== undefined) {
      signatures.push({
        area,
        type,
        algorithm: SIGNATURE_TYPES[type],
        length,
        keyhash_sha256: pendingKeyhash,
      });
      pendingKeyhash = null;
    } else if (ENCRYPTION_TLV_TYPES[type] !== undefined) {
      encryptionTlvs.push(ENCRYPTION_TLV_TYPES[type]);
    } else if (type === 0x40) {
      if (length !== 12)
        return err(
          malformed(
            `byte offset ${String(baseOffset + cursor)}: dependency TLV declares ${String(length)} bytes, expected 12`,
          ),
        );
      const depVersion = parseVersion(reader, valueOffset + 4);
      dependencies.push({
        image_id: reader.u8(valueOffset),
        major: depVersion.major,
        minor: depVersion.minor,
        revision: depVersion.revision,
        build_num: depVersion.buildNum,
        version_text: depVersion.text,
      });
    } else if (type === 0x50) {
      if (length !== 4)
        return err(
          malformed(
            `byte offset ${String(baseOffset + cursor)}: sec-cnt TLV declares ${String(length)} bytes, expected 4`,
          ),
        );
      if (securityCounter === null) securityCounter = reader.u32(valueOffset);
    }
    cursor = valueOffset + length;
    index += 1;
  }
  return ok({
    area,
    magic,
    totalBytes,
    records,
    digests,
    signatures,
    dependencies,
    securityCounter,
    encryptionTlvs,
  });
};
