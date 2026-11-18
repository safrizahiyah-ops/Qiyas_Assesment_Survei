import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { buildParticipantJoinUrl, copyToClipboard, formatSessionCode } from '../lib/templates';

interface QRBlockProps {
  code: string;
  size?: number;
  showCopy?: boolean;
  projector?: boolean;
}

export function QRBlock({
  code,
  size = 176,
  showCopy = true,
  projector = false,
}: QRBlockProps) {
  const [copied, setCopied] = useState(false);
  const host = typeof window !== 'undefined' ? window.location.host : 'qiyas.app';
  const joinUrl = buildParticipantJoinUrl(code);

  const handleCopy = async () => {
    const ok = await copyToClipboard(joinUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`bg-white rounded-2xl border-2 border-[var(--toska)] shadow-xl shadow-black/40 ${
          projector ? 'p-5' : 'p-3.5'
        }`}
      >
        <QRCodeSVG
          value={joinUrl}
          size={size}
          bgColor="#ffffff"
          fgColor="#06100e"
          level="M"
        />
      </div>

      <div className={projector ? 'mt-6' : 'mt-4'}>
        <div
          className={`font-mono font-bold tracking-[0.14em] tabular-nums ${
            projector
              ? 'text-5xl sm:text-7xl gradient-brand-text'
              : 'text-2xl sm:text-3xl text-[var(--toska-soft)]'
          }`}
        >
          {formatSessionCode(code)}
        </div>
        <p
          className={`text-[var(--text-muted)] mt-2 ${
            projector ? 'text-lg sm:text-2xl' : 'text-xs sm:text-sm'
          }`}
        >
          Buka <span className="font-semibold text-[var(--toska-soft)]">{host}/#/peserta</span> lalu masukkan kode
        </p>
      </div>

      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-2)] hover:border-[var(--toska)] border border-[var(--border-strong)] text-xs sm:text-sm font-medium text-[var(--text)] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-[var(--daun)]" />
              <span>Tersalin ✓</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-[var(--toska)]" />
              <span>Salin</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
