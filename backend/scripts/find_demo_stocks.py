from backend.data.fetcher import fetch_all_ohlc, fetch_bulk_deals, NIFTY50
from backend.patterns.detector import detect_patterns_all
from backend.signals.scorer import score_all_signals
import json

print("Finding best demo stocks...")
print("This takes ~2 minutes — runs full pipeline on Nifty 50\n")

ohlc    = fetch_all_ohlc(NIFTY50)
deals   = fetch_bulk_deals()
patterns = detect_patterns_all(ohlc)
signals  = score_all_signals(ohlc, deals, patterns, portfolio=[])

print("\n=== TOP 15 CANDIDATES FOR DEMO ===\n")
for s in signals[:15]:
    print(
        f"{s['symbol']:12} "
        f"score={s['score']:+.3f}  "
        f"signals={s['signal_count']}  "
        f"patterns={len(s['patterns'])}  "
        f"tags={s['tags']}"
    )

print("\n=== TOP RISK SIGNALS (for Exit Radar demo) ===\n")
risks = [s for s in signals if s['score'] < -0.3]
for s in risks[:5]:
    print(
        f"{s['symbol']:12} "
        f"score={s['score']:+.3f}  "
        f"tags={s['tags']}"
    )

# Save full output for reference
with open("scripts/demo_candidates.json", "w") as f:
    json.dump(signals[:20], f, indent=2, default=str)

print("\nFull output saved to scripts/demo_candidates.json")
print("\nPICK:")
print("  Stock 1 → highest score, has a pattern + bulk deal")
print("  Stock 2 → second best, ideally in a different sector")
print("  Stock 3 → negative score, for Exit Radar demo moment")