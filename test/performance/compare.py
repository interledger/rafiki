#!/usr/bin/env python3
"""Diff two bench.sh result files.

Usage: compare.py results/baseline.json results/phase1.json

Runs are matched on their full dimension tuple (topology / strategy / VUs), so a
peer fan-in run is never silently compared against a local many-to-many one.
Dimensions present on only one side are reported rather than dropped.

Throughput alone does not prove an efficiency win — a run can go faster simply
because it was given more CPU. So this also reports work-per-payment (committed
database transactions) and CPU, which are what actually have to fall for the
system to scale.
"""
import json
import sys


def load(path):
    with open(path) as f:
        return json.load(f)


def key(run):
    d = run.get("dimensions", {})
    # Fall back to the pre-restructure format, which had no dimensions block.
    if not d:
        return ("peer", "fan-in+fan-out", str(run.get("config", {}).get("vus", "?")))
    return (d.get("topology", "?"), d.get("strategy", "?"), str(d.get("vus", "?")))


def pct(before, after):
    if before in (None, 0) or after is None:
        return "n/a"
    return f"{(after - before) / before * 100:+.1f}%"


def mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def group(runs):
    """Collapse repeats of the same dimension tuple into one aggregate.

    A single run cannot resolve a small difference, so bench.sh can repeat each
    matrix cell. Averaging here — and reporting the spread — is what makes a
    claimed improvement checkable against run-to-run noise.
    """
    grouped = {}
    for run in runs:
        grouped.setdefault(key(run), []).append(run)

    out = {}
    for k, rs in grouped.items():
        rates = [r["throughput"]["payments_per_sec"] for r in rs]
        out[k] = {
            "n": len(rs),
            "rate": mean(rates),
            "rate_min": min(rates),
            "rate_max": max(rates),
            # Accepted-per-second overstates capacity when payments are accepted
            # and then fail asynchronously, so carry the completed rate too.
            "done_rate": mean(
                [(r.get("completion") or {}).get("completed_per_sec") for r in rs]
            ),
            "fail_pct": mean(
                [(r.get("completion") or {}).get("failure_pct") for r in rs]
            ),
            "xact": mean([r.get("db", {}).get("xact_per_payment") for r in rs]),
            "iter_med": mean([r["latency"]["iteration"]["med"] for r in rs]),
            # Worst status across repeats: one FAIL makes the cell a FAIL.
            "slo": (
                "FAIL"
                if any(r.get("slo", {}).get("status") == "FAIL" for r in rs)
                else "WARN"
                if any(r.get("slo", {}).get("status") == "WARN" for r in rs)
                else "OK"
            ),
            "per_mutation": {
                name: mean(
                    [(r.get("per_mutation", {}).get(name) or {}).get("avg") for r in rs]
                )
                for name in rs[0].get("per_mutation", {})
            },
            "cpu": {
                c: mean([r.get("cpu_avg_pct", {}).get(c) for r in rs])
                for c in rs[0].get("cpu_avg_pct", {})
            },
        }
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    a, b = load(sys.argv[1]), load(sys.argv[2])

    print(f"BEFORE: {a['label']:<12} {a.get('git_branch','?')} @ {a.get('git_sha','?')}")
    print(f"AFTER : {b['label']:<12} {b.get('git_branch','?')} @ {b.get('git_sha','?')}")
    print()

    ia, ib = a.get("idle_db_tps"), b.get("idle_db_tps")
    if ia is not None and ib is not None:
        print("Idle database load (no load applied — pure background waste)")
        print(f"  {ia} tx/s  ->  {ib} tx/s   ({pct(ia, ib)})")
        print()

    runs_a = group(a["runs"])
    runs_b = group(b["runs"])

    shared = sorted(runs_a.keys() & runs_b.keys(), key=lambda k: (k[0], k[1], int(k[2])))
    only_a = sorted(runs_a.keys() - runs_b.keys())
    only_b = sorted(runs_b.keys() - runs_a.keys())

    if not shared:
        print("No runs share a dimension tuple — nothing comparable.")
    else:
        hdr = (
            f"{'topology':<8}{'strategy':<14}{'VUs':>4}"
            f"{'completed/s':>24}{'db tx/payment':>24}{'SLO':>13}"
        )
        print(hdr)
        print("-" * len(hdr))
        for k in shared:
            ra, rb = runs_a[k], runs_b[k]
            xcell = (
                f"{ra['xact']:>8.1f} -> {rb['xact']:<8.1f} {pct(ra['xact'], rb['xact']):>6}"
                if ra["xact"] is not None and rb["xact"] is not None
                else " " * 24
            )
            # Headline on completed/s where available — accepted/s flatters a run
            # that fails payments after returning 200.
            da, db_ = ra["done_rate"], rb["done_rate"]
            if da is None or db_ is None:
                da, db_ = ra["rate"], rb["rate"]
            print(
                f"{k[0]:<8}{k[1]:<14}{k[2]:>4}"
                f"{da:>8.2f} -> {db_:<8.2f} {pct(da, db_):>6}"
                f"{xcell}"
                f"{ra['slo']:>7} ->{rb['slo']:>5}"
            )
            if ra["fail_pct"] or rb["fail_pct"]:
                print(
                    f"{'':<26}  async failures: "
                    f"{ra['fail_pct'] or 0:.1f}% -> {rb['fail_pct'] or 0:.1f}%"
                    f"   (accepted/s {ra['rate']:.2f} -> {rb['rate']:.2f})"
                )
            # Surface the spread when repeats exist, so a small delta can be
            # judged against noise instead of taken at face value.
            if ra["n"] > 1 or rb["n"] > 1:
                print(
                    f"{'':<26}"
                    f"  before n={ra['n']} [{ra['rate_min']:.2f}-{ra['rate_max']:.2f}]"
                    f"  after n={rb['n']} [{rb['rate_min']:.2f}-{rb['rate_max']:.2f}]"
                )

    if only_a or only_b:
        print()
        for k in only_a:
            print(f"  only in BEFORE: {'/'.join(k)}")
        for k in only_b:
            print(f"  only in AFTER : {'/'.join(k)}")

    print()
    print("Per-mutation avg latency (ms)")
    for k in shared:
        ra, rb = runs_a[k], runs_b[k]
        print(f"  {'/'.join(k)}")
        for name in sorted(ra["per_mutation"]):
            ma, mb = ra["per_mutation"].get(name), rb["per_mutation"].get(name)
            if ma is None or mb is None:
                continue
            print(f"    {name:<26}{ma:>8.1f} -> {mb:<8.1f} {pct(ma, mb):>7}")

    print()
    print("Average CPU % during run")
    for k in shared:
        ra, rb = runs_a[k], runs_b[k]
        print(f"  {'/'.join(k)}")
        for c in sorted(set(ra["cpu"]) | set(rb["cpu"])):
            ca, cb = ra["cpu"].get(c), rb["cpu"].get(c)
            if ca is None or cb is None:
                continue
            short = c.replace("rafiki-", "").replace("-1", "")
            print(f"    {short:<26}{ca:>8.1f} -> {cb:<8.1f} {pct(ca, cb):>7}")

    print()
    fa = sum(r["failures"]["failed_reqs"] for r in a["runs"])
    fb = sum(r["failures"]["failed_reqs"] for r in b["runs"])
    print(f"Failed requests: before={fa}  after={fb}")


if __name__ == "__main__":
    main()
