import { supabase } from './supabase';

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    scannedAt: string;
  }[];
};

type EventRow = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

type AttendanceRow = {
  event_id: string;
  student_id: string;
  scanned_at: string;
  profiles: { full_name: string | null }[] | null;
};

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) {
    return [];
  }

  const eventRows = events as EventRow[];
  const eventIds = eventRows.map((event) => event.id);
  if (eventIds.length === 0) {
    return [];
  }

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('event_id, student_id, scanned_at, profiles ( full_name )')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attendanceError || !attendance) {
    return eventRows.map((event) => ({
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: 0,
      attendees: [],
    }));
  }

  const rows = attendance as AttendanceRow[];
  return eventRows.map((event) => {
    const eventAttendance = rows.filter((row) => row.event_id === event.id);
    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: eventAttendance.length,
      attendees: eventAttendance.map((row) => ({
        studentId: row.student_id,
        studentName: row.profiles?.[0]?.full_name ?? null,
        scannedAt: row.scanned_at,
      })),
    };
  });
}
