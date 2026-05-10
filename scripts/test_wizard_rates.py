#!/usr/bin/env python3
"""Quick test: wizard now accepts process_rates and writes them to created WO."""
import requests
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path("/app/backend/.env"))
BACKEND = "http://localhost:8001"

def login():
    r = requests.post(f"{BACKEND}/api/auth/login", json={"email":"admin@garment.com","password":"Admin@123"})
    r.raise_for_status()
    return r.json()["token"]

async def main():
    token = login()
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    cust = await db.rahaza_customers.find_one({}, {"_id": 0})
    model = await db.rahaza_models.find_one({}, {"_id": 0})
    size = await db.rahaza_sizes.find_one({}, {"_id": 0})
    procs = await db.rahaza_processes.find({"active": True}, {"_id": 0}).to_list(20)

    rajut = next(p for p in procs if p["code"] == "RAJUT")
    linking = next(p for p in procs if p["code"] == "LINKING")

    payload = {
        "is_internal": False,
        "customer_id": cust["id"],
        "items": [{
            "model_id": model["id"],
            "size_id": size["id"],
            "qty": 24,
            "process_rates": [
                {"process_id": rajut["id"], "process_code": "RAJUT", "rate": 8500, "unit": "jam"},
                {"process_id": linking["id"], "process_code": "LINKING", "rate": 350, "unit": "pcs"},
            ],
        }],
        "auto_release_wo": True,
    }
    r = requests.post(f"{BACKEND}/api/rahaza/wizard/start-production", headers=h, json=payload, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"Error: {r.text}")
        return
    data = r.json()
    print(f"Order: {data['order_number']}, WOs: {data['wos_created']}")
    wo_id = data["wos"][0]["id"]
    wo_doc = await db.rahaza_work_orders.find_one({"id": wo_id}, {"_id": 0})
    rates = wo_doc.get("process_rates") or []
    print(f"WO {wo_doc['wo_number']} process_rates: {len(rates)}")
    for r_ in rates:
        print(f"  {r_['process_code']}: Rp {r_['rate']} / {r_['unit']}")

    # Cleanup
    await db.rahaza_work_orders.delete_many({"order_id": data["order_id"]})
    await db.rahaza_orders.delete_one({"id": data["order_id"]})
    print("[Cleanup] removed test order/WOs")

    ok = len(rates) == 2
    print("\nRESULT:", "PASS" if ok else "FAIL")
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
