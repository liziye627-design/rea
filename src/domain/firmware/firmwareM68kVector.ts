import { readUint32At } from "../binaryContainer.js";
import type { SvdIrqLookupEntry } from "./firmwareSvdInterrupts.js";
import { hex32, type M68kVectorEntry } from "./firmwareVectorTable.js";

/** Maximum architectural slot count of the 1024-byte M68000 exception vector table. */
export const M68K_MAX_ARCHITECTURAL_VECTORS = 256;

const M68K_FIXED_EXCEPTIONS: Readonly<Record<number, string>> = {
  1: "Reset",
  2: "BusError",
  3: "AddressError",
  4: "IllegalInstruction",
  5: "ZeroDivide",
  6: "CHK",
  7: "TRAPV",
  8: "PrivilegeViolation",
  9: "Trace",
  10: "Line1010Emulator",
  11: "Line1111Emulator",
  15: "UninitializedInterrupt",
  24: "SpuriousInterrupt",
  25: "Level1Autovector",
  26: "Level2Autovector",
  27: "Level3Autovector",
  28: "Level4Autovector",
  29: "Level5Autovector",
  30: "Level6Autovector",
  31: "Level7Autovector",
};

type M68kSlotIdentity = Pick<
  M68kVectorEntry,
  | "kind"
  | "vector_number"
  | "irq_number"
  | "name"
  | "name_basis"
  | "peripheral_name"
  | "ambiguous_profile_names"
>;

const decodeM68kSlotIdentity = (
  slotIndex: number,
  svdMap: ReadonlyMap<number, SvdIrqLookupEntry>,
): M68kSlotIdentity => {
  if (slotIndex === 0) {
    return {
      kind: "initial_stack_pointer",
      vector_number: 0,
      irq_number: null,
      name: "InitialSSP",
      name_basis: "architecture_manual",
      peripheral_name: null,
      ambiguous_profile_names: [],
    };
  }
  const fixed = M68K_FIXED_EXCEPTIONS[slotIndex];
  if (fixed !== undefined) {
    return {
      kind: "system_exception",
      vector_number: slotIndex,
      irq_number: null,
      name: fixed,
      name_basis: "architecture_manual",
      peripheral_name: null,
      ambiguous_profile_names: [],
    };
  }
  if (slotIndex >= 32 && slotIndex <= 47) {
    return {
      kind: "trap_vector",
      vector_number: slotIndex,
      irq_number: null,
      name: `TRAP${String(slotIndex - 32)}`,
      name_basis: "architecture_manual",
      peripheral_name: null,
      ambiguous_profile_names: [],
    };
  }
  if (slotIndex < 64) {
    return {
      kind: "reserved",
      vector_number: slotIndex,
      irq_number: null,
      name: null,
      name_basis: "architecture_manual",
      peripheral_name: null,
      ambiguous_profile_names: [],
    };
  }
  const irqNumber = slotIndex - 64;
  const svd = svdMap.get(irqNumber);
  if (svd !== undefined && svd.primaryName !== null) {
    return {
      kind: "user_device_vector",
      vector_number: slotIndex,
      irq_number: irqNumber,
      name: svd.primaryName,
      name_basis: "explicit_profile",
      peripheral_name: svd.primaryPeripheral,
      ambiguous_profile_names: [],
    };
  }
  return {
    kind: "user_device_vector",
    vector_number: slotIndex,
    irq_number: irqNumber,
    name: null,
    name_basis: "observed_slot",
    peripheral_name: null,
    ambiguous_profile_names: svd ? [...svd.ambiguousNames] : [],
  };
};

export interface DecodedM68kVectorEntries {
  readonly entries: M68kVectorEntry[];
  readonly activeTargets: readonly {
    readonly slotIndex: number;
    readonly address: string;
  }[];
  readonly activeIrqs: readonly number[];
  readonly initialStackPointer: string | null;
}

export const decodeM68kVectorEntries = (options: {
  readonly tableBytes: Buffer;
  readonly vectorTableOffset: number;
  readonly vtorAddress: number;
  readonly entryCount: number;
  readonly svdMap: ReadonlyMap<number, SvdIrqLookupEntry>;
  readonly anomalies: string[];
}): DecodedM68kVectorEntries => {
  const { tableBytes, vectorTableOffset, vtorAddress, svdMap, anomalies } =
    options;
  const slotCount = Math.min(
    options.entryCount,
    M68K_MAX_ARCHITECTURAL_VECTORS,
  );
  const entries: M68kVectorEntry[] = [];
  const activeTargets: { slotIndex: number; address: string }[] = [];
  const activeIrqs: number[] = [];
  let initialStackPointer: string | null = null;

  for (let i = 0; i < slotCount; i += 1) {
    const rel = i * 4;
    const rawWord = readUint32At(tableBytes, rel, false);
    const slotAddress = hex32((vtorAddress + rel) >>> 0);
    const identity = decodeM68kSlotIdentity(i, svdMap);

    if (identity.kind === "initial_stack_pointer") {
      initialStackPointer = hex32(rawWord);
      if (rawWord === 0 || rawWord === 0xffff_ffff) {
        anomalies.push(
          `Slot 0 InitialSSP is ${hex32(rawWord)}, which is not an initialized supervisor stack pointer.`,
        );
      } else if ((rawWord & 1) === 1) {
        anomalies.push(
          `Slot 0 InitialSSP ${hex32(rawWord)} is odd; MC68000 word/long stack pushes fault on odd addresses.`,
        );
      }
      entries.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: slotAddress,
        ...identity,
        raw_word: hex32(rawWord),
        target_code_address: null,
        status: "stack_pointer",
      });
      continue;
    }

    if (rawWord === 0) {
      entries.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: slotAddress,
        ...identity,
        raw_word: hex32(rawWord),
        target_code_address: null,
        status: "null_entry",
      });
      continue;
    }

    if (rawWord === 0xffff_ffff) {
      entries.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: slotAddress,
        ...identity,
        raw_word: hex32(rawWord),
        target_code_address: null,
        status: "erased_entry",
      });
      continue;
    }

    if (identity.kind === "reserved") {
      anomalies.push(
        `Architecturally reserved M68000 vector ${String(i)} is non-zero (${hex32(rawWord)}).`,
      );
      entries.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: slotAddress,
        ...identity,
        raw_word: hex32(rawWord),
        target_code_address: null,
        status: "nonzero_reserved",
      });
      continue;
    }

    if ((rawWord & 1) === 1) {
      anomalies.push(
        `Slot ${String(i)} (${identity.name ?? `UserVector ${String(identity.irq_number)}`}) holds odd address ${hex32(rawWord)}; 68000 instruction fetches must be 2-byte aligned.`,
      );
      entries.push({
        slot_index: i,
        file_offset: vectorTableOffset + rel,
        slot_address: slotAddress,
        ...identity,
        raw_word: hex32(rawWord),
        target_code_address: hex32(rawWord),
        status: "invalid_odd_code_address",
      });
      continue;
    }

    const targetHex = hex32(rawWord);
    activeTargets.push({ slotIndex: i, address: targetHex });
    if (identity.irq_number !== null) activeIrqs.push(identity.irq_number);
    entries.push({
      slot_index: i,
      file_offset: vectorTableOffset + rel,
      slot_address: slotAddress,
      ...identity,
      raw_word: hex32(rawWord),
      target_code_address: targetHex,
      status: "active",
    });
  }

  return { entries, activeTargets, activeIrqs, initialStackPointer };
};
