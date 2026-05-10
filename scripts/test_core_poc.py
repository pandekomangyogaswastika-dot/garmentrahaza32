#!/usr/bin/env python3
"""
POC Test Script — Phase 1: Order Completion Gate (Issue 6)

User stories tested:
1. Admin tries to complete order without any WO → expect 400.
2. Admin tries to complete order with WOs but no PACKING output → expect 400.
3. Admin completes order after PACKING output added → expect 200.
4. Error message should be clear (Indonesian).
5. Endpoint stays compatible with current UI.

Usage:
    python3 /app/scripts/test_core_poc.py
"""
import os
import sys
import json
import requests
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path("/app/backend")
load_dotenv(ROOT / ".env")

BACKEND_URL = "http://localhost:8001"
ADMIN_EMAIL = "admin@garment.com"
ADMIN_PWD = "Admin@123"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def login() -> str:
    r = requests.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PWD},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["token"]


async def setup_test_order(db, customer_id: str, model_id: str, size_id: str):
    """Create a fresh order in 'in_production' status WITHOUT any WO yet, plus a control order."""
    import uuid as _uuid
    from datetime import datetime, timezone

    order_a = {
        "id": str(_uuid.uuid4()),
        "po_number": f"POC-A-{_uuid.uuid4().hex[:6].upper()}",
        "customer_id": customer_id,
        "due_date": "2026-12-31",
        "items": [{"model_id": model_id, "size_id": size_id, "qty": 50}],
        "status": "in_production",
        "in_production_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rahaza_orders.insert_one(order_a)
    return order_a


def pretty(label, ok):
    mark = "✅" if ok else "❌"
    print(f"  {mark} {label}")
    return ok


async def main():
    print("=" * 70)
    print("POC: Order Completion Gate Test")
    print("=" * 70)

    # 1) Login
    try:
        token = login()
        print(f"[OK] Login → token len={len(token)}")
    except Exception as e:
        print(f"[FAIL] Login: {e}")
        return 1
    headers = {"Authorization": f"Bearer {token}"}

    # 2) Connect mongo, fetch helpers
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Get a customer + model + size for synthetic order
    cust = await db.rahaza_customers.find_one({}, {"_id": 0, "id": 1})
    model = await db.rahaza_models.find_one({}, {"_id": 0, "id": 1})
    size = await db.rahaza_sizes.find_one({}, {"_id": 0, "id": 1})
    if not (cust and model and size):
        print("[FAIL] Master data not seeded; run reset-and-seed first.")
        return 1
    print(f"[INFO] customer_id={cust['id'][:8]}.. model_id={model['id'][:8]}.. size_id={size['id'][:8]}..")

    # ──────────────────────────────────────────────────────────────────────
    # USER STORY 1: Order without any WO cannot be completed
    # ──────────────────────────────────────────────────────────────────────
    print("\n[Test 1] Block completion when no WO exists")
    order = await setup_test_order(db, cust["id"], model["id"], size["id"])
    oid = order["id"]
    r = requests.post(
        f"{BACKEND_URL}/api/rahaza/orders/{oid}/status",
        headers=headers,
        json={"status": "completed"},
        timeout=15,
    )
    s1 = r.status_code == 400 and "Work Order" in r.text
    pretty(f"HTTP 400 + clear message (got {r.status_code}: {r.text[:120]})", s1)

    # ──────────────────────────────────────────────────────────────────────
    # USER STORY 2: Order with WOs but no PACKING output cannot be completed
    # ──────────────────────────────────────────────────────────────────────
    print("\n[Test 2] Block completion when no PACKING event exists")
    import uuid as _uuid
    from datetime import datetime, timezone
    wo = {
        "id": str(_uuid.uuid4()),
        "wo_number": f"POC-WO-{_uuid.uuid4().hex[:6].upper()}",
        "order_id": oid,
        "model_id": model["id"],
        "size_id": size["id"],
        "qty": 50,
        "status": "in_production",
        "process_rates": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rahaza_work_orders.insert_one(wo)

    r = requests.post(
        f"{BACKEND_URL}/api/rahaza/orders/{oid}/status",
        headers=headers,
        json={"status": "completed"},
        timeout=15,
    )
    s2 = r.status_code == 400 and ("PACKING" in r.text or "Packing" in r.text)
    pretty(f"HTTP 400 + PACKING reason (got {r.status_code}: {r.text[:120]})", s2)

    # ──────────────────────────────────────────────────────────────────────
    # USER STORY 3: After PACKING output event > 0, completion is allowed
    # ──────────────────────────────────────────────────────────────────────
    print("\n[Test 3] Allow completion when PACKING output > 0")
    # Find a real PACKING process row to mirror process_id (some routes look it up)
    proc = await db.rahaza_processes.find_one({"code": "PACKING"}, {"_id": 0})
    pkg_event = {
        "id": str(_uuid.uuid4()),
        "work_order_id": wo["id"],
        "process_id": (proc or {}).get("id"),
        "process_code": "PACKING",
        "event_type": "output",
        "qty": 25,
        "qty_pcs": 25,
        "operator_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rahaza_wip_events.insert_one(pkg_event)

    r = requests.post(
        f"{BACKEND_URL}/api/rahaza/orders/{oid}/status",
        headers=headers,
        json={"status": "completed"},
        timeout=15,
    )
    s3 = r.status_code == 200 and r.json().get("status") == "completed"
    pretty(f"HTTP 200 + status=completed (got {r.status_code}: {r.text[:120]})", s3)

    # ──────────────────────────────────────────────────────────────────────
    # USER STORY 4: Completion against existing seed flow (sanity)
    # ──────────────────────────────────────────────────────────────────────
    print("\n[Test 4] Sanity — direct API still returns transition info")
    s4 = isinstance(r.json(), dict) and "order_id" in r.json()
    pretty("Response shape OK (status, order_id)", s4)

    # ──────────────────────────────────────────────────────────────────────
    # USER STORY 5: After test, cleanup synthetic data
    # ──────────────────────────────────────────────────────────────────────
    print("\n[Cleanup] Removing synthetic POC data")
    await db.rahaza_wip_events.delete_one({"id": pkg_event["id"]})
    await db.rahaza_work_orders.delete_one({"id": wo["id"]})
    await db.rahaza_orders.delete_one({"id": oid})

    all_pass = all([s1, s2, s3, s4])
    print("\n" + "=" * 70)
    print(f"RESULT: {'ALL PASSED ✅' if all_pass else 'SOME FAILED ❌'}")
    print("=" * 70)
    client.close()
    return 0 if all_pass else 2


if __name__ == "__main__":
    code = asyncio.run(main())
    sys.exit(code)
