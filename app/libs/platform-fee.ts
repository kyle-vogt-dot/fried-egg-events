export const DEFAULT_PLATFORM_FEE_PERCENT = 5;

export function resolvePlatformFeePercent(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : DEFAULT_PLATFORM_FEE_PERCENT;
}

export function formatPlatformFeePercent(percent: number): string {
  const n = Number(percent);
  if (!Number.isFinite(n)) return String(DEFAULT_PLATFORM_FEE_PERCENT);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/** Checkout amount = subtotal * (1 + percent/100), rounded to cents. */
export function amountWithPlatformFee(
  subtotal: number,
  percent: number
): number {
  const sub = Number(subtotal);
  if (!Number.isFinite(sub) || sub <= 0) return 0;
  const pct = Number(percent);
  const rate = Number.isFinite(pct) ? pct : DEFAULT_PLATFORM_FEE_PERCENT;
  const cents = Math.round(sub * 100);
  return Math.round(cents * (1 + rate / 100)) / 100;
}

/** Platform cut in dollars from a charged amount that already includes the percent. */
export function platformFeeFromChargedAmount(
  chargedDollars: number,
  percent: number
): number {
  const chargedCents = Math.round(Number(chargedDollars) * 100);
  if (!Number.isFinite(chargedCents) || chargedCents <= 0) return 0;
  const pct = resolvePlatformFeePercent(percent);
  if (pct <= 0) return 0;
  const subtotalCents = Math.round(chargedCents / (1 + pct / 100));
  return Math.max(0, chargedCents - subtotalCents) / 100;
}

