import { Redirect } from 'expo-router';

/**
 * The entry route.
 *
 * It only has to send people somewhere that exists — the guard in _layout.js
 * immediately re-routes based on role and status, so duplicating that logic
 * here would just be a second copy to keep in sync.
 */
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
