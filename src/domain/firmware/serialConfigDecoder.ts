import { z } from "zod";
import type { SocPlatform } from "./socPeripheralDatabase.js";

/** Decoded serial line configuration parameters. */
export interface DecodedSerialConfiguration {
  readonly baudRate: number | null;
  readonly dataBits: 5 | 6 | 7 | 8 | 9;
  readonly parity: "none" | "even" | "odd";
  readonly stopBits: 1 | 1.5 | 2;
  readonly flowControl: "none" | "rts_cts" | "xon_xoff";
  readonly formatString: string;
  readonly diagnostics: readonly string[];
}

export const decodedSerialConfigurationSchema = z.strictObject({
  baudRate: z.number().int().positive().nullable(),
  dataBits: z.union([
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
  ]),
  parity: z.enum(["none", "even", "odd"]),
  stopBits: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  flowControl: z.enum(["none", "rts_cts", "xon_xoff"]),
  formatString: z.string(),
  diagnostics: z.array(z.string()),
});

/** Well-known baud rate targets to match against floating fractional divisors. */
const STANDARD_BAUD_RATES: readonly number[] = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 2000000,
];

const snapToStandardBaud = (calculated: number, tolerance = 0.03): number => {
  for (const std of STANDARD_BAUD_RATES) {
    const error = Math.abs(calculated - std) / std;
    if (error <= tolerance) {
      return std;
    }
  }
  return Math.round(calculated);
};

// Nordic nRF52 UARTE BAUDRATE register lookup table
const NRF52_BAUD_MAP: Readonly<Record<number, number>> = {
  0x0004f000: 1200,
  0x0009d000: 2400,
  0x0013b000: 4800,
  0x00275000: 9600,
  0x003b0000: 14400,
  0x004ea4a8: 19200,
  0x0075f000: 28800,
  0x009d4951: 38400,
  0x00ebedfa: 57600,
  0x013a9000: 76800,
  0x01d7e000: 115200,
  0x03afb000: 230400,
  0x04000000: 250000,
  0x075f7000: 460800,
  0x0ebed000: 921600,
  0x10000000: 1000000,
};

const decodeStm32Serial = (
  regs: Readonly<Record<string, number>>,
  clockHz: number,
  diagnostics: string[],
): {
  baudRate: number | null;
  dataBits: 5 | 6 | 7 | 8 | 9;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 1.5 | 2;
  flowControl: "none" | "rts_cts" | "xon_xoff";
} => {
  let baudRate: number | null = null;
  const brr = regs.BRR;
  if (typeof brr === "number" && brr > 0) {
    const mantissa = (brr >> 4) & 0xfff;
    const fraction = brr & 0xf;
    const div = mantissa + fraction / 16.0;
    if (div > 0) {
      const rawBaud = clockHz / (16.0 * div);
      baudRate = snapToStandardBaud(rawBaud);
      diagnostics.push(
        `STM32 BRR 0x${brr.toString(16)} with clock ${clockHz}Hz yields ~${baudRate} baud`,
      );
    }
  }

  let dataBits: 5 | 6 | 7 | 8 | 9 = 8;
  let parity: "none" | "even" | "odd" = "none";
  let stopBits: 1 | 1.5 | 2 = 1;
  let flowControl: "none" | "rts_cts" | "xon_xoff" = "none";

  const cr1 = regs.CR1;
  if (typeof cr1 === "number") {
    if ((cr1 & (1 << 12)) !== 0) dataBits = 9;
    if ((cr1 & (1 << 10)) !== 0) {
      parity = (cr1 & (1 << 9)) !== 0 ? "odd" : "even";
    }
  }

  const cr2 = regs.CR2;
  if (typeof cr2 === "number") {
    const stopCode = (cr2 >> 12) & 0x3;
    if (stopCode === 2) stopBits = 2;
    else if (stopCode === 3) stopBits = 1.5;
  }

  const cr3 = regs.CR3;
  if (typeof cr3 === "number") {
    if ((cr3 & (1 << 8)) !== 0 || (cr3 & (1 << 9)) !== 0) {
      flowControl = "rts_cts";
    }
  }

  return { baudRate, dataBits, parity, stopBits, flowControl };
};

const decodeRp2040Serial = (
  regs: Readonly<Record<string, number>>,
  clockHz: number,
  diagnostics: string[],
): {
  baudRate: number | null;
  dataBits: 5 | 6 | 7 | 8 | 9;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 1.5 | 2;
  flowControl: "none" | "rts_cts" | "xon_xoff";
} => {
  let baudRate: number | null = null;
  const ibrd = regs.IBRD;
  const fbrd = regs.FBRD ?? 0;
  if (typeof ibrd === "number" && ibrd > 0) {
    const div = ibrd + fbrd / 64.0;
    const rawBaud = clockHz / (16.0 * div);
    baudRate = snapToStandardBaud(rawBaud);
    diagnostics.push(
      `RP2040 PL011 IBRD=${ibrd}, FBRD=${fbrd} with clock ${clockHz}Hz yields ~${baudRate} baud`,
    );
  }

  let dataBits: 5 | 6 | 7 | 8 | 9 = 8;
  let parity: "none" | "even" | "odd" = "none";
  let stopBits: 1 | 1.5 | 2 = 1;
  let flowControl: "none" | "rts_cts" | "xon_xoff" = "none";

  const lcrH = regs.LCR_H;
  if (typeof lcrH === "number") {
    const wlen = (lcrH >> 5) & 0x3;
    if (wlen === 3) dataBits = 8;
    else if (wlen === 2) dataBits = 7;
    else if (wlen === 1) dataBits = 6;
    else dataBits = 5;

    if ((lcrH & (1 << 3)) !== 0) stopBits = 2;
    if ((lcrH & (1 << 1)) !== 0) {
      parity = (lcrH & (1 << 2)) !== 0 ? "even" : "odd";
    }
  }

  const cr = regs.CR;
  if (typeof cr === "number") {
    if ((cr & (1 << 14)) !== 0 || (cr & (1 << 15)) !== 0) {
      flowControl = "rts_cts";
    }
  }

  return { baudRate, dataBits, parity, stopBits, flowControl };
};

const decodeNrf52Serial = (
  regs: Readonly<Record<string, number>>,
  diagnostics: string[],
): {
  baudRate: number | null;
  dataBits: 5 | 6 | 7 | 8 | 9;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 1.5 | 2;
  flowControl: "none" | "rts_cts" | "xon_xoff";
} => {
  let baudRate: number | null = null;
  const rawBaud = regs.BAUDRATE;
  if (typeof rawBaud === "number") {
    baudRate = NRF52_BAUD_MAP[rawBaud] ?? null;
    if (baudRate !== null) {
      diagnostics.push(
        `nRF52 BAUDRATE 0x${rawBaud.toString(16)} resolved to ${baudRate} baud`,
      );
    }
  }

  let parity: "none" | "even" | "odd" = "none";
  let flowControl: "none" | "rts_cts" | "xon_xoff" = "none";

  const config = regs.CONFIG;
  if (typeof config === "number") {
    if ((config & 0x1) !== 0) flowControl = "rts_cts";
    const parityField = (config >> 1) & 0x7;
    if (parityField !== 0) parity = "even";
  }

  return { baudRate, dataBits: 8, parity, stopBits: 1, flowControl };
};

const decodeEsp32Serial = (
  regs: Readonly<Record<string, number>>,
  clockHz: number,
  diagnostics: string[],
): {
  baudRate: number | null;
  dataBits: 5 | 6 | 7 | 8 | 9;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 1.5 | 2;
  flowControl: "none" | "rts_cts" | "xon_xoff";
} => {
  let baudRate: number | null = null;
  const clkdiv = regs.CLKDIV;
  if (typeof clkdiv === "number" && clkdiv > 0) {
    const intPart = clkdiv & 0xfffff;
    const fragPart = (clkdiv >> 20) & 0xf;
    const div = intPart + fragPart / 16.0;
    if (div > 0) {
      const rawBaud = clockHz / div;
      baudRate = snapToStandardBaud(rawBaud);
      diagnostics.push(
        `ESP32 CLKDIV 0x${clkdiv.toString(16)} with clock ${clockHz}Hz yields ~${baudRate} baud`,
      );
    }
  }

  let dataBits: 5 | 6 | 7 | 8 | 9 = 8;
  let parity: "none" | "even" | "odd" = "none";
  let stopBits: 1 | 1.5 | 2 = 1;
  const flowControl: "none" | "rts_cts" | "xon_xoff" = "none";

  const conf0 = regs.CONF0;
  if (typeof conf0 === "number") {
    const bitNum = (conf0 >> 2) & 0x3;
    if (bitNum === 3) dataBits = 8;
    else if (bitNum === 2) dataBits = 7;
    else if (bitNum === 1) dataBits = 6;
    else dataBits = 5;

    if ((conf0 & (1 << 1)) !== 0) {
      parity = (conf0 & 0x1) !== 0 ? "odd" : "even";
    }

    const stopNum = (conf0 >> 4) & 0x3;
    if (stopNum === 2) stopBits = 1.5;
    else if (stopNum === 3) stopBits = 2;
  }

  return { baudRate, dataBits, parity, stopBits, flowControl };
};

/**
 * Reconstruct serial line configuration (baud rate, data bits, parity, stop bits)
 * from observed peripheral register writes across microcontrollers.
 */
export const decodeSerialConfiguration = (
  platform: SocPlatform,
  peripheralName: string,
  registerValues: Readonly<Record<string, number>>,
  overrideClockHz?: number,
): DecodedSerialConfiguration => {
  const diagnostics: string[] = [];

  let decoded: {
    baudRate: number | null;
    dataBits: 5 | 6 | 7 | 8 | 9;
    parity: "none" | "even" | "odd";
    stopBits: 1 | 1.5 | 2;
    flowControl: "none" | "rts_cts" | "xon_xoff";
  };

  switch (platform) {
    case "stm32f1":
    case "gd32f1": {
      // USART1 is on APB2 (72 MHz), USART2..5 are on APB1 (36 MHz)
      const defaultClock = peripheralName.includes("USART1")
        ? 72000000
        : 36000000;
      decoded = decodeStm32Serial(
        registerValues,
        overrideClockHz ?? defaultClock,
        diagnostics,
      );
      break;
    }
    case "stm32f4": {
      // USART1/6 are on APB2 (84 MHz), others on APB1 (42 MHz)
      const defaultClock =
        peripheralName.includes("USART1") || peripheralName.includes("USART6")
          ? 84000000
          : 42000000;
      decoded = decodeStm32Serial(
        registerValues,
        overrideClockHz ?? defaultClock,
        diagnostics,
      );
      break;
    }
    case "rp2040": {
      // Standard clk_peri is 48 MHz
      decoded = decodeRp2040Serial(
        registerValues,
        overrideClockHz ?? 48000000,
        diagnostics,
      );
      break;
    }
    case "nrf52": {
      decoded = decodeNrf52Serial(registerValues, diagnostics);
      break;
    }
    case "esp32": {
      // Standard APB_CLK is 80 MHz
      decoded = decodeEsp32Serial(
        registerValues,
        overrideClockHz ?? 80000000,
        diagnostics,
      );
      break;
    }
  }

  const pChar =
    decoded.parity === "none" ? "N" : decoded.parity === "even" ? "E" : "O";
  const baudStr =
    decoded.baudRate !== null ? decoded.baudRate.toString() : "UNKNOWN";
  const formatString = `${baudStr} ${decoded.dataBits}-${pChar}-${decoded.stopBits}`;

  return {
    baudRate: decoded.baudRate,
    dataBits: decoded.dataBits,
    parity: decoded.parity,
    stopBits: decoded.stopBits,
    flowControl: decoded.flowControl,
    formatString,
    diagnostics,
  };
};
