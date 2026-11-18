import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';

export function Header() {
  const { pathname } = useLocation();
  const { isConnected, activeSessionCode } = useFirebase();
  const [mobileOpen, setMobileOpen] = useState(false);

  const presentationTarget = activeSessionCode
    ? `/layar/${activeSessionCode}`
    : '/layar/demo';

  const navItems = [
    { label: 'Beranda', to: '/' },
    { label: 'Fasilitator', to: '/fasilitator' },
    { label: 'Layar Presentasi', to: presentationTarget },
    { label: 'Peserta', to: '/peserta' },
  ];

  const isActive = (to: string) => {
    if (to === '/') return pathname === '/';
    if (to.startsWith('/layar')) return pathname.startsWith('/layar');
    return pathname.startsWith(to);
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-header)]/95 backdrop-blur-md border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand + Firestore Connection Status */}
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-3 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toska)] rounded-xl"
          >
            <span className="w-9 h-9 rounded-full gradient-brand-bg flex items-center justify-center text-white font-display font-extrabold text-lg shadow-lg shadow-[#2dd4bf]/20">
              Q
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display font-extrabold tracking-wider text-sm sm:text-base gradient-brand-text whitespace-nowrap">
                QIYAS
              </span>
              <span className="text-[11px] font-medium text-[var(--toska)] tracking-wide whitespace-nowrap mt-0.5">
                قِيَاس · Penilaian &amp; Pendidikan
              </span>
            </span>
          </Link>

          <div
            className="hidden sm:flex items-center gap-2 pl-3 border-l border-[var(--border)] text-xs font-medium whitespace-nowrap shrink-0"
            title={
              isConnected
                ? 'Terhubung ke database Firestore'
                : 'Koneksi database terputus'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-[var(--daun)] shadow-[0_0_8px_rgba(74,222,128,0.75)]'
                  : 'bg-[#f87171]'
              }`}
              aria-hidden="true"
            />
            <span
              className={
                isConnected ? 'text-[var(--daun-soft)]' : 'text-[#f87171]'
              }
            >
              {isConnected ? 'Tersambung' : 'Terputus'}
            </span>
          </div>
        </div>

        {/* Right: Pill Navigation */}
        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-1 p-1 rounded-full bg-[var(--surface)] border border-[var(--border)] shrink-0"
        >
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toska)] ${
                  active
                    ? 'bg-[var(--surface-2)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Controls */}
        <div className="flex md:hidden items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-[var(--daun)]' : 'bg-[#f87171]'
              }`}
              aria-hidden="true"
            />
            <span
              className={
                isConnected ? 'text-[var(--daun-soft)]' : 'text-[#f87171]'
              }
            >
              {isConnected ? 'Tersambung' : 'Terputus'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--toska)] transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileOpen && (
        <nav
          aria-label="Navigasi seluler"
          className="md:hidden px-4 pb-4 pt-2 border-t border-[var(--border)] bg-[var(--bg-header)] grid grid-cols-2 gap-2"
        >
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={`min-h-[44px] flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)]'
                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
