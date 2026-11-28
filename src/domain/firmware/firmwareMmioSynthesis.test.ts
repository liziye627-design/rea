import { describe, expect, it } from "vitest";
import {
  firmwareMmioSynthesisSchema,
  mmioSynthesisCountsMatch,
} from "./firmwareMmioSynthesis.js";
import { parseFirmwareMmioSynthesis } from "./firmwareMmioSynthesisParser.js";
import { parseSvdPeripheralMap } from "./firmwareSvdPeripherals.js";

const encodeRiscvU = (opcode: number, rd: number, imm20: number): number =>
  (((imm20 & 0xfffff) << 12) | ((rd & 0x1f) << 7) | (opcode & 0x7f)) >>> 0;

const encodeRiscvI = (
  opcode: number,
  rd: number,
  funct3: number,
  rs1: number,
  imm12: number,
): number =>
  (((imm12 & 0xfff) << 20) |
    ((rs1 & 0x1f) << 15) |
    ((funct3 & 0x7) << 12) |
    ((rd & 0x1f) << 7) |
    (opcode & 0x7f)) >>>
  0;

const encodeRiscvS = (
  funct3: number,
  rs1: number,
  rs2: number,
  imm12: number,
): number => {
  const u = imm12 & 0xfff;
  return (
    (((u >>> 5) << 25) |
      ((rs2 & 0x1f) << 20) |
      ((rs1 & 0x1f) << 15) |
      ((funct3 & 0x7) << 12) |
      ((u & 0x1f) << 7) |
      0x23) >>>
    0
  );
};

describe("parseFirmwareMmioSynthesis across hardware ISAs", () => {
  it("disassembles RISC-V RV32IMC LUI + LW/SW/ADDI mixed with 16-bit RVC instructions and binds CMSIS-SVD registers", () => {
    const svd = parseSvdPeripheralMap(`
      <device>
        <peripherals>
          <peripheral>
            <name>USART1</name>
            <baseAddress>0x40013800</baseAddress>
            <addressBlock><offset>0</offset><size>0x400</size></addressBlock>
            <registers>
              <register><name>STATR</name><addressOffset>0x00</addressOffset><size>32</size></register>
              <register><name>DATAR</name><addressOffset>0x04</addressOffset><size>32</size></register>
            </registers>
          </peripheral>
          <peripheral derivedFrom="USART1">
            <name>USART2</name>
            <baseAddress>0x40004400</baseAddress>
          </peripheral>
        </peripherals>
      </device>
    `);
    expect(svd.ok).toBe(true);
    if (!svd.ok) return;

    // Build mixed 32-bit + 16-bit RVC instruction stream (18 bytes)
    const buf = Buffer.alloc(18, 0);
    // 0x00: LUI a5 (x15), 0x40014 -> base 0x40014000 (sign-extended -0x800 reaches 0x40013800!)
    buf.writeUInt32LE(encodeRiscvU(0x37, 15, 0x40014), 0);
    // 0x04: RVC C.NOP (0x0001) - tests 2-byte mixed RVC alignment!
    buf.writeUInt16LE(0x0001, 4);
    // 0x06: LW a4 (x14), -0x800(a5) -> 0x40013800 (USART1.STATR)
    buf.writeUInt32LE(encodeRiscvI(0x03, 14, 2, 15, -0x800), 6);
    // 0x0a: SW a4 (x14), -0x7fc(a5) -> 0x40013804 (USART1.DATAR)
    buf.writeUInt32LE(encodeRiscvS(2, 15, 14, -0x7fc), 10);
    // 0x0e: LUI a0 (x10), 0x40004; C.LW? Let's test ADDI materialization to USART2.DATAR (0x40004404):
    // Replace 0x0e..0x15 with LUI + ADDI:
    const full = Buffer.alloc(22, 0);
    buf.copy(full, 0, 0, 14);
    full.writeUInt32LE(encodeRiscvU(0x37, 10, 0x40004), 14);
    full.writeUInt32LE(encodeRiscvI(0x13, 10, 0, 10, 0x404), 18);

    const parsed = parseFirmwareMmioSynthesis({
      artifact: {
        path: "/tmp/ch32v307.bin",
        sha256: "a".repeat(64),
        bytes: full.length,
      },
      architecture: "riscv32",
      baseAddressHex: "0x00000000",
      scanOffset: 0,
      maxScanBytes: 4096,
      maxSyntheses: 64,
      maxWindowInstructions: 16,
      mmioOnly: true,
      scanBytes: full,
      svdSupplied: true,
      svdPeripherals: svd.value.peripherals,
      svdSkipped: svd.value.skipped,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const report = parsed.value;
    expect(firmwareMmioSynthesisSchema.safeParse(report).success).toBe(true);
    expect(mmioSynthesisCountsMatch(report)).toBe(true);
    expect(report.decoded_instructions).toBe(6);
    expect(report.syntheses).toHaveLength(3);
    expect(report.load_synthesis_count).toBe(1);
    expect(report.store_synthesis_count).toBe(1);
    expect(report.materialization_synthesis_count).toBe(1);
    expect(report.syntheses[0]).toMatchObject({
      pattern: "lui+lw",
      access_kind: "load",
      access_width_bytes: 4,
      synthesized_address: "0x40013800",
      peripheral_name: "USART1",
      register_name: "STATR",
    });
    expect(report.syntheses[1]).toMatchObject({
      pattern: "lui+sw",
      access_kind: "store",
      synthesized_address: "0x40013804",
      peripheral_name: "USART1",
      register_name: "DATAR",
    });
    expect(report.syntheses[2]).toMatchObject({
      pattern: "lui+addi",
      access_kind: "address_materialization",
      synthesized_address: "0x40004404",
      peripheral_name: "USART2",
      register_name: "DATAR",
    });
    expect(report.svd_peripherals).toEqual({
      supplied: true,
      peripheral_count: 2,
      matched_synthesis_count: 3,
      exact_register_match_count: 3,
    });
  });

  it("disassembles MIPS32 big-endian KSEG1 LUI+ORI/SW including branch delay slots and physical SVD translation", () => {
    const svd = parseSvdPeripheralMap(`
      <device>
        <peripherals>
          <peripheral>
            <name>UART0</name>
            <baseAddress>0x18020000</baseAddress>
            <registers>
              <register><name>THR</name><addressOffset>0x00</addressOffset><size>32</size></register>
            </registers>
          </peripheral>
        </peripherals>
      </device>
    `);
    if (!svd.ok) throw svd.error;

    const buf = Buffer.alloc(16, 0);
    // 0x00: LUI $t0 ($8), 0xb802 -> 0x3c08b802 (KSEG1 virtual for physical 0x18020000)
    buf.writeUInt32BE(0x3c08_b802, 0);
    // 0x04: JR $ra (0x03e00008) - branch whose delay slot at 0x08 STILL executes with $t0 live!
    buf.writeUInt32BE(0x03e0_0008, 4);
    // 0x08 (delay slot): SW $a0 ($4), 0($t0) -> op=0x2b, rs=$8, rt=$4 -> 0xad040000 (phys 0x18020000 UART0.THR)
    buf.writeUInt32BE(0xad04_0000, 8);
    // 0x0c (after delay slot, $t0 must be cleared!): LW $v0 ($2), 4($t0) -> 0x8d020004 (must NOT synthesize!)
    buf.writeUInt32BE(0x8d02_0004, 12);

    const parsed = parseFirmwareMmioSynthesis({
      artifact: {
        path: "/tmp/ar9331_boot.bin",
        sha256: "b".repeat(64),
        bytes: buf.length,
      },
      architecture: "mips32be",
      baseAddressHex: "0xbfc00000",
      scanOffset: 0,
      maxScanBytes: 4096,
      maxSyntheses: 64,
      maxWindowInstructions: 16,
      mmioOnly: true,
      scanBytes: buf,
      svdSupplied: true,
      svdPeripherals: svd.value.peripherals,
      svdSkipped: [],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.syntheses).toHaveLength(1);
    expect(parsed.value.syntheses[0]).toMatchObject({
      pattern: "lui+sw",
      access_kind: "store",
      synthesized_address: "0xb8020000",
      physical_address: "0x18020000",
      region_class: "svd_peripheral",
      peripheral_name: "UART0",
      register_name: "THR",
    });
  });

  it("disassembles PowerPC Book-E LIS+ORI+STW and ARM64 ADRP+LDR/STR peripheral accesses", () => {
    // PowerPC big-endian: LIS r3, 0xc3f9 (0x3c60c3f9); ORI r3, r3, 0x4000 (0x60634000); STW r4, 0x10(r3) (0x90830010)
    const ppc = Buffer.alloc(12, 0);
    ppc.writeUInt32BE(0x3c60_c3f9, 0);
    ppc.writeUInt32BE(0x6063_4000, 4);
    ppc.writeUInt32BE(0x9083_0010, 8);

    const ppcRes = parseFirmwareMmioSynthesis({
      artifact: {
        path: "/tmp/mpc5674.bin",
        sha256: "c".repeat(64),
        bytes: ppc.length,
      },
      architecture: "ppc32be",
      baseAddressHex: "0x00000000",
      scanOffset: 0,
      maxScanBytes: 4096,
      maxSyntheses: 64,
      maxWindowInstructions: 16,
      mmioOnly: true,
      scanBytes: ppc,
      svdSupplied: false,
      svdPeripherals: [],
      svdSkipped: [],
    });
    expect(ppcRes.ok).toBe(true);
    if (!ppcRes.ok) return;
    expect(ppcRes.value.syntheses).toHaveLength(2);
    expect(ppcRes.value.syntheses[0]).toMatchObject({
      pattern: "lis+ori",
      access_kind: "address_materialization",
      synthesized_address: "0xc3f94000",
    });
    expect(ppcRes.value.syntheses[1]).toMatchObject({
      pattern: "lis+ori+stw",
      access_kind: "store",
      synthesized_address: "0xc3f94010",
    });

    // ARM64 at 0x00000000: ADRP x0, 0x09000000 (imm21 = 0x9000 -> immlo=0, immhi=0x2400 -> 0x90048000)
    // LDR w1, [x0, #0x18] -> size=10, V=0, opc=01, imm12=6 (6*4=0x18), rn=0, rt=1 -> 0xb9401801
    const a64 = Buffer.alloc(8, 0);
    a64.writeUInt32LE(0x9004_8000, 0);
    a64.writeUInt32LE(0xb940_1801, 4);

    const a64Res = parseFirmwareMmioSynthesis({
      artifact: {
        path: "/tmp/bl31.bin",
        sha256: "d".repeat(64),
        bytes: a64.length,
      },
      architecture: "arm64",
      baseAddressHex: "0x00000000",
      scanOffset: 0,
      maxScanBytes: 4096,
      maxSyntheses: 64,
      maxWindowInstructions: 16,
      mmioOnly: true,
      scanBytes: a64,
      svdSupplied: false,
      svdPeripherals: [],
      svdSkipped: [],
    });
    expect(a64Res.ok).toBe(true);
    if (!a64Res.ok) return;
    expect(a64Res.value.syntheses).toHaveLength(1);
    expect(a64Res.value.syntheses[0]).toMatchObject({
      pattern: "adrp+ldr",
      access_kind: "load",
      access_width_bytes: 4,
      synthesized_address: "0x9000018",
      region_class: "architectural_mmio",
    });
  });
});
