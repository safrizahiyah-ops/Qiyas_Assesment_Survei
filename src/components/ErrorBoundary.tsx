import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = 'Terjadi gangguan pada aplikasi saat memuat data.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission')) {
          friendly = 'Akses ke data ditolak oleh aturan keamanan Firestore.';
        } else {
          friendly = parsed.error;
        }
      }
    } catch {
      if (error.message) {
        friendly = error.message;
      }
    }
    return { hasError: true, message: friendly };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f87171]/15 border border-[#f87171]/35 flex items-center justify-center mx-auto mb-5 text-[#f87171]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold font-display mb-2">
              Terjadi Kesalahan Sistem
            </h1>
            <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl gradient-cta-bg font-bold text-sm hover:brightness-110 hover:-translate-y-px transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
