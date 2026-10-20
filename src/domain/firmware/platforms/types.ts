/** Standard peripheral bus interconnect kinds across MCU architectures. */
export type PeripheralBusKind =
  | "APB"
  | "APB1"
  | "APB2"
  | "AHB"
  | "AHB1"
  | "AHB2"
  | "DPort"
  | "RTC"
  | "SIO"
  | "System";

export interface InternalPeripheralEntry {
  readonly name: string;
  readonly base: bigint;
  readonly size: number;
  readonly bus: PeripheralBusKind;
  readonly description: string;
}
