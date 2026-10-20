import type { SocPlatform } from "./socPeripheralDatabase.js";

export interface IrqDescriptor {
  readonly name: string;
  readonly peripheral: string | null;
  readonly description: string;
}

const d = (
  name: string,
  peripheral: string | null,
  description: string,
): IrqDescriptor => ({ name, peripheral, description });

// STM32F10x / GD32F10x standard interrupt vector table (RM0008).
export const STM32F1_IRQS: readonly IrqDescriptor[] = [
  d("WWDG_IRQHandler", "WWDG", "Window Watchdog interrupt"),
  d("PVD_IRQHandler", "PWR", "PVD through EXTI Line detection interrupt"),
  d("TAMPER_IRQHandler", null, "Tamper interrupt"),
  d("RTC_IRQHandler", "RTC", "RTC global interrupt"),
  d("FLASH_IRQHandler", "Flash_IF", "Flash memory global interrupt"),
  d("RCC_IRQHandler", "RCC", "RCC global interrupt"),
  d("EXTI0_IRQHandler", "EXTI", "EXTI Line 0 interrupt"),
  d("EXTI1_IRQHandler", "EXTI", "EXTI Line 1 interrupt"),
  d("EXTI2_IRQHandler", "EXTI", "EXTI Line 2 interrupt"),
  d("EXTI3_IRQHandler", "EXTI", "EXTI Line 3 interrupt"),
  d("EXTI4_IRQHandler", "EXTI", "EXTI Line 4 interrupt"),
  d("DMA1_Channel1_IRQHandler", "DMA1", "DMA1 Channel 1 interrupt"),
  d("DMA1_Channel2_IRQHandler", "DMA1", "DMA1 Channel 2 interrupt"),
  d("DMA1_Channel3_IRQHandler", "DMA1", "DMA1 Channel 3 interrupt"),
  d("DMA1_Channel4_IRQHandler", "DMA1", "DMA1 Channel 4 interrupt"),
  d("DMA1_Channel5_IRQHandler", "DMA1", "DMA1 Channel 5 interrupt"),
  d("DMA1_Channel6_IRQHandler", "DMA1", "DMA1 Channel 6 interrupt"),
  d("DMA1_Channel7_IRQHandler", "DMA1", "DMA1 Channel 7 interrupt"),
  d("ADC1_2_IRQHandler", "ADC1", "ADC1 and ADC2 global interrupt"),
  d(
    "USB_HP_CAN1_TX_IRQHandler",
    "CAN1",
    "USB High Priority or CAN1 TX interrupt",
  ),
  d(
    "USB_LP_CAN1_RX0_IRQHandler",
    "CAN1",
    "USB Low Priority or CAN1 RX0 interrupt",
  ),
  d("CAN1_RX1_IRQHandler", "CAN1", "CAN1 RX1 interrupt"),
  d("CAN1_SCE_IRQHandler", "CAN1", "CAN1 SCE interrupt"),
  d("EXTI9_5_IRQHandler", "EXTI", "EXTI Line[9:5] interrupts"),
  d("TIM1_BRK_IRQHandler", "TIM1", "TIM1 Break interrupt"),
  d("TIM1_UP_IRQHandler", "TIM1", "TIM1 Update interrupt"),
  d(
    "TIM1_TRG_COM_IRQHandler",
    "TIM1",
    "TIM1 Trigger and Commutation interrupt",
  ),
  d("TIM1_CC_IRQHandler", "TIM1", "TIM1 Capture Compare interrupt"),
  d("TIM2_IRQHandler", "TIM2", "TIM2 global interrupt"),
  d("TIM3_IRQHandler", "TIM3", "TIM3 global interrupt"),
  d("TIM4_IRQHandler", "TIM4", "TIM4 global interrupt"),
  d("I2C1_EV_IRQHandler", "I2C1", "I2C1 Event interrupt"),
  d("I2C1_ER_IRQHandler", "I2C1", "I2C1 Error interrupt"),
  d("I2C2_EV_IRQHandler", "I2C2", "I2C2 Event interrupt"),
  d("I2C2_ER_IRQHandler", "I2C2", "I2C2 Error interrupt"),
  d("SPI1_IRQHandler", "SPI1", "SPI1 global interrupt"),
  d("SPI2_IRQHandler", "SPI2", "SPI2 global interrupt"),
  d("USART1_IRQHandler", "USART1", "USART1 global interrupt"),
  d("USART2_IRQHandler", "USART2", "USART2 global interrupt"),
  d("USART3_IRQHandler", "USART3", "USART3 global interrupt"),
  d("EXTI15_10_IRQHandler", "EXTI", "EXTI Line[15:10] interrupts"),
  d("RTC_Alarm_IRQHandler", "RTC", "RTC Alarm through EXTI Line interrupt"),
  d("USBWakeUp_IRQHandler", null, "USB Wakeup from suspend through EXTI Line"),
];

// STM32F4xx series standard interrupt vector table (RM0090).
export const STM32F4_IRQS: readonly IrqDescriptor[] = [
  d("WWDG_IRQHandler", null, "Window Watchdog interrupt"),
  d("PVD_IRQHandler", "PWR", "PVD through EXTI Line detection interrupt"),
  d("TAMP_STAMP_IRQHandler", "RTC", "Tamper and TimeStamp interrupts"),
  d("RTC_WKUP_IRQHandler", "RTC", "RTC Wakeup interrupt through EXTI Line"),
  d("FLASH_IRQHandler", "Flash_IF", "Flash global interrupt"),
  d("RCC_IRQHandler", "RCC", "RCC global interrupt"),
  d("EXTI0_IRQHandler", "EXTI", "EXTI Line 0 interrupt"),
  d("EXTI1_IRQHandler", "EXTI", "EXTI Line 1 interrupt"),
  d("EXTI2_IRQHandler", "EXTI", "EXTI Line 2 interrupt"),
  d("EXTI3_IRQHandler", "EXTI", "EXTI Line 3 interrupt"),
  d("EXTI4_IRQHandler", "EXTI", "EXTI Line 4 interrupt"),
  d("DMA1_Stream0_IRQHandler", "DMA1", "DMA1 Stream 0 global interrupt"),
  d("DMA1_Stream1_IRQHandler", "DMA1", "DMA1 Stream 1 global interrupt"),
  d("DMA1_Stream2_IRQHandler", "DMA1", "DMA1 Stream 2 global interrupt"),
  d("DMA1_Stream3_IRQHandler", "DMA1", "DMA1 Stream 3 global interrupt"),
  d("DMA1_Stream4_IRQHandler", "DMA1", "DMA1 Stream 4 global interrupt"),
  d("DMA1_Stream5_IRQHandler", "DMA1", "DMA1 Stream 5 global interrupt"),
  d("DMA1_Stream6_IRQHandler", "DMA1", "DMA1 Stream 6 global interrupt"),
  d("ADC_IRQHandler", "ADC1_3", "ADC1, ADC2, and ADC3 global interrupts"),
  d("EXTI9_5_IRQHandler", "EXTI", "EXTI Line[9:5] interrupts"),
  d("TIM1_BRK_TIM9_IRQHandler", "TIM1", "TIM1 Break and TIM9 global interrupt"),
  d(
    "TIM1_UP_TIM10_IRQHandler",
    "TIM1",
    "TIM1 Update and TIM10 global interrupt",
  ),
  d(
    "TIM1_TRG_COM_TIM11_IRQHandler",
    "TIM1",
    "TIM1 Trigger/Commutation and TIM11",
  ),
  d("TIM1_CC_IRQHandler", "TIM1", "TIM1 Capture Compare interrupt"),
  d("TIM2_IRQHandler", "TIM2", "TIM2 global interrupt"),
  d("TIM3_IRQHandler", "TIM3", "TIM3 global interrupt"),
  d("TIM4_IRQHandler", "TIM4", "TIM4 global interrupt"),
  d("I2C1_EV_IRQHandler", "I2C1", "I2C1 Event interrupt"),
  d("I2C1_ER_IRQHandler", "I2C1", "I2C1 Error interrupt"),
  d("I2C2_EV_IRQHandler", "I2C2", "I2C2 Event interrupt"),
  d("I2C2_ER_IRQHandler", "I2C2", "I2C2 Error interrupt"),
  d("SPI1_IRQHandler", "SPI1", "SPI1 global interrupt"),
  d("SPI2_IRQHandler", null, "SPI2 global interrupt"),
  d("USART1_IRQHandler", "USART1", "USART1 global interrupt"),
  d("USART2_IRQHandler", "USART2", "USART2 global interrupt"),
  d("USART3_IRQHandler", "USART3", "USART3 global interrupt"),
  d("EXTI15_10_IRQHandler", "EXTI", "EXTI Line[15:10] interrupts"),
  d("RTC_Alarm_IRQHandler", "RTC", "RTC Alarm through EXTI Line interrupt"),
  d("OTG_FS_WKUP_IRQHandler", null, "USB OTG FS Wakeup through EXTI Line"),
  d("DMA1_Stream7_IRQHandler", "DMA1", "DMA1 Stream 7 global interrupt"),
  d("SDIO_IRQHandler", null, "SDIO global interrupt"),
  d("TIM5_IRQHandler", "TIM5", "TIM5 global interrupt"),
  d("SPI3_IRQHandler", null, "SPI3 global interrupt"),
  d("UART4_IRQHandler", null, "UART4 global interrupt"),
  d("UART5_IRQHandler", null, "UART5 global interrupt"),
  d("TIM6_DAC_IRQHandler", null, "TIM6 global and DAC1&2 underrun interrupts"),
  d("TIM7_IRQHandler", null, "TIM7 global interrupt"),
  d("DMA2_Stream0_IRQHandler", "DMA2", "DMA2 Stream 0 global interrupt"),
  d("DMA2_Stream1_IRQHandler", "DMA2", "DMA2 Stream 1 global interrupt"),
  d("DMA2_Stream2_IRQHandler", "DMA2", "DMA2 Stream 2 global interrupt"),
  d("DMA2_Stream3_IRQHandler", "DMA2", "DMA2 Stream 3 global interrupt"),
  d("DMA2_Stream4_IRQHandler", "DMA2", "DMA2 Stream 4 global interrupt"),
  d("ETH_IRQHandler", null, "Ethernet global interrupt"),
  d("ETH_WKUP_IRQHandler", null, "Ethernet Wakeup through EXTI Line interrupt"),
  d("CAN2_TX_IRQHandler", null, "CAN2 TX interrupt"),
  d("CAN2_RX0_IRQHandler", null, "CAN2 RX0 interrupt"),
  d("CAN2_RX1_IRQHandler", null, "CAN2 RX1 interrupt"),
  d("CAN2_SCE_IRQHandler", null, "CAN2 SCE interrupt"),
  d("OTG_FS_IRQHandler", null, "USB OTG FS global interrupt"),
  d("DMA2_Stream5_IRQHandler", "DMA2", "DMA2 Stream 5 global interrupt"),
  d("DMA2_Stream6_IRQHandler", "DMA2", "DMA2 Stream 6 global interrupt"),
  d("DMA2_Stream7_IRQHandler", "DMA2", "DMA2 Stream 7 global interrupt"),
  d("USART6_IRQHandler", "USART6", "USART6 global interrupt"),
  d("I2C3_EV_IRQHandler", null, "I2C3 event interrupt"),
  d("I2C3_ER_IRQHandler", null, "I2C3 error interrupt"),
  d("OTG_HS_EP1_OUT_IRQHandler", null, "USB OTG HS End Point 1 Out interrupt"),
  d("OTG_HS_EP1_IN_IRQHandler", null, "USB OTG HS End Point 1 In interrupt"),
  d("OTG_HS_WKUP_IRQHandler", null, "USB OTG HS Wakeup through EXTI Line"),
  d("OTG_HS_IRQHandler", null, "USB OTG HS global interrupt"),
  d("DCMI_IRQHandler", null, "DCMI global interrupt"),
  d("FPU_IRQHandler", null, "FPU global interrupt"),
];

// Raspberry Pi RP2040 dual Cortex-M0+ interrupt vector table (RP2040 Datasheet).
export const RP2040_IRQS: readonly IrqDescriptor[] = [
  d("TIMER_IRQ_0", "TIMER", "Timer Alarm 0 interrupt"),
  d("TIMER_IRQ_1", "TIMER", "Timer Alarm 1 interrupt"),
  d("TIMER_IRQ_2", "TIMER", "Timer Alarm 2 interrupt"),
  d("TIMER_IRQ_3", "TIMER", "Timer Alarm 3 interrupt"),
  d("PWM_IRQ_WRAP", "PWM", "PWM slice counter wrap interrupt"),
  d("USBCTRL_IRQ", "USBCTRL", "USB host/device controller interrupt"),
  d("XIP_IRQ", "IO_QSPI", "Execute-in-place QSPI flash interrupt"),
  d("PIO0_IRQ_0", "PIO0", "Programmable I/O 0 interrupt request 0"),
  d("PIO0_IRQ_1", "PIO0", "Programmable I/O 0 interrupt request 1"),
  d("PIO1_IRQ_0", "PIO1", "Programmable I/O 1 interrupt request 0"),
  d("PIO1_IRQ_1", "PIO1", "Programmable I/O 1 interrupt request 1"),
  d("DMA_IRQ_0", null, "DMA controller interrupt request 0"),
  d("DMA_IRQ_1", null, "DMA controller interrupt request 1"),
  d("IO_IRQ_BANK0", "IO_BANK0", "User GPIO bank 0 interrupt"),
  d("IO_IRQ_QSPI", "IO_QSPI", "Dedicated QSPI bank interrupt"),
  d(
    "SIO_IRQ_PROC0",
    "SIO",
    "Single-cycle I/O inter-core FIFO interrupt proc 0",
  ),
  d(
    "SIO_IRQ_PROC1",
    "SIO",
    "Single-cycle I/O inter-core FIFO interrupt proc 1",
  ),
  d("CLOCKS_IRQ", "CLOCKS", "Clock distribution and PLL interrupt"),
  d("SPI0_IRQ", "SPI0", "PrimeCell PL022 SPI0 interrupt"),
  d("SPI1_IRQ", "SPI1", "PrimeCell PL022 SPI1 interrupt"),
  d("UART0_IRQ", "UART0", "PrimeCell PL011 UART0 interrupt"),
  d("UART1_IRQ", "UART1", "PrimeCell PL011 UART1 interrupt"),
  d("ADC_IRQ_FIFO", "ADC", "ADC conversion complete / FIFO full interrupt"),
  d("I2C0_IRQ", "I2C0", "DesignWare I2C0 interrupt"),
  d("I2C1_IRQ", "I2C1", "DesignWare I2C1 interrupt"),
  d("RTC_IRQ", "RTC", "Real-time calendar clock interrupt"),
];

// Nordic Semiconductor nRF52 series (nRF52832, nRF52840) Cortex-M4F interrupt table.
export const NRF52_IRQS: readonly IrqDescriptor[] = [
  d(
    "POWER_CLOCK_IRQHandler",
    "CLOCK_POWER",
    "Power and clock management interrupt",
  ),
  d("RADIO_IRQHandler", "RADIO", "2.4 GHz radio interrupt (BLE/IEEE 802.15.4)"),
  d(
    "UARTE0_UART0_IRQHandler",
    "UART0",
    "UART0 / UARTE0 with EasyDMA interrupt",
  ),
  d(
    "SPIM0_SPIS0_TWIM0_TWIS0_IRQHandler",
    "SPI0_TWI0",
    "SPI0 / TWI0 with EasyDMA interrupt",
  ),
  d(
    "SPIM1_SPIS1_TWIM1_TWIS1_IRQHandler",
    "SPI1_TWI1",
    "SPI1 / TWI1 with EasyDMA interrupt",
  ),
  d("NFCT_IRQHandler", "NFCT", "NFC tag interrupt"),
  d(
    "GPIOTE_IRQHandler",
    "GPIOTE",
    "General purpose tasks and events interrupt",
  ),
  d(
    "SAADC_IRQHandler",
    "SAADC",
    "Analog-to-digital converter with EasyDMA interrupt",
  ),
  d("TIMER0_IRQHandler", "TIMER0", "Timer 0 interrupt"),
  d("TIMER1_IRQHandler", "TIMER1", "Timer 1 interrupt"),
  d("TIMER2_IRQHandler", "TIMER2", "Timer 2 interrupt"),
  d("RTC0_IRQHandler", "RTC0", "Real-time counter 0 interrupt"),
  d("TEMP_IRQHandler", "TEMP", "Temperature sensor interrupt"),
  d("RNG_IRQHandler", "RNG", "Random number generator interrupt"),
  d("ECB_IRQHandler", "ECB", "AES electronic codebook encryption interrupt"),
  d("CCM_AAR_IRQHandler", "CCM_AAR", "AES CCM and address resolver interrupt"),
  d("WDT_IRQHandler", "WDT", "Watchdog timer interrupt"),
  d("RTC1_IRQHandler", "RTC1", "Real-time counter 1 interrupt"),
  d("QDEC_IRQHandler", "QDEC", "Quadrature decoder interrupt"),
  d(
    "COMP_LPCOMP_IRQHandler",
    "COMP",
    "Comparator and low power comparator interrupt",
  ),
  d(
    "SWI0_EGU0_IRQHandler",
    "EGU0_SWI0",
    "Software interrupt 0 / Event generator 0",
  ),
  d("SWI1_EGU1_IRQHandler", null, "Software interrupt 1 / Event generator 1"),
  d("SWI2_EGU2_IRQHandler", null, "Software interrupt 2 / Event generator 2"),
  d("SWI3_EGU3_IRQHandler", null, "Software interrupt 3 / Event generator 3"),
  d("SWI4_EGU4_IRQHandler", null, "Software interrupt 4 / Event generator 4"),
  d("SWI5_EGU5_IRQHandler", null, "Software interrupt 5 / Event generator 5"),
  d("TIMER3_IRQHandler", "TIMER3", "Timer 3 interrupt"),
  d("TIMER4_IRQHandler", "TIMER4", "Timer 4 interrupt"),
  d("PWM0_IRQHandler", "PWM0", "PWM unit 0 interrupt"),
  d("PDM_IRQHandler", "PDM", "Pulse density modulation microphone interrupt"),
  d("NVMC_IRQHandler", "NVMC", "Non-volatile memory controller interrupt"),
  d("PPI_IRQHandler", "PPI", "Programmable peripheral interconnect interrupt"),
  d("MWU_IRQHandler", null, "Memory watch unit interrupt"),
  d("PWM1_IRQHandler", "PWM1", "PWM unit 1 interrupt"),
  d("PWM2_IRQHandler", "PWM2", "PWM unit 2 interrupt"),
  d("SPIM2_SPIS2_IRQHandler", "SPI2_TWI2", "SPI2 with EasyDMA interrupt"),
  d("RTC2_IRQHandler", "RTC2", "Real-time counter 2 interrupt"),
  d("I2S_IRQHandler", null, "Inter-IC sound (I2S) interface interrupt"),
  d("FPU_IRQHandler", null, "Floating point unit interrupt"),
  d("USBD_IRQHandler", "USBD", "USB 2.0 full-speed device interrupt"),
  d("UARTE1_IRQHandler", "UARTE1", "UART1 with EasyDMA interrupt"),
  d("QSPI_IRQHandler", "QSPI", "External memory Quad SPI interrupt"),
  d("CRYPTOCELL_IRQHandler", null, "ARM TrustZone CryptoCell 310 interrupt"),
  d("PWM3_IRQHandler", null, "PWM unit 3 interrupt"),
  d("PDM0_IRQHandler", null, "Pulse density modulation 0 interrupt"),
];

export const resolveIrqDescriptor = (
  irqNumber: number,
  platform: SocPlatform | null,
): IrqDescriptor => {
  if (platform === "rp2040") {
    const matched = RP2040_IRQS[irqNumber];
    if (matched) return matched;
  } else if (platform === "nrf52") {
    const matched = NRF52_IRQS[irqNumber];
    if (matched) return matched;
  } else if (platform === "stm32f4") {
    const matched = STM32F4_IRQS[irqNumber];
    if (matched) return matched;
  } else if (
    platform === "stm32f1" ||
    platform === "gd32f1" ||
    platform === null
  ) {
    const matched = STM32F1_IRQS[irqNumber];
    if (matched) return matched;
  }
  return {
    name: `IRQ${irqNumber}_Handler`,
    peripheral: null,
    description: `Peripheral IRQ ${irqNumber} vector`,
  };
};
