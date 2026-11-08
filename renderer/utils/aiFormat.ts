/** Spend as dollars; amounts under a cent keep 4 decimals so small charges stay visible. */
export const formatAiCost = (cost: number) => `$${cost.toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;

/** Seconds as m:ss ("1:30"); negative or non-finite values read as 0:00. */
export const formatClock = (seconds: number) => {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
