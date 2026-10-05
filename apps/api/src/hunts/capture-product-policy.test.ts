import { describe, expect, it } from "vitest";
import { captureBoundaryOpeningDecision } from "./capture-product-policy";

describe("TASK-110 capture product compatibility", () => {
  it("closes Capture OFF without manual fallback for forward automation-only Hunts", () => {
    expect(captureBoundaryOpeningDecision({
      forwardAutomationOnly: true,
      autoCaptureEnabled: false,
    })).toEqual({
      automaticDisposition: "disabled",
      needsCaptureRng: false,
      createLegacyManualFallback: false,
    });
  });

  it("retains historical manual fallback when Capture is OFF", () => {
    expect(captureBoundaryOpeningDecision({
      forwardAutomationOnly: false,
      autoCaptureEnabled: false,
    })).toEqual({
      automaticDisposition: "disabled",
      needsCaptureRng: false,
      createLegacyManualFallback: true,
    });
  });

  it("keeps enabled Capture on the automatic decision path in both modes", () => {
    for (const forwardAutomationOnly of [false, true]) {
      expect(captureBoundaryOpeningDecision({
        forwardAutomationOnly,
        autoCaptureEnabled: true,
      })).toEqual({
        automaticDisposition: null,
        needsCaptureRng: true,
        createLegacyManualFallback: false,
      });
    }
  });
});
