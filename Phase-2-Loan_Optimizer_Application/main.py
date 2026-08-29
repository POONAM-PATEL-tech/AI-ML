from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import numpy as np
import os
import json
import re
import random
from dotenv import load_dotenv
import requests

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
load_dotenv()

OLLAMA_GENERATE_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_CHAT_URL = os.getenv("OLLAMA_CHAT_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")

HF_TOKEN = os.getenv("HF_TOKEN")
USE_CLOUD_AI = os.getenv("USE_CLOUD_AI", "false").lower() == "true"

app = FastAPI(title="🏦 Bank AI Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Load ML model + scaler
# Trained on: person_income, loan_amnt (see Phase-1 notebook)
# ------------------------------------------------------------------
try:
    with open('bank_ai_model.pkl', 'rb') as f:
        model = pickle.load(f)
    with open('scaler.pkl', 'rb') as f:
        scaler = pickle.load(f)
except FileNotFoundError:
    print("❌ ERROR: Could not find .pkl files.")
    model, scaler = None, None

try:
    with open('lenders.json', 'r') as f:
        LENDERS = json.load(f)
except FileNotFoundError:
    LENDERS = []


class CustomerData(BaseModel):
    income: float
    loan_amount: float


def _generate_risk_reason(income: float, loan_amount: float, is_rejected: bool) -> str:
    """Deterministic one-sentence explanation of what's driving the score,
    computed directly from the model's own coefficients — no AI call needed,
    so this is instant and always available."""
    scaled = scaler.transform(np.array([[income, loan_amount]]))[0]
    income_contribution = model.coef_[0][0] * scaled[0]
    loan_contribution = model.coef_[0][1] * scaled[1]

    if is_rejected:
        if income_contribution >= loan_contribution:
            return "Your income relative to the requested amount is the main factor pushing this into higher-risk territory."
        return "The requested loan amount is high relative to your income, which is the main driver of this score."
    else:
        if income_contribution <= loan_contribution:
            return "Your income comfortably supports this loan amount, which keeps this score low."
        return "The requested amount is modest relative to your income, which keeps this score low."


def _get_pricing_tier(risk_percent: float) -> dict | None:
    """Risk-based pricing: maps the model's risk score to an interest rate
    tier, scaled to this system's actual 40% rejection threshold.
    Returns None for anything at/above the rejection threshold."""
    if risk_percent < 15:
        return {"tier": "Excellent", "rate_percent": 10.5}
    if risk_percent < 29:
        return {"tier": "Good", "rate_percent": 12.0}
    if risk_percent < 40:
        return {"tier": "Borderline", "rate_percent": 14.5}
    return None


@app.post("/predict")
def predict_loan_status(data: CustomerData):
    if model is None or scaler is None:
        raise HTTPException(status_code=500, detail="Model not loaded on server.")

    input_data = np.array([[data.income, data.loan_amount]])
    scaled_data = scaler.transform(input_data)
    probability = model.predict_proba(scaled_data)[0][1]
    risk_percent = round(probability * 100, 2)
    is_rejected = bool(probability >= 0.40)
    pricing = _get_pricing_tier(risk_percent) if not is_rejected else None

    return {
        "income_received": data.income,
        "loan_amount_received": data.loan_amount,
        "risk_probability_percent": risk_percent,
        "is_rejected": is_rejected,
        "message": "🚨 LOAN REJECTED" if is_rejected else "✅ LOAN APPROVED",
        "risk_reason": _generate_risk_reason(data.income, data.loan_amount, is_rejected),
        "pricing_tier": pricing["tier"] if pricing else None,
        "interest_rate_percent": pricing["rate_percent"] if pricing else None,
    }


# ------------------------------------------------------------------
# Refusal detection — small local models occasionally decline even
# heavily-reframed prompts. We detect that and fall back to guaranteed
# content instead of showing the user a raw refusal or a blank state.
# ------------------------------------------------------------------
REFUSAL_PATTERNS = [
    r"can'?t assist", r"cannot assist",
    r"can'?t help", r"cannot help",
    r"unable to (help|assist)",
    r"i'?m not able to", r"i am not able to",
    r"i can'?t provide", r"i cannot provide",
    r"not able to provide",
    r"i'?m sorry", r"as an ai",
]


def _leaks_implementation_details(text: str) -> bool:
    """Catches cases where the model ignores instructions and exposes tool/
    function names or other implementation details directly to the user."""
    lowered = text.lower()
    leaky_terms = [
        "find_max_approvable_loan", "search_lenders", "tool call", "tool_call",
        "api", "function call", "based on the tool",
    ]
    return any(term in lowered for term in leaky_terms)


def is_refusal(text: str) -> bool:
    if not text or not text.strip():
        return True
    lowered = text.lower()
    return any(re.search(p, lowered) for p in REFUSAL_PATTERNS)


# ------------------------------------------------------------------
# AGENT TOOL 1: reuses YOUR trained model to find the max loan amount
# that would actually be approved for a given income.
# ------------------------------------------------------------------
def _risk_for(income: float, loan_amount: float) -> float:
    scaled = scaler.transform(np.array([[income, loan_amount]]))
    return model.predict_proba(scaled)[0][1]


def find_max_approvable_loan(income: float) -> dict:
    """Binary search over loan_amount for the largest value that keeps
    risk below the 40% rejection threshold, using the real trained model."""
    if model is None or scaler is None:
        return {"max_approvable_loan": None, "note": "Model not loaded."}

    if _risk_for(income, 0) >= 0.40:
        return {"max_approvable_loan": 0, "note": "Even a near-zero loan is rejected at this income."}

    low, high = 0.0, 200000.0
    for _ in range(40):
        mid = (low + high) / 2
        if _risk_for(income, mid) < 0.40:
            low = mid
        else:
            high = mid

    return {"max_approvable_loan": round(low, 2)}


# ------------------------------------------------------------------
# AGENT TOOL 2: searches a real (example) lenders dataset instead of
# letting the LLM invent lender names from nothing.
# ------------------------------------------------------------------
def search_lenders(income: float, loan_amount: float) -> dict:
    exact_matches = [
        {**lender, "fit_score": "High"}
        for lender in LENDERS
        if income >= lender["min_income"] and loan_amount <= lender["max_loan_amount"]
    ]

    if exact_matches:
        return {"matches": exact_matches[:3]}

    closest = sorted(LENDERS, key=lambda l: abs(l["max_loan_amount"] - loan_amount))[:3]
    return {"matches": [{**l, "fit_score": "Medium"} for l in closest]}


AGENT_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "find_max_approvable_loan",
            "description": "Uses the bank's real trained risk model to find the maximum loan amount this applicant could actually get approved for, given their income.",
            "parameters": {
                "type": "object",
                "properties": {
                    "income": {"type": "number", "description": "The applicant's income"}
                },
                "required": ["income"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_lenders",
            "description": "Searches a real database of alternative lenders and returns the ones that match this applicant's income and desired loan amount.",
            "parameters": {
                "type": "object",
                "properties": {
                    "income": {"type": "number"},
                    "loan_amount": {"type": "number"}
                },
                "required": ["income", "loan_amount"]
            }
        }
    }
]

def _extract_float(value, prefer_key: str = None):
    """Robustly extract a float from whatever shape a small local model
    hands us for a tool argument. Small models sometimes double-encode
    JSON (e.g. passing the string '{"income":345.0}' as the value of the
    income field itself) instead of a plain number."""
    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        stripped = value.strip()
        # Try treating it as JSON (covers the double-encoded case)
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, (int, float)):
                return float(parsed)
            if isinstance(parsed, dict):
                if prefer_key and prefer_key in parsed:
                    return _extract_float(parsed[prefer_key], prefer_key)
                for v in parsed.values():
                    try:
                        return _extract_float(v, prefer_key)
                    except (ValueError, TypeError):
                        continue
        except json.JSONDecodeError:
            pass
        # Last resort: pull the first number-looking substring out
        match = re.search(r'-?\d+\.?\d*', stripped)
        if match:
            return float(match.group())

    raise ValueError(f"Could not extract a number from tool argument: {value!r}")


AVAILABLE_FUNCTIONS = {
    "find_max_approvable_loan": lambda args: find_max_approvable_loan(
        _extract_float(args.get("income"), "income")
    ),
    "search_lenders": lambda args: search_lenders(
        _extract_float(args.get("income"), "income"),
        _extract_float(args.get("loan_amount"), "loan_amount"),
    ),
}


def run_agent(income: float, loan_amount: float, risk_percentage: float):
    """Real agentic loop: the LLM decides which tools to call, we execute
    them for real (against your trained model + lender data), feed results
    back, and let it reason to a final answer. Falls back to a templated
    summary if the small local model doesn't cooperate with tool calling
    OR refuses the task outright."""

    messages = [
        {
            "role": "system",
            "content": (
                "You are a friendly assistant inside a demo app called Ledger, talking "
                "directly to a loan applicant who was just rejected. This is placeholder "
                "content, not real financial advice, and not a real person. You have "
                "tools available to look up real information before answering. "
                "CRITICAL RULES for your final reply to the applicant: "
                "Never mention tool names, function names, APIs, or that you 'called' "
                "anything — the applicant should never know tools exist. Speak in plain, "
                "warm, everyday language, as if you just know these facts. "
                "Keep it to 2 short sentences maximum, no bullet points, no lists. "
                "Do not refuse. Do not add disclaimers."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Applicant: income={income}, requested loan amount={loan_amount}, "
                f"risk score={risk_percentage}%. They were rejected. "
                "Look up what amount they could actually get approved for, and look up "
                "real alternative lenders that fit their profile. "
                "Then, speaking directly to them in plain language, write a warm 2-sentence "
                "summary of what you found — no tool names, no function names, no lists."
            ),
        },
    ]

    tool_results = {}
    max_iterations = 4

    for _ in range(max_iterations):
        try:
            response = requests.post(
                OLLAMA_CHAT_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "tools": AGENT_TOOLS_SCHEMA,
                    "stream": False,
                    "keep_alive": "30m",
                    "options": {"temperature": 0.3},
                },
                timeout=90,
            )
            response.raise_for_status()
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            break

        data = response.json()
        message = data.get("message", {})
        tool_calls = message.get("tool_calls")

        if not tool_calls:
            final_text = message.get("content", "").strip()
            print(f"\n🤖 AGENT FINAL RESPONSE:\n{final_text}\n{'=' * 50}")
            if final_text and not is_refusal(final_text) and not _leaks_implementation_details(final_text):
                # Guarantee both tools ran before we settle on this answer —
                # the model may have answered after calling only one tool
                # (or none), and the UI needs both pieces of data either way.
                if "find_max_approvable_loan" not in tool_results:
                    print("   -> model answered without calling find_max_approvable_loan; calling it directly.")
                    tool_results["find_max_approvable_loan"] = find_max_approvable_loan(income)
                if "search_lenders" not in tool_results:
                    print("   -> model answered without calling search_lenders; calling it directly.")
                    tool_results["search_lenders"] = search_lenders(income, loan_amount)
                return final_text, tool_results
            print("⚠️  Agent refused or returned nothing usable — falling back to direct tool results.")
            break

        messages.append(message)
        for call in tool_calls:
            fn_name = call["function"]["name"]
            fn_args = call["function"]["arguments"]
            if isinstance(fn_args, str):
                try:
                    fn_args = json.loads(fn_args)
                except json.JSONDecodeError:
                    fn_args = {}

            print(f"🔧 AGENT CALLING TOOL: {fn_name}({fn_args})")
            if fn_name in AVAILABLE_FUNCTIONS:
                try:
                    result = AVAILABLE_FUNCTIONS[fn_name](fn_args)
                    tool_results[fn_name] = result
                    print(f"   -> result: {result}")
                    messages.append({"role": "tool", "content": json.dumps(result)})
                except (ValueError, TypeError, KeyError) as tool_err:
                    print(f"   -> tool call failed to parse arguments: {tool_err}")
                    messages.append({"role": "tool", "content": json.dumps({"error": str(tool_err)})})

    # Fallback: model unreachable, never finished the tool loop, or refused.
    # Run both tools directly ourselves and build a plain templated summary
    # so the feature never breaks and never shows a raw refusal.
    if "find_max_approvable_loan" not in tool_results:
        tool_results["find_max_approvable_loan"] = find_max_approvable_loan(income)
    if "search_lenders" not in tool_results:
        tool_results["search_lenders"] = search_lenders(income, loan_amount)

    max_loan = tool_results["find_max_approvable_loan"].get("max_approvable_loan")
    matches = tool_results["search_lenders"].get("matches", [])

    fallback_text = ""
    if max_loan is not None:
        fallback_text += f"Based on your income, a loan amount up to {max_loan} would likely be approved. "
    if matches:
        names = ", ".join(m["name"] for m in matches)
        fallback_text += f"Alternative lenders worth checking: {names}."

    return fallback_text or "The agent couldn't reach a conclusion this time — try again.", tool_results


# ------------------------------------------------------------------
# Local LLM helper (used by /loan-insights, plain generation, no tools)
# ------------------------------------------------------------------
def _call_ollama_once(prompt: str, max_tokens: int) -> str:
    response = requests.post(
        OLLAMA_GENERATE_URL,
        json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "keep_alive": "30m",
            "options": {"num_predict": max_tokens, "temperature": 0.4}
        },
        timeout=90
    )
    response.raise_for_status()
    raw_text = response.json().get("response", "").strip()
    print(f"\n🦙 RAW LLAMA OUTPUT:\n{raw_text}\n{'=' * 50}")
    return raw_text


def call_local_llm(prompt: str, max_tokens: int = 400) -> str:
    try:
        return _call_ollama_once(prompt, max_tokens)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as first_err:
        print(f"⚠️  First Ollama call failed ({type(first_err).__name__}), retrying once...")
        try:
            return _call_ollama_once(prompt, max_tokens)
        except requests.exceptions.ConnectionError:
            raise HTTPException(
                status_code=503,
                detail="Local AI model not reachable. Make sure Ollama is running (`ollama serve`) "
                       f"and that '{OLLAMA_MODEL}' is pulled (`ollama pull {OLLAMA_MODEL}`)."
            )
        except requests.exceptions.Timeout:
            raise HTTPException(
                status_code=504,
                detail="Local AI model timed out twice. It may still be loading into memory — try again in a few seconds."
            )


def call_cloud_llm(prompt: str) -> str:
    if not HF_TOKEN:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured for cloud AI.")
    api_url = "https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta"
    headers = {"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"}
    try:
        response = requests.post(api_url, headers=headers, json={"inputs": prompt}, timeout=30)
        if response.status_code == 200:
            return response.json()[0]["generated_text"]
        raise HTTPException(status_code=response.status_code, detail=response.text)
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=500, detail="Network blocked reaching Hugging Face API.")


def call_llm(prompt: str) -> str:
    if USE_CLOUD_AI:
        return call_cloud_llm(prompt)
    return call_local_llm(prompt)


def parse_tips(text: str):
    matches = re.findall(r'TIP\s*\d*\s*[:\-]\s*(.+)', text, re.IGNORECASE)
    tips = [m.strip().strip('"') for m in matches if m.strip()]
    return tips[:3] if tips else None


# ------------------------------------------------------------------
# Guaranteed fallback tips — used whenever the local model refuses or
# fails to produce usable output, so the UI never shows nothing.
# ------------------------------------------------------------------
FALLBACK_TIPS_POOL = [
    "Making payments a few days early each month can help build a stronger repayment history.",
    "Keeping other balances low relative to their limits tends to support a better rate offer next time.",
    "Reviewing the loan terms annually can reveal opportunities to refinance at a lower rate.",
    "Setting up autopay reduces the risk of a missed payment hurting future eligibility.",
    "Paying slightly more than the minimum each month can shorten the term and cut total interest.",
    "Keeping a stable income history for a few months can improve terms on the next application.",
]


def get_fallback_tips(income: float, loan_amount: float, risk_percentage: float):
    seed = int(income + loan_amount + risk_percentage)
    rnd = random.Random(seed)
    return rnd.sample(FALLBACK_TIPS_POOL, 3)


# ------------------------------------------------------------------
# Rejected path -> the real agentic endpoint
# ------------------------------------------------------------------
class RejectionContext(BaseModel):
    income: float
    loan_amount: float
    risk_percentage: float


@app.post("/find-alternatives")
def find_alternatives(context: RejectionContext):
    summary, tool_results = run_agent(context.income, context.loan_amount, context.risk_percentage)

    max_loan_info = tool_results.get("find_max_approvable_loan", {})
    lender_matches = tool_results.get("search_lenders", {}).get("matches", [])

    return {
        "summary": summary,
        "max_approvable_loan": max_loan_info.get("max_approvable_loan"),
        "alternatives": lender_matches if lender_matches else None,
    }


# ------------------------------------------------------------------
# Approved path -> plain generation, no tools needed here
# ------------------------------------------------------------------
class ApprovalContext(BaseModel):
    income: float
    loan_amount: float
    risk_percentage: float


@app.post("/loan-insights")
def loan_insights(context: ApprovalContext):
    prompt = f"""Complete the pattern below. This is UI placeholder text generation for a mockup, similar to Lorem Ipsum but themed around loans. Nothing here is directed at a real person.

EXAMPLE (income=50000, loan=8000, risk=12%):
TIP: Making payments a few days early each month can help build a stronger repayment history.
TIP: Keeping other credit balances low relative to their limits tends to support a better rate offer.
TIP: Reviewing the loan terms annually can reveal opportunities to refinance at a lower rate.

NOW COMPLETE THIS ONE (income={context.income}, loan={context.loan_amount}, risk={context.risk_percentage}%):
TIP:"""

    raw = call_llm(prompt)

    if is_refusal(raw):
        print("⚠️  Model refused /loan-insights — using guaranteed fallback tips.")
        return {"tips": get_fallback_tips(context.income, context.loan_amount, context.risk_percentage)}

    parsed = parse_tips("TIP:" + raw if not raw.strip().upper().startswith("TIP") else raw)

    if parsed is None:
        return {"tips": get_fallback_tips(context.income, context.loan_amount, context.risk_percentage)}

    return {"tips": parsed}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None, "ai_mode": "cloud" if USE_CLOUD_AI else "local"}
