import requests
import pandas as pd
from pathlib import Path

Path("data").mkdir(exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0",
    "Accept":     "text/csv,application/csv",
    "Referer":    "https://www.nseindia.com/"
}

# NSE official equity list endpoint
url = "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O"

try:
    session = requests.Session()
    session.get("https://www.nseindia.com", headers=headers, timeout=10)

    # Primary: use the official CSV download
    csv_url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
    resp = session.get(csv_url, headers=headers, timeout=30)
    resp.raise_for_status()

    with open("data/EQUITY_L.csv", "wb") as f:
        f.write(resp.content)

    df = pd.read_csv("data/EQUITY_L.csv")
    # Keep only EQ series — normal equity shares
    eq_df = df[df["SERIES"] == "EQ"] if "SERIES" in df.columns else df
    symbols = eq_df["SYMBOL"].dropna().tolist()

    print(f"Downloaded {len(symbols)} NSE equity symbols")
    print(f"Sample: {symbols[:5]}")

    # Save clean symbols list
    pd.Series(symbols).to_csv("data/nse_all_symbols.csv", index=False, header=False)
    print("Saved to data/nse_all_symbols.csv")

except Exception as e:
    print(f"Download failed: {e}")
    print("Manually download from: https://nseindia.com/market-data/securities-available-for-trading")