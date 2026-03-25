"""
Growth Artha Multi-Agent Orchestrator.

Three specialised agents run in sequence:
  1. DataAgent    — fetches all required data autonomously
  2. SignalAgent  — detects patterns and scores convergence
  3. InsightAgent — generates alert cards and portfolio brief

Each agent uses Gemini function calling — the model decides
what to call next based on what it finds. That's the agentic part.
"""
import json
import time
from datetime import datetime
import google.generativeai as genai
from backend.agents.tools import (
    DATA_AGENT_TOOLS,
    SIGNAL_AGENT_TOOLS,
    INSIGHT_AGENT_TOOLS
)
from backend.agents.executor import ToolExecutor
from backend.data.fetcher import NIFTY50


# ── Base Agent ───────────────────────────────────────────────────────────────

class BaseAgent:
    """
    Base class for all Growth Artha agents.
    Handles the Gemini function-calling loop.
    """
    MAX_ITERATIONS = 10     # reduced to stay within free-tier rate limits
    MAX_RETRIES    = 3      # retries on 429 before giving up

    def __init__(self, name: str, tools: list, executor: ToolExecutor):
        self.name     = name
        self.tools    = tools
        self.executor = executor
        self.model    = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            tools=self._build_gemini_tools(),
            generation_config={"temperature": 0.1}  # very low — agents need consistency
        )
        self.reasoning_log: list = []

    def run(self, system_prompt: str, user_message: str) -> dict:
        """
        Runs the agent loop until Gemini stops calling tools.
        Returns the final text response + full reasoning log.
        """
        # Build initial history using the SDK's expected format
        history = []
        iterations = 0

        self._log(f"Agent {self.name} starting")

        # Combine system prompt + first user message into the first user turn
        first_message = system_prompt + "\n\n" + user_message

        while iterations < self.MAX_ITERATIONS:
            iterations += 1

            # Build the contents list freshly each time
            contents = [{"role": "user", "parts": [first_message]}] + history

            # Call Gemini with timeout on rate limit errors
            try:
                response = self.model.generate_content(contents)
            except Exception as e:
                err = str(e)
                # Fail fast on quota/auth errors — don't retry, let radar endpoint handle fallback
                if any(code in err for code in ["429", "403", "401", "RESOURCE_EXHAUSTED", "PERMISSION_DENIED"]):
                    self._log(f"Gemini quota/auth error (not retrying): {err[:100]}")
                    raise ValueError(f"Gemini API quota exceeded or auth failed - using non-AI fallback. Error: {err[:100]}")
                # For other errors, also fail fast
                raise

            # Check if Gemini wants to call a tool
            tool_calls = self._extract_tool_calls(response)

            if not tool_calls:
                # No more tool calls — Gemini has its final answer
                final_text = response.text or ""
                self._log(f"Agent {self.name} complete after {iterations} iterations")
                return {
                    "response":      final_text,
                    "reasoning_log": self.reasoning_log,
                    "iterations":    iterations
                }

            # Execute each tool call and feed results back
            function_responses = []
            for call in tool_calls:
                tool_name = call["name"]
                tool_args = call["args"]

                self._log(f"Calling tool: {tool_name}({json.dumps(tool_args)[:80]}...)")
                result = self.executor.execute(tool_name, tool_args)
                self._log(f"Tool result: {self.executor.audit_log[-1]['result_summary']}")

                function_responses.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tool_name,
                            response={"result": json.dumps(result, default=str)[:2000]}
                        )
                    )
                )

            # Append model turn (the Content proto) then function responses
            history.append(response.candidates[0].content)
            history.append({"role": "user", "parts": function_responses})

        self._log(f"Agent {self.name} hit max iterations — returning partial result")
        return {
            "response":      "Agent reached maximum iterations",
            "reasoning_log": self.reasoning_log,
            "iterations":    iterations
        }


    def _build_gemini_tools(self):
        """Convert tool dicts to Gemini function declarations."""
        declarations = []
        for tool in self.tools:
            declarations.append(
                genai.protos.FunctionDeclaration(
                    name=tool["name"],
                    description=tool["description"],
                    parameters=genai.protos.Schema(
                        type=genai.protos.Type.OBJECT,
                        properties={
                            k: genai.protos.Schema(
                                type=genai.protos.Type.STRING
                                     if v["type"] == "string"
                                     else genai.protos.Type.NUMBER
                                     if v["type"] == "number"
                                     else genai.protos.Type.INTEGER
                                     if v["type"] == "integer"
                                     else genai.protos.Type.ARRAY,
                                description=v.get("description", ""),
                                items=genai.protos.Schema(type=genai.protos.Type.STRING)
                                      if v["type"] == "array" else None
                            )
                            for k, v in tool["parameters"]
                                            .get("properties", {}).items()
                        },
                        required=tool["parameters"].get("required", [])
                    )
                )
            )
        return [genai.protos.Tool(function_declarations=declarations)]

    def _extract_tool_calls(self, response) -> list:
        """Extract function calls from Gemini response."""
        calls = []
        try:
            for part in response.candidates[0].content.parts:
                if hasattr(part, "function_call") and part.function_call.name:
                    calls.append({
                        "name": part.function_call.name,
                        "args": dict(part.function_call.args),
                        "id":   part.function_call.name
                    })
        except (IndexError, AttributeError):
            pass
        return calls

    def _log(self, message: str):
        entry = {"time": datetime.now().isoformat(), "agent": self.name,
                 "message": message}
        self.reasoning_log.append(entry)
        print(f"  [{self.name}] {message}")


# ── Specialised Agents ───────────────────────────────────────────────────────

class DataAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are the Data Agent for Growth Artha, an AI investment intelligence system.

Your job: autonomously fetch all data needed for today's market scan.

Rules:
1. Always fetch bulk deals first — they are time-sensitive.
2. Fetch OHLC for the full Nifty 50 universe in one call.
3. For stocks with bulk deals, also fetch news headlines.
4. Report clearly what you fetched and flag any failures.
5. Do not analyse or score — just collect data.

When done, summarise: stocks fetched, deals found, news fetched.
"""

    def __init__(self, executor: ToolExecutor):
        super().__init__("DataAgent", DATA_AGENT_TOOLS, executor)

    def run_data_collection(self, symbols: list = None) -> dict:
        symbols = symbols or NIFTY50
        message = f"""
Collect all data needed for today's Growth Artha radar scan.

Universe: {symbols}

Steps:
1. Fetch bulk deals from NSE
2. Fetch OHLC price data for all symbols (2y period for back-testing)
3. For any symbol with a bulk deal today, also fetch its news headlines

Report what you collected and flag any symbols where data is missing.
"""
        return self.run(self.SYSTEM_PROMPT, message)


class SignalAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are the Signal Agent for Growth Artha, an AI investment intelligence system.

Your job: detect chart patterns and compute convergence scores for NSE stocks.

Rules:
1. Run detect_patterns for every stock in the universe.
2. For stocks with patterns detected, run run_backtest for each pattern.
3. Run score_stock_signals for all stocks.
4. Prioritise stocks with 2+ co-occurring signals — these are your strongest picks.
5. Only escalate the top 10 stocks by score to the Insight Agent.

Do NOT generate alert cards — that's the Insight Agent's job.

When done, return a ranked JSON list of top stocks with their scores and signals.
"""

    def __init__(self, executor: ToolExecutor):
        super().__init__("SignalAgent", SIGNAL_AGENT_TOOLS, executor)

    def run_signal_detection(self, symbols: list, portfolio: list = []) -> dict:
        message = f"""
Detect patterns and score signals for today's Growth Artha radar.

Symbols to analyse: {symbols[:20]}  (process all, prioritise these first)
User portfolio: {portfolio}

Steps:
1. For each symbol: detect_patterns
2. For symbols with patterns: run_backtest for each pattern found
3. For all symbols: score_stock_signals (include portfolio context)
4. Rank by score descending
5. Return top 10 as a structured list

Flag any stock where score >= 0.6 as "Act", 0.3-0.6 as "Watch",
below 0 as "Exit Radar".
"""
        return self.run(self.SYSTEM_PROMPT, message)


class InsightAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are the Insight Agent for Growth Artha, an AI investment intelligence system.

Your job: generate plain-English alert cards and portfolio intelligence.

Rules:
1. Generate alert cards for ALL Act and Watch bucket stocks.
2. For Act bucket stocks: also run analyse_sentiment for richer cards.
3. Generate ONE portfolio brief at the end.
4. Never say "buy" or "sell" — use "historically this setup led to..."
5. Keep every alert card under 120 words.
6. Always cite the specific data points behind each signal.

When done, return the complete insight package as structured JSON.
"""

    def __init__(self, executor: ToolExecutor):
        super().__init__("InsightAgent", INSIGHT_AGENT_TOOLS, executor)

    def run_insight_generation(self, top_signals: list,
                                portfolio: list = []) -> dict:
        message = f"""
Generate alert cards and portfolio intelligence for today's Growth Artha radar.

Top signals from Signal Agent:
{json.dumps(top_signals[:10], indent=2, default=str)}

User portfolio: {portfolio}

Steps:
1. For each Act bucket stock: generate_alert_card + analyse_sentiment
2. For each Watch bucket stock: generate_alert_card only
3. Finally: generate_portfolio_brief with all top signals

Return a JSON object with:
  - act: list of enriched signal objects with ai_card and sentiment
  - watch: list of signal objects with ai_card
  - exit_radar: list of risk signals
  - portfolio_brief: the personalised summary
"""
        return self.run(self.SYSTEM_PROMPT, message)


# ── Master Orchestrator ──────────────────────────────────────────────────────

class GrowthArthaOrchestrator:
    """
    Coordinates all three agents and assembles the final radar result.
    This replaces the _run_radar_job function in radar.py.
    """

    def __init__(self):
        self.executor = ToolExecutor()
        self.data_agent    = DataAgent(self.executor)
        self.signal_agent  = SignalAgent(self.executor)
        self.insight_agent = InsightAgent(self.executor)
        self.full_audit_log: list = []

    def run(self, portfolio: list = [],
            symbols: list = None) -> dict:
        """
        Full agentic pipeline. Returns complete radar result
        with audit trail attached.
        """
        symbols = symbols or NIFTY50
        start   = datetime.now()

        print("\n=== Growth Artha Agentic Radar Starting ===\n")

        # ── Phase 1: Data Agent ──────────────────────────────────────────────
        print("Phase 1: Data Agent running...")
        data_result = self.data_agent.run_data_collection(symbols)
        self.full_audit_log.extend(data_result.get("reasoning_log", []))
        time.sleep(1)   # rate limit between agents

        # ── Phase 2: Signal Agent ────────────────────────────────────────────
        print("\nPhase 2: Signal Agent running...")
        signal_result = self.signal_agent.run_signal_detection(
            symbols, portfolio
        )
        self.full_audit_log.extend(signal_result.get("reasoning_log", []))

        # Parse top signals from Signal Agent response
        top_signals = self._parse_signals(signal_result["response"])
        time.sleep(1)

        # ── Phase 3: Insight Agent ───────────────────────────────────────────
        print("\nPhase 3: Insight Agent running...")
        insight_result = self.insight_agent.run_insight_generation(
            top_signals, portfolio
        )
        self.full_audit_log.extend(insight_result.get("reasoning_log", []))

        # Parse final output
        final = self._parse_final(insight_result["response"], top_signals)

        elapsed = (datetime.now() - start).total_seconds()

        print(f"\n=== Radar complete in {elapsed:.1f}s ===")
        print(f"Act: {len(final['act'])}  "
              f"Watch: {len(final['watch'])}  "
              f"Exit: {len(final['exit_radar'])}")

        return {
            **final,
            "total_scanned":   len(symbols),
            "total_signals":   len(top_signals),
            "elapsed_seconds": round(elapsed, 1),
            "audit_log":       self.full_audit_log,
            "tool_calls":      self.executor.audit_log,
            "scanned_at":      datetime.now().isoformat()
        }

    def _parse_signals(self, response_text: str) -> list:
        """Extract structured signal list from Signal Agent response."""
        try:
            # Try to find JSON in the response
            start = response_text.find("[")
            end   = response_text.rfind("]") + 1
            if start >= 0 and end > start:
                return json.loads(response_text[start:end])
        except (json.JSONDecodeError, ValueError):
            pass
        # Fallback: return signals from executor cache
        from backend.signals.scorer import _latest_signals
        signals = list(_latest_signals.values())
        signals.sort(key=lambda x: x.get("score", 0), reverse=True)
        return signals[:10]

    def _parse_final(self, response_text: str, fallback_signals: list) -> dict:
        """Extract final bucketed result from Insight Agent response."""
        try:
            start = response_text.find("{")
            end   = response_text.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(response_text[start:end])
                if "act" in parsed:
                    return parsed
        except (json.JSONDecodeError, ValueError):
            pass

        # Fallback: bucket the signals ourselves
        act    = [s for s in fallback_signals if s.get("score", 0) >= 0.65][:3]
        watch  = [s for s in fallback_signals
                  if 0.35 <= s.get("score", 0) < 0.65][:5]
        exit_r = [s for s in fallback_signals if s.get("score", 0) < 0][:3]

        return {
            "act":              act,
            "watch":            watch,
            "exit_radar":       exit_r,
            "portfolio_brief":  ""
        }


# ── Full Universe Scan (async entry point) ─────────────────────────────────

async def run_full_universe(
    portfolio: list = [],
    max_tier2_stocks: int = 300,
    max_tier3_stocks: int = 30
) -> dict:
    """
    Full 4000+ stock scan using three-tier progressive filtering.

    Tier 1: Load all NSE symbols, batch fetch OHLC, filter by liquidity
    Tier 2: Momentum pre-filter → top 300 candidates for pattern detection
    Tier 3: Full convergence scoring + Gemini on top 30
    """
    from backend.data.universe import (
        load_full_nse_universe,
        tier1_filter,
        momentum_prefilter
    )
    from backend.data.fetcher import fetch_ohlc_batch
    from backend.patterns.detector import detect_patterns_all
    from backend.signals.scorer import score_all_signals
    from backend.data.fetcher import fetch_bulk_deals

    start     = datetime.now()
    all_syms  = load_full_nse_universe()   # 2700+ symbols

    print(f"\n=== Full Universe Scan: {len(all_syms)} stocks ===")

    # ── TIER 1: Batch fetch + liquidity filter ──────────────────────────────
    print("\nTier 1: Batch fetching OHLC...")
    ohlc_data = fetch_ohlc_batch(all_syms, period="1y")
    print(f"Got data for {len(ohlc_data)} stocks")

    liquid_syms = tier1_filter(ohlc_data)
    print(f"Tier 1 filter: {len(ohlc_data)} → {len(liquid_syms)} liquid stocks")

    # ── TIER 2: Momentum pre-filter ─────────────────────────────────────────
    liquid_ohlc   = {s: ohlc_data[s] for s in liquid_syms if s in ohlc_data}
    tier2_syms    = momentum_prefilter(liquid_ohlc, top_n=max_tier2_stocks)
    tier2_ohlc    = {s: ohlc_data[s] for s in tier2_syms if s in ohlc_data}
    print(f"Tier 2 filter: {len(liquid_syms)} → {len(tier2_syms)} momentum candidates")

    # ── TIER 3: Full signal analysis ─────────────────────────────────────────
    print("\nTier 3: Full pattern detection + scoring...")
    bulk_deals = fetch_bulk_deals()
    patterns   = detect_patterns_all(tier2_ohlc)
    signals    = score_all_signals(
        ohlc_data=tier2_ohlc,
        bulk_deals=bulk_deals,
        patterns=patterns,
        portfolio=portfolio
    )

    # Top 30 get Gemini analysis
    top30 = signals[:max_tier3_stocks]
    for sig in top30:
        from backend.ai.gemini_client import generate_signal_card
        sig["ai_card"] = generate_signal_card(sig)

    elapsed = (datetime.now() - start).total_seconds()
    print(f"\nFull scan complete in {elapsed:.0f}s")
    print(f"Universe: {len(all_syms)} → {len(liquid_syms)} "
          f"→ {len(tier2_syms)} → {len(signals)} scored")

    act    = [s for s in signals if s["score"] >= 0.65][:5]
    watch  = [s for s in signals if 0.35 <= s["score"] < 0.65][:8]
    exit_r = [s for s in signals if s["score"] < 0][:5]

    return {
        "act":              act,
        "watch":            watch,
        "exit_radar":       exit_r,
        "total_scanned":    len(all_syms),
        "liquid_stocks":    len(liquid_syms),
        "analysed_stocks":  len(tier2_syms),
        "signals_found":    len(signals),
        "elapsed_seconds":  round(elapsed),
        "scanned_at":       datetime.now().isoformat(),
    }