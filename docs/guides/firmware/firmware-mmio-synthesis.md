# Firmware split-immediate MMIO disassembly

`inspect_firmware_mmio_synthesis` (`rea inspect-firmware-mmio-synthesis`)
disassembles split-immediate memory-mapped peripheral register accesses and
base-address materializations in bare-metal firmware and bootloader images
without opening a live disassembler session or executing target code.

Unlike ARM Cortex-M Thumb-2 code—which frequently loads 32-bit peripheral
addresses from nearby literal pools—fixed-width and compressed RISC ISAs build
full 32-bit or 64-bit peripheral addresses across paired instructions within a
short register-tracking window.

## Supported instruction sets

| `architecture`         | Instruction alignment | High-half producers          | Low-half consumers                                                                                  | Architectural MMIO notes                                                                                                          |
| ---------------------- | --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `riscv32`, `riscv64`   | 2 bytes (RV32/64IMC)  | `LUI`, `AUIPC`, `C.LUI`      | `ADDI`, `C.ADDI`, `LB`/`LH`/`LW`/`LD`/`LBU`/`LHU`/`LWU`, `SB`/`SH`/`SW`/`SD`, `C.LW`/`C.SW`         | Steps mixed 16-bit RVC and 32-bit instructions; resets tracking on branches/jumps                                                 |
| `mips32le`, `mips32be` | 4 bytes               | `LUI`                        | `ORI`, `ADDIU`, `LB`/`LH`/`LW`/`LBU`/`LHU`, `SB`/`SH`/`SW`                                          | Honours 1-instruction branch delay slots; translates `KSEG1` (`0xa0000000..0xbfffffff`) to `physical_address` (`0x0..0x1fffffff`) |
| `ppc32be`              | 4 bytes               | `LIS` (`ADDIS rD, 0, imm16`) | `ORI`, `ADDI`, `LWZ`/`LWZU`/`LBZ`/`LBZU`/`LHZ`/`LHZU`/`LHA`, `STW`/`STWU`/`STB`/`STBU`/`STH`/`STHU` | Enforces PowerPC `rA != 0` base-register rule on `ADDI` and `D`-form loads/stores                                                 |
| `arm64`                | 4 bytes               | `ADRP`                       | `ADD` (immediate / `LSL #12`), unsigned-offset `LDR`/`STR`/`LDRB`/`STRB`/`LDRH`/`STRH`/`LDRSW`      | Computes 4 KiB page-aligned `ADRP` bases from `base_address + offset`                                                             |

## CLI and MCP usage

```bash
rea inspect-firmware-mmio-synthesis /path/to/firmware.bin \
  --architecture riscv32 \
  --base-address 0x08000000
```

Pass `--svd-xml "$(cat device.svd)"` (or `svd_xml` in MCP) to resolve
synthesized addresses against CMSIS-SVD `<peripheral>` blocks (including
`derivedFrom` inheritance and `<addressBlock>` spans) and exact `<register>`
offsets. On MIPS32 `KSEG1` uncached accesses, CMSIS-SVD matching checks both the
virtual `synthesized_address` and translated `physical_address`.

## Budgets, views, and limitations

- Admission and scan controls: `max_file_bytes` (default 32 MiB, max 64 MiB),
  `max_scan_bytes` (default 256 KiB, max 4 MiB), `max_syntheses` (default 512,
  max 4096), `max_window_instructions` (default 16, max 64),
  `max_svd_xml_nodes`, and `max_svd_expanded_chars`.
- Delivery: `detail: "summary"` (or automatic summary when inline output
  exceeds the agent result budget) retains complete Evidence for
  `inspect_analysis_view` with `kind: "firmware-mmio-synthesis"` and
  `collection` set to `syntheses`, `peripheral_groups`, or `anomalies`.
- Static linear disassembly clears register state at branches and does not
  prove runtime MMU/MPU mappings, clock gating, or indirect pointer/DMA
  accesses. Inline `svd_xml` text is not retained in Evidence; its SHA-256
  digest is recorded in `parameters.svd_xml_sha256`.
