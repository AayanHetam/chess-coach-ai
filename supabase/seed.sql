-- CMIP intern feedback portal — local-dev cohort seed.
--
-- Real intern emails live in the production table only, added via direct SQL
-- or (later) the /admin/intern-data/allowlist UI in CMIP-1.D follow-up.

insert into intern_allowlist (email, cohort) values
  ('intern-one@example.com',   'cmip-2026'),
  ('intern-two@example.com',   'cmip-2026'),
  ('intern-three@example.com', 'cmip-2026')
on conflict (email) do nothing;
