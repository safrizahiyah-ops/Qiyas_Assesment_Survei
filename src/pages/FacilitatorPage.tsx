import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  buildParticipantJoinUrl,
  buildPresentationUrl,
  copyToClipboard,
  createQuestionId,
  DEFAULT_SCALE_LABELS,
  exportSessionToCsv,
  exportSessionToXlsx,
  formatIdDecimal,
  formatIndonesianDate,
  formatResponseValue,
  formatSessionCode,
  formatTimestampTime,
  getScaleEdgeLabels,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_NAMES,
  SURVEY_TEMPLATES,
} from '../lib/templates';
import { ChoiceBarChart, ScaleBarChart } from '../components/BarChart';
import { WordCloud } from '../components/WordCloud';
import type {
  LiveSession,
  Participant,
  Question,
  QuestionType,
  Survey,
  SurveyResponse,
  TemplateType,
} from '../types/survey';

const DEMO_NAMES = [
  'Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Gita', 'Hendra', 'Indah', 'Joko',
  'Kartika', 'Lukman', 'Maya', 'Nadia', 'Oki', 'Putri', 'Rizki', 'Sari', 'Tari', 'Umar',
  'Vina', 'Wahyu', 'Yuni', 'Zaki', 'Ayu', 'Bagus', 'Dina', 'Fajar', 'Hana', 'Ilham',
];

const DEMO_WORDCLOUD_POOL = [
  'Kolaborasi', 'Inspiratif', 'Praktis', 'Komunikasi', 'Strategis',
  'Solutif', 'Empati', 'Inovatif', 'Terstruktur', 'Relevan', 'Antusias', 'Jelas',
];

const DEMO_TEXT_POOL = [
  'Semoga materi langsung disertai studi kasus nyata di tempat kerja.',
  'Ingin memperdalam teknik komunikasi tim yang lebih efektif.',
  'Harapannya ada sesi tanya jawab yang cukup panjang.',
  'Sangat menantikan contoh praktik yang bisa langsung diterapkan.',
  'Topiknya relevan dengan tantangan tim kami bulan ini.',
  'Mohon dibagikan ringkasan materi setelah sesi selesai.',
];

function sanitizeQuestions(questions: Question[]): Question[] {
  return questions.slice(0, 30).map((q) => {
    const type = q.type || 'scale';
    const isScale5 = type === 'scale';
    const isScale10 = type === 'scale10';
    const isChoiceType = type === 'choice' || type === 'multichoice' || type === 'yesno';

    const scaleMin = (q.scaleMin || (isScale5 ? q.labels?.[0] : '') || (isScale10 ? 'Kurang' : 'Belum paham')).trim().slice(0, 60);
    const scaleMax = (q.scaleMax || (isScale5 ? q.labels?.[4] : '') || (isScale10 ? 'Sangat baik' : 'Sangat paham')).trim().slice(0, 60);

    let options: string[] = [];
    if (type === 'yesno') {
      options = q.options?.length >= 2 ? q.options.slice(0, 2).map((o) => o.trim().slice(0, 60) || 'Opsi') : ['Ya', 'Tidak'];
    } else if (isChoiceType) {
      options = (q.options || []).map((o) => o.trim().slice(0, 120)).filter(Boolean).slice(0, 10);
      if (options.length < 2) options = ['Opsi 1', 'Opsi 2'];
    }

    return {
      id: q.id || createQuestionId(),
      type,
      text: (q.text || 'Pertanyaan tanpa judul').trim().slice(0, 200),
      labels: isScale5
        ? [0, 1, 2, 3, 4].map((i) => {
            if (i === 0 && scaleMin) return scaleMin;
            if (i === 4 && scaleMax) return scaleMax;
            return (q.labels?.[i] || DEFAULT_SCALE_LABELS[i]).trim().slice(0, 60);
          })
        : [],
      options,
      ...(isScale5 || isScale10 ? { scaleMin, scaleMax } : {}),
    };
  });
}

function getTimeMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function FacilitatorPage() {
  const {
    user,
    authReady,
    authLoading,
    authError,
    activeSessionCode,
    setActiveSessionCode,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
  } = useFirebase();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('Persepsi Awal Peserta');
  const [newSessionEventInfo, setNewSessionEventInfo] = useState('');
  const [newSessionTemplate, setNewSessionTemplate] =
    useState<TemplateType>('persepsi_awal');
  const [creatingNewSession, setCreatingNewSession] = useState(false);
  const [draftSessionCode, setDraftSessionCode] = useState<string>(() =>
    String(Math.floor(100000 + Math.random() * 900000))
  );
  const [draftProvisioned, setDraftProvisioned] = useState<{
    surveyId: string;
    code: string;
  } | null>(null);
  const [copiedDraftLink, setCopiedDraftLink] = useState(false);
  const [activatingDraft, setActivatingDraft] = useState(false);
  const autoInitTriggeredRef = useRef(false);
  const skipAutoInitRef = useRef(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [ensuringSession, setEnsuringSession] = useState(false);

  // Modals & Popovers
  const [copiedLink, setCopiedLink] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsEventInfo, setSettingsEventInfo] = useState('');
  const [settingsAllowAnon, setSettingsAllowAnon] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'delete' | null>(null);
  const [confirmTargetSurvey, setConfirmTargetSurvey] = useState<Survey | null>(null);
  const [processingConfirm, setProcessingConfirm] = useState(false);

  // Question Modal
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | 'new' | null>(null);
  const [qFormText, setQFormText] = useState('');
  const [qFormType, setQFormType] = useState<QuestionType>('scale');
  const [qFormMinLabel, setQFormMinLabel] = useState('Belum paham sama sekali');
  const [qFormMaxLabel, setQFormMaxLabel] = useState('Sangat paham');
  const [qFormOptions, setQFormOptions] = useState<string[]>(['Opsi 1', 'Opsi 2']);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Simulation
  const [simulating, setSimulating] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !user) {
      setSurveys([]);
      setSessions([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    const surveysQuery = query(collection(db, 'surveys'), where('ownerUid', '==', user.uid));
    const unsubSurveys = onSnapshot(
      surveysQuery,
      (snap) => {
        const list: Survey[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Survey, 'id'>),
          }))
          .sort((a, b) => getTimeMillis(b.updatedAt) - getTimeMillis(a.updatedAt));
        setSurveys(list);
        setLoadingData(false);
      },
      (err) => {
        setLoadingData(false);
        handleFirestoreError(err, OperationType.LIST, 'surveys');
      }
    );

    const sessionsQuery = query(collection(db, 'sessions'), where('ownerUid', '==', user.uid));
    const unsubSessions = onSnapshot(
      sessionsQuery,
      (snap) => {
        const list: LiveSession[] = snap.docs
          .map((d) => ({
            code: d.id,
            ...(d.data() as Omit<LiveSession, 'code'>),
          }))
          .sort((a, b) => getTimeMillis(b.createdAt) - getTimeMillis(a.createdAt));
        setSessions(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'sessions');
      }
    );

    return () => {
      unsubSurveys();
      unsubSessions();
    };
  }, [authReady, user]);

  const selectedSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedSurveyId) ?? null,
    [surveys, selectedSurveyId]
  );

  const selectedSession = useMemo(() => {
    if (!selectedSurvey) return null;
    if (selectedSurvey.activeSessionCode) {
      const byCode = sessions.find((s) => s.code === selectedSurvey.activeSessionCode);
      if (byCode) return byCode;
    }
    return sessions.find((s) => s.surveyId === selectedSurvey.id) ?? null;
  }, [selectedSurvey, sessions]);

  const activeListSession = useMemo(() => {
    if (sessions.length === 0) return null;
    if (activeSessionCode) {
      const byCode = sessions.find((s) => s.code === activeSessionCode);
      if (byCode) return byCode;
    }
    return (
      sessions.find((s) => s.status === 'aktif' || s.status === 'menunggu') ||
      sessions[0] ||
      null
    );
  }, [sessions, activeSessionCode]);

  const activeListSurvey = useMemo(() => {
    if (surveys.length === 0) return null;
    if (activeListSession) {
      const bySession = surveys.find((s) => s.id === activeListSession.surveyId);
      if (bySession) return bySession;
    }
    if (activeSessionCode) {
      const byCode = surveys.find((s) => s.activeSessionCode === activeSessionCode);
      if (byCode) return byCode;
    }
    return surveys[0] ?? null;
  }, [surveys, activeListSession, activeSessionCode]);

  const panelSurvey = selectedSurvey ?? activeListSurvey;
  const panelSession = selectedSurvey ? selectedSession : activeListSession;

  const selectedTemplateObj = useMemo(
    () =>
      SURVEY_TEMPLATES.find((t) => t.type === newSessionTemplate) ??
      SURVEY_TEMPLATES[0],
    [newSessionTemplate]
  );

  const selectedTemplatePreviewQuestions = useMemo(
    () => selectedTemplateObj.questions(),
    [selectedTemplateObj]
  );

  // Ensure a live session exists when selecting a survey
  const ensureSessionForSurvey = async (survey: Survey): Promise<string | null> => {
    if (!user) return null;
    if (survey.activeSessionCode) {
      const existing = sessions.find((s) => s.code === survey.activeSessionCode);
      if (existing) return existing.code;
    }
    const existingBySurvey = sessions.find((s) => s.surveyId === survey.id);
    if (existingBySurvey) {
      try {
        await updateDoc(doc(db, 'surveys', survey.id), {
          activeSessionCode: existingBySurvey.code,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
      return existingBySurvey.code;
    }

    setEnsuringSession(true);
    try {
      let code = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = String(Math.floor(100000 + Math.random() * 900000));
        if (candidate === '482913') continue;
        const snap = await getDoc(doc(db, 'sessions', candidate));
        if (!snap.exists()) {
          code = candidate;
          break;
        }
      }
      if (!code) return null;

      const cleanedQuestions = sanitizeQuestions(survey.questions);
      const firstQId = cleanedQuestions[0]?.id || '';

      await setDoc(doc(db, 'sessions', code), {
        surveyId: survey.id,
        ownerUid: user.uid,
        surveyTitle: survey.title,
        eventInfo: (survey.eventInfo || '').slice(0, 160),
        allowAnonymous: survey.allowAnonymous,
        questions: cleanedQuestions,
        status: 'aktif',
        activeQuestionId: firstQId,
        showResults: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'surveys', survey.id), {
        activeSessionCode: code,
        updatedAt: serverTimestamp(),
      });
      setActiveSessionCode(code);
      return code;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'sessions');
      return null;
    } finally {
      setEnsuringSession(false);
    }
  };

  const handleOpenSurveyDashboard = async (survey: Survey) => {
    setSelectedSurveyId(survey.id);
    const code = await ensureSessionForSurvey(survey);
    if (code) setActiveSessionCode(code);
  };

  useEffect(() => {
    if (!panelSession) {
      setParticipants([]);
      setResponses([]);
      return;
    }

    setActiveSessionCode(panelSession.code);
    const code = panelSession.code;
    const unsubPart = onSnapshot(
      collection(db, 'sessions', code, 'participants'),
      (snap) => {
        setParticipants(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Participant, 'id'>),
          }))
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `sessions/${code}/participants`);
      }
    );

    const unsubResp = onSnapshot(
      collection(db, 'sessions', code, 'responses'),
      (snap) => {
        const list: SurveyResponse[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SurveyResponse, 'id'>),
        }));
        list.sort(
          (a, b) =>
            getTimeMillis(b.updatedAt || b.createdAt) -
            getTimeMillis(a.updatedAt || a.createdAt)
        );
        setResponses(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `sessions/${code}/responses`);
      }
    );

    return () => {
      unsubPart();
      unsubResp();
    };
  }, [panelSession?.code, setActiveSessionCode]);

  const allocateUniqueSessionCode = useCallback(async (): Promise<string> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      if (candidate === '482913') continue;
      try {
        const snap = await getDoc(doc(db, 'sessions', candidate));
        if (!snap.exists()) {
          return candidate;
        }
      } catch {
        return candidate;
      }
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }, []);

  const refreshDraftSessionCode = useCallback(async () => {
    const code = await allocateUniqueSessionCode();
    setDraftSessionCode(code);
    return code;
  }, [allocateUniqueSessionCode]);

  useEffect(() => {
    if (!authReady || !user) return;
    refreshDraftSessionCode();
  }, [authReady, user, refreshDraftSessionCode]);

  // Auto-provision an active live session when facilitator lands with 0 surveys
  useEffect(() => {
    if (
      !authReady ||
      !user ||
      loadingData ||
      surveys.length > 0 ||
      autoInitTriggeredRef.current ||
      skipAutoInitRef.current
    ) {
      return;
    }

    autoInitTriggeredRef.current = true;
    (async () => {
      try {
        const tpl = SURVEY_TEMPLATES[0];
        const code = await allocateUniqueSessionCode();
        const cleanedQuestions = sanitizeQuestions(tpl.questions());
        const firstQId = cleanedQuestions[0]?.id || '';

        const ref = await addDoc(collection(db, 'surveys'), {
          ownerUid: user.uid,
          title: tpl.defaultTitle,
          eventInfo: '',
          templateType: tpl.type,
          questions: cleanedQuestions,
          allowAnonymous: true,
          activeSessionCode: code,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(doc(db, 'sessions', code), {
          surveyId: ref.id,
          ownerUid: user.uid,
          surveyTitle: tpl.defaultTitle,
          eventInfo: '',
          allowAnonymous: true,
          questions: cleanedQuestions,
          status: 'aktif',
          activeQuestionId: firstQId,
          showResults: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setActiveSessionCode(code);
        await refreshDraftSessionCode();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'sessions');
      }
    })();
  }, [
    authReady,
    user,
    loadingData,
    surveys.length,
    allocateUniqueSessionCode,
    refreshDraftSessionCode,
    setActiveSessionCode,
  ]);

  const showTempNotice = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice(null), 2600);
  };

  const openCreateSessionMenu = async () => {
    setNewSessionTemplate('persepsi_awal');
    setNewSessionTitle('Persepsi Awal Peserta');
    setNewSessionEventInfo('');
    setDraftProvisioned(null);
    setCopiedDraftLink(false);
    setShowCreateSessionModal(true);
    await refreshDraftSessionCode();
  };

  const handleTemplateSelectChange = (nextType: TemplateType) => {
    const prevTpl = SURVEY_TEMPLATES.find((t) => t.type === newSessionTemplate);
    const nextTpl =
      SURVEY_TEMPLATES.find((t) => t.type === nextType) ?? SURVEY_TEMPLATES[0];
    setNewSessionTemplate(nextType);
    if (
      !newSessionTitle.trim() ||
      (prevTpl && newSessionTitle.trim() === prevTpl.defaultTitle)
    ) {
      setNewSessionTitle(nextTpl.defaultTitle);
    }
  };

  // Ensure the auto-filled draft session exists & is live in Firestore
  const ensureDraftSessionLive = async (): Promise<{
    surveyId: string;
    code: string;
  } | null> => {
    if (!user) return null;

    const tpl =
      SURVEY_TEMPLATES.find((t) => t.type === newSessionTemplate) ??
      SURVEY_TEMPLATES[0];
    const finalTitle = newSessionTitle.trim().slice(0, 160) || tpl.defaultTitle;
    const finalEventInfo = newSessionEventInfo.trim().slice(0, 160);
    const cleanedQuestions = sanitizeQuestions(tpl.questions());
    const firstQId = cleanedQuestions[0]?.id || '';

    if (draftProvisioned && draftProvisioned.code === draftSessionCode) {
      await updateDoc(doc(db, 'surveys', draftProvisioned.surveyId), {
        title: finalTitle,
        eventInfo: finalEventInfo,
        templateType: tpl.type,
        questions: cleanedQuestions,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'sessions', draftProvisioned.code), {
        surveyTitle: finalTitle,
        eventInfo: finalEventInfo,
        questions: cleanedQuestions,
        activeQuestionId: firstQId,
        status: 'aktif',
        updatedAt: serverTimestamp(),
      });
      setActiveSessionCode(draftProvisioned.code);
      return draftProvisioned;
    }

    let code = /^[0-9]{6}$/.test(draftSessionCode) ? draftSessionCode : '';
    if (code) {
      try {
        const snap = await getDoc(doc(db, 'sessions', code));
        if (snap.exists() || code === '482913') {
          code = await allocateUniqueSessionCode();
          setDraftSessionCode(code);
        }
      } catch {
        code = await allocateUniqueSessionCode();
        setDraftSessionCode(code);
      }
    } else {
      code = await allocateUniqueSessionCode();
      setDraftSessionCode(code);
    }

    const ref = await addDoc(collection(db, 'surveys'), {
      ownerUid: user.uid,
      title: finalTitle,
      eventInfo: finalEventInfo,
      templateType: tpl.type,
      questions: cleanedQuestions,
      allowAnonymous: true,
      activeSessionCode: code,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'sessions', code), {
      surveyId: ref.id,
      ownerUid: user.uid,
      surveyTitle: finalTitle,
      eventInfo: finalEventInfo,
      allowAnonymous: true,
      questions: cleanedQuestions,
      status: 'aktif',
      activeQuestionId: firstQId,
      showResults: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    skipAutoInitRef.current = false;
    setActiveSessionCode(code);
    const created = { surveyId: ref.id, code };
    setDraftProvisioned(created);
    return created;
  };

  const handleCopyDraftJoinLink = async () => {
    if (!draftSessionCode || activatingDraft) return;
    setActivatingDraft(true);
    try {
      const live = await ensureDraftSessionLive();
      const targetCode = live?.code || draftSessionCode;
      const ok = await copyToClipboard(buildParticipantJoinUrl(targetCode));
      if (ok) {
        setCopiedDraftLink(true);
        window.setTimeout(() => setCopiedDraftLink(false), 2000);
      }
      showTempNotice(
        `Kode ${formatSessionCode(targetCode)} aktif & tautan peserta tersalin.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'sessions');
    } finally {
      setActivatingDraft(false);
    }
  };

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || creatingNewSession) return;

    setCreatingNewSession(true);
    try {
      const live = await ensureDraftSessionLive();
      if (!live) return;

      setShowCreateSessionModal(false);
      setSelectedSurveyId(live.surveyId);
      setActiveSessionCode(live.code);
      setDraftProvisioned(null);
      await refreshDraftSessionCode();
      showTempNotice(
        `Sesi ${formatSessionCode(live.code)} dibuat & langsung terhubung.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'surveys');
    } finally {
      setCreatingNewSession(false);
    }
  };

  const handleDuplicateSurvey = async (survey: Survey) => {
    if (!user) return;
    const cleanedQuestions = sanitizeQuestions(
      survey.questions.map((q) => ({ ...q, id: createQuestionId() }))
    );
    const newTitle = `${survey.title} (Salinan)`.slice(0, 160);
    const payload = {
      ownerUid: user.uid,
      title: newTitle,
      eventInfo: (survey.eventInfo || '').slice(0, 160),
      templateType: survey.templateType,
      questions: cleanedQuestions,
      allowAnonymous: survey.allowAnonymous,
      activeSessionCode: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const ref = await addDoc(collection(db, 'surveys'), payload);
      const created: Survey = {
        id: ref.id,
        ownerUid: user.uid,
        title: newTitle,
        eventInfo: survey.eventInfo || '',
        templateType: survey.templateType,
        questions: cleanedQuestions,
        allowAnonymous: survey.allowAnonymous,
        activeSessionCode: '',
      };
      setSelectedSurveyId(ref.id);
      await ensureSessionForSurvey(created);
      showTempNotice('Survei berhasil diduplikat.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'surveys');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !user) return;
    setProcessingConfirm(true);

    try {
      if (confirmAction === 'clear' && panelSession) {
        const partSnap = await getDocs(
          collection(db, 'sessions', panelSession.code, 'participants')
        );
        const respSnap = await getDocs(
          collection(db, 'sessions', panelSession.code, 'responses')
        );
        const docs = [...partSnap.docs, ...respSnap.docs];
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        showTempNotice('Semua jawaban & peserta berhasil dikosongkan.');
      } else if (confirmAction === 'delete') {
        const target = confirmTargetSurvey || panelSurvey;
        if (!target) return;

        const relatedSessions = sessions.filter((s) => s.surveyId === target.id);
        const deletedCodes = new Set(relatedSessions.map((s) => s.code));
        for (const sess of relatedSessions) {
          const partSnap = await getDocs(
            collection(db, 'sessions', sess.code, 'participants')
          );
          const respSnap = await getDocs(
            collection(db, 'sessions', sess.code, 'responses')
          );
          const docs = [...partSnap.docs, ...respSnap.docs];
          for (let i = 0; i < docs.length; i += 400) {
            const batch = writeBatch(db);
            docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
          await deleteDoc(doc(db, 'sessions', sess.code));
        }
        await deleteDoc(doc(db, 'surveys', target.id));
        skipAutoInitRef.current = true;
        if (draftProvisioned?.surveyId === target.id) {
          setDraftProvisioned(null);
        }
        if (selectedSurveyId === target.id) {
          setSelectedSurveyId(null);
        }
        if (activeSessionCode && deletedCodes.has(activeSessionCode)) {
          const fallbackSession = sessions.find((s) => !deletedCodes.has(s.code));
          setActiveSessionCode(fallbackSession ? fallbackSession.code : '');
        }
        showTempNotice('Survei berhasil dihapus.');
      }
      setConfirmAction(null);
      setConfirmTargetSurvey(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        confirmAction === 'clear'
          ? `sessions/${panelSession?.code}`
          : `surveys/${confirmTargetSurvey?.id || panelSurvey?.id}`
      );
    } finally {
      setProcessingConfirm(false);
    }
  };

  const handleCopyJoinLink = async (code: string) => {
    const url = buildParticipantJoinUrl(code);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const openSettingsModal = (targetSurvey: Survey | null = panelSurvey) => {
    if (!targetSurvey) return;
    setSettingsTitle(targetSurvey.title);
    setSettingsEventInfo(targetSurvey.eventInfo || '');
    setSettingsAllowAnon(targetSurvey.allowAnonymous);
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!panelSurvey) return;
    const cleanedTitle = settingsTitle.trim().slice(0, 160) || 'Survei Tanpa Judul';
    const cleanedEventInfo = settingsEventInfo.trim().slice(0, 160);
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'surveys', panelSurvey.id), {
        title: cleanedTitle,
        eventInfo: cleanedEventInfo,
        allowAnonymous: settingsAllowAnon,
        updatedAt: serverTimestamp(),
      });
      if (panelSession) {
        await updateDoc(doc(db, 'sessions', panelSession.code), {
          surveyTitle: cleanedTitle,
          eventInfo: cleanedEventInfo,
          allowAnonymous: settingsAllowAnon,
          updatedAt: serverTimestamp(),
        });
      }
      setShowSettingsModal(false);
      showTempNotice('Pengaturan survei diperbarui.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `surveys/${panelSurvey.id}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const syncSurveyAndSessionQuestions = async (
    nextQuestions: Question[],
    nextActiveId?: string
  ) => {
    if (!selectedSurvey) return;
    const cleaned = sanitizeQuestions(nextQuestions);
    try {
      await updateDoc(doc(db, 'surveys', selectedSurvey.id), {
        questions: cleaned,
        updatedAt: serverTimestamp(),
      });
      if (selectedSession) {
        const activeId =
          nextActiveId !== undefined
            ? nextActiveId
            : cleaned.some((q) => q.id === selectedSession.activeQuestionId)
            ? selectedSession.activeQuestionId
            : cleaned[0]?.id || '';
        await updateDoc(doc(db, 'sessions', selectedSession.code), {
          questions: cleaned,
          activeQuestionId: activeId,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `surveys/${selectedSurvey.id}`);
    }
  };

  const openQuestionModal = (idx: number | 'new') => {
    if (idx === 'new') {
      setEditingQuestionIdx('new');
      setQFormText('');
      setQFormType('scale');
      setQFormMinLabel('Belum paham sama sekali');
      setQFormMaxLabel('Sangat paham');
      setQFormOptions(['Opsi 1', 'Opsi 2', 'Opsi 3']);
    } else if (selectedSurvey) {
      const q = selectedSurvey.questions[idx];
      if (!q) return;
      setEditingQuestionIdx(idx);
      setQFormText(q.text);
      setQFormType(q.type);
      const edges = getScaleEdgeLabels(q);
      setQFormMinLabel(edges.minLabel);
      setQFormMaxLabel(edges.maxLabel);
      setQFormOptions(
        q.options && q.options.length >= 2
          ? [...q.options]
          : q.type === 'yesno'
          ? ['Ya', 'Tidak']
          : ['Opsi 1', 'Opsi 2']
      );
    }
  };

  const handleSaveQuestionModal = async () => {
    if (!selectedSurvey || editingQuestionIdx === null) return;
    const text = qFormText.trim().slice(0, 200);
    if (!text) return;

    setSavingQuestion(true);
    try {
      const existingId =
        editingQuestionIdx === 'new'
          ? createQuestionId()
          : selectedSurvey.questions[editingQuestionIdx]?.id || createQuestionId();

      const newQ: Question = {
        id: existingId,
        type: qFormType,
        text,
        labels:
          qFormType === 'scale'
            ? [
                qFormMinLabel.trim() || DEFAULT_SCALE_LABELS[0],
                DEFAULT_SCALE_LABELS[1],
                DEFAULT_SCALE_LABELS[2],
                DEFAULT_SCALE_LABELS[3],
                qFormMaxLabel.trim() || DEFAULT_SCALE_LABELS[4],
              ]
            : [],
        options:
          qFormType === 'yesno'
            ? ['Ya', 'Tidak']
            : qFormType === 'choice' || qFormType === 'multichoice'
            ? qFormOptions.map((o) => o.trim()).filter(Boolean).slice(0, 10)
            : [],
        ...(qFormType === 'scale' || qFormType === 'scale10'
          ? {
              scaleMin: qFormMinLabel.trim() || 'Sangat rendah',
              scaleMax: qFormMaxLabel.trim() || 'Sangat tinggi',
            }
          : {}),
      };

      const current = [...selectedSurvey.questions];
      if (editingQuestionIdx === 'new') {
        current.push(newQ);
        await syncSurveyAndSessionQuestions(
          current,
          selectedSession?.activeQuestionId || newQ.id
        );
      } else {
        current[editingQuestionIdx] = newQ;
        await syncSurveyAndSessionQuestions(current);
      }
      setEditingQuestionIdx(null);
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleMoveQuestionUp = async (idx: number) => {
    if (!selectedSurvey || idx <= 0) return;
    const next = [...selectedSurvey.questions];
    const [moved] = next.splice(idx, 1);
    next.splice(idx - 1, 0, moved);
    await syncSurveyAndSessionQuestions(next);
  };

  const handleDeleteQuestion = async (idx: number) => {
    if (!selectedSurvey || selectedSurvey.questions.length <= 1) return;
    const target = selectedSurvey.questions[idx];
    const next = selectedSurvey.questions.filter((_, i) => i !== idx);
    const nextActive =
      selectedSession?.activeQuestionId === target?.id
        ? next[Math.max(0, idx - 1)]?.id || next[0]?.id || ''
        : undefined;
    await syncSurveyAndSessionQuestions(next, nextActive);
  };

  const handleSetActiveQuestion = async (questionId: string) => {
    if (!selectedSession) return;
    try {
      await updateDoc(doc(db, 'sessions', selectedSession.code), {
        activeQuestionId: questionId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sessions/${selectedSession.code}`);
    }
  };

  const handleToggleSessionStatus = async () => {
    if (!selectedSession) return;
    const isClosed =
      selectedSession.status === 'ditutup' || selectedSession.status === 'selesai';
    const nextStatus = isClosed ? 'aktif' : 'ditutup';
    try {
      await updateDoc(doc(db, 'sessions', selectedSession.code), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sessions/${selectedSession.code}`);
    }
  };

  const handleToggleShowResults = async () => {
    if (!selectedSession) return;
    const currentlyShown = selectedSession.showResults !== false;
    try {
      await updateDoc(doc(db, 'sessions', selectedSession.code), {
        showResults: !currentlyShown,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sessions/${selectedSession.code}`);
    }
  };

  const handleSimulate30Participants = async () => {
    if (!selectedSession || !selectedSurvey) return;
    if (selectedSession.status === 'ditutup' || selectedSession.status === 'selesai') {
      showTempNotice('Buka sesi terlebih dahulu untuk menjalankan simulasi.');
      return;
    }

    setSimulating(true);
    try {
      const questions = selectedSession.questions.length
        ? selectedSession.questions
        : selectedSurvey.questions;

      const ops: Array<() => void> = [];
      let batch = writeBatch(db);
      let opCount = 0;

      const flushBatch = async () => {
        if (opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      const runSuffix = Date.now().toString(36).slice(-4);
      for (let i = 0; i < 30; i++) {
        const pid = `demo_${runSuffix}_${String(i + 1).padStart(2, '0')}`;
        const name = DEMO_NAMES[i % DEMO_NAMES.length];
        const pRef = doc(db, 'sessions', selectedSession.code, 'participants', pid);
        batch.set(pRef, {
          name,
          isDemo: true,
          joinedAt: serverTimestamp(),
        });
        opCount++;
        if (opCount >= 400) await flushBatch();

        for (const q of questions) {
          let value: number | string | string[] = 3;
          if (q.type === 'scale') {
            const weighted = [1, 2, 2, 3, 3, 3, 4, 4, 5];
            value = weighted[Math.floor(Math.random() * weighted.length)];
          } else if (q.type === 'scale10') {
            const weighted10 = [5, 6, 7, 7, 8, 8, 8, 9, 9, 10];
            value = weighted10[Math.floor(Math.random() * weighted10.length)];
          } else if (q.type === 'wordcloud') {
            const w1 =
              DEMO_WORDCLOUD_POOL[Math.floor(Math.random() * DEMO_WORDCLOUD_POOL.length)];
            const w2 =
              DEMO_WORDCLOUD_POOL[Math.floor(Math.random() * DEMO_WORDCLOUD_POOL.length)];
            value = w1 === w2 ? [w1] : [w1, w2];
          } else if (q.type === 'choice' || q.type === 'yesno') {
            const opts =
              q.type === 'yesno' && q.options.length === 0 ? ['Ya', 'Tidak'] : q.options;
            value = opts[Math.floor(Math.random() * opts.length)] || 'Ya';
          } else if (q.type === 'multichoice') {
            const shuffled = [...q.options].sort(() => Math.random() - 0.5);
            const pickCount = Math.min(shuffled.length, Math.floor(Math.random() * 2) + 1);
            value = shuffled.slice(0, pickCount);
          } else {
            value =
              DEMO_TEXT_POOL[Math.floor(Math.random() * DEMO_TEXT_POOL.length)];
          }

          const rId = `${pid}_${q.id}`;
          const rRef = doc(db, 'sessions', selectedSession.code, 'responses', rId);
          batch.set(rRef, {
            pid,
            name,
            questionId: q.id,
            value,
            isDemo: true,
            updatedAt: serverTimestamp(),
          });
          opCount++;
          if (opCount >= 400) await flushBatch();
        }
      }

      await flushBatch();
      void ops;
      showTempNotice('30 peserta simulasi berhasil ditambahkan.');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `sessions/${selectedSession.code}`
      );
    } finally {
      setSimulating(false);
    }
  };

  const handleClearDemoData = async () => {
    if (!selectedSession) return;
    setClearingDemo(true);
    try {
      const demoParts = participants.filter((p) => p.isDemo || p.id.startsWith('demo_'));
      const demoResps = responses.filter(
        (r) => r.isDemo || r.pid.startsWith('demo_')
      );
      const refs = [
        ...demoParts.map((p) =>
          doc(db, 'sessions', selectedSession.code, 'participants', p.id)
        ),
        ...demoResps.map((r) =>
          doc(db, 'sessions', selectedSession.code, 'responses', r.id)
        ),
      ];
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      showTempNotice('Data simulasi berhasil dihapus.');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `sessions/${selectedSession.code}`
      );
    } finally {
      setClearingDemo(false);
    }
  };

  if (!authReady) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--toska)] animate-spin mb-3" />
        <p className="text-sm text-[var(--text-muted)]">
          Memeriksa sesi akun fasilitator...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex items-center justify-center">
        <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 text-center shadow-2xl shadow-black/40">
          <div className="w-12 h-12 rounded-2xl gradient-brand-bg flex items-center justify-center mx-auto mb-5 font-display font-extrabold text-xl text-white">
            F
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--toska)] mb-2">
            RUANG FASILITATOR
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text)] mb-3">
            Masuk dengan Google
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-6">
            Login Google hanya diperlukan bagi fasilitator untuk membuat survei,
            membuka sesi langsung, dan mengunduh hasil. Peserta tetap bisa
            bergabung tanpa akun.
          </p>

          {authError && (
            <div className="mb-4 rounded-xl bg-[#f87171]/15 border border-[#f87171]/40 px-4 py-3 text-xs text-[#f87171] text-left">
              <p>{authError}</p>
              <button
                type="button"
                onClick={clearAuthError}
                className="mt-1 underline cursor-pointer"
              >
                Tutup pesan
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={authLoading}
            onClick={signInWithGoogle}
            className="w-full min-h-[50px] rounded-2xl gradient-cta-bg hover:brightness-110 hover:-translate-y-px disabled:opacity-40 disabled:pointer-events-none font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer"
          >
            {authLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            <span>Masuk dengan Akun Google</span>
          </button>
        </div>
      </main>
    );
  }

  const hasDemoData =
    participants.some((p) => p.isDemo || p.id.startsWith('demo_')) ||
    responses.some((r) => r.isDemo || r.pid.startsWith('demo_'));

  const renderSessionControlCard = (
    survey: Survey | null,
    session: LiveSession | null,
    isDetailView: boolean
  ) => {
    const code = session?.code || '';
    const link = code ? buildParticipantJoinUrl(code) : '';

    return (
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--toska)]">
              KODE SESI
            </p>
            {ensuringSession && !code ? (
              <div className="flex items-center gap-2 mt-1 text-sm text-[var(--text-muted)]">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--toska)]" />
                <span>Menyiapkan kode...</span>
              </div>
            ) : (
              <div className="font-mono text-3xl font-bold tracking-[0.12em] text-[var(--toska-soft)] tabular-nums mt-0.5">
                {code ? formatSessionCode(code) : '------'}
              </div>
            )}
          </div>

          {isDetailView ? (
            <button
              type="button"
              onClick={() => setSelectedSurveyId(null)}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--toska)] inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Daftar survei</span>
            </button>
          ) : survey ? (
            <button
              type="button"
              onClick={() => handleOpenSurveyDashboard(survey)}
              className="text-xs font-medium text-[var(--toska)] hover:text-[var(--toska-soft)] inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Kelola sesi</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Sinkron otomatis
            </span>
          )}
        </div>

        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          {survey ? (
            <>
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--text)] leading-snug">
                  {survey.title}
                </h2>
                {survey.eventInfo && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {survey.eventInfo}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => openSettingsModal(survey)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--toska)] text-xs font-medium text-[var(--text)] cursor-pointer transition-colors"
                >
                  <span>Pengaturan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDownloadModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--toska)] text-xs font-medium text-[var(--text)] cursor-pointer transition-colors"
                >
                  <span>Unduh hasil</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicateSurvey(survey)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--toska)] text-xs font-medium text-[var(--text)] cursor-pointer transition-colors"
                >
                  <span>Duplikat</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!session}
                  onClick={() => setConfirmAction('clear')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f87171]/10 border border-[#f87171]/35 hover:bg-[#f87171]/20 disabled:opacity-40 text-xs font-medium text-[#f87171] cursor-pointer transition-colors"
                >
                  <span>Kosongkan jawaban</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmTargetSurvey(survey);
                    setConfirmAction('delete');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f87171]/10 border border-[#f87171]/35 hover:bg-[#f87171]/20 text-xs font-medium text-[#f87171] cursor-pointer transition-colors"
                >
                  <span>Hapus survei</span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="font-display text-base font-bold text-[var(--text)]">
                Belum ada sesi aktif
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Buat sesi di bawah untuk menghasilkan kode 6 digit dan tautan
                peserta yang langsung tersinkron ke dasbor &amp; layar presentasi.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] pt-4 space-y-2">
          <label
            htmlFor={isDetailView ? 'join-link-input-detail' : 'join-link-input-column'}
            className="block text-xs font-medium text-[var(--text-muted)]"
          >
            Tautan untuk peserta
          </label>
          <div className="flex items-center gap-2">
            <input
              id={isDetailView ? 'join-link-input-detail' : 'join-link-input-column'}
              type="text"
              readOnly
              value={link || 'Menunggu sesi dibuat...'}
              onFocus={(e) => {
                if (link) e.target.select();
              }}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)] focus:outline-none focus:border-[var(--toska)]"
            />
            <button
              type="button"
              disabled={!code}
              onClick={() => code && handleCopyJoinLink(code)}
              className="shrink-0 min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-[var(--toska-soft)] cursor-pointer transition-colors"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--daun)]" />
                  <span>Tersalin ✓</span>
                </>
              ) : (
                <span>Salin</span>
              )}
            </button>
          </div>
        </div>
      </section>
    );
  };

  const renderCreateSessionCard = (isModal: boolean) => {
    const draftJoinUrl = draftSessionCode
      ? buildParticipantJoinUrl(draftSessionCode)
      : '';
    const isDraftConnected = Boolean(
      draftProvisioned && draftProvisioned.code === draftSessionCode
    );

    return (
      <form
        onSubmit={handleCreateSessionSubmit}
        className={`w-full ${
          isModal ? 'max-w-[460px] mx-auto' : ''
        } bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-2xl shadow-black/40`}
      >
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">
            Buat sesi baru
          </h2>
          {isModal && (
            <button
              type="button"
              onClick={() => setShowCreateSessionModal(false)}
              aria-label="Tutup menu buat sesi baru"
              className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {/* Kode Sesi & Tautan Peserta otomatis terisi */}
          <div className="rounded-xl bg-[var(--surface-2)]/85 border border-[var(--border-strong)] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--toska)]">
                  KODE SESI BARU
                </p>
                <div className="font-mono text-xl font-bold tracking-[0.14em] text-[var(--toska-soft)] tabular-nums">
                  {draftSessionCode ? formatSessionCode(draftSessionCode) : '------'}
                </div>
              </div>
              <span
                style={{ backgroundColor: 'rgba(74, 222, 128, 0.14)' }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#4ade80]/30 text-[11px] font-semibold text-[var(--daun-soft)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--daun)]" />
                <span>{isDraftConnected ? 'Terkoneksi ✓' : 'Siap terhubung'}</span>
              </span>
            </div>

            <div className="space-y-1">
              <label
                htmlFor={isModal ? 'draft-link-modal' : 'draft-link-inline'}
                className="block text-[11px] font-medium text-[var(--text-muted)]"
              >
                Tautan untuk peserta (otomatis aktif saat disalin atau dibuat)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={isModal ? 'draft-link-modal' : 'draft-link-inline'}
                  type="text"
                  readOnly
                  value={draftJoinUrl}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-muted)] focus:outline-none focus:border-[var(--toska)]"
                />
                <button
                  type="button"
                  disabled={!draftSessionCode || activatingDraft}
                  onClick={handleCopyDraftJoinLink}
                  className="shrink-0 min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border-strong)] hover:border-[var(--toska)] disabled:opacity-40 text-xs font-semibold text-[var(--toska-soft)] cursor-pointer transition-colors"
                >
                  {activatingDraft ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : copiedDraftLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--daun)]" />
                      <span>Tersalin ✓</span>
                    </>
                  ) : (
                    <span>Salin</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-session-title"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              Judul survei
            </label>
            <input
              id="new-session-title"
              type="text"
              maxLength={160}
              required
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              placeholder="Persepsi Awal Peserta"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:ring-2 focus:ring-[#2dd4bf]/20 focus:outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50 transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="new-session-event"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              Nama acara &amp; tanggal
            </label>
            <input
              id="new-session-event"
              type="text"
              maxLength={160}
              value={newSessionEventInfo}
              onChange={(e) => setNewSessionEventInfo(e.target.value)}
              placeholder="Pelatihan Kepemimpinan · 28 Okt 2026"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:ring-2 focus:ring-[#2dd4bf]/20 focus:outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50 transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="new-session-template"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              Templat pertanyaan
            </label>
            <select
              id="new-session-template"
              value={newSessionTemplate}
              onChange={(e) =>
                handleTemplateSelectChange(e.target.value as TemplateType)
              }
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:ring-2 focus:ring-[#2dd4bf]/20 focus:outline-none text-sm font-medium text-[var(--text)] cursor-pointer transition-all"
            >
              {SURVEY_TEMPLATES.map((tpl) => (
                <option key={tpl.type} value={tpl.type}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-1 space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {selectedTemplatePreviewQuestions.map((q, idx) => (
              <p
                key={q.id}
                className="text-xs text-[var(--text-muted)] leading-relaxed"
              >
                {idx + 1}. {q.text}
              </p>
            ))}
          </div>

          <button
            type="submit"
            disabled={creatingNewSession || !newSessionTitle.trim()}
            className="w-full min-h-[46px] rounded-xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-black/30 transition-all cursor-pointer"
          >
            {creatingNewSession && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Buat &amp; Hubungkan Sesi</span>
          </button>
        </div>
      </form>
    );
  };

  const renderSharedModals = () => (
    <>
      {/* MODAL: Pengaturan Survei */}
      {showSettingsModal && panelSurvey && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[var(--text)]">
                Pengaturan Survei
              </h2>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="settings-title"
                  className="block text-xs font-semibold text-[var(--toska)] uppercase tracking-wider mb-1.5"
                >
                  Judul survei
                </label>
                <input
                  id="settings-title"
                  type="text"
                  maxLength={160}
                  value={settingsTitle}
                  onChange={(e) => setSettingsTitle(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-sm text-[var(--text)]"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-event-info"
                  className="block text-xs font-semibold text-[var(--toska)] uppercase tracking-wider mb-1.5"
                >
                  Nama acara &amp; tanggal
                </label>
                <input
                  id="settings-event-info"
                  type="text"
                  maxLength={160}
                  value={settingsEventInfo}
                  onChange={(e) => setSettingsEventInfo(e.target.value)}
                  placeholder="Pelatihan Kepemimpinan · 28 Okt 2026"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50"
                />
              </div>

              <label className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">
                    Izinkan peserta anonim
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Peserta boleh mengosongkan kolom nama.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settingsAllowAnon}
                  onChange={(e) => setSettingsAllowAnon(e.target.checked)}
                  className="w-5 h-5 accent-[#2dd4bf] cursor-pointer"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-medium text-[var(--text)] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveSettings}
                className="min-h-[42px] px-5 py-2 rounded-xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Simpan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Unduh hasil */}
      {showDownloadModal && panelSurvey && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[var(--text)]">
                Unduh Hasil Survei
              </h2>
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[var(--text-muted)]">
              Total {responses.length} jawaban dari {participants.length} peserta siap diekspor.
              File Excel berisi sheet <strong>Ringkasan</strong> dan{' '}
              <strong>Semua Jawaban</strong>.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  exportSessionToXlsx(panelSurvey.title, panelSurvey.questions, responses);
                  setShowDownloadModal(false);
                }}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl gradient-cta-bg hover:brightness-110 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Unduh Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  exportSessionToCsv(panelSurvey.title, panelSurvey.questions, responses);
                  setShowDownloadModal(false);
                }}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] font-semibold text-sm text-[var(--text)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[var(--toska)]" />
                <span>Unduh CSV (.csv)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Konfirmasi Kosongkan Jawaban / Hapus Survei */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-[var(--surface)] border border-[#f87171]/40 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold text-[#f87171]">
                {confirmAction === 'clear'
                  ? 'Kosongkan semua jawaban?'
                  : 'Hapus survei ini?'}
              </h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {confirmAction === 'clear'
                  ? 'Seluruh jawaban dan daftar peserta yang sudah masuk pada sesi ini akan dihapus permanen. Pertanyaan tetap dipertahankan.'
                  : `Survei "${
                      (confirmTargetSurvey || panelSurvey)?.title
                    }" beserta seluruh sesi dan jawabannya akan dihapus permanen.`}
              </p>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                disabled={processingConfirm}
                onClick={() => {
                  setConfirmAction(null);
                  setConfirmTargetSurvey(null);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-medium text-[var(--text)] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processingConfirm}
                onClick={handleConfirmAction}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#f87171] hover:brightness-110 text-[#06100e] font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
              >
                {processingConfirm && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>
                  {confirmAction === 'clear' ? 'Ya, Kosongkan' : 'Ya, Hapus'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Buat sesi baru */}
      {showCreateSessionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {renderCreateSessionCard(true)}
        </div>
      )}
    </>
  );

  // DASHBOARD VIEW FOR SELECTED SURVEY
  if (selectedSurvey) {
    const questions = selectedSurvey.questions;
    const activeQuestionId =
      selectedSession?.activeQuestionId || questions[0]?.id || '';
    const activeQuestionIdx = Math.max(
      0,
      questions.findIndex((q) => q.id === activeQuestionId)
    );
    const activeQuestion = questions[activeQuestionIdx] ?? questions[0] ?? null;

    const activeResponses = activeQuestion
      ? responses.filter((r) => r.questionId === activeQuestion.id)
      : [];
    const uniqueRespondentsCount = new Set(activeResponses.map((r) => r.pid)).size;

    const sessionCode = selectedSession?.code || '';
    const joinUrl = sessionCode ? buildParticipantJoinUrl(sessionCode) : '';
    const isSessionClosed =
      selectedSession?.status === 'ditutup' ||
      selectedSession?.status === 'selesai';
    const isShowingResults = selectedSession?.showResults !== false;

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {/* Top account bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span>
              Masuk sebagai{' '}
              <strong className="text-[var(--text)] font-medium">
                {user.email}
              </strong>
            </span>
            <button
              type="button"
              onClick={signOutUser}
              className="text-[var(--toska)] hover:text-[var(--toska-soft)] underline underline-offset-4 cursor-pointer"
            >
              Keluar
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            {statusNotice && (
              <span className="px-3 py-1 rounded-lg bg-[#4ade80]/15 border border-[#4ade80]/30 text-[var(--daun-soft)] font-medium">
                {statusNotice}
              </span>
            )}
            <button
              type="button"
              onClick={openCreateSessionMenu}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-cta-bg hover:brightness-110 text-xs font-bold cursor-pointer transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat sesi baru</span>
            </button>
          </div>
        </div>

        {/* Two-column Dashboard Layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* LEFT COLUMN (~340px) */}
          <div className="w-full lg:w-[340px] shrink-0 space-y-5">
            {/* Card 1: Kontrol sesi */}
            {renderSessionControlCard(selectedSurvey, selectedSession, true)}

            {/* Card 2: Pertanyaan */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-[var(--text)]">
                  Pertanyaan
                </h2>
                <button
                  type="button"
                  disabled={questions.length >= 30}
                  onClick={() => openQuestionModal('new')}
                  className="px-3 py-1.5 rounded-xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
                {questions.map((q, idx) => {
                  const isActive = activeQuestion?.id === q.id;
                  return (
                    <div
                      key={q.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSetActiveQuestion(q.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSetActiveQuestion(q.id);
                        }
                      }}
                      className={`group rounded-xl p-3 border transition-colors cursor-pointer flex items-start justify-between gap-2.5 ${
                        isActive
                          ? 'gradient-soft-bg border-[var(--border)] border-l-[3px] border-l-[var(--toska)]'
                          : 'bg-[var(--surface-2)]/70 border-[var(--border)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`font-mono text-xs font-bold pt-0.5 shrink-0 ${
                            isActive ? 'text-[var(--toska-soft)]' : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-[var(--text)] leading-snug line-clamp-2">
                            {q.text}
                          </p>
                          <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--toska)] mt-1">
                            {QUESTION_TYPE_LABELS[q.type]}
                          </span>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveQuestionUp(idx)}
                          aria-label="Naikkan urutan"
                          title="Naikkan urutan"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--toska)] hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuestionModal(idx)}
                          aria-label="Edit pertanyaan"
                          title="Edit pertanyaan"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--toska)] hover:bg-white/5 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={questions.length <= 1}
                          onClick={() => handleDeleteQuestion(idx)}
                          aria-label="Hapus pertanyaan"
                          title="Hapus pertanyaan"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[#f87171] hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Panel sesi langsung */}
          <div className="flex-1 min-w-0 w-full space-y-5">
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-5 sm:p-7 space-y-6">
              {/* Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {isSessionClosed ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f87171]/15 border border-[#f87171]/35 text-xs font-semibold text-[#f87171]">
                      <span className="w-2 h-2 rounded-full bg-[#f87171]" />
                      Sesi ditutup
                    </span>
                  ) : (
                    <span
                      style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#4ade80]/35 text-xs font-semibold text-[var(--daun-soft)]"
                    >
                      <span className="w-2 h-2 rounded-full bg-[var(--daun)]" />
                      Sesi dibuka
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={!selectedSession}
                    onClick={handleToggleSessionStatus}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors disabled:opacity-40"
                  >
                    {isSessionClosed ? (
                      <>
                        <Play className="w-3.5 h-3.5 text-[var(--daun)]" />
                        <span>Buka sesi</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-[#f87171]" />
                        <span>Tutup sesi</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={!selectedSession}
                    onClick={handleToggleShowResults}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors disabled:opacity-40"
                  >
                    {isShowingResults ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-[var(--toska)]" />
                        <span>Sembunyikan hasil</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[var(--daun)]" />
                        <span>Tampilkan hasil</span>
                      </>
                    )}
                  </button>
                </div>

                {sessionCode && (
                  <a
                    href={buildPresentationUrl(sessionCode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl gradient-brand-bg hover:brightness-110 text-white text-xs sm:text-sm font-bold shadow-lg shadow-black/30 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Mode presentasi</span>
                  </a>
                )}
              </div>

              {/* 3 Realtime Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3.5">
                  <div className="font-display text-2xl font-extrabold text-[var(--text)] tabular-nums">
                    {participants.length}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    peserta bergabung
                  </div>
                </div>
                <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3.5">
                  <div className="font-display text-2xl font-extrabold text-[var(--toska-soft)] tabular-nums">
                    {uniqueRespondentsCount}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    menjawab pertanyaan ini
                  </div>
                </div>
                <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3.5">
                  <div className="font-display text-2xl font-extrabold text-[var(--daun-soft)] tabular-nums">
                    {questions.length > 0 ? activeQuestionIdx + 1 : 0}/{questions.length}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    pertanyaan aktif
                  </div>
                </div>
              </div>

              {/* Active Question & Live Chart */}
              {activeQuestion ? (
                <div className="space-y-6 pt-2 border-t border-[var(--border)]">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--toska)]">
                      {QUESTION_TYPE_LABELS[activeQuestion.type]}
                    </span>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--text)] leading-snug mt-1.5">
                      {activeQuestion.text}
                    </h2>
                  </div>

                  {activeResponses.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]/60 py-14 px-6 text-center text-sm text-[var(--text-muted)]">
                      Menunggu jawaban pertama...
                    </div>
                  ) : (
                    <>
                      {(activeQuestion.type === 'scale' ||
                        activeQuestion.type === 'scale10') && (
                        <div className="space-y-5">
                          <div className="flex items-baseline gap-3">
                            <span className="font-display text-5xl font-extrabold gradient-brand-text tabular-nums">
                              {formatIdDecimal(scaleAvg, 1)}
                            </span>
                            <span className="text-sm text-[var(--text-muted)] tabular-nums">
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
                          />
                        </div>
                      )}

                      {activeQuestion.type === 'wordcloud' && (
                        <WordCloud responses={activeResponses} />
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
                        />
                      )}

                      {activeQuestion.type === 'text' && (
                        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                          {activeResponses.map((r) => (
                            <div
                              key={r.id}
                              className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3"
                            >
                              <p className="text-sm text-[var(--text)] leading-relaxed">
                                {formatResponseValue(r.value)}
                              </p>
                              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)] mt-1.5">
                                <span className="font-semibold text-[var(--toska)]">
                                  {r.name || 'Anonim'}
                                </span>
                                <span>
                                  {formatTimestampTime(r.updatedAt || r.createdAt)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {/* Bottom Navigation & Demo Simulator */}
              <div className="pt-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={activeQuestionIdx <= 0}
                    onClick={() => {
                      const prevQ = questions[activeQuestionIdx - 1];
                      if (prevQ) handleSetActiveQuestion(prevQ.id);
                    }}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-semibold text-[var(--text)] cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Sebelumnya</span>
                  </button>

                  <button
                    type="button"
                    disabled={activeQuestionIdx >= questions.length - 1}
                    onClick={() => {
                      const nextQ = questions[activeQuestionIdx + 1];
                      if (nextQ) handleSetActiveQuestion(nextQ.id);
                    }}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-bold cursor-pointer transition-all"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={simulating || !selectedSession}
                    onClick={handleSimulate30Participants}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] disabled:opacity-40 text-xs font-semibold text-[var(--toska-soft)] cursor-pointer transition-colors"
                  >
                    {simulating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Users className="w-3.5 h-3.5" />
                    )}
                    <span>Simulasikan 30 peserta</span>
                  </button>

                  {hasDemoData && (
                    <button
                      type="button"
                      disabled={clearingDemo}
                      onClick={handleClearDemoData}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#facc15]/10 border border-[#facc15]/35 hover:bg-[#facc15]/20 disabled:opacity-40 text-xs font-semibold text-[#facc15] cursor-pointer transition-colors"
                    >
                      {clearingDemo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>Hapus data simulasi</span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Modal shared placeholders handled via renderSharedModals() */}

        {/* MODAL: Tambah / Edit pertanyaan */}
        {editingQuestionIdx !== null && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-w-lg w-full bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-[var(--text)]">
                  {editingQuestionIdx === 'new'
                    ? 'Tambah Pertanyaan'
                    : 'Edit Pertanyaan'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingQuestionIdx(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="q-form-text"
                    className="block text-xs font-semibold text-[var(--toska)] uppercase tracking-wider mb-1.5"
                  >
                    Teks pertanyaan
                  </label>
                  <input
                    id="q-form-text"
                    type="text"
                    maxLength={200}
                    value={qFormText}
                    onChange={(e) => setQFormText(e.target.value)}
                    placeholder="Tulis pertanyaan Anda..."
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-sm text-[var(--text)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="q-form-type"
                    className="block text-xs font-semibold text-[var(--toska)] uppercase tracking-wider mb-1.5"
                  >
                    Tipe pertanyaan
                  </label>
                  <select
                    id="q-form-type"
                    value={qFormType}
                    onChange={(e) => {
                      const t = e.target.value as QuestionType;
                      setQFormType(t);
                      if (t === 'yesno') {
                        setQFormOptions(['Ya', 'Tidak']);
                      } else if (
                        (t === 'choice' || t === 'multichoice') &&
                        qFormOptions.length < 2
                      ) {
                        setQFormOptions(['Opsi 1', 'Opsi 2']);
                      }
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-sm text-[var(--text)]"
                  >
                    {(Object.keys(QUESTION_TYPE_NAMES) as QuestionType[]).map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_NAMES[t]}
                      </option>
                    ))}
                  </select>
                </div>

                {(qFormType === 'scale' || qFormType === 'scale10') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">
                        Label ujung kiri (1 = ...)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={qFormMinLabel}
                        onChange={(e) => setQFormMinLabel(e.target.value)}
                        className="w-full min-h-[40px] px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-xs sm:text-sm text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">
                        Label ujung kanan ({qFormType === 'scale10' ? '10' : '5'} = ...)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={qFormMaxLabel}
                        onChange={(e) => setQFormMaxLabel(e.target.value)}
                        className="w-full min-h-[40px] px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-xs sm:text-sm text-[var(--text)]"
                      />
                    </div>
                  </div>
                )}

                {(qFormType === 'choice' || qFormType === 'multichoice') && (
                  <div className="space-y-2">
                    <span className="block text-xs text-[var(--text-muted)]">
                      Daftar pilihan jawaban
                    </span>
                    {qFormOptions.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={120}
                          value={opt}
                          onChange={(e) => {
                            const next = [...qFormOptions];
                            next[oIdx] = e.target.value;
                            setQFormOptions(next);
                          }}
                          className="flex-1 min-h-[40px] px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--toska)] focus:outline-none text-xs sm:text-sm text-[var(--text)]"
                        />
                        {qFormOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setQFormOptions(qFormOptions.filter((_, i) => i !== oIdx))
                            }
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[#f87171] cursor-pointer"
                            aria-label="Hapus opsi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {qFormOptions.length < 10 && (
                      <button
                        type="button"
                        onClick={() =>
                          setQFormOptions([
                            ...qFormOptions,
                            `Opsi ${qFormOptions.length + 1}`,
                          ])
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--toska)] hover:text-[var(--toska-soft)] cursor-pointer pt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah pilihan</span>
                      </button>
                    )}
                  </div>
                )}

                {qFormType === 'yesno' && (
                  <p className="text-xs text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3">
                    Menampilkan dua tombol besar untuk peserta: <strong>Ya</strong> dan{' '}
                    <strong>Tidak</strong>.
                  </p>
                )}

                {qFormType === 'wordcloud' && (
                  <p className="text-xs text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3">
                    Peserta dapat menuliskan hingga 3 kata singkat yang otomatis digabung ke word cloud.
                  </p>
                )}

                {qFormType === 'text' && (
                  <p className="text-xs text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3">
                    Peserta dapat menuliskan jawaban terbuka (maksimal 200 karakter).
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQuestionIdx(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-medium text-[var(--text)] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingQuestion || !qFormText.trim()}
                  onClick={handleSaveQuestionModal}
                  className="min-h-[42px] px-5 py-2 rounded-xl gradient-cta-bg hover:brightness-110 disabled:opacity-40 text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  {savingQuestion && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Simpan</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {renderSharedModals()}
      </main>
    );
  }

  // SURVEY LIST + CREATE SESSION COLUMN VIEW
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--toska)] mb-1">
            DASBOR FASILITATOR
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[var(--text)]">
            Kelola &amp; Buat Sesi Survei
          </h1>
          <div className="flex items-center gap-3 text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            <span>Masuk sebagai {user.email}</span>
            <button
              type="button"
              onClick={signOutUser}
              className="text-[var(--toska)] hover:text-[var(--toska-soft)] underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {statusNotice && (
            <span className="px-3 py-1.5 rounded-xl bg-[#4ade80]/15 border border-[#4ade80]/30 text-xs text-[var(--daun-soft)] font-medium">
              {statusNotice}
            </span>
          )}
          <button
            type="button"
            onClick={openCreateSessionMenu}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl gradient-cta-bg hover:brightness-110 hover:-translate-y-px text-sm font-bold shadow-lg shadow-black/40 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Buat sesi baru</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* KOLOM BUAT SESI: Di bagian atasnya ada kartu KODE SESI + Tautan untuk peserta yang sinkron otomatis */}
        <div className="w-full lg:w-[360px] shrink-0 space-y-5">
          {renderSessionControlCard(panelSurvey, panelSession, false)}
          {renderCreateSessionCard(false)}
        </div>

        {/* KOLOM KANAN: Sinkronisasi Dasbor Real-Time & Daftar Survei */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {panelSurvey && panelSession && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {panelSession.status === 'ditutup' ||
                  panelSession.status === 'selesai' ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f87171]/15 border border-[#f87171]/35 text-xs font-semibold text-[#f87171]">
                      <span className="w-2 h-2 rounded-full bg-[#f87171]" />
                      Sesi ditutup
                    </span>
                  ) : (
                    <span
                      style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#4ade80]/35 text-xs font-semibold text-[var(--daun-soft)]"
                    >
                      <span className="w-2 h-2 rounded-full bg-[var(--daun)]" />
                      Sinkron otomatis · Sesi dibuka
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)] font-mono">
                    {formatSessionCode(panelSession.code)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenSurveyDashboard(panelSurvey)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] hover:border-[var(--toska)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                  >
                    <span>Kelola Pertanyaan &amp; Hasil</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--toska)]" />
                  </button>
                  <a
                    href={buildPresentationUrl(panelSession.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl gradient-brand-bg hover:brightness-110 text-xs font-bold text-white shadow-md shadow-black/30 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Mode presentasi</span>
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3">
                  <div className="font-display text-2xl font-extrabold text-[var(--text)] tabular-nums">
                    {participants.length}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    peserta bergabung
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3">
                  <div className="font-display text-2xl font-extrabold text-[var(--toska-soft)] tabular-nums">
                    {responses.length}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    total jawaban masuk
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3">
                  <div className="font-display text-2xl font-extrabold text-[var(--daun-soft)] tabular-nums">
                    {panelSurvey.questions.length}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    pertanyaan survei
                  </div>
                </div>
              </div>
            </section>
          )}

          {loadingData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-44 rounded-2xl bg-[var(--surface)] border border-[var(--border)] animate-pulse"
                />
              ))}
            </div>
          ) : surveys.length === 0 ? (
            <div className="bg-[var(--surface)] border border-dashed border-[var(--border-strong)] rounded-2xl p-8 text-center space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--toska)]">
                SIAP DIGUNAKAN
              </p>
              <h2 className="font-display text-xl font-bold text-[var(--text)]">
                Belum ada survei tersimpan
              </h2>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                Isi formulir <strong>Buat sesi baru</strong> di kolom sebelah kiri
                untuk membuat kode sesi 6 digit dan tautan peserta yang otomatis
                tersinkron ke Beranda, Dasbor, serta Layar Presentasi.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-bold text-[var(--text)]">
                Daftar Survei Anda ({surveys.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {surveys.map((survey) => {
                  const linkedSession =
                    sessions.find((s) => s.code === survey.activeSessionCode) ||
                    sessions.find((s) => s.surveyId === survey.id);
                  const isOpen =
                    linkedSession &&
                    linkedSession.status !== 'ditutup' &&
                    linkedSession.status !== 'selesai';
                  const isSyncedPanel = panelSurvey?.id === survey.id;

                  return (
                    <div
                      key={survey.id}
                      className={`bg-[var(--surface)] border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                        isSyncedPanel
                          ? 'border-[var(--toska)] shadow-lg shadow-black/25'
                          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {linkedSession ? (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-mono tabular-nums ${
                                  isOpen
                                    ? 'bg-[#4ade80]/15 border border-[#4ade80]/30 text-[var(--daun-soft)]'
                                    : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]'
                                }`}
                              >
                                <Check className="w-3 h-3 text-[var(--daun)]" />
                                {formatSessionCode(linkedSession.code)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--toska)]">
                                SIAP DIBUKA
                              </span>
                            )}
                            {isSyncedPanel && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--daun-soft)]">
                                · Aktif di panel
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[var(--text-muted)]">
                            {formatIndonesianDate(survey.updatedAt)}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-display text-lg font-bold text-[var(--text)] leading-snug">
                            {survey.title}
                          </h3>
                          {survey.eventInfo && (
                            <p className="text-xs text-[var(--toska)] mt-0.5">
                              {survey.eventInfo}
                            </p>
                          )}
                        </div>

                        <p className="text-xs text-[var(--text-muted)]">
                          {survey.questions.length} pertanyaan ·{' '}
                          {survey.allowAnonymous ? 'Anonim diizinkan' : 'Wajib isi nama'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
                        <button
                          type="button"
                          onClick={() => handleOpenSurveyDashboard(survey)}
                          className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl gradient-brand-bg hover:brightness-110 text-xs font-bold text-white transition-all cursor-pointer"
                        >
                          Kelola Sesi
                        </button>
                        {linkedSession && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSessionCode(linkedSession.code);
                              handleCopyJoinLink(linkedSession.code);
                            }}
                            title="Salin tautan peserta"
                            aria-label="Salin tautan peserta"
                            className="min-h-[40px] px-3 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] hover:border-[var(--toska)] border border-[var(--border)] text-xs font-semibold text-[var(--toska-soft)] transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDuplicateSurvey(survey)}
                          title="Duplikat survei"
                          aria-label="Duplikat survei"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[var(--surface-2)] hover:border-[var(--toska)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmTargetSurvey(survey);
                            setConfirmAction('delete');
                          }}
                          title="Hapus survei"
                          aria-label="Hapus survei"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[var(--surface-2)] hover:border-[#f87171]/60 border border-[var(--border)] text-[var(--text-muted)] hover:text-[#f87171] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {renderSharedModals()}
    </main>
  );
}
