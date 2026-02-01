#!/usr/bin/env python3
"""
Pull all FlareBank alerts from Hypernative API
Run locally to avoid sandbox rate limits
"""

import requests
import json
import time
from datetime import datetime
import os

# API Configuration
API_URL = "https://api.hypernative.xyz/alerts"
CLIENT_ID = os.getenv("HYPERNATIVE_CLIENT_ID", "zeY4eyZyP2MUhYjdYzHr")
CLIENT_SECRET = os.getenv("HYPERNATIVE_SECRET", "CxEW7AwhTGKk5OJ1RuhEO7@Urxu8D6QeVmu7xPi1")

HEADERS = {
    "x-client-id": CLIENT_ID,
    "x-client-secret": CLIENT_SECRET,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def fetch_all_alerts(batch_size=50, delay=1.5):
    """Fetch all alerts with pagination"""
    all_alerts = []
    offset = 0
    page = 0
    
    print("="*60)
    print("📊 HYPERNATIVE DATA PULL - FLAREBANK")
    print("="*60)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    while True:
        page += 1
        payload = {
            "limit": batch_size,
            "offset": offset,
            "sortBy": "Timestamp",
            "sortDirection": "Asc",  # Oldest first
            "systemAlertTags": ["All"]
        }
        
        print(f"Fetching page {page} (offset {offset})...", end=" ", flush=True)
        
        try:
            response = requests.post(API_URL, headers=HEADERS, json=payload, timeout=30)
            
            if response.status_code == 403:
                print(f"⚠️ Rate limited! Waiting 60 seconds...")
                time.sleep(60)
                continue
            
            if response.status_code != 200:
                print(f"❌ Error: {response.status_code}")
                break
            
            data = response.json()
            
            if data.get("success") and data.get("data"):
                batch = data["data"]
                
                if len(batch) == 0:
                    print("✅ No more data - reached end")
                    break
                
                all_alerts.extend(batch)
                print(f"✅ Got {len(batch)} alerts (total: {len(all_alerts)})")
                
                offset += batch_size
                time.sleep(delay)  # Rate limit protection
            else:
                print(f"❌ Invalid response: {data}")
                break
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            print("Waiting 30 seconds and retrying...")
            time.sleep(30)
            continue
        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error: {e}")
            break
    
    return all_alerts

def analyze_alerts(alerts):
    """Analyze and summarize alerts"""
    if not alerts:
        return
    
    print()
    print("="*60)
    print("📈 ANALYSIS")
    print("="*60)
    
    # By agent
    agents = {}
    for alert in alerts:
        for agent in alert.get("triggeredByCustomAgents", []):
            name = agent.get("customAgentName", "Unknown")
            agents[name] = agents.get(name, 0) + 1
    
    print("\nALERTS BY AGENT:")
    for name, count in sorted(agents.items(), key=lambda x: -x[1]):
        print(f"  {name}: {count}")
    
    # Date range
    timestamps = [a.get("timestamp", "") for a in alerts if a.get("timestamp")]
    if timestamps:
        first = min(timestamps)[:10]
        last = max(timestamps)[:10]
        print(f"\nDATE RANGE: {first} to {last}")
    
    # By severity
    severities = {}
    for alert in alerts:
        sev = alert.get("severity", "Unknown")
        severities[sev] = severities.get(sev, 0) + 1
    
    print("\nBY SEVERITY:")
    for sev, count in sorted(severities.items(), key=lambda x: -x[1]):
        print(f"  {sev}: {count}")

def main():
    # Fetch all alerts
    alerts = fetch_all_alerts()
    
    # Save to file
    output_file = "hypernative_alerts_full.json"
    with open(output_file, "w") as f:
        json.dump(alerts, f, indent=2)
    
    print()
    print("="*60)
    print(f"TOTAL ALERTS: {len(alerts)}")
    print(f"SAVED TO: {output_file}")
    print("="*60)
    
    # Analyze
    analyze_alerts(alerts)
    
    # Also save CSV for easier analysis
    try:
        import pandas as pd
        df = pd.json_normalize(alerts)
        csv_file = "hypernative_alerts_full.csv"
        df.to_csv(csv_file, index=False)
        print(f"CSV SAVED TO: {csv_file}")
    except ImportError:
        print("(Install pandas for CSV export: pip install pandas)")

if __name__ == "__main__":
    main()
