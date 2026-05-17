-- CMIP intern feedback portal — initial cohort seed.
--
-- Resolved 2026-05-17. Add more interns via direct SQL or (later) the
-- /admin/intern-data/allowlist UI in CMIP-1.D follow-up.

insert into intern_allowlist (email, cohort) values
  ('jadhavpushkar196@gmail.com',  'cmip-2026'),
  ('akshajshriv10@gmail.com',     'cmip-2026'),
  ('s-annapureddyp@bsd405.org',   'cmip-2026')
on conflict (email) do nothing;
