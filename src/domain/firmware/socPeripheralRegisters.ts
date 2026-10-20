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

// STM32 General Purpose Timers (TIM1-TIM8).
export const STM32_TIM_REGISTERS: readonly SocPeripheralRegisterDefinition[] = [
  reg(
    0x00,
    "CR1",
    "Control register 1",
    "Counter enable (CEN), direction, auto-reload preload, clock division",
  ),
  reg(
    0x04,
    "CR2",
    "Control register 2",
    "Master mode selection (MMS), capture/compare DMA selection",
  ),
  reg(
    0x08,
    "SMCR",
    "Slave mode control register",
    "Slave mode selection (SMS), trigger selection (TS)",
  ),
  reg(
    0x0c,
    "DIER",
    "DMA/Interrupt enable register",
    "Update interrupt enable (UIE), capture/compare interrupt enables",
  ),
  reg(
    0x10,
    "SR",
    "Status register",
    "Update interrupt flag (UIF), capture/compare match flags",
  ),
  woReg(
    0x14,
    "EGR",
    "Event generation register",
    "Update generation (UG), capture/compare generation",
  ),
  reg(
    0x18,
    "CCMR1",
    "Capture/Compare mode register 1",
    "Channel 1 and 2 mode (PWM, input capture, output compare)",
  ),
  reg(
    0x1c,
    "CCMR2",
    "Capture/Compare mode register 2",
    "Channel 3 and 4 mode (PWM, input capture, output compare)",
  ),
  reg(
    0x20,
    "CCER",
    "Capture/Compare enable register",
    "Channel 1-4 output enable and polarity",
  ),
  reg(
    0x24,
    "CNT",
    "Counter register",
    "Current 16-bit or 32-bit counter value",
  ),
  reg(0x28, "PSC", "Prescaler register", "Clock prescaler division factor"),
  reg(
    0x2c,
    "ARR",
    "Auto-reload register",
    "Period value determining timer overflow rate",
  ),
  reg(
    0x34,
    "CCR1",
    "Capture/Compare register 1",
    "Channel 1 duty cycle / compare match value",
  ),
  reg(
    0x38,
    "CCR2",
    "Capture/Compare register 2",
    "Channel 2 duty cycle / compare match value",
  ),
];

// STM32 Serial Peripheral Interface (SPI1-SPI3).
export const STM32_SPI_REGISTERS: readonly SocPeripheralRegisterDefinition[] = [
  reg(
    0x00,
    "CR1",
    "Control register 1",
    "Clock phase/polarity, Master mode, Baud rate prescaler, SPI enable",
  ),
  reg(
    0x04,
    "CR2",
    "Control register 2",
    "TX/RX DMA enable, SS output enable, Error/TXE/RXNE interrupt enables",
  ),
  reg(
    0x08,
    "SR",
    "Status register",
    "RX buffer not empty (RXNE), TX buffer empty (TXE), Busy flag (BSY)",
  ),
  reg(0x0c, "DR", "Data register", "Transmit and receive data buffer"),
  reg(0x10, "CRCPR", "CRC polynomial register", "CRC polynomial register"),
  roReg(0x14, "RXCRCR", "RX CRC register", "Computed RX CRC register"),
  roReg(0x18, "TXCRCR", "TX CRC register", "Computed TX CRC register"),
];

// STM32 Inter-Integrated Circuit (I2C1-I2C3).
export const STM32_I2C_REGISTERS: readonly SocPeripheralRegisterDefinition[] = [
  reg(
    0x00,
    "CR1",
    "Control register 1",
    "Peripheral enable (PE), START condition, STOP condition, ACK control",
  ),
  reg(
    0x04,
    "CR2",
    "Control register 2",
    "Peripheral clock frequency, Event/Buffer/Error interrupt enables, DMA enable",
  ),
  reg(0x08, "OAR1", "Own address register 1", "Interface own slave address 1"),
  reg(
    0x0c,
    "OAR2",
    "Own address register 2",
    "Interface own slave address 2 (dual addressing mode)",
  ),
  reg(0x10, "DR", "Data register", "Transmit and receive data register"),
  reg(
    0x14,
    "SR1",
    "Status register 1",
    "Start bit sent (SB), Address matched (ADDR), Byte transfer finished (BTF)",
  ),
  roReg(
    0x18,
    "SR2",
    "Status register 2",
    "Master/Slave mode (MSL), Bus busy (BUSY), Transmitter/Receiver (TRA)",
  ),
  reg(
    0x1c,
    "CCR",
    "Clock control register",
    "Fast/Standard mode selection, Clock divider determining SCL speed",
  ),
  reg(0x20, "TRISE", "TRISE register", "Maximum SCL rise time configuration"),
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

// Raspberry Pi RP2040 PrimeCell PL011 UART registers (UART0, UART1).
export const RP2040_UART_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x00,
      "DR",
      "Data register",
      "UART transmit and receive data FIFO access",
    ),
    reg(
      0x04,
      "RSR",
      "Receive status register",
      "Overrun, break, parity, and framing error flags and error clear",
    ),
    roReg(
      0x18,
      "FR",
      "Flag register",
      "FIFO status flags (TXFE, RXFF, TXFF, RXFE, BUSY, CTS)",
    ),
    reg(
      0x24,
      "IBRD",
      "Integer baud rate divisor",
      "Integer part of baud rate divisor (16 bits)",
    ),
    reg(
      0x28,
      "FBRD",
      "Fractional baud rate divisor",
      "Fractional part of baud rate divisor (6 bits, 1/64 divisor step)",
    ),
    reg(
      0x2c,
      "LCR_H",
      "Line control register",
      "Word length (WLEN), parity enable, two stop bits, FIFO enable (FEN)",
    ),
    reg(
      0x30,
      "CR",
      "Control register",
      "UART enable (UARTEN), transmit enable (TXE), receive enable (RXE), flow control",
    ),
    reg(
      0x34,
      "IFLS",
      "Interrupt FIFO level select",
      "RX and TX FIFO trigger interrupt watermark thresholds",
    ),
    reg(
      0x38,
      "IMSC",
      "Interrupt mask set/clear",
      "Interrupt enable mask for TX, RX, timeout, and modem status",
    ),
    roReg(
      0x3c,
      "RIS",
      "Raw interrupt status",
      "Raw interrupt status prior to masking",
    ),
    roReg(0x40, "MIS", "Masked interrupt status", "Masked interrupt status"),
    woReg(
      0x44,
      "ICR",
      "Interrupt clear register",
      "Interrupt clear register for clearing pending interrupts",
    ),
    reg(
      0x48,
      "DMACR",
      "DMA control register",
      "Transmit and receive DMA enable (TXDMAE, RXDMAE)",
    ),
  ];

// Raspberry Pi RP2040 Single-Cycle I/O (SIO) registers.
export const RP2040_SIO_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    roReg(
      0x00,
      "CPUID",
      "Processor core ID",
      "Core identifier (0 for core 0, 1 for core 1)",
    ),
    roReg(
      0x04,
      "GPIO_IN",
      "GPIO input values",
      "Input logic values on GPIO pins 0 through 29",
    ),
    reg(
      0x10,
      "GPIO_OUT",
      "GPIO output values",
      "Driven output value on GPIO pins 0 through 29",
    ),
    woReg(
      0x14,
      "GPIO_OUT_SET",
      "GPIO output set",
      "Atomic bit set for GPIO output values",
    ),
    woReg(
      0x18,
      "GPIO_OUT_CLR",
      "GPIO output clear",
      "Atomic bit clear for GPIO output values",
    ),
    woReg(
      0x1c,
      "GPIO_OUT_XOR",
      "GPIO output invert",
      "Atomic bit invert for GPIO output values",
    ),
    reg(
      0x20,
      "GPIO_OE",
      "GPIO output enable",
      "Output driver enable on GPIO pins 0 through 29",
    ),
    woReg(
      0x24,
      "GPIO_OE_SET",
      "GPIO output enable set",
      "Atomic bit set for GPIO output driver enable",
    ),
    woReg(
      0x28,
      "GPIO_OE_CLR",
      "GPIO output enable clear",
      "Atomic bit clear for GPIO output driver enable",
    ),
    roReg(
      0x50,
      "FIFO_ST",
      "Inter-core FIFO status",
      "Status flags (VLD: data available, RDY: write ready)",
    ),
    woReg(
      0x54,
      "FIFO_WR",
      "Inter-core FIFO write",
      "Push 32-bit word into inter-core FIFO to other core",
    ),
    roReg(
      0x58,
      "FIFO_RD",
      "Inter-core FIFO read",
      "Pop 32-bit word from inter-core FIFO from other core",
    ),
  ];

// Nordic Semiconductor nRF52 EasyDMA UART (UARTE0, UARTE1).
export const NRF52_UARTE_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    woReg(
      0x000,
      "TASKS_STARTRX",
      "Start receiver task",
      "Start UART receiver with EasyDMA buffer",
    ),
    woReg(0x004, "TASKS_STOPRX", "Stop receiver task", "Stop UART receiver"),
    woReg(
      0x008,
      "TASKS_STARTTX",
      "Start transmitter task",
      "Start UART transmitter with EasyDMA buffer",
    ),
    woReg(
      0x00c,
      "TASKS_STOPTX",
      "Stop transmitter task",
      "Stop UART transmitter",
    ),
    reg(
      0x110,
      "EVENTS_RXDRDY",
      "Data ready in RXD event",
      "Data received in RXD event",
    ),
    reg(
      0x114,
      "EVENTS_ENDRX",
      "Receive buffer full event",
      "EasyDMA receive buffer filled event",
    ),
    reg(
      0x11c,
      "EVENTS_TXDRDY",
      "Data sent from TXD event",
      "Data transmitted from TXD event",
    ),
    reg(
      0x120,
      "EVENTS_ENDTX",
      "Transmit buffer drained event",
      "EasyDMA transmit buffer drained event",
    ),
    reg(
      0x124,
      "EVENTS_ERROR",
      "Error detected event",
      "Parity, framing, or overrun error detected event",
    ),
    reg(
      0x304,
      "INTENSET",
      "Interrupt enable set",
      "Enable selected UART interrupts",
    ),
    reg(
      0x308,
      "INTENCLR",
      "Interrupt enable clear",
      "Disable selected UART interrupts",
    ),
    reg(
      0x500,
      "ENABLE",
      "Enable UART transceiver",
      "Enable or disable UART (0: Disabled, 8: Enabled)",
    ),
    reg(
      0x524,
      "BAUDRATE",
      "Baud rate configuration",
      "UART baud rate constant (e.g. 0x01D7E000 for 115200 bps)",
    ),
    reg(
      0x534,
      "RXD_PTR",
      "EasyDMA RX buffer pointer",
      "RAM buffer pointer for receiving data",
    ),
    reg(
      0x538,
      "RXD_MAXCNT",
      "RX buffer maximum count",
      "Maximum byte capacity of EasyDMA RX buffer",
    ),
    roReg(
      0x53c,
      "RXD_AMOUNT",
      "RX bytes transferred",
      "Number of bytes received in current EasyDMA transaction",
    ),
    reg(
      0x544,
      "TXD_PTR",
      "EasyDMA TX buffer pointer",
      "RAM buffer pointer for transmitting data",
    ),
    reg(
      0x548,
      "TXD_MAXCNT",
      "TX buffer maximum count",
      "Maximum byte count of EasyDMA TX buffer",
    ),
    roReg(
      0x54c,
      "TXD_AMOUNT",
      "TX bytes transferred",
      "Number of bytes transmitted in current EasyDMA transaction",
    ),
    reg(
      0x56c,
      "CONFIG",
      "Configuration register",
      "Hardware flow control (HWFC) and parity configuration",
    ),
  ];

// Nordic Semiconductor nRF52 GPIO port registers (P0, P1).
export const NRF52_GPIO_REGISTERS: readonly SocPeripheralRegisterDefinition[] =
  [
    reg(
      0x504,
      "OUT",
      "Port output register",
      "Write output latch for GPIO port pins",
    ),
    woReg(
      0x508,
      "OUTSET",
      "Port output set register",
      "Atomic bit set for GPIO output latch",
    ),
    woReg(
      0x50c,
      "OUTCLR",
      "Port output clear register",
      "Atomic bit clear for GPIO output latch",
    ),
    roReg(
      0x510,
      "IN",
      "Port input register",
      "Read input logic level on GPIO port pins",
    ),
    reg(
      0x514,
      "DIR",
      "Port direction register",
      "Direction configuration (0: Input, 1: Output)",
    ),
    woReg(
      0x518,
      "DIRSET",
      "Port direction set register",
      "Atomic bit set for pin direction to output",
    ),
    woReg(
      0x51c,
      "DIRCLR",
      "Port direction clear register",
      "Atomic bit clear for pin direction to input",
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
  if (platform === "rp2040") {
    if (peripheralName.startsWith("UART")) return RP2040_UART_REGISTERS;
    if (peripheralName === "SIO") return RP2040_SIO_REGISTERS;
    return null;
  }
  if (platform === "nrf52") {
    if (peripheralName.startsWith("UART")) return NRF52_UARTE_REGISTERS;
    if (peripheralName === "P0" || peripheralName === "P1")
      return NRF52_GPIO_REGISTERS;
    return null;
  }
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
  if (peripheralName.startsWith("TIM")) {
    return STM32_TIM_REGISTERS;
  }
  if (peripheralName.startsWith("SPI")) {
    return STM32_SPI_REGISTERS;
  }
  if (peripheralName.startsWith("I2C")) {
    return STM32_I2C_REGISTERS;
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
