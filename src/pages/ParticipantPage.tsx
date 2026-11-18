import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Delete,
  Loader2,
  WifiOff,
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DEMO_RESPONSES,
  DEMO_SESSION,
  formatIdDecimal,
  formatSessionCode,
  getScaleEdgeLabels,
  QUESTION_TYPE_LABELS,
} from '../lib/templates';
import { ChoiceBarChart, ScaleBarChart } from '../components/BarChart';
import { WordCloud } from '../components/WordCloud';
import type { LiveSession, Question, SurveyResponse } from '../types/survey';

type Step = 'loading' | 'invalid' | 'code' | 'welcome' | 'answer';

interface PendingSubmission {
  pid: string;
  name: string;
  questionId: string;
  value: number | string | string[];
}

function getOrCreatePid(code: string): string {
  const key = `qiyas_pid_${code}`;
  const existing = localStorage.getItem(key);
  if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
    return existing;
  }
  const randomUuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const pid = `p_${randomUuid}`;
  localStorage.setItem(key, pid);
  return pid;
}

function loadSavedAnswers(code: string): Record<string, number | string | string[]> {
  try {
    const raw = localStorage.getItem(`qiyas_answers_${code}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalAnswer(
  code: string,
  questionId: string,
  value: number | string | string[]
) {
  const current = loadSavedAnswers(code);
  current[questionId] = value;
  localStorage.setItem(`qiyas_answers_${code}`, JSON.stringify(current));
}

function loadPendingQueue(code: string): Record<string, PendingSubmission> {
  try {
    const raw = localStorage.getItem(`qiyas_pending_${code}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function savePendingQueue(code: string, queue: Record<string, PendingSubmission>) {
  if (Object.keys(queue).length === 0) {
    localStorage.removeItem(`qiyas_pending_${code}`);
  } else {
    localStorage.setItem(`qiyas_pending_${code}`, JSON.stringify(queue));
  }
}

function answersEqual(
  a: number | string | string[] | undefined,
  b: number | string | string[] | undefined
): boolean {
  if (a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

export function ParticipantPage() {
  const { setActiveSessionCode } = useFirebase();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialParamCode = (searchParams.get('kode') || '')
    .replace(/\D/g, '')
    .slice(0, 6);

  const [step, setStep] = useState<Step>(
    initialParamCode.length === 6 ? 'loading' : 'code'
  );
  const [codeInput, setCodeInput] = useState<string>(initialParamCode);
  const [activeCode, setActiveCode] = useState<string>('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [session, setSession] = useState<LiveSession | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState('Anonim');

  const [savedAnswers, setSavedAnswers] = useState<
    Record<string, number | string | string[]>
  >({});
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Input states per question type
  const [selectedScale, setSelectedScale] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string>('');
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [wordInputs, setWordInputs] = useState<[string, string, string]>(['', '', '']);
  const [textAnswer, setTextAnswer] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [liveResponses, setLiveResponses] = useState<SurveyResponse[]>([]);

  const [demoQuestionIdx, setDemoQuestionIdx] = useState(0);

  const flushPendingQueue = useCallback(
    async (code: string) => {
      if (!code || isDemoMode || !navigator.onLine) return;
      const queue = loadPendingQueue(code);
      const entries = Object.entries(queue);
      if (entries.length === 0) {
        setPendingCount(0);
        return;
      }

      const remaining = { ...queue };
      for (const [qId, item] of entries) {
        try {
          const responseId = `${item.pid}_${item.questionId}`;
          await setDoc(doc(db, 'sessions', code, 'responses', responseId), {
            pid: item.pid,
            name: item.name,
            questionId: item.questionId,
            value: item.value,
            updatedAt: serverTimestamp(),
          });
          delete remaining[qId];
        } catch {
          // Keep remaining item for next retry
        }
      }
      savePendingQueue(code, remaining);
      setPendingCount(Object.keys(remaining).length);
    },
    [isDemoMode]
  );

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (activeCode) flushPendingQueue(activeCode);
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [activeCode, flushPendingQueue]);

  const validateAndLoadSession = async (rawCode: string, fromUrl: boolean) => {
    const clean = rawCode.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setCodeError('Masukkan tepat 6 digit kode sesi.');
      if (fromUrl) setStep('invalid');
      return;
    }

    setValidatingCode(true);
    setCodeError(null);
    if (fromUrl) setStep('loading');

    try {
      const snap = await getDoc(doc(db, 'sessions', clean));
      if (!snap.exists()) {
        if (clean === '482913') {
          setIsDemoMode(true);
          setActiveCode(clean);
          setSession(DEMO_SESSION);
          setLiveResponses(DEMO_RESPONSES);
          setSavedAnswers(loadSavedAnswers(clean));
          const alreadyJoined = localStorage.getItem(`qiyas_joined_${clean}`);
          const savedName = localStorage.getItem(`qiyas_name_${clean}`);
          if (alreadyJoined === '1' && savedName) {
            setParticipantName(savedName);
            setStep('answer');
          } else {
            setStep('welcome');
          }
          return;
        }

        if (fromUrl) {
          setStep('invalid');
        } else {
          setCodeError(
            'Sesi tidak ditemukan atau sudah ditutup. Periksa kembali kode dari fasilitator.'
          );
        }
        return;
      }

      const data = snap.data() as Omit<LiveSession, 'code'>;
      if (data.status === 'ditutup' || data.status === 'selesai') {
        if (fromUrl) {
          setStep('invalid');
        } else {
          setCodeError('Sesi ini sudah ditutup oleh fasilitator.');
        }
        return;
      }

      setIsDemoMode(false);
      setActiveCode(clean);
      setActiveSessionCode(clean);
      setSession({ code: clean, ...data });
      setSavedAnswers(loadSavedAnswers(clean));
      setPendingCount(Object.keys(loadPendingQueue(clean)).length);
      setSearchParams({ kode: clean }, { replace: true });

      const existingPid = localStorage.getItem(`qiyas_pid_${clean}`);
      const alreadyJoined = localStorage.getItem(`qiyas_joined_${clean}`);
      const savedName = localStorage.getItem(`qiyas_name_${clean}`);
      if (existingPid && alreadyJoined === '1' && savedName) {
        setParticipantName(savedName);
        setStep('answer');
      } else {
        setStep('welcome');
      }
    } catch {
      if (fromUrl) {
        setStep('invalid');
      } else {
        setCodeError('Gagal memeriksa kode sesi. Periksa koneksi internet Anda.');
      }
    } finally {
      setValidatingCode(false);
    }
  };

  const urlKodeParam = searchParams.get('kode') || '';
  useEffect(() => {
    const cleanParam = urlKodeParam.replace(/\D/g, '').slice(0, 6);
    if (cleanParam.length === 6) {
      if (cleanParam !== activeCode) {
        setCodeInput(cleanParam);
        validateAndLoadSession(cleanParam, true);
      }
    } else if (urlKodeParam) {
      setStep('invalid');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKodeParam]);

  // Realtime session listener
  useEffect(() => {
    if (!activeCode || isDemoMode || (step !== 'welcome' && step !== 'answer')) {
      return;
    }

    const path = `sessions/${activeCode}`;
    const unsub = onSnapshot(
      doc(db, 'sessions', activeCode),
      (snap) => {
        if (!snap.exists()) {
          setSession(null);
          setStep('invalid');
          return;
        }
        const data = snap.data() as Omit<LiveSession, 'code'>;
        setSession({ code: activeCode, ...data });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => unsub();
  }, [activeCode, isDemoMode, step]);

  // Realtime responses listener (only active when showResults !== false on answer step)
  useEffect(() => {
    if (
      !activeCode ||
      isDemoMode ||
      step !== 'answer' ||
      !session ||
      session.showResults === false
    ) {
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'sessions', activeCode, 'responses'),
      (snap) => {
        setLiveResponses(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SurveyResponse, 'id'>),
          }))
        );
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(
            err,
            OperationType.LIST,
            `sessions/${activeCode}/responses`
          );
        }
      }
    );

    return () => unsub();
  }, [activeCode, isDemoMode, step, session?.showResults]);

  const currentQuestion: Question | null = useMemo(() => {
    if (!session || session.questions.length === 0) return null;
    if (isDemoMode) {
      return session.questions[demoQuestionIdx] ?? session.questions[0];
    }
    if (!session.activeQuestionId || session.activeQuestionId === 'ALL') {
      return session.questions[0];
    }
    return (
      session.questions.find((q) => q.id === session.activeQuestionId) ??
      session.questions[0]
    );
  }, [session, isDemoMode, demoQuestionIdx]);

  const currentQuestionIndex = useMemo(() => {
    if (!session || !currentQuestion) return 0;
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id);
    return idx >= 0 ? idx : 0;
  }, [session, currentQuestion]);

  // Restore saved answer when active question switches
  useEffect(() => {
    if (!currentQuestion) return;
    const saved = savedAnswers[currentQuestion.id];
    setSubmitError(null);

    if (currentQuestion.type === 'scale' || currentQuestion.type === 'scale10') {
      setSelectedScale(typeof saved === 'number' ? saved : null);
      setSelectedChoice('');
      setSelectedMulti([]);
      setWordInputs(['', '', '']);
      setTextAnswer('');
    } else if (
      currentQuestion.type === 'choice' ||
      currentQuestion.type === 'yesno'
    ) {
      setSelectedChoice(typeof saved === 'string' ? saved : '');
      setSelectedScale(null);
      setSelectedMulti([]);
      setWordInputs(['', '', '']);
      setTextAnswer('');
    } else if (currentQuestion.type === 'multichoice') {
      setSelectedMulti(Array.isArray(saved) ? saved : []);
      setSelectedScale(null);
      setSelectedChoice('');
      setWordInputs(['', '', '']);
      setTextAnswer('');
    } else if (currentQuestion.type === 'wordcloud') {
      const arr = Array.isArray(saved)
        ? saved
        : typeof saved === 'string' && saved
        ? [saved]
        : [];
      setWordInputs([arr[0] || '', arr[1] || '', arr[2] || '']);
      setSelectedScale(null);
      setSelectedChoice('');
      setSelectedMulti([]);
      setTextAnswer('');
    } else {
      setTextAnswer(typeof saved === 'string' ? saved : '');
      setSelectedScale(null);
      setSelectedChoice('');
      setSelectedMulti([]);
      setWordInputs(['', '', '']);
    }
  }, [currentQuestion?.id]);

  const currentDraftValue: number | string | string[] | undefined = useMemo(() => {
    if (!currentQuestion) return undefined;
    if (currentQuestion.type === 'scale' || currentQuestion.type === 'scale10') {
      return selectedScale ?? undefined;
    }
    if (
      currentQuestion.type === 'choice' ||
      currentQuestion.type === 'yesno'
    ) {
      return selectedChoice || undefined;
    }
    if (currentQuestion.type === 'multichoice') {
      return selectedMulti.length > 0 ? selectedMulti : undefined;
    }
    if (currentQuestion.type === 'wordcloud') {
      const words = wordInputs.map((w) => w.trim().slice(0, 30)).filter(Boolean);
      return words.length > 0 ? words : undefined;
    }
    const txt = textAnswer.trim().slice(0, 200);
    return txt || undefined;
  }, [
    currentQuestion,
    selectedScale,
    selectedChoice,
    selectedMulti,
    wordInputs,
    textAnswer,
  ]);

  const previousSubmittedValue = currentQuestion
    ? savedAnswers[currentQuestion.id]
    : undefined;
  const hasSubmittedCurrent = previousSubmittedValue !== undefined;
  const isUnchangedSinceSubmit =
    hasSubmittedCurrent && answersEqual(currentDraftValue, previousSubmittedValue);

  const handleStartAnswering = async () => {
    if (!session) return;
    const trimmed = nameInput.trim().slice(0, 40);
    if (!trimmed && !session.allowAnonymous) {
      setJoinError('Nama wajib diisi untuk sesi ini.');
      return;
    }

    const finalName = trimmed || 'Anonim';
    const pid = getOrCreatePid(session.code);

    setJoining(true);
    setJoinError(null);

    try {
      if (!isDemoMode && localStorage.getItem(`qiyas_joined_${session.code}`) !== '1') {
        const path = `sessions/${session.code}/participants/${pid}`;
        try {
          await setDoc(doc(db, 'sessions', session.code, 'participants', pid), {
            name: finalName,
            joinedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }

      localStorage.setItem(`qiyas_joined_${session.code}`, '1');
      localStorage.setItem(`qiyas_name_${session.code}`, finalName);
      setParticipantName(finalName);
      setStep('answer');
    } catch {
      setJoinError('Gagal bergabung ke sesi. Silakan coba lagi.');
    } finally {
      setJoining(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!session || !currentQuestion || currentDraftValue === undefined) return;
    if (isUnchangedSinceSubmit) return;

    setSubmitting(true);
    setSubmitError(null);
    const pid = getOrCreatePid(session.code);

    try {
      saveLocalAnswer(session.code, currentQuestion.id, currentDraftValue);
      setSavedAnswers(loadSavedAnswers(session.code));

      if (!isDemoMode) {
        const submission: PendingSubmission = {
          pid,
          name: participantName || 'Anonim',
          questionId: currentQuestion.id,
          value: currentDraftValue,
        };

        if (!navigator.onLine) {
          const q = loadPendingQueue(session.code);
          q[currentQuestion.id] = submission;
          savePendingQueue(session.code, q);
          setPendingCount(Object.keys(q).length);
        } else {
          const responseId = `${pid}_${currentQuestion.id}`;
          const path = `sessions/${session.code}/responses/${responseId}`;
          try {
            await setDoc(doc(db, 'sessions', session.code, 'responses', responseId), {
              pid,
              name: participantName || 'Anonim',
              questionId: currentQuestion.id,
              value: currentDraftValue,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            if (!navigator.onLine) {
              const q = loadPendingQueue(session.code);
              q[currentQuestion.id] = submission;
              savePendingQueue(session.code, q);
              setPendingCount(Object.keys(q).length);
            } else {
              handleFirestoreError(err, OperationType.WRITE, path);
            }
          }
        }
      } else {
        setLiveResponses((prev) => {
          const filtered = prev.filter(
            (r) => !(r.pid === pid && r.questionId === currentQuestion.id)
          );
          return [
            ...filtered,
            {
              id: `${pid}_${currentQuestion.id}`,
              pid,
              name: participantName || 'Anonim',
              questionId: currentQuestion.id,
              value: currentDraftValue,
            },
          ];
        });
      }
    } catch {
      setSubmitError('Jawaban gagal dikirim. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchToManualCode = () => {
    setStep('code');
    setActiveCode('');
    setSession(null);
    setIsDemoMode(false);
    setCodeInput('');
    setCodeError(null);
    setSearchParams({}, { replace: true });
  };

  const isSessionClosed =
    Boolean(session) &&
    (session!.status === 'ditutup' || session!.status === 'selesai');

  const activeQuestionResults = useMemo(() => {
    if (!currentQuestion) return [];
    return liveResponses.filter((r) => r.questionId === currentQuestion.id);
  }, [liveResponses, currentQuestion]);

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-3 sm:px-4 py-6 sm:py-10">
      {/* LOADING URL VALIDATION */}
      {step === 'loading' && (
        <div className="w-full max-w-[340px] bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-7 text-center space-y-3 shadow-2xl shadow-black/40">
          <Loader2 className="w-8 h-8 text-[var(--toska)] animate-spin mx-auto" />
          <p className="text-sm text-[var(--text-muted)]">
            Memeriksa kode sesi...
          </p>
        </div>
      )}

      {/* INVALID OR CLOSED LINK */}
      {step === 'invalid' && (
        <div className="w-full max-w-[340px] bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-7 text-center space-y-4 shadow-2xl shadow-black/40">
          <div className="w-12 h-12 rounded-2xl bg-[#f87171]/15 border border-[#f87171]/35 flex items-center justify-center mx-auto text-[#f87171]">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold text-[var(--text)]">
            Tautan Tidak Berlaku
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Sesi tidak ditemukan atau sudah ditutup. Periksa kembali tautan dari
            fasilitator.
          </p>
          <button
            type="button"
            onClick={handleSwitchToManualCode}
            className="w-full min-h-[46px] rounded-2xl gradient-cta-bg hover:brightness-110 font-bold text-sm transition-all cursor-pointer"
          >
            Masukkan kode manual
          </button>
        </div>
      )}

      {/* MANUAL 6-DIGIT CODE INPUT */}
      {step === 'code' && (
        <div className="w-full max-w-[360px] bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 shadow-2xl shadow-black/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toska)] mb-1.5">
            GABUNG SESI PESERTA
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[var(--text)] mb-1.5">
            Masukkan kode 6 digit
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mb-5">
            Lihat kode sesi dari fasilitator, tanpa perlu membuat akun.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              validateAndLoadSession(codeInput, false);
            }}
            className="space-y-4"
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={codeInput}
              onChange={(e) => {
                setCodeError(null);
                setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6));
              }}
              placeholder="000000"
              aria-label="Kode sesi 6 digit"
              className="w-full h-14 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:ring-3 focus:ring-[#2dd4bf]/20 focus:outline-none text-center font-mono text-3xl font-bold tracking-[0.3em] text-[var(--toska-soft)] placeholder:text-[var(--text-muted)]/30 tabular-nums transition-all"
            />

            {codeError && (
              <div
                role="alert"
                className="rounded-xl bg-[#f87171]/15 border border-[#f87171]/40 px-3.5 py-2.5 text-xs text-[#f87171]"
              >
                {codeError}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setCodeError(null);
                    setCodeInput((p) => (p.length < 6 ? p + d : p));
                  }}
                  className="min-h-[48px] rounded-2xl bg-[var(--surface-2)] hover:border-[var(--toska)] active:scale-[0.97] border border-[var(--border)] font-mono text-lg font-bold text-[var(--text)] transition-all cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCodeError(null);
                  setCodeInput('');
                }}
                className="min-h-[48px] rounded-2xl bg-[var(--surface)] hover:border-[var(--toska)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] cursor-pointer"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeError(null);
                  setCodeInput((p) => (p.length < 6 ? p + '0' : p));
                }}
                className="min-h-[48px] rounded-2xl bg-[var(--surface-2)] hover:border-[var(--toska)] active:scale-[0.97] border border-[var(--border)] font-mono text-lg font-bold text-[var(--text)] transition-all cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeError(null);
                  setCodeInput((p) => p.slice(0, -1));
                }}
                aria-label="Hapus satu digit"
                className="min-h-[48px] rounded-2xl bg-[var(--surface)] hover:border-[var(--toska)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button
              type="submit"
              disabled={validatingCode || codeInput.length < 6}
              className="w-full min-h-[48px] rounded-2xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {validatingCode ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memeriksa sesi...</span>
                </>
              ) : (
                <span>Masuk ke Sesi</span>
              )}
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Coba tanpa sesi?</span>
            <button
              type="button"
              onClick={() => {
                setCodeInput('482913');
                validateAndLoadSession('482913', false);
              }}
              className="font-semibold text-[var(--toska-soft)] hover:text-[var(--daun)] underline underline-offset-4 cursor-pointer"
            >
              Kode Demo (482 913)
            </button>
          </div>
        </div>
      )}

      {/* BAGIAN 2: HALAMAN SAMBUTAN PESERTA */}
      {step === 'welcome' && session && (
        <div className="w-full max-w-[340px] bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 shadow-2xl shadow-black/40 space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--toska)]">
              {session.surveyTitle}
            </p>
            <h1 className="font-display text-2xl font-extrabold text-[var(--text)]">
              Selamat datang
            </h1>
            {session.eventInfo && (
              <p className="text-xs text-[var(--text-muted)]">
                {session.eventInfo}
              </p>
            )}
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border-strong)] font-mono text-xs font-bold text-[var(--toska-soft)] tabular-nums">
              Sesi {formatSessionCode(session.code)}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="welcome-name"
                className="block text-xs font-semibold text-[var(--text)] mb-1.5"
              >
                {session.allowAnonymous ? 'Nama (opsional)' : 'Nama (wajib)'}
              </label>
              <input
                id="welcome-name"
                type="text"
                maxLength={40}
                autoFocus
                value={nameInput}
                onChange={(e) => {
                  setJoinError(null);
                  setNameInput(e.target.value.slice(0, 40));
                }}
                placeholder="Contoh: Budi"
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:ring-3 focus:ring-[#2dd4bf]/20 focus:outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50 transition-all"
              />
            </div>

            {joinError && (
              <div className="rounded-xl bg-[#f87171]/15 border border-[#f87171]/40 px-3 py-2 text-xs text-[#f87171]">
                {joinError}
              </div>
            )}

            <button
              type="button"
              disabled={joining}
              onClick={handleStartAnswering}
              className="w-full min-h-[48px] rounded-2xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memulai...</span>
                </>
              ) : (
                <span>Mulai menjawab</span>
              )}
            </button>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed text-center">
              {session.allowAnonymous
                ? 'Nama boleh dikosongkan, jawaban Anda akan tercatat sebagai Anonim.'
                : 'Masukkan nama Anda sebelum menjawab pertanyaan.'}
            </p>
          </div>
        </div>
      )}

      {/* BAGIAN 3: HALAMAN JAWABAN PESERTA */}
      {step === 'answer' && session && (
        <div className="w-full max-w-[330px] bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-5 shadow-2xl shadow-black/40 space-y-5">
          {isSessionClosed ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-strong)] flex items-center justify-center mx-auto text-[var(--daun)]">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="font-display text-lg font-bold text-[var(--text)] leading-snug">
                Sesi ditutup. Terima kasih sudah berpartisipasi.
              </p>
              <button
                type="button"
                onClick={handleSwitchToManualCode}
                className="w-full min-h-[44px] rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-xs font-semibold text-[var(--text)] cursor-pointer"
              >
                Masukkan kode sesi lain
              </button>
            </div>
          ) : !currentQuestion ? (
            <div className="text-center py-8 space-y-2">
              <p className="font-display text-lg font-bold text-[var(--text)]">
                Menunggu pertanyaan
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Layar akan otomatis diperbarui saat fasilitator menampilkan pertanyaan.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuestion.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Top row: PERTANYAAN X DARI Y + sync state */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--toska)] tabular-nums">
                    PERTANYAAN {currentQuestionIndex + 1} DARI{' '}
                    {session.questions.length}
                  </span>
                  {(!isOnline || pendingCount > 0) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#facc15]">
                      <WifiOff className="w-3 h-3" />
                      <span>Menunggu koneksi</span>
                    </span>
                  )}
                </div>

                {/* Question text */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {QUESTION_TYPE_LABELS[currentQuestion.type]}
                  </span>
                  <h2 className="font-display text-lg font-bold text-[var(--text)] leading-snug">
                    {currentQuestion.text}
                  </h2>
                </div>

                {/* 1. Skala Likert 1-5 */}
                {currentQuestion.type === 'scale' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((num) => {
                        const active = selectedScale === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              setSubmitError(null);
                              setSelectedScale(num);
                            }}
                            style={
                              active
                                ? {
                                    borderColor: 'var(--toska)',
                                    backgroundColor: 'rgba(45, 212, 191, 0.22)',
                                  }
                                : undefined
                            }
                            className={`min-h-[48px] rounded-xl border font-mono text-base font-bold transition-all cursor-pointer ${
                              active
                                ? 'text-[var(--toska-soft)] shadow-sm'
                                : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--toska)] text-[var(--text)]'
                            }`}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-start justify-between gap-2 text-[11px] text-[var(--text-muted)] leading-tight">
                      <span>{getScaleEdgeLabels(currentQuestion).minLabel}</span>
                      <span className="text-right">
                        {getScaleEdgeLabels(currentQuestion).maxLabel}
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. Skala 1-10 */}
                {currentQuestion.type === 'scale10' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                        const active = selectedScale === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              setSubmitError(null);
                              setSelectedScale(num);
                            }}
                            style={
                              active
                                ? {
                                    borderColor: 'var(--toska)',
                                    backgroundColor: 'rgba(45, 212, 191, 0.22)',
                                  }
                                : undefined
                            }
                            className={`min-h-[44px] rounded-xl border font-mono text-sm font-bold transition-all cursor-pointer ${
                              active
                                ? 'text-[var(--toska-soft)]'
                                : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--toska)] text-[var(--text)]'
                            }`}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-start justify-between gap-2 text-[11px] text-[var(--text-muted)] leading-tight">
                      <span>1 = {getScaleEdgeLabels(currentQuestion).minLabel}</span>
                      <span className="text-right">
                        10 = {getScaleEdgeLabels(currentQuestion).maxLabel}
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. Pilihan Ganda */}
                {currentQuestion.type === 'choice' && (
                  <div className="space-y-2">
                    {currentQuestion.options.map((opt, idx) => {
                      const active = selectedChoice === opt;
                      return (
                        <button
                          key={`${idx}-${opt}`}
                          type="button"
                          onClick={() => {
                            setSubmitError(null);
                            setSelectedChoice(opt);
                          }}
                          style={
                            active
                              ? {
                                  borderColor: 'var(--toska)',
                                  backgroundColor: 'rgba(45, 212, 191, 0.16)',
                                }
                              : undefined
                          }
                          className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left text-xs sm:text-sm font-medium flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                            active
                              ? 'text-[var(--toska-soft)]'
                              : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--toska)] text-[var(--text)]'
                          }`}
                        >
                          <span className="leading-snug">{opt}</span>
                          <span
                            className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              active
                                ? 'border-[var(--toska)]'
                                : 'border-[var(--border-strong)]'
                            }`}
                          >
                            {active && (
                              <span className="w-2 h-2 rounded-full bg-[var(--toska)]" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 4. Banyak Pilihan */}
                {currentQuestion.type === 'multichoice' && (
                  <div className="space-y-2">
                    {currentQuestion.options.map((opt, idx) => {
                      const active = selectedMulti.includes(opt);
                      return (
                        <button
                          key={`${idx}-${opt}`}
                          type="button"
                          onClick={() => {
                            setSubmitError(null);
                            setSelectedMulti((prev) =>
                              prev.includes(opt)
                                ? prev.filter((item) => item !== opt)
                                : [...prev, opt]
                            );
                          }}
                          style={
                            active
                              ? {
                                  borderColor: 'var(--toska)',
                                  backgroundColor: 'rgba(45, 212, 191, 0.16)',
                                }
                              : undefined
                          }
                          className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left text-xs sm:text-sm font-medium flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                            active
                              ? 'text-[var(--toska-soft)]'
                              : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--toska)] text-[var(--text)]'
                          }`}
                        >
                          <span className="leading-snug">{opt}</span>
                          <span
                            className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                              active
                                ? 'bg-[var(--toska)] border-[var(--toska)] text-[var(--text-on-accent)]'
                                : 'border-[var(--border-strong)]'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 5. Ya / Tidak */}
                {currentQuestion.type === 'yesno' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {(currentQuestion.options.length >= 2
                      ? currentQuestion.options.slice(0, 2)
                      : ['Ya', 'Tidak']
                    ).map((opt) => {
                      const active = selectedChoice === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setSubmitError(null);
                            setSelectedChoice(opt);
                          }}
                          style={
                            active
                              ? {
                                  borderColor: 'var(--toska)',
                                  backgroundColor: 'rgba(45, 212, 191, 0.2)',
                                }
                              : undefined
                          }
                          className={`min-h-[56px] rounded-2xl border font-display text-base font-bold transition-all cursor-pointer ${
                            active
                              ? 'text-[var(--toska-soft)]'
                              : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--toska)] text-[var(--text)]'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 6. Word Cloud (hingga 3 kata) */}
                {currentQuestion.type === 'wordcloud' && (
                  <div className="space-y-2">
                    {[0, 1, 2].map((wIdx) => (
                      <input
                        key={wIdx}
                        type="text"
                        maxLength={30}
                        value={wordInputs[wIdx]}
                        onChange={(e) => {
                          setSubmitError(null);
                          const next: [string, string, string] = [...wordInputs] as [
                            string,
                            string,
                            string,
                          ];
                          next[wIdx] = e.target.value.slice(0, 30);
                          setWordInputs(next);
                        }}
                        placeholder={
                          wIdx === 0
                            ? 'Kata 1 (wajib)'
                            : `Kata ${wIdx + 1} (opsional)`
                        }
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50"
                      />
                    ))}
                  </div>
                )}

                {/* 7. Teks Bebas */}
                {currentQuestion.type === 'text' && (
                  <div className="space-y-1.5">
                    <textarea
                      rows={3}
                      maxLength={200}
                      value={textAnswer}
                      onChange={(e) => {
                        setSubmitError(null);
                        setTextAnswer(e.target.value.slice(0, 200));
                      }}
                      placeholder="Tuliskan tanggapan Anda di sini..."
                      className="w-full p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50 resize-none"
                    />
                    <div className="flex justify-end text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                      {textAnswer.length}/200
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="rounded-xl bg-[#f87171]/15 border border-[#f87171]/40 px-3 py-2 text-xs text-[#f87171]">
                    {submitError}
                  </div>
                )}

                {/* Submit / Updated Button */}
                <button
                  type="button"
                  disabled={
                    submitting ||
                    currentDraftValue === undefined ||
                    isUnchangedSinceSubmit
                  }
                  onClick={handleSubmitAnswer}
                  className={`w-full min-h-[48px] rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    isUnchangedSinceSubmit
                      ? 'bg-[#4ade80]/15 border border-[#4ade80]/35 text-[var(--daun-soft)] cursor-default'
                      : 'gradient-cta-bg hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none cursor-pointer'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengirim...</span>
                    </>
                  ) : isUnchangedSinceSubmit ? (
                    <span>Jawaban terkirim ✓</span>
                  ) : hasSubmittedCurrent ? (
                    <span>Perbarui jawaban</span>
                  ) : (
                    <span>Kirim jawaban</span>
                  )}
                </button>

                {/* Demo helper navigation */}
                {isDemoMode && (
                  <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                    <button
                      type="button"
                      disabled={demoQuestionIdx <= 0}
                      onClick={() => setDemoQuestionIdx((i) => Math.max(0, i - 1))}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] disabled:opacity-40 text-[var(--text-muted)] cursor-pointer"
                    >
                      ← Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={demoQuestionIdx >= session.questions.length - 1}
                      onClick={() =>
                        setDemoQuestionIdx((i) =>
                          Math.min(session.questions.length - 1, i + 1)
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] disabled:opacity-40 text-[var(--toska-soft)] cursor-pointer"
                    >
                      Berikutnya →
                    </button>
                  </div>
                )}

                {/* Optional Mini Results Summary if showResults === true & already submitted */}
                {session.showResults !== false && hasSubmittedCurrent && (
                  <div className="pt-4 border-t border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-wider text-[var(--toska)]">
                        Hasil sementara
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {activeQuestionResults.length} jawaban
                      </span>
                    </div>

                    {(currentQuestion.type === 'scale' ||
                      currentQuestion.type === 'scale10') && (() => {
                      const steps = currentQuestion.type === 'scale10' ? 10 : 5;
                      const counts = Array.from({ length: steps }, (_, i) =>
                        activeQuestionResults.filter((r) => Number(r.value) === i + 1)
                          .length
                      );
                      const total = counts.reduce((a, b) => a + b, 0);
                      const avg =
                        total > 0
                          ? counts.reduce((acc, c, i) => acc + c * (i + 1), 0) / total
                          : 0;
                      return (
                        <div className="space-y-2">
                          <div className="text-xs text-[var(--text-muted)]">
                            Rata-rata:{' '}
                            <strong className="text-[var(--toska-soft)] font-mono">
                              {formatIdDecimal(avg, 1)} / {steps}
                            </strong>
                          </div>
                          <ScaleBarChart
                            counts={counts}
                            minLabel={getScaleEdgeLabels(currentQuestion).minLabel}
                            maxLabel={getScaleEdgeLabels(currentQuestion).maxLabel}
                          />
                        </div>
                      );
                    })()}

                    {(currentQuestion.type === 'choice' ||
                      currentQuestion.type === 'yesno') && (
                      <ChoiceBarChart
                        options={
                          currentQuestion.type === 'yesno' &&
                          currentQuestion.options.length === 0
                            ? ['Ya', 'Tidak']
                            : currentQuestion.options
                        }
                        counts={(currentQuestion.type === 'yesno' &&
                        currentQuestion.options.length === 0
                          ? ['Ya', 'Tidak']
                          : currentQuestion.options
                        ).map(
                          (opt) =>
                            activeQuestionResults.filter(
                              (r) => String(r.value) === opt
                            ).length
                        )}
                        totalResponses={activeQuestionResults.length}
                      />
                    )}

                    {currentQuestion.type === 'multichoice' && (
                      <ChoiceBarChart
                        options={currentQuestion.options}
                        counts={currentQuestion.options.map(
                          (opt) =>
                            activeQuestionResults.filter((r) =>
                              Array.isArray(r.value)
                                ? r.value.includes(opt)
                                : String(r.value) === opt
                            ).length
                        )}
                        totalResponses={activeQuestionResults.length}
                      />
                    )}

                    {currentQuestion.type === 'wordcloud' && (
                      <WordCloud responses={activeQuestionResults} />
                    )}

                    {currentQuestion.type === 'text' && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {activeQuestionResults.length} tanggapan tertulis telah diterima fasilitator.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </main>
  );
}
