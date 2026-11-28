import { FirmwareMmioSynthesisService } from "../../application/binaryDiagnostics/FirmwareMmioSynthesisService.js";
import { FirmwareMmioSynthesisProvider } from "../../firmware/mmioSynthesis/FirmwareMmioSynthesisProvider.js";

/** Create the portable split-immediate firmware MMIO disassembly service. */
export const createFirmwareMmioSynthesisService =
  (): FirmwareMmioSynthesisService =>
    new FirmwareMmioSynthesisService(new FirmwareMmioSynthesisProvider());
