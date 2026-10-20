import {
  type SocPeripheralRegisterDefinition,
  reg,
  roReg,
  woReg,
} from "./types.js";

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
