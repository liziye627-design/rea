import { z } from "zod";
import type { AnalysisParameterLimit } from "../analysisSettings.js";
import { ARCHITECTURE_VARIANT_NAMES } from "../architectureVariant.js";
import { knownCoverageStatusSchema } from "../coverage.js";
import { absoluteLocalPathStringSchema } from "../localPath.js";
import {
  parameterBudgetLimitFor,
  parameterBudgetSchema,
  type ParameterBudget,
} from "../parameterBudget.js";

/**
 * Supported firmware vector/trap table architectures:
 * - ARM M-profile variants (`armv6-m`..`armv8.1-m.main`): 32-bit LE pointer table
 * - Classic ARM A/R-profile (`arm-a-r`): 8-slot 32-bit LE A32 instruction table
 * - RISC-V (`riscv`): `mtvec` 32-bit/16-bit LE jump/trap instruction slots
 * - Atmel AVR (`avr`): 16-bit LE `RJMP`/`JMP`/`RETI` flash vector slots
 * - Motorola 68000 (`m68k`): 32-bit BE exception pointer table
 */
export const FIRMWARE_VECTOR_ARCHITECTURES = [
  ...ARCHITECTURE_VARIANT_NAMES,
  "arm-a-r",
  "riscv",
  "avr",
  "m68k",
] as const;

export const firmwareVectorArchitectureSchema = z.enum(
  FIRMWARE_VECTOR_ARCHITECTURES,
);
export type FirmwareVectorArchitecture = z.infer<
  typeof firmwareVectorArchitectureSchema
>;

/** The spelling every address and 32-bit word in this report uses: lowercase hex of the unsigned 32-bit value. */
export const hex32 = (value: number): string =>
  `0x${(value >>> 0).toString(16)}`;

export const DEFAULT_VECTOR_TABLE_MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_VECTOR_TABLE_FILE_BYTES = 64 * 1024 * 1024;
export const DEFAULT_VECTOR_TABLE_MAX_ENTRIES = 256;
export const MAX_VECTOR_TABLE_ENTRIES = 1024;
export const MAX_SVD_XML_CHARS = 4 * 1024 * 1024;
export const DEFAULT_SVD_XML_NODES = 200_000;
export const MAX_SVD_XML_NODES = 1_000_000;
export const DEFAULT_SVD_EXPANDED_CHARS = 1 * 1024 * 1024;
export const MAX_SVD_EXPANDED_CHARS = 8 * 1024 * 1024;

export const FIRMWARE_VECTOR_TABLE_BUDGETS = {
  max_entries: {
    minimum: 1,
    maximum: MAX_VECTOR_TABLE_ENTRIES,
    default_value: DEFAULT_VECTOR_TABLE_MAX_ENTRIES,
    unit: "count",
  },
  max_file_bytes: {
    minimum: 2,
    maximum: MAX_VECTOR_TABLE_FILE_BYTES,
    default_value: DEFAULT_VECTOR_TABLE_MAX_FILE_BYTES,
    unit: "bytes",
  },
  max_svd_xml_nodes: {
    minimum: 1,
    maximum: MAX_SVD_XML_NODES,
    default_value: DEFAULT_SVD_XML_NODES,
    unit: "count",
  },
  max_svd_expanded_chars: {
    minimum: 64,
    maximum: MAX_SVD_EXPANDED_CHARS,
    default_value: DEFAULT_SVD_EXPANDED_CHARS,
    unit: "count",
  },
} as const satisfies Record<string, ParameterBudget>;

export type FirmwareVectorBudgetParameter =
  keyof typeof FIRMWARE_VECTOR_TABLE_BUDGETS;

export const firmwareVectorBudgetLimit: (
  parameter: FirmwareVectorBudgetParameter,
  effectiveValue: number,
) => AnalysisParameterLimit = parameterBudgetLimitFor(
  FIRMWARE_VECTOR_TABLE_BUDGETS,
);

export const inspectFirmwareVectorTableInputSchema = z.strictObject({
  path: absoluteLocalPathStringSchema.describe(
    "Local firmware binary or flash dump path to inspect without executing it.",
  ),
  architecture: firmwareVectorArchitectureSchema.describe(
    "Explicit target profile for vector-slot decoding: an ARM M-profile variant (armv6-m, armv7-m, armv7e-m, armv8-m.base, armv8-m.main or armv8.1-m.main), arm-a-r, riscv, avr, or m68k.",
  ),
  base_address: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{1,8}$/u,
      "base_address must be a 32-bit hex address such as 0x08000000",
    )
    .describe(
      "Explicit 32-bit load base address corresponding to file offset 0 (for example 0x08000000 or 0x0).",
    ),
  vector_table_offset: z
    .number()
    .int()
    .min(0)
    .max(MAX_VECTOR_TABLE_FILE_BYTES)
    .multipleOf(2)
    .default(0)
    .describe(
      "Byte offset of the vector or trap table inside the file (4-byte aligned for 32-bit architectures, 2-byte aligned for avr). Defaults to 0.",
    ),
  max_entries: parameterBudgetSchema(
    FIRMWARE_VECTOR_TABLE_BUDGETS.max_entries,
  ).describe(
    "Maximum number of vector or trap slots to decode starting at vector_table_offset.",
  ),
  svd_xml: z
    .string()
    .min(1)
    .max(MAX_SVD_XML_CHARS)
    .optional()
    .describe(
      "Optional CMSIS-SVD XML document text used to bind external IRQ numbers to declared peripheral interrupt names.",
    ),
  max_svd_xml_nodes: parameterBudgetSchema(
    FIRMWARE_VECTOR_TABLE_BUDGETS.max_svd_xml_nodes,
  ).describe("Maximum XML nodes admitted when parsing svd_xml."),
  max_svd_expanded_chars: parameterBudgetSchema(
    FIRMWARE_VECTOR_TABLE_BUDGETS.max_svd_expanded_chars,
  ).describe(
    "Maximum cumulative CMSIS-SVD peripheral and interrupt name characters expanded across IRQ bindings.",
  ),
  max_file_bytes: parameterBudgetSchema(
    FIRMWARE_VECTOR_TABLE_BUDGETS.max_file_bytes,
  ).describe("Maximum input file size admitted for reading."),
});

export type InspectFirmwareVectorTableInput = z.output<
  typeof inspectFirmwareVectorTableInputSchema
>;

export const vectorEntryNameBasisSchema = z.enum([
  "architecture_manual",
  "explicit_profile",
  "observed_slot",
]);
export type VectorEntryNameBasis = z.infer<typeof vectorEntryNameBasisSchema>;

export const armVectorEntrySchema = z.strictObject({
  slot_index: z.number().int().min(0),
  file_offset: z.number().int().min(0),
  slot_address: z.string(),
  kind: z.enum([
    "initial_stack_pointer",
    "system_exception",
    "reserved",
    "external_irq",
  ]),
  exception_number: z.number().int().min(1).nullable(),
  irq_number: z.number().int().min(0).nullable(),
  name: z.string().nullable(),
  name_basis: vectorEntryNameBasisSchema,
  peripheral_name: z.string().nullable(),
  ambiguous_profile_names: z.array(z.string()),
  raw_word: z.string(),
  target_code_address: z.string().nullable(),
  thumb_bit_set: z.boolean().nullable(),
  status: z.enum([
    "stack_pointer",
    "active",
    "null_entry",
    "erased_entry",
    "invalid_even_thumb_address",
    "nonzero_reserved",
  ]),
});
export type ArmVectorEntry = z.infer<typeof armVectorEntrySchema>;

export const armArVectorSlotSchema = z.strictObject({
  slot_index: z.number().int().min(0),
  file_offset: z.number().int().min(0),
  slot_address: z.string(),
  name: z.string().nullable(),
  name_basis: vectorEntryNameBasisSchema,
  encoding: z.enum([
    "b",
    "ldr_pc_literal",
    "mov_pc_imm",
    "exception_return",
    "zero_or_erased",
    "unrecognized",
  ]),
  raw_word: z.string(),
  decoded_mnemonic: z.string().nullable(),
  literal_pool_address: z.string().nullable(),
  literal_word: z.string().nullable(),
  thumb_interworking: z.boolean().nullable(),
  self_loop: z.boolean(),
  target_code_address: z.string().nullable(),
});
export type ArmArVectorSlot = z.infer<typeof armArVectorSlotSchema>;

export const riscvTrapSlotSchema = z.strictObject({
  slot_index: z.number().int().min(0),
  file_offset: z.number().int().min(0),
  slot_address: z.string(),
  cause_code: z.number().int().min(0),
  name: z.string().nullable(),
  name_basis: vectorEntryNameBasisSchema,
  peripheral_name: z.string().nullable(),
  ambiguous_profile_names: z.array(z.string()),
  encoding: z.enum([
    "jal",
    "c_j",
    "auipc_jalr",
    "zero_or_erased",
    "unrecognized",
  ]),
  raw_words: z.array(z.string()),
  decoded_mnemonic: z.string().nullable(),
  target_code_address: z.string().nullable(),
});
export type RiscvTrapSlot = z.infer<typeof riscvTrapSlotSchema>;

export const avrVectorSlotSchema = z.strictObject({
  slot_index: z.number().int().min(0),
  file_offset: z.number().int().min(0),
  slot_address: z.string(),
  irq_number: z.number().int().min(0).nullable(),
  name: z.string().nullable(),
  name_basis: vectorEntryNameBasisSchema,
  peripheral_name: z.string().nullable(),
  ambiguous_profile_names: z.array(z.string()),
  encoding: z.enum(["rjmp", "jmp", "reti", "zero_or_erased", "unrecognized"]),
  raw_words: z.array(z.string()),
  decoded_mnemonic: z.string().nullable(),
  target_code_address: z.string().nullable(),
});
export type AvrVectorSlot = z.infer<typeof avrVectorSlotSchema>;

export const m68kVectorEntrySchema = z.strictObject({
  slot_index: z.number().int().min(0),
  file_offset: z.number().int().min(0),
  slot_address: z.string(),
  kind: z.enum([
    "initial_stack_pointer",
    "system_exception",
    "trap_vector",
    "reserved",
    "user_device_vector",
  ]),
  vector_number: z.number().int().min(0),
  irq_number: z.number().int().min(0).nullable(),
  name: z.string().nullable(),
  name_basis: vectorEntryNameBasisSchema,
  peripheral_name: z.string().nullable(),
  ambiguous_profile_names: z.array(z.string()),
  raw_word: z.string(),
  target_code_address: z.string().nullable(),
  status: z.enum([
    "stack_pointer",
    "active",
    "null_entry",
    "erased_entry",
    "invalid_odd_code_address",
    "nonzero_reserved",
  ]),
});
export type M68kVectorEntry = z.infer<typeof m68kVectorEntrySchema>;

export const sharedHandlerGroupSchema = z.strictObject({
  target_code_address: z.string(),
  slot_count: z.number().int().min(2),
  slot_indices: z.array(z.number().int().min(0)),
});
export type SharedHandlerGroup = z.infer<typeof sharedHandlerGroupSchema>;

export const svdInterruptSummarySchema = z.strictObject({
  supplied: z.boolean(),
  mapped_irq_count: z.number().int().min(0),
  ambiguous_irq_count: z.number().int().min(0),
  unmapped_active_irq_count: z.number().int().min(0),
});

export const firmwareVectorTableSchema = z.strictObject({
  artifact: z.strictObject({
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    bytes: z.number().int().min(0),
  }),
  architecture: firmwareVectorArchitectureSchema,
  base_address: z.string(),
  vector_table_offset: z.number().int().min(0),
  vector_table_address: z.string(),
  /**
   * Whether the table address meets the architecture's minimum vector-base
   * alignment (128 bytes for ARMv7-M/ARMv8-M VTOR; 32 bytes for ARMv7-A/R VBAR).
   * Null for ARMv6-M, RISC-V, AVR, and M68K.
   */
  vtor_aligned: z.boolean().nullable(),
  examined_entries: z.number().int().min(0),
  table_file_range: z.strictObject({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }),
  coverage: z.strictObject({
    status: knownCoverageStatusSchema,
    examined_bytes: z.number().int().min(0),
    available_from_offset_bytes: z.number().int().min(0),
  }),
  initial_stack_pointer: z.string().nullable(),
  reset_code_address: z.string().nullable(),
  trap_entry_address: z.string().nullable(),
  riscv_table_shape: z
    .enum(["vectored_jumps", "single_entry_or_inline", "empty_or_unrecognized"])
    .nullable(),
  /** Slot width in bytes observed for AVR vector tables (2 for RJMP, 4 for JMP/padded RJMP); null otherwise. */
  avr_slot_bytes: z.union([z.literal(2), z.literal(4)]).nullable(),
  arm_entries: z.array(armVectorEntrySchema),
  /** ARM M-profile slots with status `active`; counted once by the producer. */
  active_arm_entry_count: z.number().int().min(0),
  arm_ar_slots: z.array(armArVectorSlotSchema),
  /** ARM A/R-profile slots that decode to a handler address; counted once by the producer. */
  recognized_arm_ar_slot_count: z.number().int().min(0),
  riscv_slots: z.array(riscvTrapSlotSchema),
  /** RISC-V slots that decode to a jump target; counted once by the producer. */
  recognized_riscv_slot_count: z.number().int().min(0),
  avr_slots: z.array(avrVectorSlotSchema),
  /** AVR slots that decode to a non-wrapped jump target; counted once by the producer. */
  recognized_avr_slot_count: z.number().int().min(0),
  m68k_entries: z.array(m68kVectorEntrySchema),
  /** M68K vector entries with status `active`; counted once by the producer. */
  active_m68k_entry_count: z.number().int().min(0),
  shared_handler_groups: z.array(sharedHandlerGroupSchema),
  svd_interrupts: svdInterruptSummarySchema,
  anomalies: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type FirmwareVectorTable = z.infer<typeof firmwareVectorTableSchema>;

/** Whether a report's stored slot counts match its slots. */
export const vectorTableCountsMatch = (
  report: FirmwareVectorTable,
): boolean => {
  // not-an-allowance: recount of active ARM M-profile entries
  let activeArm = 0;
  for (const entry of report.arm_entries)
    if (entry.status === "active") activeArm += 1;
  // not-an-allowance: recount of ARM A/R slots with a target address
  let recognizedArmAr = 0;
  for (const slot of report.arm_ar_slots)
    if (slot.target_code_address !== null) recognizedArmAr += 1;
  // not-an-allowance: recount of RISC-V slots with a jump target
  let recognizedRiscv = 0;
  for (const slot of report.riscv_slots)
    if (slot.target_code_address !== null) recognizedRiscv += 1;
  // not-an-allowance: recount of AVR slots with a jump target
  let recognizedAvr = 0;
  for (const slot of report.avr_slots)
    if (slot.target_code_address !== null) recognizedAvr += 1;
  // not-an-allowance: recount of active M68K entries
  let activeM68k = 0;
  for (const entry of report.m68k_entries)
    if (entry.status === "active") activeM68k += 1;
  return (
    activeArm === report.active_arm_entry_count &&
    recognizedArmAr === report.recognized_arm_ar_slot_count &&
    recognizedRiscv === report.recognized_riscv_slot_count &&
    recognizedAvr === report.recognized_avr_slot_count &&
    activeM68k === report.active_m68k_entry_count
  );
};
