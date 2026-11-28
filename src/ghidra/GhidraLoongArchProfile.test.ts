import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../config/parseConfig.js";
import type {
  BinaryTarget,
  ElfFamilyMetadata,
} from "../domain/binaryTargetTypes.js";
import { silentLogger } from "../logger.js";
import { HopperProvider } from "../hopper/HopperProvider.js";
import { IdaProvider } from "../ida/IdaProvider.js";
import {
  ghidraPinnedLanguage,
  ghidraProfileLanguageOverride,
} from "./GhidraAnalysisProfile.js";
import { GhidraProvider } from "./GhidraProvider.js";
import {
  ghidraProfileInstallationHost as host,
  simulatedInstallDirectory,
} from "./GhidraInstallation.fixture.js";

const LOONGARCH_LDEFS = `<?xml version="1.0" encoding="UTF-8"?>
<language_definitions>
  <language processor="Loongarch" endian="little" size="32" variant="ilp32f"
            id="Loongarch:LE:32:ilp32f">
    <compiler name="gnu" spec="ilp32f.cspec" id="default"/>
  </language>
  <language processor="Loongarch" endian="little" size="32" variant="ilp32d"
            id="Loongarch:LE:32:ilp32d">
    <compiler name="default" spec="ilp32d.cspec" id="default"/>
  </language>
  <language processor="Loongarch" endian="little" size="64" variant="lp64f"
            id="Loongarch:LE:64:lp64f">
    <compiler name="default" spec="lp64f.cspec" id="default"/>
  </language>
  <language processor="Loongarch" endian="little" size="64" variant="lp64d"
            id="Loongarch:LE:64:lp64d">
    <compiler name="default" spec="lp64d.cspec" id="default"/>
  </language>
</language_definitions>
`;

const configFor = (environment: NodeJS.ProcessEnv) => {
  const parsed = parseConfig({ GHIDRA_INSTALL_DIR: "/ghidra", ...environment });
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};
const config = configFor({});

const target = (change: Partial<ElfFamilyMetadata> = {}): BinaryTarget => ({
  path: "/fixture/loongarch.elf",
  sha256: "a".repeat(64),
  kind: "executable",
  format: "elf",
  architecture: "loongarch",
  availableArchitectures: ["loongarch"],
  loongarch: {
    elfClass: 64,
    byteOrder: "little",
    type: 2,
    flags: 0x43,
    ...change,
  },
});

describe("bounded Ghidra LoongArch ELF admission", () => {
  it.each([
    [64, 0x43, "Loongarch:LE:64:lp64d", "elf64-le-lp64d"],
    [64, 0x42, "Loongarch:LE:64:lp64f", "elf64-le-lp64f"],
    [64, 0x41, "Loongarch:LE:64:lp64d", "elf64-le-lp64s"],
    [32, 0x43, "Loongarch:LE:32:ilp32d", "elf32-le-ilp32d"],
    [32, 0x42, "Loongarch:LE:32:ilp32f", "elf32-le-ilp32f"],
    [32, 0x01, "Loongarch:LE:32:ilp32f", "elf32-le-ilp32s"],
  ] as const)(
    "binds ELF%i flags 0x%s to %s (%s)",
    async (elfClass, flags, languageId, lane) => {
      const ghidra = new GhidraProvider(config, silentLogger, {}, host);
      const selected = target({ elfClass, flags });
      expect(ghidra.inspectTargetSupport(selected).status).toBe("supported");
      const resolved = await ghidra.resolveAnalysisProfile(selected);
      if (!resolved.ok) throw resolved.error;
      const parameters = resolved.value.profile?.parameters ?? {};
      expect(parameters).toMatchObject({
        architecture: "loongarch",
        language_id: languageId,
        compiler_spec_id: "default",
        language_selection: "provider-pinned",
        loongarch_elf: {
          elf_class: elfClass,
          byte_order: "little",
          type: 2,
          flags,
        },
        loongarch_support_lane: lane,
      });
      expect(ghidraPinnedLanguage(selected)).toEqual({
        languageId,
        compilerSpecId: "default",
      });
      expect(ghidraProfileLanguageOverride(parameters)).toEqual(
        ghidraPinnedLanguage(selected),
      );
    },
  );

  it("lets a configured language replace the lane default", async () => {
    const installDir = await simulatedInstallDirectory("rea-ghidra-loongarch-");
    const languages = join(
      installDir,
      "Ghidra/Processors/Loongarch/data/languages",
    );
    await mkdir(languages, { recursive: true });
    await writeFile(join(languages, "loongarch.ldefs"), LOONGARCH_LDEFS);
    const ghidra = new GhidraProvider(
      configFor({
        GHIDRA_INSTALL_DIR: installDir,
        REA_GHIDRA_LANGUAGE_ID: "Loongarch:LE:64:lp64f",
      }),
      silentLogger,
      {},
      host,
    );
    const resolved = await ghidra.resolveAnalysisProfile(target());
    if (!resolved.ok) throw resolved.error;
    const parameters = resolved.value.profile?.parameters ?? {};
    expect(parameters).toMatchObject({
      language_id: "Loongarch:LE:64:lp64f",
      language_selection: "configured",
    });
  });

  it.each([
    ["big-endian ELF", { byteOrder: "big" as const }],
    ["zero ABI modifier (legacy pre-v0)", { flags: 0x0 }],
    ["reserved ABI modifier 0x4", { flags: 0x44 }],
    ["unknown object ABI version 0x80", { flags: 0x83 }],
    ["unverified upper e_flags bit", { flags: 0x143 }],
  ])("refuses %s fail-closed before Ghidra launch", async (_label, change) => {
    const ghidra = new GhidraProvider(config, silentLogger, {}, host);
    const refused = target(change);
    expect(ghidra.inspectTargetSupport(refused)).toMatchObject({
      status: "unsupported",
      code: "architecture_unsupported",
    });
    const resolved = await ghidra.resolveAnalysisProfile(refused);
    expect(resolved.ok).toBe(false);
  });

  it("declines LoongArch on Windows Ghidra P0, Hopper, and IDA with Ghidra guidance", () => {
    const selected = target();
    const windowsGhidra = new GhidraProvider(
      config,
      silentLogger,
      {},
      {
        ...host,
        platform: "win32",
      },
    );
    expect(windowsGhidra.inspectTargetSupport(selected)).toMatchObject({
      status: "unsupported",
      code: "target_format_unsupported",
    });
    const hopper = new HopperProvider(config, silentLogger, {});
    expect(hopper.inspectTargetSupport(selected)).toMatchObject({
      status: "unsupported",
      code: "architecture_unsupported",
      reason: expect.stringContaining("Ghidra"),
    });
    const ida = new IdaProvider(config, {});
    expect(ida.inspectTargetSupport(selected)).toMatchObject({
      status: "unsupported",
      code: "architecture_unsupported",
      reason: expect.stringContaining("Ghidra"),
    });
  });
});
