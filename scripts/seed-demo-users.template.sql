-- Template for seeding demo auth users (Phase 1).
-- SECURITY: never commit real emails/passwords. Substitute :EMAIL and
-- :PASSWORD from environment (.env.local, gitignored) at execution time.
-- Executed against project uxmxkdjschbekkbnweby via the Supabase MCP.
-- Public signup is not exposed by the application; these seeded accounts are
-- the only way into the demo. Idempotent: skips when the email already exists.

with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    :EMAIL,
    extensions.crypt(:PASSWORD, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  where not exists (select 1 from auth.users where email = :EMAIL)
  returning id, email
)
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
from new_user;
