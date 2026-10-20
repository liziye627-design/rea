import { z } from "zod";
import {
  lookupSocPeripheral,
  type SocPeripheralDefinition,
  socPeripheralDefinitionSchema,
  type SocPlatform,
} from "./socPeripheralDatabase.js";

/** Definition for a known SoC peripheral register within a controller block. */
export interface SocPeripheralRegisterDefinition {
  readonly offset: number;
  readonly mnemonic: string;
  readonly name: string;
  readonly access: "read" | "write" | "read_write";
  readonly description: string;
}

export const socPeripheralRegisterDefinitionSchema = z.strictObject({
  offset: z.number().int().nonnegative(),
  mnemonic: z.string(),
  name: z.string(),
  access: z.enum(["read", "write", "read_write"]),
  description: z.string(),
});

/** Result of looking up an exact peripheral register address. */
export interface SocPeripheralRegisterLookupResult {
  readonly peripheral: SocPeripheralDefinition;
  readonly offset: number;
  readonly offsetHex: string;
  readonly mnemonic: string;
  readonly registerName: string;
  readonly access: "read" | "write" | "read_write";
  readonly description: string;
}

export const socPeripheralRegisterLookupResultSchema = z.strictObject({
  peripheral: socPeripheralDefinitionSchema,
  offset: z.number().int().nonnegative(),
  offsetHex: z.string(),
  mnemonic: z.string(),
  registerName: z.string(),
  access: z.enum(["read", "write", "read_write"]),
  description: z.string(),
});

const reg = (
  offset: number,
  mnemonic: string,
  name: string,
  description: string,
): SocPeripheralRegisterDefinition => ({
  offset,
  mnemonic,
  name,
  access: "read_write",
  description,
});

const roReg = (
  offset: number,
  mnemonic: string,
  name: string,
  description: string,
): SocPeripheralRegisterDefinition => ({
  offset,
  mnemonic,
  name,
  access: "read",
  description,
});

const woReg = (
  offset: number,
  mnemonic: string,
  name: string,
  description: string,
): SocPeripheralRegisterDefinition => ({
  offset,
  mnemonic,
  name,
  access: "write",
  description,
});

// STMicroelectronics STM32 / GigaDevice GD32 standard USART/UART register map.
export const STM32_USART_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "SR",
      "Status register",
      "Status flags (TXE, TC, RXNE, IDLE, ORE, NE, FE, PE)",
    ),
    reg(
      0x04,
      "DR",
      "Data register",
      "Transmit data register (TDR) and receive data register (RDR) buffer",
    ),
    reg(
      0x08,
      "BRR",
      "Baud rate register",
      "Baud rate prescaler mantissa [15:4] and fraction [3:0] for USARTDIV",
    ),
    reg(
      0x0c,
      "CR1",
      "Control register 1",
      "USART enable, word length, parity, interrupt enables (TXEIE, TCIE, RXNEIE), TE, RE",
    ),
    reg(
      0x10,
      "CR2",
      "Control register 2",
      "Stop bits (1, 0.5, 2, 1.5), LIN mode, clock output enable, and phase/polarity",
    ),
    reg(
      0x14,
      "CR3",
      "Control register 3",
      "DMA enable (DMAR, DMAT), hardware flow control (CTSE, RTSE), half-duplex",
    ),
    reg(
      0x18,
      "GTPR",
      "Guard time and prescaler register",
      "Guard time value and clock prescaler for smartcard mode",
    ),
  ];

// STM32F1 / GD32F1 GPIO port register map.
export const STM32F1_GPIO_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "CRL",
      "Port configuration register low",
      "Configuration and operating mode for I/O pins 0-7",
    ),
    reg(
      0x04,
      "CRH",
      "Port configuration register high",
      "Configuration and operating mode for I/O pins 8-15",
    ),
    roReg(
      0x08,
      "IDR",
      "Port input data register",
      "Input data register reflecting logic state of port pins 0-15",
    ),
    reg(
      0x0c,
      "ODR",
      "Port output data register",
      "Output data register holding driven output states of port pins 0-15",
    ),
    woReg(
      0x10,
      "BSRR",
      "Port bit set/reset register",
      "Atomic pin set (bits 0-15) and reset (bits 16-31) control register",
    ),
    woReg(
      0x14,
      "BRR",
      "Port bit reset register",
      "Atomic pin reset (bits 0-15) control register",
    ),
    reg(
      0x18,
      "LCKR",
      "Port configuration lock register",
      "Configuration lock sequence register freezing pin settings until reset",
    ),
  ];

// STM32F4 GPIO port register map.
export const STM32F4_GPIO_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "MODER",
      "GPIO port mode register",
      "Port pin mode (00: In, 01: Out, 10: AF, 11: Analog)",
    ),
    reg(
      0x04,
      "OTYPER",
      "GPIO port output type register",
      "Port output type (0: Push-pull, 1: Open-drain)",
    ),
    reg(
      0x08,
      "OSPEEDR",
      "GPIO port output speed register",
      "Port output speed (Low, Medium, Fast, High speed)",
    ),
    reg(
      0x0c,
      "PUPDR",
      "GPIO port pull-up/pull-down register",
      "Port pull-up/pull-down (No pull, Pull-up, Pull-down)",
    ),
    roReg(
      0x10,
      "IDR",
      "GPIO port input data register",
      "Port pin input logic values for pins 0-15",
    ),
    reg(
      0x14,
      "ODR",
      "GPIO port output data register",
      "Port pin output data latch for pins 0-15",
    ),
    woReg(
      0x18,
      "BSRR",
      "GPIO port bit set/reset register",
      "Atomic bit set (bits 0-15) and reset (bits 16-31)",
    ),
    reg(
      0x1c,
      "LCKR",
      "GPIO port configuration lock register",
      "Port configuration freeze and lock register",
    ),
    reg(
      0x20,
      "AFRL",
      "GPIO alternate function low register",
      "Alternate function selection for pins 0-7 (AF0-AF15)",
    ),
    reg(
      0x24,
      "AFRH",
      "GPIO alternate function high register",
      "Alternate function selection for pins 8-15 (AF0-AF15)",
    ),
  ];

// STM32F1 / GD32F1 Reset and Clock Control (RCC / RCU) register map.
export const STM32F1_RCC_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "CR",
      "Clock control register",
      "HSI, HSE, CSS, and PLL enable controls and ready status flags",
    ),
    reg(
      0x04,
      "CFGR",
      "Clock configuration register",
      "System clock switch, AHB/APB prescalers, PLL clock source and mult",
    ),
    reg(
      0x08,
      "CIR",
      "Clock interrupt register",
      "Clock security system and oscillator ready interrupt flags and clear",
    ),
    reg(
      0x0c,
      "APB2RSTR",
      "APB2 peripheral reset register",
      "Reset control for APB2 peripherals (AFIO, GPIO, ADC, TIM1, SPI1, USART1)",
    ),
    reg(
      0x10,
      "APB1RSTR",
      "APB1 peripheral reset register",
      "Reset control for APB1 peripherals (TIM2-7, USART2-5, I2C, SPI2-3, CAN)",
    ),
    reg(
      0x14,
      "AHBENR",
      "AHB peripheral clock enable register",
      "Clock enable for DMA1-2, SRAM, Flash, CRC, FSMC, SDIO",
    ),
    reg(
      0x18,
      "APB2ENR",
      "APB2 peripheral clock enable register",
      "Clock enable for AFIO, GPIOA-G, ADC1-3, TIM1/8, SPI1, USART1",
    ),
    reg(
      0x1c,
      "APB1ENR",
      "APB1 peripheral clock enable register",
      "Clock enable for TIM2-7, USART2-5, I2C1-2, SPI2-3, CAN1, PWR, BKP",
    ),
    reg(
      0x20,
      "BDCR",
      "Backup domain control register",
      "RTC clock source selection, RTC clock enable, backup domain reset",
    ),
    reg(
      0x24,
      "CSR",
      "Control/status register",
      "LSI oscillator enable and reset status flags (POR, PIN, SFT, IWDG)",
    ),
  ];

// STM32F4 Reset and Clock Control (RCC) register map.
export const STM32F4_RCC_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "CR",
      "Clock control register",
      "HSI, HSE, CSS, Main PLL, and PLLI2S enable and ready flags",
    ),
    reg(
      0x04,
      "PLLCFGR",
      "PLL configuration register",
      "Main PLL division factors (PLLM, PLLN, PLLP, PLLQ) and clock source",
    ),
    reg(
      0x08,
      "CFGR",
      "Clock configuration register",
      "System clock switch, AHB (HCLK), APB1 (PCLK1), APB2 (PCLK2) prescalers",
    ),
    reg(
      0x0c,
      "CIR",
      "Clock interrupt register",
      "Clock ready and security interrupt enables, pending flags, and clear",
    ),
    reg(
      0x10,
      "AHB1RSTR",
      "AHB1 peripheral reset register",
      "Reset control for GPIOA-K, CRC, DMA1, DMA2, Ethernet",
    ),
    reg(
      0x20,
      "APB1RSTR",
      "APB1 peripheral reset register",
      "Reset control for TIM2-14, USART2-5, I2C1-3, SPI2-3, CAN1-2, PWR",
    ),
    reg(
      0x24,
      "APB2RSTR",
      "APB2 peripheral reset register",
      "Reset control for TIM1/8/9/10/11, USART1/6, ADC1-3, SDIO, SPI1-6",
    ),
    reg(
      0x30,
      "AHB1ENR",
      "AHB1 peripheral clock enable register",
      "Clock enable for GPIOA-K, CRC, BKPSRAM, DMA1, DMA2, Ethernet",
    ),
    reg(
      0x40,
      "APB1ENR",
      "APB1 peripheral clock enable register",
      "Clock enable for TIM2-14, USART2-5, I2C1-3, SPI2-3, CAN1-2, PWR",
    ),
    reg(
      0x44,
      "APB2ENR",
      "APB2 peripheral clock enable register",
      "Clock enable for TIM1/8/9/10/11, USART1/6, ADC1-3, SDIO, SPI1-6, SYSCFG",
    ),
  ];

// Espressif ESP32 UART controller register map (UART0, UART1, UART2).
export const ESP32_UART_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "FIFO",
      "FIFO data register",
      "UART transmit and receive FIFO buffer access",
    ),
    roReg(
      0x04,
      "INT_RAW",
      "Raw interrupt status register",
      "Raw interrupt status flags (RXFIFO_FULL, TXFIFO_EMPTY, PARITY_ERR, FRM_ERR, RXFIFO_TOUT)",
    ),
    roReg(
      0x08,
      "INT_ST",
      "Masked interrupt status register",
      "Masked interrupt pending status after enable mask",
    ),
    reg(
      0x0c,
      "INT_ENA",
      "Interrupt enable register",
      "UART interrupt enable control mask",
    ),
    woReg(
      0x10,
      "INT_CLR",
      "Interrupt clear register",
      "Interrupt clear flags for resetting pending interrupts",
    ),
    reg(
      0x14,
      "CLKDIV",
      "Clock divider configuration register",
      "Integer [19:0] and fractional [23:20] clock divider for baud rate",
    ),
    reg(
      0x18,
      "AUTOBAUD",
      "Autobaud configuration register",
      "Hardware automatic baud rate detection enable and glitch filter",
    ),
    roReg(
      0x1c,
      "STATUS",
      "UART status register",
      "RX FIFO counter [7:0], TX FIFO counter [23:16], and DSR/CTS pin status",
    ),
    reg(
      0x20,
      "CONF0",
      "Configuration register 0",
      "Parity mode, parity enable, stop bits, data length, loopback, TX/RX reset",
    ),
    reg(
      0x24,
      "CONF1",
      "Configuration register 1",
      "RX FIFO full threshold, TX FIFO empty threshold, RX timeout threshold",
    ),
    roReg(
      0x28,
      "LOWPULSE",
      "Autobaud minimum low pulse duration",
      "Autobaud minimum low pulse duration counter",
    ),
    roReg(
      0x2c,
      "HIGHPULSE",
      "Autobaud minimum high pulse duration",
      "Autobaud minimum high pulse duration counter",
    ),
    roReg(
      0x30,
      "RXD_CNT",
      "Autobaud edge count",
      "Autobaud edge transition counter",
    ),
    reg(
      0x34,
      "FLOW_CONF",
      "Software flow control configuration",
      "XON/XOFF software flow control thresholds and characters",
    ),
    reg(
      0x38,
      "SLEEP_CONF",
      "Sleep mode configuration",
      "UART light sleep wakeup threshold counter",
    ),
    reg(
      0x3c,
      "SWFC_CONF",
      "Software flow control characters",
      "XON and XOFF character definitions for software flow control",
    ),
    reg(
      0x40,
      "IDLE_CONF",
      "Frame end and idle configuration",
      "Frame end idle duration counter for frame detection",
    ),
    reg(
      0x44,
      "RS485_CONF",
      "RS-485 turnaround configuration",
      "RS-485 half-duplex direction control and turnaround delay",
    ),
    reg(
      0x48,
      "AT_CMD_PRECNT",
      "AT command pre-sequence guard time",
      "AT command escape sequence pre-idle duration",
    ),
    reg(
      0x4c,
      "AT_CMD_POSTCNT",
      "AT command post-sequence guard time",
      "AT command escape sequence post-idle duration",
    ),
    reg(
      0x50,
      "AT_CMD_GAPTOUT",
      "AT command character timeout",
      "Timeout duration between individual AT escape characters",
    ),
    reg(
      0x54,
      "AT_CMD_CHAR",
      "AT command character",
      "Escape sequence character definition (default '+')",
    ),
    reg(
      0x58,
      "MEM_CONF",
      "UART memory power down configuration",
      "Power-down and clock gating control for UART buffer RAM",
    ),
    roReg(
      0x5c,
      "MEM_TX_STATUS",
      "UART TX memory status",
      "Transmit FIFO memory read/write pointers and status",
    ),
    roReg(
      0x60,
      "MEM_RX_STATUS",
      "UART RX memory status",
      "Receive FIFO memory read/write pointers and status",
    ),
    roReg(
      0x64,
      "MEM_CNT_STATUS",
      "UART memory FIFO word counter",
      "RAM word count in transmit and receive buffer FIFOs",
    ),
    reg(
      0x78,
      "DATE",
      "UART version control register",
      "Hardware version date stamp register",
    ),
    reg(
      0x7c,
      "ID",
      "UART peripheral ID register",
      "Peripheral identifier register",
    ),
  ];

// Espressif ESP32 GPIO controller register map.
export const ESP32_GPIO_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x04,
      "OUT",
      "GPIO0-31 output register",
      "Output value driven on GPIO0 through GPIO31",
    ),
    woReg(
      0x08,
      "OUT_W1TS",
      "GPIO0-31 output set register",
      "Atomic bit set for GPIO0 through GPIO31 output",
    ),
    woReg(
      0x0c,
      "OUT_W1TC",
      "GPIO0-31 output clear register",
      "Atomic bit clear for GPIO0 through GPIO31 output",
    ),
    reg(
      0x10,
      "OUT1",
      "GPIO32-39 output register",
      "Output value driven on GPIO32 through GPIO39",
    ),
    woReg(
      0x14,
      "OUT1_W1TS",
      "GPIO32-39 output set register",
      "Atomic bit set for GPIO32 through GPIO39 output",
    ),
    woReg(
      0x18,
      "OUT1_W1TC",
      "GPIO32-39 output clear register",
      "Atomic bit clear for GPIO32 through GPIO39 output",
    ),
    reg(
      0x20,
      "ENABLE",
      "GPIO0-31 output enable register",
      "Output driver enable for GPIO0 through GPIO31",
    ),
    woReg(
      0x24,
      "ENABLE_W1TS",
      "GPIO0-31 output enable set register",
      "Atomic output driver enable bit set for GPIO0 through GPIO31",
    ),
    woReg(
      0x28,
      "ENABLE_W1TC",
      "GPIO0-31 output enable clear register",
      "Atomic output driver enable bit clear for GPIO0 through GPIO31",
    ),
    roReg(
      0x3c,
      "IN",
      "GPIO0-31 input value register",
      "Pin logic level on GPIO0 through GPIO31",
    ),
    roReg(
      0x40,
      "IN1",
      "GPIO32-39 input value register",
      "Pin logic level on GPIO32 through GPIO39",
    ),
    reg(
      0x44,
      "STATUS",
      "GPIO0-31 interrupt status register",
      "Interrupt pending status for GPIO0 through GPIO31",
    ),
    woReg(
      0x48,
      "STATUS_W1TS",
      "GPIO0-31 interrupt status set register",
      "Interrupt pending status set for GPIO0 through GPIO31",
    ),
    woReg(
      0x4c,
      "STATUS_W1TC",
      "GPIO0-31 interrupt status clear register",
      "Atomic interrupt pending clear register for GPIO0 through GPIO31",
    ),
  ];

const HEX_ADDRESS_REGEX = /^0x[0-9a-fA-F]{1,16}$/u;

const resolveRegisterDefinitions = (
  peripheralName: string,
  platform: SocPlatform,
): readonly SocPeripheralRegisterDefinition[] | null => {
  if (peripheralName.startsWith("USART") || peripheralName.startsWith("UART")) {
    return platform === "esp32" ? ESP32_UART_REGISTERS : STM32_USART_REGISTERS;
  }
  if (peripheralName.startsWith("GPIO")) {
    if (platform === "esp32") return ESP32_GPIO_REGISTERS;
    if (platform === "stm32f4") return STM32F4_GPIO_REGISTERS;
    return STM32F1_GPIO_REGISTERS;
  }
  if (peripheralName === "RCC" || peripheralName === "RCU") {
    if (platform === "stm32f4") return STM32F4_RCC_REGISTERS;
    return STM32F1_RCC_REGISTERS;
  }
  return null;
};

/**
 * Look up a specific register within an SoC peripheral block given a raw memory address.
 * Matches peripheral block boundaries, computes offset, and indexes the peripheral's register map.
 */
export const lookupSocPeripheralRegister = (
  rawAddress: string | bigint,
  platform: SocPlatform,
): SocPeripheralRegisterLookupResult | null => {
  const peripheral = lookupSocPeripheral(rawAddress, platform);
  if (peripheral === null) return null;

  let addressBigInt: bigint;
  if (typeof rawAddress === "bigint") {
    addressBigInt = rawAddress;
  } else if (
    typeof rawAddress === "string" &&
    HEX_ADDRESS_REGEX.test(rawAddress)
  ) {
    try {
      addressBigInt = BigInt(rawAddress);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const offsetBigInt = addressBigInt - peripheral.baseAddressValue;
  if (offsetBigInt < 0n || offsetBigInt > BigInt(peripheral.sizeBytes)) {
    return null;
  }

  const offset = Number(offsetBigInt);
  const regDefs = resolveRegisterDefinitions(peripheral.name, platform);
  if (regDefs === null) return null;

  const matchedReg = regDefs.find((r) => r.offset === offset);
  if (!matchedReg) return null;

  return {
    peripheral,
    offset,
    offsetHex: `0x${offset.toString(16)}`,
    mnemonic: `${peripheral.name}_${matchedReg.mnemonic}`,
    registerName: `${peripheral.name} ${matchedReg.name}`,
    access: matchedReg.access,
    description: matchedReg.description,
  };
};
