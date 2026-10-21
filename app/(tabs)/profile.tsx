import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth, signOut } from '@/lib/auth';
import { getProfile, updateProfile, type Profile, type ThemeMode } from '@/lib/profiles';
import { BACKGROUND_COLORS, THEME_COLORS, useTheme, type AppColors } from '@/lib/theme';

export default function ProfileScreen() {
  const { user } = useAuth();
  const {
    primary,
    backgroundColor,
    isDark,
    colors,
    setPrimary,
    setBackground,
    setIsDark,
  } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const currentProfile = await getProfile(user.id);
    setProfile(currentProfile);
    setDraftName(currentProfile?.full_name ?? '');
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user || !draftName.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }

    setSaving(true);
    const { error } = await updateProfile(user.id, {
      full_name: draftName.trim(),
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    setProfile((current) =>
      current ? { ...current, full_name: draftName.trim() } : current
    );
    setEditing(false);
  };

  const handleSelectColor = async (color: string) => {
    if (!user || saving || color === primary) return;

    setSaving(true);
    try {
      const { error } = await updateProfile(user.id, { theme_color: color });
      if (error) throw new Error(error);

      setProfile((current) =>
        current ? { ...current, theme_color: color } : current
      );
      setPrimary(color);
    } catch (error) {
      Alert.alert(
        'Could not save color',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSelectMode = async (mode: ThemeMode) => {
    if (!user || saving || (mode === 'dark') === isDark) return;
    setSaving(true);
    try {
      const { error } = await updateProfile(user.id, { theme_mode: mode });
      if (error) throw new Error(error);
      setProfile((current) => current ? { ...current, theme_mode: mode } : current);
      setIsDark(mode === 'dark');
    } catch (error) {
      Alert.alert(
        'Could not save theme',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSelectBackground = async (color: string) => {
    if (!user || saving || color === backgroundColor) return;
    setSaving(true);
    try {
      const { error } = await updateProfile(user.id, { theme_background: color });
      if (error) throw new Error(error);
      setProfile((current) =>
        current ? { ...current, theme_background: color } : current
      );
      setBackground(color);
    } catch (error) {
      Alert.alert(
        'Could not save background',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await signOut();
      if (error) {
        throw error;
      }
      router.replace('/login');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to sign out.'
      );
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.full_name?.trim() || 'Complete your profile';
  const initials = getInitials(profile?.full_name || user?.email || '');
  const selectedTheme = THEME_COLORS.find((color) => color.primary === primary) ?? THEME_COLORS[0];
  const selectedBackground = BACKGROUND_COLORS.find((color) => color.light === backgroundColor)
    ?? BACKGROUND_COLORS[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ACCOUNT SETTINGS</Text>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Manage your personal details and preferences.</Text>
      </View>

      {loading ? (
      <View style={styles.loadingCard}>
        <Text style={styles.loadingText}>Loading your account...</Text>
        </View>
      ) : user ? (
      <>
        <View style={[styles.identityCard, { backgroundColor: primary }]}>
          <View style={styles.identityTop}>
            <View style={styles.avatar}>
              <Text style={[styles.avatarText, { color: primary }]}>{initials}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.identityName} numberOfLines={2}>{displayName}</Text>
              <Text style={styles.identityEmail} numberOfLines={1}>
                {profile?.email ?? user.email ?? 'Email unavailable'}
              </Text>
            </View>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {profile ? profile.role.toUpperCase() : 'ACCOUNT'}
              </Text>
            </View>
          </View>
          <View style={styles.identityFooter}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.textOnPrimary} />
            <Text style={styles.identityFooterText}>BAGATA attendance account</Text>
            <View style={styles.goldMark} />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Personal information</Text>
          <Text style={styles.sectionCaption}>YOUR ACCOUNT</Text>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: colors.accentSurface }]}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>FULL NAME</Text>
              {editing ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    editable={!saving}
                    autoFocus
                    placeholder="Enter your full name"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Pressable
                    onPress={handleSaveName}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Save full name"
                    hitSlop={8}
                  >
                    <Text style={[styles.actionText, { color: primary }]}>
                      {saving ? 'Saving' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.detailValue}>{profile?.full_name || 'Name not set'}</Text>
              )}
            </View>
            {!editing && (
              <Pressable
                onPress={() => setEditing(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit full name"
                hitSlop={8}
                style={styles.editButton}
              >
                <Ionicons name="create-outline" size={17} color={primary} />
                <Text style={[styles.editHint, { color: primary }]}>Edit</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="mail-outline" size={18} color={primary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>EMAIL ADDRESS</Text>
              <Text style={styles.detailValue}>{profile?.email ?? user.email ?? 'Email unavailable'}</Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="finger-print-outline" size={18} color={primary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>ACCOUNT ID</Text>
              <Text style={styles.detailValueSmall} numberOfLines={1}>{user.id}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.sectionCaption}>PERSONALIZE</Text>
        </View>
        <View style={styles.themeCard}>
          <View style={styles.modeRow}>
            <View style={[styles.modeIcon, { backgroundColor: colors.surface }]}>
              <Ionicons
                name={isDark ? 'moon-outline' : 'sunny-outline'}
                size={18}
                color={primary}
              />
            </View>
            <View style={styles.modeCopy}>
              <Text style={styles.themeTitle}>Dark appearance</Text>
              <Text style={styles.colorHint}>
                {isDark ? 'Dark theme is on' : 'Use a darker interface'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(value) => void handleSelectMode(value ? 'dark' : 'light')}
              disabled={saving}
              trackColor={{ false: colors.border, true: primary }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Toggle dark appearance"
            />
          </View>
          <View style={styles.themeDivider} />
          <View style={styles.themeHeader}>
            <View style={styles.themeCopy}>
              <Text style={styles.themeTitle}>Accent palette</Text>
              <Text style={styles.colorHint}>Choose a three-color palette for the app.</Text>
            </View>
            <View style={[styles.selectedColorBadge, { backgroundColor: colors.surface }]}>
              <View style={[styles.selectedColorDot, { backgroundColor: primary }]} />
              <View style={[styles.selectedColorDot, { backgroundColor: colors.accent }]} />
              <View style={[styles.selectedColorDot, { backgroundColor: colors.tertiary }]} />
              <Text style={[styles.selectedColorName, { color: primary }]}>{selectedTheme.name}</Text>
            </View>
          </View>
          <View style={styles.colorOptions}>
            {THEME_COLORS.map((color) => {
              const selected = color.primary === primary;
              return (
                <Pressable
                  key={color.name}
                  style={[
                    styles.colorOption,
                    selected && {
                      backgroundColor: isDark ? colors.surface : colors.accentSurface,
                      borderColor: color.primary,
                    },
                  ]}
                  onPress={() => handleSelectColor(color.primary)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`${color.name} theme color`}
                  accessibilityState={{ selected, disabled: saving }}
                >
                  <PaletteSwatch
                    primary={color.primary}
                    accent={color.accent}
                    tertiary={color.tertiary}
                  />
                  <Text style={[styles.colorName, selected && { color: color.primary, fontWeight: '700' }]}>
                    {color.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>PREVIEW</Text>
            <View style={styles.previewLine} />
            <View
              style={[
                styles.previewSample,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
              accessibilityLabel={`${selectedTheme.name} palette preview`}
            >
              <View style={[styles.previewColorSwatch, { backgroundColor: primary }]} />
              <View style={[styles.previewColorSwatch, { backgroundColor: colors.accent }]} />
              <View style={[styles.previewColorSwatch, { backgroundColor: colors.tertiary }]} />
            </View>
          </View>
          <View style={styles.themeDivider} />
          <View style={styles.backgroundHeader}>
            <View style={styles.themeCopy}>
              <Text style={styles.themeTitle}>Background color</Text>
              <Text style={styles.colorHint}>Choose a subtle background independently.</Text>
            </View>
            <View style={styles.currentBackground}>
              <View
                style={[
                  styles.currentBackgroundSwatch,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              />
              <Text style={styles.currentBackgroundName}>{selectedBackground.name}</Text>
            </View>
          </View>
          <View style={styles.backgroundOptions}>
            {BACKGROUND_COLORS.map((option) => {
              const selected = option.light === backgroundColor;
              return (
                <Pressable
                  key={option.name}
                  style={[
                    styles.backgroundOption,
                    selected && { borderColor: primary, backgroundColor: colors.surface },
                  ]}
                  onPress={() => handleSelectBackground(option.light)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.name} background`}
                  accessibilityState={{ selected, disabled: saving }}
                >
                  <View
                    style={[
                      styles.backgroundChoiceSwatch,
                      {
                        backgroundColor: isDark ? option.dark : option.light,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {selected && <Ionicons name="checkmark" size={15} color={primary} />}
                  </View>
                  <Text
                    style={[
                      styles.backgroundChoiceName,
                      selected && { color: primary, fontWeight: '700' },
                    ]}
                  >
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </>
    ) : (
      <View style={styles.signedOutCard}>
        <View style={styles.signedOutMessage}>
          <Ionicons name="person-circle-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.signedOutText}>Sign in to view your profile and preferences.</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.signInButton,
            { backgroundColor: primary },
            pressed && styles.pressed,
          ]}
          onPress={() => router.replace('/login')}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Ionicons name="log-in-outline" size={18} color={colors.textOnPrimary} />
          <Text style={[styles.signInText, { color: colors.textOnPrimary }]}>Sign in</Text>
        </Pressable>
      </View>
    )}

    {user && (
      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
        onPress={handleSignOut}
        disabled={saving}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={19} color={colors.danger} />
        <Text style={styles.signOutText}>{saving ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>
    )}
    </ScrollView>
  );
}

function PaletteSwatch({
  primary,
  accent,
  tertiary,
}: {
  primary: string;
  accent: string;
  tertiary: string;
}) {
  return (
    <Svg width={38} height={38} viewBox="0 0 36 36">
      <Path d="M18 18 L3.278 26.5 A17 17 0 0 1 18 1 Z" fill={primary} />
      <Path d="M18 18 L18 1 A17 17 0 0 1 32.722 26.5 Z" fill={accent} />
      <Path d="M18 18 L32.722 26.5 A17 17 0 0 1 3.278 26.5 Z" fill={tertiary} />
    </Svg>
  );
}

function getInitials(value: string) {
  const words = value.trim().split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return 'B';
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 32,
  },
  header: { marginBottom: 21 },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.7,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  loadingCard: {
    backgroundColor: colors.card,
    padding: 20,
    marginBottom: 18,
  },
  loadingText: { color: colors.textSecondary, textAlign: 'center', paddingVertical: 12 },
  identityCard: {
    marginBottom: 27,
    paddingHorizontal: 17,
    paddingTop: 19,
    paddingBottom: 14,
  },
  identityTop: { alignItems: 'center', flexDirection: 'row' },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: { fontSize: 19, fontWeight: '800', letterSpacing: 0.4 },
  identityCopy: { flex: 1, marginLeft: 13, marginRight: 8 },
  identityName: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '700' },
  identityEmail: { color: colors.textOnPrimary, fontSize: 12, marginTop: 4, opacity: 0.82 },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  roleBadgeText: { color: colors.textOnPrimary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  identityFooter: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderTopWidth: 1,
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 12,
  },
  identityFooterText: { color: colors.textOnPrimary, flex: 1, fontSize: 11, marginLeft: 8, opacity: 0.85 },
  goldMark: { backgroundColor: colors.tertiary, height: 4, width: 24 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  sectionCaption: { color: colors.textSecondary, fontSize: 9, fontWeight: '700', letterSpacing: 0.9 },
  detailsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 24,
    paddingHorizontal: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 70,
    paddingVertical: 11,
  },
  detailIcon: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailContent: { flex: 1, marginLeft: 12, minWidth: 0 },
  detailLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  detailValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  detailValueSmall: { color: colors.textSecondary, fontSize: 11 },
  rowDivider: { backgroundColor: colors.border, height: 1, marginLeft: 48 },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 12,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
  editButton: { alignItems: 'center', flexDirection: 'row', gap: 4, marginLeft: 7, paddingVertical: 8 },
  editHint: { fontSize: 11, fontWeight: '700' },
  themeCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 16,
    padding: 15,
  },
  themeHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 13 },
  themeCopy: { flex: 1 },
  themeTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  colorHint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  colorOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  colorOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 86,
    paddingHorizontal: 2,
    paddingVertical: 6,
    width: '25%',
  },
  colorName: { color: colors.textSecondary, fontSize: 9, marginTop: 5, textAlign: 'center' },
  selectedColorBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  selectedColorDot: { height: 10, width: 10, borderRadius: 5 },
  selectedColorName: { fontSize: 10, fontWeight: '700' },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 15 },
  previewLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  previewLine: { backgroundColor: colors.border, flex: 1, height: 1 },
  previewSample: { alignItems: 'center', flexDirection: 'row', gap: 7, padding: 5 },
  previewColorSwatch: { height: 16, width: 16 },
  backgroundHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 10 },
  currentBackground: { alignItems: 'center', flexDirection: 'row', gap: 6, marginLeft: 8 },
  currentBackgroundSwatch: { borderRadius: 3, borderWidth: 1, height: 19, width: 26 },
  currentBackgroundName: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
  backgroundOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  backgroundOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 68,
    paddingVertical: 7,
    width: '24%',
  },
  backgroundChoiceSwatch: {
    alignItems: 'center',
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 38,
  },
  backgroundChoiceName: { color: colors.textSecondary, fontSize: 10, marginTop: 5 },
  signedOutCard: { backgroundColor: colors.card, gap: 14, padding: 18 },
  signedOutMessage: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  signedOutText: { color: colors.textSecondary, flex: 1, fontSize: 13 },
  signInButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  signInText: { fontSize: 12, fontWeight: '700' },
  signOutButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 5,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  signOutText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.65 },
  modeRow: { alignItems: 'center', flexDirection: 'row', minHeight: 54 },
  modeIcon: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  modeCopy: { flex: 1, marginLeft: 10 },
  themeDivider: { backgroundColor: colors.border, height: 1, marginBottom: 14, marginTop: 10 },
});
}
