import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

export type SignupRole = 'student' | 'teacher' | 'admin';

export async function signUp(
  email: string,
  password: string,
  metadata?: { full_name: string; role?: SignupRole; admin_code?: string }
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function verifyAdminSignupCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_admin_signup_code', {
    signup_code: code.trim(),
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      /could not find the function/i.test(error.message)
    ) {
      throw new Error(
        'Role-based sign-up is not enabled yet. Run supabase/admin-setup.sql in Supabase first.'
      );
    }
    throw error;
  }

  return data === true;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (!error) {
    setAuth(null);
  }

  return { error };
}
