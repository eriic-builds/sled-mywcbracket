#!/usr/bin/env python3
"""Validate docs/data/results.json before it ships.

Guards the live-data path: the sync bot writes results.json and commits it. This
check runs between the write and the commit (and again on push) so a malformed or
corrupt feed can never publish a broken board. Stdlib only, Python 3.12.

Hard failures (exit 1): missing keys, wrong shapes, negative goals, empty winner,
a winner that is not one of the two teams in that Round-of-32 match, a timestamp
that will not parse or is set in the future, or absurd match counts.

Soft warning (exit 0): data older than STALE_HOURS. A committed file can be
legitimately old between syncs, so age is a warning, not a failure.

Usage:
    python3 scripts/validate_results.py [path-to-results.json]
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS_DATA = os.path.join(HERE, "..", "docs", "data")

STAMP_FMT = "%Y-%m-%dT%H:%M:%SZ"
TOTAL_MATCHES = 31          # 16 R32 + 8 R16 + 4 QF + 2 SF + 1 Final
FUTURE_SLACK_MIN = 5        # clock skew we tolerate before calling it a bug
STALE_HOURS = 48            # older than this only warns


def fail(msg: str) -> None:
    print(f"validate_results: FAIL — {msg}")
    sys.exit(1)


def load_json(path: str):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        fail(f"file not found: {path}")
    except json.JSONDecodeError as exc:
        fail(f"{os.path.basename(path)} is not valid JSON: {exc}")


def r32_team_map(topology) -> dict:
    """Round-of-32 match code -> (teamA, teamB) from topology.r32."""
    out = {}
    for row in (topology or {}).get("r32", []):
        # row shape: [code, date, teamA, teamB]
        if isinstance(row, list) and len(row) >= 4:
            out[row[0]] = (row[2], row[3])
    return out


def main() -> None:
    results_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DOCS_DATA, "results.json")
    topology_path = os.path.join(DOCS_DATA, "topology.json")

    data = load_json(results_path)
    topology = load_json(topology_path) if os.path.exists(topology_path) else {}

    if not isinstance(data, dict):
        fail("top level is not an object")

    # 1) required keys
    for key in ("refreshed", "res", "ko_fix", "auto_hl"):
        if key not in data:
            fail(f"missing required key: {key!r}")

    # 2) refreshed timestamp
    try:
        stamp = datetime.strptime(data["refreshed"], STAMP_FMT).replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        fail(f"'refreshed' does not match {STAMP_FMT}: {data.get('refreshed')!r}")
    now = datetime.now(timezone.utc)
    if (stamp - now).total_seconds() > FUTURE_SLACK_MIN * 60:
        fail(f"'refreshed' is in the future: {data['refreshed']} (now {now.strftime(STAMP_FMT)})")
    age_h = (now - stamp).total_seconds() / 3600

    # 3) res shape + sanity
    res = data["res"]
    if not isinstance(res, dict) or not res:
        fail("'res' must be a non-empty object")
    if len(res) > TOTAL_MATCHES:
        fail(f"'res' has {len(res)} matches, more than the {TOTAL_MATCHES} in the tournament")

    r32 = r32_team_map(topology)
    winner_checked = 0
    for code, val in res.items():
        if not isinstance(val, (list, tuple)) or len(val) != 4:
            fail(f"res[{code!r}] must be [goalsA, goalsB, winner, note], got {val!r}")
        gA, gB, winner, note = val
        if not isinstance(gA, int) or not isinstance(gB, int) or gA < 0 or gB < 0:
            fail(f"res[{code!r}] goals must be non-negative ints, got {gA!r} {gB!r}")
        if not isinstance(winner, str) or not winner.strip():
            fail(f"res[{code!r}] winner must be a non-empty string")
        if not isinstance(note, str):
            fail(f"res[{code!r}] note must be a string, got {note!r}")
        # cross-check the winner for Round-of-32 matches (teams are known up front)
        if code in r32 and winner not in r32[code]:
            fail(f"res[{code!r}] winner {winner!r} is not one of {r32[code]}")
        if code in r32:
            winner_checked += 1

    # 4) ko_fix
    if not isinstance(data["ko_fix"], dict):
        fail("'ko_fix' must be an object")

    # 5) auto_hl rows
    auto_hl = data["auto_hl"]
    if not isinstance(auto_hl, list):
        fail("'auto_hl' must be a list")
    for i, row in enumerate(auto_hl):
        if not isinstance(row, list) or len(row) != 5:
            fail(f"auto_hl[{i}] must be a list of 5 strings, got {row!r}")
        if not all(isinstance(x, str) for x in row):
            fail(f"auto_hl[{i}] must contain only strings")

    # success — warn on staleness but do not fail
    print(
        f"validate_results: OK — {len(res)} results, {len(auto_hl)} highlights, "
        f"{winner_checked} R32 winners cross-checked, refreshed {data['refreshed']} "
        f"({age_h:.1f}h ago)"
    )
    if age_h > STALE_HOURS:
        print(f"validate_results: WARNING — data is {age_h:.1f}h old (over {STALE_HOURS}h)")


if __name__ == "__main__":
    main()
