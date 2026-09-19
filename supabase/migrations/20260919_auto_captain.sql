-- Backfill: earliest listable player on each team becomes captain if none flagged.
with ranked as (
  select
    id,
    bool_or(coalesce(is_captain, false)) over (
      partition by event_id, team_name
    ) as team_has_captain,
    row_number() over (
      partition by event_id, team_name
      order by created_at asc, id asc
    ) as rn
  from event_registrations
  where refunded is not true
    and team_name is not null
    and btrim(team_name) <> ''
    and lower(team_name) <> 'individual'
    and (
      paid = true
      or lower(coalesce(payment_method, '')) in (
        'paid',
        'cash',
        'comp',
        'complimentary',
        'stripe',
        'team',
        'roster',
        'manual',
        'checkin',
        'payment_link'
      )
    )
)
update event_registrations e
set is_captain = true
from ranked r
where e.id = r.id
  and r.rn = 1
  and r.team_has_captain = false;
