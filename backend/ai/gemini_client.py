import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("GEMINI_API_KEY")
_model = None

if _api_key:
    try:
        genai.configure(api_key=_api_key)
        _model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            generation_config={
                "temperature": 0.3,
                "max_output_tokens": 1024,
            }
        )
    except Exception as e:
        print(f"Gemini init failed: {e}")
else:
    print("Warning: GEMINI_API_KEY not set — AI cards will be unavailable")

import time

def _generate_with_retry(prompt: str) -> str:
    """Helper to enforce rate limits (15 RPM) and retry on 429 errors."""
    if not _model:
        raise ValueError("Model not configured")
    
    # Mandatory sleep to stay under 15 RPM (1 request per 4s)
    time.sleep(4)
    
    retries = 0
    while True:
        try:
            response = _model.generate_content(prompt)
            return response.text
        except Exception as e:
            if "429" in str(e) and retries < 3:
                wait_time = 15 * (2 ** retries)
                print(f"Gemini 429 Rate Limit Hit. Waiting {wait_time}s...")
                time.sleep(wait_time)
                retries += 1
            else:
                raise

def generate_signal_card(signal_payload: dict) -> str | None:
    if not _model:
        return None
    try:
        prompt = f"""
You are Growth Artha, an AI investment research assistant for Indian retail investors.
You receive structured signal data about NSE-listed stocks and write clear, factual alert cards.

STRICT RULES:
- Never say "buy" or "sell" — use "historically this setup led to..."
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
    if not _model:
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
    if not _model:
        return "AI assistant is unavailable — GEMINI_API_KEY not configured."
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
    if not _model:
        return "AI assistant is unavailable — GEMINI_API_KEY not configured."
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