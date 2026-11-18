import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  testConnection,
} from '../lib/firebase';
import type { LiveSession } from '../types/survey';

const ACTIVE_CODE_STORAGE_KEY = 'qiyas_active_code';
const ADMIN_SESSION_STORAGE_KEY = 'qiyas_admin_session';

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
}

export const ADMIN_ACCOUNT: AdminUser = {
  uid: 'admin_qiyas',
  email: 'admin@qiyas.id',
  displayName: 'Admin Qiyas',
};

export const ADMIN_CREDENTIALS = {
  username: 'admin',
  email: 'admin@qiyas.id',
  password: 'QiyasAdmin#2026',
};

interface FirebaseContextValue {
  user: AdminUser | null;
  authReady: boolean;
  isConnected: boolean;
  authLoading: boolean;
  authError: string | null;
  activeSessionCode: string;
  setActiveSessionCode: (code: string) => void;
  signInWithAdmin: (username: string, password: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: true,
  isConnected: false,
  authLoading: false,
  authError: null,
  activeSessionCode: '',
  setActiveSessionCode: () => {},
  signInWithAdmin: async () => false,
  signOutUser: async () => {},
  clearAuthError: () => {},
});

function getTimeMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) === '1'
      ? ADMIN_ACCOUNT
      : null;
  });
  const authReady = true;
  const [isConnected, setIsConnected] = useState(isFirebaseConfigured && navigator.onLine);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeSessionCode, setActiveSessionCodeState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem(ACTIVE_CODE_STORAGE_KEY) || '';
    return /^[0-9]{6}$/.test(stored) ? stored : '';
  });

  const setActiveSessionCode = useCallback((code: string) => {
    const clean = code.replace(/\D/g, '').slice(0, 6);
    setActiveSessionCodeState(clean);
    if (typeof window !== 'undefined') {
      if (clean.length === 6) {
        localStorage.setItem(ACTIVE_CODE_STORAGE_KEY, clean);
      } else {
        localStorage.removeItem(ACTIVE_CODE_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      if (!isFirebaseConfigured || !navigator.onLine) {
        if (mounted) setIsConnected(false);
        return;
      }
      const ok = await testConnection();
      if (mounted) setIsConnected(ok);
    };
    check();

    const handleOnline = () => {
      check();
    };
    const handleOffline = () => {
      setIsConnected(false);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_CODE_STORAGE_KEY) {
        const next = e.newValue || '';
        setActiveSessionCodeState(/^[0-9]{6}$/.test(next) ? next : '');
      } else if (e.key === ADMIN_SESSION_STORAGE_KEY) {
        setUser(e.newValue === '1' ? ADMIN_ACCOUNT : null);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorage);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Automatically sync activeSessionCode with signed-in facilitator's latest open session
  useEffect(() => {
    if (!authReady || !user) return;

    const q = query(collection(db, 'sessions'), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setActiveSessionCodeState('');
          if (typeof window !== 'undefined') {
            localStorage.removeItem(ACTIVE_CODE_STORAGE_KEY);
          }
          return;
        }
        const list: LiveSession[] = snap.docs
          .map((d) => ({
            code: d.id,
            ...(d.data() as Omit<LiveSession, 'code'>),
          }))
          .sort(
            (a, b) =>
              getTimeMillis(b.updatedAt || b.createdAt) -
              getTimeMillis(a.updatedAt || a.createdAt)
          );

        const openSession = list.find(
          (s) => s.status === 'aktif' || s.status === 'menunggu'
        );
        const preferred = openSession || list[0];
        if (!preferred) return;

        setActiveSessionCodeState((current) => {
          const stillExists = list.some((s) => s.code === current);
          if (current && stillExists) return current;
          if (typeof window !== 'undefined') {
            localStorage.setItem(ACTIVE_CODE_STORAGE_KEY, preferred.code);
          }
          return preferred.code;
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'sessions');
      }
    );

    return () => unsub();
  }, [authReady, user]);

  const signInWithAdmin = async (
    username: string,
    password: string
  ): Promise<boolean> => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const normalizedUser = username.trim().toLowerCase();
      const isValidUser =
        normalizedUser === ADMIN_CREDENTIALS.username ||
        normalizedUser === ADMIN_CREDENTIALS.email;
      const isValidPass = password === ADMIN_CREDENTIALS.password;

      if (!isValidUser || !isValidPass) {
        setAuthError(
          'Username atau kata sandi admin tidak sesuai. Periksa kembali kredensial Anda.'
        );
        return false;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, '1');
      }
      setUser(ADMIN_ACCOUNT);
      return true;
    } finally {
      setAuthLoading(false);
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    }
    setUser(null);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        isConnected,
        authLoading,
        authError,
        activeSessionCode,
        setActiveSessionCode,
        signInWithAdmin,
        signOutUser,
        clearAuthError,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}
