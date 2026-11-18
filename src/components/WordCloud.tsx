import { motion } from 'motion/react';
import { computeWordCloudItems } from '../lib/templates';
import type { SurveyResponse } from '../types/survey';

interface WordCloudProps {
  responses: SurveyResponse[];
  variant?: 'card' | 'projector';
}

export function WordCloud({ responses, variant = 'card' }: WordCloudProps) {
  const items = computeWordCloudItems(responses);
  const isProjector = variant === 'projector';

  if (items.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] ${
          isProjector ? 'min-h-[260px] text-xl' : 'min-h-[160px] text-sm'
        }`}
      >
        Belum ada kata yang masuk dari peserta.
      </div>
    );
  }

  const maxCount = items[0].count;
  const minSize = isProjector ? 20 : 14;
  const maxSize = isProjector ? 62 : 34;

  const arranged: Array<{ display: string; count: number; rank: number }> = [];
  items.slice(0, 40).forEach((item, idx) => {
    const entry = { ...item, rank: idx };
    if (idx % 2 === 0) arranged.push(entry);
    else arranged.unshift(entry);
  });

  const getWordColor = (count: number, rank: number): string => {
    const ratio = maxCount > 0 ? count / maxCount : 1;
    if (count === maxCount || ratio >= 0.85) {
      return 'var(--toska-soft)'; // #5eead4
    }
    if (ratio >= 0.45) {
      return 'var(--toska)'; // #2dd4bf
    }
    return rank % 2 === 0 ? 'var(--daun)' : '#34d399';
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-center content-center ${
        isProjector ? 'gap-x-8 gap-y-5 min-h-[280px] py-6' : 'gap-x-5 gap-y-3 min-h-[170px] py-4'
      }`}
    >
      {arranged.map((item) => {
        const weightRatio = maxCount > 1 ? item.count / maxCount : 1;
        const fontSize = Math.round(minSize + weightRatio * (maxSize - minSize));
        const color = getWordColor(item.count, item.rank);

        return (
          <motion.span
            key={item.display.toLowerCase()}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            style={{
              fontSize: `${fontSize}px`,
              color,
              lineHeight: 1.15,
            }}
            className="font-display font-bold tracking-tight inline-flex items-baseline gap-1.5 select-none"
            title={`${item.display}: ${item.count} kali`}
          >
            <span>{item.display}</span>
            {item.count > 1 && (
              <span
                className={`font-mono font-semibold tabular-nums opacity-70 ${
                  isProjector ? 'text-sm sm:text-base' : 'text-[11px]'
                }`}
              >
                ×{item.count}
              </span>
            )}
          </motion.span>
        );
      })}
    </div>
  );
}
