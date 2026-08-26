import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokens } from '../api/client';

/**
 * Session state for the whole app.
 *
 * One source of truth for "who is signed in and what may they see". Screens ask
 * this rather than reading tokens, so the routing rules in app/_layout.js are
 * the only place that decides where someone lands.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [constants, setConstants] = useState(null);
  // Distinct from `!user`: on a cold start we do not yet know whether there is
  // a session. Treating "unknown" as "signed out" flashes the login screen for
  // a moment on every launch.
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      // Constants first and independently — the login screen needs the OTP
      // length even when nobody is signed in, and a failure here must not stop
      // the session restore below.
      api.meta.constants()
        .then(setConstants)
        .catch(() => setConstants(null));

      const { access } = await tokens.get();
      if (!access) { setBooting(false); return; }

      try {
        const { user: me } = await api.auth.me();
        setUser(me);
      } catch {
        // Expired or revoked. The client already tried to refresh; if that
        // failed there is nothing to recover.
        await tokens.clear();
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const adoptSession = useCallback(async (payload) => {
    await tokens.save(payload);
    setUser(payload.user);
    return payload.user;
  }, []);

  const signInAdmin = useCallback(async (email, password) => {
    return adoptSession(await api.auth.adminLogin(email, password));
  }, [adoptSession]);

  const verifyOtp = useCallback(async (identifier, code) => {
    const result = await api.auth.verifyOtp(identifier, code);
    // Two shapes come back: an existing user gets a session, a new one gets a
    // registration token. The caller routes on `registered`.
    if (result.registered) await adoptSession(result);
    return result;
  }, [adoptSession]);

  const register = useCallback(async (payload) => {
    return adoptSession(await api.auth.register(payload));
  }, [adoptSession]);

  /**
   * Redeem an access code.
   *
   * The server returns a fresh access token because the old one still says
   * `status: pending` — without swapping it the app would keep showing the
   * waiting screen until the token happened to expire.
   */
  const redeemCode = useCallback(async (code) => {
    const result = await api.auth.redeemCode(code);
    await tokens.save({ accessToken: result.accessToken });
    setUser(result.user);
    return result;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await api.auth.me();
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { refresh } = await tokens.get();
    // Best effort: a failed logout call must still clear the device, or the
    // user stays signed in on a phone they are trying to hand back.
    await api.auth.logout(refresh).catch(() => {});
    await tokens.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    constants,
    booting,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isStudent: user?.role === 'student',
    isParent: user?.role === 'parent',
    isActive: user?.status === 'active',
    signInAdmin,
    verifyOtp,
    register,
    redeemCode,
    refreshUser,
    signOut,
  }), [user, constants, booting, signInAdmin, verifyOtp, register, redeemCode, refreshUser, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
