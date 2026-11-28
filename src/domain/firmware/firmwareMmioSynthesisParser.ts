import { CoverageAccumulator } from "../coverageAccumulator.js";
import { malformedInput, type ParseFailureError } from "../parseFailure.js";
import { err, ok, type Result } from "../result.js";
import {
  formatHexAddress,
  type FirmwareMmioArchitecture,
  type FirmwareMmioPeripheralGroup,
  type FirmwareMmioSynthesis,
  type FirmwareMmioSynthesisItem,
  type MmioRegionClass,
} from "./firmwareMmioSynthesis.js";
import { disassembleSplitImmediateStream } from "./firmwareMmioSynthesisDecoders.js";
import {
  matchSvdAddress,
  type SvdPeripheralBlock,
} from "./firmwareSvdPeripherals.js";

export const minimumMmioInstructionAlignment = (
  architecture: FirmwareMmioArchitecture,
): number => (architecture === "riscv32" || architecture === "riscv64" ? 2 : 4);

export const maxArchAddress = (
  architecture: FirmwareMmioArchitecture,
): bigint =>
  architecture === "riscv64" || architecture === "arm64"
    ? 0xffff_ffff_ffff_ffffn
    : 0xffff_ffffn;

const mipsPhysicalAddress = (
  architecture: FirmwareMmioArchitecture,
  virtualAddr: bigint,
): bigint | null => {
  if (architecture !== "mips32le" && architecture !== "mips32be") return null;
  if (virtualAddr >= 0xa000_0000n && virtualAddr <= 0xbfff_ffffn) {
    return virtualAddr - 0xa000_0000n;
  }
  if (virtualAddr >= 0x8000_0000n && virtualAddr <= 0x9fff_ffffn) {
    return virtualAddr - 0x8000_0000n;
  }
  return null;
};

const classifyAddressRegion = (
  architecture: FirmwareMmioArchitecture,
  synthesizedAddress: bigint,
  hasSvdMatch: boolean,
): MmioRegionClass => {
  if (hasSvdMatch) return "svd_peripheral";
  if (architecture === "mips32le" || architecture === "mips32be") {
    if (
      synthesizedAddress >= 0xa000_0000n &&
      synthesizedAddress <= 0xbfff_ffffn &&
      !(
        synthesizedAddress >= 0xbfc0_0000n && synthesizedAddress <= 0xbfff_ffffn
      )
    ) {
      return "mips_kseg1_mmio";
    }
    return "non_mmio_or_ram_flash";
  }
  if (architecture === "riscv32" || architecture === "riscv64") {
    // Common RISC-V SoC peripheral / CLINT / PLIC / vendor MMIO windows
    if (
      (synthesizedAddress >= 0x0200_0000n &&
        synthesizedAddress < 0x0300_0000n) ||
      (synthesizedAddress >= 0x0c00_0000n &&
        synthesizedAddress < 0x2000_0000n) ||
      (synthesizedAddress >= 0x4000_0000n &&
        synthesizedAddress < 0x8000_0000n) ||
      (synthesizedAddress >= 0x1000_0000n &&
        synthesizedAddress < 0x1800_0000n) ||
      (synthesizedAddress >= 0xe000_0000n && synthesizedAddress <= 0xffff_ffffn)
    ) {
      return "architectural_mmio";
    }
    return "non_mmio_or_ram_flash";
  }
  if (architecture === "ppc32be") {
    // PowerPC Book-E / MPC5xxx / PowerQUICC peripheral bridge windows
    if (
      (synthesizedAddress >= 0xc3e0_0000n &&
        synthesizedAddress <= 0xc3ff_ffffn) ||
      (synthesizedAddress >= 0xe000_0000n && synthesizedAddress <= 0xffef_ffffn)
    ) {
      return "architectural_mmio";
    }
    return "non_mmio_or_ram_flash";
  }
  // arm64 bare-metal SoC MMIO windows (0x0800_0000..0x3fff_ffff GIC/UART/peripherals, high peripheral apertures)
  if (
    (synthesizedAddress >= 0x0800_0000n && synthesizedAddress < 0x4000_0000n) ||
    (synthesizedAddress >= 0xf000_0000n && synthesizedAddress < 0x1_0000_0000n)
  ) {
    return "architectural_mmio";
  }
  return "non_mmio_or_ram_flash";
};

export interface ParseFirmwareMmioSynthesisOptions {
  readonly artifact: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
  readonly architecture: FirmwareMmioArchitecture;
  readonly baseAddressHex: string;
  readonly scanOffset: number;
  readonly maxScanBytes: number;
  readonly maxSyntheses: number;
  readonly maxWindowInstructions: number;
  readonly mmioOnly: boolean;
  readonly scanBytes: Buffer;
  readonly svdSupplied: boolean;
  readonly svdPeripherals: readonly SvdPeripheralBlock[];
  readonly svdSkipped: readonly string[];
}

const buildPeripheralGroups = (
  items: readonly FirmwareMmioSynthesisItem[],
): FirmwareMmioPeripheralGroup[] => {
  const byGroup = new Map<
    string,
    {
      peripheralName: string | null;
      regionClass: MmioRegionClass;
      accessCount: number;
      loadCount: number;
      storeCount: number;
      matCount: number;
      offsets: Set<string>;
      regNames: Set<string>;
    }
  >();

  for (const item of items) {
    const addr = BigInt(item.synthesized_address);
    const groupBase = item.peripheral_base ?? formatHexAddress(addr & ~0xfffn);
    const offsetStr =
      item.register_offset ??
      formatHexAddress(
        addr -
          (item.peripheral_base !== null
            ? BigInt(item.peripheral_base)
            : addr & ~0xfffn),
      );
    let bucket = byGroup.get(groupBase);
    if (bucket === undefined) {
      bucket = {
        peripheralName: item.peripheral_name,
        regionClass: item.region_class,
        accessCount: 0,
        loadCount: 0,
        storeCount: 0,
        matCount: 0,
        offsets: new Set(),
        regNames: new Set(),
      };
      byGroup.set(groupBase, bucket);
    }
    bucket.accessCount += 1;
    if (item.access_kind === "load") bucket.loadCount += 1;
    else if (item.access_kind === "store") bucket.storeCount += 1;
    else bucket.matCount += 1;
    bucket.offsets.add(offsetStr);
    if (item.register_name !== null) bucket.regNames.add(item.register_name);
  }

  const groups: FirmwareMmioPeripheralGroup[] = [];
  for (const [group_base_address, b] of byGroup) {
    groups.push({
      group_base_address,
      peripheral_name: b.peripheralName,
      region_class: b.regionClass,
      access_count: b.accessCount,
      load_count: b.loadCount,
      store_count: b.storeCount,
      materialization_count: b.matCount,
      distinct_offsets: [...b.offsets].sort(),
      register_names: [...b.regNames].sort(),
    });
  }
  groups.sort((a, b) => {
    if (b.access_count !== a.access_count)
      return b.access_count - a.access_count;
    const addrA = BigInt(a.group_base_address);
    const addrB = BigInt(b.group_base_address);
    return addrA < addrB ? -1 : addrA > addrB ? 1 : 0;
  });
  return groups;
};

/** Disassemble split-immediate MMIO peripheral accesses and bind optional CMSIS-SVD registers. */
export const parseFirmwareMmioSynthesis = (
  options: ParseFirmwareMmioSynthesisOptions,
): Result<FirmwareMmioSynthesis, ParseFailureError<"malformed">> => {
  const {
    artifact,
    architecture,
    scanOffset,
    maxScanBytes,
    maxSyntheses,
    maxWindowInstructions,
    mmioOnly,
    scanBytes,
    svdSupplied,
    svdPeripherals,
    svdSkipped,
  } = options;
  const minAlign = minimumMmioInstructionAlignment(architecture);
  const maxAddress = maxArchAddress(architecture);
  let baseAddress: bigint;
  try {
    baseAddress = BigInt(options.baseAddressHex);
  } catch {
    return err(
      malformedInput(
        "firmware-mmio-synthesis",
        `Invalid hex base_address ${options.baseAddressHex}.`,
      ),
    );
  }
  if (baseAddress < 0n || baseAddress > maxAddress) {
    return err(
      malformedInput(
        "firmware-mmio-synthesis",
        `base_address ${options.baseAddressHex} exceeds the ${architecture} address space.`,
      ),
    );
  }
  if (scanOffset % minAlign !== 0) {
    return err(
      malformedInput(
        "firmware-mmio-synthesis",
        `scan_offset ${String(scanOffset)} must be ${String(minAlign)}-byte aligned for ${architecture}.`,
      ),
    );
  }
  if (scanOffset >= artifact.bytes || artifact.bytes - scanOffset < minAlign) {
    return err(
      malformedInput(
        "firmware-mmio-synthesis",
        `scan_offset ${String(scanOffset)} leaves fewer than ${String(minAlign)} bytes in the ${String(artifact.bytes)}-byte image.`,
      ),
    );
  }
  const scanStartAddress = baseAddress + BigInt(scanOffset);
  if (scanStartAddress > maxAddress - BigInt(minAlign - 1)) {
    return err(
      malformedInput(
        "firmware-mmio-synthesis",
        "base_address + scan_offset overflows the architectural address space.",
      ),
    );
  }

  const anomalies = [...svdSkipped];
  const limitations: string[] = [];
  if ((baseAddress & BigInt(minAlign - 1)) !== 0n) {
    anomalies.push(
      `base_address ${formatHexAddress(baseAddress)} is not ${String(minAlign)}-byte instruction aligned for ${architecture}.`,
    );
  }

  const boundedSlice =
    scanBytes.length > maxScanBytes
      ? scanBytes.subarray(0, maxScanBytes)
      : scanBytes;
  const decoded = disassembleSplitImmediateStream({
    architecture,
    bytes: boundedSlice,
    scanOffset,
    scanStartAddress,
    maxWindowInstructions,
  });

  const syntheses: FirmwareMmioSynthesisItem[] = [];
  // not-an-allowance: summary count of load syntheses
  let loadCount = 0;
  // not-an-allowance: summary count of store syntheses
  let storeCount = 0;
  // not-an-allowance: summary count of address materializations
  let matCount = 0;
  // not-an-allowance: summary count of SVD peripheral matches
  let svdMatched = 0;
  // not-an-allowance: summary count of exact SVD register matches
  let svdExactReg = 0;
  let truncatedSyntheses = 0;

  for (const cand of decoded.candidates) {
    const phys = mipsPhysicalAddress(architecture, cand.synthesizedAddress);
    const svdHit =
      svdPeripherals.length > 0
        ? (matchSvdAddress(svdPeripherals, cand.synthesizedAddress) ??
          (phys !== null ? matchSvdAddress(svdPeripherals, phys) : null))
        : null;
    const regionClass = classifyAddressRegion(
      architecture,
      cand.synthesizedAddress,
      svdHit !== null,
    );
    if (mmioOnly && regionClass === "non_mmio_or_ram_flash") {
      continue;
    }
    if (syntheses.length >= maxSyntheses) {
      truncatedSyntheses += 1;
      continue;
    }
    if (svdHit !== null) {
      svdMatched += 1;
      if (svdHit.registerName !== null) svdExactReg += 1;
    }
    if (cand.accessKind === "load") loadCount += 1;
    else if (cand.accessKind === "store") storeCount += 1;
    else matCount += 1;

    syntheses.push({
      high_file_offset: cand.highFileOffset,
      high_instruction_address: formatHexAddress(cand.highAddress),
      high_mnemonic: cand.highMnemonic,
      low_file_offset: cand.lowFileOffset,
      low_instruction_address: formatHexAddress(cand.lowAddress),
      low_mnemonic: cand.lowMnemonic,
      base_register: cand.baseRegister,
      pattern: cand.pattern,
      access_kind: cand.accessKind,
      access_width_bytes: cand.accessWidthBytes,
      synthesized_address: formatHexAddress(cand.synthesizedAddress),
      physical_address: phys !== null ? formatHexAddress(phys) : null,
      region_class: regionClass,
      peripheral_name: svdHit?.peripheralName ?? null,
      peripheral_base:
        svdHit !== null ? formatHexAddress(svdHit.peripheralBase) : null,
      register_offset:
        svdHit !== null ? formatHexAddress(svdHit.registerOffset) : null,
      register_name: svdHit?.registerName ?? null,
    });
  }

  const availableFromOffset = artifact.bytes - scanOffset;
  const coverageAcc = new CoverageAccumulator().recordComplete();
  if (decoded.consumedBytes < availableFromOffset) {
    const afterOffset = scanOffset + decoded.consumedBytes;
    const reason = decoded.stoppedByAddressEnd
      ? `Scanned ${String(decoded.consumedBytes)} bytes (${String(decoded.decodedInstructions)} instructions); later bytes would cross the end of the ${architecture} address space.`
      : boundedSlice.length < availableFromOffset &&
          decoded.consumedBytes === boundedSlice.length
        ? `Scanned ${String(decoded.consumedBytes)} bytes up to max_scan_bytes; ${String(availableFromOffset - decoded.consumedBytes)} trailing byte(s) past offset ${String(afterOffset)} were not disassembled.`
        : `Scanned ${String(decoded.consumedBytes)} bytes; ${String(availableFromOffset - decoded.consumedBytes)} trailing byte(s) past offset ${String(afterOffset)} do not form a complete instruction.`;
    coverageAcc.recordOmission(reason);
    limitations.push(reason);
  }
  if (truncatedSyntheses > 0) {
    const capMsg = `Retained ${String(maxSyntheses)} synthesized accesses up to max_syntheses; ${String(truncatedSyntheses)} additional matching split-immediate accesses in the scanned window were omitted.`;
    coverageAcc.recordOmission(capMsg);
    limitations.push(capMsg);
  }
  limitations.push(
    "Linear split-immediate disassembly tracks forward register high-half state within max_window_instructions and clears tracking at branches; embedded data pools in code sections, indirect pointer tables, and DMA descriptors are not reconstructed as control-flow graphs.",
  );
  if (!svdSupplied) {
    limitations.push(
      "No svd_xml profile was supplied; MMIO classification relies on architectural peripheral address apertures rather than vendor peripheral declarations, and peripheral_name/register_name remain null.",
    );
  }

  return ok({
    artifact,
    architecture,
    base_address: formatHexAddress(baseAddress),
    scan_offset: scanOffset,
    scan_start_address: formatHexAddress(scanStartAddress),
    mmio_only: mmioOnly,
    decoded_instructions: decoded.decodedInstructions,
    scan_file_range: {
      start: scanOffset,
      end: scanOffset + decoded.consumedBytes,
    },
    coverage: {
      status: coverageAcc.finalizeKnown(),
      examined_bytes: decoded.consumedBytes,
      available_from_offset_bytes: availableFromOffset,
    },
    syntheses,
    load_synthesis_count: loadCount,
    store_synthesis_count: storeCount,
    materialization_synthesis_count: matCount,
    peripheral_groups: buildPeripheralGroups(syntheses),
    svd_peripherals: {
      supplied: svdSupplied,
      peripheral_count: svdPeripherals.length,
      matched_synthesis_count: svdMatched,
      exact_register_match_count: svdExactReg,
    },
    anomalies,
    limitations,
  });
};
