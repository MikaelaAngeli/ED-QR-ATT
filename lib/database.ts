import { supabase } from './supabase';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type AvailableEvent = {
  id: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
};

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

type EventPayload = {
  v: number;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

type EventRow = {
  id: string;
  title: string;
};

type AttendanceHistoryRow = {
  id: string;
  scanned_at: string;
  events:
    | { event_code: string; title: string }
    | { event_code: string; title: string }[]
    | null;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  let payload: EventPayload;
  try {
    payload = JSON.parse(rawPayload) as EventPayload;
  } catch {
    return { success: false, message: 'Invalid QR code.' };
  }

  if (payload.v !== 1 || !payload.event?.trim()) {
    return { success: false, message: 'Not an attendance QR code.' };
  }

  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start !== null && Number.isNaN(start)) {
    return { success: false, message: 'Invalid event start time.' };
  }
  if (end !== null && Number.isNaN(end)) {
    return { success: false, message: 'Invalid event end time.' };
  }
  if (start !== null && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end !== null && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }

  const eventCode = payload.event.trim();
  const title = payload.title?.trim() || eventCode;
  const { data: foundEvent, error: findError } = await supabase
    .from('events')
    .select('id, title')
    .eq('event_code', eventCode)
    .maybeSingle<EventRow>();

  if (findError) {
    return { success: false, message: 'Could not check event.' };
  }

  let event = foundEvent;
  if (!event) {
    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert({
        event_code: eventCode,
        title,
        start_time: payload.start ?? null,
        end_time: payload.end ?? null,
      })
      .select('id, title')
      .single<EventRow>();

    if (insertError || !newEvent) {
      return { success: false, message: 'Could not create event.' };
    }
    event = newEvent;
  }

  const { error: attendanceError } = await supabase.from('attendance').insert({
    student_id: studentId,
    event_id: event.id,
  });

  if (attendanceError) {
    if (attendanceError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: event.title,
      };
    }
    return { success: false, message: attendanceError.message };
  }

  return { success: true, message: 'Attendance recorded!', eventTitle: event.title };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as AttendanceHistoryRow[]).map((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;

    return {
      id: row.id,
      eventId: event?.event_code ?? '',
      eventTitle: event?.title ?? '',
      scannedAt: row.scanned_at,
    };
  });
}

export async function createEvent(event: Event): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be signed in to create an event.' };
  }

  const { error } = await supabase.from('events').upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start || null,
      end_time: event.end || null,
      created_by: user.id,
    },
    { onConflict: 'event_code' }
  );

  return { error: error?.message ?? null };
}

type AvailableEventRow = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

export async function getAvailableEvents(limit = 6): Promise<AvailableEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  const rows = data as AvailableEventRow[];
  const now = Date.now();
  const upcoming = rows.filter(
    (row) => !row.end_time || new Date(row.end_time).getTime() >= now
  );
  const source = upcoming.length > 0 ? upcoming : rows;

  return source.slice(0, limit).map((row) => ({
    id: row.id,
    eventCode: row.event_code,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

export async function updateTeacherEvent(
  eventId: string,
  event: Event
): Promise<{ error: string | null }> {
  if (!event.eventId.trim() || !event.title.trim()) {
    return { error: 'Event title and code are required.' };
  }

  const { data, error } = await supabase
    .from('events')
    .update({
      event_code: event.eventId.trim(),
      title: event.title.trim(),
      start_time: event.start || null,
      end_time: event.end || null,
    })
    .eq('id', eventId)
    .select('id')
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: 'The event was not found or you do not have permission to edit it.' };
  }

  return { error: null };
}

export async function deleteTeacherEvent(eventId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .select('id')
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: 'The event was not found or you do not have permission to delete it.' };
  }

  return { error: null };
}
