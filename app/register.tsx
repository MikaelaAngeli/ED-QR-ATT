import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Link } from 'expo-router';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { signUp, verifyAdminSignupCode, type SignupRole } from '@/lib/auth';

const ROLE_OPTIONS: {
  role: SignupRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}[] = [
  {
    role: 'student',
    label: 'Student',
    icon: 'school-outline',
    description:
      'Scan event QR codes, record your attendance, and review your personal attendance history.',
  },
  {
    role: 'teacher',
    label: 'Teacher',
    icon: 'clipboard-outline',
    description:
      'Create and manage events, generate event QR codes, and monitor attendance records and summaries.',
  },
  {
    role: 'admin',
    label: 'Admin',
    icon: 'shield-checkmark-outline',
    description:
      'Manage users and events, view overall attendance, correct records, and open system reports.',
  },
];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<SignupRole>('student');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedRole = ROLE_OPTIONS.find((option) => option.role === role) ?? ROLE_OPTIONS[0];

  const handleRegister = async () => {
    setError(null);

    if (!email.trim() || !password || !confirmPassword || !fullName.trim()) {
      setError('Name, email, and password are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (role === 'admin' && !adminCode.trim()) {
      setError('Enter the administrator access code.');
      return;
    }

    setLoading(true);

    try {
      if (role === 'admin') {
        const validCode = await verifyAdminSignupCode(adminCode);
        if (!validCode) {
          setError('Invalid administrator access code.');
          return;
        }
      }

      const metadata: {
        full_name: string;
        role: SignupRole;
        admin_code?: string;
      } = {
        full_name: fullName.trim(),
        role,
      };

      if (role === 'admin') {
        metadata.admin_code = adminCode.trim();
      }

      const { data, error: authError } = await signUp(
        email.trim(),
        password,
        metadata
      );

      if (authError) {
        if (
          role === 'admin' &&
          /invalid administrator access code|database error saving new user/i.test(
            authError.message
          )
        ) {
          setError(
            'Could not create the administrator account. Check the administrator access code and try again.'
          );
        } else {
          setError(authError.message);
        }
      } else if (data.session) {
        router.replace('/(tabs)');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Header title="QR Attendance" />
            </View>

            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Register to start recording attendance</Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Click the link to verify your
                  account, then come back and sign in.
                </Text>
                <Link href="/login" style={styles.link}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.roleSectionLabel}>CHOOSE YOUR ROLE</Text>
                <View style={styles.roleRow}>
                  {ROLE_OPTIONS.map((option) => {
                    const selected = role === option.role;
                    return (
                      <Pressable
                        key={option.role}
                        onPress={() => {
                          setRole(option.role);
                          setError(null);
                        }}
                        style={[styles.roleOption, selected && styles.roleOptionSelected]}
                        accessibilityRole="button"
                        accessibilityLabel={`${option.label} account`}
                        accessibilityState={{ selected, disabled: loading }}
                        disabled={loading}
                      >
                        <View
                          style={[
                            styles.roleIcon,
                            selected && { backgroundColor: COLORS.primary },
                          ]}
                        >
                          <Ionicons
                            name={option.icon}
                            size={20}
                            color={selected ? '#FFFFFF' : COLORS.primary}
                          />
                        </View>
                        <Text
                          style={[
                            styles.roleOptionText,
                            selected && styles.roleOptionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.roleDescription}>{selectedRole.description}</Text>

                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.textSecondary}
                  editable={!loading}
                />

                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@school.edu"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                {role === 'admin' && (
                  <>
                    <Text style={styles.label}>Administrator access code</Text>
                    <TextInput
                      style={styles.input}
                      value={adminCode}
                      onChangeText={setAdminCode}
                      placeholder="Enter the access code from your school"
                      placeholderTextColor={COLORS.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      editable={!loading}
                    />
                    <Text style={styles.hint}>
                      Administrator sign-up is protected. Use the access code configured
                      in your Supabase project.
                    </Text>
                  </>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                {loading ? (
                  <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
                ) : (
                  <AppButton
                    theme="primary"
                    title="Sign Up"
                    icon="person-add-outline"
                    onPress={handleRegister}
                  />
                )}
              </View>
            )}

            {!success && (
              <Link href="/login" style={styles.link}>
                Already have an account? Sign In
              </Link>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
  },
  roleSectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 9,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleOption: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 13,
  },
  roleOptionSelected: {
    backgroundColor: COLORS.accentSurface,
    borderColor: COLORS.primary,
  },
  roleIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  roleOptionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 7,
  },
  roleOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  roleDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    marginTop: 10,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  error: {
    fontSize: 14,
    color: COLORS.danger,
    textAlign: 'left',
    marginTop: 12,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: COLORS.card,
    borderRadius: 10,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
});