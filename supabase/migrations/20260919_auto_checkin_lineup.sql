alter table tournaments
  add column if not exists auto_checkin_lineup boolean default true;
