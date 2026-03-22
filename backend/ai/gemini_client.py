import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config={
        "temperature": 0.3,      # low temp = consistent, factual output
        "max_output_tokens": 1024,
    }
)

def generate_signal_card(signal_payload: dict) -> str:
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
    response = model.generate_content(prompt)
    return response.text

def generate_explanation(symbol: str, signal_payload: dict) -> str:
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
    response = model.generate_content(prompt)
    return response.text

def generate_portfolio_summary(portfolio: list, top_signals: list) -> str:
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
    response = model.generate_content(prompt)
    return response.text


def answer_chat_question(question: str, context: dict) -> str:
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
    response = model.generate_content(prompt)
    return response.text