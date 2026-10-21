-- ============================================================================
-- BAGATA QR ATTENDANCE — ADMINISTRATOR SETUP
--
-- Run this file in: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- It is safe to run more than once. It:
--   1. Enables the "admin" role on public.profiles
--   2. Installs the public.is_admin() authorization helper
--   3. Re-creates every administrator RLS policy
--   4. Adds teacher event-management permissions
--   5. Enables Student / Teacher / Admin role selection at sign-up
--   6. Protects the final administrator from demotion
--   7. Installs the admin_delete_user() function used by the Admin screen
--   8. Promotes an existing account to administrator
--
-- IMPORTANT: Run supabase/schema.sql first if you have not already done so.
--
-- IMPORTANT: In the SQL editor, set the Role dropdown next to "Run" to
-- "postgres" (or "Database owner"). If it is set to "anon" or "authenticated",
-- CREATE TABLE fails with: 42501 permission denied for schema public.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Make sure the admin role is allowed
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));


-- ----------------------------------------------------------------------------
-- 2. Private setting for administrator self-registration
--    Change the value below to your own administrator access code.
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('admin_signup_code', 'BAGATA-ADMIN-2026')
on conflict (key) do nothing;


-- ----------------------------------------------------------------------------
-- 3. Authorization helper used by all administrator policies
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.verify_admin_signup_code(signup_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_settings
    where key = 'admin_signup_code'
      and value = signup_code
  );
$$;

revoke all on function public.verify_admin_signup_code(text) from public;
grant execute on function public.verify_admin_signup_code(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. Row Level Security for administrator access
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- Profiles -------------------------------------------------------------------
drop policy if exists "Administrators can view all profiles" on public.profiles;
create policy "Administrators can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Administrators can update profiles" on public.profiles;
create policy "Administrators can update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Events ---------------------------------------------------------------------
drop policy if exists "Administrators can manage events" on public.events;
create policy "Administrators can manage events"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Teachers can delete their own events" on public.events;
create policy "Teachers can delete their own events"
  on public.events for delete
  to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'teacher'
    )
  );

-- Attendance -----------------------------------------------------------------
drop policy if exists "Administrators can view all attendance" on public.attendance;
create policy "Administrators can view all attendance"
  on public.attendance for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Administrators can insert attendance" on public.attendance;
create policy "Administrators can insert attendance"
  on public.attendance for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Administrators can update attendance" on public.attendance;
create policy "Administrators can update attendance"
  on public.attendance for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Administrators can delete attendance" on public.attendance;
create policy "Administrators can delete attendance"
  on public.attendance for delete
  to authenticated
  using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 5. Role-based sign-up
--
--    The app sends the chosen role in the sign-up metadata:
--      student / teacher / admin
--    Administrator sign-up additionally requires the private access code above.
--    The trigger is Security Definer so it can create the profile even though
--    public sign-ups cannot insert admin/teacher profiles directly.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  supplied_code  text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'student');

  if requested_role not in ('student', 'teacher', 'admin') then
    requested_role := 'student';
  end if;

  if requested_role = 'admin' then
    supplied_code := new.raw_user_meta_data ->> 'admin_code';

    if supplied_code is null or not exists (
      select 1
      from public.app_settings
      where key = 'admin_signup_code'
        and value = supplied_code
    ) then
      raise exception 'Invalid administrator access code';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    requested_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, profiles.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 6. Role-change guard
--
--    Users still cannot change their own role. In addition, the final
--    administrator cannot be demoted from the app. (The SQL editor can still
--    perform a manual recovery because auth.uid() is null there.)
-- ----------------------------------------------------------------------------
create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception 'Profile role cannot be changed by the user';
  end if;

  if auth.uid() is not null
     and old.role = 'admin'
     and new.role is distinct from 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last administrator cannot be demoted';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_role_change on public.profiles;

create trigger prevent_profile_role_change
  before update of role on public.profiles
  for each row
  execute function public.prevent_profile_role_change();


-- ----------------------------------------------------------------------------
-- 7. Delete-user function used by the Admin screen
--
--    Deleting from auth.users cascades to public.profiles and public.attendance.
--    Events created by the deleted user are kept (created_by becomes null).
--    Self-deletion and deleting the final administrator are blocked.
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  admin_total integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete users.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own administrator account.';
  end if;

  select role
    into target_role
    from public.profiles
   where id = target_user_id;

  if target_role is null then
    raise exception 'User not found.';
  end if;

  if target_role = 'admin' then
    select count(*)
      into admin_total
      from public.profiles
     where role = 'admin';

    if admin_total <= 1 then
      raise exception 'The last administrator cannot be deleted.';
    end if;
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 8. PROMOTE YOUR ADMINISTRATOR
--
--    Replace admin@school.edu with the email of an account that already
--    exists in Authentication -> Users (register it in the app first).
-- ----------------------------------------------------------------------------
update public.profiles
   set role = 'admin',
       updated_at = now()
 where lower(email) = lower('admin@school.edu');


-- ----------------------------------------------------------------------------
-- 9. VERIFY
--    The account should appear below with role = admin.
--    Afterwards: sign out of the app and sign in again to see the Admin tab.
-- ----------------------------------------------------------------------------
select id, email, full_name, role, created_at
  from public.profiles
 where role = 'admin'
 order by created_at;

notify pgrst, 'reload schema';
