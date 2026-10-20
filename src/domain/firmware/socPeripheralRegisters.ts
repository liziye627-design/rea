import {
  lookupSocPeripheral,
  type SocPlatform,
} from "./socPeripheralDatabase.js";
import type {
  SocPeripheralRegisterDefinition,
  SocPeripheralRegisterLookupResult,
} from "./registers/types.js";
import {
  STM32_USART_REGISTERS,
  STM32_TIM_REGISTERS,
  STM32_SPI_REGISTERS,
  STM32_I2C_REGISTERS,
  STM32F1_GPIO_REGISTERS,
  STM32F4_GPIO_REGISTERS,
  STM32F1_RCC_REGISTERS,
  STM32F4_RCC_REGISTERS,
} from "./registers/stm32.js";
import {
  ESP32_UART_REGISTERS,
  ESP32_GPIO_REGISTERS,
} from "./registers/esp32.js";
import {
  RP2040_UART_REGISTERS,
  RP2040_SIO_REGISTERS,
} from "./registers/rp2040.js";
import {
  NRF52_UARTE_REGISTERS,
  NRF52_GPIO_REGISTERS,
} from "./registers/nrf52.js";

export {
  type SocPeripheralRegisterDefinition,
  socPeripheralRegisterDefinitionSchema,
  type SocPeripheralRegisterLookupResult,
  socPeripheralRegisterLookupResultSchema,
} from "./registers/types.js";

export {
  STM32_USART_REGISTERS,
  STM32_TIM_REGISTERS,
  STM32_SPI_REGISTERS,
  STM32_I2C_REGISTERS,
  STM32F1_GPIO_REGISTERS,
  STM32F4_GPIO_REGISTERS,
  STM32F1_RCC_REGISTERS,
  STM32F4_RCC_REGISTERS,
} from "./registers/stm32.js";

export {
  ESP32_UART_REGISTERS,
  ESP32_GPIO_REGISTERS,
} from "./registers/esp32.js";

export {
  RP2040_UART_REGISTERS,
  RP2040_SIO_REGISTERS,
} from "./registers/rp2040.js";

export {
  NRF52_UARTE_REGISTERS,
  NRF52_GPIO_REGISTERS,
} from "./registers/nrf52.js";

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
