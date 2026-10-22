import { z } from "zod";
import type { SocPlatform } from "./socPeripheralDatabase.js";

/** Decoded GPIO pin direction. */
export const pinDirectionSchema = z.enum([
  "input",
  "output",
  "alternate_function",
  "analog",
  "unknown",
]);
export type PinDirection = z.infer<typeof pinDirectionSchema>;

/** Decoded GPIO drive and bias mode. */
export const pinDriveModeSchema = z.enum([
  "push_pull",
  "open_drain",
  "floating",
  "pull_up",
  "pull_down",
  "analog",
  "high_drive",
  "disconnect",
  "unknown",
]);
export type PinDriveMode = z.infer<typeof pinDriveModeSchema>;

/** Decoded peripheral alternate function signal mapping. */
export interface AlternateFunctionBinding {
  readonly functionId: number | string;
  readonly signal: string;
  readonly peripheral: string;
}

export const alternateFunctionBindingSchema = z.strictObject({
  functionId: z.union([z.number().int(), z.string()]),
  signal: z.string(),
  peripheral: z.string(),
});

/** Full decoded physical pin configuration. */
export interface PinConfiguration {
  readonly pinName: string;
  readonly port: string;
  readonly pinIndex: number;
  readonly platform: SocPlatform;
  readonly direction: PinDirection;
  readonly driveMode: PinDriveMode;
  readonly speed?: string | null;
  readonly alternateFunction?: AlternateFunctionBinding | null;
  readonly rawRegisterValues: Readonly<Record<string, number>>;
  readonly description: string;
}

export const pinConfigurationSchema = z.strictObject({
  pinName: z.string(),
  port: z.string(),
  pinIndex: z.number().int().min(0).max(31),
  platform: z.enum([
    "stm32f1",
    "stm32f4",
    "gd32f1",
    "esp32",
    "rp2040",
    "nrf52",
  ]),
  direction: pinDirectionSchema,
  driveMode: pinDriveModeSchema,
  speed: z.string().nullable().optional(),
  alternateFunction: alternateFunctionBindingSchema.nullable().optional(),
  rawRegisterValues: z.record(z.string(), z.number()),
  description: z.string(),
});

// STM32F10x default AF mapping for common peripherals
const STM32F1_DEFAULT_AF: Record<string, AlternateFunctionBinding> = {
  "GPIOA:9": { functionId: "AF_PP", signal: "USART1_TX", peripheral: "USART1" },
  "GPIOA:10": {
    functionId: "AF_IN",
    signal: "USART1_RX",
    peripheral: "USART1",
  },
  "GPIOA:2": { functionId: "AF_PP", signal: "USART2_TX", peripheral: "USART2" },
  "GPIOA:3": { functionId: "AF_IN", signal: "USART2_RX", peripheral: "USART2" },
  "GPIOB:10": {
    functionId: "AF_PP",
    signal: "USART3_TX",
    peripheral: "USART3",
  },
  "GPIOB:11": {
    functionId: "AF_IN",
    signal: "USART3_RX",
    peripheral: "USART3",
  },
  "GPIOA:5": { functionId: "AF_PP", signal: "SPI1_SCK", peripheral: "SPI1" },
  "GPIOA:6": { functionId: "AF_IN", signal: "SPI1_MISO", peripheral: "SPI1" },
  "GPIOA:7": { functionId: "AF_PP", signal: "SPI1_MOSI", peripheral: "SPI1" },
  "GPIOB:13": { functionId: "AF_PP", signal: "SPI2_SCK", peripheral: "SPI2" },
  "GPIOB:14": { functionId: "AF_IN", signal: "SPI2_MISO", peripheral: "SPI2" },
  "GPIOB:15": { functionId: "AF_PP", signal: "SPI2_MOSI", peripheral: "SPI2" },
  "GPIOB:6": { functionId: "AF_OD", signal: "I2C1_SCL", peripheral: "I2C1" },
  "GPIOB:7": { functionId: "AF_OD", signal: "I2C1_SDA", peripheral: "I2C1" },
  "GPIOA:11": { functionId: "AF_IN", signal: "CAN_RX", peripheral: "CAN1" },
  "GPIOA:12": { functionId: "AF_PP", signal: "CAN_TX", peripheral: "CAN1" },
};

/**
 * Decodes STM32F1 / GD32F1 GPIO CRL (pins 0..7) or CRH (pins 8..15) register field.
 * Each pin has 4 bits: CNF[1:0] (bits 3:2) and MODE[1:0] (bits 1:0).
 */
export const decodeStm32f1GpioPin = (
  port: string,
  pinIndex: number,
  crRegisterValue: number,
): PinConfiguration => {
  const normPort = port.toUpperCase();
  const relPin = pinIndex % 8;
  const shift = relPin * 4;
  const nibble = (crRegisterValue >>> shift) & 0x0f;
  const modeBits = nibble & 0x03;
  const cnfBits = (nibble >>> 2) & 0x03;

  let direction: PinDirection = "unknown";
  let driveMode: PinDriveMode = "unknown";
  let speed: string | null = null;
  let alternateFunction: AlternateFunctionBinding | null = null;

  if (modeBits === 0b00) {
    direction = "input";
    if (cnfBits === 0b00) {
      direction = "analog";
      driveMode = "analog";
    } else if (cnfBits === 0b01) {
      driveMode = "floating";
    } else if (cnfBits === 0b10) {
      driveMode = "pull_up"; // or pull_down depending on ODR
    }
  } else {
    speed = modeBits === 0b01 ? "10MHz" : modeBits === 0b10 ? "2MHz" : "50MHz";
    if (cnfBits === 0b00) {
      direction = "output";
      driveMode = "push_pull";
    } else if (cnfBits === 0b01) {
      direction = "output";
      driveMode = "open_drain";
    } else if (cnfBits === 0b10) {
      direction = "alternate_function";
      driveMode = "push_pull";
    } else if (cnfBits === 0b11) {
      direction = "alternate_function";
      driveMode = "open_drain";
    }
  }

  const pinKey = `${normPort}:${pinIndex}`;
  if (
    direction === "alternate_function" ||
    (direction === "input" && STM32F1_DEFAULT_AF[pinKey])
  ) {
    const af = STM32F1_DEFAULT_AF[pinKey];
    if (af) {
      alternateFunction = af;
    }
  }

  const pinName = `P${normPort.replace(/^GPIO/, "")}${pinIndex}`;
  const desc = alternateFunction
    ? `${pinName} configured as ${alternateFunction.signal} (${direction}, ${driveMode})`
    : `${pinName} configured as ${direction} (${driveMode}${speed ? `, ${speed}` : ""})`;

  return {
    pinName,
    port: normPort,
    pinIndex,
    platform: "stm32f1",
    direction,
    driveMode,
    speed,
    alternateFunction,
    rawRegisterValues: { CR: nibble },
    description: desc,
  };
};

// STM32F4 AF mappings
const STM32F4_AF_NAMES: readonly string[] = [
  "AF0 (SYSTEM)",
  "AF1 (TIM1/TIM2)",
  "AF2 (TIM3..5)",
  "AF3 (TIM8..11)",
  "AF4 (I2C1..3)",
  "AF5 (SPI1..4)",
  "AF6 (SPI3/SAI1)",
  "AF7 (USART1..3)",
  "AF8 (UART4..5/USART6)",
  "AF9 (CAN1..2/TIM12..14)",
  "AF10 (OTG_FS/OTG_HS)",
  "AF11 (ETH)",
  "AF12 (FSMC/SDIO/OTG_HS)",
  "AF13 (DCMI)",
  "AF14 (LTDC)",
  "AF15 (EVENTOUT)",
];

/**
 * Decodes STM32F4 GPIO pin from MODER, OTYPER, PUPDR, and AFR values.
 */
export const decodeStm32f4GpioPin = (options: {
  port: string;
  pinIndex: number;
  moderVal: number;
  otyperVal?: number;
  pupdrVal?: number;
  afrVal?: number;
}): PinConfiguration => {
  const normPort = options.port.toUpperCase();
  const pin = options.pinIndex;
  const modBits = (options.moderVal >>> (pin * 2)) & 0x03;
  const otBit =
    options.otyperVal !== undefined ? (options.otyperVal >>> pin) & 0x01 : 0;
  const pupdBits =
    options.pupdrVal !== undefined
      ? (options.pupdrVal >>> (pin * 2)) & 0x03
      : 0;
  const afNibble =
    options.afrVal !== undefined
      ? (options.afrVal >>> ((pin % 8) * 4)) & 0x0f
      : 0;

  let direction: PinDirection = "unknown";
  let driveMode: PinDriveMode = "unknown";
  let alternateFunction: AlternateFunctionBinding | null = null;

  if (modBits === 0b00) {
    direction = "input";
    driveMode =
      pupdBits === 0b01
        ? "pull_up"
        : pupdBits === 0b10
          ? "pull_down"
          : "floating";
  } else if (modBits === 0b01) {
    direction = "output";
    driveMode = otBit === 1 ? "open_drain" : "push_pull";
  } else if (modBits === 0b10) {
    direction = "alternate_function";
    driveMode = otBit === 1 ? "open_drain" : "push_pull";
    const afName = STM32F4_AF_NAMES[afNibble] ?? `AF${afNibble}`;
    alternateFunction = {
      functionId: afNibble,
      signal: afName,
      peripheral: afName.split(" ")[1]?.replace(/[()]/g, "") ?? `AF${afNibble}`,
    };
  } else if (modBits === 0b11) {
    direction = "analog";
    driveMode = "analog";
  }

  const pinName = `P${normPort.replace(/^GPIO/, "")}${pin}`;
  const desc = alternateFunction
    ? `${pinName} configured as ${alternateFunction.signal} (${direction}, ${driveMode})`
    : `${pinName} configured as ${direction} (${driveMode})`;

  return {
    pinName,
    port: normPort,
    pinIndex: pin,
    platform: "stm32f4",
    direction,
    driveMode,
    alternateFunction,
    rawRegisterValues: {
      MODER: modBits,
      OTYPER: otBit,
      PUPDR: pupdBits,
      AFR: afNibble,
    },
    description: desc,
  };
};

// RP2040 FUNCSEL table
const RP2040_FUNCSEL_NAMES: readonly string[] = [
  "SPI",
  "UART",
  "I2C",
  "PWM",
  "SIO",
  "PIO0",
  "PIO1",
  "GPCK",
  "USB",
];

/**
 * Decodes RP2040 GPIO pin from GPIOx_CTRL register (FUNCSEL in bits 4:0).
 */
export const decodeRp2040GpioPin = (
  pinIndex: number,
  gpioCtrlValue: number,
): PinConfiguration => {
  const funcsel = gpioCtrlValue & 0x1f;
  let direction: PinDirection = "alternate_function";
  let driveMode: PinDriveMode = "push_pull";
  let alternateFunction: AlternateFunctionBinding | null = null;

  if (funcsel === 4) {
    // SIO (Software Controlled IO)
    direction = "output"; // SIO can be in or out
    driveMode = "push_pull";
  } else if (funcsel === 31) {
    direction = "unknown";
    driveMode = "disconnect";
  } else {
    const fnName = RP2040_FUNCSEL_NAMES[funcsel] ?? `FUNC_${funcsel}`;
    alternateFunction = {
      functionId: funcsel,
      signal: `${fnName}_GPIO${pinIndex}`,
      peripheral: fnName,
    };
  }

  const pinName = `GPIO${pinIndex}`;
  const desc = alternateFunction
    ? `${pinName} configured for ${alternateFunction.peripheral} (${alternateFunction.signal})`
    : `${pinName} configured as SIO / Software GPIO`;

  return {
    pinName,
    port: "GPIO",
    pinIndex,
    platform: "rp2040",
    direction,
    driveMode,
    alternateFunction,
    rawRegisterValues: { GPIO_CTRL: gpioCtrlValue },
    description: desc,
  };
};

/**
 * Decodes Nordic nRF52 PIN_CNF register for a GPIO pin.
 * Bits: 0=DIR (0=In, 1=Out), 1=INPUT (0=Connect, 1=Disconnect), 3:2=PULL, 10:8=DRIVE.
 */
export const decodeNrf52PinCnf = (
  pinIndex: number,
  pinCnfValue: number,
): PinConfiguration => {
  const dir = pinCnfValue & 0x01;
  const input = (pinCnfValue >>> 1) & 0x01;
  const pull = (pinCnfValue >>> 2) & 0x03;
  const drive = (pinCnfValue >>> 8) & 0x07;

  let direction: PinDirection = "unknown";
  let driveMode: PinDriveMode = "unknown";

  if (dir === 0) {
    direction = input === 0 ? "input" : "unknown";
    driveMode =
      pull === 0b01 ? "pull_down" : pull === 0b11 ? "pull_up" : "floating";
  } else {
    direction = "output";
    driveMode = drive >= 1 ? "high_drive" : "push_pull";
  }

  const pinName = `P0.${pinIndex.toString().padStart(2, "0")}`;
  const desc = `${pinName} configured as ${direction} (${driveMode})`;

  return {
    pinName,
    port: "P0",
    pinIndex,
    platform: "nrf52",
    direction,
    driveMode,
    rawRegisterValues: { PIN_CNF: pinCnfValue },
    description: desc,
  };
};

/**
 * Decodes Nordic nRF52 peripheral PSEL register (e.g. UART0.PSEL.TXD, SPIM0.PSEL.SCK).
 * Bit 31: 0 = Connected, 1 = Disconnected; Bits 4:0: Pin number.
 */
export const decodeNrf52PeripheralPsel = (
  peripheral: string,
  signal: string,
  pselValue: number,
): { pin: number; connected: boolean; description: string } => {
  const disconnected = (pselValue & 0x80000000) !== 0;
  const pin = pselValue & 0x1f;
  const pinName = `P0.${pin.toString().padStart(2, "0")}`;

  if (disconnected) {
    return {
      pin,
      connected: false,
      description: `${peripheral} ${signal} is disconnected`,
    };
  }

  return {
    pin,
    connected: true,
    description: `${peripheral} ${signal} routed to physical pin ${pinName}`,
  };
};
