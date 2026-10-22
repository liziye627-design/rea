import { describe, it, expect } from "vitest";
import { decodeSerialConfiguration } from "./serialConfigDecoder.js";

describe("STM32 / GD32 USART baud rate and line configuration decoding", () => {
  it("decodes STM32F1 USART1 standard 115200 8-N-1 from BRR=0x0271", () => {
    // 0x0271 = 625 => Mantissa=39, Fraction=1 => 39.0625. Clock=72MHz => 115200
    const result = decodeSerialConfiguration("stm32f1", "USART1", {
      BRR: 0x0271,
      CR1: 0x200c, // UE=1, TE=1, RE=1
      CR2: 0x0000, // 1 stop bit
    });

    expect(result.baudRate).toBe(115200);
    expect(result.dataBits).toBe(8);
    expect(result.parity).toBe("none");
    expect(result.stopBits).toBe(1);
    expect(result.formatString).toBe("115200 8-N-1");
  });

  it("decodes STM32F1 USART2 standard 9600 8-N-1 with 36MHz APB1 clock", () => {
    // 36MHz / (16 * 9600) = 234.375 => Mantissa=234 (0xea), Fraction=6 (0x6) => BRR = 0x0ea6
    const result = decodeSerialConfiguration("stm32f1", "USART2", {
      BRR: 0x0ea6,
    });

    expect(result.baudRate).toBe(9600);
    expect(result.formatString).toBe("9600 8-N-1");
  });

  it("decodes 9-bit data with parity enabled", () => {
    const result = decodeSerialConfiguration("stm32f1", "USART1", {
      BRR: 0x0271,
      CR1: (1 << 12) | (1 << 10) | (1 << 9), // M=1 (9-bit), PCE=1, PS=1 (Odd parity)
      CR2: 2 << 12, // 2 stop bits
    });

    expect(result.dataBits).toBe(9);
    expect(result.parity).toBe("odd");
    expect(result.stopBits).toBe(2);
    expect(result.formatString).toBe("115200 9-O-2");
  });
});

describe("RP2040 PL011 and Nordic nRF52 serial configuration decoding", () => {
  it("decodes RP2040 PL011 standard 115200 8-N-1 from IBRD=26, FBRD=3", () => {
    // 48MHz / (16 * (26 + 3/64)) = 48000000 / (16 * 26.046875) = 115200
    const result = decodeSerialConfiguration("rp2040", "UART0", {
      IBRD: 26,
      FBRD: 3,
      LCR_H: (3 << 5) | (1 << 4), // WLEN=3 (8-bit), FEN=1
    });

    expect(result.baudRate).toBe(115200);
    expect(result.dataBits).toBe(8);
    expect(result.parity).toBe("none");
    expect(result.stopBits).toBe(1);
    expect(result.formatString).toBe("115200 8-N-1");
  });

  it("decodes Nordic nRF52 UARTE 115200 and 9600 baud rate constants", () => {
    const b115200 = decodeSerialConfiguration("nrf52", "UARTE0", {
      BAUDRATE: 0x01d7e000,
    });
    expect(b115200.baudRate).toBe(115200);
    expect(b115200.formatString).toBe("115200 8-N-1");

    const b9600 = decodeSerialConfiguration("nrf52", "UARTE0", {
      BAUDRATE: 0x00275000,
    });
    expect(b9600.baudRate).toBe(9600);
    expect(b9600.formatString).toBe("9600 8-N-1");
  });

  it("decodes ESP32 UART 115200 from CLKDIV with 80MHz APB clock", () => {
    // 80MHz / 115200 = 694.444 => Integer=694 (0x2b6), Fraction=7 (0x7)
    const clkdiv = 694 | (7 << 20);
    const result = decodeSerialConfiguration("esp32", "UART0", {
      CLKDIV: clkdiv,
      CONF0: 3 << 2, // 8-bit
    });

    expect(result.baudRate).toBe(115200);
    expect(result.dataBits).toBe(8);
    expect(result.formatString).toBe("115200 8-N-1");
  });
});
