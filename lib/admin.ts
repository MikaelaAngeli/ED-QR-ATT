import { supabase } from './supabase';
import type { Role } from './profiles';

export type AdminProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  attendanceCount: number;
  eventsCreated: number;
};

export type AdminEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  created_by: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  attendanceCount: number;
};

export type AdminAttendance = {
  id: string;
  student_id: string;
  event_id: string;
  scanned_at: string;
  student_name: string | null;
  student_email: string | null;
  event_title: string;
  event_code: string;
};

export type AdminReportEvent = {
  id: string;
  title: string;
  event_code: string;
  attendanceCount: number;
  percentage: number;
};

export type AdminReports = {
  roleCounts: Record<Role, number>;
  totalProfiles: number;
  totalEvents: number;
  totalAttendance: number;
  uniqueAttendees: number;
  averageAttendancePerEvent: number;
  checkInsLast7Days: number;
  eventsWithoutAttendance: number;
  studentsWithoutAttendance: number;
  topEvents: AdminReportEvent[];
  recentActivity: AdminAttendance[];
  generatedAt: string;
};

export type AdminDashboardData = {
  profiles: AdminProfile[];
  events: AdminEvent[];
  attendance: AdminAttendance[];
  totalAttendance: number;
  reports: AdminReports;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
};

type EventRow = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  created_by: string | null;
};

type AttendanceRow = {
  id: string;
  student_id: string;
  event_id: string;
  scanned_at: string;
};

const ATTENDANCE_ROW_LIMIT = 5000;

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [profilesResult, eventsResult, attendanceResult, countResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('events')
      .select('id, event_code, title, start_time, end_time, created_at, created_by')
      .order('created_at', { ascending: false }),
    supabase
      .from('attendance')
      .select('id, student_id, event_id, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(ATTENDANCE_ROW_LIMIT),
    supabase.from('attendance').select('id', { count: 'exact', head: true }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (countResult.error) throw countResult.error;
  if (!profilesResult.data || !eventsResult.data || !attendanceResult.data) {
    throw new Error('Could not load complete administrator records.');
  }

  const profileRows = profilesResult.data as ProfileRow[];
  const eventRows = eventsResult.data as EventRow[];
  const attendanceRows = attendanceResult.data as AttendanceRow[];
  const totalAttendance = countResult.count ?? attendanceRows.length;

  const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const eventById = new Map(eventRows.map((event) => [event.id, event]));

  const attendanceByStudent = new Map<string, number>();
  const attendanceByEvent = new Map<string, number>();
  const eventsByCreator = new Map<string, number>();

  for (const row of attendanceRows) {
    attendanceByStudent.set(row.student_id, (attendanceByStudent.get(row.student_id) ?? 0) + 1);
    attendanceByEvent.set(row.event_id, (attendanceByEvent.get(row.event_id) ?? 0) + 1);
  }

  for (const event of eventRows) {
    if (event.created_by) {
      eventsByCreator.set(event.created_by, (eventsByCreator.get(event.created_by) ?? 0) + 1);
    }
  }

  const profiles: AdminProfile[] = profileRows.map((profile) => ({
    ...profile,
    attendanceCount: attendanceByStudent.get(profile.id) ?? 0,
    eventsCreated: eventsByCreator.get(profile.id) ?? 0,
  }));

  const events: AdminEvent[] = eventRows.map((event) => {
    const creator = event.created_by ? profileById.get(event.created_by) : undefined;
    return {
      ...event,
      creatorName: creator?.full_name ?? null,
      creatorEmail: creator?.email ?? null,
      attendanceCount: attendanceByEvent.get(event.id) ?? 0,
    };
  });

  const attendance: AdminAttendance[] = attendanceRows.map((row) => {
    const student = profileById.get(row.student_id);
    const event = eventById.get(row.event_id);
    return {
      id: row.id,
      student_id: row.student_id,
      event_id: row.event_id,
      scanned_at: row.scanned_at,
      student_name: student?.full_name ?? null,
      student_email: student?.email ?? null,
      event_title: event?.title ?? 'Deleted event',
      event_code: event?.event_code ?? '',
    };
  });

  const roleCounts: Record<Role, number> = { student: 0, teacher: 0, admin: 0 };
  for (const profile of profiles) {
    roleCounts[profile.role] += 1;
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const uniqueAttendees = new Set(attendanceRows.map((row) => row.student_id)).size;
  const checkInsLast7Days = attendanceRows.filter(
    (row) => new Date(row.scanned_at).getTime() >= sevenDaysAgo
  ).length;
  const eventsWithoutAttendance = events.filter((event) => event.attendanceCount === 0).length;
  const studentsWithoutAttendance = profiles.filter(
    (profile) => profile.role === 'student' && profile.attendanceCount === 0
  ).length;

  const topEvents: AdminReportEvent[] = [...events]
    .filter((event) => event.attendanceCount > 0)
    .sort((a, b) => b.attendanceCount - a.attendanceCount)
    .slice(0, 6)
    .map((event) => ({
      id: event.id,
      title: event.title,
      event_code: event.event_code,
      attendanceCount: event.attendanceCount,
      percentage: totalAttendance
        ? Math.round((event.attendanceCount / totalAttendance) * 100)
        : 0,
    }));

  return {
    profiles,
    events,
    attendance,
    totalAttendance,
    reports: {
      roleCounts,
      totalProfiles: profiles.length,
      totalEvents: events.length,
      totalAttendance,
      uniqueAttendees,
      averageAttendancePerEvent: events.length
        ? Math.round((totalAttendance / events.length) * 10) / 10
        : 0,
      checkInsLast7Days,
      eventsWithoutAttendance,
      studentsWithoutAttendance,
      topEvents,
      recentActivity: attendance.slice(0, 8),
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function updateManagedProfile(
  userId: string,
  fullName: string,
  role: Role
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim() || null, role })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The user profile was not found or could not be updated.');
}

export async function deleteManagedUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_user', {
    target_user_id: userId,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      /could not find the function/i.test(error.message)
    ) {
      throw new Error(
        'User deletion is not enabled yet. Run supabase/admin-setup.sql in Supabase, then try again.'
      );
    }
    throw error;
  }
}

export async function createManagedEvent(
  eventCode: string,
  title: string,
  startTime: string | null,
  endTime: string | null
): Promise<void> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in to create an event.');

  const start = parseOptionalDate(startTime, 'start time');
  const end = parseOptionalDate(endTime, 'end time');
  validateEventRange(start, end);

  const { error } = await supabase.from('events').insert({
    event_code: eventCode.trim(),
    title: title.trim(),
    start_time: start ? start.toISOString() : null,
    end_time: end ? end.toISOString() : null,
    created_by: user.id,
  });
  if (error) throw error;
}

export async function updateManagedEvent(
  eventId: string,
  updates: {
    title: string;
    eventCode: string;
    startTime: string | null;
    endTime: string | null;
  }
): Promise<void> {
  if (!updates.title.trim()) {
    throw new Error('Enter an event title.');
  }
  if (!updates.eventCode.trim()) {
    throw new Error('Enter an event code.');
  }

  const start = parseOptionalDate(updates.startTime, 'start time');
  const end = parseOptionalDate(updates.endTime, 'end time');
  validateEventRange(start, end);

  const { data, error } = await supabase
    .from('events')
    .update({
      title: updates.title.trim(),
      event_code: updates.eventCode.trim(),
      start_time: start ? start.toISOString() : null,
      end_time: end ? end.toISOString() : null,
    })
    .eq('id', eventId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The event was not found or could not be updated.');
}

export async function deleteManagedEvent(eventId: string): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The event was not found or could not be deleted.');
}

export async function updateManagedAttendance(
  attendanceId: string,
  scannedAt: string
): Promise<void> {
  const date = new Date(scannedAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid date and time.');
  }

  const { data, error } = await supabase
    .from('attendance')
    .update({ scanned_at: date.toISOString() })
    .eq('id', attendanceId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The attendance record was not found or could not be updated.');
}

export async function deleteManagedAttendance(attendanceId: string): Promise<void> {
  const { data, error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', attendanceId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The attendance record was not found or could not be deleted.');
}

function parseOptionalDate(value: string | null, label: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return date;
}

function validateEventRange(start: Date | null, end: Date | null) {
  if (start && end && end.getTime() <= start.getTime()) {
    throw new Error('End time must be after start time.');
  }
}
