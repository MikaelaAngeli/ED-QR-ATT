import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import { useTheme } from '@/lib/theme';

export default function TabLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let active = true;
    setRole(null);

    if (!user) {
      return () => {
        active = false;
      };
    }

    getProfile(user.id)
      .then((profile) => {
        if (active) setRole(profile?.role ?? null);
      })
      .catch(() => {
        if (active) setRole(null);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 5,
          paddingBottom: 5,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 1.5 },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ 
        title: 'Home', tabBarIcon: ({ color }) => 
        <Ionicons name="home-outline" 
        color={color} size={22} /> 
        }} />
      <Tabs.Screen name="scan" options={{
         title: 'Scan', tabBarIcon: ({ color }) => <Ionicons name="qr-code-outline" color={color} size={22} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({ color }) => <Ionicons name="time-outline" color={color} size={22} /> }} />
      <Tabs.Screen
        name="teacher"
        options={{
          href: role === 'teacher' ? undefined : null,
          title: 'Teacher',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'clipboard' : 'clipboard-outline'}
              color={color}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: role === 'admin' ? undefined : null,
          title: 'Admin',
          tabBarIcon: ({ color }) => (
            <Ionicons name="shield-checkmark-outline" color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-outline" color={color} size={22} /> }} />
    </Tabs>
  );
}  
