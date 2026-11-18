import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Check, Copy } from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  buildParticipantJoinUrl,
  copyToClipboard,
  DEFAULT_SCALE_LABELS,
  formatIdDecimal,
  formatResponseValue,
  formatSessionCode,
  getScaleEdgeLabels,
  QUESTION_TYPE_LABELS,
} from '../lib/templates';
import type { LiveSession, Question, SurveyResponse } from '../types/survey';
import { ChoiceBarChart, ScaleBarChart } from './BarChart';
import { WordCloud } from './WordCloud';

const BASE_COUNTS = [2, 6, 11, 7, 2];

export function HeroPreviewCard() {
  const { activeSessionCode } = useFirebase();
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [demoCounts, setDemoCounts] = useState<number[]>(BASE_COUNTS);
  const [copiedLink, setCopiedLink] = useState(false);

  // Realtime Firestore listeners when an activeSessionCode exists
  useEffect(() => {
    if (!activeSessionCode || !/^[0-9]{6}$/.test(activeSessionCode)) {
      setLiveSession(null);
      setParticipantCount(0);
      setResponses([]);
      return;
    }

    const unsubSession = onSnapshot(
      doc(db, 'sessions', activeSessionCode),
      (snap) => {
        if (!snap.exists()) {
          setLiveSession(null);
          return;
        }
        const data = snap.data() as Omit<LiveSession, 'code'>;
        setLiveSession({ code: activeSessionCode, ...data });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `sessions/${activeSessionCode}`);
      }
    );

    const unsubParts = onSnapshot(
      collection(db, 'sessions', activeSessionCode, 'participants'),
      (snap) => {
        setParticipantCount(snap.size);
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(
            err,
            OperationType.LIST,
            `sessions/${activeSessionCode}/participants`
          );
        }
      }
    );

    const unsubResps = onSnapshot(
      collection(db, 'sessions', activeSessionCode, 'responses'),
      (snap) => {
        setResponses(
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
            `sessions/${activeSessionCode}/responses`
          );
        }
      }
    );

    return () => {
      unsubSession();
      unsubParts();
      unsubResps();
    };
  }, [activeSessionCode]);

  // Fallback gentle animation when no live session is loaded yet
  useEffect(() => {
    if (liveSession) return;
    const frames: number[][] = [
      [2, 6, 11, 7, 2],
      [2, 5, 11, 8, 2],
      [2, 6, 10, 7, 3],
      [2, 6, 11, 7, 2],
      [1, 6, 12, 7, 2],
    ];
    let step = 0;
    const timer = window.setInterval(() => {
      step = (step + 1) % frames.length;
      setDemoCounts(frames[step]);
    }, 2800);

    return () => window.clearInterval(timer);
  }, [liveSession]);

  const activeQuestion: Question | null = useMemo(() => {
    if (!liveSession || liveSession.questions.length === 0) return null;
    if (!liveSession.activeQuestionId || liveSession.activeQuestionId === 'ALL') {
      return liveSession.questions[0];
    }
    return (
      liveSession.questions.find((q) => q.id === liveSession.activeQuestionId) ??
      liveSession.questions[0]
    );
  }, [liveSession]);

  const activeResponses = useMemo(() => {
    if (!activeQuestion) return [];
    return responses.filter((r) => r.questionId === activeQuestion.id);
  }, [responses, activeQuestion]);

  const displayCode = liveSession ? liveSession.code : '482913';
  const joinUrl = buildParticipantJoinUrl(displayCode);

  const handleCopy = async () => {
    const ok = await copyToClipboard(joinUrl);
    if (ok) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isClosed =
    Boolean(liveSession) &&
    (liveSession!.status === 'ditutup' || liveSession!.status === 'selesai');

  const demoTotal = demoCounts.reduce((acc, n) => acc + n, 0);
  const demoWeightedSum = demoCounts.reduce((acc, n, i) => acc + n * (i + 1), 0);
  const demoAverage = demoTotal > 0 ? demoWeightedSum / demoTotal : 3.0;

  return (
    <div className="relative overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/40 flex flex-col justify-between h-full gap-5">
      {/* Decorative circle in top-right corner */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full gradient-soft-bg blur-xl"
      />

      {/* Top Row: Live badge & Session code */}
      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          {isClosed ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f87171]/15 border border-[#f87171]/30 text-[#f87171] text-xs font-semibold tabular-nums">
              <span className="w-2 h-2 rounded-full bg-[#f87171]" aria-hidden="true" />
              <span>Sesi ditutup · {participantCount} peserta</span>
            </div>
          ) : (
            <div
              style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#4ade80]/30 text-[var(--daun-soft)] text-xs font-semibold tabular-nums"
            >
              <span className="w-2 h-2 rounded-full bg-[var(--daun)]" aria-hidden="true" />
              <span>
                Langsung · {liveSession ? participantCount : demoTotal} peserta
              </span>
            </div>
          )}

          <span className="font-mono text-sm sm:text-base font-bold tracking-widest text-[var(--toska-soft)] tabular-nums">
            {formatSessionCode(displayCode)}
          </span>
        </div>

        {/* Question title & live results */}
        {liveSession && activeQuestion ? (
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--toska)]">
                {QUESTION_TYPE_LABELS[activeQuestion.type]}
              </span>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--text)] leading-snug mt-1">
                {activeQuestion.text}
              </h2>
            </div>

            {activeResponses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]/60 py-10 px-4 text-center text-xs sm:text-sm text-[var(--text-muted)]">
                Menunggu jawaban pertama dari peserta...
              </div>
            ) : (activeQuestion.type === 'scale' ||
                activeQuestion.type === 'scale10') ? (() => {
              const steps = activeQuestion.type === 'scale10' ? 10 : 5;
              const counts = Array.from({ length: steps }, (_, i) =>
                activeResponses.filter((r) => Number(r.value) === i + 1).length
              );
              const total = counts.reduce((a, b) => a + b, 0);
              const avg =
                total > 0
                  ? counts.reduce((acc, c, i) => acc + c * (i + 1), 0) / total
                  : 0;
              return (
                <div className="space-y-4">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-4xl sm:text-5xl font-extrabold gradient-brand-text tabular-nums">
                      {formatIdDecimal(avg, 1)}
                    </span>
                    <span className="text-xs sm:text-sm text-[var(--text-muted)] tabular-nums">
                      rata-rata dari {steps} · {total} jawaban
                    </span>
                  </div>
                  <ScaleBarChart
                    counts={counts}
                    labels={
                      activeQuestion.type === 'scale' &&
                      activeQuestion.labels.length === 5
                        ? activeQuestion.labels
                        : DEFAULT_SCALE_LABELS
                    }
                    minLabel={getScaleEdgeLabels(activeQuestion).minLabel}
                    maxLabel={getScaleEdgeLabels(activeQuestion).maxLabel}
                    variant="card"
                  />
                </div>
              );
            })() : activeQuestion.type === 'wordcloud' ? (
              <WordCloud responses={activeResponses} variant="card" />
            ) : activeQuestion.type === 'choice' ||
              activeQuestion.type === 'yesno' ? (
              <ChoiceBarChart
                options={
                  activeQuestion.type === 'yesno' &&
                  activeQuestion.options.length === 0
                    ? ['Ya', 'Tidak']
                    : activeQuestion.options
                }
                counts={(activeQuestion.type === 'yesno' &&
                activeQuestion.options.length === 0
                  ? ['Ya', 'Tidak']
                  : activeQuestion.options
                ).map(
                  (opt) =>
                    activeResponses.filter((r) => String(r.value) === opt).length
                )}
                totalResponses={activeResponses.length}
                variant="card"
              />
            ) : activeQuestion.type === 'multichoice' ? (
              <ChoiceBarChart
                options={activeQuestion.options}
                counts={activeQuestion.options.map(
                  (opt) =>
                    activeResponses.filter((r) =>
                      Array.isArray(r.value)
                        ? r.value.includes(opt)
                        : String(r.value) === opt
                    ).length
                )}
                totalResponses={activeResponses.length}
                variant="card"
              />
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeResponses.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text)]"
                  >
                    <p>{formatResponseValue(r.value)}</p>
                    <span className="text-[11px] text-[var(--toska)] font-medium">
                      — {r.name || 'Anonim'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--text)] leading-snug">
              Seberapa paham Anda tentang topik pelatihan ini?
            </h2>

            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl sm:text-5xl font-extrabold gradient-brand-text tabular-nums">
                {formatIdDecimal(demoAverage, 1)}
              </span>
              <span className="text-xs sm:text-sm text-[var(--text-muted)] tabular-nums">
                rata-rata dari 5 · {demoTotal} jawaban
              </span>
            </div>

            <ScaleBarChart
              counts={demoCounts}
              labels={DEFAULT_SCALE_LABELS}
              variant="card"
            />
          </div>
        )}
      </div>

      {/* Copyable Participant Link Strip (same style as Facilitator panel) */}
      <div className="relative z-10 pt-4 border-t border-[var(--border)] space-y-1.5">
        <label
          htmlFor="hero-join-link"
          className="block text-xs font-medium text-[var(--text-muted)]"
        >
          Tautan untuk peserta
        </label>
        <div className="flex items-center gap-2">
          <input
            id="hero-join-link"
            type="text"
            readOnly
            value={joinUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)] focus:outline-none focus:border-[var(--toska)]"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-xs font-semibold text-[var(--toska-soft)] cursor-pointer transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--daun)]" />
                <span>Tersalin ✓</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[var(--toska)]" />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
