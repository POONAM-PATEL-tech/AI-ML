'use client';

import { motion } from 'framer-motion';

export default function LoanInsights({
  tips,
  loading,
}: {
  tips: string[] | null;
  loading: boolean;
}) {
  return (
    <div className="ledger-surface rounded-2xl border border-surface2 p-6 md:p-7 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="h-2 w-2 rounded-full bg-approved animate-pulse" />
        <h3 className="font-semibold text-base text-approved">Tips For You</h3>
      </div>

      {loading && (
        <div className="space-y-3">
          <p className="text-sm text-approved font-medium animate-pulse">
            AI is drafting personalized tips…
          </p>
          <div className="space-y-3 animate-pulse">
            <div className="h-3 w-5/6 bg-surface2/60 rounded" />
            <div className="h-3 w-2/3 bg-surface2/60 rounded" />
            <div className="h-3 w-3/4 bg-surface2/60 rounded" />
          </div>
        </div>
      )}

      {!loading && tips && tips.length > 0 && (
        <ul className="space-y-4">
          {tips.map((tip, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="flex gap-3 text-sm text-ink"
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-approved/10 text-approved font-semibold text-xs shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="leading-relaxed pt-0.5">{tip}</span>
            </motion.li>
          ))}
        </ul>
      )}

      {!loading && (!tips || tips.length === 0) && (
        <p className="text-sm text-muted">
          We couldn't load tips right now. Please try again in a moment.
        </p>
      )}
    </div>
  );
}
