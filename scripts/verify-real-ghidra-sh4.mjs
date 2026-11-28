import { createGhidraVerifierMcpOperations } from "./lib/ghidra-verifier-mcp.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { parseEvidence } from "../dist/domain/evidence.js";
import {
  requireMcpToolError,
  requireMcpAnalysisEvidenceOrSessionResult,
} from "./lib/mcp-verifier-results.mjs";
import {
  assertVerifierCleanupComplete,
  createVerifierRun,
  completeVerifierRun,
} from "./lib/verifier-run.mjs";
import { closeVerifierResources } from "./lib/verifier-cleanup.mjs";
import { createVerifierCommands } from "./lib/verify-commands.mjs";
import { VerifierFixture } from "./lib/verifier-fixture.mjs";
import { completeEvidenceClient } from "./lib/complete-evidence.mjs";

if (process.argv.length !== 2)
  throw new Error("Usage: node scripts/verify-real-ghidra-sh4.mjs");
// Windows Ghidra P0 admits raw 6502 only; sh4 has no Windows lane.
if (!["linux", "darwin"].includes(process.platform))
  throw new Error(
    "sh4 raw-binary verification requires a Linux or macOS Ghidra host.",
  );
if (process.env.GHIDRA_INSTALL_DIR === undefined)
  throw new Error(
    "Set GHIDRA_INSTALL_DIR to a bring-your-own Ghidra installation.",
  );
const run = createVerifierRun();
const root = fileURLToPath(new URL("..", import.meta.url));
// Source-owned little-endian SuperH-4 (SH-4) image, loaded at 0x8c010000:
//   0x8c010000 224f  sts.l   pr,@-r15
//   0x8c010002 07e4  mov     #7,r4
//   0x8c010004 0ab0  bsr     add_three (0x8c01001c)
//   0x8c010006 0900  nop
//   0x8c010008 0a88  cmp/eq  #10,r0
//   0x8c01000a 038b  bf      mismatch (0x8c010014)
//   0x8c01000c 2ae0  mov     #42,r0
//   0x8c01000e 264f  lds.l   @r15+,pr
//   0x8c010010 0b00  rts
//   0x8c010012 0900  nop
//   0x8c010014 00e0  mismatch: mov #0,r0
//   0x8c010016 264f  lds.l   @r15+,pr
//   0x8c010018 0b00  rts
//   0x8c01001a 0900  nop
//   0x8c01001c 4360  add_three: mov r4,r0
//   0x8c01001e 0370  add     #3,r0
//   0x8c010020 0b00  rts
//   0x8c010022 0900  nop
const bytes = Buffer.from(
  "224f07e40ab009000a88038b2ae0264f0b00090000e0264f0b000900436003700b000900",
  "hex",
);
const sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(bytes.length, 36);
await mkdir(join(root, "build"), { recursive: true });
const workspaceFixture = await VerifierFixture.open({
  prefix: "rea-sh4-proof-",
  // Ghidra children use the workspace as TMPDIR; a plain root admits them on every host.
  private: false,
  parent: join(root, "build"),
});
const workspace = workspaceFixture.path;
const runtime = join(workspace, "runtime");
await mkdir(runtime);
const path = join(workspace, "image.bin");
await writeFile(path, bytes);
const entrypoint = join(root, "scripts", "rea.mjs");
const env = {
  ...process.env,
  TMPDIR: runtime,
  TMP: runtime,
  TEMP: runtime,
  REA_LOG_LEVEL: "silent",
  REA_ANALYSIS_PROVIDER: "ghidra",
  REA_PROCESS_RUN_ID: run.run_id,
};
// Compiler and CLI launches share one command owner, created before either starts.
const commands = await createVerifierCommands();
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entrypoint, "mcp"],
  env,
  stderr: "pipe",
});
const client = completeEvidenceClient(
  new Client({ name: "rea-real-sh4-proof", version: "1" }),
);
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr = (stderr + chunk.toString()).slice(-65536);
});
const call = createGhidraVerifierMcpOperations(client, {
  timeout: 240000,
}).decodedCall(requireMcpAnalysisEvidenceOrSessionResult);
let report;
let primaryFailure;
try {
  await client.connect(transport);
  const opened = await call("open_binary", {
    path,
    format: "raw-binary",
    architecture: "sh4",
    entry_point: "0x8c010000",
    provider_id: "ghidra",
  });
  assert.equal(opened.architecture, "sh4");
  assert.equal(opened.entry_point, "0x8c010000");
  const status = await call("binary_session");
  const image = evidence(await call("inspect_native_load_image"));
  assert.equal(
    image.normalized_result.status,
    "verified",
    JSON.stringify(image.normalized_result),
  );
  assert.equal(image.normalized_result.architecture, "sh4");
  assert.equal(image.normalized_result.base_address, "0x8c010000");
  assert.equal(image.normalized_result.language_id, "SuperH4:LE:32:default");
  assert.equal(image.normalized_result.compiler_spec_id, "default");
  assert.equal(image.normalized_result.file_bytes, bytes.length);
  assert.equal(image.analysis_profile.parameters.loader, "BinaryLoader");
  assert.equal(
    image.analysis_profile.parameters.language_id,
    "SuperH4:LE:32:default",
  );
  assert.equal(image.analysis_profile.parameters.compiler_spec_id, "default");
  assert.equal(image.analysis_profile.parameters.entry_point, "0x8c010000");
  const memory = evidence(
    await call("read_bytes", { address: "0x8c010000", length: bytes.length }),
  );
  assert.equal(memory.normalized_result.bytes_hex, bytes.toString("hex"));
  const procedures = evidence(await call("list_procedures"));
  assert.deepEqual(
    procedures.normalized_result.map((procedure) => procedure.address).sort(),
    ["0x8c010000", "0x8c01001c"],
  );
  const callInstruction = evidence(
    await call("inspect_native_instruction", { address: "0x8c010004" }),
  );
  assert.equal(
    callInstruction.normalized_result.mnemonic.replace(/^_/u, ""),
    "bsr",
  );
  assert.equal(callInstruction.normalized_result.flow.kind, "call");
  assert.deepEqual(callInstruction.normalized_result.flow.direct_destinations, [
    "0x8c01001c",
  ]);
  assert.ok(
    callInstruction.normalized_result.references.some(
      (reference) =>
        reference.call &&
        reference.type === "UNCONDITIONAL_CALL" &&
        reference.target_address === "0x8c01001c",
    ),
  );
  const branchInstruction = evidence(
    await call("inspect_native_instruction", { address: "0x8c01000a" }),
  );
  assert.equal(branchInstruction.normalized_result.mnemonic, "bf");
  assert.deepEqual(
    branchInstruction.normalized_result.flow.direct_destinations,
    ["0x8c010014"],
  );
  const pseudo = evidence(
    await call("procedure_pseudo_code", {
      detail: "complete",
      procedure: "0x8c01001c",
    }),
  );
  assert.match(pseudo.normalized_result, /\+\s*(?:3|0x3)\b/u);
  const caller = evidence(
    await call("procedure_pseudo_code", {
      detail: "complete",
      procedure: "0x8c010000",
    }),
  );
  assert.match(caller.normalized_result, /return\b/u);
  const filePseudo = evidence(
    await call("procedure_pseudo_code", {
      detail: "complete",
      procedure: "file-offset:0x1c",
    }),
  );
  assert.equal(filePseudo.normalized_result, pseudo.normalized_result);
  assert.ok(
    filePseudo.locations.some(
      (location) => location.kind === "file-offset" && location.offset === 28,
    ),
  );
  // Rejected selections must not replace the live session.
  for (const [entryPoint, reason] of [
    [
      "0x8c010001",
      "raw-binary sh4 entry_point 0x8c010001 must be 2-byte aligned",
    ],
    [
      "0xfffffff0",
      "raw-binary mapping from 0xfffffff0 must fit in the sh4 address width",
    ],
  ]) {
    const rejected = await client.callTool({
      name: "open_binary",
      arguments: {
        path,
        format: "raw-binary",
        architecture: "sh4",
        entry_point: entryPoint,
      },
    });
    // admitRawBinary rejects the selection before Ghidra starts.
    const rejectedError = requireMcpToolError(rejected);
    assert.partialDeepStrictEqual(rejectedError, {
      code: "invalid_request",
      details: {
        path,
        reason,
        constraint: "load_selection_rejected",
      },
    });
    const preserved = await call("binary_session");
    assert.equal(preserved.analysis_run.run_id, status.analysis_run.run_id);
    assert.equal(preserved.entry_point, "0x8c010000");
  }
  await call("close_binary");
  await client.ping();
  const { stdout } = await commands.exec(
    process.execPath,
    [
      entrypoint,
      "inspect-native-load-image",
      "--detail",
      "complete",
      path,
      "--target-format",
      "raw-binary",
      "--architecture",
      "sh4",
      "--entry-point",
      "0x8c010000",
      "--provider",
      "ghidra",
      "--json",
    ],
    { env, timeout: 240000, maxBuffer: 16 * 1024 * 1024 },
  );
  const cli = evidence(JSON.parse(stdout));
  assert.deepEqual(cli.normalized_result, image.normalized_result);
  assert.equal(cli.analysis_profile.digest, image.analysis_profile.digest);
  const fileCli = await commands.exec(
    process.execPath,
    [
      entrypoint,
      "decompile",
      "--detail",
      "complete",
      path,
      "--file-offset=0x1c",
      "--target-format",
      "raw-binary",
      "--architecture",
      "sh4",
      "--entry-point",
      "0x8c010000",
      "--provider",
      "ghidra",
      "--json",
    ],
    { env, timeout: 240000, maxBuffer: 16 * 1024 * 1024 },
  );
  const fileCliEvidence = evidence(JSON.parse(fileCli.stdout));
  assert.equal(fileCliEvidence.normalized_result, filePseudo.normalized_result);
  assert.deepEqual(fileCliEvidence.locations, filePseudo.locations);
  assert.deepEqual(await readFile(path), bytes);
  assert.deepEqual(
    (await readdir(runtime)).filter((name) => name.startsWith("rea-ghidra-")),
    [],
    "Owned Ghidra runtime survived close",
  );
  report = {
    ok: true,
    mocked: false,
    lane: "ghidra-sh4",
    host: process.platform,
    provider: image.provider,
    target: {
      sha256,
      bytes: bytes.length,
      architecture: "sh4",
      entry: "0x8c010000",
    },
    cli_mcp_load_image_parity: true,
    instructions_and_call_reference: true,
    decompilation: true,
    file_offset_decompilation_cli_mcp: true,
    misaligned_entry_preserves_session: true,
    invalid_mapping_preserves_session: true,
    source_unchanged: true,
    runtime_cleanup: "complete",
  };
} catch (cause) {
  if (stderr) process.stderr.write(stderr);
  primaryFailure = cause;
} finally {
  // Client, transport, and command cleanup are independent. A failure in one
  // must not skip the others.
  const shutdownFailures = [];
  try {
    await closeVerifierResources([
      () => client.close(),
      () => transport.close(),
    ]);
  } catch (cause) {
    shutdownFailures.push(
      ...(cause instanceof AggregateError ? cause.errors : [cause]),
    );
  }
  try {
    await workspaceFixture.closeEarly([() => commands.close()]);
  } catch (cause) {
    shutdownFailures.push(
      ...(cause instanceof AggregateError ? cause.errors : [cause]),
    );
  }
  if (shutdownFailures.length > 0) {
    const shutdown =
      shutdownFailures.length === 1
        ? shutdownFailures[0]
        : new AggregateError(shutdownFailures, "sh4 shutdown failed");
    primaryFailure =
      primaryFailure === undefined
        ? shutdown
        : new AggregateError(
            [primaryFailure, shutdown],
            "sh4 verification and shutdown both failed",
          );
  }
}
if (primaryFailure === undefined) {
  try {
    const survivors = await readdir(runtime);
    if (survivors.length > 0)
      primaryFailure = workspaceFixture.retainedError(
        `Runtime resources survived server shutdown (${survivors.join(", ")}); retained workspace: ${workspace}`,
      );
  } catch (cause) {
    primaryFailure = cause;
  }
}
const verifierRun = await completeVerifierRun(run);
try {
  assertVerifierCleanupComplete(verifierRun.process_lineage);
} catch (cause) {
  throw workspaceFixture.retainedError(
    `Cleanup unverified; retained diagnostic workspace: ${workspace}`,
    { cause: primaryFailure ?? cause },
  );
}
if (primaryFailure !== undefined)
  throw workspaceFixture.retainedError(
    `sh4 verification failed; retained workspace: ${workspace}`,
    { cause: primaryFailure },
  );
await workspaceFixture.release();
process.stdout.write(
  JSON.stringify({ verifier_run: verifierRun, ...report }) + "\n",
);

function evidence(value) {
  const result = parseEvidence(value);
  assert.equal(result.subject.identity.sha256, sha256);
  assert.equal(result.subject.identity.architecture, "sh4");
  assert.equal(result.subject.identity.format, "raw-binary");
  return result;
}
