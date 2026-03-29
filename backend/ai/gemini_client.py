import os
from typing import Any
from dotenv import load_dotenv
import time

load_dotenv()

_api_key = os.getenv("GEMINI_API_KEY")
_provider: str = "none"
_client: Any = None


def _init_genai_client() -> None:
    """Initialize modern google.genai SDK."""
    global _provider, _client

    if not _api_key:
        print("Warning: GEMINI_API_KEY not set - AI cards will be unavailable")
        return

    # Required SDK: google.genai
    try:
        from google import genai as genai_sdk  # type: ignore

        _client = genai_sdk.Client(api_key=_api_key)
        _provider = "google.genai"
        return
    except Exception as e:
        print(f"Gemini init failed (google.genai): {e}")
        _provider = "none"


_init_genai_client()


def _extract_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    candidates = getattr(response, "candidates", None)
    if candidates and isinstance(candidates, list):
        first = candidates[0]
        content = getattr(first, "content", None)
        parts = getattr(content, "parts", None) if content else None
        if parts and isinstance(parts, list):
            first_part = parts[0]
            part_text = getattr(first_part, "text", None)
            if isinstance(part_text, str) and part_text.strip():
                return part_text

    raise ValueError("Gemini response did not contain text")

def _generate_with_retry(prompt: str) -> str:
    if _provider == "none":
        raise ValueError("Model not configured")
    
    # Mandatory sleep to stay under 15 RPM (1 request per 4s)
    time.sleep(4)
    
    try:
        if _provider == "google.genai":
            response = _client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={
                    "temperature": 0.3,
                    "max_output_tokens": 1024,
                },
            )
        return _extract_text(response)
    except Exception as e:
        error_str = str(e)
        # Fail fast on quota/auth errors - don't retry, let caller handle fallback
        if any(code in error_str for code in ["429", "403", "401", "RESOURCE_EXHAUSTED", "PERMISSION_DENIED"]):
            print(f"Gemini API error (quota/auth): {error_str[:100]}")
            raise ValueError(f"Gemini API error: {error_str[:100]}")
        # For other errors, also fail fast
        raise

def generate_signal_card(signal_payload: dict) -> str | None:
    if _provider == "none":
        return None
    try:
        prompt = f"""
You are Growth Artha, an AI investment research assistant for Indian retail investors.
You receive structured signal data about NSE-listed stocks and write clear, factual alert cards.

STRICT RULES:
- Never say "buy" or "sell" - use "historically this setup led to..."
- Always cite the data points you're using
- Keep the card under 120 words
- End with one "What to watch" line

SIGNAL DATA:
{signal_payload}

Write the alert card now:
"""
        return _generate_with_retry(prompt)
    except Exception as e:
        print(f"generate_signal_card failed: {e}")
        return None

def generate_explanation(symbol: str, signal_payload: dict) -> str | None:
    if _provider == "none":
        return None
    try:
        prompt = f"""
You are Growth Artha. A user is asking why {symbol} was flagged in today's radar.

Explain in 3 short paragraphs:
1. What events triggered this signal (cite specifics from the data)
2. What the chart pattern shows and its historical success rate on this stock
3. What risks or counter-signals exist

Keep it factual. No buy/sell recommendations. Use simple language.

SIGNAL DATA:
{signal_payload}
"""
        return _generate_with_retry(prompt)
    except Exception as e:
        print(f"generate_explanation failed: {e}")
        return None

def generate_portfolio_summary(portfolio: list, top_signals: list) -> str:
    if _provider == "none":
        return "AI assistant is unavailable - GEMINI_API_KEY not configured."
    try:
        prompt = f"""
You are Growth Artha. A user holds the following stocks:
{portfolio}

Today's top signals are:
{top_signals}

Answer: 'Given my portfolio, what are my top 3 focus stocks today?'

Rules:
- Only recommend stocks from their portfolio or directly related sectors
- Explain why each one matters TODAY specifically
- Cite the signal data
- No buy/sell language
- Under 150 words total
"""
        return _generate_with_retry(prompt)
    except Exception as e:
        print(f"generate_portfolio_summary failed: {e}")
        return "AI assistant encountered an error. Please try again."


def answer_chat_question(question: str, context: dict) -> str:
    if _provider == "none":
        return "AI assistant is unavailable - GEMINI_API_KEY not configured."
    try:
        prompt = f"""
You are Growth Artha, an AI research assistant for Indian retail investors on ET Markets.

Context for today:
- User portfolio: {context.get('portfolio', [])}
- Top signals today: {context.get('signals', [])}
- User question: "{question}"

Answer the question using only the context provided.
Be concise (under 100 words), factual, and cite specific data points.
Never give direct buy/sell advice.
"""
        return _generate_with_retry(prompt)
    except Exception as e:
        print(f"answer_chat_question failed: {e}")
        return "AI assistant encountered an error. Please try again."