import type { InternalPeripheralEntry } from "./types.js";

// GigaDevice GD32F10x series peripheral memory map.
export const GD32F1_PERIPHERALS: readonly InternalPeripheralEntry[] = [
  // APB1
  {
    name: "TIMER1",
    base: 0x40000000n,
    size: 0x400,
    bus: "APB1",
    description: "General purpose timer 1 (TIM2 equivalent)",
  },
  {
    name: "TIMER2",
    base: 0x40000400n,
    size: 0x400,
    bus: "APB1",
    description: "General purpose timer 2 (TIM3 equivalent)",
  },
  {
    name: "RTC",
    base: 0x40002800n,
    size: 0x400,
    bus: "APB1",
    description: "Real-time clock",
  },
  {
    name: "WWDG",
    base: 0x40002c00n,
    size: 0x400,
    bus: "APB1",
    description: "Window watchdog timer",
  },
  {
    name: "FWDGT",
    base: 0x40003000n,
    size: 0x400,
    bus: "APB1",
    description: "Free watchdog timer (IWDG equivalent)",
  },
  {
    name: "SPI1",
    base: 0x40003800n,
    size: 0x400,
    bus: "APB1",
    description: "Serial peripheral interface 1 (SPI2 equivalent)",
  },
  {
    name: "USART1",
    base: 0x40004400n,
    size: 0x400,
    bus: "APB1",
    description: "Universal synchronous asynchronous receiver transmitter 1",
  },
  {
    name: "I2C0",
    base: 0x40005400n,
    size: 0x400,
    bus: "APB1",
    description: "Inter-integrated circuit 0 (I2C1 equivalent)",
  },
  // APB2
  {
    name: "AFIO",
    base: 0x40010000n,
    size: 0x400,
    bus: "APB2",
    description: "Alternate function I/O and EXTI routing",
  },
  {
    name: "EXTI",
    base: 0x40010400n,
    size: 0x400,
    bus: "APB2",
    description: "External interrupt controller",
  },
  {
    name: "GPIOA",
    base: 0x40010800n,
    size: 0x400,
    bus: "APB2",
    description: "General purpose I/O port A",
  },
  {
    name: "GPIOB",
    base: 0x40010c00n,
    size: 0x400,
    bus: "APB2",
    description: "General purpose I/O port B",
  },
  {
    name: "GPIOC",
    base: 0x40011000n,
    size: 0x400,
    bus: "APB2",
    description: "General purpose I/O port C",
  },
  {
    name: "ADC0",
    base: 0x40012400n,
    size: 0x400,
    bus: "APB2",
    description: "Analog-to-digital converter 0 (ADC1 equivalent)",
  },
  {
    name: "TIMER0",
    base: 0x40012c00n,
    size: 0x400,
    bus: "APB2",
    description: "Advanced timer 0 (TIM1 equivalent)",
  },
  {
    name: "SPI0",
    base: 0x40013000n,
    size: 0x400,
    bus: "APB2",
    description: "Serial peripheral interface 0 (SPI1 equivalent)",
  },
  {
    name: "USART0",
    base: 0x40013800n,
    size: 0x400,
    bus: "APB2",
    description:
      "Universal synchronous asynchronous receiver transmitter 0 (USART1 equivalent)",
  },
  // AHB
  {
    name: "DMA0",
    base: 0x40020000n,
    size: 0x400,
    bus: "AHB",
    description: "Direct memory access controller 0 (DMA1 equivalent)",
  },
  {
    name: "RCU",
    base: 0x40021000n,
    size: 0x400,
    bus: "AHB",
    description: "Reset and clock unit (RCC equivalent)",
  },
  {
    name: "FMC",
    base: 0x40022000n,
    size: 0x400,
    bus: "AHB",
    description: "Flash memory controller",
  },
];
