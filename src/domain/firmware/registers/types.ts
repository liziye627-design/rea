import { z } from "zod";
import {
  type SocPeripheralDefinition,
  socPeripheralDefinitionSchema,
} from "../socPeripheralDatabase.js";

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

export const reg = (
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

export const roReg = (
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

export const woReg = (
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
