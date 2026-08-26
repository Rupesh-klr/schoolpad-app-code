import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { Screen } from '../src/components/Glass';
import { colors } from '../src/theme/tokens';

/**
 * Root layout and the single routing rule.
 *
 * Every "where should this person be" decision is here rather than spread
 * across screens. A guard duplicated per screen is a guard that gets forgotten
 * on the one screen that mattered.
 */

function Guard() {
  const { booting, user, isAdmin, isStudent, isActive } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Do not redirect until the session restore has finished, or a cold start
    // bounces a signed-in user to /login before their token has been read.
    if (booting) return;

    const group = segments[0];
    const inAuth = group === '(auth)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    if (isAdmin) {
      if (group !== '(admin)') router.replace('/(admin)/dashboard');
      return;
    }

    // A student or parent who is not yet approved gets the gate screen and
    // nothing else. This is the server's rule too — the API refuses content
    // with ACCOUNT_PENDING — so a client bug cannot leak anything.
    if (!isActive) {
      const onGate = segments[1] === 'gate';
      if (!onGate) router.replace('/(auth)/gate');
      return;
    }

    if (isStudent && group !== '(student)') { router.replace('/(student)/home'); return; }
    if (!isStudent && group !== '(parent)' && group !== '(student)') router.replace('/(parent)/children');
  }, [booting, user, isAdmin, isStudent, isActive, segments, router]);

  if (booting) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.accentFrom} />
        </View>
      </Screen>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* The gradient is dark on every screen, so the status bar text must be
            light on both platforms regardless of the device theme. */}
        <StatusBar style="light" />
        <Screen>
          <Guard />
        </Screen>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
