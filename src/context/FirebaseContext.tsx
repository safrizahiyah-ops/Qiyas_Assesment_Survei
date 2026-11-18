import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  testConnection,
} from '../lib/firebase';
import type { LiveSession } from '../types/survey';

const ACTIVE_CODE_STORAGE_KEY = 'qiyas_active_code';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  isConnected: boolean;
  authLoading: boolean;
  authError: string | null;
  activeSessionCode: string;
  setActiveSessionCode: (code: string) => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  isConnected: false,
  authLoading: false,
  authError: null,
  activeSessionCode: '',
  setActiveSessionCode: () => {},
  signInWithGoogle: async () => {},
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

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
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorage);

    return () => {
      mounted = false;
      unsubscribe();
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

  const signInWithGoogle = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Gagal masuk dengan akun Google.';
      if (message.includes('popup-closed-by-user')) {
        setAuthError('Jendela login Google ditutup sebelum selesai.');
      } else if (message.includes('popup-blocked')) {
        setAuthError('Popup login diblokir oleh browser. Izinkan popup lalu coba lagi.');
      } else {
        setAuthError('Tidak dapat masuk dengan Google. Periksa koneksi Anda dan coba lagi.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    await signOut(auth);
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
        signInWithGoogle,
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
