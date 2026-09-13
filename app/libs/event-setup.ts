function courseLabelFromEvent(event: any): string {
  if (!event) return '';
  if (event.course) return String(event.course);
  const data = event.course_data;
  if (!data) return '';
  return (
    data.course_name ||
    data.name ||
    data.club_name ||
    data.course?.course_name ||
    data.course?.name ||
    data.course?.club_name ||
    ''
  );
}

export function onlyAdminStorageKey(eventId: string | number) {
  return `friedegg:only-admin:${eventId}`;
}

/** Same rules as manage accordion unlock. Does not write accordion state. */
export function isEventSetupComplete(opts: {
  event: any;
  roundCount: number;
  adminCount: number;
  onlyAdmin: boolean;
}): boolean {
  const event = opts.event;
  const courseLabel = courseLabelFromEvent(event);
  const rosterSize = Number(event?.roster_max);
  const hasRoster = event?.roster_max != null && rosterSize >= 1;
  const hasFieldCap =
    event?.max_players != null && Number(event.max_players) >= 1;
  const priceSet = event?.price != null && event.price !== '';
  const isFree = event?.price != null && Number(event.price) === 0;
  const basicsComplete = Boolean(
    String(event?.name || '').trim() && event?.date && courseLabel
  );
  const fieldComplete = hasRoster && hasFieldCap;
  const roundsComplete =
    opts.roundCount > 0 || Boolean(event?.date && courseLabel);
  const moneyComplete = priceSet || isFree;
  const registrationComplete = Boolean(
    event?.registration_open_date &&
      event?.registration_open_time &&
      event?.registration_close_date &&
      event?.registration_close_time
  );
  const peopleComplete = opts.onlyAdmin || opts.adminCount > 0;
  const moreComplete = Boolean(
    String(event?.contact_name || '').trim() ||
      String(event?.contact_email || '').trim()
  );
  return (
    basicsComplete &&
    fieldComplete &&
    roundsComplete &&
    moneyComplete &&
    registrationComplete &&
    peopleComplete &&
    moreComplete
  );
}
