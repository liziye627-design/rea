import type {
  ExecutionOptions,
  ProviderIdentity,
} from "../AnalysisProvider.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import type {
  FirmwareMmioSynthesis,
  InspectFirmwareMmioSynthesisInput,
} from "../../domain/firmware/firmwareMmioSynthesis.js";
import type { Result } from "../../domain/result.js";

/** Port for read-only static split-immediate MMIO peripheral disassembly. */
export interface FirmwareMmioSynthesisPort {
  readonly identity: ProviderIdentity;
  close?(): Promise<void>;
  inspect(
    input: InspectFirmwareMmioSynthesisInput,
    options?: ExecutionOptions,
  ): Promise<Result<FirmwareMmioSynthesis, AnalysisError>>;
}
