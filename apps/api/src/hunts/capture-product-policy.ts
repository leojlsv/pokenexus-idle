export interface CaptureBoundaryOpeningDecision {
  readonly automaticDisposition: "disabled" | null;
  readonly needsCaptureRng: boolean;
  readonly createLegacyManualFallback: boolean;
}

export function captureBoundaryOpeningDecision(input: {
  readonly forwardAutomationOnly: boolean;
  readonly autoCaptureEnabled: boolean;
}): CaptureBoundaryOpeningDecision {
  if (input.autoCaptureEnabled) {
    return {
      automaticDisposition: null,
      needsCaptureRng: true,
      createLegacyManualFallback: false,
    };
  }
  return {
    automaticDisposition: "disabled",
    needsCaptureRng: false,
    createLegacyManualFallback: !input.forwardAutomationOnly,
  };
}
