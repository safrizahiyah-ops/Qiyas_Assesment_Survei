import * as XLSX from 'xlsx';
import type {
  LiveSession,
  Question,
  QuestionType,
  SurveyResponse,
  TemplateType,
} from '../types/survey';

export const DEFAULT_SCALE_LABELS = [
  'Belum paham sama sekali',
  'Sedikit paham',
  'Cukup paham',
  'Paham',
  'Sangat paham',
];

export const ENTHUSIASM_SCALE_LABELS = [
  'Kurang antusias',
  'Biasa saja',
  'Cukup antusias',
  'Antusias',
  'Sangat antusias',
];

export const SATISFACTION_SCALE_LABELS = [
  'Sangat kurang',
  'Kurang',
  'Cukup baik',
  'Baik',
  'Sangat baik',
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  scale: 'SKALA LIKERT 1–5',
  scale10: 'SKALA 1–10',
  wordcloud: 'WORD CLOUD',
  choice: 'PILIHAN GANDA',
  multichoice: 'BANYAK PILIHAN',
  yesno: 'YA / TIDAK',
  text: 'TEKS BEBAS',
};

export const QUESTION_TYPE_NAMES: Record<QuestionType, string> = {
  scale: 'Skala Likert 1-5',
  scale10: 'Skala 1-10',
  wordcloud: 'Word Cloud',
  choice: 'Pilihan Ganda',
  multichoice: 'Banyak Pilihan',
  yesno: 'Ya / Tidak',
  text: 'Teks Bebas',
};

export function createQuestionId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export function buildParticipantJoinUrl(code: string): string {
  if (typeof window === 'undefined') {
    return `/#/peserta?kode=${code}`;
  }
  return `${window.location.origin}/#/peserta?kode=${code}`;
}

export function buildPresentationUrl(code: string): string {
  if (typeof window === 'undefined') {
    return `/#/layar/${code}`;
  }
  return `${window.location.origin}/#/layar/${code}`;
}

export interface TemplateOption {
  type: TemplateType;
  name: string;
  subtitle: string;
  defaultTitle: string;
  questions: () => Question[];
}

export const SURVEY_TEMPLATES: TemplateOption[] = [
  {
    type: 'persepsi_awal',
    name: 'Persepsi Awal Peserta',
    subtitle:
      '7 pertanyaan siap pakai: skala 1-5, word cloud, pilihan ganda, ya/tidak, banyak pilihan, skala 1-10, dan teks bebas.',
    defaultTitle: 'Persepsi Awal Peserta',
    questions: () => [
      {
        id: createQuestionId(),
        type: 'scale',
        text: 'Seberapa paham Anda tentang topik pelatihan ini?',
        labels: [...DEFAULT_SCALE_LABELS],
        options: [],
        scaleMin: 'Belum paham sama sekali',
        scaleMax: 'Sangat paham',
      },
      {
        id: createQuestionId(),
        type: 'wordcloud',
        text: 'Tulis 1-3 kata yang muncul di benak Anda saat mendengar topik ini.',
        labels: [],
        options: [],
      },
      {
        id: createQuestionId(),
        type: 'choice',
        text: 'Apa harapan utama Anda dari pelatihan ini?',
        labels: [],
        options: [
          'Memahami konsep dasar dengan jelas',
          'Mendapat studi kasus dan praktik langsung',
          'Meningkatkan keterampilan kerja sehari-hari',
          'Berdiskusi dan bertukar pengalaman',
        ],
      },
      {
        id: createQuestionId(),
        type: 'yesno',
        text: 'Pernahkah Anda mengikuti pelatihan dengan topik serupa?',
        labels: [],
        options: ['Ya', 'Tidak'],
      },
      {
        id: createQuestionId(),
        type: 'multichoice',
        text: 'Metode belajar apa yang paling cocok untuk Anda? (boleh lebih dari satu)',
        labels: [],
        options: [
          'Diskusi kelompok interaktif',
          'Studi kasus nyata',
          'Simulasi dan praktik langsung',
          'Penjelasan visual dan ringkasan',
        ],
      },
      {
        id: createQuestionId(),
        type: 'scale10',
        text: 'Seberapa termotivasi Anda mengikuti sesi hari ini?',
        labels: [],
        options: [],
        scaleMin: 'Kurang termotivasi',
        scaleMax: 'Sangat termotivasi',
      },
      {
        id: createQuestionId(),
        type: 'text',
        text: 'Satu pertanyaan yang paling ingin Anda dapatkan jawabannya hari ini?',
        labels: [],
        options: [],
      },
    ],
  },
  {
    type: 'ekspektasi',
    name: 'Ekspektasi Pelatihan',
    subtitle: 'Tangkap harapan peserta dan tingkat antusiasme mereka di awal sesi.',
    defaultTitle: 'Ekspektasi Pelatihan',
    questions: () => [
      {
        id: createQuestionId(),
        type: 'text',
        text: 'Apa yang paling ingin Anda pelajari hari ini?',
        labels: [],
        options: [],
      },
      {
        id: createQuestionId(),
        type: 'scale',
        text: 'Seberapa antusias Anda mengikuti pelatihan ini?',
        labels: [...ENTHUSIASM_SCALE_LABELS],
        options: [],
        scaleMin: 'Kurang antusias',
        scaleMax: 'Sangat antusias',
      },
    ],
  },
  {
    type: 'evaluasi_akhir',
    name: 'Evaluasi Akhir',
    subtitle:
      'Kumpulkan umpan balik kepuasan materi, narasumber, manfaat, dan saran perbaikan.',
    defaultTitle: 'Evaluasi Akhir',
    questions: () => [
      {
        id: createQuestionId(),
        type: 'scale',
        text: 'Bagaimana kepuasan Anda terhadap materi pelatihan?',
        labels: [...SATISFACTION_SCALE_LABELS],
        options: [],
        scaleMin: 'Sangat kurang',
        scaleMax: 'Sangat baik',
      },
      {
        id: createQuestionId(),
        type: 'scale',
        text: 'Bagaimana penilaian Anda terhadap kualitas narasumber?',
        labels: [...SATISFACTION_SCALE_LABELS],
        options: [],
        scaleMin: 'Sangat kurang',
        scaleMax: 'Sangat baik',
      },
      {
        id: createQuestionId(),
        type: 'scale10',
        text: 'Seberapa besar kemungkinan Anda merekomendasikan pelatihan ini?',
        labels: [],
        options: [],
        scaleMin: 'Tidak mungkin',
        scaleMax: 'Sangat mungkin',
      },
      {
        id: createQuestionId(),
        type: 'text',
        text: 'Saran atau masukan Anda untuk sesi berikutnya',
        labels: [],
        options: [],
      },
    ],
  },
  {
    type: 'kosong',
    name: 'Mulai dari kosong',
    subtitle: 'Mulai dari nol dan susun pertanyaan Anda sendiri sesuai kebutuhan acara.',
    defaultTitle: 'Survei Baru',
    questions: () => [
      {
        id: createQuestionId(),
        type: 'scale',
        text: 'Pertanyaan skala pertama Anda',
        labels: [...DEFAULT_SCALE_LABELS],
        options: [],
        scaleMin: 'Sangat rendah',
        scaleMax: 'Sangat tinggi',
      },
    ],
  },
];

export function formatIdDecimal(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return '0,0';
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatSessionCode(code: string): string {
  const clean = code.replace(/\D/g, '').slice(0, 6);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

export function formatIndonesianDate(input: unknown): string {
  if (!input) return 'Baru saja';
  let date: Date | null = null;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'object' && input !== null && 'toDate' in input) {
    date = (input as { toDate: () => Date }).toDate();
  }
  if (!date || Number.isNaN(date.getTime())) return 'Baru saja';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimestampTime(input: unknown): string {
  if (!input) return '-';
  let date: Date | null = null;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'object' && input !== null && 'toDate' in input) {
    date = (input as { toDate: () => Date }).toDate();
  }
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function getScaleEdgeLabels(q: Question): { minLabel: string; maxLabel: string } {
  if (q.type === 'scale10') {
    return {
      minLabel: q.scaleMin?.trim() || 'Sangat rendah',
      maxLabel: q.scaleMax?.trim() || 'Sangat tinggi',
    };
  }
  return {
    minLabel: q.scaleMin?.trim() || q.labels?.[0] || DEFAULT_SCALE_LABELS[0],
    maxLabel: q.scaleMax?.trim() || q.labels?.[4] || DEFAULT_SCALE_LABELS[4],
  };
}

export function formatResponseValue(val: number | string | string[]): string {
  if (Array.isArray(val)) return val.join(', ');
  return String(val ?? '');
}

export const DEMO_SESSION: LiveSession = {
  code: '482913',
  surveyId: 'demo-persepsi-awal',
  ownerUid: 'demo-facilitator',
  surveyTitle: 'Persepsi Awal Peserta',
  allowAnonymous: true,
  status: 'aktif',
  showResults: true,
  activeQuestionId: 'demo-q1',
  questions: [
    {
      id: 'demo-q1',
      type: 'scale',
      text: 'Seberapa paham Anda tentang topik pelatihan ini?',
      labels: [...DEFAULT_SCALE_LABELS],
      options: [],
      scaleMin: 'Belum paham sama sekali',
      scaleMax: 'Sangat paham',
    },
    {
      id: 'demo-q2',
      type: 'wordcloud',
      text: 'Tulis 1-3 kata yang muncul di benak Anda saat mendengar topik ini.',
      labels: [],
      options: [],
    },
    {
      id: 'demo-q3',
      type: 'choice',
      text: 'Apa harapan utama Anda dari pelatihan ini?',
      labels: [],
      options: [
        'Memahami konsep dasar dengan jelas',
        'Mendapat studi kasus dan praktik langsung',
        'Meningkatkan keterampilan kerja sehari-hari',
        'Berdiskusi dan bertukar pengalaman',
      ],
    },
  ],
};

export const DEMO_RESPONSES: SurveyResponse[] = [
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `dq1-1-${i}`,
    pid: `p1-${i}`,
    name: 'Anonim',
    questionId: 'demo-q1',
    value: 1,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `dq1-2-${i}`,
    pid: `p2-${i}`,
    name: 'Anonim',
    questionId: 'demo-q1',
    value: 2,
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `dq1-3-${i}`,
    pid: `p3-${i}`,
    name: 'Anonim',
    questionId: 'demo-q1',
    value: 3,
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `dq1-4-${i}`,
    pid: `p4-${i}`,
    name: 'Anonim',
    questionId: 'demo-q1',
    value: 4,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `dq1-5-${i}`,
    pid: `p5-${i}`,
    name: 'Anonim',
    questionId: 'demo-q1',
    value: 5,
  })),
  ...[
    ['Kolaborasi', 'Praktis'],
    ['Inspiratif', 'Kolaborasi'],
    ['Komunikasi', 'Empati'],
    ['Kolaborasi', 'Strategis'],
    ['Inspiratif', 'Solutif'],
    ['Praktis', 'Relevan'],
    ['Kolaborasi', 'Terstruktur'],
    ['Komunikasi', 'Antusias'],
  ].map((words, idx) => ({
    id: `dq2-${idx}`,
    pid: `w-${idx}`,
    name: 'Anonim',
    questionId: 'demo-q2',
    value: words,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `dq3-1-${i}`,
    pid: `c1-${i}`,
    name: 'Anonim',
    questionId: 'demo-q3',
    value: 'Memahami konsep dasar dengan jelas',
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `dq3-2-${i}`,
    pid: `c2-${i}`,
    name: 'Anonim',
    questionId: 'demo-q3',
    value: 'Mendapat studi kasus dan praktik langsung',
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `dq3-3-${i}`,
    pid: `c3-${i}`,
    name: 'Anonim',
    questionId: 'demo-q3',
    value: 'Meningkatkan keterampilan kerja sehari-hari',
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `dq3-4-${i}`,
    pid: `c4-${i}`,
    name: 'Anonim',
    questionId: 'demo-q3',
    value: 'Berdiskusi dan bertukar pengalaman',
  })),
];

export function computeWordCloudItems(responses: SurveyResponse[]) {
  const counts = new Map<string, { display: string; count: number }>();

  const addToken = (rawToken: string) => {
    const clean = rawToken.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        display: clean.charAt(0).toUpperCase() + clean.slice(1),
        count: 1,
      });
    }
  };

  for (const r of responses) {
    if (Array.isArray(r.value)) {
      r.value.forEach((w) => addToken(String(w ?? '')));
    } else {
      const raw = String(r.value ?? '').trim();
      if (!raw) continue;
      if (raw.includes(',')) {
        raw.split(',').forEach(addToken);
      } else {
        addToken(raw);
      }
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export function exportSessionToXlsx(
  surveyTitle: string,
  questions: Question[],
  responses: SurveyResponse[]
) {
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  const summaryRows: Array<Record<string, string | number>> = [];
  questions.forEach((q, idx) => {
    const qRes = responses.filter((r) => r.questionId === q.id);
    if (q.type === 'scale' || q.type === 'scale10') {
      const maxStep = q.type === 'scale10' ? 10 : 5;
      const nums = qRes
        .map((r) => Number(r.value))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= maxStep);
      const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      const steps = Array.from({ length: maxStep }, (_, i) => i + 1);
      summaryRows.push({
        No: idx + 1,
        Pertanyaan: q.text,
        Tipe: QUESTION_TYPE_NAMES[q.type],
        'Total Jawaban': nums.length,
        'Rata-rata': formatIdDecimal(avg, 2),
        Rincian: steps
          .map((n) => `${n}: ${nums.filter((v) => v === n).length}`)
          .join(' | '),
      });
    } else if (q.type === 'choice' || q.type === 'yesno') {
      const opts = q.type === 'yesno' && q.options.length === 0 ? ['Ya', 'Tidak'] : q.options;
      const optionCounts = opts.map((opt) => {
        const count = qRes.filter((r) => String(r.value) === opt).length;
        return `${opt}: ${count}`;
      });
      summaryRows.push({
        No: idx + 1,
        Pertanyaan: q.text,
        Tipe: QUESTION_TYPE_NAMES[q.type],
        'Total Jawaban': qRes.length,
        'Rata-rata': '-',
        Rincian: optionCounts.join(' | '),
      });
    } else if (q.type === 'multichoice') {
      const optionCounts = q.options.map((opt) => {
        const count = qRes.filter((r) =>
          Array.isArray(r.value) ? r.value.includes(opt) : String(r.value) === opt
        ).length;
        return `${opt}: ${count}`;
      });
      summaryRows.push({
        No: idx + 1,
        Pertanyaan: q.text,
        Tipe: QUESTION_TYPE_NAMES[q.type],
        'Total Jawaban': qRes.length,
        'Rata-rata': '-',
        Rincian: optionCounts.join(' | '),
      });
    } else if (q.type === 'wordcloud') {
      const words = computeWordCloudItems(qRes)
        .slice(0, 10)
        .map((w) => `${w.display} (${w.count})`)
        .join(', ');
      summaryRows.push({
        No: idx + 1,
        Pertanyaan: q.text,
        Tipe: QUESTION_TYPE_NAMES[q.type],
        'Total Jawaban': qRes.length,
        'Rata-rata': '-',
        Rincian: words || '-',
      });
    } else {
      const preview = qRes
        .slice(0, 5)
        .map((r) => formatResponseValue(r.value))
        .join(' | ');
      summaryRows.push({
        No: idx + 1,
        Pertanyaan: q.text,
        Tipe: QUESTION_TYPE_NAMES[q.type],
        'Total Jawaban': qRes.length,
        'Rata-rata': '-',
        Rincian: preview || '-',
      });
    }
  });

  const rows = responses.map((r) => {
    const q = questionMap.get(r.questionId);
    return {
      Waktu: formatTimestampTime(r.updatedAt || r.createdAt),
      Nama: r.name || 'Anonim',
      Pertanyaan: q?.text || r.questionId,
      Tipe: q ? QUESTION_TYPE_NAMES[q.type] : '-',
      Jawaban: formatResponseValue(r.value),
    };
  });

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(
    summaryRows.length > 0
      ? summaryRows
      : [
          {
            No: '-',
            Pertanyaan: 'Belum ada pertanyaan',
            Tipe: '-',
            'Total Jawaban': 0,
            'Rata-rata': '-',
            Rincian: '-',
          },
        ]
  );
  const wsAnswers = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [
          {
            Waktu: '-',
            Nama: '-',
            Pertanyaan: 'Belum ada jawaban',
            Tipe: '-',
            Jawaban: '-',
          },
        ]
  );

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, wsAnswers, 'Semua Jawaban');

  const safeName =
    surveyTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'hasil-survei';
  XLSX.writeFile(wb, `qiyas-${safeName}.xlsx`);
}

export function exportSessionToCsv(
  surveyTitle: string,
  questions: Question[],
  responses: SurveyResponse[]
) {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const escapeCsv = (val: string) => {
    const s = val.replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [
    ['Waktu', 'Nama', 'Pertanyaan', 'Tipe', 'Jawaban'].map(escapeCsv).join(','),
    ...responses.map((r) => {
      const q = questionMap.get(r.questionId);
      return [
        formatTimestampTime(r.updatedAt || r.createdAt),
        r.name || 'Anonim',
        q?.text || r.questionId,
        q ? QUESTION_TYPE_NAMES[q.type] : '-',
        formatResponseValue(r.value),
      ]
        .map(escapeCsv)
        .join(',');
    }),
  ];

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName =
    surveyTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'hasil-survei';
  a.href = url;
  a.download = `qiyas-${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
