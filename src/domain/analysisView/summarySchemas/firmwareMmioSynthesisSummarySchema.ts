import { z } from "zod";
import { summaryViewResultBase } from "../analysisViewBase.js";
import { firmwareMmioSynthesisSummarySchema } from "../firmwareMmioSynthesisView.js";

export const firmwareMmioSynthesisSummaryViewResultSchema = z.strictObject({
  ...summaryViewResultBase,
  parent_operation: z.literal("inspect_firmware_mmio_synthesis"),
  summary: firmwareMmioSynthesisSummarySchema,
});
