import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getTeacherEventAttendance, type TeacherEventAttendance } from '@/lib/attendance';
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/database';
import { getProfile, type Role } from '@/lib/profiles';
import { useTheme, type AppColors } from '@/lib/theme';

export default function HistoryScreen() {
  const { user } = useAuth();
  const { primary, colors } = useTheme();
  const styles = createStyles(colors, primary);
  const [role, setRole] = useState<Role>('student');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const profile = await getProfile(user.id);
    const currentRole = profile?.role ?? 'student';
    setRole(currentRole);
    if (currentRole === 'teacher') { setTeacherEvents(await getTeacherEventAttendance(user.id)); setRecords([]); }
    else { setRecords(await getAttendanceHistory(user.id)); setTeacherEvents([]); }
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { void loadHistory(); }, [loadHistory]));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{role === 'teacher' ? 'TEACHER TOOLS' : 'YOUR ACTIVITY'}</Text>
        <Text style={styles.title}>{role === 'teacher' ? 'Event Attendance' : 'Attendance History'}</Text>
        <Text style={styles.subtitle}>
          {role === 'teacher' ? 'A record of scans for the events you created.' : 'A record of your verified event check-ins.'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.empty}><Text style={styles.subtitle}>Loading records...</Text></View>
      ) : role === 'teacher' ? (
        teacherEvents.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>No events created yet.</Text><Text style={styles.emptySub}>Create an event in the Create tab to see attendance here.</Text></View>
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.attendeeCount}</Text>
                  </View>
                </View>
                <Text style={styles.eventMeta}>{item.eventCode}</Text>
                <View style={styles.divider} />
                {item.attendees.length === 0 ? (
                  <Text style={styles.eventMeta}>No attendees yet</Text>
                ) : (
                  item.attendees.map((attendee) => (
                    <View key={`${attendee.studentId}-${attendee.scannedAt}`} style={styles.attendeeRow}>
                      <View style={styles.dot} />
                      <Text style={styles.eventMeta}>{attendee.studentName || shortId(attendee.studentId)}</Text>
                      <Text style={styles.time}>{formatDate(attendee.scannedAt)}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          />
        )
      ) : records.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>No records yet</Text><Text style={styles.emptySub}>Scan a QR code to register your attendance.</Text></View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.eventTitle}>{item.eventTitle || item.eventId || 'Untitled event'}</Text>
                <View style={[styles.check, { backgroundColor: primary }]}><Text style={styles.checkText}>✓</Text></View>
              </View>
              <Text style={styles.eventMeta}>{item.eventId}</Text>
              <Text style={styles.time}>{formatDate(item.scannedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
function shortId(id: string) { return id ? `…${id.slice(-8)}` : 'unknown'; }
function formatDate(iso: string) { return new Date(iso).toLocaleString(); }

function createStyles(colors: AppColors, primary: string) {
 return StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 28 },
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28 },
  header: { marginBottom: 22 },
  eyebrow: { fontSize: 10, color: colors.accent, letterSpacing: 1.4, fontWeight: '800', marginBottom: 8 },
  title: { fontSize: 27, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyCard: {
    backgroundColor: colors.card,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  list: { paddingBottom: 32, paddingTop: 0 },
  card: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1, letterSpacing: -0.1, marginRight: 8 },
  eventMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 3, flex: 1, lineHeight: 17 },
  time: { fontSize: 11, color: colors.textSecondary, marginTop: 6, fontWeight: '500' },
  badge: { backgroundColor: colors.accentSurface, paddingHorizontal: 10, paddingVertical: 5, minWidth: 30, alignItems: 'center' },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  check: { width: 28, height: 28, borderRadius: 14, backgroundColor: primary, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 11 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tertiary },
 });
}
