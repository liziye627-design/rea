import { createHash } from "node:crypto";
import { readArtifactFileBytes } from "./ArtifactFileRange.js";

import type {
  McubootEntryMetadata,
  McubootMetadata,
} from "../domain/formatMetadata/firmwareMetadata.js";
import type { ArtifactIntegrityPolicyName } from "../domain/artifactIntegrityPolicy.js";
import { boundedList } from "../domain/boundedList.js";
import {
  ArtifactReaderFailure,
  malformedArtifact,
  truncatedArtifact,
} from "../resources/index.js";
import {
  PositionalArtifactReader,
  type PositionalArtifactEntries,
  type PositionalArtifactEntry,
} from "./PositionalArtifactReader.js";
import type { StableRegularFileDescriptor } from "../filesystem/RegularFile.js";
import {
  MCUBOOT_HEADER_MIN_BYTES,
  MCUBOOT_INLINE_TLV_LIMIT,
  MCUBOOT_PROTECTED_TLV_MAGIC,
  MCUBOOT_TLV_INFO_BYTES,
  MCUBOOT_TLV_MAGIC,
  parseMcubootHeader,
  parseMcubootTlvArea,
  parseMcubootTlvInfo,
  type McubootDeclaredDigest,
  type McubootHeaderFields,
  type McubootParseError,
  type ParsedMcubootTlvArea,
} from "../domain/firmware/mcuboot.js";

const READ_CHUNK_BYTES = 64 * 1024;
type McubootEntry = PositionalArtifactEntry & {
  readonly formatMetadata: McubootEntryMetadata;
};

/**
 * Inventory and extract MCUboot v1/v2 (`0x96f3b83d`) firmware images offline.
 * Plaintext image digests are verified over `header + payload + protected_tlv`;
 * encrypted payloads are marked `encrypted: true` and never opened as plain code.
 */
export class McubootArtifactReader extends PositionalArtifactReader<McubootMetadata> {
  override readonly format = "mcuboot" as const;
  readonly #integrity: ArtifactIntegrityPolicyName;

  constructor(
    path: string,
    admitted?: StableRegularFileDescriptor,
    integrity: ArtifactIntegrityPolicyName = "fail",
  ) {
    super(path, "MCUboot", admitted, "MCUboot image");
    this.#integrity = integrity;
  }

  formatMetadata(): McubootMetadata | undefined {
    const metadata = this.preparedFormatMetadata;
    return metadata === undefined ? undefined : structuredClone(metadata);
  }

  protected override entryEndedEarly(
    entry: PositionalArtifactEntry,
  ): ArtifactReaderFailure {
    return malformedArtifact(
      "mcuboot",
      `MCUboot image ended early: ${entry.path}`,
    );
  }

  protected override async prepareEntries(
    signal?: AbortSignal,
  ): Promise<PositionalArtifactEntries<McubootMetadata>> {
    const { handle, initial } = await this.verifyCarrier(signal);
    const headerPrefix = await readArtifactFileBytes(
      "mcuboot",
      handle,
      0,
      Math.min(initial.size, MCUBOOT_HEADER_MIN_BYTES),
      initial.size,
      signal,
    );
    const parsedHeader = parseMcubootHeader(headerPrefix);
    if (!parsedHeader.ok) throw toReaderFailure(parsedHeader.error);
    const header = parsedHeader.value;
    const payloadEnd = header.headerSize + header.imageSize;
    const protectedEnd = payloadEnd + header.protectedTlvSize;
    if (initial.size < protectedEnd)
      throw truncatedArtifact(
        "mcuboot",
        `MCUboot image is truncated: header (${String(header.headerSize)} B), payload (${String(header.imageSize)} B) and protected TLVs (${String(header.protectedTlvSize)} B) require ${String(protectedEnd)} bytes, found ${String(initial.size)}`,
        {
          availableBytes: initial.size,
          requiredBytes: protectedEnd,
        },
      );

    let protectedArea: ParsedMcubootTlvArea | undefined;
    let protectedBytes: Buffer = Buffer.alloc(0);
    if (header.protectedTlvSize > 0) {
      protectedBytes = await readArtifactFileBytes(
        "mcuboot",
        handle,
        payloadEnd,
        header.protectedTlvSize,
        initial.size,
        signal,
      );
      const parsed = parseMcubootTlvArea(
        protectedBytes,
        "protected",
        payloadEnd,
      );
      if (!parsed.ok) throw toReaderFailure(parsed.error);
      if (parsed.value.totalBytes !== header.protectedTlvSize)
        throw malformedArtifact(
          "mcuboot",
          `MCUboot image is malformed: byte offset ${String(payloadEnd + 2)}: protected it_tlv_tot ${String(parsed.value.totalBytes)} disagrees with ih_protect_tlv_size ${String(header.protectedTlvSize)}`,
        );
      protectedArea = parsed.value;
    }

    let unprotectedArea: ParsedMcubootTlvArea | undefined;
    let imageEnd = protectedEnd;
    if (initial.size >= protectedEnd + MCUBOOT_TLV_INFO_BYTES) {
      const infoPeek = await readArtifactFileBytes(
        "mcuboot",
        handle,
        protectedEnd,
        MCUBOOT_TLV_INFO_BYTES,
        initial.size,
        signal,
      );
      const magic = (infoPeek[0] ?? 0) | ((infoPeek[1] ?? 0) << 8);
      if (magic === MCUBOOT_TLV_MAGIC) {
        const info = parseMcubootTlvInfo(
          infoPeek,
          MCUBOOT_TLV_MAGIC,
          protectedEnd,
        );
        if (!info.ok) throw toReaderFailure(info.error);
        if (initial.size < protectedEnd + info.value.totalBytes)
          throw truncatedArtifact(
            "mcuboot",
            `MCUboot image is truncated: unprotected TLV area at offset ${String(protectedEnd)} declares ${String(info.value.totalBytes)} bytes, but file ends at ${String(initial.size)}`,
            {
              availableBytes: initial.size,
              requiredBytes: protectedEnd + info.value.totalBytes,
            },
          );
        const tlvBytes = await readArtifactFileBytes(
          "mcuboot",
          handle,
          protectedEnd,
          info.value.totalBytes,
          initial.size,
          signal,
        );
        const parsed = parseMcubootTlvArea(
          tlvBytes,
          "unprotected",
          protectedEnd,
        );
        if (!parsed.ok) throw toReaderFailure(parsed.error);
        unprotectedArea = parsed.value;
        imageEnd = protectedEnd + parsed.value.totalBytes;
      } else if (magic === MCUBOOT_PROTECTED_TLV_MAGIC) {
        throw malformedArtifact(
          "mcuboot",
          `MCUboot image is malformed: byte offset ${String(protectedEnd)}: unexpected protected TLV magic 0x6908 after ih_protect_tlv_size ${String(header.protectedTlvSize)}`,
        );
      }
    }

    const encryptionTlvs = [
      ...(protectedArea?.encryptionTlvs ?? []),
      ...(unprotectedArea?.encryptionTlvs ?? []),
    ];
    const encrypted = header.encryptedFlag || encryptionTlvs.length > 0;
    const declaredDigests = [
      ...(protectedArea?.digests ?? []),
      ...(unprotectedArea?.digests ?? []),
    ];

    const digestResults = await this.#verifyDigests(
      handle,
      initial.size,
      header,
      protectedBytes,
      declaredDigests,
      encrypted,
      signal,
    );

    const trailingBytes = initial.size - imageEnd;
    let trailingErasedOnly = true;
    if (trailingBytes > 0) {
      let checked = 0;
      while (checked < trailingBytes) {
        this.assertOpen(signal);
        const chunk = await readArtifactFileBytes(
          "mcuboot",
          handle,
          imageEnd + checked,
          Math.min(READ_CHUNK_BYTES, trailingBytes - checked),
          initial.size,
          signal,
        );
        if (chunk.some((byte) => byte !== 0xff)) {
          trailingErasedOnly = false;
          break;
        }
        checked += chunk.length;
      }
    }

    const limitations = [...digestResults.limitations];
    if (encrypted)
      limitations.push(
        "MCUboot image declares payload encryption; payload.bin is marked encrypted, wrapped keys are not exported in metadata, and plaintext TLV hashes are not checked against ciphertext.",
      );
    if (header.compressedFlag)
      limitations.push(
        "MCUboot header sets a compression flag; payload.bin holds the stored compressed bytes without decompression.",
      );
    if (trailingBytes > 0)
      limitations.push(
        trailingErasedOnly
          ? `${String(trailingBytes)} byte(s) of 0xff flash padding/trailer follow the MCUboot image starting at offset ${String(imageEnd)} and are not exposed as entries.`
          : `${String(trailingBytes)} non-erased byte(s) follow the MCUboot image starting at offset ${String(imageEnd)} (such as an MCUboot swap trailer or appended data) and are not exposed as entries.`,
      );

    const entries: McubootEntry[] = [
      entryFor("payload", "payload.bin", {
        byteOffset: header.headerSize,
        declaredSize: header.imageSize,
        encrypted,
        limitations: encrypted
          ? ["MCUboot payload is encrypted and is not decrypted by REA."]
          : [],
      }),
      ...(protectedArea === undefined
        ? []
        : [
            entryFor("protected-tlv", "protected-tlv.bin", {
              byteOffset: payloadEnd,
              declaredSize: protectedArea.totalBytes,
              encrypted: false,
              limitations: [],
            }),
          ]),
      ...(unprotectedArea === undefined
        ? []
        : [
            entryFor("tlv", "tlv.bin", {
              byteOffset: protectedEnd,
              declaredSize: unprotectedArea.totalBytes,
              encrypted: false,
              limitations: [],
            }),
          ]),
    ];

    const tlvRecords = boundedList(
      [...(protectedArea?.records ?? []), ...(unprotectedArea?.records ?? [])],
      MCUBOOT_INLINE_TLV_LIMIT,
    );
    const signatures = [
      ...(protectedArea?.signatures ?? []),
      ...(unprotectedArea?.signatures ?? []),
    ].map((sig) => ({ ...sig, status: "unverified" as const }));
    const dependencies = [
      ...(protectedArea?.dependencies ?? []),
      ...(unprotectedArea?.dependencies ?? []),
    ];

    const metadata: McubootMetadata = {
      kind: "mcuboot",
      magic: header.magic,
      load_address: header.loadAddress,
      header_size: header.headerSize,
      protected_tlv_size: header.protectedTlvSize,
      image_size: header.imageSize,
      flags: header.flags,
      flag_names: [...header.flagNames],
      unknown_flags: header.unknownFlags,
      version: {
        major: header.version.major,
        minor: header.version.minor,
        revision: header.version.revision,
        build_num: header.version.buildNum,
        text: header.version.text,
      },
      pad1: header.pad1,
      encrypted,
      compressed: header.compressedFlag,
      encryption_tlvs: encryptionTlvs,
      security_counter:
        protectedArea?.securityCounter ??
        unprotectedArea?.securityCounter ??
        null,
      unprotected_tlv_size: unprotectedArea?.totalBytes ?? null,
      trailing_bytes: trailingBytes,
      trailing_erased_only: trailingErasedOnly,
      digests: digestResults.digests,
      signatures,
      dependencies,
      tlv_records: [...tlvRecords.items],
      omitted_tlv_records: tlvRecords.omitted,
    };

    const hasInvalidDigest = digestResults.digests.some(
      (digest) => digest.status === "invalid",
    );
    const nonErasedTrailing = trailingBytes > 0 && !trailingErasedOnly;
    return {
      entries,
      coverage: {
        status:
          hasInvalidDigest || nonErasedTrailing || encrypted
            ? "unknown"
            : "complete",
        limitations,
      },
      formatMetadata: metadata,
    };
  }

  async #verifyDigests(
    handle: StableRegularFileDescriptor["handle"],
    fileSize: number,
    header: McubootHeaderFields,
    protectedBytes: Buffer,
    declared: readonly McubootDeclaredDigest[],
    encrypted: boolean,
    signal: AbortSignal | undefined,
  ): Promise<{
    readonly digests: McubootMetadata["digests"];
    readonly limitations: readonly string[];
  }> {
    if (declared.length === 0) return { digests: [], limitations: [] };
    if (encrypted)
      return {
        digests: declared.map((item) => ({
          area: item.area,
          algorithm: item.algorithm,
          declared: item.declared.toString("hex"),
          computed: null,
          status: "encrypted-unverified" as const,
        })),
        limitations: [],
      };

    const hashers = new Map<
      "sha256" | "sha384" | "sha512",
      ReturnType<typeof createHash>
    >();
    for (const item of declared)
      if (!hashers.has(item.algorithm))
        hashers.set(item.algorithm, createHash(item.algorithm));

    // MCUboot hashes [0 .. ih_hdr_size + ih_img_size) followed by protected TLVs.
    const prefixEnd = header.headerSize + header.imageSize;
    let offset = 0;
    while (offset < prefixEnd) {
      this.assertOpen(signal);
      const chunk = await readArtifactFileBytes(
        "mcuboot",
        handle,
        offset,
        Math.min(READ_CHUNK_BYTES, prefixEnd - offset),
        fileSize,
        signal,
      );
      for (const hasher of hashers.values()) hasher.update(chunk);
      offset += chunk.length;
    }
    if (protectedBytes.length > 0)
      for (const hasher of hashers.values()) hasher.update(protectedBytes);

    const computedByAlgorithm = new Map<string, string>();
    for (const [algorithm, hasher] of hashers)
      computedByAlgorithm.set(algorithm, hasher.digest("hex"));

    const limitations: string[] = [];
    const digests: McubootMetadata["digests"] = [];
    for (const item of declared) {
      const declaredHex = item.declared.toString("hex");
      const computedHex = computedByAlgorithm.get(item.algorithm)!;
      const valid = computedHex === declaredHex;
      if (!valid) {
        const message = `MCUboot ${item.area} ${item.algorithm} TLV does not match header + payload + protected TLVs: declared ${declaredHex}, computed ${computedHex}`;
        if (this.#integrity === "fail")
          throw new ArtifactReaderFailure("integrity", message, {
            integrityCheck: "declared-digest",
          });
        limitations.push(message);
      }
      digests.push({
        area: item.area,
        algorithm: item.algorithm,
        declared: declaredHex,
        computed: computedHex,
        status: valid ? "valid" : "invalid",
      });
    }
    return { digests, limitations };
  }
}

const toReaderFailure = (failure: McubootParseError): ArtifactReaderFailure =>
  failure.kind === "truncated"
    ? truncatedArtifact("mcuboot", failure.message, {
        ...(failure.availableBytes === undefined
          ? {}
          : { availableBytes: failure.availableBytes }),
        ...(failure.requiredBytes === undefined
          ? {}
          : { requiredBytes: failure.requiredBytes }),
      })
    : malformedArtifact(
        "mcuboot",
        `MCUboot image is malformed: ${failure.message}`,
      );

const entryFor = (
  role: McubootEntryMetadata["role"],
  path: string,
  options: {
    readonly byteOffset: number;
    readonly declaredSize: number;
    readonly encrypted: boolean;
    readonly limitations: readonly string[];
  },
): McubootEntry => ({
  path,
  sourcePath: path,
  kind: "file",
  declaredSize: options.declaredSize,
  compressedSize: null,
  executable: false,
  encrypted: options.encrypted,
  byteOffset: options.byteOffset,
  declaredIntegrity: null,
  unpacked: false,
  limitations: [...options.limitations],
  adapterKey: `mcuboot:${role}`,
  formatMetadata: { kind: "mcuboot-entry", role },
});
