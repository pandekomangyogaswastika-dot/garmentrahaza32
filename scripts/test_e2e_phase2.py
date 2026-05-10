#!/usr/bin/env python3
"""End-to-end test: full wizard flow with rate setup → completion gate.

Tests:
  1. Create order via wizard with process_rates per item (Issue 4)
  2. Verify WO has process_rates populated (Issue 4)
  3. Verify Order with newly-created WO cannot be completed without PACKING (Issue 6)
  4. Add PACKING event then complete (Issue 6)
  5. Verify hide-generate-wo logic via the Orders endpoint (Issue 3)
  6. Verify customer create endpoint accepts inline payload (Issue 1)
"""
import os, requests, asyncio, uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path("/app/backend/.env"))
BACKEND = "http://localhost:8001"

def login():
    r = requests.post(f"{BACKEND}/api/auth/login", json={"email":"admin@garment.com","password":"Admin@123"})
    r.raise_for_status()
    return r.json()["token"]

def pretty(label, ok):
    print(f"  {'✅' if ok else '❌'} {label}")
    return ok

async def main():
    token = login()
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    print("=" * 70)
    print("E2E Test — Phase 2 Issues (1, 3, 4, 6)")
    print("=" * 70)

    # ── Issue 1: Customer inline create ─────────────────────────
    print("\n[Issue 1] Customer inline create via API")
    new_cust = {
        "code": f"E2E-{uuid.uuid4().hex[:6].upper()}",
        "name": "E2E Test Customer",
        "company_type": "company",
        "payment_terms": "net_30",
    }
    r = requests.post(f"{BACKEND}/api/rahaza/customers", headers=h, json=new_cust)
    s1 = r.status_code in (200, 201) and "id" in r.json()
    pretty(f"Customer created via POST /customers ({r.status_code})", s1)
    test_cust_id = r.json().get("id") if s1 else None

    # ── Issue 4: Wizard with process_rates ─────────────────────
    print("\n[Issue 4] Wizard with rate setup")
    model = await db.rahaza_models.find_one({}, {"_id": 0})
    size = await db.rahaza_sizes.find_one({}, {"_id": 0})
    procs = await db.rahaza_processes.find({"active": True, "is_rework": {"$ne": True}}, {"_id": 0}).to_list(20)
    rajut = next(p for p in procs if p["code"] == "RAJUT")
    linking = next(p for p in procs if p["code"] == "LINKING")
    sewing_s1 = next(p for p in procs if p["code"] == "SEWING_S1")
    packing = next(p for p in procs if p["code"] == "PACKING")

    payload = {
        "is_internal": False,
        "customer_id": test_cust_id,
        "items": [{
            "model_id": model["id"], "size_id": size["id"], "qty": 36,
            "process_rates": [
                {"process_id": rajut["id"], "process_code": "RAJUT", "rate": 9000, "unit": "jam"},
                {"process_id": linking["id"], "process_code": "LINKING", "rate": 400, "unit": "pcs"},
                {"process_id": sewing_s1["id"], "process_code": "SEWING_S1", "rate": 350, "unit": "pcs"},
                {"process_id": packing["id"], "process_code": "PACKING", "rate": 200, "unit": "pcs"},
            ],
        }],
        "auto_release_wo": True,
    }
    r = requests.post(f"{BACKEND}/api/rahaza/wizard/start-production", headers=h, json=payload, timeout=30)
    s4_a = r.status_code == 200
    pretty(f"Wizard accepted process_rates ({r.status_code})", s4_a)
    if not s4_a:
        print(r.text[:300])
        return

    data = r.json()
    order_id = data["order_id"]
    wo_id = data["wos"][0]["id"]

    wo_doc = await db.rahaza_work_orders.find_one({"id": wo_id}, {"_id": 0})
    rates = wo_doc.get("process_rates") or []
    s4_b = len(rates) == 4
    pretty(f"WO has 4 process_rates persisted (got {len(rates)})", s4_b)

    # ── Issue 3: WO count > 0 - listing returns wo_count ─────────
    print("\n[Issue 3] Hide Generate WO when wo_count > 0")
    r = requests.get(f"{BACKEND}/api/rahaza/orders", headers=h, timeout=15)
    orders = r.json()
    target = next((o for o in orders if o["id"] == order_id), None)
    s3 = target is not None and target.get("wo_count", 0) >= 1
    pretty(f"Order has wo_count >= 1 (got {target.get('wo_count') if target else 'N/A'})", s3)

    # ── Issue 6: Order completion gate ─────────────────────────
    print("\n[Issue 6] Order completion gate (PACKING required)")
    r = requests.post(f"{BACKEND}/api/rahaza/orders/{order_id}/status", headers=h, json={"status": "completed"}, timeout=15)
    s6_a = r.status_code == 400 and ("PACKING" in r.text or "Packing" in r.text)
    pretty(f"Order BLOCKED before PACKING ({r.status_code})", s6_a)

    # Add a PACKING event
    evt = {
        "id": str(uuid.uuid4()),
        "work_order_id": wo_id,
        "process_id": packing["id"],
        "process_code": "PACKING",
        "event_type": "output",
        "qty": 36, "qty_pcs": 36,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rahaza_wip_events.insert_one(evt)

    r = requests.post(f"{BACKEND}/api/rahaza/orders/{order_id}/status", headers=h, json={"status": "completed"}, timeout=15)
    s6_b = r.status_code == 200
    pretty(f"Order ALLOWED after PACKING ({r.status_code})", s6_b)

    # ── Cleanup ──────────────────────────────────────────────
    print("\n[Cleanup]")
    await db.rahaza_wip_events.delete_one({"id": evt["id"]})
    await db.rahaza_work_orders.delete_many({"order_id": order_id})
    await db.rahaza_orders.delete_one({"id": order_id})
    if test_cust_id:
        await db.rahaza_customers.delete_one({"id": test_cust_id})
    print("  cleaned up test data")

    all_pass = all([s1, s4_a, s4_b, s3, s6_a, s6_b])
    print("\n" + "=" * 70)
    print(f"RESULT: {'ALL PASSED ✅' if all_pass else 'SOME FAILED ❌'}")
    print("=" * 70)
    client.close()
    return 0 if all_pass else 2

if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
