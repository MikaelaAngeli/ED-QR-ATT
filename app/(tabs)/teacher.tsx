import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import { getTeacherEventAttendance, type TeacherEventAttendance } from '@/lib/attendance';
import {
  createEvent,
  deleteTeacherEvent,
  updateTeacherEvent,
} from '@/lib/database';
import { useAuth } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';
import { useTheme, type AppColors } from '@/lib/theme';

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

export default function TeacherScreen() {
  const { user } = useAuth();
  const { primary, tint, colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const isAndroid = Platform.OS === 'android';

  const loadEvents = useCallback(async () => {
    if (!user) return;
    setEventsLoading(true);
    try {
      setTeacherEvents(await getTeacherEventAttendance(user.id));
    } finally {
      setEventsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    setAuthorized(false);

    const verifyRole = async () => {
      if (!user) {
        router.replace('/login');
        return;
      }

      const profile = await getProfile(user.id);
      if (!active) return;

      if (profile?.role === 'teacher') {
        setAuthorized(true);
      } else {
        router.replace('/(tabs)');
      }
    };

    verifyRole().catch(() => {
      if (active) router.replace('/(tabs)');
    });

    return () => {
      active = false;
    };
  }, [router, user]);

  useFocusEffect(
    useCallback(() => {
      if (!authorized || !user) return;
      void loadEvents();
    }, [authorized, user, loadEvents])
  );

  const resetForm = () => {
    setTitle('');
    setEventId('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setEditingEventId(null);
  };

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!editTarget) return;
    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

    if (editTarget === 'start') setStartDate(next);
    else setEndDate(next);

    if (isAndroid && editingPart === 'date') {
      setEditingPart('time');
    } else {
      setEditTarget(null);
      setEditingPart('date');
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const handleSubmitEvent = async () => {
    if (!user) {
      setMessage('You must be signed in to create an event.');
      return;
    }

    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };

    if (!event.eventId || !event.title) {
      setMessage('Event title and code are required.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('End time must be after start time.');
      return;
    }

    const { error } = editingEventId
      ? await updateTeacherEvent(editingEventId, event)
      : await createEvent(event);

    if (error) {
      setMessage(error);
      return;
    }

    setMessage(
      editingEventId
        ? 'Event updated! The new QR code is ready below.'
        : 'Event saved! Scan the QR with the Scan tab to test it.'
    );

    setPayload(
      JSON.stringify({
        v: 1,
        event: event.eventId,
        title: event.title,
        start: event.start,
        end: event.end,
      })
    );

    resetForm();
    await loadEvents();
  };

  const handleEditEvent = (event: TeacherEventAttendance) => {
    setEditingEventId(event.eventId);
    setTitle(event.title);
    setEventId(event.eventCode);
    setStartDate(event.startTime ? new Date(event.startTime) : new Date());
    setEndDate(
      event.endTime ? new Date(event.endTime) : new Date(Date.now() + 60 * 60 * 1000)
    );
    setMessage(`Editing "${event.title}". Update the details below.`);
    setPayload(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleDeleteEvent = (event: TeacherEventAttendance) => {
    Alert.alert(
      'Delete event?',
      `"${event.title}" and its ${event.attendeeCount} attendance record${
        event.attendeeCount === 1 ? '' : 's'
      } will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setMessage(null);
              const { error } = await deleteTeacherEvent(event.eventId);
              if (error) {
                setMessage(error);
                return;
              }

              if (editingEventId === event.eventId) {
                resetForm();
              }
              setPayload(null);
              setMessage('Event deleted.');
              await loadEvents();
            })();
          },
        },
      ]
    );
  };

  if (!authorized) {
    return (
      <View style={[styles.container, styles.accessCheck]}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
        <Text style={styles.title}>
          {editingEventId ? 'Edit an event' : 'Create an event'}
        </Text>
        <Text style={styles.subtitle}>
          {editingEventId
            ? 'Update the event details below, then save to refresh its QR code.'
            : 'Set the details and schedule to generate a QR code for attendance.'}
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>
          {editingEventId ? 'Editing event details' : 'Event details'}
        </Text>
        {editingEventId && (
          <Text style={styles.editingLabel}>EDITING AN EXISTING EVENT</Text>
        )}
        <Text style={styles.label}>Event title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Founders Day Assembly"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Event code</Text>
        <TextInput
          style={styles.input}
          value={eventId}
          onChangeText={setEventId}
          placeholder="e.g. EVT-2026-0002"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Starts</Text>
        <PickerField
          value={formatDateTime(startDate)}
          icon="sunny-outline"
          onPress={() => openPicker('start')}
        />

        <Text style={styles.label}>Ends</Text>
        <PickerField
          value={formatDateTime(endDate)}
          icon="moon-outline"
          onPress={() => openPicker('end')}
        />
        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              style={[styles.chip, { backgroundColor: tint }]}
              onPress={() => handleQuickEnd(option.ms)}
            >
              <Text style={[styles.chipText, { color: primary }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Quick set the end time from your start time.</Text>

        {message && <Text style={[styles.message, { color: primary }]}>{message}</Text>}

        <AppButton
          theme="primary"
          title={editingEventId ? 'Save Changes' : 'Create Event'}
          icon={editingEventId ? 'save-outline' : 'add-circle-outline'}
          onPress={handleSubmitEvent}
        />

        {editingEventId && (
          <Pressable
            style={styles.cancelEditButton}
            onPress={() => {
              resetForm();
              setPayload(null);
              setMessage(null);
            }}
            accessibilityRole="button"
          >
            <Ionicons name="close-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.cancelEditText}>Cancel editing</Text>
          </Pressable>
        )}
      </View>

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === 'start' ? startDate : endDate}
            mode={isAndroid ? editingPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            onChange={onPickerChange}
          />
        </View>
      )}

      {payload && (
        <View style={styles.resultCard}>
          <View style={[styles.resultIcon, { backgroundColor: tint }]}>
            <Ionicons name="qr-code-outline" size={22} color={colors.tertiary} />
          </View>
          <Text style={styles.resultHeading}>Your event QR is ready</Text>
          <Text style={styles.resultTitle}>
            Scan this code with the Scan tab to test attendance.
          </Text>
          <View style={styles.qrBox}>
            <QRCode
              value={payload}
              size={240}
              quietZone={16}
              color="#000000"
              backgroundColor="#FFFFFF"
              ecl="M"
            />
          </View>
          <Text style={styles.payloadText}>{payload}</Text>
        </View>
      )}

      <View style={styles.eventsHeader}>
        <Text style={styles.eventsHeading}>YOUR EVENTS</Text>
        <View style={styles.eventsRule} />
      </View>
      <Text style={styles.eventsSubtitle}>
        Manage the events you created and monitor their attendance totals.
      </Text>

      {eventsLoading ? (
        <View style={styles.eventsLoading}>
          <ActivityIndicator color={primary} />
        </View>
      ) : teacherEvents.length === 0 ? (
        <View style={styles.eventsEmpty}>
          <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
          <Text style={styles.eventsEmptyTitle}>No events yet</Text>
          <Text style={styles.eventsEmptyText}>
            Create your first event above and its QR code will appear here.
          </Text>
        </View>
      ) : (
        teacherEvents.map((event) => (
          <View key={event.eventId} style={styles.eventCard}>
            <View style={styles.eventCardHeader}>
              <View style={styles.eventCardCopy}>
                <Text style={styles.eventCardTitle} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={styles.eventCardCode}>{event.eventCode}</Text>
              </View>
              <View style={styles.eventCountBadge}>
                <Text style={styles.eventCountText}>{event.attendeeCount}</Text>
              </View>
            </View>

            <View style={styles.eventDateRow}>
              <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.eventDateText}>
                {formatSchedule(event.startTime, event.endTime)}
              </Text>
            </View>

            <View style={styles.eventActions}>
              <Pressable
                style={styles.eventEditButton}
                onPress={() => handleEditEvent(event)}
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
                <Text style={styles.eventEditText}>Edit</Text>
              </Pressable>
              <Pressable
                style={styles.eventDeleteButton}
                onPress={() => handleDeleteEvent(event)}
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.eventDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  const { primary, tint, colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerField,
        pressed && { backgroundColor: tint },
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function formatSchedule(startTime: string | null, endTime: string | null) {
  if (!startTime && !endTime) return 'Schedule not set';
  if (startTime && endTime) {
    return `${formatEventDate(startTime)} – ${formatEventDate(endTime)}`;
  }
  return startTime
    ? `Starts ${formatEventDate(startTime)}`
    : `Ends ${formatEventDate(endTime!)}`;
}

function formatEventDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : formatDateTime(date);
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    accessCheck: { justifyContent: 'center', alignItems: 'center' },
    content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },
    header: { marginBottom: 18 },
    eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },
    title: { fontSize: 27, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    formCard: { backgroundColor: colors.card, borderLeftColor: colors.accent, borderLeftWidth: 3, padding: 18, marginBottom: 16 },
    cardTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 6 },
    label: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 14, letterSpacing: 0.7 },
    input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 3, paddingHorizontal: 13, paddingVertical: 13, fontSize: 15, color: colors.textPrimary },
    pickerField: { backgroundColor: colors.background, borderRadius: 3, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center' },
    pickerValue: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.textPrimary, marginHorizontal: 10 },
    chipRow: { flexDirection: 'row', marginTop: 8 },
    chip: { borderRadius: 3, paddingHorizontal: 11, paddingVertical: 8, marginRight: 8 },
    chipText: { fontSize: 12, fontWeight: '700' },
    hint: { fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 17 },
    pickerContainer: { marginTop: 12, alignItems: 'center' },
    message: { fontSize: 14, textAlign: 'center', marginTop: 14, marginBottom: 4 },
    resultCard: { backgroundColor: colors.card, borderTopColor: colors.accent, borderTopWidth: 3, padding: 20, marginTop: 20, alignItems: 'center' },
    resultIcon: { alignItems: 'center', borderRadius: 3, height: 46, justifyContent: 'center', marginBottom: 12, width: 46 },
    resultHeading: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 5 },
    resultTitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 15 },
    qrBox: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 3, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
    payloadText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 16 },
    editingLabel: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.9, marginTop: 4 },
    cancelEditButton: { alignItems: 'center', flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 10, paddingVertical: 8 },
    cancelEditText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    eventsHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 4, marginTop: 26 },
    eventsHeading: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    eventsRule: { backgroundColor: colors.border, flex: 1, height: 1 },
    eventsSubtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
    eventsLoading: { alignItems: 'center', padding: 22 },
    eventsEmpty: { alignItems: 'center', backgroundColor: colors.card, borderLeftColor: colors.accent, borderLeftWidth: 3, padding: 20 },
    eventsEmptyTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 4, marginTop: 8 },
    eventsEmptyText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    eventCard: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, marginBottom: 12, padding: 14 },
    eventCardHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 9 },
    eventCardCopy: { flex: 1, marginRight: 8, minWidth: 0 },
    eventCardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
    eventCardCode: { color: colors.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, marginTop: 3 },
    eventCountBadge: { alignItems: 'center', backgroundColor: colors.accentSurface, minWidth: 32, paddingHorizontal: 8, paddingVertical: 5 },
    eventCountText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
    eventDateRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 2 },
    eventDateText: { color: colors.textSecondary, flex: 1, fontSize: 11, lineHeight: 16 },
    eventActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    eventEditButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 3, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 38, paddingHorizontal: 10 },
    eventEditText: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
    eventDeleteButton: { alignItems: 'center', borderColor: colors.danger, borderRadius: 3, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 38, paddingHorizontal: 12 },
    eventDeleteText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  });
}
