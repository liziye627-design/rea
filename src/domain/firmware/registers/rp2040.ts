import {
  type SocPeripheralRegisterDefinition,
  reg,
  roReg,
  woReg,
} from "./types.js";

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
