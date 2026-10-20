import { describe, expect, it } from "vitest";
import {
  armVectorTableSchema,
  parseArmVectorTable,
  scanFirmwareVectorTable,
} from "./armVectorTable.js";

const buildVectorTableFixture = (options?: {
  initialSp?: bigint;
  resetHandler?: bigint;
  usart1Handler?: bigint;
  tim2Handler?: bigint;
}): Uint8Array => {
  const buffer = new Uint8Array(256 * 4);
  const view = new DataView(buffer.buffer);

  const initialSp = options?.initialSp ?? 0x20005000n;
  const resetHandler = options?.resetHandler ?? 0x08000141n; // Thumb mode LSB=1

  view.setUint32(0, Number(initialSp), true);
  view.setUint32(4, Number(resetHandler), true);
  view.setUint32(8, 0x08000151, true); // NMI
  view.setUint32(12, 0x08000161, true); // HardFault
  view.setUint32(15 * 4, 0x080001a1, true); // SysTick

  if (options?.tim2Handler !== undefined) {
    // IRQ 28 (index 44) = TIM2_IRQHandler
    view.setUint32(44 * 4, Number(options.tim2Handler), true);
  } else {
    view.setUint32(44 * 4, 0x08000211, true);
  }

  if (options?.usart1Handler !== undefined) {
    // IRQ 37 (index 53) = USART1_IRQHandler
    view.setUint32(53 * 4, Number(options.usart1Handler), true);
  } else {
    view.setUint32(53 * 4, 0x08000251, true);
  }

  return buffer;
};

describe("ARM Cortex-M vector table decoding", () => {
  it("decodes standard STM32 vector table and resolves core exceptions and peripheral IRQs", () => {
    const data = buildVectorTableFixture({
      initialSp: 0x20005000n,
      resetHandler: 0x08000141n,
      usart1Handler: 0x08000301n,
      tim2Handler: 0x08000281n,
    });

    const result = parseArmVectorTable(data, 0x08000000n, "stm32f1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const table = result.value;
    expect(armVectorTableSchema.safeParse(table).success).toBe(true);
    expect(table.initialSp).toBe("0x20005000");
    expect(table.resetHandler).toBe("0x8000140"); // Thumb bit cleared

    // Initial SP
    expect(table.vectors[0]?.name).toBe("Initial_SP");
    expect(table.vectors[0]?.kind).toBe("stack_pointer");

    // Reset_Handler
    expect(table.vectors[1]?.name).toBe("Reset_Handler");
    expect(table.vectors[1]?.targetAddress).toBe("0x8000141");
    expect(table.vectors[1]?.executionAddress).toBe("0x8000140");
    expect(table.vectors[1]?.kind).toBe("system_exception");

    // SysTick_Handler
    const systick = table.vectors.find((v) => v.name === "SysTick_Handler");
    expect(systick).toBeDefined();
    expect(systick?.executionAddress).toBe("0x80001a0");

    // Peripheral IRQ 28: TIM2
    const tim2 = table.vectors.find((v) => v.name === "TIM2_IRQHandler");
    expect(tim2).toBeDefined();
    expect(tim2?.irqNumber).toBe(28);
    expect(tim2?.associatedPeripheral).toBe("TIM2");
    expect(tim2?.executionAddress).toBe("0x8000280");

    // Peripheral IRQ 37: USART1
    const usart1 = table.vectors.find((v) => v.name === "USART1_IRQHandler");
    expect(usart1).toBeDefined();
    expect(usart1?.irqNumber).toBe(37);
    expect(usart1?.associatedPeripheral).toBe("USART1");
    expect(usart1?.executionAddress).toBe("0x8000300");
  });

  it("decodes RP2040 vector table and resolves PIO, UART, and Timer IRQs", () => {
    const buffer = new Uint8Array(64 * 4);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 0x20042000, true); // RP2040 SRAM top
    view.setUint32(4, 0x10000101, true); // Reset_Handler in XIP Flash
    view.setUint32(8, 0x10000111, true); // NMI
    view.setUint32(12, 0x10000121, true); // HardFault
    view.setUint32(23 * 4, 0x10000181, true); // IRQ 7: PIO0_IRQ_0
    view.setUint32(36 * 4, 0x10000201, true); // IRQ 20: UART0_IRQ

    const result = parseArmVectorTable(buffer, 0x10000000n, "rp2040");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const table = result.value;
    expect(table.initialSp).toBe("0x20042000");
    expect(table.resetHandler).toBe("0x10000100");

    const pio0 = table.vectors.find((v) => v.name === "PIO0_IRQ_0");
    expect(pio0?.associatedPeripheral).toBe("PIO0");
    expect(pio0?.irqNumber).toBe(7);

    const uart0 = table.vectors.find((v) => v.name === "UART0_IRQ");
    expect(uart0?.associatedPeripheral).toBe("UART0");
    expect(uart0?.irqNumber).toBe(20);
  });

  it("decodes Nordic nRF52 vector table and resolves RADIO and UARTE IRQs", () => {
    const buffer = new Uint8Array(64 * 4);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 0x20010000, true); // nRF52 SRAM top
    view.setUint32(4, 0x00000201, true); // Reset_Handler in Flash (0x0)
    view.setUint32(8, 0x00000211, true); // NMI
    view.setUint32(12, 0x00000221, true); // HardFault
    view.setUint32(17 * 4, 0x00000301, true); // IRQ 1: RADIO_IRQHandler
    view.setUint32(18 * 4, 0x00000351, true); // IRQ 2: UARTE0_UART0_IRQHandler

    const result = parseArmVectorTable(buffer, 0x00000000n, "nrf52");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const table = result.value;
    expect(table.initialSp).toBe("0x20010000");
    expect(table.resetHandler).toBe("0x200");

    const radio = table.vectors.find((v) => v.name === "RADIO_IRQHandler");
    expect(radio?.associatedPeripheral).toBe("RADIO");
    expect(radio?.irqNumber).toBe(1);

    const uarte0 = table.vectors.find(
      (v) => v.name === "UARTE0_UART0_IRQHandler",
    );
    expect(uarte0?.associatedPeripheral).toBe("UART0");
    expect(uarte0?.irqNumber).toBe(2);
  });

  it("rejects non-SRAM initial stack pointer values", () => {
    // Initial SP pointing to Flash rather than SRAM
    const data = buildVectorTableFixture({ initialSp: 0x08001000n });
    const result = parseArmVectorTable(data);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Invalid ARM Cortex-M initial SP");
  });

  it("rejects non-Thumb Reset_Handler vectors (even address without LSB=1)", () => {
    // Even address (bit 0 is 0), which causes ARM HardFault on Cortex-M
    const data = buildVectorTableFixture({ resetHandler: 0x08000140n });
    const result = parseArmVectorTable(data);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("expected Thumb pointer (LSB=1)");
  });

  it("rejects truncated binary data (< 64 bytes)", () => {
    const tooShort = new Uint8Array(32);
    const result = parseArmVectorTable(tooShort);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Binary data too short");
  });
});

describe("Automated firmware vector table scanning", () => {
  it("scans and locates vector table at start of image", () => {
    const data = buildVectorTableFixture();
    const table = scanFirmwareVectorTable(data, "stm32f1");
    expect(table).not.toBeNull();
    expect(table?.initialSp).toBe("0x20005000");
    expect(table?.resetHandler).toBe("0x8000140");
  });

  it("discovers vector table positioned after bootloader header at offset 0x4000", () => {
    const rawData = buildVectorTableFixture();
    const appWithBootloader = new Uint8Array(0x4000 + rawData.length);
    // Leave 0x0..0x3fff empty/zeroed, place application at 0x4000
    appWithBootloader.set(rawData, 0x4000);

    const table = scanFirmwareVectorTable(appWithBootloader, "stm32f1");
    expect(table).not.toBeNull();
    expect(table?.initialSp).toBe("0x20005000");
    expect(table?.baseAddress).toBe("0x8004000");
  });

  it("returns null for arbitrary non-firmware binary payloads", () => {
    const randomPayload = new Uint8Array(1024).fill(0xaa);
    const table = scanFirmwareVectorTable(randomPayload);
    expect(table).toBeNull();
  });
});
