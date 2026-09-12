import json
import urllib.request
import os
import sys
import time
import threading

# Terminal color escape codes
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"
BOLD = "\033[1m"
CYAN = "\033[96m"

RECIPES = [
    {
        "name": "Necklace of Rupture",
        "output_id": 33639,
        "fee": 0,
        "inputs": [
            (19547, 1, "Necklace of Anguish"),
            (33636, 1, "Etched Elder Venator Fang"),
        ],
    },
    {
        "name": "Amulet of Rancour",
        "output_id": 29801,
        "fee": 0,
        "inputs": [
            (19553, 1, "Amulet of Torture"),
            (33534, 1, "Etched Araxyte Fang"),
        ],
    },
    {
        "name": "Voidwaker",
        "output_id": 27690,
        "fee": 500000,
        "inputs": [
            (27681, 1, "Voidwaker Hilt"),
            (27684, 1, "Voidwaker Blade"),
            (27687, 1, "Voidwaker Gem"),
        ],
    },
    {
        "name": "Inquisitor's Armour Set",
        "output_id": 24488,
        "fee": 0,
        "inputs": [
            (24419, 1, "Inquisitor's Great Helm"),
            (24420, 1, "Inquisitor's Hauberk"),
            (24421, 1, "Inquisitor's Plateskirt"),
        ],
    },
    {
        "name": "Oathplate Armour Set",
        "output_id": 30344,
        "fee": 0,
        "inputs": [
            (30338, 1, "Oathplate Helm"),
            (30340, 1, "Oathplate Chest"),
            (30342, 1, "Oathplate Legs"),
        ],
    },
]

def fetch_latest_prices():
    url = "https://prices.runescape.wiki/api/v1/osrs/latest"
    headers = {"User-Agent": "CraftingTracker/1.0 (contact@example.com)"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode()).get("data", {})

def calculate_profits():
    os.system('cls' if os.name == 'nt' else 'clear')
    prices = fetch_latest_prices()
    summary_data = []

    print(f"{BOLD}{CYAN}{'='*95}{RESET}")
    print(f"{BOLD}{CYAN} LIVE OSRS ASSEMBLY MARGIN TRACKER (BUY LOW / SELL HIGH / 2% TAX){RESET}")
    print(f"{BOLD}{CYAN}{'='*95}{RESET}")

    for recipe in RECIPES:
        name = recipe["name"]
        output_id = str(recipe["output_id"])
        creation_fee = recipe.get("fee", 0)

        if output_id not in prices or not prices[output_id].get("high"):
            continue

        gross_sell = prices[output_id]["high"]
        tax = min(int(gross_sell * 0.02), 5000000)
        net_sell = gross_sell - tax

        total_cost = creation_fee
        missing_data = False
        component_lines = []

        for item_id, qty, comp_name in recipe["inputs"]:
            str_id = str(item_id)
            if str_id in prices and prices[str_id].get("low"):
                unit_price = prices[str_id]["low"]
                comp_cost = unit_price * qty
                total_cost += comp_cost
                component_lines.append((comp_name, qty, unit_price, comp_cost))
            else:
                missing_data = True
                break

        if missing_data:
            continue

        profit = net_sell - total_cost
        summary_data.append((name, total_cost, gross_sell, tax, net_sell, profit))

        print(f"\n► {BOLD}{name.upper()}{RESET}")
        print(f"  {'-'*91}")

        for comp_name, qty, unit_price, comp_cost in component_lines:
            print(f"    ├─ {comp_name:<25} | Qty: {qty:<2} | Buy Offer (Low):  {unit_price:>12,} | Total: {comp_cost:>14,}")

        if creation_fee > 0:
            print(f"    ├─ Assembly Fee            | Qty: 1  | Fee:              {creation_fee:>12,} | Total: {creation_fee:>14,}")

        profit_color = GREEN if profit > 0 else RED
        print(f"  {'-'*91}")
        print(f"    ├─ Total Buy Cost (Low)    | {total_cost:>14,}")
        print(f"    ├─ Target Sell Offer (High)| {gross_sell:>14,}")
        print(f"    ├─ GE Tax (2% / 5M Cap)    | {-tax:>14,}")
        print(f"    ├─ Net Revenue             | {net_sell:>14,}")
        print(f"    └─ NET PROFIT              | {profit_color}{profit:>14,}{RESET}")

    print(f"\n\n{BOLD}{CYAN}{'='*95}{RESET}")
    print(f"{BOLD}{CYAN}QUICK SUMMARY TABLE (SLOW BUY LOW / SLOW SELL HIGH){RESET}")
    print(f"{BOLD}{CYAN}{'='*95}{RESET}")
    print(f"{'ITEM':<25} | {'BUY COST (LOW)':<14} | {'SELL OFFER (HIGH)':<18} | {'GE TAX (2%)':<11} | {'NET REVENUE':<12} | {'NET PROFIT':<12}")
    print(f"{'-'*95}")
    for name, cost, gross, tax, net, profit in summary_data:
        p_color = GREEN if profit > 0 else RED
        print(f"{name:<25} | {cost:>14,} | {gross:>18,} | {tax:>11,} | {net:>12,} | {p_color}{profit:>12,}{RESET}")
    print(f"{'='*95}\n")
    print("Auto-refreshes every 5 mins. Press [Enter] for immediate refresh, or 'q' + [Enter] to exit.")

trigger_refresh = threading.Event()

def user_input_thread():
    while True:
        inp = input()
        if inp.strip().lower() == 'q':
            os._exit(0)
        trigger_refresh.set()

if __name__ == "__main__":
    os.system('') # Enable ANSI color codes
    t = threading.Thread(target=user_input_thread, daemon=True)
    t.start()

    while True:
        calculate_profits()
        trigger_refresh.clear()
        trigger_refresh.wait(timeout=300)
