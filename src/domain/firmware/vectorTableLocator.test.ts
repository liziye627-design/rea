import { describe, it, expect } from "vitest";
import { locateArmVectorTables } from "./vectorTableLocator.js";

const createMockFirmware = (
  sizeBytes: number,
  vectorOffset: number,
  baseAddress: number,
  initialSp: number = 0x20005000,
): Uint8Array => {
  const buffer = new Uint8Array(sizeBytes);
  const view = new DataView(buffer.buffer);

  // Set SP
  view.setUint32(vectorOffset, initialSp, true);

  // Set Reset Handler (Thumb mode, address inside firmware image)
  const resetHandler = baseAddress + vectorOffset + 0x200 + 1;
  view.setUint32(vectorOffset + 4, resetHandler, true);

  // Set NMI Handler
  view.setUint32(
    vectorOffset + 8,
    baseAddress + vectorOffset + 0x240 + 1,
    true,
  );

  // Set HardFault Handler
  view.setUint32(
    vectorOffset + 12,
    baseAddress + vectorOffset + 0x250 + 1,
    true,
  );

  // Reserved slots 7-10 are left 0 (buffer initialized to 0)

  // Set SVCall (idx 11, offset 44)
  view.setUint32(
    vectorOffset + 44,
    baseAddress + vectorOffset + 0x260 + 1,
    true,
  );

  // Set PendSV (idx 14, offset 56)
  view.setUint32(
    vectorOffset + 56,
    baseAddress + vectorOffset + 0x270 + 1,
    true,
  );

  // Set SysTick (idx 15, offset 60)
  view.setUint32(
    vectorOffset + 60,
    baseAddress + vectorOffset + 0x280 + 1,
    true,
  );

  return buffer;
};

describe("ARM Cortex-M vector table automated location at standard offsets", () => {
  it("locates vector table at file offset 0 for STM32 Flash base", () => {
    const fw = createMockFirmware(1024, 0, 0x08000000);
    const results = locateArmVectorTables(fw, { platform: "stm32f1" });

    expect(results).toHaveLength(1);
    const match = results[0];
    expect(match?.fileOffset).toBe(0);
    expect(match?.baseAddress).toBe("0x8000000");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(match?.table.initialSp).toBe("0x20005000");
    expect(match?.table.resetHandler).toBe("0x8000200");
    expect(match?.reasons).toContain("Valid SRAM Initial_SP");
    expect(match?.reasons).toContain(
      "Architectural reserved exception vectors 7-10 are zero",
    );
  });

  it("locates vector table at offset 0x4000 after a bootloader", () => {
    const fw = createMockFirmware(0x8000, 0x4000, 0x08000000);
    const results = locateArmVectorTables(fw, {
      candidateBaseAddresses: [0x08000000n],
      platform: "stm32f1",
      stepAlignment: 256,
    });

    expect(results).toHaveLength(1);
    const match = results[0];
    expect(match?.fileOffset).toBe(0x4000);
    expect(match?.fileOffsetHex).toBe("0x4000");
    expect(match?.baseAddress).toBe("0x8004000");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(match?.table.resetHandler).toBe("0x8004200");
  });
});

describe("ARM Cortex-M vector table automated location across SoC platforms", () => {
  it("locates RP2040 vector table at 0x10000000 XIP flash base", () => {
    // RP2040 SRAM ends at 0x20042000
    const fw = createMockFirmware(2048, 0, 0x10000000, 0x20042000);
    const results = locateArmVectorTables(fw, {
      candidateBaseAddresses: [0x10000000n],
      platform: "rp2040",
    });

    expect(results).toHaveLength(1);
    const match = results[0];
    expect(match?.fileOffset).toBe(0);
    expect(match?.baseAddress).toBe("0x10000000");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(match?.table.initialSp).toBe("0x20042000");
    expect(match?.table.platform).toBe("rp2040");
  });

  it("returns empty array for random or non-ARM binary data", () => {
    const randomData = new Uint8Array(1024);
    for (let i = 0; i < randomData.length; i++) {
      randomData[i] = (i * 37 + 13) & 0xff;
    }

    const results = locateArmVectorTables(randomData);
    expect(results).toHaveLength(0);
  });

  it("filters results below minConfidence threshold", () => {
    // A firmware with only SP and Reset Handler (no HardFault/NMI/Exceptions, score = 0.65)
    const fw = new Uint8Array(1024);
    const view = new DataView(fw.buffer);
    view.setUint32(0, 0x20005000, true);
    view.setUint32(4, 0x08000201, true);

    const strictResults = locateArmVectorTables(fw, { minConfidence: 0.85 });
    expect(strictResults).toHaveLength(0);

    const relaxedResults = locateArmVectorTables(fw, { minConfidence: 0.5 });
    expect(relaxedResults.length).toBeGreaterThan(0);
  });
});
