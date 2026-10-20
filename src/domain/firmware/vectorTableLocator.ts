import { z } from "zod";
import {
  type ArmVectorTable,
  armVectorTableSchema,
  parseArmVectorTable,
} from "./armVectorTable.js";
import {
  type SocPlatform,
  socPlatformSchema,
} from "./socPeripheralDatabase.js";

/** Evaluation criteria result for an ARM Cortex-M vector table candidate. */
export interface LocatedVectorTable {
  readonly fileOffset: number;
  readonly fileOffsetHex: string;
  readonly baseAddress: string;
  readonly baseAddressValue: bigint;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly table: ArmVectorTable;
}

export const locatedVectorTableSchema = z.strictObject({
  fileOffset: z.number().int().nonnegative(),
  fileOffsetHex: z.string(),
  baseAddress: z.string(),
  baseAddressValue: z.bigint(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  table: armVectorTableSchema,
});

/** Search and ranking options for locating vector tables in raw firmware. */
export interface VectorTableLocatorOptions {
  readonly candidateBaseAddresses?: readonly bigint[];
  readonly platform?: SocPlatform | null;
  readonly minConfidence?: number;
  readonly maxResults?: number;
  readonly stepAlignment?: number;
}

export const vectorTableLocatorOptionsSchema = z.strictObject({
  candidateBaseAddresses: z.array(z.bigint()).optional(),
  platform: socPlatformSchema.nullable().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  maxResults: z.number().int().positive().optional(),
  stepAlignment: z.number().int().positive().optional(),
});

const DEFAULT_BASE_ADDRESSES: readonly bigint[] = [
  0x08000000n, // STM32 / GD32 Flash base
  0x10000000n, // Raspberry Pi RP2040 XIP Flash base
  0x00000000n, // Nordic nRF52 / Aliased Boot Flash base
  0x20000000n, // SRAM execution base
];

const readWordLe = (data: Uint8Array, offset: number): bigint => {
  const b0 = BigInt(data[offset] ?? 0);
  const b1 = BigInt(data[offset + 1] ?? 0);
  const b2 = BigInt(data[offset + 2] ?? 0);
  const b3 = BigInt(data[offset + 3] ?? 0);
  return b0 | (b1 << 8n) | (b2 << 16n) | (b3 << 24n);
};

const formatHex = (val: bigint): string => `0x${val.toString(16)}`;

const isLikelySram = (addr: bigint): boolean => {
  if (addr % 4n !== 0n) return false;
  // Standard Cortex-M SRAM (0x20000000..0x20080000)
  if (addr >= 0x20000000n && addr <= 0x20080000n) return true;
  // STM32 CCM SRAM (0x10000000..0x10010000)
  if (addr >= 0x10000000n && addr <= 0x10010000n) return true;
  // High-performance AXI SRAM (0x24000000..0x24080000)
  if (addr >= 0x24000000n && addr <= 0x24080000n) return true;
  return false;
};

const isThumbPointer = (addr: bigint): boolean => {
  return addr > 0n && addr % 2n === 1n;
};

interface CandidateScore {
  readonly confidence: number;
  readonly reasons: string[];
}

const scoreVectorTableCandidate = (
  data: Uint8Array,
  offset: number,
  baseAddress: bigint,
): CandidateScore | null => {
  if (offset + 64 > data.length) return null;

  const sp = readWordLe(data, offset);
  if (!isLikelySram(sp)) return null;

  const reset = readWordLe(data, offset + 4);
  if (!isThumbPointer(reset)) return null;

  const resetExec = reset & ~1n;
  const imageStart = baseAddress + BigInt(offset);
  const imageEnd = baseAddress + BigInt(data.length);

  // Reset handler should fall within the bounds of this firmware image
  if (resetExec < imageStart || resetExec >= imageEnd) {
    return null;
  }

  const reasons: string[] = [
    "Valid SRAM Initial_SP",
    "Valid Thumb Reset_Handler within binary",
  ];
  let score = 0.5;

  // Check HardFault handler (index 3, offset 12)
  const hardFault = readWordLe(data, offset + 12);
  if (isThumbPointer(hardFault)) {
    const hfExec = hardFault & ~1n;
    if (hfExec >= imageStart && hfExec < imageEnd) {
      score += 0.15;
      reasons.push("Valid Thumb HardFault_Handler within binary");
    }
  }

  // Check NMI handler (index 2, offset 8)
  const nmi = readWordLe(data, offset + 8);
  if (isThumbPointer(nmi)) {
    score += 0.05;
    reasons.push("Valid Thumb NMI_Handler");
  }

  // Check Reserved words 7-10 (offsets 28, 32, 36, 40)
  const w7 = readWordLe(data, offset + 28);
  const w8 = readWordLe(data, offset + 32);
  const w9 = readWordLe(data, offset + 36);
  const w10 = readWordLe(data, offset + 40);
  if (w7 === 0n && w8 === 0n && w9 === 0n && w10 === 0n) {
    score += 0.15;
    reasons.push("Architectural reserved exception vectors 7-10 are zero");
  }

  // Check exception vectors 11..15 (SVCall, PendSV, SysTick)
  const svCall = readWordLe(data, offset + 44);
  const pendSv = readWordLe(data, offset + 56);
  const sysTick = readWordLe(data, offset + 60);
  let coreExceptionCount = 0;
  if (isThumbPointer(svCall)) coreExceptionCount++;
  if (isThumbPointer(pendSv)) coreExceptionCount++;
  if (isThumbPointer(sysTick)) coreExceptionCount++;

  if (coreExceptionCount >= 2) {
    score += 0.15;
    reasons.push(`Core system exceptions resolved (${coreExceptionCount}/3)`);
  }

  return {
    confidence: Math.min(score, 1.0),
    reasons,
  };
};

/**
 * Automatically locate, evaluate, and rank ARM Cortex-M Vector Tables within raw firmware binaries.
 *
 * Scans candidate offsets (aligned to stepAlignment, typically 256 or 512 bytes) and evaluates architectural
 * invariants: Initial SP, Thumb mode bit 0 on Reset/HardFault, null reserved slots, and image boundaries.
 */
export const locateArmVectorTables = (
  data: Uint8Array,
  options?: VectorTableLocatorOptions,
): readonly LocatedVectorTable[] => {
  const candidateBases =
    options?.candidateBaseAddresses ?? DEFAULT_BASE_ADDRESSES;
  const platform = options?.platform ?? null;
  const minConfidence = options?.minConfidence ?? 0.7;
  const maxResults = options?.maxResults ?? 5;
  const stepAlignment = options?.stepAlignment ?? 256;

  const results: LocatedVectorTable[] = [];

  for (let offset = 0; offset + 64 <= data.length; offset += stepAlignment) {
    for (const base of candidateBases) {
      const evaluation = scoreVectorTableCandidate(data, offset, base);
      if (evaluation === null || evaluation.confidence < minConfidence) {
        continue;
      }

      const slice = data.subarray(offset);
      const parsed = parseArmVectorTable(
        slice,
        base + BigInt(offset),
        platform,
      );
      if (parsed.ok) {
        results.push({
          fileOffset: offset,
          fileOffsetHex: `0x${offset.toString(16)}`,
          baseAddress: formatHex(base + BigInt(offset)),
          baseAddressValue: base + BigInt(offset),
          confidence: evaluation.confidence,
          reasons: evaluation.reasons,
          table: parsed.value,
        });
      }
    }
  }

  // Sort descending by confidence, then ascending by fileOffset
  results.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.fileOffset - b.fileOffset;
  });

  return results.slice(0, maxResults);
};
