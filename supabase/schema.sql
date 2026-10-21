-- QR Attendance database schema
-- Safe to run more than once in the Supabase SQL editor.
--
-- IMPORTANT: In the SQL editor, set the Role dropdown next to "Run" to
-- "postgres" (or "Database owner"). If it is set to "anon" or "authenticated",
-- CREATE TABLE fails with: 42501 permission denied for schema public.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  theme_color text,
  theme_mode text not null default 'light'
             check (theme_mode in ('light', 'dark')),
  theme_background text,
  role       text not null default 'student'
             check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists theme_color text;

alter table public.profiles
  add column if not exists theme_mode text not null default 'light'
  check (theme_mode in ('light', 'dark'));

alter table public.profiles
  add column if not exists theme_background text;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  event_code  text not null unique,
  title       text not null,
  start_time  timestamptz,
  end_time    timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Private settings used by Security Definer functions.
-- RLS is enabled with no policies, so clients cannot read this table directly.
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('admin_signup_code', 'BAGATA-ADMIN-2026')
on conflict (key) do nothing;

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  scanned_at  timestamptz not null default now(),
  unique (student_id, event_id)
);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- Remove policies first so this script can be safely rerun.
drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
drop policy if exists "Administrators can view all profiles" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Administrators can update profiles" on public.profiles;
drop policy if exists "Users cannot change their own role" on public.profiles;
drop policy if exists "Events are readable by any authenticated user" on public.events;
drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Users can update their own events" on public.events;
drop policy if exists "Teachers can delete their own events" on public.events;
drop policy if exists "Administrators can delete events" on public.events;
drop policy if exists "Students can view their own attendance" on public.attendance;
drop policy if exists "Students can insert their own attendance" on public.attendance;
drop policy if exists "Teachers can view attendance for their events" on public.attendance;
drop policy if exists "Administrators can view all attendance" on public.attendance;
drop policy if exists "Administrators can insert attendance" on public.attendance;
drop policy if exists "Administrators can update attendance" on public.attendance;
drop policy if exists "Administrators can delete attendance" on public.attendance;

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

create policy "Profiles are viewable by owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Administrators can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'student');

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Administrators can update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception 'Profile role cannot be changed by the user';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_role_change on public.profiles;

create trigger prevent_profile_role_change
  before update of role on public.profiles
  for each row
  execute function public.prevent_profile_role_change();

create policy "Events are readable by any authenticated user"
  on public.events for select
  to authenticated
  using (true);

create policy "Users can insert events"
  on public.events for insert
  to authenticated
  with check (
    public.is_admin()
    or created_by is null
    or (
      created_by = auth.uid()
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'teacher'
      )
    )
  );

create policy "Users can update their own events"
  on public.events for update
  to authenticated
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'teacher'
      )
    )
  )
  with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'teacher'
      )
    )
  );

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

create policy "Administrators can delete events"
  on public.events for delete
  to authenticated
  using (public.is_admin());

create policy "Students can view their own attendance"
  on public.attendance for select
  to authenticated
  using (auth.uid() = student_id);

create policy "Students can insert their own attendance"
  on public.attendance for insert
  to authenticated
  with check (auth.uid() = student_id);

create policy "Teachers can view attendance for their events"
  on public.attendance for select
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

create policy "Administrators can view all attendance"
  on public.attendance for select
  to authenticated
  using (public.is_admin());

create policy "Administrators can insert attendance"
  on public.attendance for insert
  to authenticated
  with check (public.is_admin());

create policy "Administrators can update attendance"
  on public.attendance for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Administrators can delete attendance"
  on public.attendance for delete
  to authenticated
  using (public.is_admin());

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

notify pgrst, 'reload schema';
