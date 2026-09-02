export interface ApprovalWindowStatus {
  expired: boolean;
  secondsRemaining: number;
  label: string;
}

export function getApprovalWindowStatus(
  expiresAt: string | undefined,
  nowMs: number,
): ApprovalWindowStatus {
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs
  ) {
    return {
      expired: true,
      secondsRemaining: 0,
      label: 'Expired',
    };
  }

  const secondsRemaining = Math.ceil((expiresAtMs - nowMs) / 1_000);
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = String(secondsRemaining % 60).padStart(2, '0');
  return {
    expired: false,
    secondsRemaining,
    label: `${minutes}:${seconds} remaining`,
  };
}
