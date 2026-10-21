import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createManagedEvent,
  deleteManagedAttendance,
  deleteManagedEvent,
  deleteManagedUser,
  getAdminDashboardData,
  updateManagedAttendance,
  updateManagedEvent,
  updateManagedProfile,
  type AdminAttendance,
  type AdminDashboardData,
  type AdminEvent,
  type AdminProfile,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { getProfile, type Profile, type Role } from '@/lib/profiles';
import { useTheme, type AppColors } from '@/lib/theme';

type Section = 'users' | 'events' | 'attendance' | 'reports';
type RoleFilter = 'all' | Role;
type PickerTarget =
  | { kind: 'new-event'; field: 'start' | 'end' }
  | { kind: 'event'; eventId: string; field: 'start' | 'end' }
  | { kind: 'attendance'; attendanceId: string };

type EventDraft = {
  title: string;
  eventCode: string;
  start: string;
  end: string;
};

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-done-outline' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-outline' },
];

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'student', label: 'Students' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'admin', label: 'Admins' },
];

const ROLES: Role[] = ['student', 'teacher', 'admin'];

export default function AdminScreen() {
  const { user } = useAuth();
  const { primary, colors } = useTheme();
  const styles = createStyles(colors, primary);
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [section, setSection] = useState<Section>('users');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const [profileDrafts, setProfileDrafts] = useState<Record<string, { name: string; role: Role }>>({});
  const [eventDrafts, setEventDrafts] = useState<Record<string, EventDraft>>({});
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, string>>({});
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [attendanceLimit, setAttendanceLimit] = useState(50);

  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCode, setNewEventCode] = useState('');
  const [newEventStart, setNewEventStart] = useState(() => defaultStart().toISOString());
  const [newEventEnd, setNewEventEnd] = useState(() => defaultEnd().toISOString());

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerPart, setPickerPart] = useState<'date' | 'time'>('date');

  const isAndroid = Platform.OS === 'android';

  const refresh = useCallback(async (silent = false): Promise<boolean> => {
    if (!silent) setLoading(true);
    try {
      const next = await getAdminDashboardData();
      setData(next);
      setSyncedAt(new Date().toISOString());
      setError(null);
      return true;
    } catch (loadError) {
      setError(errorMessage(loadError));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setAuthorized(false);
      setChecking(true);
      setLoading(true);
      setError(null);

      const verifyAndLoad = async () => {
        if (!user) {
          router.replace('/login');
          return;
        }

        const profile = await getProfile(user.id);
        if (!active) return;
        if (profile?.role !== 'admin') {
          router.replace('/(tabs)');
          return;
        }

        setAdminProfile(profile);
        setAuthorized(true);
        setChecking(false);

        try {
          const next = await getAdminDashboardData();
          if (active) {
            setData(next);
            setSyncedAt(new Date().toISOString());
            setError(null);
          }
        } catch (loadError) {
          if (active) setError(errorMessage(loadError));
        } finally {
          if (active) setLoading(false);
        }
      };

      void verifyAndLoad().catch((verifyError) => {
        if (active) {
          setError(errorMessage(verifyError));
          setChecking(false);
          setLoading(false);
        }
      });

      return () => {
        active = false;
      };
    }, [router, user, reloadToken])
  );

  const runAction = async (
    id: string,
    action: () => Promise<void>,
    successMessage: string
  ) => {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      await action();
      const ok = await refresh(true);
      if (ok) setMessage(successMessage);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  };

  const filteredProfiles = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.profiles ?? []).filter((profile) => {
      const matchesRole = roleFilter === 'all' || profile.role === roleFilter;
      const haystack = `${profile.full_name ?? ''} ${profile.email}`.toLowerCase();
      return matchesRole && (!term || haystack.includes(term));
    });
  }, [data, query, roleFilter]);

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.events ?? []).filter((event) => {
      if (!term) return true;
      return `${event.title} ${event.event_code} ${event.creatorName ?? ''}`
        .toLowerCase()
        .includes(term);
    });
  }, [data, query]);

  const filteredAttendance = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.attendance ?? []).filter((record) => {
      if (!term) return true;
      return `${record.student_name ?? ''} ${record.student_email ?? ''} ${record.student_id} ${record.event_title} ${record.event_code}`
        .toLowerCase()
        .includes(term);
    });
  }, [data, query]);

  const visibleAttendance = filteredAttendance.slice(0, attendanceLimit);

  function resolvePickerDate(target: PickerTarget): Date {
    let raw: string | null | undefined;

    if (target.kind === 'new-event') {
      raw = target.field === 'start' ? newEventStart : newEventEnd;
    } else if (target.kind === 'event') {
      const source = data?.events.find((event) => event.id === target.eventId);
      if (!source) return new Date();
      const draft = eventDrafts[source.id] ?? toEventDraft(source);
      raw = target.field === 'start' ? draft.start : draft.end;
    } else {
      raw = attendanceDrafts[target.attendanceId];
    }

    if (!raw) return new Date();
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  const closePicker = () => {
    setPickerTarget(null);
    setPickerPart('date');
  };

  const openPicker = (target: PickerTarget) => {
    setMessage(null);
    setPickerTarget(target);
    setPickerPart('date');
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!pickerTarget) return;
    if (event.type === 'dismissed' || !selected) {
      closePicker();
      return;
    }

    const next = mergeDate(resolvePickerDate(pickerTarget), selected);

    if (pickerTarget.kind === 'new-event') {
      if (pickerTarget.field === 'start') setNewEventStart(next.toISOString());
      else setNewEventEnd(next.toISOString());
    } else if (pickerTarget.kind === 'event') {
      const source = data?.events.find((item) => item.id === pickerTarget.eventId);
      if (!source) {
        closePicker();
        return;
      }
      const draft = eventDrafts[source.id] ?? toEventDraft(source);
      setEventDrafts((current) => ({
        ...current,
        [source.id]: { ...draft, [pickerTarget.field]: next.toISOString() },
      }));
    } else {
      setAttendanceDrafts((current) => ({
        ...current,
        [pickerTarget.attendanceId]: next.toISOString(),
      }));
    }

    if (isAndroid && pickerPart === 'date') {
      setPickerPart('time');
    } else {
      closePicker();
    }
  };

  const handleCreateEvent = () => {
    if (!newEventTitle.trim() || !newEventCode.trim()) {
      setError('Event title and code are required.');
      return;
    }
    if (new Date(newEventEnd).getTime() <= new Date(newEventStart).getTime()) {
      setError('End time must be after start time.');
      return;
    }

    void runAction(
      'create-event',
      async () => {
        await createManagedEvent(newEventCode, newEventTitle, newEventStart, newEventEnd);
        setNewEventTitle('');
        setNewEventCode('');
        setNewEventStart(defaultStart().toISOString());
        setNewEventEnd(defaultEnd().toISOString());
      },
      'Event created.'
    );
  };

  const pickerValue = pickerTarget ? resolvePickerDate(pickerTarget) : new Date();
  const adminName = adminProfile?.full_name?.trim() || user?.email || 'Administrator';
  const adminEmail = adminProfile?.email ?? user?.email ?? '';
  const reports = data?.reports;

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Ionicons name="shield-outline" size={34} color={colors.textSecondary} />
        <Text style={[styles.accessTitle, { color: colors.textPrimary }]}>
          Administrator access
        </Text>
        <Text style={styles.accessText}>
          {error ?? 'Verifying your administrator permissions...'}
        </Text>
        <Pressable
          style={[styles.accessButton, { backgroundColor: primary }]}
          onPress={() => {
            setError(null);
            setReloadToken((current) => current + 1);
          }}
          accessibilityRole="button"
        >
          <Ionicons name="refresh-outline" size={16} color={colors.textOnPrimary} />
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading && data !== null}
          onRefresh={() => {
            void refresh(true);
          }}
          tintColor={primary}
          colors={[primary]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SYSTEM MANAGEMENT</Text>
        <Text style={styles.title}>Administrator</Text>
        <Text style={styles.subtitle}>
          Manage accounts, events, attendance records, and system reports.
        </Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={23} color={colors.textOnPrimary} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>SIGNED IN AS ADMINISTRATOR</Text>
            <Text style={styles.heroName} numberOfLines={1}>{adminName}</Text>
            {!!adminEmail && <Text style={styles.heroEmail} numberOfLines={1}>{adminEmail}</Text>}
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>ADMIN</Text>
          </View>
        </View>

        <View style={styles.heroStats}>
          <HeroStat
            label="USERS"
            value={data?.profiles.length ?? 0}
            styles={styles}
          />
          <View style={styles.heroStatDivider} />
          <HeroStat label="EVENTS" value={data?.events.length ?? 0} styles={styles} />
          <View style={styles.heroStatDivider} />
          <HeroStat
            label="CHECK-INS"
            value={data?.totalAttendance ?? 0}
            styles={styles}
          />
        </View>

        <View style={styles.heroFooter}>
          <Ionicons name="cloud-done-outline" size={14} color={colors.textOnPrimary} />
          <Text style={styles.heroFooterText}>
            {syncedAt ? `Supabase synced ${formatDateTime(syncedAt)}` : 'Connected to Supabase'}
          </Text>
          <View style={styles.goldMark} />
        </View>
      </View>

      <View style={styles.sections}>
        {SECTIONS.map((item) => {
          const active = section === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                setSection(item.key);
                setQuery('');
                setMessage(null);
              }}
              style={styles.sectionButton}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? primary : colors.textSecondary}
              />
              <Text style={[styles.sectionLabel, active && styles.sectionLabelActive]}>
                {item.label}
              </Text>
              <View
                style={[
                  styles.sectionIndicator,
                  active && styles.sectionIndicatorActive,
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {error && (
        <View style={[styles.banner, styles.errorBanner]}>
          <Text accessibilityRole="alert" style={[styles.bannerText, styles.errorText]}>
            {error}
          </Text>
        </View>
      )}
      {message && (
        <View style={[styles.banner, styles.successBanner]}>
          <Text style={[styles.bannerText, styles.successText]}>{message}</Text>
        </View>
      )}

      {loading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={primary} />
          <Text style={styles.loadingText}>Loading system records...</Text>
        </View>
      ) : section === 'users' ? (
        <View>
          <SectionHeading
            title="Manage users"
            subtitle="Update account names and assign student, teacher, or administrator access."
            styles={styles}
          />
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email"
          />
          <View style={styles.filterRow}>
            {ROLE_FILTERS.map((filter) => {
              const active = roleFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setRoleFilter(filter.key)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {filteredProfiles.length === 0 ? (
            <EmptyCard
              title="No users found"
              message="Try a different search term or role filter."
              styles={styles}
            />
          ) : (
            filteredProfiles.map((profile) => (
              <UserCard
                key={profile.id}
                profile={profile}
                isCurrentUser={profile.id === user?.id}
                busy={busyId === profile.id}
                draft={profileDrafts[profile.id] ?? {
                  name: profile.full_name ?? '',
                  role: profile.role,
                }}
                onChangeDraft={(draft) =>
                  setProfileDrafts((current) => ({ ...current, [profile.id]: draft }))
                }
                onSave={() => {
                  const draft = profileDrafts[profile.id] ?? {
                    name: profile.full_name ?? '',
                    role: profile.role,
                  };
                  if (
                    profile.role === 'admin' &&
                    draft.role !== 'admin' &&
                    (data?.reports.roleCounts.admin ?? 0) <= 1
                  ) {
                    setError(
                      'The last administrator cannot be demoted. Promote another account to administrator first.'
                    );
                    setMessage(null);
                    return;
                  }
                  void runAction(
                    profile.id,
                    () => updateManagedProfile(profile.id, draft.name, draft.role),
                    'User profile saved.'
                  );
                }}
                onDelete={() =>
                  Alert.alert(
                    'Delete user?',
                    `This permanently removes ${profile.full_name || profile.email}, their profile, and their attendance records. Events they created will remain.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete user',
                        style: 'destructive',
                        onPress: () =>
                          void runAction(
                            profile.id,
                            () => deleteManagedUser(profile.id),
                            'User deleted.'
                          ),
                      },
                    ]
                  )
                }
              />
            ))
          )}
        </View>
      ) : section === 'events' ? (
        <View>
          <SectionHeading
            title="Manage events"
            subtitle="Create events, adjust their schedules, and review check-in totals."
            styles={styles}
          />

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create an event</Text>
            <Text style={styles.formSubtitle}>
              Events created here are immediately available for attendance scanning.
            </Text>

            <Text style={styles.fieldLabel}>EVENT TITLE</Text>
            <TextInput
              style={styles.input}
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              placeholder="e.g. Founders Day Assembly"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>EVENT CODE</Text>
            <TextInput
              style={styles.input}
              value={newEventCode}
              onChangeText={setNewEventCode}
              placeholder="e.g. EVT-2026-0002"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>STARTS</Text>
            <PickerField
              value={formatDateTime(newEventStart)}
              icon="sunny-outline"
              onPress={() => openPicker({ kind: 'new-event', field: 'start' })}
            />

            <Text style={styles.fieldLabel}>ENDS</Text>
            <PickerField
              value={formatDateTime(newEventEnd)}
              icon="moon-outline"
              onPress={() => openPicker({ kind: 'new-event', field: 'end' })}
            />

            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: primary, marginTop: 14 },
                busyId === 'create-event' && styles.disabled,
              ]}
              disabled={busyId === 'create-event'}
              onPress={handleCreateEvent}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={17} color={colors.textOnPrimary} />
              <Text style={styles.primaryButtonText}>
                {busyId === 'create-event' ? 'Creating...' : 'Create event'}
              </Text>
            </Pressable>
          </View>

          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search events by title or code"
          />

          {filteredEvents.length === 0 ? (
            <EmptyCard
              title="No events found"
              message="Create an event above or try a different search."
              styles={styles}
            />
          ) : (
            filteredEvents.map((event) => {
              const draft = eventDrafts[event.id] ?? toEventDraft(event);
              const editing = editingEventId === event.id;
              return (
                <View key={event.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.eventIcon, { backgroundColor: colors.accentSurface }]}>
                      <Ionicons name="calendar" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.cardHeaderCopy}>
                      <Text style={styles.cardTitle}>{event.title}</Text>
                      <Text style={styles.cardMeta}>{event.event_code}</Text>
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{event.attendanceCount}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
                    <Text style={styles.metaText}>
                      {formatEventRange(event.start_time, event.end_time)}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="person-outline" size={15} color={colors.textSecondary} />
                    <Text style={styles.metaText}>
                      {event.creatorName || event.creatorEmail || 'No creator recorded'}
                    </Text>
                  </View>
                  <Text style={styles.muted}>
                    {event.attendanceCount === 0
                      ? 'No check-ins recorded yet.'
                      : `${event.attendanceCount} check-in${event.attendanceCount === 1 ? '' : 's'} recorded.`}
                  </Text>

                  {editing ? (
                    <View>
                      <Text style={styles.fieldLabel}>EVENT TITLE</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.title}
                        onChangeText={(title) =>
                          setEventDrafts((current) => ({
                            ...current,
                            [event.id]: { ...draft, title },
                          }))
                        }
                        placeholder="Event title"
                        placeholderTextColor={colors.textSecondary}
                        editable={busyId !== event.id}
                      />

                      <Text style={styles.fieldLabel}>EVENT CODE</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.eventCode}
                        onChangeText={(eventCode) =>
                          setEventDrafts((current) => ({
                            ...current,
                            [event.id]: { ...draft, eventCode },
                          }))
                        }
                        placeholder="Event code"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="characters"
                        editable={busyId !== event.id}
                      />

                      <Text style={styles.fieldLabel}>STARTS</Text>
                      <PickerField
                        value={formatDateTime(draft.start)}
                        icon="sunny-outline"
                        onPress={() =>
                          openPicker({ kind: 'event', eventId: event.id, field: 'start' })
                        }
                      />

                      <Text style={styles.fieldLabel}>ENDS</Text>
                      <PickerField
                        value={formatDateTime(draft.end)}
                        icon="moon-outline"
                        onPress={() =>
                          openPicker({ kind: 'event', eventId: event.id, field: 'end' })
                        }
                      />

                      <View style={styles.actionRow}>
                        <Pressable
                          style={[
                            styles.primaryButton,
                            { backgroundColor: primary },
                            busyId === event.id && styles.disabled,
                          ]}
                          disabled={busyId === event.id}
                          onPress={() =>
                            void runAction(
                              event.id,
                              async () => {
                                await updateManagedEvent(event.id, {
                                  title: draft.title,
                                  eventCode: draft.eventCode,
                                  startTime: draft.start || null,
                                  endTime: draft.end || null,
                                });
                                setEditingEventId(null);
                              },
                              'Event updated.'
                            )
                          }
                          accessibilityRole="button"
                        >
                          <Text style={styles.primaryButtonText}>
                            {busyId === event.id ? 'Saving...' : 'Save changes'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.secondaryButton}
                          disabled={busyId === event.id}
                          onPress={() => {
                            setEditingEventId(null);
                            setEventDrafts((current) => {
                              const next = { ...current };
                              delete next[event.id];
                              return next;
                            });
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.secondaryButtonText}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => setEditingEventId(event.id)}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
                        <Text style={styles.secondaryButtonText}>Edit details</Text>
                      </Pressable>
                      <Pressable
                        style={styles.dangerButton}
                        disabled={busyId === event.id}
                        onPress={() =>
                          Alert.alert(
                            'Delete event?',
                            'This also removes every attendance record for this event. This cannot be undone.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () =>
                                  void runAction(
                                    event.id,
                                    () => deleteManagedEvent(event.id),
                                    'Event deleted.'
                                  ),
                              },
                            ]
                          )
                        }
                        accessibilityRole="button"
                      >
                        <Ionicons name="trash-outline" size={15} color={colors.danger} />
                        <Text style={styles.dangerButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      ) : section === 'attendance' ? (
        <View>
          <SectionHeading
            title="Attendance records"
            subtitle="Review overall attendance, correct check-in times, and remove invalid records."
            styles={styles}
          />

          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search by student, email, or event"
          />

          <View style={styles.attendanceSummary}>
            <Text style={styles.attendanceSummaryText}>
              Showing {visibleAttendance.length} of {filteredAttendance.length} matching records
            </Text>
            <Text style={styles.attendanceSummaryText}>
              {data?.totalAttendance ?? 0} total check-ins
            </Text>
          </View>

          {filteredAttendance.length === 0 ? (
            <EmptyCard
              title="No attendance records"
              message="No check-ins match this search yet."
              styles={styles}
            />
          ) : (
            <>
              {visibleAttendance.map((record) => (
                <AttendanceCard
                  key={record.id}
                  record={record}
                  busy={busyId === record.id}
                  draft={attendanceDrafts[record.id] ?? record.scanned_at}
                  onChangeDraft={(value) =>
                    setAttendanceDrafts((current) => ({ ...current, [record.id]: value }))
                  }
                  onPickTime={() =>
                    openPicker({ kind: 'attendance', attendanceId: record.id })
                  }
                  onSave={() =>
                    void runAction(
                      record.id,
                      () =>
                        updateManagedAttendance(
                          record.id,
                          attendanceDrafts[record.id] ?? record.scanned_at
                        ),
                      'Attendance record corrected.'
                    )
                  }
                  onDelete={() =>
                    Alert.alert(
                      'Delete attendance record?',
                      'This check-in will be permanently removed. This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () =>
                            void runAction(
                              record.id,
                              () => deleteManagedAttendance(record.id),
                              'Attendance record deleted.'
                            ),
                        },
                      ]
                    )
                  }
                />
              ))}

              {filteredAttendance.length > attendanceLimit && (
                <Pressable
                  style={styles.linkButton}
                  onPress={() => setAttendanceLimit((current) => current + 50)}
                  accessibilityRole="button"
                >
                  <Text style={styles.linkText}>Show more records</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      ) : (
        <View>
          <SectionHeading
            title="System reports"
            subtitle="A live summary of accounts, events, and attendance activity."
            styles={styles}
          />

          <View style={styles.reportGrid}>
            <ReportStat label="STUDENTS" value={reports?.roleCounts.student ?? 0} />
            <ReportStat label="TEACHERS" value={reports?.roleCounts.teacher ?? 0} />
            <ReportStat label="ADMINISTRATORS" value={reports?.roleCounts.admin ?? 0} />
            <ReportStat label="UNIQUE ATTENDEES" value={reports?.uniqueAttendees ?? 0} />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderCopy}>
                <Text style={styles.cardTitle}>Attendance overview</Text>
                <Text style={styles.cardMeta}>All records currently in Supabase</Text>
              </View>
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <ReportRow label="Total check-ins" value={reports?.totalAttendance ?? 0} styles={styles} />
            <ReportRow label="Registered users" value={reports?.totalProfiles ?? 0} styles={styles} />
            <ReportRow label="Events" value={reports?.totalEvents ?? 0} styles={styles} />
            <ReportRow
              label="Average check-ins per event"
              value={reports?.averageAttendancePerEvent ?? 0}
              styles={styles}
            />
            <ReportRow
              label="Check-ins in the last 7 days"
              value={reports?.checkInsLast7Days ?? 0}
              styles={styles}
            />
            <ReportRow
              label="Events with no check-ins"
              value={reports?.eventsWithoutAttendance ?? 0}
              styles={styles}
              last
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attendance by event</Text>
            <Text style={styles.cardMeta}>
              Top events by number of recorded check-ins.
            </Text>
            {(reports?.topEvents.length ?? 0) === 0 ? (
              <Text style={styles.muted}>No check-ins have been recorded yet.</Text>
            ) : (
              <View style={styles.reportEventList}>
                {reports?.topEvents.map((event) => (
                  <View key={event.id} style={styles.reportEventRow}>
                    <View style={styles.reportEventTop}>
                      <Text style={styles.reportEventTitle} numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Text style={styles.reportEventCount}>{event.attendanceCount}</Text>
                    </View>
                    <View style={styles.reportBarTrack}>
                      <View
                        style={[
                          styles.reportBarFill,
                          {
                            backgroundColor: primary,
                            width: `${Math.max(event.percentage, 2)}%` as `${number}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.reportEventMeta}>
                      {event.event_code} · {event.percentage}% of check-ins
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent activity</Text>
            <Text style={styles.cardMeta}>The latest check-ins across all events.</Text>
            {(reports?.recentActivity.length ?? 0) === 0 ? (
              <Text style={styles.muted}>No attendance activity yet.</Text>
            ) : (
              reports?.recentActivity.map((record) => (
                <View key={record.id} style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: colors.tertiary }]} />
                  <View style={styles.activityCopy}>
                    <Text style={styles.activityName} numberOfLines={1}>
                      {record.student_name || record.student_email || 'Unknown student'}
                    </Text>
                    <Text style={styles.activityMeta} numberOfLines={1}>
                      {record.event_title}
                      {record.event_code ? ` · ${record.event_code}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.activityTime}>{formatShortDate(record.scanned_at)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>System records</Text>
            <ReportRow label="Database" value="Supabase" styles={styles} />
            <ReportRow label="Students with no check-ins" value={reports?.studentsWithoutAttendance ?? 0} styles={styles} />
            <ReportRow
              label="Records loaded"
              value={`${data?.attendance.length ?? 0} check-ins`}
              styles={styles}
            />
            <ReportRow
              label="Report generated"
              value={reports ? formatDateTime(reports.generatedAt) : 'Not available'}
              styles={styles}
              last
            />
            <Pressable
              style={[styles.primaryButton, { backgroundColor: primary, marginTop: 14 }]}
              onPress={() => {
                setMessage(null);
                void refresh().then((ok) => {
                  if (ok) setMessage('System report refreshed.');
                });
              }}
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={16} color={colors.textOnPrimary} />
              <Text style={styles.primaryButtonText}>Refresh report</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>BAGATA SYSTEM RECORDS</Text>
        </View>
      )}

      {pickerTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={pickerValue}
            mode={isAndroid ? pickerPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            onChange={onPickerChange}
          />
        </View>
      )}
    </ScrollView>
  );
}

function HeroStat({
  label,
  value,
  styles,
}: {
  label: string;
  value: number;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function SectionHeading({
  title,
  subtitle,
  styles,
}: {
  title: string;
  subtitle: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors, colors.primary);

  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={17} color={colors.textSecondary} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {!!value && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={17} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

function PickerField({
  value,
  icon,
  onPress,
}: {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { primary, colors } = useTheme();
  const styles = createStyles(colors, primary);

  return (
    <Pressable
      style={({ pressed }) => [styles.pickerField, pressed && styles.disabled]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

function UserCard({
  profile,
  isCurrentUser,
  busy,
  draft,
  onChangeDraft,
  onSave,
  onDelete,
}: {
  profile: AdminProfile;
  isCurrentUser: boolean;
  busy: boolean;
  draft: { name: string; role: Role };
  onChangeDraft: (draft: { name: string; role: Role }) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { primary, colors } = useTheme();
  const styles = createStyles(colors, primary);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSurface }]}>
          <Text style={[styles.avatarText, { color: primary }]}>
            {initials(profile.full_name || profile.email)}
          </Text>
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {profile.full_name || 'Name not set'}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{profile.email}</Text>
        </View>
        {isCurrentUser && (
          <View style={styles.selfBadge}>
            <Text style={styles.selfBadgeText}>YOU</Text>
          </View>
        )}
      </View>

      <View style={styles.userStats}>
        <Text style={styles.statText}>{profile.attendanceCount} check-ins</Text>
        <Text style={styles.statDot}>•</Text>
        <Text style={styles.statText}>{profile.eventsCreated} events</Text>
      </View>

      <Text style={styles.fieldLabel}>FULL NAME</Text>
      <TextInput
        style={styles.input}
        value={draft.name}
        onChangeText={(name) => onChangeDraft({ ...draft, name })}
        placeholder="Full name"
        placeholderTextColor={colors.textSecondary}
        editable={!busy}
      />

      <Text style={styles.fieldLabel}>ACCOUNT ROLE</Text>
      <View style={styles.roleRow}>
        {ROLES.map((role) => {
          const selected = draft.role === role;
          return (
            <Pressable
              key={role}
              onPress={() => onChangeDraft({ ...draft, role })}
              disabled={isCurrentUser || busy}
              style={[
                styles.roleOption,
                selected && styles.roleOptionSelected,
                isCurrentUser && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: isCurrentUser }}
            >
              <Text style={[styles.roleText, selected && styles.roleTextSelected]}>
                {role}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {isCurrentUser && (
        <Text style={styles.hint}>
          Your own administrator role cannot be changed here. Another administrator can
          update it.
        </Text>
      )}

      <View style={styles.actionRow}>
        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: primary },
            busy && styles.disabled,
          ]}
          disabled={busy}
          onPress={onSave}
          accessibilityRole="button"
        >
          <Ionicons name="save-outline" size={15} color={colors.textOnPrimary} />
          <Text style={styles.primaryButtonText}>
            {busy ? 'Saving...' : 'Save user'}
          </Text>
        </Pressable>
        {!isCurrentUser && (
          <Pressable
            style={[styles.dangerButton, busy && styles.disabled]}
            disabled={busy}
            onPress={onDelete}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
            <Text style={styles.dangerButtonText}>Delete</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function AttendanceCard({
  record,
  busy,
  draft,
  onChangeDraft,
  onPickTime,
  onSave,
  onDelete,
}: {
  record: AdminAttendance;
  busy: boolean;
  draft: string;
  onChangeDraft: (value: string) => void;
  onPickTime: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { primary, colors } = useTheme();
  const styles = createStyles(colors, primary);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
          <Ionicons name="person" size={17} color={primary} />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {record.student_name || record.student_email || 'Unknown student'}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {record.event_title}
            {record.event_code ? ` · ${record.event_code}` : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>CHECK-IN TIME</Text>
      <PickerField
        value={formatDateTime(draft)}
        icon="time-outline"
        onPress={onPickTime}
      />
      <Text style={styles.hint}>
        Original record: {formatDateTime(record.scanned_at)}
      </Text>

      <View style={styles.actionRow}>
        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: primary },
            busy && styles.disabled,
          ]}
          disabled={busy}
          onPress={onSave}
          accessibilityRole="button"
        >
          <Ionicons name="checkmark-outline" size={16} color={colors.textOnPrimary} />
          <Text style={styles.primaryButtonText}>
            {busy ? 'Saving...' : 'Save time'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.dangerButton, busy && styles.disabled]}
          disabled={busy}
          onPress={onDelete}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={15} color={colors.danger} />
          <Text style={styles.dangerButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyCard({
  title,
  message,
  styles,
}: {
  title: string;
  message: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.emptyCard}>
      <Ionicons name="file-tray-outline" size={24} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { marginTop: 8 }]}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  const { primary, colors } = useTheme();
  const styles = createStyles(colors, primary);

  return (
    <View style={styles.reportStat}>
      <Text style={styles.reportStatValue}>{value}</Text>
      <Text style={styles.reportStatLabel}>{label}</Text>
    </View>
  );
}

function ReportRow({
  label,
  value,
  styles,
  last = false,
}: {
  label: string;
  value: string | number;
  styles: ReturnType<typeof createStyles>;
  last?: boolean;
}) {
  return (
    <View style={[styles.reportRow, last && styles.reportRowLast]}>
      <Text style={styles.reportRowLabel}>{label}</Text>
      <Text style={styles.reportRowValue}>{value}</Text>
    </View>
  );
}

function toEventDraft(event: AdminEvent): EventDraft {
  return {
    title: event.title,
    eventCode: event.event_code,
    start: event.start_time ?? '',
    end: event.end_time ?? '',
  };
}

function defaultStart() {
  const date = new Date();
  date.setSeconds(0, 0);
  return date;
}

function defaultEnd() {
  return new Date(defaultStart().getTime() + 60 * 60 * 1000);
}

function mergeDate(base: Date, selected: Date) {
  const next = new Date(base);
  next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return next;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEventRange(start: string | null, end: string | null) {
  if (!start && !end) return 'Schedule not set';
  if (start && end) return `${formatDateTime(start)} – ${formatDateTime(end)}`;
  return start ? `Starts ${formatDateTime(start)}` : `Ends ${formatDateTime(end)}`;
}

function initials(value: string) {
  const words = value.trim().split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function createStyles(colors: AppColors, primary: string) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flex: 1,
      justifyContent: 'center',
    },
    content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },
    accessTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
    accessText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
      maxWidth: 280,
      textAlign: 'center',
    },
    accessButton: {
      alignItems: 'center',
      borderRadius: 3,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      marginTop: 16,
      minHeight: 40,
      paddingHorizontal: 18,
    },
    header: { marginBottom: 18 },
    eyebrow: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
      marginBottom: 8,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 27,
      fontWeight: '700',
      letterSpacing: -0.5,
      marginBottom: 6,
    },
    subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },

    hero: { backgroundColor: primary, marginBottom: 20, padding: 17 },
    heroTop: { alignItems: 'center', flexDirection: 'row' },
    heroIcon: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
      height: 46,
      justifyContent: 'center',
      width: 46,
    },
    heroCopy: { flex: 1, marginLeft: 12, marginRight: 8, minWidth: 0 },
    heroEyebrow: {
      color: colors.textOnPrimary,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.1,
      opacity: 0.82,
    },
    heroName: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '700', marginTop: 4 },
    heroEmail: {
      color: colors.textOnPrimary,
      fontSize: 11,
      marginTop: 3,
      opacity: 0.82,
    },
    heroBadge: {
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderColor: 'rgba(255,255,255,0.35)',
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    heroBadgeText: {
      color: colors.textOnPrimary,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.7,
    },
    heroStats: {
      borderTopColor: 'rgba(255,255,255,0.22)',
      borderTopWidth: 1,
      flexDirection: 'row',
      marginTop: 16,
      paddingTop: 14,
    },
    heroStat: { alignItems: 'center', flex: 1 },
    heroStatValue: { color: colors.textOnPrimary, fontSize: 20, fontWeight: '800' },
    heroStatLabel: {
      color: colors.textOnPrimary,
      fontSize: 8,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginTop: 3,
      opacity: 0.82,
    },
    heroStatDivider: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      marginVertical: 2,
      width: 1,
    },
    heroFooter: { alignItems: 'center', flexDirection: 'row', marginTop: 14 },
    heroFooterText: {
      color: colors.textOnPrimary,
      flex: 1,
      fontSize: 10,
      marginLeft: 7,
      opacity: 0.82,
    },
    goldMark: { backgroundColor: colors.tertiary, height: 4, width: 22 },

    sections: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      marginBottom: 18,
    },
    sectionButton: {
      alignItems: 'center',
      flex: 1,
      gap: 5,
      paddingBottom: 10,
      paddingTop: 4,
    },
    sectionLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
    sectionLabelActive: { color: primary, fontWeight: '800' },
    sectionIndicator: {
      backgroundColor: 'transparent',
      bottom: -1,
      height: 2,
      left: 8,
      position: 'absolute',
      right: 8,
    },
    sectionIndicatorActive: { backgroundColor: primary },

    sectionHeader: { marginBottom: 12, marginTop: 2 },
    sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 4 },
    sectionSubtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },

    searchWrap: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      flexDirection: 'row',
      marginBottom: 12,
      paddingHorizontal: 12,
    },
    searchInput: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 13,
      marginLeft: 8,
      paddingVertical: 11,
    },

    filterRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    filterChip: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 3,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    filterChipActive: { backgroundColor: colors.accentSurface, borderColor: primary },
    filterText: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    filterTextActive: { color: primary, fontWeight: '800' },

    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      marginBottom: 12,
      padding: 14,
    },
    formCard: {
      backgroundColor: colors.card,
      borderLeftColor: colors.accent,
      borderLeftWidth: 3,
      marginBottom: 16,
      padding: 16,
    },
    formTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
    formSubtitle: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 4 },
    cardHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 10 },
    avatar: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
    eventIcon: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
    avatarText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
    cardHeaderCopy: { flex: 1, marginLeft: 11, marginRight: 8, minWidth: 0 },
    cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
    cardMeta: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
    selfBadge: { backgroundColor: colors.surface, paddingHorizontal: 7, paddingVertical: 4 },
    selfBadgeText: {
      color: colors.textSecondary,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    countBadge: {
      alignItems: 'center',
      backgroundColor: colors.accentSurface,
      minWidth: 32,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    countBadgeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
    userStats: { alignItems: 'center', flexDirection: 'row', marginBottom: 4 },
    statText: { color: colors.textSecondary, fontSize: 11 },
    statDot: { color: colors.border, marginHorizontal: 6 },

    fieldLabel: {
      color: colors.textSecondary,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      marginBottom: 5,
      marginTop: 10,
    },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 3,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 13,
      paddingHorizontal: 11,
      paddingVertical: 11,
    },
    pickerField: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 3,
      borderWidth: 1,
      flexDirection: 'row',
      paddingHorizontal: 11,
      paddingVertical: 11,
    },
    pickerValue: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
      marginHorizontal: 9,
    },

    roleRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
    roleOption: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 3,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    roleOptionSelected: { backgroundColor: colors.accentSurface, borderColor: primary },
    roleText: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    roleTextSelected: { color: primary, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    hint: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 7 },

    actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    primaryButton: {
      alignItems: 'center',
      borderRadius: 3,
      flex: 1,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: 12,
    },
    primaryButtonText: { color: colors.textOnPrimary, fontSize: 11, fontWeight: '700' },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 3,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: 10,
    },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
    dangerButton: {
      alignItems: 'center',
      borderColor: colors.danger,
      borderRadius: 3,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: 12,
    },
    dangerButtonText: { color: colors.danger, fontSize: 11, fontWeight: '700' },

    metaRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 8 },
    metaText: { color: colors.textSecondary, flex: 1, fontSize: 11, lineHeight: 16 },
    muted: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8 },

    attendanceSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    attendanceSummaryText: { color: colors.textSecondary, fontSize: 10 },

    emptyCard: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderLeftColor: colors.accent,
      borderLeftWidth: 3,
      padding: 22,
    },
    emptyTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 4 },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    linkButton: { alignItems: 'center', paddingVertical: 10 },
    linkText: { color: primary, fontSize: 11, fontWeight: '700' },

    banner: { borderLeftWidth: 3, marginBottom: 12, padding: 11 },
    errorBanner: { backgroundColor: colors.card, borderLeftColor: colors.danger },
    successBanner: { backgroundColor: colors.card, borderLeftColor: primary },
    bannerText: { fontSize: 12, lineHeight: 17 },
    errorText: { color: colors.danger },
    successText: { color: primary },

    reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    reportStat: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      paddingVertical: 14,
      width: '48.8%',
    },
    reportStatValue: { color: primary, fontSize: 20, fontWeight: '800' },
    reportStatLabel: {
      color: colors.textSecondary,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.8,
      marginTop: 4,
    },
    reportRow: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      paddingVertical: 10,
    },
    reportRowLast: { borderBottomWidth: 0 },
    reportRowLabel: { color: colors.textSecondary, flex: 1, fontSize: 12 },
    reportRowValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
    reportEventList: { marginTop: 12 },
    reportEventRow: { marginBottom: 13 },
    reportEventTop: { alignItems: 'center', flexDirection: 'row', marginBottom: 5 },
    reportEventTitle: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      marginRight: 8,
    },
    reportEventCount: { color: primary, fontSize: 12, fontWeight: '800' },
    reportBarTrack: { backgroundColor: colors.background, height: 5, overflow: 'hidden' },
    reportBarFill: { height: 5 },
    reportEventMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 4 },
    liveBadge: { backgroundColor: colors.accentSurface, paddingHorizontal: 8, paddingVertical: 4 },
    liveText: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },

    activityRow: {
      alignItems: 'flex-start',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      paddingVertical: 10,
    },
    activityDot: { borderRadius: 3, height: 6, marginTop: 5, width: 6 },
    activityCopy: { flex: 1, marginLeft: 9, minWidth: 0 },
    activityName: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
    activityMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
    activityTime: { color: colors.textSecondary, fontSize: 10, marginLeft: 8 },

    loading: { alignItems: 'center', padding: 30 },
    loadingText: { color: colors.textSecondary, fontSize: 12, marginTop: 10 },
    pickerContainer: { alignItems: 'center', marginTop: 8 },
    footer: {
      color: colors.textSecondary,
      fontSize: 9,
      fontWeight: '600',
      letterSpacing: 1,
      marginTop: 24,
      textAlign: 'center',
    },
  });
}
