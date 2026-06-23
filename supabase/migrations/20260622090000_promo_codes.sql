-- Pricing pivot: promo codes that grant free-forever Premium ("comp").
--
-- Two seeded codes hand free Premium to kids in partner programs (Akanksha
-- Foundation, Grandknights) — no card, redeemable even before go-live since a
-- comp sets the user's compedReason directly. Admins mint/cap/revoke from
-- /admin/promo-codes.
--
-- Tables:
--   * promo_codes       — one row per code. max_redemptions null = unlimited.
--   * promo_redemptions — one row per (code, uid). unique(code, uid) is the
--                         double-redeem guard.
-- Redemption goes through redeem_promo() (below) so the cap-check, the
-- redemption insert, and the counter increment are ONE atomic, row-locked
-- transaction — no way for concurrent requests to slip past the limit.
-- RLS enabled with no policies: only the service_role key (server-side) touches
-- these tables.

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null default 'comp_lifetime',
  max_redemptions integer,                      -- null = unlimited
  redemption_count integer not null default 0,
  revoked_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references promo_codes(code),
  uid text not null,
  redeemed_at timestamptz not null default now(),
  unique (code, uid)
);

create index if not exists promo_redemptions_uid_idx on promo_redemptions (uid);

alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;

-- Atomic redemption. Returns one of: 'ok' | 'already' | 'invalid' | 'revoked'
-- | 'limit'. Row-locks the code (FOR UPDATE) so the cap can't be raced.
create or replace function redeem_promo(p_code text, p_uid text)
returns text
language plpgsql
as $$
declare
  v_row promo_codes%rowtype;
  v_existing integer;
begin
  select * into v_row from promo_codes
    where code = upper(trim(p_code))
    for update;
  if not found then
    return 'invalid';
  end if;
  if v_row.revoked_at is not null then
    return 'revoked';
  end if;

  select count(*) into v_existing
    from promo_redemptions
    where code = v_row.code and uid = p_uid;
  if v_existing > 0 then
    return 'already';
  end if;

  if v_row.max_redemptions is not null
     and v_row.redemption_count >= v_row.max_redemptions then
    return 'limit';
  end if;

  insert into promo_redemptions (code, uid) values (v_row.code, p_uid)
    on conflict (code, uid) do nothing;
  update promo_codes
    set redemption_count = redemption_count + 1
    where code = v_row.code;
  return 'ok';
end;
$$;

-- Seed the partner-program codes (idempotent).
insert into promo_codes (code, note) values
  ('AKANKSHA2026', 'Akanksha Foundation kids'),
  ('GRANDKNIGHTS2026', 'Grandknights program kids')
on conflict (code) do nothing;

comment on table promo_codes is
  'Pricing-pivot promo codes. Redeeming grants free-forever Premium via the user doc compedReason. max_redemptions null = unlimited.';
