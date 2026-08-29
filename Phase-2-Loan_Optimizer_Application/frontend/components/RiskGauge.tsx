'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

interface RiskGaugeProps {
  riskPercent: number; // 0-100
  isRejected: boolean;
}

function useCountUp(target: number, durationMs: number) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    let frame: number;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export default function RiskGauge({ riskPercent, isRejected }: RiskGaugeProps) {
  const clamped = Math.max(0, Math.min(100, riskPercent));
  const animatedValue = useCountUp(clamped, 1200);
  const angle = -90 + (clamped / 100) * 180;

  const radius = 92;
  const cx = 110;
  const cy = 110;

  const dotColor =
    clamped < 15 ? '#059669' : clamped < 29 ? '#F59E0B' : clamped < 40 ? '#F97316' : '#DC2626';

  const qualifier =
    clamped < 15
      ? { label: 'Low Risk', color: 'text-approved', bg: 'bg-approved/10' }
      : clamped < 29
      ? { label: 'Moderate Risk', color: 'text-amber-600', bg: 'bg-amber-50' }
      : clamped < 40
      ? { label: 'High Risk', color: 'text-orange-600', bg: 'bg-orange-50' }
      : { label: 'Very High Risk', color: 'text-rejected', bg: 'bg-rejected/10' };

  return (
    <div className="flex flex-col items-center select-none">
      <svg viewBox="0 0 220 140" className="w-full max-w-[220px] h-auto mx-auto overflow-visible">
        <defs>
          <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="65%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#DC2626" />
          </linearGradient>
        </defs>

        {/* Smooth continuous track */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Smooth continuous gradient fill, no ticks */}
        <motion.path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="url(#riskGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={Math.PI * radius}
          initial={{ strokeDashoffset: Math.PI * radius }}
          animate={{ strokeDashoffset: Math.PI * radius * (1 - clamped / 100) }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />

        {/* Clean solid dot indicator riding the arc, instead of a needle */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ originX: `${cx}px`, originY: `${cy}px` }}
        >
          <circle cx={cx} cy={cy - radius} r="9" fill="#FFFFFF" />
          <circle cx={cx} cy={cy - radius} r="6" fill={dotColor} />
        </motion.g>
      </svg>

      <div className="font-body text-5xl font-extrabold tracking-tight text-ink -mt-1">
        {animatedValue.toFixed(1)}%
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="font-body text-xs font-semibold tracking-widest text-muted uppercase">
          Risk Score
        </span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${qualifier.bg} ${qualifier.color}`}>
          {qualifier.label}
        </span>
      </div>
    </div>
  );
}
