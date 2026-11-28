import type { Element } from "@xmldom/xmldom";
import { Budget } from "../budget.js";
import {
  decodeLimit,
  malformedInput,
  type ParseFailureError,
} from "../parseFailure.js";
import { err, ok, type Result } from "../result.js";
import {
  parseXmlDocumentWithinNodeLimit,
  xmlChildrenNamed,
  xmlFirstChildNamed,
} from "../xmlDocument.js";
import {
  DEFAULT_SVD_EXPANDED_CHARS,
  DEFAULT_SVD_XML_NODES,
} from "./firmwareMmioSynthesis.js";

export interface SvdRegisterBinding {
  readonly peripheralName: string;
  readonly peripheralBase: bigint;
  readonly registerName: string;
  readonly registerOffset: bigint;
  readonly registerSizeBits: number | null;
}

export interface SvdPeripheralBlock {
  readonly name: string;
  readonly baseAddress: bigint;
  readonly sizeBytes: bigint;
  readonly registers: ReadonlyMap<bigint, SvdRegisterBinding>;
}

export interface ParsedSvdPeripheralMap {
  readonly peripherals: readonly SvdPeripheralBlock[];
  readonly skipped: readonly string[];
}

export type SvdPeripheralParseError =
  | ParseFailureError<"malformed">
  | ParseFailureError<"unsupported">
  | ParseFailureError<"limit">;

const HEX_OR_DEC_UINT = /^(?:0x[0-9a-fA-F]+|[0-9]+)$/u;
const MAX_SKIPPED_DIAGNOSTICS = 32;

const parseBigUint = (text: string | null): bigint | null => {
  if (text === null) return null;
  const trimmed = text.trim();
  if (!HEX_OR_DEC_UINT.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
};

const trimmedText = (element: Element | undefined): string | null => {
  if (element === undefined) return null;
  const text = (element.textContent ?? "").trim();
  return text.length > 0 ? `${text}` : null;
};

/** Parse CMSIS-SVD `<peripheral>` base addresses and `<register>` offsets under bounded XML budgets. */
export const parseSvdPeripheralMap = (
  svdXml: string,
  options?: {
    readonly maxXmlNodes?: number;
    readonly maxExpandedChars?: number;
  },
): Result<ParsedSvdPeripheralMap, SvdPeripheralParseError> => {
  const maxXmlNodes = options?.maxXmlNodes ?? DEFAULT_SVD_XML_NODES;
  const maxExpandedChars =
    options?.maxExpandedChars ?? DEFAULT_SVD_EXPANDED_CHARS;

  const docResult = parseXmlDocumentWithinNodeLimit(svdXml, {
    maximumNodes: maxXmlNodes,
    lineEndings: "normalize",
  });
  if (!docResult.ok) {
    const failure = docResult.error;
    if ("kind" in failure && failure.kind === "node-limit") {
      return err(
        decodeLimit(
          "cmsis-svd",
          `svd_xml exceeded the ${String(failure.maximum)}-node XML ceiling`,
          { name: "max_svd_xml_nodes", maximum: failure.maximum },
        ),
      );
    }
    return err(failure);
  }

  const root = docResult.value.documentElement;
  if (root === null || root.localName !== "device") {
    return err(
      malformedInput("cmsis-svd", "CMSIS-SVD root element must be <device>."),
    );
  }

  const peripheralsEl = xmlFirstChildNamed(root, "peripherals");
  const skipped: string[] = [];
  if (peripheralsEl === undefined) {
    return ok({ peripherals: [], skipped });
  }

  const expandedBudget = new Budget(maxExpandedChars);
  const chargeExpandedChars = (
    chars: number,
  ): SvdPeripheralParseError | null => {
    const required = expandedBudget.used + chars;
    if (!expandedBudget.tryCharge(chars)) {
      return decodeLimit(
        "cmsis-svd",
        `CMSIS-SVD peripheral and register identifiers exceeded max_svd_expanded_chars (${String(maxExpandedChars)}).`,
        {
          name: "max_svd_expanded_chars",
          maximum: maxExpandedChars,
          required,
        },
      );
    }
    return null;
  };

  const rawPeripherals: {
    readonly name: string;
    readonly derivedFrom: string | null;
    readonly baseAddress: bigint;
    readonly explicitSpan: bigint | null;
    readonly ownRegisters: Map<
      bigint,
      { name: string; sizeBits: number | null }
    >;
  }[] = [];

  for (const pEl of xmlChildrenNamed(peripheralsEl, "peripheral")) {
    const pName = trimmedText(xmlFirstChildNamed(pEl, "name"));
    const base = parseBigUint(
      trimmedText(xmlFirstChildNamed(pEl, "baseAddress")),
    );
    if (pName !== null) {
      const limitErr = chargeExpandedChars(pName.length);
      if (limitErr !== null) return err(limitErr);
    }
    if (pName === null || base === null) {
      if (skipped.length < MAX_SKIPPED_DIAGNOSTICS) {
        skipped.push(
          `Skipped CMSIS-SVD <peripheral> (${pName ?? "unnamed"}) without a valid non-negative <baseAddress>.`,
        );
      }
      continue;
    }

    let explicitSpan: bigint | null = null;
    for (const ab of xmlChildrenNamed(pEl, "addressBlock")) {
      const abOff =
        parseBigUint(trimmedText(xmlFirstChildNamed(ab, "offset"))) ?? 0n;
      const abSize = parseBigUint(trimmedText(xmlFirstChildNamed(ab, "size")));
      if (abSize !== null && abSize > 0n) {
        const end = abOff + abSize;
        if (explicitSpan === null || end > explicitSpan) explicitSpan = end;
      }
    }

    const ownRegisters = new Map<
      bigint,
      { name: string; sizeBits: number | null }
    >();
    const regsEl = xmlFirstChildNamed(pEl, "registers");
    if (regsEl !== undefined) {
      for (const rEl of xmlChildrenNamed(regsEl, "register")) {
        const rName = trimmedText(xmlFirstChildNamed(rEl, "name"));
        const rOff = parseBigUint(
          trimmedText(xmlFirstChildNamed(rEl, "addressOffset")),
        );
        if (rName === null || rOff === null) {
          if (skipped.length < MAX_SKIPPED_DIAGNOSTICS) {
            skipped.push(
              `Skipped <register> (${rName ?? "unnamed"}) in ${pName} without a valid <addressOffset>.`,
            );
          }
          continue;
        }
        const limitErr = chargeExpandedChars(pName.length + rName.length + 1);
        if (limitErr !== null) return err(limitErr);
        const rSize = parseBigUint(
          trimmedText(xmlFirstChildNamed(rEl, "size")),
        );
        ownRegisters.set(rOff, {
          name: rName,
          sizeBits: rSize !== null && rSize <= 64n ? Number(rSize) : null,
        });
      }
    }

    const derivedAttr = pEl.getAttribute("derivedFrom");
    rawPeripherals.push({
      name: pName,
      derivedFrom:
        derivedAttr !== null && derivedAttr.length > 0 ? derivedAttr : null,
      baseAddress: base,
      explicitSpan,
      ownRegisters,
    });
  }

  const byName = new Map(rawPeripherals.map((p) => [p.name, p]));
  const peripherals: SvdPeripheralBlock[] = [];
  for (const p of rawPeripherals) {
    const parent =
      p.derivedFrom !== null ? byName.get(p.derivedFrom) : undefined;
    const mergedRegs = new Map<bigint, SvdRegisterBinding>();
    const sourceRegs =
      p.ownRegisters.size > 0
        ? p.ownRegisters
        : (parent?.ownRegisters ?? p.ownRegisters);
    let maxRegEnd = 4n;
    for (const [off, reg] of sourceRegs) {
      const byteWidth = BigInt(Math.max(1, (reg.sizeBits ?? 32) >> 3));
      if (off + byteWidth > maxRegEnd) maxRegEnd = off + byteWidth;
      mergedRegs.set(off, {
        peripheralName: p.name,
        peripheralBase: p.baseAddress,
        registerName: reg.name,
        registerOffset: off,
        registerSizeBits: reg.sizeBits,
      });
    }
    const span =
      p.explicitSpan ??
      parent?.explicitSpan ??
      (maxRegEnd > 0x1000n ? maxRegEnd : 0x1000n);
    peripherals.push({
      name: p.name,
      baseAddress: p.baseAddress,
      sizeBytes: span,
      registers: mergedRegs,
    });
  }
  peripherals.sort((a, b) =>
    a.baseAddress < b.baseAddress ? -1 : a.baseAddress > b.baseAddress ? 1 : 0,
  );
  return ok({ peripherals, skipped });
};

/** Resolve `address` to a CMSIS-SVD peripheral block and exact register offset when present. */
export const matchSvdAddress = (
  peripherals: readonly SvdPeripheralBlock[],
  address: bigint,
): {
  readonly peripheralName: string;
  readonly peripheralBase: bigint;
  readonly registerOffset: bigint;
  readonly registerName: string | null;
} | null => {
  for (const block of peripherals) {
    if (
      address >= block.baseAddress &&
      address < block.baseAddress + block.sizeBytes
    ) {
      const offset = address - block.baseAddress;
      const exact = block.registers.get(offset);
      return {
        peripheralName: block.name,
        peripheralBase: block.baseAddress,
        registerOffset: offset,
        registerName: exact?.registerName ?? null,
      };
    }
  }
  return null;
};
