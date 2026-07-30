#!/usr/bin/env python3
"""Diff two bench.sh result files.

Usage: compare.py results/baseline.json results/phase1.json

Throughput alone does not prove an efficiency win — a run can go faster simply
because it was given more CPU. So this also reports work-per-payment
(committed database transactions) and CPU, which are what actually have to fall
for the system to scale.
"""
import json
import sys


def load(path):
    with open(path) as f:
        return json.load(f)


def pct(before, after):
    if before in (None, 0) or after is None:
        return "n/a"
    change = (after - before) / before * 100
    return f"{change:+.1f}%"


def fmt(v, width=9):
    return f"{v:>{width}}" if v is not None else f"{'n/a':>{width}}"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    a, b = load(sys.argv[1]), load(sys.argv[2])

    print(f"BEFORE: {a['label']:<12} {a.get('git_branch','?')} @ {a.get('git_sha','?')}")
    print(f"AFTER : {b['label']:<12} {b.get('git_branch','?')} @ {b.get('git_sha','?')}")
    print()

    ia, ib = a.get("idle_db_tps"), b.get("idle_db_tps")
    if ia is not None and ib is not None:
        print(f"Idle database load (no load applied — pure background waste)")
        print(f"  {ia} tx/s  ->  {ib} tx/s   ({pct(ia, ib)})")
        print()

    runs_a = {r["config"]["vus"]: r for r in a["runs"]}
    runs_b = {r["config"]["vus"]: r for r in b["runs"]}

    hdr = f"{'VUs':<5}{'payments/s':>22}{'db tx/payment':>24}{'iter p50 ms':>22}"
    print(hdr)
    print("-" * len(hdr))
    for vus in sorted(runs_a.keys() & runs_b.keys(), key=int):
        ra, rb = runs_a[vus], runs_b[vus]
        pa = ra["throughput"]["payments_per_sec"]
        pb = rb["throughput"]["payments_per_sec"]
        xa = ra["db"]["xact_per_payment"]
        xb = rb["db"]["xact_per_payment"]
        la = ra["latency"]["iteration"]["med"]
        lb = rb["latency"]["iteration"]["med"]
        print(
            f"{vus:<5}"
            f"{pa:>7} -> {pb:<7} {pct(pa,pb):>6}"
            f"{xa:>8} -> {xb:<8} {pct(xa,xb):>6}"
            f"{la:>7} -> {lb:<7} {pct(la,lb):>6}"
        )

    print()
    print("Per-mutation avg latency (ms)")
    for vus in sorted(runs_a.keys() & runs_b.keys(), key=int):
        ra, rb = runs_a[vus], runs_b[vus]
        print(f"  VUs={vus}")
        for k in sorted(ra.get("per_mutation", {})):
            ma = (ra["per_mutation"].get(k) or {}).get("avg")
            mb = (rb["per_mutation"].get(k) or {}).get("avg")
            if ma is None or mb is None:
                continue
            print(f"    {k:<26}{ma:>8} -> {mb:<8} {pct(ma,mb):>7}")

    print()
    print("Average CPU % during run")
    for vus in sorted(runs_a.keys() & runs_b.keys(), key=int):
        ra, rb = runs_a[vus], runs_b[vus]
        print(f"  VUs={vus}")
        for c in sorted(set(ra.get("cpu_avg_pct", {})) | set(rb.get("cpu_avg_pct", {}))):
            ca = ra.get("cpu_avg_pct", {}).get(c)
            cb = rb.get("cpu_avg_pct", {}).get(c)
            if ca is None or cb is None:
                continue
            short = c.replace("rafiki-", "").replace("-1", "")
            print(f"    {short:<26}{ca:>8} -> {cb:<8} {pct(ca,cb):>7}")

    print()
    fa = sum(r["failures"]["failed_reqs"] for r in a["runs"])
    fb = sum(r["failures"]["failed_reqs"] for r in b["runs"])
    print(f"Failed requests: before={fa}  after={fb}")


if __name__ == "__main__":
    main()
