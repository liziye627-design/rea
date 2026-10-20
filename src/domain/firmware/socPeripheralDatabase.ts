import { z } from "zod";
import type {
  InternalPeripheralEntry,
  PeripheralBusKind,
} from "./platforms/types.js";
import { STM32F1_PERIPHERALS } from "./platforms/stm32f1.js";
import { STM32F4_PERIPHERALS } from "./platforms/stm32f4.js";
import { GD32F1_PERIPHERALS } from "./platforms/gd32f1.js";
import { ESP32_PERIPHERALS } from "./platforms/esp32.js";
import { RP2040_PERIPHERALS } from "./platforms/rp2040.js";
import { NRF52_PERIPHERALS } from "./platforms/nrf52.js";

/** Supported microcontroller and SoC platform families. */
export const SOC_PLATFORMS = [
  "stm32f1",
  "stm32f4",
  "gd32f1",
  "esp32",
  "rp2040",
  "nrf52",
] as const;
export type SocPlatform = (typeof SOC_PLATFORMS)[number];
export const socPlatformSchema = z.enum(SOC_PLATFORMS);

export type { PeripheralBusKind } from "./platforms/types.js";

/** Standard peripheral bus interconnect schema. */
export const peripheralBusKindSchema = z.enum([
  "APB",
  "APB1",
  "APB2",
  "AHB",
  "AHB1",
  "AHB2",
  "DPort",
  "RTC",
  "SIO",
  "System",
]);

/** Definition for a known SoC peripheral controller block. */
export interface SocPeripheralDefinition {
  readonly platform: SocPlatform;
  readonly name: string;
  readonly baseAddress: string;
  readonly baseAddressValue: bigint;
  readonly sizeBytes: number;
  readonly bus: PeripheralBusKind;
  readonly description: string;
}

export const socPeripheralDefinitionSchema = z.strictObject({
  platform: socPlatformSchema,
  name: z.string(),
  baseAddress: z.string(),
  baseAddressValue: z.bigint(),
  sizeBytes: z.number().int().positive(),
  bus: peripheralBusKindSchema,
  description: z.string(),
});

const PLATFORM_PERIPHERALS: Record<
  SocPlatform,
  readonly InternalPeripheralEntry[]
> = {
  stm32f1: STM32F1_PERIPHERALS,
  stm32f4: STM32F4_PERIPHERALS,
  gd32f1: GD32F1_PERIPHERALS,
  esp32: ESP32_PERIPHERALS,
  rp2040: RP2040_PERIPHERALS,
  nrf52: NRF52_PERIPHERALS,
};

const HEX_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,16}$/u;

/**
 * Resolve an address to a known SoC peripheral controller block on a given platform.
 * Returns null if the address does not match any peripheral block in the platform dictionary.
 */
export const lookupSocPeripheral = (
  rawAddress: string | bigint,
  platform: SocPlatform,
): SocPeripheralDefinition | null => {
  let addressBigInt: bigint;
  if (typeof rawAddress === "bigint") {
    addressBigInt = rawAddress;
  } else if (
    typeof rawAddress === "string" &&
    HEX_ADDRESS_PATTERN.test(rawAddress)
  ) {
    try {
      addressBigInt = BigInt(rawAddress);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const entries = PLATFORM_PERIPHERALS[platform];
  if (!entries || entries.length === 0) return null;

  for (const item of entries) {
    if (
      addressBigInt >= item.base &&
      addressBigInt < item.base + BigInt(item.size)
    ) {
      return {
        platform,
        name: item.name,
        baseAddress: `0x${item.base.toString(16)}`,
        baseAddressValue: item.base,
        sizeBytes: item.size,
        bus: item.bus,
        description: item.description,
      };
    }
  }

  return null;
};

/** Candidate SoC platform matching evaluation. */
export interface SocPlatformMatchCandidate {
  readonly platform: SocPlatform;
  readonly matchedCount: number;
  readonly totalAddresses: number;
  readonly confidence: number; // 0.0 to 1.0
  readonly matchedPeripherals: readonly string[];
}

/**
 * Automatically detect candidate SoC platforms given a list of observed MMIO addresses.
 * Useful when inspecting raw firmware where the specific MCU is unconfirmed.
 */
export const detectSocPlatform = (
  addresses: readonly string[],
): readonly SocPlatformMatchCandidate[] => {
  if (addresses.length === 0) return [];

  const candidates: SocPlatformMatchCandidate[] = [];

  for (const platform of SOC_PLATFORMS) {
    const matchedNames = new Set<string>();
    let matchedCount = 0;

    for (const addr of addresses) {
      const match = lookupSocPeripheral(addr, platform);
      if (match !== null) {
        matchedCount += 1;
        matchedNames.add(match.name);
      }
    }

    if (matchedCount > 0) {
      candidates.push({
        platform,
        matchedCount,
        totalAddresses: addresses.length,
        confidence: Number((matchedCount / addresses.length).toFixed(3)),
        matchedPeripherals: Array.from(matchedNames).sort(),
      });
    }
  }

  return candidates.sort((a, b) => b.matchedCount - a.matchedCount);
};
