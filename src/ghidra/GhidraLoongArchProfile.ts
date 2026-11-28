import type { GhidraLanguageOverride } from "../config/ghidraLanguageOverride.js";
import type {
  BinaryTarget,
  ElfFamilyMetadata,
} from "../domain/binaryTargetTypes.js";
import type { JsonValue } from "../domain/jsonValue.js";

/** LoongArch ELF psABI `EF_LOONGARCH_ABI_MODIFIER_MASK` (low 3 bits of `e_flags`). */
export const EF_LOONGARCH_ABI_MODIFIER_MASK = 0x7;
export const EF_LOONGARCH_ABI_SOFT_FLOAT = 0x1;
export const EF_LOONGARCH_ABI_SINGLE_FLOAT = 0x2;
export const EF_LOONGARCH_ABI_DOUBLE_FLOAT = 0x3;

/** LoongArch ELF psABI `EF_LOONGARCH_OBJABI_MASK` (bits 7:6 of `e_flags`). */
export const EF_LOONGARCH_OBJABI_MASK = 0xc0;
export const EF_LOONGARCH_OBJABI_V0 = 0x00;
export const EF_LOONGARCH_OBJABI_V1 = 0x40;

const KNOWN_LOONGARCH_EFLAGS_MASK =
  EF_LOONGARCH_ABI_MODIFIER_MASK | EF_LOONGARCH_OBJABI_MASK;

/**
 * Ghidra `loongarch.ldefs` and `loongarch.opinion` define little-endian ILP32F,
 * ILP32D, LP64F, and LP64D languages (`compilerSpecID="default"`). Soft-float
 * (`0x1`) has no dedicated `.cspec` in Ghidra and maps to `lp64d` (64-bit) or
 * `ilp32f` (32-bit) in `loongarch.opinion`.
 */
export const ghidraLoongArchUnsupportedReason = (
  target: BinaryTarget,
): string | null => {
  if (target.kind !== "executable" || target.architecture !== "loongarch")
    return null;
  const missingMetadata =
    "LoongArch analysis requires ELF header metadata; a family name alone does not select an ABI or floating-point variant.";
  if (target.format !== "elf") return missingMetadata;
  const metadata = target.loongarch;
  if (metadata === undefined) return missingMetadata;
  if (metadata.byteOrder !== "little")
    return "This Ghidra LoongArch lane supports little-endian ELF32/ELF64 only; Ghidra defines no big-endian LoongArch processor language.";
  const modifier = metadata.flags & EF_LOONGARCH_ABI_MODIFIER_MASK;
  if (
    modifier !== EF_LOONGARCH_ABI_SOFT_FLOAT &&
    modifier !== EF_LOONGARCH_ABI_SINGLE_FLOAT &&
    modifier !== EF_LOONGARCH_ABI_DOUBLE_FLOAT
  )
    return "LoongArch e_flags must declare a supported ABI float modifier (soft-float 0x1, single-float 0x2, or double-float 0x3); legacy zero or reserved ABI modifiers are not supported by Ghidra.";
  const objAbi = metadata.flags & EF_LOONGARCH_OBJABI_MASK;
  if (objAbi !== EF_LOONGARCH_OBJABI_V0 && objAbi !== EF_LOONGARCH_OBJABI_V1)
    return "LoongArch e_flags declares an unrecognized object ABI version outside v0 (0x00) and v1 (0x40).";
  if ((metadata.flags & ~KNOWN_LOONGARCH_EFLAGS_MASK) !== 0)
    return "LoongArch e_flags declares processor or ABI bits outside the verified object-ABI and float-modifier masks.";
  return null;
};

const loongArchLanguageFor = (
  metadata: ElfFamilyMetadata,
): GhidraLanguageOverride => {
  const modifier = metadata.flags & EF_LOONGARCH_ABI_MODIFIER_MASK;
  if (metadata.elfClass === 64) {
    return {
      languageId:
        modifier === EF_LOONGARCH_ABI_SINGLE_FLOAT
          ? "Loongarch:LE:64:lp64f"
          : "Loongarch:LE:64:lp64d",
      compilerSpecId: "default",
    };
  }
  return {
    languageId:
      modifier === EF_LOONGARCH_ABI_DOUBLE_FLOAT
        ? "Loongarch:LE:32:ilp32d"
        : "Loongarch:LE:32:ilp32f",
    compilerSpecId: "default",
  };
};

const loongArchSupportLane = (metadata: ElfFamilyMetadata): string => {
  const modifier = metadata.flags & EF_LOONGARCH_ABI_MODIFIER_MASK;
  if (metadata.elfClass === 64) {
    if (modifier === EF_LOONGARCH_ABI_DOUBLE_FLOAT) return "elf64-le-lp64d";
    if (modifier === EF_LOONGARCH_ABI_SINGLE_FLOAT) return "elf64-le-lp64f";
    return "elf64-le-lp64s";
  }
  if (modifier === EF_LOONGARCH_ABI_DOUBLE_FLOAT) return "elf32-le-ilp32d";
  if (modifier === EF_LOONGARCH_ABI_SINGLE_FLOAT) return "elf32-le-ilp32f";
  return "elf32-le-ilp32s";
};

/**
 * Default Ghidra LoongArch language matching `loongarch.opinion`, unless
 * `REA_GHIDRA_LANGUAGE_ID` selects a configured override.
 */
export const ghidraLoongArchLanguage = (
  target: BinaryTarget,
): GhidraLanguageOverride | undefined => {
  if (
    target.kind !== "executable" ||
    target.architecture !== "loongarch" ||
    target.format !== "elf" ||
    target.loongarch === undefined ||
    ghidraLoongArchUnsupportedReason(target) !== null
  )
    return undefined;
  return loongArchLanguageFor(target.loongarch);
};

/** Commit observed LoongArch ELF class, byte order, type, and ABI flags. */
export const ghidraLoongArchProfileParameters = (
  target: BinaryTarget,
): Readonly<Record<string, JsonValue>> => {
  if (
    target.kind !== "executable" ||
    target.architecture !== "loongarch" ||
    target.format !== "elf" ||
    target.loongarch === undefined
  )
    return {};
  return {
    loongarch_elf: {
      elf_class: target.loongarch.elfClass,
      byte_order: target.loongarch.byteOrder,
      type: target.loongarch.type,
      flags: target.loongarch.flags,
    },
    loongarch_support_lane: loongArchSupportLane(target.loongarch),
  };
};
