create table if not exists platform_fee_payments (
  id uuid primary key default gen_random_uuid(),
  event_id bigint references tournaments(id) on delete cascade,
  amount numeric not null,
  currency text default 'usd',
  source text default 'connect_debit',
  stripe_transfer_id text,
  status text default 'paid',
  created_at timestamptz default now()
);

create index if not exists platform_fee_payments_event_id_idx
  on platform_fee_payments (event_id);

alter table platform_fee_payments enable row level security;

drop policy if exists "authenticated read platform_fee_payments"
  on platform_fee_payments;
create policy "authenticated read platform_fee_payments"
  on platform_fee_payments
  for select
  to authenticated
  using (true);
