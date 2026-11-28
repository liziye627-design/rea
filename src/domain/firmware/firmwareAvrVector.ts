import { readUint16At } from "../binaryContainer.js";
import type { SvdIrqLookupEntry } from "./firmwareSvdInterrupts.js";
import { hex32, type AvrVectorSlot } from "./firmwareVectorTable.js";

/** Maximum byte address of the 22-bit word-addressed AVR program space (8 MiB). */
export const AVR_PROGRAM_SPACE_END_BYTES = 0x80_0000;

const hex16 = (value: number): string =>
  `0x${(value & 0xffff).toString(16).padStart(4, "0")}`;

const signExtend12 = (value: number): number => (value << 20) >> 20;

const isAvrJmpPrefix = (hw: number): boolean => (hw & 0xfe0e) === 0x940c;
const isAvrRjmp = (hw: number): boolean => (hw & 0xf000) === 0xc000;
const isAvrReti = (hw: number): boolean => hw === 0x9518;

/**
 * Determine whether an AVR vector table uses 2-byte (1-word) or 4-byte (2-word)
 * slots from observed instructions:
 * - A 4-byte JMP (`1001 010k kkkk 110k`) requires 4-byte slots.
 * - `avr-gcc` on >8 KiB devices also emits `rjmp target; nop (0x0000)` inside
 *   4-byte slots; when slot +2 is `0x0000` and slot +4 starts a jump/reti, the
 *   stride is 4 bytes.
 */
export const detectAvrSlotBytes = (tableBytes: Buffer): 2 | 4 => {
  if (tableBytes.length < 4) return 2;
  const hw0 = readUint16At(tableBytes, 0, true);
  if (isAvrJmpPrefix(hw0)) return 4;
  if ((isAvrRjmp(hw0) || isAvrReti(hw0)) && tableBytes.length >= 6) {
    const hw1 = readUint16At(tableBytes, 2, true);
    const hw2 = readUint16At(tableBytes, 4, true);
    if (
      hw1 === 0x0000 &&
      (isAvrJmpPrefix(hw2) || isAvrRjmp(hw2) || isAvrReti(hw2))
    ) {
      return 4;
    }
  }
  return 2;
};

export interface DecodedAvrVectorSlots {
  readonly slotBytes: 2 | 4;
  readonly slots: AvrVectorSlot[];
  readonly activeTargets: readonly {
    readonly slotIndex: number;
    readonly address: string;
  }[];
  readonly activeIrqs: readonly number[];
  readonly consumedBytes: number;
}

export const decodeAvrVectorSlots = (options: {
  readonly tableBytes: Buffer;
  readonly vectorTableOffset: number;
  readonly baseAddress: number;
  readonly maxEntries: number;
  readonly svdMap: ReadonlyMap<number, SvdIrqLookupEntry>;
  readonly anomalies: string[];
}): DecodedAvrVectorSlots => {
  const {
    tableBytes,
    vectorTableOffset,
    baseAddress,
    maxEntries,
    svdMap,
    anomalies,
  } = options;
  const tableAddress = baseAddress + vectorTableOffset;
  const slotBytes = detectAvrSlotBytes(tableBytes);
  const addressableEntries =
    tableAddress >= AVR_PROGRAM_SPACE_END_BYTES
      ? 0
      : Math.floor((AVR_PROGRAM_SPACE_END_BYTES - tableAddress) / slotBytes);
  const entryCount = Math.min(
    maxEntries,
    Math.floor(tableBytes.length / slotBytes),
    addressableEntries,
  );

  const slots: AvrVectorSlot[] = [];
  const activeTargets: { slotIndex: number; address: string }[] = [];
  const activeIrqs: number[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    const rel = i * slotBytes;
    const slotAddress = tableAddress + rel;
    const hw0 = readUint16At(tableBytes, rel, true);
    const hw1 =
      slotBytes === 4 ? readUint16At(tableBytes, rel + 2, true) : undefined;
    const rawWords =
      hw1 === undefined ? [hex16(hw0)] : [hex16(hw0), hex16(hw1)];

    const irqNumber = i === 0 ? null : i - 1;
    let name: string | null = i === 0 ? "RESET" : null;
    let nameBasis: AvrVectorSlot["name_basis"] =
      i === 0 ? "architecture_manual" : "observed_slot";
    let peripheralName: string | null = null;
    let ambiguousNames: string[] = [];
    if (irqNumber !== null) {
      const svd = svdMap.get(irqNumber);
      if (svd !== undefined) {
        if (svd.primaryName !== null) {
          name = svd.primaryName;
          nameBasis = "explicit_profile";
          peripheralName = svd.primaryPeripheral;
        } else {
          ambiguousNames = [...svd.ambiguousNames];
        }
      }
    }

    const isErased =
      (hw0 === 0x0000 || hw0 === 0xffff) &&
      (hw1 === undefined || hw1 === 0x0000 || hw1 === 0xffff);
    if (isErased) {
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        irq_number: irqNumber,
        name,
        name_basis: nameBasis,
        peripheral_name: peripheralName,
        ambiguous_profile_names: ambiguousNames,
        encoding: "zero_or_erased",
        raw_words: rawWords,
        decoded_mnemonic: null,
        target_code_address: null,
      });
      continue;
    }

    if (slotBytes === 4 && hw1 !== undefined && isAvrJmpPrefix(hw0)) {
      const wordTarget = (((hw0 >>> 4) & 0x1f) << 17) | ((hw0 & 1) << 16) | hw1;
      const byteTarget = wordTarget * 2;
      const targetHex = hex32(byteTarget);
      activeTargets.push({ slotIndex: i, address: targetHex });
      if (irqNumber !== null) activeIrqs.push(irqNumber);
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        irq_number: irqNumber,
        name,
        name_basis: nameBasis,
        peripheral_name: peripheralName,
        ambiguous_profile_names: ambiguousNames,
        encoding: "jmp",
        raw_words: rawWords,
        decoded_mnemonic: `jmp ${targetHex}`,
        target_code_address: targetHex,
      });
      continue;
    }

    if (
      isAvrRjmp(hw0) &&
      (hw1 === undefined || hw1 === 0x0000 || hw1 === 0xffff)
    ) {
      const wordDisp = signExtend12(hw0 & 0x0fff);
      const byteTarget = slotAddress + 2 + wordDisp * 2;
      if (byteTarget < 0) {
        anomalies.push(
          `Slot ${String(i)} (${name ?? `IRQ ${String(irqNumber)}`}) uses negative RJMP displacement (${String(wordDisp)} words) wrapping below 0x0; flash size is unknown, so target_code_address is left null.`,
        );
        slots.push({
          slot_index: i,
          file_offset: vectorTableOffset + rel,
          slot_address: hex32(slotAddress),
          irq_number: irqNumber,
          name,
          name_basis: nameBasis,
          peripheral_name: peripheralName,
          ambiguous_profile_names: ambiguousNames,
          encoding: "rjmp",
          raw_words: rawWords,
          decoded_mnemonic: `rjmp .${wordDisp * 2}`,
          target_code_address: null,
        });
        continue;
      }
      const targetHex = hex32(byteTarget);
      activeTargets.push({ slotIndex: i, address: targetHex });
      if (irqNumber !== null) activeIrqs.push(irqNumber);
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        irq_number: irqNumber,
        name,
        name_basis: nameBasis,
        peripheral_name: peripheralName,
        ambiguous_profile_names: ambiguousNames,
        encoding: "rjmp",
        raw_words: rawWords,
        decoded_mnemonic: `rjmp ${targetHex}`,
        target_code_address: targetHex,
      });
      continue;
    }

    if (
      isAvrReti(hw0) &&
      (hw1 === undefined || hw1 === 0x0000 || hw1 === 0xffff)
    ) {
      slots.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: hex32(slotAddress),
        irq_number: irqNumber,
        name,
        name_basis: nameBasis,
        peripheral_name: peripheralName,
        ambiguous_profile_names: ambiguousNames,
        encoding: "reti",
        raw_words: rawWords,
        decoded_mnemonic: "reti",
        target_code_address: null,
      });
      continue;
    }

    slots.push({
      slot_index: i,
      file_offset: vectorTableOffset + rel,
      slot_address: hex32(slotAddress),
      irq_number: irqNumber,
      name,
      name_basis: nameBasis,
      peripheral_name: peripheralName,
      ambiguous_profile_names: ambiguousNames,
      encoding: "unrecognized",
      raw_words: rawWords,
      decoded_mnemonic: null,
      target_code_address: null,
    });
  }

  return {
    slotBytes,
    slots,
    activeTargets,
    activeIrqs,
    consumedBytes: entryCount * slotBytes,
  };
};
