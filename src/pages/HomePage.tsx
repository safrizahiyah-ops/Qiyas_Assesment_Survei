import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { HeroPreviewCard } from '../components/HeroPreviewCard';
import { useFirebase } from '../context/FirebaseContext';
import { formatSessionCode } from '../lib/templates';

const STEPS = [
  {
    num: '1',
    title: 'Pilih templat',
    description: 'Persepsi awal, ekspektasi, atau evaluasi akhir.',
  },
  {
    num: '2',
    title: 'Bagikan kode',
    description: 'Peserta bergabung lewat kode 6 digit atau QR.',
  },
  {
    num: '3',
    title: 'Tampilkan hasil',
    description: 'Grafik dan word cloud diperbarui secara langsung.',
  },
  {
    num: '4',
    title: 'Unduh data',
    description: 'Simpan ke Excel atau CSV untuk laporan pelatihan.',
  },
];

export function HomePage() {
  const { activeSessionCode } = useFirebase();
  const hasActiveSession = /^[0-9]{6}$/.test(activeSessionCode);
  const presentationPath = hasActiveSession
    ? `/layar/${activeSessionCode}`
    : '/layar/demo';
  const participantPath = hasActiveSession
    ? `/peserta?kode=${activeSessionCode}`
    : '/peserta';

  const roles = [
    {
      letter: 'F',
      title: 'Fasilitator',
      description:
        'Susun pertanyaan dari templat, buka sesi, unduh hasil, dan hapus survei lama.',
      to: '/fasilitator',
      iconClass: 'bg-[var(--toska)] text-[var(--text-on-accent)]',
    },
    {
      letter: 'L',
      title: 'Layar presentasi',
      description:
        'Tampilan besar untuk proyektor: kode sesi, QR, dan grafik yang bergerak saat jawaban masuk.',
      to: presentationPath,
      iconClass: 'bg-[var(--botol)] text-white',
    },
    {
      letter: 'P',
      title: 'Peserta',
      description:
        'Masukkan kode sesi, isi nama atau tetap anonim, lalu jawab dari ponsel.',
      to: participantPath,
      iconClass: 'bg-[var(--daun)] text-[var(--text-on-accent)]',
    },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-16 sm:space-y-20">
      {/* Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-[var(--toska)] mb-4">
            SURVEI LANGSUNG UNTUK PELATIHAN &amp; SEMINAR
          </p>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.35rem] font-extrabold text-[var(--text)] leading-[1.1] tracking-tight text-balance mb-6">
            Kenali peserta Anda{' '}
            <span className="gradient-hero-word">sebelum</span> materi dimulai.
          </h1>

          <p className="text-base sm:text-lg text-[var(--text-muted)] leading-relaxed max-w-xl mb-8">
            Peserta menjawab dari ponsel dengan kode 6 digit atau QR, tanpa perlu
            membuat akun. Hasilnya langsung tampil di layar proyektor, jadi Anda
            bisa menyesuaikan pembukaan sesi dengan pemahaman dan harapan mereka.
          </p>

          <div className="flex flex-wrap items-center gap-3.5">
            <Link
              to="/fasilitator"
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl gradient-cta-bg hover:brightness-110 hover:-translate-y-px font-bold text-sm sm:text-base shadow-lg shadow-black/40 transition-all whitespace-nowrap"
            >
              <span>Kelola survei</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to={participantPath}
              className="min-h-[48px] inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--toska)] border border-[var(--border-strong)] text-[var(--text)] font-semibold text-sm sm:text-base transition-colors whitespace-nowrap"
            >
              Saya peserta
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6">
          <HeroPreviewCard />
        </div>
      </section>

      {/* 3 Role Cards */}
      <section aria-label="Peran pengguna">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {roles.map((role) => (
            <Link
              key={role.title}
              to={role.to}
              className="group bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--toska)] rounded-2xl p-6 transition-colors flex flex-col justify-between"
            >
              <div>
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-display font-extrabold text-lg mb-4 ${role.iconClass}`}
                >
                  {role.letter}
                </div>
                <h2 className="font-display text-xl font-bold text-[var(--text)] mb-2 group-hover:text-[var(--toska-soft)] transition-colors">
                  {role.title}
                </h2>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  {role.description}
                </p>
              </div>
              <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--toska)] group-hover:text-[var(--daun)] transition-colors">
                <span>Buka halaman</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4 Steps with Toska Top Line */}
      <section aria-label="Cara kerja Qiyas">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="border-t-2 border-[var(--toska)] pt-5"
            >
              <div className="font-mono text-xs font-bold text-[var(--toska)] mb-2 tabular-nums">
                LANGKAH {step.num}
              </div>
              <h3 className="font-display text-lg font-bold text-[var(--text)] mb-1.5">
                {step.title}
              </h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Mode Demo & Live Session Info */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--toska)]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {hasActiveSession
                ? 'Sesi Aktif & Sinkronisasi Real-Time'
                : 'Mode Demo & Koneksi Real-Time'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {hasActiveSession ? (
              <>
                Sesi aktif saat ini menggunakan kode{' '}
                <span className="font-mono font-bold text-[var(--toska-soft)]">
                  {formatSessionCode(activeSessionCode)}
                </span>{' '}
                dan tersinkron otomatis ke Beranda, Dasbor Fasilitator, serta
                Layar Presentasi.
              </>
            ) : (
              <>
                Ingin langsung melihat tampilan proyektor atau simulasi peserta
                tanpa login? Gunakan kode demo{' '}
                <span className="font-mono font-bold text-[var(--toska-soft)]">
                  482 913
                </span>{' '}
                atau buka layar presentasi demo.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to={presentationPath}
            className="min-h-[40px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[var(--surface-2)] hover:border-[var(--toska)] border border-[var(--border-strong)] text-xs sm:text-sm font-semibold text-[var(--text)] transition-colors whitespace-nowrap"
          >
            {hasActiveSession ? 'Buka Layar Presentasi' : 'Coba Layar Presentasi'}
          </Link>
          <Link
            to={hasActiveSession ? `/peserta?kode=${activeSessionCode}` : '/peserta?kode=482913'}
            className="min-h-[40px] inline-flex items-center justify-center px-4 py-2 rounded-xl gradient-brand-bg hover:brightness-110 text-xs sm:text-sm font-bold text-white transition-all whitespace-nowrap"
          >
            {hasActiveSession ? 'Buka Halaman Peserta' : 'Coba Mode Peserta'}
          </Link>
        </div>
      </section>
    </main>
  );
}
