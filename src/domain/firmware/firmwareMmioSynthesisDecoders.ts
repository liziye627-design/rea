import { readUint16At, readUint32At } from "../binaryContainer.js";
import {
  formatHexAddress,
  type FirmwareMmioArchitecture,
  type MmioAccessKind,
} from "./firmwareMmioSynthesis.js";

export interface RawSynthesizedCandidate {
  readonly highFileOffset: number;
  readonly highAddress: bigint;
  readonly highMnemonic: string;
  readonly lowFileOffset: number;
  readonly lowAddress: bigint;
  readonly lowMnemonic: string;
  readonly baseRegister: string;
  readonly pattern: string;
  readonly accessKind: MmioAccessKind;
  readonly accessWidthBytes: number | null;
  readonly synthesizedAddress: bigint;
}

export interface DisassembledStreamResult {
  readonly candidates: readonly RawSynthesizedCandidate[];
  readonly decodedInstructions: number;
  readonly consumedBytes: number;
  readonly stoppedByAddressEnd: boolean;
}

interface TrackedHighState {
  readonly baseValue: bigint;
  readonly highFileOffset: number;
  readonly highAddress: bigint;
  readonly highMnemonic: string;
  readonly highOpLabel: string;
  readonly age: number;
}

const MASK_32 = 0xffff_ffffn;
const MASK_64 = 0xffff_ffff_ffff_ffffn;

const signExtend = (value: bigint, bits: number): bigint => {
  const shift = BigInt(bits - 1);
  const signBit = 1n << shift;
  return (value ^ signBit) - signBit;
};

const wrapArch = (value: bigint, is64: boolean): bigint =>
  is64 ? value & MASK_64 : value & MASK_32;

const ageStates = (
  states: Map<number, TrackedHighState>,
  maxWindow: number,
): void => {
  for (const [reg, st] of states) {
    if (st.age + 1 > maxWindow) states.delete(reg);
    else states.set(reg, { ...st, age: st.age + 1 });
  }
};

const RISCV_ABI_NAMES = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
] as const;

const riscvReg = (r: number): string => RISCV_ABI_NAMES[r] ?? `x${String(r)}`;

const decodeRiscvStream = (options: {
  readonly bytes: Buffer;
  readonly scanOffset: number;
  readonly scanStartAddress: bigint;
  readonly is64: boolean;
  readonly maxWindow: number;
}): DisassembledStreamResult => {
  const { bytes, scanOffset, scanStartAddress, is64, maxWindow } = options;
  const maxAddr = is64 ? MASK_64 : MASK_32;
  const states = new Map<number, TrackedHighState>();
  const candidates: RawSynthesizedCandidate[] = [];
  // not-an-allowance: instruction counter over bounded scan slice
  let decodedInstructions = 0;
  // not-an-allowance: byte cursor over bounded scan slice
  let pos = 0;
  let stoppedByAddressEnd = false;

  while (pos + 2 <= bytes.length) {
    const pc = scanStartAddress + BigInt(pos);
    if (pc > maxAddr - 1n) {
      stoppedByAddressEnd = true;
      break;
    }
    const half = readUint16At(bytes, pos, true);
    const is32Bit = (half & 0x3) === 0x3;
    if (is32Bit) {
      if (pos + 4 > bytes.length) break;
      if (pc > maxAddr - 3n) {
        stoppedByAddressEnd = true;
        break;
      }
      const word = readUint32At(bytes, pos, true);
      decodedInstructions += 1;
      ageStates(states, maxWindow);
      const opcode = word & 0x7f;
      const rd = (word >>> 7) & 0x1f;
      const funct3 = (word >>> 12) & 0x7;
      const rs1 = (word >>> 15) & 0x1f;

      if (opcode === 0x37 || opcode === 0x17) {
        const imm20 = (word >>> 12) & 0xfffff;
        const shifted = signExtend(BigInt(imm20) << 12n, 32);
        const opName = opcode === 0x37 ? "lui" : "auipc";
        if (rd !== 0) {
          const baseVal =
            opcode === 0x37
              ? wrapArch(shifted, is64)
              : wrapArch(pc + shifted, is64);
          states.set(rd, {
            baseValue: baseVal,
            highFileOffset: scanOffset + pos,
            highAddress: pc,
            highMnemonic: `${opName} ${riscvReg(rd)}, 0x${imm20.toString(16)}`,
            highOpLabel: opName,
            age: 0,
          });
        }
      } else if (opcode === 0x13 && funct3 === 0) {
        const simm12 = signExtend(BigInt((word >>> 20) & 0xfff), 12);
        const tracked = states.get(rs1);
        if (tracked !== undefined && simm12 !== 0n && rd !== 0) {
          const addr = wrapArch(tracked.baseValue + simm12, is64);
          const lowMnemonic = `addi ${riscvReg(rd)}, ${riscvReg(rs1)}, ${String(simm12)}`;
          candidates.push({
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: tracked.highMnemonic,
            lowFileOffset: scanOffset + pos,
            lowAddress: pc,
            lowMnemonic,
            baseRegister: riscvReg(rs1),
            pattern: `${tracked.highOpLabel}+addi`,
            accessKind: "address_materialization",
            accessWidthBytes: null,
            synthesizedAddress: addr,
          });
          states.set(rd, {
            baseValue: addr,
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: `${tracked.highMnemonic}; ${lowMnemonic}`,
            highOpLabel: `${tracked.highOpLabel}+addi`,
            age: 0,
          });
        } else if (rd !== 0) {
          states.delete(rd);
        }
      } else if (opcode === 0x03) {
        const loadNames: Record<number, readonly [string, number]> = {
          0: ["lb", 1],
          1: ["lh", 2],
          2: ["lw", 4],
          3: ["ld", 8],
          4: ["lbu", 1],
          5: ["lhu", 2],
          6: ["lwu", 4],
        };
        const spec = loadNames[funct3];
        const simm12 = signExtend(BigInt((word >>> 20) & 0xfff), 12);
        const tracked = states.get(rs1);
        if (
          spec !== undefined &&
          (spec[1] < 8 || is64) &&
          tracked !== undefined
        ) {
          const addr = wrapArch(tracked.baseValue + simm12, is64);
          candidates.push({
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: tracked.highMnemonic,
            lowFileOffset: scanOffset + pos,
            lowAddress: pc,
            lowMnemonic: `${spec[0]} ${riscvReg(rd)}, ${String(simm12)}(${riscvReg(rs1)})`,
            baseRegister: riscvReg(rs1),
            pattern: `${tracked.highOpLabel}+${spec[0]}`,
            accessKind: "load",
            accessWidthBytes: spec[1],
            synthesizedAddress: addr,
          });
        }
        if (rd !== 0) states.delete(rd);
      } else if (opcode === 0x23) {
        const storeNames: Record<number, readonly [string, number]> = {
          0: ["sb", 1],
          1: ["sh", 2],
          2: ["sw", 4],
          3: ["sd", 8],
        };
        const spec = storeNames[funct3];
        const rs2 = (word >>> 20) & 0x1f;
        const imm = (((word >>> 25) & 0x7f) << 5) | ((word >>> 7) & 0x1f);
        const simm12 = signExtend(BigInt(imm), 12);
        const tracked = states.get(rs1);
        if (
          spec !== undefined &&
          (spec[1] < 8 || is64) &&
          tracked !== undefined
        ) {
          const addr = wrapArch(tracked.baseValue + simm12, is64);
          candidates.push({
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: tracked.highMnemonic,
            lowFileOffset: scanOffset + pos,
            lowAddress: pc,
            lowMnemonic: `${spec[0]} ${riscvReg(rs2)}, ${String(simm12)}(${riscvReg(rs1)})`,
            baseRegister: riscvReg(rs1),
            pattern: `${tracked.highOpLabel}+${spec[0]}`,
            accessKind: "store",
            accessWidthBytes: spec[1],
            synthesizedAddress: addr,
          });
        }
      } else if (opcode === 0x63 || opcode === 0x67 || opcode === 0x6f) {
        states.clear();
      } else if (rd !== 0) {
        states.delete(rd);
      }
      pos += 4;
      continue;
    }

    // 16-bit RVC compressed instruction
    decodedInstructions += 1;
    ageStates(states, maxWindow);
    const quad = half & 0x3;
    const funct3 = (half >>> 13) & 0x7;
    if (quad === 0x1 && funct3 === 0x3) {
      const rd = (half >>> 7) & 0x1f;
      if (rd !== 0 && rd !== 2) {
        const nzimm = (((half >>> 12) & 0x1) << 5) | ((half >>> 2) & 0x1f);
        if (nzimm !== 0) {
          const shifted = signExtend(BigInt(nzimm) << 12n, 18);
          states.set(rd, {
            baseValue: wrapArch(shifted, is64),
            highFileOffset: scanOffset + pos,
            highAddress: pc,
            highMnemonic: `c.lui ${riscvReg(rd)}, 0x${(nzimm & 0x3f).toString(16)}`,
            highOpLabel: "c.lui",
            age: 0,
          });
        }
      }
    } else if (quad === 0x0 && (funct3 === 0x2 || funct3 === 0x6)) {
      // C.LW / C.SW
      const rs1 = 8 + ((half >>> 7) & 0x7);
      const rData = 8 + ((half >>> 2) & 0x7);
      const uimm =
        (((half >>> 5) & 0x1) << 6) |
        (((half >>> 10) & 0x7) << 3) |
        (((half >>> 6) & 0x1) << 2);
      const tracked = states.get(rs1);
      const isLoad = funct3 === 0x2;
      if (tracked !== undefined) {
        const addr = wrapArch(tracked.baseValue + BigInt(uimm), is64);
        const mnem = isLoad ? "c.lw" : "c.sw";
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: `${mnem} ${riscvReg(rData)}, ${String(uimm)}(${riscvReg(rs1)})`,
          baseRegister: riscvReg(rs1),
          pattern: `${tracked.highOpLabel}+${mnem}`,
          accessKind: isLoad ? "load" : "store",
          accessWidthBytes: 4,
          synthesizedAddress: addr,
        });
      }
      if (isLoad) states.delete(rData);
    } else if (
      (quad === 0x1 && funct3 >= 0x5) ||
      (quad === 0x1 && !is64 && funct3 === 0x1) ||
      (quad === 0x2 &&
        funct3 === 0x4 &&
        ((half >>> 2) & 0x1f) === 0 &&
        ((half >>> 7) & 0x1f) !== 0)
    ) {
      states.clear();
    } else if (quad === 0x1 && (funct3 === 0x0 || funct3 === 0x2)) {
      const rd = (half >>> 7) & 0x1f;
      if (funct3 === 0x0 && rd !== 0) {
        const nzimm = (((half >>> 12) & 0x1) << 5) | ((half >>> 2) & 0x1f);
        const simm6 = signExtend(BigInt(nzimm), 6);
        const tracked = states.get(rd);
        if (tracked !== undefined && simm6 !== 0n) {
          const addr = wrapArch(tracked.baseValue + simm6, is64);
          const lowMnemonic = `c.addi ${riscvReg(rd)}, ${String(simm6)}`;
          candidates.push({
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: tracked.highMnemonic,
            lowFileOffset: scanOffset + pos,
            lowAddress: pc,
            lowMnemonic,
            baseRegister: riscvReg(rd),
            pattern: `${tracked.highOpLabel}+c.addi`,
            accessKind: "address_materialization",
            accessWidthBytes: null,
            synthesizedAddress: addr,
          });
          states.set(rd, {
            baseValue: addr,
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: `${tracked.highMnemonic}; ${lowMnemonic}`,
            highOpLabel: `${tracked.highOpLabel}+c.addi`,
            age: 0,
          });
        }
      } else if (rd !== 0) {
        states.delete(rd);
      }
    }
    pos += 2;
  }

  return {
    candidates,
    decodedInstructions,
    consumedBytes: pos,
    stoppedByAddressEnd,
  };
};

const MIPS_REG_NAMES = [
  "zero",
  "at",
  "v0",
  "v1",
  "a0",
  "a1",
  "a2",
  "a3",
  "t0",
  "t1",
  "t2",
  "t3",
  "t4",
  "t5",
  "t6",
  "t7",
  "s0",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "t8",
  "t9",
  "k0",
  "k1",
  "gp",
  "sp",
  "fp",
  "ra",
] as const;

const mipsReg = (r: number): string => `$${MIPS_REG_NAMES[r] ?? String(r)}`;

const decodeMips32Stream = (options: {
  readonly bytes: Buffer;
  readonly scanOffset: number;
  readonly scanStartAddress: bigint;
  readonly littleEndian: boolean;
  readonly maxWindow: number;
}): DisassembledStreamResult => {
  const { bytes, scanOffset, scanStartAddress, littleEndian, maxWindow } =
    options;
  const states = new Map<number, TrackedHighState>();
  const candidates: RawSynthesizedCandidate[] = [];
  // not-an-allowance: instruction counter over bounded scan slice
  let decodedInstructions = 0;
  // not-an-allowance: byte cursor over bounded scan slice
  let pos = 0;
  let stoppedByAddressEnd = false;
  let clearAfterDelaySlot = false;

  while (pos + 4 <= bytes.length) {
    const pc = scanStartAddress + BigInt(pos);
    if (pc > MASK_32 - 3n) {
      stoppedByAddressEnd = true;
      break;
    }
    const word = readUint32At(bytes, pos, littleEndian);
    decodedInstructions += 1;
    ageStates(states, maxWindow);
    const delayReset = clearAfterDelaySlot;
    clearAfterDelaySlot = false;

    const op = (word >>> 26) & 0x3f;
    const rs = (word >>> 21) & 0x1f;
    const rt = (word >>> 16) & 0x1f;
    const rd = (word >>> 11) & 0x1f;
    const uimm16 = word & 0xffff;
    const simm16 = signExtend(BigInt(uimm16), 16);

    if (op === 0x0f && rs === 0) {
      if (rt !== 0) {
        const baseVal = (BigInt(uimm16) << 16n) & MASK_32;
        states.set(rt, {
          baseValue: baseVal,
          highFileOffset: scanOffset + pos,
          highAddress: pc,
          highMnemonic: `lui ${mipsReg(rt)}, 0x${uimm16.toString(16)}`,
          highOpLabel: "lui",
          age: 0,
        });
      }
    } else if (op === 0x0d || op === 0x09) {
      const tracked = states.get(rs);
      const isOri = op === 0x0d;
      const delta = isOri ? BigInt(uimm16) : simm16;
      if (tracked !== undefined && delta !== 0n && rt !== 0) {
        const addr = isOri
          ? (tracked.baseValue | BigInt(uimm16)) & MASK_32
          : (tracked.baseValue + simm16) & MASK_32;
        const mnem = isOri
          ? `ori ${mipsReg(rt)}, ${mipsReg(rs)}, 0x${uimm16.toString(16)}`
          : `addiu ${mipsReg(rt)}, ${mipsReg(rs)}, ${String(simm16)}`;
        const opName = isOri ? "ori" : "addiu";
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: mnem,
          baseRegister: mipsReg(rs),
          pattern: `${tracked.highOpLabel}+${opName}`,
          accessKind: "address_materialization",
          accessWidthBytes: null,
          synthesizedAddress: addr,
        });
        states.set(rt, {
          baseValue: addr,
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: `${tracked.highMnemonic}; ${mnem}`,
          highOpLabel: `${tracked.highOpLabel}+${opName}`,
          age: 0,
        });
      } else if (rt !== 0) {
        states.delete(rt);
      }
    } else if (
      op === 0x20 ||
      op === 0x21 ||
      op === 0x23 ||
      op === 0x24 ||
      op === 0x25 ||
      op === 0x28 ||
      op === 0x29 ||
      op === 0x2b
    ) {
      const memSpec: Record<number, readonly [string, MmioAccessKind, number]> =
        {
          0x20: ["lb", "load", 1],
          0x21: ["lh", "load", 2],
          0x23: ["lw", "load", 4],
          0x24: ["lbu", "load", 1],
          0x25: ["lhu", "load", 2],
          0x28: ["sb", "store", 1],
          0x29: ["sh", "store", 2],
          0x2b: ["sw", "store", 4],
        };
      const spec = memSpec[op]!;
      const tracked = states.get(rs);
      if (tracked !== undefined) {
        const addr = (tracked.baseValue + simm16) & MASK_32;
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: `${spec[0]} ${mipsReg(rt)}, ${String(simm16)}(${mipsReg(rs)})`,
          baseRegister: mipsReg(rs),
          pattern: `${tracked.highOpLabel}+${spec[0]}`,
          accessKind: spec[1],
          accessWidthBytes: spec[2],
          synthesizedAddress: addr,
        });
      }
      if (spec[1] === "load" && rt !== 0) states.delete(rt);
    } else if (op === 0x00) {
      const funct = word & 0x3f;
      if (funct === 0x08 || funct === 0x09) {
        clearAfterDelaySlot = true;
        if (funct === 0x09 && rd !== 0) states.delete(rd);
      } else if (word !== 0 && rd !== 0) {
        states.delete(rd);
      }
    } else if (op >= 0x01 && op <= 0x07) {
      clearAfterDelaySlot = true;
      if (op === 0x03) states.delete(31);
    } else if (rt !== 0) {
      states.delete(rt);
    }

    if (delayReset) states.clear();
    pos += 4;
  }

  return {
    candidates,
    decodedInstructions,
    consumedBytes: pos,
    stoppedByAddressEnd,
  };
};

const ppcReg = (r: number): string => `r${String(r)}`;

const decodePpc32Stream = (options: {
  readonly bytes: Buffer;
  readonly scanOffset: number;
  readonly scanStartAddress: bigint;
  readonly maxWindow: number;
}): DisassembledStreamResult => {
  const { bytes, scanOffset, scanStartAddress, maxWindow } = options;
  const states = new Map<number, TrackedHighState>();
  const candidates: RawSynthesizedCandidate[] = [];
  // not-an-allowance: instruction counter over bounded scan slice
  let decodedInstructions = 0;
  // not-an-allowance: byte cursor over bounded scan slice
  let pos = 0;
  let stoppedByAddressEnd = false;

  while (pos + 4 <= bytes.length) {
    const pc = scanStartAddress + BigInt(pos);
    if (pc > MASK_32 - 3n) {
      stoppedByAddressEnd = true;
      break;
    }
    const word = readUint32At(bytes, pos, false);
    decodedInstructions += 1;
    ageStates(states, maxWindow);

    const op = (word >>> 26) & 0x3f;
    const rD = (word >>> 21) & 0x1f;
    const rA = (word >>> 16) & 0x1f;
    const uimm16 = word & 0xffff;
    const simm16 = signExtend(BigInt(uimm16), 16);

    if (op === 15 && rA === 0) {
      if (rD !== 0) {
        states.set(rD, {
          baseValue: (BigInt(uimm16) << 16n) & MASK_32,
          highFileOffset: scanOffset + pos,
          highAddress: pc,
          highMnemonic: `lis ${ppcReg(rD)}, 0x${uimm16.toString(16)}`,
          highOpLabel: "lis",
          age: 0,
        });
      }
    } else if (op === 24) {
      // ORI rA_dst, rS_src, uimm16 (rD field holds rS_src; rA field holds rA_dst)
      const rS = rD;
      const rDst = rA;
      const tracked = states.get(rS);
      if (tracked !== undefined && uimm16 !== 0 && rDst !== 0) {
        const addr = (tracked.baseValue | BigInt(uimm16)) & MASK_32;
        const mnem = `ori ${ppcReg(rDst)}, ${ppcReg(rS)}, 0x${uimm16.toString(16)}`;
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: mnem,
          baseRegister: ppcReg(rS),
          pattern: `${tracked.highOpLabel}+ori`,
          accessKind: "address_materialization",
          accessWidthBytes: null,
          synthesizedAddress: addr,
        });
        states.set(rDst, {
          baseValue: addr,
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: `${tracked.highMnemonic}; ${mnem}`,
          highOpLabel: `${tracked.highOpLabel}+ori`,
          age: 0,
        });
      } else if (rDst !== 0 && !(rDst === rS && uimm16 === 0)) {
        states.delete(rDst);
      }
    } else if (op === 14 && rA !== 0) {
      const tracked = states.get(rA);
      if (tracked !== undefined && simm16 !== 0n && rD !== 0) {
        const addr = (tracked.baseValue + simm16) & MASK_32;
        const mnem = `addi ${ppcReg(rD)}, ${ppcReg(rA)}, ${String(simm16)}`;
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: mnem,
          baseRegister: ppcReg(rA),
          pattern: `${tracked.highOpLabel}+addi`,
          accessKind: "address_materialization",
          accessWidthBytes: null,
          synthesizedAddress: addr,
        });
        states.set(rD, {
          baseValue: addr,
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: `${tracked.highMnemonic}; ${mnem}`,
          highOpLabel: `${tracked.highOpLabel}+addi`,
          age: 0,
        });
      } else if (rD !== 0) {
        states.delete(rD);
      }
    } else if (op >= 32 && op <= 45) {
      const ppcMem: Record<
        number,
        readonly [string, MmioAccessKind, number] | undefined
      > = {
        32: ["lwz", "load", 4],
        33: ["lwzu", "load", 4],
        34: ["lbz", "load", 1],
        35: ["lbzu", "load", 1],
        36: ["stw", "store", 4],
        37: ["stwu", "store", 4],
        38: ["stb", "store", 1],
        39: ["stbu", "store", 1],
        40: ["lhz", "load", 2],
        41: ["lhzu", "load", 2],
        42: ["lha", "load", 2],
        44: ["sth", "store", 2],
        45: ["sthu", "store", 2],
      };
      const spec = ppcMem[op];
      if (spec !== undefined && rA !== 0) {
        const tracked = states.get(rA);
        if (tracked !== undefined) {
          const addr = (tracked.baseValue + simm16) & MASK_32;
          candidates.push({
            highFileOffset: tracked.highFileOffset,
            highAddress: tracked.highAddress,
            highMnemonic: tracked.highMnemonic,
            lowFileOffset: scanOffset + pos,
            lowAddress: pc,
            lowMnemonic: `${spec[0]} ${ppcReg(rD)}, ${String(simm16)}(${ppcReg(rA)})`,
            baseRegister: ppcReg(rA),
            pattern: `${tracked.highOpLabel}+${spec[0]}`,
            accessKind: spec[1],
            accessWidthBytes: spec[2],
            synthesizedAddress: addr,
          });
        }
      }
      if (spec?.[1] === "load" && rD !== 0) states.delete(rD);
    } else if (op === 16 || op === 18 || op === 19) {
      states.clear();
    } else if (rD !== 0) {
      states.delete(rD);
    }

    pos += 4;
  }

  return {
    candidates,
    decodedInstructions,
    consumedBytes: pos,
    stoppedByAddressEnd,
  };
};

const arm64XReg = (r: number): string => (r === 31 ? "xzr" : `x${String(r)}`);

const decodeArm64Stream = (options: {
  readonly bytes: Buffer;
  readonly scanOffset: number;
  readonly scanStartAddress: bigint;
  readonly maxWindow: number;
}): DisassembledStreamResult => {
  const { bytes, scanOffset, scanStartAddress, maxWindow } = options;
  const states = new Map<number, TrackedHighState>();
  const candidates: RawSynthesizedCandidate[] = [];
  // not-an-allowance: instruction counter over bounded scan slice
  let decodedInstructions = 0;
  // not-an-allowance: byte cursor over bounded scan slice
  let pos = 0;
  let stoppedByAddressEnd = false;

  while (pos + 4 <= bytes.length) {
    const pc = scanStartAddress + BigInt(pos);
    if (pc > MASK_64 - 3n) {
      stoppedByAddressEnd = true;
      break;
    }
    const word = readUint32At(bytes, pos, true);
    decodedInstructions += 1;
    ageStates(states, maxWindow);

    if ((word & 0x9f00_0000) >>> 0 === 0x9000_0000) {
      const rd = word & 0x1f;
      if (rd !== 31) {
        const immlo = (word >>> 29) & 0x3;
        const immhi = (word >>> 5) & 0x7ffff;
        const imm21 = signExtend(BigInt((immhi << 2) | immlo), 21);
        const page = ((pc & ~0xfffn) + (imm21 << 12n)) & MASK_64;
        states.set(rd, {
          baseValue: page,
          highFileOffset: scanOffset + pos,
          highAddress: pc,
          highMnemonic: `adrp ${arm64XReg(rd)}, ${formatHexAddress(page)}`,
          highOpLabel: "adrp",
          age: 0,
        });
      }
    } else if ((word & 0xff80_0000) >>> 0 === 0x9100_0000) {
      // ADD Xd, Xn, #imm12{, LSL #12}
      const rd = word & 0x1f;
      const rn = (word >>> 5) & 0x1f;
      const imm12 = (word >>> 10) & 0xfff;
      const sh = (word >>> 22) & 0x1;
      const delta = BigInt(imm12) << (sh === 1 ? 12n : 0n);
      const tracked = rn !== 31 ? states.get(rn) : undefined;
      if (tracked !== undefined && delta !== 0n && rd !== 31) {
        const addr = (tracked.baseValue + delta) & MASK_64;
        const mnem =
          sh === 1
            ? `add ${arm64XReg(rd)}, ${arm64XReg(rn)}, #0x${imm12.toString(16)}, lsl #12`
            : `add ${arm64XReg(rd)}, ${arm64XReg(rn)}, #0x${imm12.toString(16)}`;
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: mnem,
          baseRegister: arm64XReg(rn),
          pattern: `${tracked.highOpLabel}+add`,
          accessKind: "address_materialization",
          accessWidthBytes: null,
          synthesizedAddress: addr,
        });
        states.set(rd, {
          baseValue: addr,
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: `${tracked.highMnemonic}; ${mnem}`,
          highOpLabel: `${tracked.highOpLabel}+add`,
          age: 0,
        });
      } else if (rd !== 31) {
        states.delete(rd);
      }
    } else if (
      (word & 0x3b00_0000) >>> 0 === 0x3900_0000 &&
      (word & 0x0400_0000) === 0
    ) {
      // Unsigned-offset integer LDR/STR/LDRB/STRB/LDRH/STRH
      const sizeBits = (word >>> 30) & 0x3;
      const opc = (word >>> 22) & 0x3;
      const imm12 = (word >>> 10) & 0xfff;
      const rn = (word >>> 5) & 0x1f;
      const rt = word & 0x1f;
      const widthBytes = 1 << sizeBits;
      const byteOffset = BigInt(imm12) * BigInt(widthBytes);
      const isStore = opc === 0;
      const tracked = rn !== 31 ? states.get(rn) : undefined;
      if (tracked !== undefined && !(sizeBits === 3 && opc >= 2)) {
        const mnemBase = isStore
          ? sizeBits === 0
            ? "strb"
            : sizeBits === 1
              ? "strh"
              : "str"
          : sizeBits === 0
            ? opc >= 2
              ? "ldrsb"
              : "ldrb"
            : sizeBits === 1
              ? opc >= 2
                ? "ldrsh"
                : "ldrh"
              : opc === 2
                ? "ldrsw"
                : "ldr";
        const regLabel =
          sizeBits === 3 || (!isStore && opc === 2)
            ? rt === 31
              ? "xzr"
              : `x${String(rt)}`
            : rt === 31
              ? "wzr"
              : `w${String(rt)}`;
        const addr = (tracked.baseValue + byteOffset) & MASK_64;
        candidates.push({
          highFileOffset: tracked.highFileOffset,
          highAddress: tracked.highAddress,
          highMnemonic: tracked.highMnemonic,
          lowFileOffset: scanOffset + pos,
          lowAddress: pc,
          lowMnemonic: `${mnemBase} ${regLabel}, [${arm64XReg(rn)}, #0x${byteOffset.toString(16)}]`,
          baseRegister: arm64XReg(rn),
          pattern: `${tracked.highOpLabel}+${mnemBase}`,
          accessKind: isStore ? "store" : "load",
          accessWidthBytes: widthBytes,
          synthesizedAddress: addr,
        });
      }
      if (!isStore && rt !== 31) states.delete(rt);
    } else if (
      (word & 0x7c00_0000) >>> 0 === 0x1400_0000 ||
      (word & 0xff00_0000) >>> 0 === 0x5400_0000 ||
      (word & 0x7e00_0000) >>> 0 === 0x3400_0000 ||
      (word & 0xfe00_0000) >>> 0 === 0xd600_0000
    ) {
      states.clear();
    } else {
      const rd = word & 0x1f;
      if (rd !== 31) states.delete(rd);
    }

    pos += 4;
  }

  return {
    candidates,
    decodedInstructions,
    consumedBytes: pos,
    stoppedByAddressEnd,
  };
};

/** Disassemble split-immediate high/low register pairs for the selected `architecture`. */
export const disassembleSplitImmediateStream = (options: {
  readonly architecture: FirmwareMmioArchitecture;
  readonly bytes: Buffer;
  readonly scanOffset: number;
  readonly scanStartAddress: bigint;
  readonly maxWindowInstructions: number;
}): DisassembledStreamResult => {
  const {
    architecture,
    bytes,
    scanOffset,
    scanStartAddress,
    maxWindowInstructions,
  } = options;
  if (architecture === "riscv32" || architecture === "riscv64") {
    return decodeRiscvStream({
      bytes,
      scanOffset,
      scanStartAddress,
      is64: architecture === "riscv64",
      maxWindow: maxWindowInstructions,
    });
  }
  if (architecture === "mips32le" || architecture === "mips32be") {
    return decodeMips32Stream({
      bytes,
      scanOffset,
      scanStartAddress,
      littleEndian: architecture === "mips32le",
      maxWindow: maxWindowInstructions,
    });
  }
  if (architecture === "ppc32be") {
    return decodePpc32Stream({
      bytes,
      scanOffset,
      scanStartAddress,
      maxWindow: maxWindowInstructions,
    });
  }
  return decodeArm64Stream({
    bytes,
    scanOffset,
    scanStartAddress,
    maxWindow: maxWindowInstructions,
  });
};
