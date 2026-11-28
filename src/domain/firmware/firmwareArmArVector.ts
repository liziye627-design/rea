import { readUint32At } from "../binaryContainer.js";
import { hex32, type ArmArVectorSlot } from "./firmwareVectorTable.js";

/** Architectural exception slots of the 32-byte ARM A/R-profile vector table. */
export const ARM_AR_EXCEPTION_NAMES: readonly string[] = [
  "Reset",
  "UndefinedInstruction",
  "SupervisorCall",
  "PrefetchAbort",
  "DataAbort",
  "Reserved",
  "IRQ",
  "FIQ",
];

export const ARM_AR_VECTOR_SLOT_COUNT = ARM_AR_EXCEPTION_NAMES.length;
export const ARM_AR_VBAR_ALIGNMENT_BYTES = 32;

const signExtend24 = (value: number): number => ((value << 8) >> 8) * 4;

const ror32 = (value: number, shift: number): number => {
  const s = shift & 31;
  return s === 0 ? value >>> 0 : ((value >>> s) | (value << (32 - s))) >>> 0;
};

export interface DecodedArmArVectorSlots {
  readonly slots: ArmArVectorSlot[];
  readonly activeTargets: readonly {
    readonly slotIndex: number;
    readonly address: string;
  }[];
  readonly consumedBytes: number;
}

export const decodeArmArVectorSlots = (options: {
  readonly tableBytes: Buffer;
  readonly vectorTableOffset: number;
  readonly vtorAddress: number;
  readonly entryCount: number;
  readonly anomalies: string[];
}): DecodedArmArVectorSlots => {
  const { tableBytes, vectorTableOffset, vtorAddress, anomalies } = options;
  const slotCount = Math.min(options.entryCount, ARM_AR_VECTOR_SLOT_COUNT);
  const slots: ArmArVectorSlot[] = [];
  const activeTargets: { slotIndex: number; address: string }[] = [];
  // not-an-allowance: tracks furthest byte read across 32-byte table and literal pool loads
  let consumedBytes = slotCount * 4;

  for (let i = 0; i < slotCount; i += 1) {
    const rel = i * 4;
    const slotAddress = (vtorAddress + rel) >>> 0;
    const word = readUint32At(tableBytes, rel, true);
    const isReserved = i === 5;
    const name = isReserved ? null : (ARM_AR_EXCEPTION_NAMES[i] ?? null);

    if (word === 0 || word === 0xffff_ffff) {
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        name,
        name_basis: "architecture_manual",
        encoding: "zero_or_erased",
        raw_word: hex32(word),
        decoded_mnemonic: null,
        literal_pool_address: null,
        literal_word: null,
        thumb_interworking: null,
        self_loop: false,
        target_code_address: null,
      });
      continue;
    }

    if (isReserved) {
      anomalies.push(
        `Slot 5 (architecturally reserved on classic ARM, or HypTrap with Virtualization Extensions) holds non-zero word ${hex32(word)}.`,
      );
    }

    // Unconditional A32 branch: 1110 1010 imm24
    if (word >>> 24 === 0xea) {
      const disp = signExtend24(word & 0x00ff_ffff);
      const target = (slotAddress + 8 + disp) >>> 0;
      const selfLoop = disp === -8;
      if (selfLoop) {
        anomalies.push(
          `Slot ${String(i)} (${name ?? "Reserved"}) is an infinite self-branch (${hex32(word)} at ${hex32(slotAddress)}).`,
        );
      }
      const targetHex = hex32(target);
      activeTargets.push({ slotIndex: i, address: targetHex });
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        name,
        name_basis: "architecture_manual",
        encoding: "b",
        raw_word: hex32(word),
        decoded_mnemonic: `b ${targetHex}`,
        literal_pool_address: null,
        literal_word: null,
        thumb_interworking: false,
        self_loop: selfLoop,
        target_code_address: targetHex,
      });
      continue;
    }

    // Unconditional A32 PC-relative literal load: LDR pc, [pc, #+/-imm12]
    // Encoding: 1110 0101 U001 1111 1111 imm12 -> mask 0xff7ff000 === 0xe51ff000
    if ((word & 0xff7f_f000) >>> 0 === 0xe51f_f000) {
      const uAdd = (word & 0x0080_0000) !== 0;
      const imm12 = word & 0x0fff;
      const signedDisp = uAdd ? imm12 : -imm12;
      const poolRel = rel + 8 + signedDisp;
      const poolAddressBig = BigInt(slotAddress) + 8n + BigInt(signedDisp);
      const dispText = uAdd
        ? `#0x${imm12.toString(16)}`
        : `#-0x${imm12.toString(16)}`;
      const mnemonic = `ldr pc, [pc, ${dispText}]`;

      if (
        poolAddressBig < 0n ||
        poolAddressBig > 0xffff_ffffn ||
        poolRel < 0 ||
        poolRel + 4 > tableBytes.length ||
        (poolRel & 3) !== 0
      ) {
        const poolHex =
          poolAddressBig >= 0n && poolAddressBig <= 0xffff_ffffn
            ? hex32(Number(poolAddressBig))
            : null;
        anomalies.push(
          `Slot ${String(i)} (${name ?? "Reserved"}) loads PC from ${poolHex ?? "an out-of-range address"}, outside the readable image slice.`,
        );
        slots.push({
          slot_index: i,
          file_offset: vectorTableOffset + rel,
          slot_address: hex32(slotAddress),
          name,
          name_basis: "architecture_manual",
          encoding: "ldr_pc_literal",
          raw_word: hex32(word),
          decoded_mnemonic: mnemonic,
          literal_pool_address: poolHex,
          literal_word: null,
          thumb_interworking: null,
          self_loop: false,
          target_code_address: null,
        });
        continue;
      }

      if (poolRel + 4 > consumedBytes) consumedBytes = poolRel + 4;
      const litWord = readUint32At(tableBytes, poolRel, true);
      const poolHex = hex32(Number(poolAddressBig));
      const litHex = hex32(litWord);
      if (litWord === 0 || litWord === 0xffff_ffff) {
        slots.push({
          slot_index: i,
          file_offset: vectorTableOffset + rel,
          slot_address: hex32(slotAddress),
          name,
          name_basis: "architecture_manual",
          encoding: "ldr_pc_literal",
          raw_word: hex32(word),
          decoded_mnemonic: mnemonic,
          literal_pool_address: poolHex,
          literal_word: litHex,
          thumb_interworking: null,
          self_loop: false,
          target_code_address: null,
        });
        continue;
      }
      const thumbBit = (litWord & 1) === 1;
      const targetHex = hex32((litWord & ~1) >>> 0);
      activeTargets.push({ slotIndex: i, address: targetHex });
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        name,
        name_basis: "architecture_manual",
        encoding: "ldr_pc_literal",
        raw_word: hex32(word),
        decoded_mnemonic: mnemonic,
        literal_pool_address: poolHex,
        literal_word: litHex,
        thumb_interworking: thumbBit,
        self_loop: false,
        target_code_address: targetHex,
      });
      continue;
    }

    // MOV pc, #imm: 1110 0011 1010 0000 1111 rot4 imm8
    if ((word & 0xfff0_f000) >>> 0 === 0xe3a0_f000) {
      const rot = ((word >>> 8) & 0x0f) * 2;
      const imm = ror32(word & 0xff, rot);
      const targetHex = hex32(imm);
      activeTargets.push({ slotIndex: i, address: targetHex });
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        name,
        name_basis: "architecture_manual",
        encoding: "mov_pc_imm",
        raw_word: hex32(word),
        decoded_mnemonic: `mov pc, ${targetHex}`,
        literal_pool_address: null,
        literal_word: null,
        thumb_interworking: false,
        self_loop: imm === slotAddress,
        target_code_address: targetHex,
      });
      continue;
    }

    // Direct exception return: MOVS pc, lr (0xe1b0f00e) or SUBS pc, lr, #imm (0xe25ef...)
    if (word === 0xe1b0_f00e || (word & 0xffff_f000) >>> 0 === 0xe25e_f000) {
      const mnemonic =
        word === 0xe1b0_f00e
          ? "movs pc, lr"
          : `subs pc, lr, #0x${ror32(word & 0xff, ((word >>> 8) & 0x0f) * 2).toString(16)}`;
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        name,
        name_basis: "architecture_manual",
        encoding: "exception_return",
        raw_word: hex32(word),
        decoded_mnemonic: mnemonic,
        literal_pool_address: null,
        literal_word: null,
        thumb_interworking: null,
        self_loop: false,
        target_code_address: null,
      });
      continue;
    }

    slots.push({
      slot_index: i,
      file_offset: vectorTableOffset + rel,
      slot_address: hex32(slotAddress),
      name,
      name_basis: "architecture_manual",
      encoding: "unrecognized",
      raw_word: hex32(word),
      decoded_mnemonic: null,
      literal_pool_address: null,
      literal_word: null,
      thumb_interworking: null,
      self_loop: false,
      target_code_address: null,
    });
  }

  return { slots, activeTargets, consumedBytes };
};
