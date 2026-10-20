import { describe, expect, it } from "vitest";
import {
  lookupSocPeripheralRegister,
  socPeripheralRegisterDefinitionSchema,
  socPeripheralRegisterLookupResultSchema,
  STM32_USART_REGISTERS,
  ESP32_UART_REGISTERS,
} from "./socPeripheralRegisters.js";

describe("STM32 and GD32 serial peripheral register lookup", () => {
  it("validates register definition schema conformity", () => {
    for (const reg of STM32_USART_REGISTERS) {
      expect(socPeripheralRegisterDefinitionSchema.safeParse(reg).success).toBe(
        true,
      );
    }
    for (const reg of ESP32_UART_REGISTERS) {
      expect(socPeripheralRegisterDefinitionSchema.safeParse(reg).success).toBe(
        true,
      );
    }
  });

  it("resolves STM32F1 USART1 and USART2 registers with correct mnemonics and baud registers", () => {
    // USART1 (APB2) on STM32F1: Base 0x40013800
    const sr = lookupSocPeripheralRegister("0x40013800", "stm32f1");
    expect(sr?.mnemonic).toBe("USART1_SR");
    expect(sr?.offsetHex).toBe("0x0");
    expect(sr?.access).toBe("read_write");

    const dr = lookupSocPeripheralRegister("0x40013804", "stm32f1");
    expect(dr?.mnemonic).toBe("USART1_DR");

    const brr = lookupSocPeripheralRegister("0x40013808", "stm32f1");
    expect(brr?.mnemonic).toBe("USART1_BRR");
    expect(brr?.registerName).toBe("USART1 Baud rate register");
    expect(brr?.offset).toBe(0x08);
    expect(socPeripheralRegisterLookupResultSchema.safeParse(brr).success).toBe(
      true,
    );

    const cr1 = lookupSocPeripheralRegister("0x4001380c", "stm32f1");
    expect(cr1?.mnemonic).toBe("USART1_CR1");

    const cr2 = lookupSocPeripheralRegister("0x40013810", "stm32f1");
    expect(cr2?.mnemonic).toBe("USART1_CR2");

    const cr3 = lookupSocPeripheralRegister("0x40013814", "stm32f1");
    expect(cr3?.mnemonic).toBe("USART1_CR3");

    // USART2 (APB1) on STM32F1: Base 0x40004400
    const usart2Brr = lookupSocPeripheralRegister("0x40004408", "stm32f1");
    expect(usart2Brr?.mnemonic).toBe("USART2_BRR");
    expect(usart2Brr?.peripheral.bus).toBe("APB1");
  });

  it("resolves GD32F1 USART0 registers preserving vendor naming convention", () => {
    // In GD32F1, USART1 is named USART0 at base 0x40013800
    const usart0Brr = lookupSocPeripheralRegister("0x40013808", "gd32f1");
    expect(usart0Brr?.mnemonic).toBe("USART0_BRR");
    expect(usart0Brr?.registerName).toBe("USART0 Baud rate register");
  });

  it("resolves STM32F4 USART1 registers at 0x40011000", () => {
    // In STM32F4, USART1 is mapped at 0x40011000
    const usart1Sr = lookupSocPeripheralRegister("0x40011000", "stm32f4");
    expect(usart1Sr?.mnemonic).toBe("USART1_SR");

    const usart1Brr = lookupSocPeripheralRegister("0x40011008", "stm32f4");
    expect(usart1Brr?.mnemonic).toBe("USART1_BRR");
  });
});

describe("GPIO and Clock Control register lookup", () => {
  it("resolves STM32F1 GPIOA CRL, CRH, IDR, and BSRR registers", () => {
    const crl = lookupSocPeripheralRegister("0x40010800", "stm32f1");
    expect(crl?.mnemonic).toBe("GPIOA_CRL");

    const crh = lookupSocPeripheralRegister("0x40010804", "stm32f1");
    expect(crh?.mnemonic).toBe("GPIOA_CRH");

    const idr = lookupSocPeripheralRegister("0x40010808", "stm32f1");
    expect(idr?.mnemonic).toBe("GPIOA_IDR");
    expect(idr?.access).toBe("read");

    const bsrr = lookupSocPeripheralRegister("0x40010810", "stm32f1");
    expect(bsrr?.mnemonic).toBe("GPIOA_BSRR");
    expect(bsrr?.access).toBe("write");
  });

  it("resolves STM32F4 GPIO MODER and Alternate Function registers", () => {
    const moder = lookupSocPeripheralRegister("0x40020000", "stm32f4");
    expect(moder?.mnemonic).toBe("GPIOA_MODER");

    const afrl = lookupSocPeripheralRegister("0x40020020", "stm32f4");
    expect(afrl?.mnemonic).toBe("GPIOA_AFRL");
  });

  it("resolves STM32F1 RCC peripheral clock enable registers", () => {
    const apb2enr = lookupSocPeripheralRegister("0x40021018", "stm32f1");
    expect(apb2enr?.mnemonic).toBe("RCC_APB2ENR");
    expect(apb2enr?.registerName).toBe(
      "RCC APB2 peripheral clock enable register",
    );
  });
});

describe("ESP32 UART and GPIO register lookup", () => {
  it("resolves ESP32 UART0 FIFO, CLKDIV (baud rate), and CONF0 registers", () => {
    const fifo = lookupSocPeripheralRegister("0x3ff40000", "esp32");
    expect(fifo?.mnemonic).toBe("UART0_FIFO");
    expect(fifo?.offsetHex).toBe("0x0");

    const intRaw = lookupSocPeripheralRegister("0x3ff40004", "esp32");
    expect(intRaw?.mnemonic).toBe("UART0_INT_RAW");
    expect(intRaw?.access).toBe("read");

    const clkdiv = lookupSocPeripheralRegister("0x3ff40014", "esp32");
    expect(clkdiv?.mnemonic).toBe("UART0_CLKDIV");
    expect(clkdiv?.registerName).toBe(
      "UART0 Clock divider configuration register",
    );
    expect(clkdiv?.offset).toBe(0x14);

    const conf0 = lookupSocPeripheralRegister("0x3ff40020", "esp32");
    expect(conf0?.mnemonic).toBe("UART0_CONF0");

    // UART1 at 0x3ff6e000
    const uart1Clkdiv = lookupSocPeripheralRegister("0x3ff6e014", "esp32");
    expect(uart1Clkdiv?.mnemonic).toBe("UART1_CLKDIV");
  });

  it("resolves ESP32 GPIO OUT, ENABLE, and bit set/clear registers", () => {
    const out = lookupSocPeripheralRegister("0x3ff44004", "esp32");
    expect(out?.mnemonic).toBe("GPIO_OUT");

    const outW1ts = lookupSocPeripheralRegister("0x3ff44008", "esp32");
    expect(outW1ts?.mnemonic).toBe("GPIO_OUT_W1TS");
    expect(outW1ts?.access).toBe("write");

    const enable = lookupSocPeripheralRegister("0x3ff44020", "esp32");
    expect(enable?.mnemonic).toBe("GPIO_ENABLE");
  });

  it("returns null for unmapped offsets or unknown addresses", () => {
    // Unmapped offset within USART1
    expect(lookupSocPeripheralRegister("0x40013899", "stm32f1")).toBeNull();
    // Non-peripheral address
    expect(lookupSocPeripheralRegister("0x20000000", "stm32f1")).toBeNull();
    // Invalid address
    expect(lookupSocPeripheralRegister("invalid", "esp32")).toBeNull();
  });
});
