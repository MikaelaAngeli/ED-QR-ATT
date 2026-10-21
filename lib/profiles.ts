import { supabase } from './supabase';

export type Role = 'student' | 'teacher' | 'admin';
export type ThemeMode = 'light' | 'dark';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  theme_color: string | null;
  theme_mode: ThemeMode | null;
  theme_background: string | null;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, theme_color, theme_mode, theme_background')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}

export async function updateProfile(
  userId: string,
  updates: {
    full_name?: string;
    role?: Role;
    theme_color?: string;
    theme_mode?: ThemeMode;
    theme_background?: string;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  return { error: error?.message ?? null };
}
