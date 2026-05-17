-- CMIP intern feedback portal — allowlist table (CMIP-1.A)
--
-- Source of truth for which logged-in users are CMIP interns.
-- isIntern check in the OAuth callback reads from here; the email lookup must be
-- fast (primary-key indexed on email).
--
-- Privacy: this table only ever lives server-side. The service_role key is
-- required to read or write it; anon role has no access.

create table if not exists intern_allowlist (
  email text primary key,
  full_name text,
  added_at timestamptz not null default now(),
  cohort text not null default 'cmip-2026'
);

-- Block all access from anon/authenticated roles; only service_role can read.
alter table intern_allowlist enable row level security;
-- No policies = no access for non-service_role. Service role bypasses RLS.

comment on table intern_allowlist is
  'CMIP intern allowlist. Membership determines the isIntern JWT claim. Read only via service_role.';
