import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  EyeOff,
  Home,
  Maximize2,
  Minimize2,
  PlusCircle,
  QrCode,
  Users,
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  buildParticipantJoinUrl,
  copyToClipboard,
  DEFAULT_SCALE_LABELS,
  DEMO_RESPONSES,
  DEMO_SESSION,
  formatIdDecimal,
  formatResponseValue,
  formatSessionCode,
  getScaleEdgeLabels,
  QUESTION_TYPE_LABELS,
} from '../lib/templates';
import { ChoiceBarChart, ScaleBarChart } from '../components/BarChart';
import { QRBlock } from '../components/QRBlock';
import { WordCloud } from '../components/WordCloud';
import type { LiveSession, Question, SurveyResponse } from '../types/survey';

const SAMPLE_EXTRA_WORDS = [
  'Kolaborasi',
  'Inspiratif',
  'Praktis',
  'Komunikasi',
  'Jelas',
  'Inovatif',
  'Empati',
  'Terstruktur',
];

export function PresentationPage() {
  const { setActiveSessionCode } = useFirebase();
  const { kode } = useParams<{ kode: string }>();
  const cleanCode = (kode || '').replace(/\D/g, '').slice(0, 6);
  const isDemo = kode === 'demo' || cleanCode === '482913';

  const [session, setSession] = useState<LiveSession | null>(
    isDemo ? DEMO_SESSION : null
  );
  const [participantCount, setParticipantCount] = useState<number>(
    isDemo ? 28 : 0
  );
  const [responses, setResponses] = useState<SurveyResponse[]>(
    isDemo ? DEMO_RESPONSES : []
  );
  const [loading, setLoading] = useState(!isDemo);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [forceQrView, setForceQrView] = useState(false);
  const [localQuestionIndex, setLocalQuestionIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 3200);
  }, []);

  useEffect(() => {
    revealControls();
    const handleMove = () => revealControls();
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchstart', handleMove);
    document.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchstart', handleMove);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [revealControls]);

  useEffect(() => {
    if (isDemo) {
      setSession(DEMO_SESSION);
      setResponses(DEMO_RESPONSES);
      setParticipantCount(28);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    if (!/^[0-9]{6}$/.test(cleanCode)) {
      setLoading(false);
      setErrorMsg('Kode sesi harus berupa 6 digit angka.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const sessionPath = `sessions/${cleanCode}`;
    const unsubSession = onSnapshot(
      doc(db, 'sessions', cleanCode),
      (snap) => {
        if (!snap.exists()) {
          setSession(null);
          setErrorMsg(
            `Sesi dengan kode ${formatSessionCode(cleanCode)} tidak ditemukan.`
          );
          setLoading(false);
          return;
        }
        const data = snap.data() as Omit<LiveSession, 'code'>;
        setSession({ code: cleanCode, ...data });
        setActiveSessionCode(cleanCode);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.GET, sessionPath);
      }
    );

    const participantsPath = `sessions/${cleanCode}/participants`;
    const unsubParticipants = onSnapshot(
      collection(db, 'sessions', cleanCode, 'participants'),
      (snap) => {
        setParticipantCount(snap.size);
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, participantsPath);
        }
      }
    );

    const responsesPath = `sessions/${cleanCode}/responses`;
    const unsubResponses = onSnapshot(
      collection(db, 'sessions', cleanCode, 'responses'),
      (snap) => {
        const list: SurveyResponse[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SurveyResponse, 'id'>),
        }));
        setResponses(list);
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, responsesPath);
        }
      }
    );

    return () => {
      unsubSession();
      unsubParticipants();
      unsubResponses();
    };
  }, [cleanCode, isDemo]);

  const activeQuestion: Question | null = useMemo(() => {
    if (!session || session.questions.length === 0) return null;
    if (isDemo) {
      return session.questions[localQuestionIndex] ?? session.questions[0];
    }
    if (!session.activeQuestionId) return null;
    if (session.activeQuestionId === 'ALL') {
      return session.questions[localQuestionIndex] ?? session.questions[0];
    }
    return (
      session.questions.find((q) => q.id === session.activeQuestionId) ??
      session.questions[0]
    );
  }, [session, isDemo, localQuestionIndex]);

  const activeResponses = useMemo(() => {
    if (!activeQuestion) return [];
    return responses.filter((r) => r.questionId === activeQuestion.id);
  }, [responses, activeQuestion]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial in restricted iframe
    }
  };

  const handleSimulateDemoVote = () => {
    if (!isDemo || !activeQuestion) return;
    const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    let value: number | string | string[] = 4;
    if (activeQuestion.type === 'scale') {
      const weighted = [2, 3, 3, 4, 4, 5];
      value = weighted[Math.floor(Math.random() * weighted.length)];
    } else if (activeQuestion.type === 'scale10') {
      value = Math.floor(Math.random() * 5) + 6;
    } else if (
      (activeQuestion.type === 'choice' || activeQuestion.type === 'yesno') &&
      activeQuestion.options.length > 0
    ) {
      value =
        activeQuestion.options[
          Math.floor(Math.random() * activeQuestion.options.length)
        ];
    } else if (activeQuestion.type === 'wordcloud') {
      value = [
        SAMPLE_EXTRA_WORDS[
          Math.floor(Math.random() * SAMPLE_EXTRA_WORDS.length)
        ],
      ];
    } else {
      value =
        SAMPLE_EXTRA_WORDS[
          Math.floor(Math.random() * SAMPLE_EXTRA_WORDS.length)
        ];
    }
    setResponses((prev) => [
      ...prev,
      {
        id,
        pid: id,
        name: 'Anonim',
        questionId: activeQuestion.id,
        value,
      },
    ]);
    setParticipantCount((c) => c + 1);
  };

  const canNavigateQuestions =
    Boolean(session && session.questions.length > 1) &&
    (isDemo || session?.activeQuestionId === 'ALL');

  const handlePrevQuestion = () => {
    if (!session) return;
    setForceQrView(false);
    setLocalQuestionIndex((idx) =>
      idx <= 0 ? session.questions.length - 1 : idx - 1
    );
  };

  const handleNextQuestion = () => {
    if (!session) return;
    setForceQrView(false);
    setLocalQuestionIndex((idx) => (idx + 1) % session.questions.length);
  };

  const radialBackdrop = {
    backgroundColor: 'var(--bg)',
    backgroundImage:
      'radial-gradient(circle at 12% 12%, rgba(45, 212, 191, 0.12), transparent 46%), radial-gradient(circle at 88% 88%, rgba(74, 222, 128, 0.12), transparent 46%)',
  };

  if (loading) {
    return (
      <div
        style={radialBackdrop}
        className="min-h-screen text-[var(--text)] flex flex-col items-center justify-center p-8"
      >
        <div className="w-12 h-12 rounded-full border-4 border-[var(--border)] border-t-[var(--toska)] animate-spin mb-4" />
        <p className="text-lg font-medium text-[var(--text-muted)]">
          Menghubungkan layar presentasi...
        </p>
      </div>
    );
  }

  if (errorMsg || !session) {
    return (
      <div
        style={radialBackdrop}
        className="min-h-screen text-[var(--text)] flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8">
          <h1 className="font-display text-2xl font-bold mb-3">
            Layar Presentasi Tidak Tersedia
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            {errorMsg || 'Sesi tidak ditemukan.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-cta-bg font-bold text-sm hover:brightness-110 transition-all"
          >
            <Home className="w-4 h-4" />
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  const isSessionClosed =
    session.status === 'ditutup' || session.status === 'selesai';
  const showWaitingLobby =
    forceQrView ||
    session.status === 'menunggu' ||
    (!isDemo && !session.activeQuestionId);
  const resultsVisible = session.showResults !== false;

  const maxStep = activeQuestion?.type === 'scale10' ? 10 : 5;
  const scaleCounts = Array.from({ length: maxStep }, (_, idx) => {
    const target = idx + 1;
    return activeResponses.filter((r) => Number(r.value) === target).length;
  });
  const scaleTotal = scaleCounts.reduce((a, b) => a + b, 0);
  const scaleAvg =
    scaleTotal > 0
      ? scaleCounts.reduce((acc, c, i) => acc + c * (i + 1), 0) / scaleTotal
      : 0;

  return (
    <div
      style={radialBackdrop}
      className="min-h-screen text-[var(--text)] flex flex-col justify-between p-6 sm:p-10 lg:p-14 relative overflow-hidden"
    >
      {/* Top Minimal Projector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full gradient-brand-bg flex items-center justify-center text-white font-display font-extrabold text-lg">
            Q
          </span>
          <div>
            <div className="text-sm font-bold tracking-wider gradient-brand-text font-display">
              QIYAS · قِيَاس {isDemo ? '· MODE DEMO' : ''}
            </div>
            <div className="text-xs sm:text-sm text-[var(--toska)] truncate max-w-md">
              {session.surveyTitle}
              {session.eventInfo ? ` · ${session.eventInfo}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isSessionClosed ? (
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)] text-sm sm:text-base font-semibold tabular-nums">
              <span>Sesi ditutup · {participantCount} peserta</span>
            </div>
          ) : (
            <div
              style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[#4ade80]/30 text-[var(--daun-soft)] text-sm sm:text-base font-semibold tabular-nums"
            >
              <span
                className="w-2.5 h-2.5 rounded-full bg-[var(--daun)]"
                aria-hidden="true"
              />
              <span>Langsung · {participantCount} peserta</span>
            </div>
          )}

          <div className="px-4 py-2 rounded-full bg-[var(--surface)] border border-[var(--border)] font-mono text-base sm:text-xl font-bold tracking-widest text-[var(--toska-soft)] tabular-nums">
            {formatSessionCode(session.code)}
          </div>
        </div>
      </div>

      {/* Main Projector Stage */}
      <div className="flex-1 flex items-center justify-center py-8 sm:py-10 relative z-10">
        {isSessionClosed && !activeQuestion ? (
          <div className="text-center max-w-2xl">
            <h1 className="font-display text-4xl sm:text-6xl font-extrabold text-[var(--text)] mb-4">
              Sesi Ditutup
            </h1>
            <p className="text-xl sm:text-2xl text-[var(--text-muted)]">
              Terima kasih atas partisipasi {participantCount} peserta dalam
              survei ini.
            </p>
          </div>
        ) : showWaitingLobby || !activeQuestion ? (
          <div className="w-full max-w-4xl bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 sm:p-12 text-center shadow-2xl shadow-black/50">
            <p className="text-sm sm:text-base font-semibold uppercase tracking-[0.2em] text-[var(--toska)] mb-6">
              BERGABUNG SEKARANG DARI PONSEL ANDA
            </p>

            <QRBlock
              code={session.code}
              size={240}
              showCopy={true}
              projector={true}
            />

            <div className="mt-8 inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-strong)] text-lg sm:text-2xl font-semibold text-[var(--text)] tabular-nums">
              <Users className="w-6 h-6 text-[var(--toska)]" />
              <span>{participantCount} peserta sudah bergabung</span>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-5xl bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 sm:p-12 shadow-2xl shadow-black/50">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-[var(--toska)]">
                {QUESTION_TYPE_LABELS[activeQuestion.type] || 'PERTANYAAN'}
              </span>
              <span className="text-sm sm:text-base font-medium text-[var(--text-muted)] tabular-nums">
                {activeResponses.length} jawaban masuk
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-[var(--text)] leading-tight text-balance mb-8">
              {activeQuestion.text}
            </h1>

            {!resultsVisible ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]/70 py-14 px-6 text-center">
                <EyeOff className="w-10 h-10 text-[var(--toska)] mx-auto mb-3 opacity-80" />
                <p className="text-lg sm:text-2xl font-display font-bold text-[var(--text)]">
                  Hasil sementara disembunyikan
                </p>
                <p className="text-sm sm:text-base text-[var(--text-muted)] mt-1">
                  Peserta tetap dapat mengirim jawaban. Hasil akan tampil saat fasilitator mengaktifkannya.
                </p>
              </div>
            ) : (
              <>
                {(activeQuestion.type === 'scale' ||
                  activeQuestion.type === 'scale10') && (
                  <div>
                    <div className="flex items-baseline gap-4 mb-8">
                      <span className="font-display text-6xl sm:text-7xl font-extrabold gradient-brand-text tabular-nums">
                        {formatIdDecimal(scaleAvg, 1)}
                      </span>
                      <span className="text-lg sm:text-2xl text-[var(--text-muted)] tabular-nums">
                        rata-rata dari {maxStep} · {scaleTotal} jawaban
                      </span>
                    </div>
                    <ScaleBarChart
                      counts={scaleCounts}
                      labels={
                        activeQuestion.type === 'scale' &&
                        activeQuestion.labels.length === 5
                          ? activeQuestion.labels
                          : DEFAULT_SCALE_LABELS
                      }
                      minLabel={getScaleEdgeLabels(activeQuestion).minLabel}
                      maxLabel={getScaleEdgeLabels(activeQuestion).maxLabel}
                      variant="projector"
                    />
                  </div>
                )}

                {(activeQuestion.type === 'choice' ||
                  activeQuestion.type === 'yesno') && (
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
                        activeResponses.filter((r) => String(r.value) === opt)
                          .length
                    )}
                    totalResponses={activeResponses.length}
                    variant="projector"
                  />
                )}

                {activeQuestion.type === 'multichoice' && (
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
                    variant="projector"
                  />
                )}

                {activeQuestion.type === 'wordcloud' && (
                  <WordCloud responses={activeResponses} variant="projector" />
                )}

                {activeQuestion.type === 'text' && (
                  <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
                    {activeResponses.length === 0 ? (
                      <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] min-h-[200px] text-lg text-[var(--text-muted)]">
                        Menunggu jawaban pertama...
                      </div>
                    ) : (
                      activeResponses.slice(0, 12).map((r) => (
                        <div
                          key={r.id}
                          className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-5 py-4"
                        >
                          <p className="text-lg sm:text-xl text-[var(--text)] leading-relaxed">
                            &ldquo;{formatResponseValue(r.value)}&rdquo;
                          </p>
                          <p className="text-xs sm:text-sm text-[var(--toska)] font-semibold mt-1.5">
                            — {r.name || 'Anonim'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Mouse-reveal Floating Projector Controls */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border-strong)] shadow-2xl transition-opacity duration-300 ${
          controlsVisible
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={async () => {
            const ok = await copyToClipboard(buildParticipantJoinUrl(session.code));
            if (ok) {
              setCopiedLink(true);
              window.setTimeout(() => setCopiedLink(false), 2000);
            }
          }}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-[var(--toska-soft)] text-xs font-semibold transition-colors cursor-pointer"
          title="Salin tautan untuk peserta"
        >
          {copiedLink ? (
            <>
              <Check className="w-4 h-4 text-[var(--daun)]" />
              <span>Tersalin ✓</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-[var(--toska)]" />
              <span>Salin tautan peserta</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setForceQrView((v) => !v)}
          className={`min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
            showWaitingLobby
              ? 'border-[var(--toska)] text-[var(--toska-soft)] bg-[#2dd4bf]/15'
              : 'bg-[var(--surface-2)] border-[var(--border-strong)] hover:border-[var(--toska)] text-[var(--text)]'
          }`}
          title="Tampilkan / sembunyikan layar kode QR"
        >
          <QrCode className="w-4 h-4" />
          <span>{showWaitingLobby ? 'Lihat Grafik' : 'Tampilkan QR'}</span>
        </button>

        {canNavigateQuestions && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevQuestion}
              aria-label="Pertanyaan sebelumnya"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-[var(--text)] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono text-[var(--text-muted)] tabular-nums">
              {localQuestionIndex + 1}/{session.questions.length}
            </span>
            <button
              type="button"
              onClick={handleNextQuestion}
              aria-label="Pertanyaan berikutnya"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-[var(--text)] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {isDemo && !showWaitingLobby && (
          <button
            type="button"
            onClick={handleSimulateDemoVote}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl gradient-cta-bg hover:brightness-110 text-xs font-bold transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Simulasi Jawaban</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-[var(--text)] text-xs font-semibold transition-colors cursor-pointer"
          title="Layar penuh"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-4 h-4" />
              <span>Keluar Layar Penuh</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-4 h-4" />
              <span>Layar Penuh</span>
            </>
          )}
        </button>

        <Link
          to="/"
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-[var(--text)] text-xs font-semibold transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Beranda</span>
        </Link>
      </div>
    </div>
  );
}
