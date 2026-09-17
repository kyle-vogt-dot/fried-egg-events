import {
  amountWithPlatformFee,
  resolvePlatformFeePercent,
} from '@/app/libs/platform-fee';

export function resolveFeeConfig(settings: any, event: any) {
  const settingsPercent =
    settings?.platform_fee_percent != null &&
    settings.platform_fee_percent !== '' &&
    Number.isFinite(Number(settings.platform_fee_percent))
      ? Number(settings.platform_fee_percent)
      : null;
  const settingsDollars =
    settings?.platform_fee != null &&
    Number.isFinite(Number(settings.platform_fee))
      ? Number(settings.platform_fee)
      : null;
  const eventDollars =
    event?.platform_fee_per_player != null &&
    Number.isFinite(Number(event.platform_fee_per_player))
      ? Number(event.platform_fee_per_player)
      : null;

  if (settingsPercent != null) {
    return {
      feeIsPercent: true,
      feePercent: resolvePlatformFeePercent(settingsPercent),
      feeDollars: 0,
    };
  }
  if (eventDollars != null) {
    return { feeIsPercent: false, feePercent: 0, feeDollars: eventDollars };
  }
  if (settingsDollars != null) {
    return { feeIsPercent: false, feePercent: 0, feeDollars: settingsDollars };
  }
  return { feeIsPercent: false, feePercent: 0, feeDollars: 0 };
}

function methodOf(r: any) {
  return String(r?.payment_method || '').toLowerCase();
}

function isCashMethod(r: any) {
  return ['cash', 'check', 'manual', 'checkin'].includes(methodOf(r));
}

function isTeamEvent(event: any) {
  return Number(event?.max_teammates) > 1;
}

function groupRegs(regs: any[], event: any) {
  if (!isTeamEvent(event)) return regs.map((r) => [r]);
  const byTeam = new Map<string, any[]>();
  const groups: any[][] = [];
  for (const r of regs) {
    const team = String(r.team_name || '').trim().toLowerCase();
    if (!team) {
      groups.push([r]);
      continue;
    }
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team)!.push(r);
  }
  return [...groups, ...Array.from(byTeam.values())];
}

function checkoutAmount(group: any[], event: any, rounds: any[]) {
  const withPaid = group.find(
    (r) => r.amount_paid != null && Number(r.amount_paid) > 0
  );
  if (withPaid) return Number(withPaid.amount_paid);
  const reg = group[0];
  if (!reg) return 0;
  const isPerRound = (event?.pricing_mode || 'event') === 'per_round';
  const selectedIds: number[] = Array.isArray(reg.selected_round_ids)
    ? reg.selected_round_ids
    : [];
  const selectedRounds = (rounds || []).filter((r) =>
    selectedIds.includes(r.id)
  );
  if (isPerRound) {
    const roundsToCharge =
      selectedRounds.length > 0 ? selectedRounds : rounds || [];
    return roundsToCharge.reduce((s, r) => s + Number(r.price || 0), 0);
  }
  let t = Number(event?.price || 0);
  for (const round of selectedRounds.filter((r) => r.pay_separately)) {
    t += Number(round.price || 0);
  }
  return t;
}

function feeOnCashAmount(
  cash: number,
  feeIsPercent: boolean,
  feePercent: number,
  feeDollars: number
) {
  if (feeIsPercent) {
    return Math.max(0, amountWithPlatformFee(cash, feePercent) - cash);
  }
  return feeDollars;
}

/** Cash spots that keep a platform fee: active cash + refunded cash. */
export function computeCashPlatformFeeDue(opts: {
  registrations: any[];
  event: any;
  rounds: any[];
  feeIsPercent: boolean;
  feePercent: number;
  feeDollars: number;
}) {
  const { registrations, event, rounds, feeIsPercent, feePercent, feeDollars } =
    opts;

  const activeCash = (registrations || []).filter(
    (r) =>
      r?.paid === true &&
      r?.refunded !== true &&
      isCashMethod(r)
  );
  const refundedCash = (registrations || []).filter(
    (r) => r?.refunded === true && isCashMethod(r)
  );

  const groups = [
    ...groupRegs(activeCash, event),
    ...groupRegs(refundedCash, event),
  ];

  let due = 0;
  for (const group of groups) {
    due += feeOnCashAmount(
      checkoutAmount(group, event, rounds),
      feeIsPercent,
      feePercent,
      feeDollars
    );
  }

  return {
    due,
    cashCheckoutCount: groups.length,
  };
}
