'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NumericFormat } from 'react-number-format';
import { CheckCircle2, XCircle, Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import RiskGauge from '@/components/RiskGauge';
import AlternativeLenders from '@/components/AlternativeLenders';
import LoanInsights from '@/components/LoanInsights';

import Image from 'next/image';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Step = 'input' | 'result' | 'ai';

interface PredictResult {
  income_received: number;
  loan_amount_received: number;
  risk_probability_percent: number;
  is_rejected: boolean;
  message: string;
  risk_reason: string;
  pricing_tier: string | null;
  interest_rate_percent: number | null;
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'input', label: 'Application' },
  { key: 'result', label: 'Result' },
  { key: 'ai', label: 'AI Insights' },
];

export default function Home() {
  const [step, setStep] = useState<Step>('input');
  const [income, setIncome] = useState<number | undefined>(undefined);
  const [loanAmount, setLoanAmount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [result, setResult] = useState<PredictResult | null>(null);

  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentSummary, setAgentSummary] = useState<string | null>(null);
  const [maxApprovableLoan, setMaxApprovableLoan] = useState<number | null>(null);
  const [lenders, setLenders] = useState<any[] | null>(null);
  const [tips, setTips] = useState<string[] | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (income === undefined || loanAmount === undefined || income < 0 || loanAmount < 0) {
      setError('Enter an amount for both income and loan amount.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setResult(null);
    setLenders(null);
    setTips(null);
    setAgentError(null);
    setAgentSummary(null);
    setMaxApprovableLoan(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ income, loan_amount: loanAmount }),
      });
      if (!res.ok) throw new Error(`Something went wrong. Please try again.`);
      const data: PredictResult = await res.json();
      setResult(data);
      setStep('result'); // auto-advance to the result screen
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAgentResponse(data: PredictResult) {
    setAgentLoading(true);
    setAgentError(null);
    try {
      const endpoint = data.is_rejected ? '/find-alternatives' : '/loan-insights';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          income: data.income_received,
          loan_amount: data.loan_amount_received,
          risk_percentage: data.risk_probability_percent,
        }),
      });

      if (!res.ok) {
        throw new Error('Something went wrong. Please try again in a moment.');
      }

      const json = await res.json();
      if (data.is_rejected) {
        setAgentSummary(json.summary || null);
        setMaxApprovableLoan(
          json.max_approvable_loan !== undefined ? json.max_approvable_loan : null
        );
        setLenders(json.alternatives || null);
        if (!json.summary && !json.alternatives) {
          setAgentError('Something went wrong. Please try again in a moment.');
        }
      } else {
        setTips(json.tips || null);
        if (!json.tips) {
          setAgentError('Something went wrong. Please try again in a moment.');
        }
      }
    } catch (err: any) {
      setAgentError(err.message || 'Something went wrong. Please try again in a moment.');
    } finally {
      setAgentLoading(false);
    }
  }

  function startNewApplication() {
    setStep('input');
    setResult(null);
    setIncome(undefined);
    setLoanAmount(undefined);
  }

  const resultUnlocked = result !== null;
  const aiUnlocked = result !== null;

  function isStepReachable(key: Step) {
    if (key === 'input') return true;
    if (key === 'result') return resultUnlocked;
    if (key === 'ai') return aiUnlocked;
    return false;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 sm:mb-8 text-center"
        >
          <div className="flex justify-center">
            <Image src="/logo.png" alt="Ledger" width={350} height={350} className="h-20 sm:h-24 w-auto block" priority />
          </div>
          <p className="text-muted mt-3 max-w-md mx-auto text-sm sm:text-base">
            An instant read on your loan application — and, either way, a clear next step.
          </p>
        </motion.div>

        {/* Step tabs */}
        <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8">
          {STEPS.map((s, i) => {
            const reachable = isStepReachable(s.key);
            const active = step === s.key;
            const completed =
              (s.key === 'input' && result !== null) || (s.key === 'result' && step === 'ai');
            return (
              <div key={s.key} className="flex items-center">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && setStep(s.key)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-ink text-paper'
                      : reachable
                      ? 'bg-surface border border-surface2 text-ink hover:border-brass cursor-pointer'
                      : 'bg-surface2/40 text-muted cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded-full text-xs shrink-0 ${
                      active ? 'bg-paper text-ink' : completed ? 'bg-approved text-white' : 'bg-surface2 text-muted'
                    }`}
                  >
                    {completed ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className="w-4 sm:w-6 h-px bg-surface2 mx-1" />}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Application form */}
          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="ledger-surface rounded-2xl border border-surface2 p-5 sm:p-6 md:p-8"
              >
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="income" className="block text-sm text-muted mb-2">
                      Income (₹)
                    </label>
                    <div className="relative flex items-stretch rounded-xl border border-surface2 bg-surface focus-within:border-brass transition-colors overflow-hidden">
                      <span className="flex items-center px-3 bg-paper border-r border-surface2 text-muted">
                        ₹
                      </span>
                      <NumericFormat
                        id="income"
                        value={income}
                        onValueChange={(v) => setIncome(v.floatValue)}
                        thousandSeparator=","
                        allowNegative={false}
                        decimalScale={2}
                        placeholder="65,000"
                        required
                        inputMode="decimal"
                        className="w-full bg-transparent border-0 pl-3 pr-4 py-3 text-ink font-body font-medium placeholder:text-muted/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="loanAmount" className="block text-sm text-muted mb-2">
                      Loan Amount Requested (₹)
                    </label>
                    <div className="relative flex items-stretch rounded-xl border border-surface2 bg-surface focus-within:border-brass transition-colors overflow-hidden">
                      <span className="flex items-center px-3 bg-paper border-r border-surface2 text-muted">
                        ₹
                      </span>
                      <NumericFormat
                        id="loanAmount"
                        value={loanAmount}
                        onValueChange={(v) => setLoanAmount(v.floatValue)}
                        thousandSeparator=","
                        allowNegative={false}
                        decimalScale={2}
                        placeholder="12,000"
                        required
                        inputMode="decimal"
                        className="w-full bg-transparent border-0 pl-3 pr-4 py-3 text-ink font-body font-medium placeholder:text-muted/40 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileTap={{ scale: 0.98 }}
                      className="w-full bg-ink hover:bg-inkSoft disabled:opacity-50 disabled:cursor-not-allowed text-paper font-body font-semibold rounded-xl py-3.5 sm:py-3 transition-colors shadow-card flex items-center justify-center gap-2"
                    >
                      {loading ? 'Assessing…' : 'Analyze My Application'}
                      {!loading && <ArrowRight className="w-4 h-4" />}
                    </motion.button>
                  </div>
                </form>

                {error && <p className="text-rejected text-sm mt-4">{error}</p>}
              </motion.div>
            </motion.div>
          )}

          {/* STEP 2: Result */}
          {step === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.3 }}
            >
              <div className="ledger-surface rounded-2xl border border-surface2 p-5 sm:p-6 md:p-8 flex flex-col items-center gap-5">
                <RiskGauge riskPercent={result.risk_probability_percent} isRejected={result.is_rejected} />

                <div
                  className={`flex items-center gap-2 px-5 py-2 rounded-full ${
                    result.is_rejected ? 'bg-rejected/10 text-rejected' : 'bg-approved/10 text-approved'
                  }`}
                >
                  {result.is_rejected ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  <span className="font-semibold text-base">
                    {result.is_rejected ? 'Not Approved' : 'Loan Approved'}
                  </span>
                </div>

                <p className="text-ink text-sm text-center px-4 leading-relaxed">{result.risk_reason}</p>

                {!result.is_rejected && result.interest_rate_percent !== null && (
                  <div className="w-full max-w-xs rounded-xl border border-approved/20 bg-approved/5 px-5 py-4 text-center">
                    <span className="text-xs font-semibold text-approved uppercase tracking-wide">
                      {result.pricing_tier} Tier — Your Rate
                    </span>
                    <div className="font-body text-3xl font-extrabold tracking-tight text-ink mt-1">
                      {result.interest_rate_percent}%
                    </div>
                    <span className="text-xs text-muted">Annual interest rate, based on your risk score</span>
                  </div>
                )}

                <div className="w-full flex flex-col sm:flex-row gap-3 mt-2">
                  <button
                    type="button"
                    onClick={startNewApplication}
                    className="flex-1 flex items-center justify-center gap-2 text-muted text-sm py-2.5 rounded-xl border border-surface2 hover:border-ink/30 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Start New Application
                  </button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setStep('ai');
                      if (result && !agentLoading) {
                        const needsFetch = result.is_rejected
                          ? !agentSummary && !lenders
                          : !tips;
                        if (needsFetch) {
                          fetchAgentResponse(result);
                        }
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-brass hover:bg-brassSoft text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-card"
                  >
                    <Sparkles className="w-4 h-4" />
                    {result.is_rejected ? 'See Alternative Paths' : 'See Personalized Tips'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: AI Insights (only reached if the user chooses to) */}
          {step === 'ai' && result && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.3 }}
            >
              {result.is_rejected ? (
                <AlternativeLenders
                  summary={agentSummary}
                  maxApprovableLoan={maxApprovableLoan}
                  lenders={lenders}
                  loading={agentLoading}
                />
              ) : (
                <LoanInsights tips={tips} loading={agentLoading} />
              )}

              {agentError && !agentLoading && (
                <p className="text-rejected text-sm text-center mt-4">{agentError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setStep('result')}
                  className="flex-1 flex items-center justify-center gap-2 text-muted text-sm py-2.5 rounded-xl border border-surface2 hover:border-ink/30 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Result
                </button>
                <button
                  type="button"
                  onClick={startNewApplication}
                  className="flex-1 flex items-center justify-center gap-2 text-muted text-sm py-2.5 rounded-xl border border-surface2 hover:border-ink/30 transition-colors"
                >
                  Start New Application
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>        
      </div>
    </main>
  );
}
