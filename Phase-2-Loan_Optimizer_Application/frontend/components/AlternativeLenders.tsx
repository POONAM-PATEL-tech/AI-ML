'use client';

import { motion } from 'framer-motion';

interface Lender {
  name: string;
  type?: string;
  interest_rate?: string;
  notes?: string;
  fit_score: string;
}

export default function AlternativeLenders({
  summary,
  maxApprovableLoan,
  lenders,
  loading,
}: {
  summary: string | null;
  maxApprovableLoan: number | null;
  lenders: Lender[] | null;
  loading: boolean;
}) {
  return (
    <div className="ledger-surface rounded-2xl border border-surface2 p-6 md:p-7 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="h-2 w-2 rounded-full bg-brass animate-pulse" />
        <h3 className="font-semibold text-base text-brass">Other Ways Forward</h3>
      </div>

      {loading && (
        <div className="space-y-3">
          <p className="text-sm text-brass font-medium animate-pulse">
            AI is compiling alternative lending options…
          </p>
          <div className="space-y-3 animate-pulse">
            <div className="h-3 w-5/6 bg-surface2/60 rounded" />
            <div className="h-3 w-3/4 bg-surface2/60 rounded" />
            <div className="h-16 w-full bg-surface2/40 rounded-xl mt-4" />
          </div>
        </div>
      )}

      {!loading && summary && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-ink mb-4 leading-relaxed"
        >
          {summary.replace(/\$/g, '₹')}
        </motion.p>
      )}

      {!loading && maxApprovableLoan !== null && maxApprovableLoan !== undefined && (
        <div className="rounded-xl border border-brass/20 bg-brass/5 px-4 py-3 mb-4">
          <span className="text-xs text-brass font-medium">You could likely get approved for</span>
          <div className="font-body text-2xl font-extrabold tracking-tight text-ink mt-1">
            ₹{maxApprovableLoan.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}

      {!loading && lenders && lenders.length > 0 && (
        <div className="grid gap-3">
          {lenders.map((l, i) => (
            <motion.div
              key={l.name + i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
              className="rounded-xl border border-surface2 bg-paper p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-base text-ink">{l.name}</span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    l.fit_score?.toLowerCase() === 'high'
                      ? 'bg-approved/10 text-approved'
                      : 'bg-brass/10 text-brass'
                  }`}
                >
                  {l.fit_score} fit
                </span>
              </div>
              {l.type && (
                <p className="text-xs text-muted mt-1">
                  {l.type} · {l.interest_rate}
                </p>
              )}
              {l.notes && <p className="text-sm text-muted mt-1">{l.notes}</p>}
            </motion.div>
          ))}
        </div>
      )}

      {!loading && !summary && (!lenders || lenders.length === 0) && (
        <p className="text-sm text-muted">
          We couldn't find alternatives right now. Please try again in a moment.
        </p>
      )}
    </div>
  );
}
