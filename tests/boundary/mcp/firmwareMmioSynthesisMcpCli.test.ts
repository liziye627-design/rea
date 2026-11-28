import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, onTestFinished } from "vitest";
import { createCli } from "../../../src/cli.js";
import { silentLogger } from "../../../src/logger.js";
import { AGENT_RESULT_BUDGET_ENVIRONMENT } from "../../../src/domain/agentResultBudget.js";
import { analysisRefusalRemediation } from "../../../src/domain/analysisRefusal.js";
import type { AdjustableBudget } from "../../../src/domain/analysisRefusal.js";
import {
  DEFAULT_AGENT_RESULT_BUDGET_BYTES,
  MINIMUM_AGENT_RESULT_BUDGET_BYTES,
} from "../../../src/domain/analysisResourceLimits.js";
import { AGENT_BUDGET_DELIVERY_META } from "../../../src/server/ToolResultDelivery.js";
import { createServer } from "../../../src/server/createServer.js";
import { createTestBinarySession } from "../../fixtures/binarySession.js";
import { createMcpSchemaValidation } from "../../fixtures/mcpSchemaValidation.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

describe("inspect_firmware_mmio_synthesis CLI and MCP parity", () => {
  it("disassembles RISC-V split-immediate MMIO accesses with CLI and advertised MCP parity and enforces max_file_bytes", async () => {
    const dir = await createTestTempDirectory("rea-fw-mmio-");
    const fwPath = join(dir, "riscv.bin");
    const img = Buffer.alloc(64, 0);
    // LUI a5 (x15), 0x40013 (0x400137b7); LW a4 (x14), 0(a5) (0x0007a703); SW a4, 4(a5) (0x00e7a223)
    img.writeUInt32LE(0x400137b7, 0);
    img.writeUInt32LE(0x0007a703, 4);
    img.writeUInt32LE(0x00e7a223, 8);
    await writeFile(fwPath, img);

    const svdXml =
      "<device><peripherals><peripheral><name>USART1</name><baseAddress>0x40013000</baseAddress><registers><register><name>SR</name><addressOffset>0x0</addressOffset><size>32</size></register><register><name>DR</name><addressOffset>0x4</addressOffset><size>32</size></register></registers></peripheral></peripherals></device>";

    const session = createTestBinarySession(() => {
      throw new Error("No deep provider should start");
    });
    const server = createServer(
      { kind: "session", session },
      { environment: {}, logger: silentLogger },
    );
    const client = new Client(
      { name: "fw-mmio-test", version: "1" },
      { jsonSchemaValidator: createMcpSchemaValidation() },
    );
    onTestFinished(async () => {
      await client.close();
      await server.close();
      await session.close();
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const mcpRes = await client.callTool({
      name: "inspect_firmware_mmio_synthesis",
      arguments: {
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        svd_xml: svdXml,
      },
    });
    expect(mcpRes.isError).not.toBe(true);
    const mcpStructured = mcpRes.structuredContent as {
      parameters: Record<string, unknown>;
      limitations: string[];
      normalized_result: {
        load_synthesis_count: number;
        store_synthesis_count: number;
        syntheses: {
          synthesized_address: string;
          peripheral_name: string | null;
          register_name: string | null;
        }[];
      };
    };
    expect(mcpStructured.normalized_result.load_synthesis_count).toBe(1);
    expect(mcpStructured.normalized_result.store_synthesis_count).toBe(1);
    expect(mcpStructured.normalized_result.syntheses[0]).toMatchObject({
      synthesized_address: "0x40013000",
      peripheral_name: "USART1",
      register_name: "SR",
    });
    expect(mcpStructured.normalized_result.syntheses[1]).toMatchObject({
      synthesized_address: "0x40013004",
      peripheral_name: "USART1",
      register_name: "DR",
    });

    const oversizedRes = await client.callTool({
      name: "inspect_firmware_mmio_synthesis",
      arguments: {
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        max_file_bytes: 16,
      },
    });
    expect(oversizedRes.isError).toBe(true);
    const oversizedError = JSON.parse(
      (oversizedRes.content[0] as { type: "text"; text: string }).text,
    ) as { error: { details: { limit: AdjustableBudget } } };
    expect(oversizedError).toMatchObject({
      error: {
        remediation: {
          action: analysisRefusalRemediation({
            kind: "adjustable_budget",
            operation: "inspect_firmware_mmio_synthesis",
            budget: oversizedError.error.details.limit,
          }),
        },
        details: {
          limit: {
            control_kind: "parameter",
            parameter: "max_file_bytes",
            effective_value: 16,
            required_value: 64,
          },
        },
      },
    });

    let cliStdout = "";
    let cliExitCode = 0;
    await createCli({}).serve(
      [
        "inspect-firmware-mmio-synthesis",
        fwPath,
        "--architecture",
        "riscv32",
        "--base-address",
        "0x08000000",
        "--svd-xml",
        svdXml,
        "--format",
        "json",
      ],
      {
        env: {},
        exit: (code) => {
          cliExitCode = code;
        },
        stdout: (chunk) => {
          cliStdout += chunk;
        },
      },
    );
    expect(cliExitCode).toBe(0);
    const cliParsed = JSON.parse(cliStdout) as {
      limitations: string[];
      normalized_result: typeof mcpStructured.normalized_result;
    };
    expect(cliParsed.limitations).toEqual(mcpStructured.limitations);
    expect(cliParsed.normalized_result).toEqual(
      mcpStructured.normalized_result,
    );

    // MCP summary + inspect_analysis_view pagination
    const mcpSummaryRes = await client.callTool({
      name: "inspect_firmware_mmio_synthesis",
      arguments: {
        path: fwPath,
        architecture: "riscv32",
        base_address: "0x08000000",
        svd_xml: svdXml,
        detail: "summary",
      },
    });
    expect(mcpSummaryRes.isError).not.toBe(true);
    const summaryRecord = mcpSummaryRes.structuredContent as {
      normalized_result: {
        kind: string;
        parent_evidence_id: string;
        parent_operation: string;
        summary: {
          synthesis_count: number;
          peripheral_group_count: number;
        };
      };
    };
    expect(summaryRecord.normalized_result).toMatchObject({
      kind: "summary",
      parent_operation: "inspect_firmware_mmio_synthesis",
      summary: {
        synthesis_count: 2,
        peripheral_group_count: 1,
      },
    });

    const pageRes = await client.callTool({
      name: "inspect_analysis_view",
      arguments: {
        source: {
          kind: "retained-evidence",
          evidence_id: summaryRecord.normalized_result.parent_evidence_id,
        },
        view: {
          kind: "firmware-mmio-synthesis",
          collection: "peripheral_groups",
          offset: 0,
          limit: 10,
        },
      },
    });
    expect(pageRes.isError).not.toBe(true);
    expect(pageRes.structuredContent).toMatchObject({
      normalized_result: {
        kind: "firmware-mmio-synthesis",
        items: [
          {
            group_base_address: "0x40013000",
            peripheral_name: "USART1",
            access_count: 2,
            source_index: 0,
          },
        ],
      },
    });

    const bundlePath = join(dir, "mmio-bundle.json");
    let cliSummaryExit = 0;
    await createCli({}).serve(
      [
        "inspect-firmware-mmio-synthesis",
        fwPath,
        "--architecture",
        "riscv32",
        "--base-address",
        "0x08000000",
        "--detail",
        "summary",
        "--evidence_output",
        bundlePath,
        "--format",
        "json",
      ],
      {
        env: {},
        exit: (code) => {
          cliSummaryExit = code;
        },
        stdout: () => {},
      },
    );
    expect(cliSummaryExit).toBe(0);
    const savedBundle = JSON.parse(await readFile(bundlePath, "utf8")) as {
      records: { operation: string }[];
    };
    expect(
      savedBundle.records.some(
        (r) => r.operation === "inspect_firmware_mmio_synthesis",
      ),
    ).toBe(true);
  });

  it("delivers a retained summary when the complete result exceeds the selected agent result budget", async () => {
    const dir = await createTestTempDirectory("rea-fw-mmio-budget-");
    const fwPath = join(dir, "mmio.bin");
    const img = Buffer.alloc(25 * 8, 0);
    for (let i = 0; i < 25; i += 1) {
      img.writeUInt32LE(0x400137b7, i * 8);
      img.writeUInt32LE((((i * 4) << 20) | 0x0007a703) >>> 0, i * 8 + 4);
    }
    await writeFile(fwPath, img);

    const inspectWith = async (environment: NodeJS.ProcessEnv) => {
      const session = createTestBinarySession(() => {
        throw new Error("No deep provider should start");
      });
      const server = createServer(
        { kind: "session", session },
        { environment, logger: silentLogger },
      );
      const client = new Client(
        { name: "fw-mmio-budget", version: "1" },
        { jsonSchemaValidator: createMcpSchemaValidation() },
      );
      onTestFinished(async () => {
        await client.close();
        await server.close();
        await session.close();
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      return client.callTool({
        name: "inspect_firmware_mmio_synthesis",
        arguments: {
          path: fwPath,
          architecture: "riscv32",
          base_address: "0x08000000",
        },
      });
    };

    const { [AGENT_RESULT_BUDGET_ENVIRONMENT]: _seed, ...defaults } =
      process.env;
    const summarized = await inspectWith({
      ...defaults,
      [AGENT_RESULT_BUDGET_ENVIRONMENT]: String(
        MINIMUM_AGENT_RESULT_BUDGET_BYTES,
      ),
    });
    expect(summarized.isError).not.toBe(true);
    const delivery = summarized._meta?.[AGENT_BUDGET_DELIVERY_META] as {
      readonly budget_bytes: number;
      readonly complete_bytes: number;
    };
    expect(delivery.budget_bytes).toBe(MINIMUM_AGENT_RESULT_BUDGET_BYTES);
    expect(delivery.complete_bytes).toBeGreaterThan(
      MINIMUM_AGENT_RESULT_BUDGET_BYTES,
    );
    expect(delivery.complete_bytes).toBeLessThanOrEqual(
      DEFAULT_AGENT_RESULT_BUDGET_BYTES,
    );
    expect(summarized.structuredContent).toMatchObject({
      operation: "inspect_analysis_view",
      normalized_result: {
        kind: "summary",
        parent_operation: "inspect_firmware_mmio_synthesis",
      },
    });
  });
});
