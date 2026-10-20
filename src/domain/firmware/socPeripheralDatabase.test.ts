import { describe, expect, it } from "vitest";
import {
  detectSocPlatform,
  lookupSocPeripheral,
  socPeripheralDefinitionSchema,
} from "./socPeripheralDatabase.js";

describe("STM32 and GD32 peripheral lookup", () => {
  it("resolves STM32F1 APB and AHB peripherals", () => {
    // USART1 in STM32F1 (APB2)
    const usart1 = lookupSocPeripheral("0x40013804", "stm32f1");
    expect(usart1).not.toBeNull();
    if (usart1 === null) return;
    expect(usart1.name).toBe("USART1");
    expect(usart1.bus).toBe("APB2");
    expect(usart1.baseAddress).toBe("0x40013800");
    expect(socPeripheralDefinitionSchema.safeParse(usart1).success).toBe(true);

    // GPIOA in STM32F1
    const gpioa = lookupSocPeripheral("0x40010800", "stm32f1");
    expect(gpioa?.name).toBe("GPIOA");

    // RCC in STM32F1 (AHB)
    const rcc = lookupSocPeripheral("0x40021000", "stm32f1");
    expect(rcc?.name).toBe("RCC");
    expect(rcc?.bus).toBe("AHB");
  });

  it("resolves GD32F1 naming differences while preserving matching base addresses", () => {
    // GD32F1 names USART1 as USART0
    const usart0 = lookupSocPeripheral("0x40013800", "gd32f1");
    expect(usart0?.name).toBe("USART0");
    expect(usart0?.bus).toBe("APB2");

    // GD32F1 names RCC as RCU
    const rcu = lookupSocPeripheral("0x40021000", "gd32f1");
    expect(rcu?.name).toBe("RCU");
  });

  it("resolves STM32F4 AHB1 GPIO mapping (0x40020000)", () => {
    // In STM32F4, GPIOA moved from APB2 to AHB1 at 0x40020000
    const gpioa = lookupSocPeripheral("0x40020014", "stm32f4");
    expect(gpioa?.name).toBe("GPIOA");
    expect(gpioa?.bus).toBe("AHB1");

    // In STM32F4, USART1 is at 0x40011000
    const usart1 = lookupSocPeripheral("0x40011000", "stm32f4");
    expect(usart1?.name).toBe("USART1");
  });
});

describe("RP2040 and Nordic nRF52 peripheral lookup", () => {
  it("resolves RP2040 APB, AHB, and SIO peripheral blocks", () => {
    // RP2040 SIO at 0xd0000000
    const sio = lookupSocPeripheral("0xd0000004", "rp2040");
    expect(sio).not.toBeNull();
    expect(sio?.name).toBe("SIO");
    expect(sio?.bus).toBe("SIO");
    expect(sio?.baseAddress).toBe("0xd0000000");

    // RP2040 PIO0 at 0x50200000 (AHB)
    const pio0 = lookupSocPeripheral("0x50200000", "rp2040");
    expect(pio0?.name).toBe("PIO0");
    expect(pio0?.bus).toBe("AHB");

    // RP2040 UART0 at 0x40034000 (APB)
    const uart0 = lookupSocPeripheral("0x40034008", "rp2040");
    expect(uart0?.name).toBe("UART0");
    expect(uart0?.bus).toBe("APB");

    // RP2040 TIMER at 0x40054000
    const timer = lookupSocPeripheral("0x40054000", "rp2040");
    expect(timer?.name).toBe("TIMER");
  });

  it("resolves Nordic nRF52 RADIO, UARTE, and P0 GPIO peripheral blocks", () => {
    // nRF52 RADIO at 0x40001000
    const radio = lookupSocPeripheral("0x40001004", "nrf52");
    expect(radio).not.toBeNull();
    expect(radio?.name).toBe("RADIO");
    expect(radio?.bus).toBe("APB");

    // nRF52 UART0/UARTE0 at 0x40002000
    const uart0 = lookupSocPeripheral("0x40002000", "nrf52");
    expect(uart0?.name).toBe("UART0");

    // nRF52 GPIOTE at 0x40006000
    const gpiote = lookupSocPeripheral("0x40006000", "nrf52");
    expect(gpiote?.name).toBe("GPIOTE");

    // nRF52 P0 GPIO at 0x50000000 (System)
    const p0 = lookupSocPeripheral("0x50000504", "nrf52");
    expect(p0?.name).toBe("P0");
    expect(p0?.bus).toBe("System");
  });

  it("detects RP2040 and nRF52 platform candidates from observed MMIO address set", () => {
    const rp2040Addrs = ["0xd0000000", "0x50200000", "0x40034000"];
    const rp2040Candidates = detectSocPlatform(rp2040Addrs);
    expect(rp2040Candidates[0]?.platform).toBe("rp2040");
    expect(rp2040Candidates[0]?.confidence).toBe(1.0);

    const nrf52Addrs = ["0x40001000", "0x40002000", "0x50000000"];
    const nrf52Candidates = detectSocPlatform(nrf52Addrs);
    expect(nrf52Candidates[0]?.platform).toBe("nrf52");
    expect(nrf52Candidates[0]?.confidence).toBe(1.0);
  });
});

describe("ESP32 peripheral lookup and automated platform detection", () => {
  it("resolves ESP32 DPort and RTC peripheral blocks", () => {
    const uart0 = lookupSocPeripheral("0x3ff40004", "esp32");
    expect(uart0?.name).toBe("UART0");
    expect(uart0?.bus).toBe("DPort");

    const gpio = lookupSocPeripheral("0x3ff44000", "esp32");
    expect(gpio?.name).toBe("GPIO");

    const dport = lookupSocPeripheral("0x3ff4c000", "esp32");
    expect(dport?.name).toBe("DPORT");

    const timg0 = lookupSocPeripheral("0x3ff5f000", "esp32");
    expect(timg0?.name).toBe("TIMG0");

    // ESP32-C series (RISC-V) peripheral blocks
    const esp32cUart0 = lookupSocPeripheral("0x60000000", "esp32");
    expect(esp32cUart0?.name).toBe("UART0");
    expect(esp32cUart0?.bus).toBe("System");

    const esp32cGpio = lookupSocPeripheral("0x60004004", "esp32");
    expect(esp32cGpio?.name).toBe("GPIO");
  });

  it("detects candidate SoC platform from observed MMIO address set", () => {
    // Typical STM32F1 firmware accesses: USART1, GPIOA, RCC
    const stm32Addresses = ["0x40013800", "0x40010800", "0x40021000"];
    const stm32Candidates = detectSocPlatform(stm32Addresses);
    expect(stm32Candidates.length).toBeGreaterThanOrEqual(1);
    expect(stm32Candidates[0]?.platform).toBe("stm32f1");
    expect(stm32Candidates[0]?.confidence).toBe(1.0);
    expect(stm32Candidates[0]?.matchedPeripherals).toEqual([
      "GPIOA",
      "RCC",
      "USART1",
    ]);

    // Typical ESP32 firmware accesses: UART0, GPIO, DPORT
    const esp32Addresses = ["0x3ff40000", "0x3ff44000", "0x3ff4c000"];
    const esp32Candidates = detectSocPlatform(esp32Addresses);
    expect(esp32Candidates).toHaveLength(1);
    expect(esp32Candidates[0]?.platform).toBe("esp32");
    expect(esp32Candidates[0]?.confidence).toBe(1.0);
  });

  it("returns null or empty candidate list for unrecognized addresses", () => {
    expect(lookupSocPeripheral("0x12345678", "stm32f1")).toBeNull();
    expect(lookupSocPeripheral("invalid", "esp32")).toBeNull();
    expect(detectSocPlatform(["0x12345678", "0x87654321"])).toEqual([]);
  });
});
