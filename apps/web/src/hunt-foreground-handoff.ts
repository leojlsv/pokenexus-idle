let activeForegroundHandoffHuntId: string | null = null;

export function rememberActiveForegroundHandoff(huntId: string): void {
  activeForegroundHandoffHuntId = huntId;
}

export function consumeActiveForegroundHandoff(): string | null {
  const huntId = activeForegroundHandoffHuntId;
  activeForegroundHandoffHuntId = null;
  return huntId;
}
