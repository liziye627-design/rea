import {
  type SocPeripheralRegisterDefinition,
  reg,
  roReg,
  woReg,
} from "./types.js";

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
