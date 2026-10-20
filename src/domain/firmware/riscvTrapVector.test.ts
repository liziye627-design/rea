import { describe, expect, it } from "vitest";
import {
  parseRiscvTrapTable,
  riscvTrapTableSchema,
} from "./riscvTrapVector.js";

describe("RISC-V Trap Vector table parsing", () => {
  it("parses direct mode trap handler", () => {
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0x80000100, true);

    const result = parseRiscvTrapTable(data, 0x80000000n, "direct");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const table = result.value;
    expect(table.mode).toBe("direct");
    expect(table.entryCount).toBe(1);
    expect(table.entries[0]?.name).toBe("Unified_Trap_Handler");
    expect(table.entries[0]?.targetAddress).toBe("0x80000100");
    expect(riscvTrapTableSchema.safeParse(table).success).toBe(true);
  });

  it("parses vectored mode trap table resolving Timer, Software, and External PLIC interrupts", () => {
    const data = new Uint8Array(16 * 4);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0x80000200, true); // Sync exception handler
    view.setUint32(3 * 4, 0x80000250, true); // Cause 3: MSIP (Software)
    view.setUint32(7 * 4, 0x80000280, true); // Cause 7: MTIP (Timer)
    view.setUint32(11 * 4, 0x80000300, true); // Cause 11: MEIP (PLIC)

    const result = parseRiscvTrapTable(data, 0x80000000n, "vectored");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const table = result.value;
    expect(table.mode).toBe("vectored");
    expect(table.entryCount).toBe(16);

    // Sync exception
    expect(table.entries[0]?.name).toBe("Synchronous_Exception_Handler");
    expect(table.entries[0]?.targetAddress).toBe("0x80000200");

    // Cause 3: Software Interrupt
    const msip = table.entries.find(
      (e) => e.name === "Machine_Software_Interrupt",
    );
    expect(msip).toBeDefined();
    expect(msip?.cause).toBe(3);
    expect(msip?.associatedController).toBe("CLINT");
    expect(msip?.targetAddress).toBe("0x80000250");

    // Cause 7: Timer Interrupt
    const mtip = table.entries.find(
      (e) => e.name === "Machine_Timer_Interrupt",
    );
    expect(mtip).toBeDefined();
    expect(mtip?.cause).toBe(7);
    expect(mtip?.associatedController).toBe("CLINT");
    expect(mtip?.targetAddress).toBe("0x80000280");

    // Cause 11: External PLIC Interrupt
    const meip = table.entries.find(
      (e) => e.name === "Machine_External_Interrupt",
    );
    expect(meip).toBeDefined();
    expect(meip?.cause).toBe(11);
    expect(meip?.associatedController).toBe("PLIC");
    expect(meip?.targetAddress).toBe("0x80000300");
  });

  it("rejects truncated buffer (< 16 bytes)", () => {
    const tooShort = new Uint8Array(8);
    const result = parseRiscvTrapTable(tooShort, 0x80000000n);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Binary data too short");
  });
});
