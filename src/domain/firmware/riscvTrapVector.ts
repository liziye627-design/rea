import { z } from "zod";
import { err, ok, type Result } from "../result.js";

/** RISC-V Trap vector dispatch mode (mtvec.MODE). */
export const riscvTrapModeSchema = z.enum(["direct", "vectored"]);
export type RiscvTrapMode = z.infer<typeof riscvTrapModeSchema>;

/** Category of RISC-V trap. */
export const riscvTrapKindSchema = z.enum([
  "sync_exception",
  "software_interrupt",
  "timer_interrupt",
  "external_interrupt",
  "reserved",
]);
export type RiscvTrapKind = z.infer<typeof riscvTrapKindSchema>;

/** Individual decoded RISC-V trap vector entry. */
export interface RiscvTrapVectorEntry {
  readonly index: number;
  readonly cause: number;
  readonly name: string;
  readonly kind: RiscvTrapKind;
  readonly targetAddress: string;
  readonly targetAddressValue: bigint;
  readonly associatedController: string | null;
  readonly description: string;
}

export const riscvTrapVectorEntrySchema = z.strictObject({
  index: z.number().int().min(0),
  cause: z.number().int().min(0),
  name: z.string(),
  kind: riscvTrapKindSchema,
  targetAddress: z.string(),
  targetAddressValue: z.bigint(),
  associatedController: z.string().nullable(),
  description: z.string(),
});

/** Decoded RISC-V Trap Vector Table representation. */
export interface RiscvTrapTable {
  readonly baseAddress: string;
  readonly baseAddressValue: bigint;
  readonly mode: RiscvTrapMode;
  readonly entryCount: number;
  readonly entries: readonly RiscvTrapVectorEntry[];
}

export const riscvTrapTableSchema = z.strictObject({
  baseAddress: z.string(),
  baseAddressValue: z.bigint(),
  mode: riscvTrapModeSchema,
  entryCount: z.number().int().min(0),
  entries: z.array(riscvTrapVectorEntrySchema),
});

interface TrapCauseDescriptor {
  readonly name: string;
  readonly kind: RiscvTrapKind;
  readonly controller: string | null;
  readonly description: string;
}

const RISCV_INTERRUPTS: Record<number, TrapCauseDescriptor> = {
  0: {
    name: "User_Software_Interrupt",
    kind: "software_interrupt",
    controller: "CLINT",
    description: "User software interrupt (USIP)",
  },
  1: {
    name: "Supervisor_Software_Interrupt",
    kind: "software_interrupt",
    controller: "CLINT",
    description: "Supervisor software interrupt (SSIP)",
  },
  3: {
    name: "Machine_Software_Interrupt",
    kind: "software_interrupt",
    controller: "CLINT",
    description: "Machine software interrupt / inter-hart IPI (MSIP)",
  },
  4: {
    name: "User_Timer_Interrupt",
    kind: "timer_interrupt",
    controller: "CLINT",
    description: "User timer interrupt (UTIP)",
  },
  5: {
    name: "Supervisor_Timer_Interrupt",
    kind: "timer_interrupt",
    controller: "CLINT",
    description: "Supervisor timer interrupt (STIP)",
  },
  7: {
    name: "Machine_Timer_Interrupt",
    kind: "timer_interrupt",
    controller: "CLINT",
    description: "Machine timer compare interrupt (MTIP / mtimecmp)",
  },
  8: {
    name: "User_External_Interrupt",
    kind: "external_interrupt",
    controller: "PLIC",
    description: "User external interrupt (UEIP)",
  },
  9: {
    name: "Supervisor_External_Interrupt",
    kind: "external_interrupt",
    controller: "PLIC",
    description: "Supervisor external interrupt (SEIP)",
  },
  11: {
    name: "Machine_External_Interrupt",
    kind: "external_interrupt",
    controller: "PLIC",
    description: "Machine external peripheral interrupt (MEIP via PLIC)",
  },
};

const readWordLe = (data: Uint8Array, offset: number): bigint => {
  const byte0 = BigInt(data[offset] ?? 0);
  const byte1 = BigInt(data[offset + 1] ?? 0);
  const byte2 = BigInt(data[offset + 2] ?? 0);
  const byte3 = BigInt(data[offset + 3] ?? 0);
  return byte0 | (byte1 << 8n) | (byte2 << 16n) | (byte3 << 24n);
};

const formatHex = (val: bigint): string => `0x${val.toString(16)}`;

/**
 * Parse a RISC-V Trap Vector Table from binary bytes given base address and dispatch mode.
 * In vectored mode (mtvec.MODE=1), vectors are 32-bit aligned instruction or function pointer slots.
 */
export const parseRiscvTrapTable = (
  data: Uint8Array,
  baseAddress: bigint,
  mode: RiscvTrapMode = "vectored",
): Result<RiscvTrapTable, string> => {
  if (data.length < 16) {
    return err(
      "Binary data too short for RISC-V trap table (minimum 16 bytes required)",
    );
  }

  const entries: RiscvTrapVectorEntry[] = [];

  if (mode === "direct") {
    // Mode 0: All traps jump to baseAddress (single unified entrypoint).
    const targetAddress = readWordLe(data, 0);
    entries.push({
      index: 0,
      cause: 0,
      name: "Unified_Trap_Handler",
      kind: "sync_exception",
      targetAddress: formatHex(targetAddress),
      targetAddressValue: targetAddress,
      associatedController: null,
      description: "Direct trap handler handling all exceptions and interrupts",
    });
    return ok({
      baseAddress: formatHex(baseAddress),
      baseAddressValue: baseAddress,
      mode: "direct",
      entryCount: 1,
      entries,
    });
  }

  // Mode 1 (Vectored): Index 0 is synchronous exception handler, indices 1..N are interrupt slots.
  const totalSlots = Math.min(Math.floor(data.length / 4), 32);

  for (let idx = 0; idx < totalSlots; idx++) {
    const targetAddress = readWordLe(data, idx * 4);
    if (idx === 0) {
      entries.push({
        index: 0,
        cause: 0,
        name: "Synchronous_Exception_Handler",
        kind: "sync_exception",
        targetAddress: formatHex(targetAddress),
        targetAddressValue: targetAddress,
        associatedController: null,
        description:
          "Common handler for synchronous exceptions (ecall, breakpoint, faults)",
      });
      continue;
    }

    const cause = idx;
    const desc = RISCV_INTERRUPTS[cause];
    if (desc) {
      entries.push({
        index: idx,
        cause,
        name: desc.name,
        kind: desc.kind,
        targetAddress: formatHex(targetAddress),
        targetAddressValue: targetAddress,
        associatedController: desc.controller,
        description: desc.description,
      });
    } else {
      entries.push({
        index: idx,
        cause,
        name: `Interrupt_Cause_${cause}`,
        kind: "reserved",
        targetAddress: formatHex(targetAddress),
        targetAddressValue: targetAddress,
        associatedController: null,
        description: `Reserved or platform-specific RISC-V interrupt cause ${cause}`,
      });
    }
  }

  return ok({
    baseAddress: formatHex(baseAddress),
    baseAddressValue: baseAddress,
    mode: "vectored",
    entryCount: entries.length,
    entries,
  });
};
