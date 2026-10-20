import {
  type SocPeripheralRegisterDefinition,
  reg,
  roReg,
  woReg,
} from "./types.js";

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
