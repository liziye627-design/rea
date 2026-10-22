import { describe, expect, it } from "vitest";
import {
  decodeStm32f1GpioPin,
  decodeStm32f4GpioPin,
  decodeRp2040GpioPin,
  decodeNrf52PinCnf,
  decodeNrf52PeripheralPsel,
  pinConfigurationSchema,
} from "./gpioPinoutDecoder.js";

describe("decodeStm32f1GpioPin", () => {
  it("decodes PA9 configured as alternate function push-pull for USART1_TX", () => {
    // PA9: pin 9 (in CRH, relPin = 1, shift = 4).
    // MODE=11 (50MHz output), CNF=10 (AF Push-Pull) -> nibble = 0b1011 = 0x0b.
    const crhVal = 0x000000b0;
    const result = decodeStm32f1GpioPin("GPIOA", 9, crhVal);

    expect(result.pinName).toBe("PA9");
    expect(result.direction).toBe("alternate_function");
    expect(result.driveMode).toBe("push_pull");
    expect(result.speed).toBe("50MHz");
    expect(result.alternateFunction?.signal).toBe("USART1_TX");
    expect(result.alternateFunction?.peripheral).toBe("USART1");
    expect(() => pinConfigurationSchema.parse(result)).not.toThrow();
  });

  it("decodes PA10 configured as input floating for USART1_RX", () => {
    // PA10: relPin = 2, shift = 8.
    // MODE=00 (Input), CNF=01 (Floating) -> nibble = 0b0100 = 0x04.
    const crhVal = 0x00000400;
    const result = decodeStm32f1GpioPin("GPIOA", 10, crhVal);

    expect(result.pinName).toBe("PA10");
    expect(result.direction).toBe("input");
    expect(result.driveMode).toBe("floating");
    expect(result.alternateFunction?.signal).toBe("USART1_RX");
    expect(() => pinConfigurationSchema.parse(result)).not.toThrow();
  });

  it("decodes PA0 configured as analog input", () => {
    // PA0: relPin = 0, MODE=00, CNF=00 -> nibble = 0x0.
    const result = decodeStm32f1GpioPin("GPIOA", 0, 0x00);
    expect(result.direction).toBe("analog");
    expect(result.driveMode).toBe("analog");
    expect(result.alternateFunction).toBeNull();
  });
});

describe("decodeStm32f4GpioPin", () => {
  it("decodes PA9 configured as AF7 for USART1_TX", () => {
    // MODER: 0b10 (AF) at bit 18 -> 0x00080000.
    // OTYPER: 0 (Push-Pull).
    // AFRH: AF7 at nibble 1 (rel pin 1) -> 0x00000070.
    const result = decodeStm32f4GpioPin({
      port: "GPIOA",
      pinIndex: 9,
      moderVal: 0x00080000,
      otyperVal: 0x0000,
      pupdrVal: 0x0000,
      afrVal: 0x00000070,
    });

    expect(result.pinName).toBe("PA9");
    expect(result.direction).toBe("alternate_function");
    expect(result.driveMode).toBe("push_pull");
    expect(result.alternateFunction?.functionId).toBe(7);
    expect(result.alternateFunction?.peripheral).toBe("USART1..3");
    expect(() => pinConfigurationSchema.parse(result)).not.toThrow();
  });

  it("decodes PB7 configured as open-drain output for I2C with pull-up", () => {
    // MODER: 0b01 (output) at bit 14 -> (1 << 14) = 0x4000.
    // OTYPER: 1 (open-drain) at bit 7 -> 0x80.
    // PUPDR: 0b01 (pull-up) at bit 14 -> 0x4000.
    const result = decodeStm32f4GpioPin({
      port: "GPIOB",
      pinIndex: 7,
      moderVal: 0x4000,
      otyperVal: 0x80,
      pupdrVal: 0x4000,
    });

    expect(result.direction).toBe("output");
    expect(result.driveMode).toBe("open_drain");
  });
});

describe("decodeRp2040GpioPin", () => {
  it("decodes GPIO0 configured as UART0 TX (FUNCSEL 2)", () => {
    // FUNCSEL 1 is UART in RP2040 FUNCSEL table
    const result = decodeRp2040GpioPin(0, 1);

    expect(result.pinName).toBe("GPIO0");
    expect(result.alternateFunction?.peripheral).toBe("UART");
    expect(result.alternateFunction?.signal).toBe("UART_GPIO0");
    expect(() => pinConfigurationSchema.parse(result)).not.toThrow();
  });

  it("decodes GPIO25 configured as SIO / Software GPIO (FUNCSEL 4)", () => {
    const result = decodeRp2040GpioPin(25, 4);

    expect(result.pinName).toBe("GPIO25");
    expect(result.direction).toBe("output");
    expect(result.alternateFunction).toBeNull();
  });
});

describe("decodeNrf52PinCnf and PSEL", () => {
  it("decodes P0.06 as input with pull-up", () => {
    // DIR=0, INPUT=0 (connect), PULL=11 (pull-up, bits 3:2 -> 0x0c)
    const result = decodeNrf52PinCnf(6, 0x0c);

    expect(result.pinName).toBe("P0.06");
    expect(result.direction).toBe("input");
    expect(result.driveMode).toBe("pull_up");
    expect(() => pinConfigurationSchema.parse(result)).not.toThrow();
  });

  it("decodes P0.08 as output high drive", () => {
    // DIR=1, DRIVE=001 (H0S1, bits 10:8 -> 0x0100) -> 0x0101
    const result = decodeNrf52PinCnf(8, 0x0101);

    expect(result.pinName).toBe("P0.08");
    expect(result.direction).toBe("output");
    expect(result.driveMode).toBe("high_drive");
  });

  it("decodes UART0 PSEL TXD routing to P0.06 and disconnected state", () => {
    const connected = decodeNrf52PeripheralPsel("UART0", "TXD", 6);
    expect(connected.connected).toBe(true);
    expect(connected.pin).toBe(6);
    expect(connected.description).toContain("routed to physical pin P0.06");

    const disconnected = decodeNrf52PeripheralPsel("UART0", "TXD", 0xffffffff);
    expect(disconnected.connected).toBe(false);
    expect(disconnected.description).toContain("is disconnected");
  });
});
