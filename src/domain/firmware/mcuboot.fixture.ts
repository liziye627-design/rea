import { createHash } from "node:crypto";
import {
  MCUBOOT_HEADER_MIN_BYTES,
  MCUBOOT_MAGIC,
  MCUBOOT_PROTECTED_TLV_MAGIC,
  MCUBOOT_TLV_MAGIC,
} from "./mcuboot.js";

export interface McubootTlvItem {
  readonly type: number;
  readonly value: Uint8Array;
}

export interface McubootImageFixture {
  readonly magic?: number;
  readonly loadAddress?: number;
  readonly headerSize?: number;
  readonly payload?: Uint8Array;
  readonly declaredImageSize?: number;
  readonly flags?: number;
  readonly version?: {
    readonly major?: number;
    readonly minor?: number;
    readonly revision?: number;
    readonly buildNum?: number;
  };
  readonly pad1?: number;
  readonly protectedTlvs?: readonly McubootTlvItem[];
  readonly unprotectedTlvs?: readonly McubootTlvItem[];
  /** Include a valid or corrupted SHA-256 TLV (0x10) in unprotected TLVs by default. */
  readonly includeSha256?: boolean;
  readonly corruptSha256?: boolean;
  readonly omitUnprotectedTlv?: boolean;
  readonly trailingBytes?: Uint8Array;
}

const encodeTlvBlock = (
  magic: number,
  items: readonly McubootTlvItem[],
): Buffer => {
  const records = items.map((item) => {
    const header = Buffer.alloc(4);
    header.writeUInt16LE(item.type, 0);
    header.writeUInt16LE(item.value.byteLength, 2);
    return Buffer.concat([header, Buffer.from(item.value)]);
  });
  const body = Buffer.concat(records);
  const info = Buffer.alloc(4);
  info.writeUInt16LE(magic, 0);
  info.writeUInt16LE(4 + body.byteLength, 2);
  return Buffer.concat([info, body]);
};

/** Build a synthetic MCUboot v1/v2 image matching `imgtool` binary layout. */
export const buildMcubootImage = (
  fixture: McubootImageFixture = {},
): Buffer => {
  const payload = Buffer.from(
    fixture.payload ??
      Buffer.from([0x00, 0x20, 0x00, 0x20, 0x41, 0x00, 0x00, 0x08]),
  );
  const headerSize = fixture.headerSize ?? MCUBOOT_HEADER_MIN_BYTES;
  const protectedBlock =
    fixture.protectedTlvs !== undefined && fixture.protectedTlvs.length > 0
      ? encodeTlvBlock(MCUBOOT_PROTECTED_TLV_MAGIC, fixture.protectedTlvs)
      : Buffer.alloc(0);

  const header = Buffer.alloc(headerSize, 0xff);
  header.fill(0, 0, MCUBOOT_HEADER_MIN_BYTES);
  header.writeUInt32LE(fixture.magic ?? MCUBOOT_MAGIC, 0);
  header.writeUInt32LE((fixture.loadAddress ?? 0) >>> 0, 4);
  header.writeUInt16LE(headerSize, 8);
  header.writeUInt16LE(protectedBlock.byteLength, 10);
  header.writeUInt32LE(
    (fixture.declaredImageSize ?? payload.byteLength) >>> 0,
    12,
  );
  header.writeUInt32LE((fixture.flags ?? 0) >>> 0, 16);
  header.writeUInt8(fixture.version?.major ?? 1, 20);
  header.writeUInt8(fixture.version?.minor ?? 2, 21);
  header.writeUInt16LE(fixture.version?.revision ?? 3, 22);
  header.writeUInt32LE((fixture.version?.buildNum ?? 42) >>> 0, 24);
  header.writeUInt32LE((fixture.pad1 ?? 0) >>> 0, 28);

  const authenticatedPrefix = Buffer.concat([header, payload, protectedBlock]);
  let unprotectedBlock: Buffer = Buffer.alloc(0);
  if (!fixture.omitUnprotectedTlv) {
    const tlvs: McubootTlvItem[] = [];
    if (fixture.includeSha256 !== false) {
      const digest = createHash("sha256").update(authenticatedPrefix).digest();
      if (fixture.corruptSha256 === true) digest[0] = (digest[0] ?? 0) ^ 0xff;
      tlvs.push({ type: 0x10, value: digest });
    }
    if (fixture.unprotectedTlvs !== undefined)
      tlvs.push(...fixture.unprotectedTlvs);
    unprotectedBlock = encodeTlvBlock(MCUBOOT_TLV_MAGIC, tlvs);
  }

  return Buffer.concat([
    authenticatedPrefix,
    unprotectedBlock,
    Buffer.from(fixture.trailingBytes ?? []),
  ]);
};
