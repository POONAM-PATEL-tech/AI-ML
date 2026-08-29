# Ledger — AI Loan Assessment App

⚠️ **This is a portfolio/demo project, not a real financial product.** The risk model
is trained on a small public dataset (not real bank data), and the suggested
alternative lenders are illustrative examples, not real, verified institutions.
See [Honest Positioning](#honest-positioning--is-this-real) below for the full picture.

A loan pre-screening tool that gives instant, transparent risk assessments — and, if
rejected, doesn't leave the applicant with a dead end. Instead of a silent "no," it
uses a local AI agent to find real alternative paths forward. Built as a B2C tool: a
person checks their own odds before applying anywhere real, not something a bank
would deploy internally.

---

## Tech Stack

- **Backend**: Python, FastAPI
- **ML Model**: scikit-learn Logistic Regression (trained in Phase-1)
- **Local AI**: Ollama running `llama3.2:1b` (swappable to a cloud API — see below)
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion,
  react-number-format, lucide-react

---

## User Flow — Three-Step Wizard

The app is a guided flow, not one long scrolling page:

1. **Application** — enter income and requested loan amount
2. **Result** — auto-shown after submitting: risk gauge, approval/rejection badge,
   a plain-language "why" explanation, and (if approved) the offered interest rate
3. **AI Insights** — reached only if the user chooses to click through; shows either
   alternative lending paths (rejected) or personalized tips (approved)

Step 3 is deliberately not automatic — the AI content loads in the background as
soon as Step 2 appears, so it's often ready by the time the user clicks through.

---

## How the Core Prediction Works

`POST /predict` takes `income` and `loan_amount`, scales them using a `StandardScaler`
fitted on the training data, and runs them through a trained Logistic Regression model.

```
z = w1 * scaled_income + w2 * scaled_loan_amount + bias
probability = sigmoid(z)
rejected if probability >= 40%
```

**Important note on the model's inputs**: the underlying model was trained on
`person_income` and `loan_amnt` (the *requested* loan amount) — not "debt." The UI
field is labeled "Loan Amount Requested" to accurately reflect this.

The response also includes a **deterministic "why" explanation** (`risk_reason`),
computed instantly from the model's own coefficients — no AI call needed. It compares
each feature's contribution to the final score and states in plain language which one
(income or loan size) is the bigger factor for that specific applicant.

---

## Risk-Based Pricing

Approved applicants don't just get a yes — they get a rate, scaled to their risk score:

| Risk Score | Tier | Rate |
|---|---|---|
| 0–15% | Excellent | 10.5% |
| 15–29% | Good | 12.0% |
| 29–40% | Borderline | 14.5% |
| 40%+ | Rejected | — |

This is computed in `_get_pricing_tier()` and returned as `pricing_tier` and
`interest_rate_percent` in the `/predict` response. The frontend's risk gauge uses
the same three breakpoints for its color gradient and risk-qualifier badge
(Low/Moderate/High/Very High Risk), so the color, the label, and the rate all agree
on exactly where the lines are.

---

## AI Features — What's Actually "Agentic" vs. Plain GenAI

This app uses AI in two different ways, and it's worth being precise about which is which.

### `/find-alternatives` (rejected applicants) — **genuinely agentic**

This is a real tool-calling agent loop, not just a single prompt-to-text call.

**How it works, step by step:**

1. The LLM (`llama3.2:1b`, via Ollama's `/api/chat`) is given the applicant's profile
   and a description of two tools it can call — it is *not* told the answer directly.
2. The model **decides** whether to call a tool, and with what arguments. This
   decision-making step is what makes it "agentic" rather than plain generation.
3. If it calls a tool, we execute **real Python code**:
   - `find_max_approvable_loan(income)` — binary-searches over loan amounts using the
     **same trained ML model** from `/predict`, to find the largest loan amount that
     would actually be approved for this income (i.e. keeps risk under 40%).
   - `search_lenders(income, loan_amount)` — filters a real dataset (`lenders.json`)
     of example lenders and their eligibility criteria, instead of letting the LLM
     invent lender names from its imagination.
4. The tool's real result is fed back into the conversation, and the model can call
   another tool or produce a final answer grounded in that real data.
5. This loop (decide → act → observe → decide again) runs for up to 4 iterations.
6. Before settling on a final answer, the code **guarantees both tools ran** at least
   once, even if the model tried to answer after calling only one (or none) — so the
   UI always has both the max-approvable-amount figure and lender matches, regardless
   of what the model chose to do on its own.

**Why this matters**: earlier versions of this feature let the LLM freely generate
lender names and advice from pure imagination. Now, the loan-amount suggestion comes
from the actual trained model, and the lender suggestions come from a real (if
example) dataset — the AI's job is reduced to *deciding what to look up* and
*explaining what it found*, not inventing facts.

### `/loan-insights` (approved applicants) — **plain GenAI, not agentic**

This endpoint is a single prompt → single text response. No tools, no decisions, no
loop. It's included here for contrast: it's a good example of *generative* AI that is
**not** agentic, even though it's still useful.

---

## Honest Limitations: Small Local Models Are Unreliable

`llama3.2:1b` is a 1-billion-parameter model — small enough to run comfortably on
8GB of RAM, but with much less nuance than larger models. Two recurring issues came
up during development:

**1. Refusals.** The model would sometimes refuse finance-adjacent prompts entirely
(e.g. treating "write loan tips" as adjacent to predatory lending content), even
after reframing the prompt multiple ways as placeholder/demo content.

**2. Implementation leakage.** Occasionally the model's answer would literally
mention its own tool names ("based on the `find_max_approvable_loan` call...") —
technical detail that should never reach an end user.

Rather than chasing prompt wording indefinitely, the app includes **automatic
resilience** for both:

- `is_refusal()` detects common refusal phrasing in the model's output.
- `_leaks_implementation_details()` detects tool/function names leaking into
  user-facing text.
- If either fires, or the output can't be parsed, the app falls back to:
  - **`/loan-insights`**: a rotating pool of solid, pre-written tips.
  - **`/find-alternatives`**: the real tool results (max loan amount + lender matches)
    are still used directly, just without the LLM's own wrapping sentence — since
    those results come from deterministic Python code, they're unaffected by the
    LLM's refusal.

**The result**: the user never sees a raw refusal, leaked internals, or a broken UI
state. The tradeoff is that fallback content is less personalized than a successful
AI generation would be — reliability was chosen over guaranteed personalization.

**How to describe this project accurately** (e.g. in an interview): *"The app has an
agentic tool-calling architecture — the LLM can decide to invoke real tools (a risk-
model query and a lender search) rather than just generating text. With this small
local model, it doesn't always follow through reliably, so there's a deterministic
fallback that guarantees a grounded, leak-free answer either way."*

---

## Honest Positioning — Is This Real?

Worth being direct about, both for anyone evaluating this project and for future-me:

- **The ML model** is trained on a small public credit-risk dataset, not real bank
  underwriting data. Real lenders weigh credit score, existing debt payments,
  employment history, and more — this model only sees income and requested amount.
- **The alternative lenders in `lenders.json`** are illustrative examples with
  invented names and terms, not real, verified financial institutions.
- **This is a B2C-shaped tool** (a person checks their own odds before applying
  elsewhere), not something a bank would deploy — it has no staff accounts, audit
  logging, or compliance features a real bank-facing tool would need.
- **Regulatory note**: real personal-loan apps (including on app stores like Google
  Play) require financial-services licensing and disclosures in most countries. This
  project intentionally stays out of that territory by not naming real lenders or
  making real credit decisions.

None of this makes the project less valuable as a demonstration — it shows real
engineering (agentic tool use, deterministic ML, resilient AI integration, risk-based
pricing logic) applied to a realistic problem shape. It just isn't a product yet.

---

## Setup

### 1. Install Ollama and pull the model
```bash
ollama pull llama3.2:1b
```

### 2. Backend
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Then open `http://localhost:3000`.

---

## Deployment

- **Frontend + backend**: deploy free on Vercel (Hobby tier comfortably covers demo
  traffic).
- **AI**: Ollama can't run on Vercel's serverless functions (no persistent
  background process, no room for multi-GB model weights). Two options:
  - Leave `USE_CLOUD_AI=false` with no model reachable — the app's fallback system
    (see above) serves solid pre-written content instead of live generation. **Cost: $0.**
  - Set `USE_CLOUD_AI=true` and add a cloud API key (e.g. Claude Haiku) for live
    generation. At demo-level traffic (1,000–10,000 requests/month) this typically
    costs **$1–$11/month**, since API billing is pay-per-token with no fixed monthly
    fee — check current pricing before relying on an estimate, rates change over time.

---

## Possible Next Steps

- Replace `lenders.json` with a real, larger lender dataset (this is the seed for a
  proper RAG setup — currently it's simple filtering, not vector retrieval)
- Swap in a larger model (`llama3.2:3b` or a cloud API) for more reliable, nuanced
  responses with fewer refusals
- Add persistence (a database) for a real "View History" feature (currently a
  visual placeholder in the UI)
- If ever pursued as a real product: real underwriting data, licensed lending
  partnerships, and regulatory compliance in every target market
