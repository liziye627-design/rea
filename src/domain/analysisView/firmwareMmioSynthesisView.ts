import { z } from "zod";
import { firmwareMmioSynthesisSchema } from "../firmware/firmwareMmioSynthesis.js";
import { ok } from "../result.js";
import type { AnalysisViewParent } from "./analysisViewParent.js";
import {
  assertOwnedView,
  type AdmittedView,
  type SummaryAnalysisView,
} from "./analysisViewShape.js";
import { invalidAnalysisView } from "./analysisViewErrors.js";
import { createAnalysisViewResultReader } from "./analysisViewParent.js";
import {
  boundedViewLimitations,
  completeWithinViewCoverage,
  selectedViewPage,
} from "./analysisViewCoverage.js";
import { selectViewRows } from "./selectViewRows.js";

export const firmwareMmioSynthesisViewRequestSchema = z.strictObject({
  kind: z.literal("firmware-mmio-synthesis"),
  collection: z.enum(["syntheses", "peripheral_groups", "anomalies"]),
  offset: z.int().nonnegative().default(0),
  limit: z.int().positive().max(1024).default(64),
});

const sourceIndex = { source_index: z.int().nonnegative() };

export const firmwareMmioSynthesisViewItemsSchema = z.union([
  z.array(
    firmwareMmioSynthesisSchema.shape.syntheses.element.extend(sourceIndex),
  ),
  z.array(
    firmwareMmioSynthesisSchema.shape.peripheral_groups.element.extend(
      sourceIndex,
    ),
  ),
  z.array(
    z.strictObject({
      anomaly: z.string(),
      ...sourceIndex,
    }),
  ),
]);

const {
  artifact,
  architecture,
  base_address,
  scan_offset,
  scan_start_address,
  mmio_only,
  decoded_instructions,
  scan_file_range,
  coverage,
  svd_peripherals,
} = firmwareMmioSynthesisSchema.shape;

const counts = {
  synthesis_count: z.int().nonnegative(),
  load_synthesis_count: z.int().nonnegative(),
  store_synthesis_count: z.int().nonnegative(),
  materialization_synthesis_count: z.int().nonnegative(),
  peripheral_group_count: z.int().nonnegative(),
  anomaly_count: z.int().nonnegative(),
};

export const firmwareMmioSynthesisSummarySchema = z.strictObject({
  artifact,
  architecture,
  base_address,
  scan_offset,
  scan_start_address,
  mmio_only,
  decoded_instructions,
  scan_file_range,
  coverage,
  svd_peripherals,
  ...counts,
});

export const firmwareMmioSynthesisPageContextSchema =
  firmwareMmioSynthesisSummarySchema;

const readReport = createAnalysisViewResultReader(firmwareMmioSynthesisSchema);

export const projectFirmwareMmioSynthesisView = (
  parent: AnalysisViewParent,
  view: AdmittedView,
) => {
  if (view.kind !== "summary" && view.kind !== "firmware-mmio-synthesis")
    return invalidAnalysisView(
      "Firmware MMIO synthesis Evidence supports summary and firmware-mmio-synthesis views.",
    );
  assertOwnedView<
    | SummaryAnalysisView
    | z.output<typeof firmwareMmioSynthesisViewRequestSchema>
  >(view, "summary", "firmware-mmio-synthesis");
  const parsed = readReport(parent);
  if (!parsed.ok) return parsed;
  const r = parsed.value;
  const context = {
    artifact: r.artifact,
    architecture: r.architecture,
    base_address: r.base_address,
    scan_offset: r.scan_offset,
    scan_start_address: r.scan_start_address,
    mmio_only: r.mmio_only,
    decoded_instructions: r.decoded_instructions,
    scan_file_range: r.scan_file_range,
    coverage: r.coverage,
    svd_peripherals: r.svd_peripherals,
    synthesis_count: r.syntheses.length,
    load_synthesis_count: r.load_synthesis_count,
    store_synthesis_count: r.store_synthesis_count,
    materialization_synthesis_count: r.materialization_synthesis_count,
    peripheral_group_count: r.peripheral_groups.length,
    anomaly_count: r.anomalies.length,
  };
  const shared = {
    parent_evidence_id: parent.evidenceId,
    parent_operation: "inspect_firmware_mmio_synthesis" as const,
    parent_digest: parent.evidenceId.slice(3),
    artifact: { path: r.artifact.path, sha256: r.artifact.sha256 },
    limitations: boundedViewLimitations(parent, r.limitations),
    unknowns: [
      "Runtime MMU/MPU address translation, peripheral clock/reset gating, and indirect pointer/DMA register accesses are not established from linear split-immediate disassembly alone.",
    ],
  };
  if (view.kind === "summary")
    return ok({
      ...shared,
      kind: "summary" as const,
      view,
      summary: context,
      coverage: completeWithinViewCoverage(r.syntheses.length),
    });

  const selected =
    view.collection === "syntheses"
      ? selectViewRows(r.syntheses, view, undefined, (row, source_index) => ({
          ...row,
          source_index,
        }))
      : view.collection === "peripheral_groups"
        ? selectViewRows(
            r.peripheral_groups,
            view,
            undefined,
            (row, source_index) => ({
              ...row,
              source_index,
            }),
          )
        : selectViewRows(
            r.anomalies,
            view,
            undefined,
            (anomaly, source_index) => ({ anomaly, source_index }),
          );

  return ok({
    ...shared,
    kind: "firmware-mmio-synthesis" as const,
    view,
    mmio_synthesis: context,
    ...selectedViewPage(view.offset, selected),
  });
};
