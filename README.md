# SETUP COMMANDS — QR Attendance App

> **Target:** First-year students | **Expo SDK:** 54 | **Expo Go:** 54.0.8

---

## PREREQUISITES

| Tool | Download | Verify |
|---|---|---|
| Node.js (LTS) | https://nodejs.org/en | `node --version` |
| VS Code | https://code.visualstudio.com | (open it) |
| Expo Go 54.0.8 | Play Store → "Expo Go" | (version in app settings) |

---

## STEP 1 — Create the App

```powershell
cd D:\QR-ATT
npx create-expo-app@latest qr-att

# When prompted, select "SDK 54"
# Wait for npm install (~2 min)
```

---

## STEP 2 — Install Matching Versions

The default install may need these fixed versions that match Expo Go 54.0.8:

```powershell
npm install expo@~54.0.35 react@19.1.0 react-native@0.81.5 expo-router@~6.0.24 @expo/vector-icons@^15.0.3 expo-linking@~8.0.12 expo-constants@~18.0.13 expo-font@~14.0.12 expo-status-bar@~3.0.9 expo-splash-screen@~31.0.13 react-native-screens@~4.16.0 react-native-safe-area-context@~5.6.0 react-native-gesture-handler@~2.28.0 react-native-reanimated@~4.1.1 react-dom@19.1.0 react-native-web@~0.21.0 @types/react@~19.1.0 typescript@~5.9.2 --legacy-peer-deps
```

---

## STEP 3 — Start

```powershell
npx expo start
```

Scan QR code with Expo Go. Or press `W` for web.

---

## TROUBLESHOOTING

| Problem | Solution |
|---|---|
| npm install fails | Use `npm install --legacy-peer-deps` |
| App crashes in Expo Go | Make sure all versions match STEP 2 exactly |
| QR won't scan | Phone + computer on same WiFi |
| White screen | Wait 10s, or shake → Reload |
| TypeScript errors | Run `npx tsc --noEmit` |

---

## AUTHENTICATION AND ROLE SIGN-UP

The app supports email/password registration, sign-in, sign-out, and persisted Supabase
sessions. The registration screen lets a new user choose one of three roles:

- **Student** — scan event QR codes, record attendance, view available events, and
  review personal attendance history.
- **Teacher** — create and manage events, generate event QR codes, monitor attendance,
  and view per-event attendance summaries.
- **Admin** — manage users, events, and attendance records, plus open system reports.

Student and Teacher sign-ups are open. Administrator sign-up is protected by a private
access code stored in Supabase.

### Enable role-based sign-up in Supabase

Run `supabase/schema.sql` once (skip if already applied), then run
`supabase/admin-setup.sql` in the Supabase SQL editor. It is safe to run more than
once and now installs:

- the `app_settings` table and the administrator access code
- `verify_admin_signup_code()` used by the registration screen
- the sign-up trigger that applies the selected `student` / `teacher` / `admin` role
- teacher delete permission for their own events
- administrator RLS policies and `admin_delete_user()`

The default administrator access code is **`BAGATA-ADMIN-2026`**. Change it before
sharing the app:

```sql
update public.app_settings
   set value = 'YOUR-PRIVATE-ADMIN-CODE',
       updated_at = now()
 where key = 'admin_signup_code';
```

You can also promote an existing account manually by replacing the email here:

```sql
update public.profiles
   set role = 'admin',
       updated_at = now()
 where lower(email) = lower('admin@school.edu');
```

### Administrator capabilities

- **Users** — search/filter accounts, edit full names and roles, and delete accounts
  (with self-deletion and last-administrator protection).
- **Events** — create events with start/end schedules, edit event details, and delete
  events and their attendance records.
- **Attendance** — view overall attendance, search by student or event, correct
  check-in timestamps, and delete invalid records.
- **Reports** — live totals for accounts, events, unique attendees, check-ins,
  per-event breakdowns, recent activity, and system records.

Database row-level security enforces role access; hiding a tab is only a navigation
convenience, not the authorization boundary.

### Troubleshooting: `42501 permission denied for schema public`

The Supabase SQL editor has a **Role** dropdown next to the green **Run** button.
Setup SQL must run as **`postgres`** (or **Database owner**), not `anon` or
`authenticated`. If the Role dropdown is set to `anon`/`authenticated`, creating
`public.app_settings` fails with `42501 permission denied for schema public`.

1. Set the Role dropdown to **postgres**.
2. Rerun the SQL from the beginning.
3. To confirm, run `select current_user;` — it should return `postgres`.

If it already returns `postgres` and the error continues, check schema permissions:

```sql
select current_user,
       has_schema_privilege(current_user, 'public', 'CREATE') as can_create;
```

If `can_create` is false:

```sql
grant usage, create on schema public to postgres;
```

Then rerun the setup SQL.


