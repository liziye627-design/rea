# MCUboot images

`inspect-artifact` and `extract-artifact` recognize an MCUboot firmware image
(`zephyr.signed.bin`, `app_update.bin` and similar `imgtool` outputs) by its
little-endian `0x96f3b83d` header magic at byte offset 0, independent of the
file name. Legacy MCUboot v1 images (`0x96f3b83c`) are refused explicitly.

REA parses the header and optional protected (`0x6908`) and unprotected
(`0x6907`) TLV areas offline. It checks unencrypted SHA-256, SHA-384 and
SHA-512 image digests against `header + payload + protected_tlv`; it does not
cryptographically verify signatures, export wrapped encryption keys into
metadata, decrypt or decompress payloads, or execute code.

```sh
rea inspect-artifact ./zephyr.signed.bin --json
rea extract-artifact ./zephyr.signed.bin --json
```

## Header fields, TLVs and entries

Root `format_metadata` has kind `mcuboot` and records the 32-byte
`image_header` fields together with parsed TLV summaries:

| Field                                    | Meaning                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `load_address`                           | `ih_load_addr` (`0` when the image does not declare a RAM load destination)                 |
| `header_size`, `image_size`              | `ih_hdr_size` (`>= 32`) and `ih_img_size` payload byte length                               |
| `protected_tlv_size`                     | `ih_protect_tlv_size` (`0` when no `0x6908` protected TLV area is present)                  |
| `unprotected_tlv_size`                   | `it_tlv_tot` of the `0x6907` unprotected TLV area, or `null` when absent                    |
| `flags`, `flag_names`, `unknown_flags`   | Raw `ih_flags` bitmask, decoded MCUboot flag names, and any unrecognized bits               |
| `version`                                | `major`, `minor`, `revision`, `build_num` and `major.minor.revision+build_num` text         |
| `security_counter`, `dependencies`       | Protected/unprotected `SEC_CNT` (`0x50`) and `DEPENDENCY` (`0x40`) records                  |
| `digests`, `signatures`                  | Declared `SHA256`/`SHA384`/`SHA512` check verdicts and `unverified` signature TLV summaries |
| `encrypted`, `encryption_tlvs`           | Whether header flags or `ENC_*` (`0x30..0x33`) TLVs declare payload encryption              |
| `compressed`                             | Whether `ih_flags` sets an LZMA1, LZMA2 or ARM Thumb compression flag                       |
| `tlv_records`, `omitted_tlv_records`     | First 128 TLV record headers (`area`, `index`, `type`, `type_name`, `offset`, `length`)     |
| `trailing_bytes`, `trailing_erased_only` | Bytes following the last TLV block and whether all of them equal `0xff`                     |

Inventory exposes up to three byte-range occurrences:

| Path                | Bytes                                                         |
| ------------------- | ------------------------------------------------------------- |
| `payload.bin`       | `[ih_hdr_size .. ih_hdr_size + ih_img_size)`                  |
| `protected-tlv.bin` | Optional `0x6908` protected TLV block following `payload.bin` |
| `tlv.bin`           | Optional `0x6907` unprotected TLV block                       |

## Digest checks, encryption and raw-binary hand-off

For unencrypted images, REA streams `[0 .. ih_hdr_size + ih_img_size)` plus any
protected TLV bytes through each declared digest algorithm (`sha256`, `sha384`,
`sha512`). Under the default `fail` integrity policy, a digest mismatch fails
inspection and extraction with `reason: "integrity"`. Under
`record-and-continue`, `digests[].status` is `"invalid"`, the mismatch is
recorded in `limitations`, and inventory coverage becomes `unknown`.

Signature TLVs (`rsa2048-pss`, `ecdsa224`, `ecdsa-sig`, `rsa3072-pss`,
`ed25519`, `sig-pure`) pair with an immediately preceding `keyhash` (`0x01`)
record when present and always report `status: "unverified"`.

When `ih_flags` sets `encrypted-aes128` or `encrypted-aes256`, or when either
TLV area carries an `enc-rsa2048`, `enc-kw`, `enc-ec256`, or `enc-x25519`
record:

- `encrypted` is `true`, and `encryption_tlvs` names the tag kinds without
  copying wrapped key bytes into metadata.
- `digests[].status` is `"encrypted-unverified"` (`computed: null`), because
  MCUboot hashes plaintext while `payload.bin` in an encrypted image holds
  ciphertext.
- `payload.bin` is marked `encrypted: true` with `hash_status: "unavailable"`,
  refuses `extract-artifact`, and does not emit an `open_binary` next probe.

Compressed flags (`compressed-lzma1`, `compressed-lzma2`,
`compressed-arm-thumb`) leave `payload.bin` stored as compressed bytes with an
explicit limitation. Trailing `0xff` flash padding keeps inventory coverage
`complete` with a limitation naming the byte count; non-erased trailing bytes
(such as an MCUboot swap status trailer) set `trailing_erased_only: false` and
leave coverage `unknown`.

For an unencrypted, uncompressed image, extract `payload.bin` and pass it to
`open_binary` with `format: "raw-binary"` and the target CPU architecture.
Because `payload.bin` begins after the `ih_hdr_size`-byte MCUboot header, pass
the slot's post-header load address (or `load_address` when nonzero); for
Cortex-M images, supply both `architecture_variant` and `base_address` (plus
`vector_table_address` when the vector table is aligned after the header).

## Verification scope

Source tests cover `0x96f3b83d` recognition and `0x96f3b83c` v1 refusal, header
flag and version decoding, protected and unprotected TLV parsing (`sha256`,
`sha384`, `sha512`, `keyhash` + signature pairing, `dependency`, `sec-cnt`,
`enc-kw` key-byte omission, and 128-record inline bounding), `fail` versus
`record-and-continue` digest mismatches, encrypted payload extraction refusal,
`0xff` padding versus non-erased swap trailers, and truncated or malformed
headers and TLV blocks. Tests use synthetic images.
