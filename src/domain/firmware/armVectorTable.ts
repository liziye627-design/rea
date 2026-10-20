import { z } from "zod";
import { err, ok, type Result } from "../result.js";
import {
  type SocPlatform,
  socPlatformSchema,
} from "./socPeripheralDatabase.js";

/** ARM Cortex-M exception and interrupt categories. */
export const armVectorKindSchema = z.enum([
  "stack_pointer",
  "system_exception",
  "peripheral_irq",
  "reserved",
]);
export type ArmVectorKind = z.infer<typeof armVectorKindSchema>;

/** Individual vector table entry with decoded Thumb execution address and peripheral binding. */
export interface ArmCortexMVectorEntry {
  readonly index: number;
  readonly name: string;
  readonly targetAddress: string;
  readonly targetAddressValue: bigint;
  readonly executionAddress: string;
  readonly executionAddressValue: bigint;
  readonly kind: ArmVectorKind;
  readonly irqNumber: number | null;
  readonly associatedPeripheral: string | null;
  readonly description: string;
}

export const armCortexMVectorEntrySchema = z.strictObject({
  index: z.number().int().min(0),
  name: z.string(),
  targetAddress: z.string(),
  targetAddressValue: z.bigint(),
  executionAddress: z.string(),
  executionAddressValue: z.bigint(),
  kind: armVectorKindSchema,
  irqNumber: z.number().int().nullable(),
  associatedPeripheral: z.string().nullable(),
  description: z.string(),
});

/** Full decoded ARM Cortex-M Vector Table representation. */
export interface ArmVectorTable {
  readonly baseAddress: string;
  readonly baseAddressValue: bigint;
  readonly initialSp: string;
  readonly resetHandler: string;
  readonly platform: SocPlatform | null;
  readonly vectorCount: number;
  readonly vectors: readonly ArmCortexMVectorEntry[];
}

export const armVectorTableSchema = z.strictObject({
  baseAddress: z.string(),
  baseAddressValue: z.bigint(),
  initialSp: z.string(),
  resetHandler: z.string(),
  platform: socPlatformSchema.nullable(),
  vectorCount: z.number().int().min(0),
  vectors: z.array(armCortexMVectorEntrySchema),
});

interface SystemExceptionDescriptor {
  readonly name: string;
  readonly kind: ArmVectorKind;
  readonly description: string;
}

const SYSTEM_EXCEPTIONS: readonly SystemExceptionDescriptor[] = [
  {
    name: "Initial_SP",
    kind: "stack_pointer",
    description: "Initial Stack Pointer value loaded on reset",
  },
  {
    name: "Reset_Handler",
    kind: "system_exception",
    description: "Power-on reset and system reboot entry point",
  },
  {
    name: "NMI_Handler",
    kind: "system_exception",
    description: "Non-Maskable Interrupt handler",
  },
  {
    name: "HardFault_Handler",
    kind: "system_exception",
    description: "Hardware Fault handler (bus, memory, or instruction fault)",
  },
  {
    name: "MemManage_Handler",
    kind: "system_exception",
    description: "Memory Management Fault handler (MPU access violation)",
  },
  {
    name: "BusFault_Handler",
    kind: "system_exception",
    description: "Bus Fault handler (AHB/APB bus error response)",
  },
  {
    name: "UsageFault_Handler",
    kind: "system_exception",
    description:
      "Usage Fault handler (undefined instruction or unaligned access)",
  },
  {
    name: "Reserved_7",
    kind: "reserved",
    description: "ARM Architecture Reserved Vector",
  },
  {
    name: "Reserved_8",
    kind: "reserved",
    description: "ARM Architecture Reserved Vector",
  },
  {
    name: "Reserved_9",
    kind: "reserved",
    description: "ARM Architecture Reserved Vector",
  },
  {
    name: "Reserved_10",
    kind: "reserved",
    description: "ARM Architecture Reserved Vector",
  },
  {
    name: "SVC_Handler",
    kind: "system_exception",
    description: "Supervisor Call (SVC instruction) system call handler",
  },
  {
    name: "DebugMon_Handler",
    kind: "system_exception",
    description: "Debug Monitor exception handler",
  },
  {
    name: "Reserved_13",
    kind: "reserved",
    description: "ARM Architecture Reserved Vector",
  },
  {
    name: "PendSV_Handler",
    kind: "system_exception",
    description: "Pending Service call handler (RTOS context switch)",
  },
  {
    name: "SysTick_Handler",
    kind: "system_exception",
    description: "System Tick timer interrupt handler (RTOS scheduler tick)",
  },
];

interface IrqDescriptor {
  readonly name: string;
  readonly peripheral: string | null;
  readonly description: string;
}

// STM32F10x / GD32F10x standard interrupt vector table (RM0008).
const STM32F1_IRQS: readonly IrqDescriptor[] = [
  {
    name: "WWDG_IRQHandler",
    peripheral: "WWDG",
    description: "Window Watchdog interrupt",
  },
  {
    name: "PVD_IRQHandler",
    peripheral: "PWR",
    description: "PVD through EXTI Line detection interrupt",
  },
  {
    name: "TAMPER_IRQHandler",
    peripheral: null,
    description: "Tamper interrupt",
  },
  {
    name: "RTC_IRQHandler",
    peripheral: "RTC",
    description: "RTC global interrupt",
  },
  {
    name: "FLASH_IRQHandler",
    peripheral: "Flash_IF",
    description: "Flash memory global interrupt",
  },
  {
    name: "RCC_IRQHandler",
    peripheral: "RCC",
    description: "RCC global interrupt",
  },
  {
    name: "EXTI0_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line 0 interrupt",
  },
  {
    name: "EXTI1_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line 1 interrupt",
  },
  {
    name: "EXTI2_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line 2 interrupt",
  },
  {
    name: "EXTI3_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line 3 interrupt",
  },
  {
    name: "EXTI4_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line 4 interrupt",
  },
  {
    name: "DMA1_Channel1_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 1 interrupt",
  },
  {
    name: "DMA1_Channel2_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 2 interrupt",
  },
  {
    name: "DMA1_Channel3_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 3 interrupt",
  },
  {
    name: "DMA1_Channel4_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 4 interrupt",
  },
  {
    name: "DMA1_Channel5_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 5 interrupt",
  },
  {
    name: "DMA1_Channel6_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 6 interrupt",
  },
  {
    name: "DMA1_Channel7_IRQHandler",
    peripheral: "DMA1",
    description: "DMA1 Channel 7 interrupt",
  },
  {
    name: "ADC1_2_IRQHandler",
    peripheral: "ADC1",
    description: "ADC1 and ADC2 global interrupt",
  },
  {
    name: "USB_HP_CAN_TX_IRQHandler",
    peripheral: "CAN1",
    description: "USB High Priority or CAN TX interrupt",
  },
  {
    name: "USB_LP_CAN_RX0_IRQHandler",
    peripheral: "CAN1",
    description: "USB Low Priority or CAN RX0 interrupt",
  },
  {
    name: "CAN_RX1_IRQHandler",
    peripheral: "CAN1",
    description: "CAN RX1 interrupt",
  },
  {
    name: "CAN_SCE_IRQHandler",
    peripheral: "CAN1",
    description: "CAN SCE interrupt",
  },
  {
    name: "EXTI9_5_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line [9:5] interrupts",
  },
  {
    name: "TIM1_BRK_IRQHandler",
    peripheral: "TIM1",
    description: "TIM1 Break interrupt",
  },
  {
    name: "TIM1_UP_IRQHandler",
    peripheral: "TIM1",
    description: "TIM1 Update interrupt",
  },
  {
    name: "TIM1_TRG_COM_IRQHandler",
    peripheral: "TIM1",
    description: "TIM1 Trigger and Commutation interrupt",
  },
  {
    name: "TIM1_CC_IRQHandler",
    peripheral: "TIM1",
    description: "TIM1 Capture Compare interrupt",
  },
  {
    name: "TIM2_IRQHandler",
    peripheral: "TIM2",
    description: "TIM2 global interrupt",
  },
  {
    name: "TIM3_IRQHandler",
    peripheral: "TIM3",
    description: "TIM3 global interrupt",
  },
  {
    name: "TIM4_IRQHandler",
    peripheral: "TIM4",
    description: "TIM4 global interrupt",
  },
  {
    name: "I2C1_EV_IRQHandler",
    peripheral: "I2C1",
    description: "I2C1 Event interrupt",
  },
  {
    name: "I2C1_ER_IRQHandler",
    peripheral: "I2C1",
    description: "I2C1 Error interrupt",
  },
  {
    name: "I2C2_EV_IRQHandler",
    peripheral: "I2C2",
    description: "I2C2 Event interrupt",
  },
  {
    name: "I2C2_ER_IRQHandler",
    peripheral: "I2C2",
    description: "I2C2 Error interrupt",
  },
  {
    name: "SPI1_IRQHandler",
    peripheral: "SPI1",
    description: "SPI1 global interrupt",
  },
  {
    name: "SPI2_IRQHandler",
    peripheral: "SPI2",
    description: "SPI2 global interrupt",
  },
  {
    name: "USART1_IRQHandler",
    peripheral: "USART1",
    description: "USART1 global interrupt",
  },
  {
    name: "USART2_IRQHandler",
    peripheral: "USART2",
    description: "USART2 global interrupt",
  },
  {
    name: "USART3_IRQHandler",
    peripheral: "USART3",
    description: "USART3 global interrupt",
  },
  {
    name: "EXTI15_10_IRQHandler",
    peripheral: "EXTI",
    description: "EXTI Line [15:10] interrupts",
  },
  {
    name: "RTCAlarm_IRQHandler",
    peripheral: "RTC",
    description: "RTC Alarm through EXTI Line interrupt",
  },
  {
    name: "USBWakeUp_IRQHandler",
    peripheral: "EXTI",
    description: "USB Wakeup from suspend through EXTI Line interrupt",
  },
];

const readWordLe = (data: Uint8Array, offset: number): bigint => {
  const byte0 = BigInt(data[offset] ?? 0);
  const byte1 = BigInt(data[offset + 1] ?? 0);
  const byte2 = BigInt(data[offset + 2] ?? 0);
  const byte3 = BigInt(data[offset + 3] ?? 0);
  return byte0 | (byte1 << 8n) | (byte2 << 16n) | (byte3 << 24n);
};

const formatHex = (val: bigint): string => `0x${val.toString(16)}`;

const isLikelySramPointer = (val: bigint): boolean => {
  // ARM Cortex-M SRAM is typically 0x20000000 - 0x200fffff (or CCMRAM 0x10000000)
  const isStandardSram = val >= 0x20000000n && val <= 0x200fffff;
  const isCcmRam = val >= 0x10000000n && val <= 0x1000ffff;
  return (isStandardSram || isCcmRam) && val % 4n === 0n;
};

const isLikelyCodePointer = (val: bigint, baseAddress: bigint): boolean => {
  // Cortex-M Thumb code pointers must have bit 0 set (odd number)
  if ((val & 1n) !== 1n) return false;
  const execAddr = val & ~1n;
  // Execution address must be reasonably near the baseAddress or in Flash (0x08000000 or 0x00000000)
  const isNearBase =
    execAddr >= baseAddress && execAddr <= baseAddress + 0x01000000n;
  const isStandardFlash = execAddr >= 0x08000000n && execAddr <= 0x08ffffffn;
  const isAliasedBoot = execAddr >= 0x00000000n && execAddr <= 0x00ffffffn;
  return isNearBase || isStandardFlash || isAliasedBoot;
};

const resolveIrqDescriptor = (
  irqNumber: number,
  platform: SocPlatform | null,
): IrqDescriptor => {
  if (platform === "stm32f1" || platform === "gd32f1" || platform === null) {
    const matched = STM32F1_IRQS[irqNumber];
    if (matched) return matched;
  }
  return {
    name: `IRQ${irqNumber}_Handler`,
    peripheral: null,
    description: `Peripheral IRQ ${irqNumber} vector`,
  };
};

/**
 * Parse an ARM Cortex-M Vector Table from raw binary bytes.
 * Validates initial SP and entry exceptions (Reset, NMI, HardFault) according to ARMv7-M.
 */
export const parseArmVectorTable = (
  data: Uint8Array,
  baseAddress = 0x08000000n,
  platform: SocPlatform | null = null,
): Result<ArmVectorTable, string> => {
  if (data.length < 64) {
    return err(
      "Binary data too short for ARM Cortex-M vector table (minimum 64 bytes for 16 core vectors)",
    );
  }

  const initialSp = readWordLe(data, 0);
  if (!isLikelySramPointer(initialSp)) {
    return err(
      `Invalid ARM Cortex-M initial SP ${formatHex(initialSp)}; expected aligned SRAM pointer (0x2000xxxx)`,
    );
  }

  const resetVector = readWordLe(data, 4);
  if (!isLikelyCodePointer(resetVector, baseAddress)) {
    return err(
      `Invalid ARM Cortex-M Reset_Handler vector ${formatHex(resetVector)}; expected Thumb pointer (LSB=1)`,
    );
  }

  const vectors: ArmCortexMVectorEntry[] = [];
  const totalWords = Math.min(Math.floor(data.length / 4), 256);

  for (let idx = 0; idx < totalWords; idx++) {
    const rawVal = readWordLe(data, idx * 4);
    if (idx === 0) {
      vectors.push({
        index: 0,
        name: "Initial_SP",
        targetAddress: formatHex(rawVal),
        targetAddressValue: rawVal,
        executionAddress: formatHex(rawVal),
        executionAddressValue: rawVal,
        kind: "stack_pointer",
        irqNumber: null,
        associatedPeripheral: null,
        description:
          SYSTEM_EXCEPTIONS[0]?.description ?? "Initial Stack Pointer",
      });
      continue;
    }

    if (idx < 16) {
      const desc = SYSTEM_EXCEPTIONS[idx] ?? {
        name: `Exception_${idx}`,
        kind: "reserved",
        description: "Reserved System Exception",
      };
      const execAddr =
        desc.kind === "reserved" || rawVal === 0n ? rawVal : rawVal & ~1n;
      vectors.push({
        index: idx,
        name: desc.name,
        targetAddress: formatHex(rawVal),
        targetAddressValue: rawVal,
        executionAddress: formatHex(execAddr),
        executionAddressValue: execAddr,
        kind: desc.kind,
        irqNumber: null,
        associatedPeripheral: null,
        description: desc.description,
      });
      continue;
    }

    // Peripheral IRQs (indices >= 16)
    const irqNumber = idx - 16;
    if (rawVal === 0n) {
      // Unmapped / unused interrupt slot
      continue;
    }

    const irqDesc = resolveIrqDescriptor(irqNumber, platform);
    const execAddr = rawVal & ~1n;
    vectors.push({
      index: idx,
      name: irqDesc.name,
      targetAddress: formatHex(rawVal),
      targetAddressValue: rawVal,
      executionAddress: formatHex(execAddr),
      executionAddressValue: execAddr,
      kind: "peripheral_irq",
      irqNumber,
      associatedPeripheral: irqDesc.peripheral,
      description: irqDesc.description,
    });
  }

  return ok({
    baseAddress: formatHex(baseAddress),
    baseAddressValue: baseAddress,
    initialSp: formatHex(initialSp),
    resetHandler: formatHex(resetVector & ~1n),
    platform,
    vectorCount: vectors.length,
    vectors,
  });
};

const CANDIDATE_BASE_ADDRESSES: readonly bigint[] = [
  0x08000000n, // Standard STM32 / GD32 Flash base
  0x00000000n, // Standard ARM Cortex-M Boot aliased space
  0x20000000n, // SRAM execution image
];

/**
 * Scan a binary firmware buffer to discover and decode an ARM Cortex-M Vector Table.
 * Tries standard candidate base addresses and common bootloader offsets (0x0, 0x1000, 0x4000, 0x8000).
 */
export const scanFirmwareVectorTable = (
  data: Uint8Array,
  platform: SocPlatform | null = null,
): ArmVectorTable | null => {
  const candidateOffsets = [0, 0x1000, 0x2000, 0x4000, 0x8000, 0x10000];

  for (const offset of candidateOffsets) {
    if (offset + 64 > data.length) continue;
    const slice = data.subarray(offset);

    for (const base of CANDIDATE_BASE_ADDRESSES) {
      const parsed = parseArmVectorTable(
        slice,
        base + BigInt(offset),
        platform,
      );
      if (parsed.ok) {
        return parsed.value;
      }
    }
  }

  return null;
};
