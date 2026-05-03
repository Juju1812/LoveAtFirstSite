import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { type User, getToken, setToken, fetchMe, login as apiLogin, signup as apiSignup, saveProfileToServer } from './api';
import { type Profile, loadProfile as loadLocalProfile, saveProfile as saveLocalProfile } from './profile';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setProfile: (p: Profile) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(() => loadLocalProfile());
  const [loading, setLoading] = useState(!!getToken());
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  // Hydrate from server if we have a token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMe()
      .then(({ user, profile }) => {
        if (cancelled) return;
        setUser(user);
        if (profile) setProfileState(profile);
      })
      .catch(() => {
        // Token bad — clear it
        setToken(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const { token, user } = await apiSignup(email, password);
    setToken(token);
    setUser(user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await apiLogin(email, password);
    setToken(token);
    setUser(user);
    // Pull server profile after login (overrides local)
    try {
      const { profile } = await fetchMe();
      if (profile) setProfileState(profile);
    } catch { /* ignore */ }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    // Keep localStorage profile around for guest mode
  }, []);

  const setProfile = useCallback(async (p: Profile) => {
    setProfileState(p);
    // Always cache to localStorage so the profile survives logged-out visits
    saveLocalProfile(p);
    // If signed in, persist to server too
    if (userRef.current) {
      try { await saveProfileToServer(p); }
      catch (err) { console.warn('Failed to save profile to server', err); }
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const { user, profile } = await fetchMe();
      setUser(user);
      if (profile) setProfileState(profile);
    } catch { /* noop */ }
  }, []);

  return (
    <Ctx.Provider value={{ user, profile, loading, signup, login, logout, setProfile, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside <AuthProvider>');
  return ctx;
}
