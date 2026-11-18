import { motion } from 'motion/react';
import { formatIdDecimal } from '../lib/templates';

export const SCALE_BAR_COLORS = [
  '#2dd4bf', // 1 - toska
  '#19b5a0', // 2
  '#0f9d74', // 3 - peralihan menuju hijau botol
  '#2fbf6b', // 4
  '#4ade80', // 5 - hijau daun
];

function lerpHex(hexA: string, hexB: string, t: number): string {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

export function getScaleBarColors(steps = 5): string[] {
  if (steps === 5) return SCALE_BAR_COLORS;
  return Array.from({ length: steps }, (_, i) => {
    const t = steps <= 1 ? 0 : i / (steps - 1);
    if (t <= 0.5) return lerpHex('#2dd4bf', '#0f7a5c', t * 2);
    return lerpHex('#0f7a5c', '#4ade80', (t - 0.5) * 2);
  });
}

interface ScaleBarChartProps {
  counts: number[];
  labels?: string[];
  minLabel?: string;
  maxLabel?: string;
  variant?: 'card' | 'projector';
}

export function ScaleBarChart({
  counts,
  labels = [],
  minLabel,
  maxLabel,
  variant = 'card',
}: ScaleBarChartProps) {
  const steps = counts.length === 10 ? 10 : 5;
  const safeCounts = Array.from({ length: steps }, (_, i) => counts[i] ?? 0);
  const rawMax = Math.max(...safeCounts);
  const maxCount = Math.max(rawMax, 1);
  const colors = getScaleBarColors(steps);
  const isProjector = variant === 'projector';

  return (
    <div className="w-full relative z-10">
      <div
        style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}
        className={`grid items-end ${
          isProjector
            ? steps === 10
              ? 'gap-2 sm:gap-4 h-64 sm:h-72'
              : 'gap-4 sm:gap-7 h-64 sm:h-80'
            : steps === 10
            ? 'gap-1.5 sm:gap-2.5 h-44 sm:h-48'
            : 'gap-2.5 sm:gap-4 h-44 sm:h-48'
        }`}
      >
        {safeCounts.map((count, index) => {
          const ratio = count / maxCount;
          const heightPct = count === 0 ? 4 : Math.max(10, Math.round(ratio * 100));
          const color = colors[index];
          const isHighest = rawMax > 0 && count === rawMax;

          return (
            <div
              key={index}
              className="flex flex-col items-center justify-end h-full min-w-0"
            >
              <motion.span
                key={`${index}-${count}`}
                initial={{ opacity: 0.6, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`font-mono font-bold tabular-nums mb-1.5 text-[var(--text)] ${
                  isProjector
                    ? steps === 10
                      ? 'text-lg sm:text-2xl'
                      : 'text-2xl sm:text-3xl'
                    : 'text-xs sm:text-sm'
                }`}
              >
                {count}
              </motion.span>

              <div className="w-full flex-1 flex items-end">
                <motion.div
                  initial={false}
                  animate={{ height: `${heightPct}%` }}
                  transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                  style={{
                    backgroundColor: color,
                    filter: isHighest
                      ? 'drop-shadow(0 0 14px rgba(45, 212, 191, 0.45))'
                      : undefined,
                  }}
                  className={`w-full ${
                    isProjector
                      ? steps === 10
                        ? 'rounded-t-xl'
                        : 'rounded-t-2xl'
                      : 'rounded-t-lg sm:rounded-t-xl'
                  } min-h-[6px]`}
                  aria-label={`Skala ${index + 1}: ${count} jawaban`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Numbers & optional per-step labels row */}
      <div
        style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}
        className={`grid border-t border-[var(--border)] pt-3 mt-1 ${
          isProjector
            ? steps === 10
              ? 'gap-2 sm:gap-4'
              : 'gap-4 sm:gap-7'
            : steps === 10
            ? 'gap-1.5 sm:gap-2.5'
            : 'gap-2.5 sm:gap-4'
        }`}
      >
        {Array.from({ length: steps }, (_, index) => (
          <div key={index} className="text-center min-w-0">
            <div
              className={`font-mono font-bold tabular-nums text-[var(--text)] ${
                isProjector
                  ? steps === 10
                    ? 'text-base sm:text-xl'
                    : 'text-xl sm:text-2xl'
                  : 'text-xs sm:text-sm'
              }`}
            >
              {index + 1}
            </div>
            {steps === 5 && labels[index] && !minLabel && !maxLabel && (
              <p
                className={`text-[var(--text-muted)] leading-tight mt-0.5 break-words ${
                  isProjector ? 'text-xs sm:text-base' : 'text-[10px] sm:text-xs'
                }`}
              >
                {labels[index]}
              </p>
            )}
          </div>
        ))}
      </div>

      {(minLabel || maxLabel) && (
        <div
          className={`flex items-center justify-between gap-4 mt-2.5 text-[var(--text-muted)] ${
            isProjector ? 'text-sm sm:text-base' : 'text-xs'
          }`}
        >
          <span>1 = {minLabel || (labels[0] ?? 'Terendah')}</span>
          <span className="text-right">
            {steps} = {maxLabel || (labels[steps - 1] ?? 'Tertinggi')}
          </span>
        </div>
      )}
    </div>
  );
}

interface ChoiceBarChartProps {
  options: string[];
  counts: number[];
  totalResponses: number;
  variant?: 'card' | 'projector';
}

export function ChoiceBarChart({
  options,
  counts,
  totalResponses,
  variant = 'card',
}: ChoiceBarChartProps) {
  const isProjector = variant === 'projector';
  const maxCount = Math.max(...counts, 0);

  return (
    <div className={isProjector ? 'space-y-5' : 'space-y-3.5'}>
      {options.map((option, idx) => {
        const count = counts[idx] ?? 0;
        const pct = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
        const isHighest = maxCount > 0 && count === maxCount;

        return (
          <div key={`${idx}-${option}`} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <span
                className={`font-medium text-[var(--text)] leading-snug ${
                  isProjector ? 'text-xl sm:text-2xl' : 'text-sm sm:text-base'
                }`}
              >
                {option}
              </span>
              <span
                className={`font-mono font-bold tabular-nums shrink-0 ${
                  isHighest ? 'text-[var(--toska-soft)]' : 'text-[var(--text-muted)]'
                } ${isProjector ? 'text-xl sm:text-2xl' : 'text-xs sm:text-sm'}`}
              >
                {count} jawaban
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`flex-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden ${
                  isProjector ? 'h-6 sm:h-8' : 'h-3.5 sm:h-4'
                }`}
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                  style={{
                    background: isHighest
                      ? 'linear-gradient(135deg, #5eead4, #4ade80)'
                      : 'var(--gradient-brand)',
                    filter: isHighest
                      ? 'drop-shadow(0 0 10px rgba(45, 212, 191, 0.45))'
                      : undefined,
                  }}
                  className="h-full rounded-full"
                />
              </div>

              <span
                className={`font-mono font-bold tabular-nums shrink-0 w-14 text-right ${
                  isHighest ? 'text-[var(--daun-soft)]' : 'text-[var(--text-muted)]'
                } ${isProjector ? 'text-lg sm:text-xl' : 'text-xs sm:text-sm'}`}
              >
                {formatIdDecimal(pct, pct % 1 === 0 ? 0 : 1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
