#!/usr/bin/env python3
"""Pure FIFA match-detail parsing and cache merge helpers."""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from fetch_results import norm


class MatchDetailError(ValueError):
    """Raised when a FIFA payload cannot satisfy the local detail contract."""


_ROUND_NAMES = {
    "round of 32": "Round of 32",
    "round of 16": "Round of 16",
    "quarter-final": "Quarterfinal",
    "quarterfinal": "Quarterfinal",
    "semi-final": "Semifinal",
    "semifinal": "Semifinal",
    "final": "Final",
}
_KNOCKOUT_CODES = {
    *(f"M{number}" for number in range(73, 103)),
    "M104",
}
_DETAIL_FIELDS = {"attendance", "referee", "goals", "cards"}
_ROUND_BY_NUMBER = {
    **{number: "Round of 32" for number in range(73, 89)},
    **{number: "Round of 16" for number in range(89, 97)},
    **{number: "Quarterfinal" for number in range(97, 101)},
    **{number: "Semifinal" for number in range(101, 103)},
    104: "Final",
}
ROOT = Path(__file__).resolve().parent.parent
DETAILS_PATH = ROOT / "docs" / "data" / "match-details.json"


def _mapping(value: Any, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise MatchDetailError(f"{field} must be an object")
    return value


def _required_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MatchDetailError(f"{field} must be a non-empty string")
    return value.strip()


def _localized_text(value: Any, field: str) -> str:
    if isinstance(value, str):
        return _required_text(value, field)
    if not isinstance(value, list):
        raise MatchDetailError(f"{field} must be localized text")
    for locale in ("en-GB", "en"):
        for entry in value:
            if (
                isinstance(entry, Mapping)
                and entry.get("Locale") == locale
                and isinstance(entry.get("Description"), str)
                and entry["Description"].strip()
            ):
                return entry["Description"].strip()
    for entry in value:
        if (
            isinstance(entry, Mapping)
            and isinstance(entry.get("Description"), str)
            and entry["Description"].strip()
        ):
            return entry["Description"].strip()
    raise MatchDetailError(f"{field} has no usable localized text")


def _display_name(value: str) -> str:
    words = value.split()
    return " ".join(word.title() if word.isupper() else word for word in words)


def _player_name(
    teams: tuple[Mapping[str, Any], ...],
    player_id: Any,
    field: str,
) -> str:
    wanted = str(player_id)
    for team in teams:
        players = team.get("Players")
        if not isinstance(players, list):
            continue
        for player in players:
            if (
                not isinstance(player, Mapping)
                or str(player.get("IdPlayer")) != wanted
            ):
                continue
            full_name = _localized_text(
                player.get("ShortName") or player.get("PlayerName"),
                f"{field} player name",
            )
            return _display_name(full_name.split()[-1])
    raise MatchDetailError(f"{field} references unknown player {wanted}")


def _team_name(team: Mapping[str, Any], field: str) -> str:
    return _localized_text(team.get("TeamName"), f"{field}.TeamName")


def _score_value(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise MatchDetailError(f"{field} must be a non-negative integer")
    return value


def _source(payload: Mapping[str, Any]) -> dict[str, str]:
    source = {"provider": "FIFA"}
    fields = {
        "competitionId": "IdCompetition",
        "seasonId": "IdSeason",
        "stageId": "IdStage",
        "matchId": "IdMatch",
    }
    for output, incoming in fields.items():
        value = payload.get(incoming)
        if value is None or str(value).strip() == "":
            raise MatchDetailError(f"{incoming} is required")
        source[output] = str(value)
    return source


def _round(value: Any) -> str:
    raw = _localized_text(value, "StageName")
    normalized = raw.casefold().replace("–", "-").replace("—", "-")
    try:
        return _ROUND_NAMES[normalized]
    except KeyError as error:
        raise MatchDetailError(f"unsupported knockout stage: {raw}") from error


def _venue(payload: Mapping[str, Any]) -> dict[str, str] | None:
    raw = payload.get("Stadium")
    if raw is None:
        return None
    stadium = _mapping(raw, "Stadium")
    venue: dict[str, str] = {}
    for output, incoming in (("stadium", "Name"), ("city", "CityName")):
        value = stadium.get(incoming)
        if value not in (None, "", []):
            venue[output] = _localized_text(value, f"Stadium.{incoming}")
    return venue or None


def _score_note(payload: Mapping[str, Any]) -> str:
    home = payload.get("HomeTeamPenaltyScore")
    away = payload.get("AwayTeamPenaltyScore")
    if home is None and away is None:
        return ""
    home_score = _score_value(home, "HomeTeamPenaltyScore")
    away_score = _score_value(away, "AwayTeamPenaltyScore")
    return f"{max(home_score, away_score)}\u2013{min(home_score, away_score)} pens"


def _winner(
    payload: Mapping[str, Any],
    home_team: Mapping[str, Any],
    away_team: Mapping[str, Any],
    home_name: str,
    away_name: str,
) -> str:
    winner_id = payload.get("Winner")
    if winner_id is not None:
        if str(winner_id) == str(home_team.get("IdTeam")):
            return home_name
        if str(winner_id) == str(away_team.get("IdTeam")):
            return away_name
        raise MatchDetailError("Winner does not identify either participant")

    home_score = _score_value(home_team.get("Score"), "home score")
    away_score = _score_value(away_team.get("Score"), "away score")
    if home_score > away_score:
        return home_name
    if away_score > home_score:
        return away_name
    raise MatchDetailError("completed match has no resolvable winner")


def _base_record(
    payload: Mapping[str, Any],
    home_team: Mapping[str, Any],
    away_team: Mapping[str, Any],
    *,
    state: str,
) -> dict[str, Any]:
    home_name = _team_name(home_team, "home")
    away_name = _team_name(away_team, "away")
    record: dict[str, Any] = {
        "source": _source(payload),
        "state": state,
        "home": home_name,
        "away": away_name,
        "score": {
            "home": _score_value(home_team.get("Score"), "home score"),
            "away": _score_value(away_team.get("Score"), "away score"),
            "note": _score_note(payload),
        },
        "winner": _winner(payload, home_team, away_team, home_name, away_name),
        "round": _round(payload.get("StageName")),
        "kickoff": _required_text(payload.get("Date"), "Date"),
    }
    venue = _venue(payload)
    if venue:
        record["venue"] = venue
    return record


def parse_calendar(
    payload: Mapping[str, Any],
    tmap: Mapping[str, str],
) -> dict[str, dict[str, Any]]:
    """Parse completed knockout matches from a FIFA calendar payload."""

    calendar = _mapping(payload, "calendar payload")
    matches = calendar.get("Results")
    if not isinstance(matches, list):
        raise MatchDetailError("calendar Results must be an array")

    parsed: dict[str, dict[str, Any]] = {}
    for index, raw_match in enumerate(matches):
        match = _mapping(raw_match, f"Results[{index}]")
        number = match.get("MatchNumber")
        if isinstance(number, bool) or not isinstance(number, int):
            continue
        code = f"M{number}"
        if code not in _KNOCKOUT_CODES or match.get("MatchStatus") != 0:
            continue
        if code in parsed:
            raise MatchDetailError(f"duplicate completed calendar match {code}")

        home_team = dict(_mapping(match.get("Home"), f"{code}.Home"))
        away_team = dict(_mapping(match.get("Away"), f"{code}.Away"))
        home_team["TeamName"] = norm(
            _team_name(home_team, f"{code}.Home"),
            dict(tmap),
        )
        away_team["TeamName"] = norm(
            _team_name(away_team, f"{code}.Away"),
            dict(tmap),
        )
        home_team["Score"] = match.get("HomeTeamScore")
        away_team["Score"] = match.get("AwayTeamScore")
        parsed[code] = _base_record(
            match,
            home_team,
            away_team,
            state="partial",
        )
    return dict(sorted(parsed.items(), key=lambda item: int(item[0][1:])))


def _events(
    team: Mapping[str, Any],
    team_name: str,
    collection: str,
    all_teams: tuple[Mapping[str, Any], ...],
) -> list[dict[str, str]]:
    raw_events = team.get(collection)
    if raw_events is None:
        return []
    if not isinstance(raw_events, list):
        raise MatchDetailError(f"{team_name} {collection} must be an array")

    events: list[dict[str, str]] = []
    for index, raw_event in enumerate(raw_events):
        event = _mapping(raw_event, f"{team_name} {collection}[{index}]")
        if collection == "Goals" and event.get("Period") == 11:
            continue
        if collection == "Bookings" and not event.get("IdPlayer"):
            continue
        minute = _required_text(
            event.get("Minute"),
            f"{team_name} {collection}[{index}].Minute",
        )
        player = _player_name(
            all_teams,
            event.get("IdPlayer"),
            f"{team_name} {collection}[{index}]",
        )
        if collection == "Goals":
            kind_by_type = {1: "penalty", 2: "goal", 3: "own-goal"}
            kind = kind_by_type.get(event.get("Type"))
            if kind is None:
                raise MatchDetailError(
                    f"{team_name} Goals[{index}] has unknown goal type"
                )
            events.append(
                {
                    "team": team_name,
                    "player": player,
                    "minute": minute,
                    "kind": kind,
                }
            )
        else:
            card_by_type = {1: "yellow", 2: "second-yellow", 3: "red"}
            card = card_by_type.get(event.get("Card"))
            if card is None:
                raise MatchDetailError(
                    f"{team_name} Bookings[{index}] has unknown card type"
                )
            events.append(
                {
                    "team": team_name,
                    "player": player,
                    "minute": minute,
                    "card": card,
                }
            )
    return events


def parse_live_match(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Parse one FIFA live-match payload into the local detail record shape."""

    match = _mapping(payload, "live payload")
    home_team = _mapping(match.get("HomeTeam"), "HomeTeam")
    away_team = _mapping(match.get("AwayTeam"), "AwayTeam")
    record = _base_record(
        match,
        home_team,
        away_team,
        state="complete",
    )

    attendance = match.get("Attendance")
    if attendance not in (None, ""):
        try:
            parsed_attendance = int(attendance)
        except (TypeError, ValueError) as error:
            raise MatchDetailError("Attendance must be a non-negative integer") from error
        if parsed_attendance < 0:
            raise MatchDetailError("Attendance must be a non-negative integer")
        record["attendance"] = parsed_attendance

    officials = match.get("Officials")
    if officials is not None:
        if not isinstance(officials, list):
            raise MatchDetailError("Officials must be an array")
        referee = next(
            (
                official
                for official in officials
                if isinstance(official, Mapping) and official.get("OfficialType") == 1
            ),
            None,
        )
        if referee:
            record["referee"] = _display_name(
                _localized_text(
                    referee.get("Name") or referee.get("NameShort"),
                    "referee name",
                )
            )

    home_name = record["home"]
    away_name = record["away"]
    all_teams = (home_team, away_team)
    goals = _events(home_team, home_name, "Goals", all_teams) + _events(
        away_team,
        away_name,
        "Goals",
        all_teams,
    )
    cards = _events(home_team, home_name, "Bookings", all_teams) + _events(
        away_team,
        away_name,
        "Bookings",
        all_teams,
    )
    if goals:
        record["goals"] = goals
    if cards:
        record["cards"] = cards
    return record


def record_state(record: Mapping[str, Any]) -> str:
    """Return a record's explicit state, or conservatively infer one."""

    value = record.get("state")
    if value in {"complete", "partial"}:
        return value
    if value is not None:
        raise MatchDetailError("state must be complete or partial")
    return "complete" if _DETAIL_FIELDS.intersection(record) else "partial"


def _identity(record: Mapping[str, Any]) -> tuple[Any, ...]:
    source = record.get("source")
    match_id = source.get("matchId") if isinstance(source, Mapping) else None
    score = record.get("score")
    score_key = (
        score.get("home"),
        score.get("away"),
        score.get("note", ""),
    ) if isinstance(score, Mapping) else (None, None, None)
    return (
        match_id,
        record.get("home"),
        record.get("away"),
        *score_key,
        record.get("winner"),
    )


def merge_details(
    old: Mapping[str, Any] | None,
    new: Mapping[str, Any],
) -> dict[str, Any]:
    """Merge one cache record without downgrading matching complete details."""

    incoming = deepcopy(dict(new))
    incoming["state"] = record_state(incoming)
    if old is None:
        return incoming

    existing = deepcopy(dict(old))
    existing["state"] = record_state(existing)
    if incoming["state"] == "complete":
        return incoming
    if existing["state"] == "complete" and _identity(existing) == _identity(incoming):
        return existing
    return incoming


def _partial_source(code: str, calendar_match: Mapping[str, Any]) -> dict[str, str]:
    ids = calendar_match.get("_ids")
    if isinstance(ids, (list, tuple)) and len(ids) == 4 and all(ids):
        return {
            "provider": "FIFA",
            "competitionId": str(ids[0]),
            "seasonId": str(ids[1]),
            "stageId": str(ids[2]),
            "matchId": str(ids[3]),
        }
    source = _mapping(calendar_match.get("_source"), f"{code}._source")
    return {
        "provider": _required_text(source.get("provider"), f"{code}._source.provider"),
        "matchId": _required_text(source.get("matchId"), f"{code}._source.matchId"),
    }


def _partial_record(
    code: str,
    calendar_match: Mapping[str, Any],
    canonical_result: Any = None,
) -> dict[str, Any]:
    try:
        number = int(code[1:])
        round_name = _ROUND_BY_NUMBER[number]
    except (KeyError, ValueError) as error:
        raise MatchDetailError(f"{code} is not a supported knockout match") from error
    if (
        isinstance(canonical_result, (list, tuple))
        and len(canonical_result) >= 4
    ):
        score_home, score_away, winner, note = canonical_result[:4]
    else:
        score_home = calendar_match.get("gA")
        score_away = calendar_match.get("gB")
        winner = calendar_match.get("winner")
        note = calendar_match.get("note") or ""

    record: dict[str, Any] = {
        "source": _partial_source(code, calendar_match),
        "state": "partial",
        "home": _required_text(calendar_match.get("a"), f"{code}.a"),
        "away": _required_text(calendar_match.get("b"), f"{code}.b"),
        "score": {
            "home": _score_value(score_home, f"{code}.gA"),
            "away": _score_value(score_away, f"{code}.gB"),
            "note": note or "",
        },
        "winner": _required_text(winner, f"{code}.winner"),
        "round": round_name,
        "kickoff": _required_text(calendar_match.get("date"), f"{code}.date"),
    }
    venue = {
        field: value.strip()
        for field, value in (
            ("stadium", calendar_match.get("stadium")),
            ("city", calendar_match.get("city")),
        )
        if isinstance(value, str) and value.strip()
    }
    if venue:
        record["venue"] = venue
    return record


def _align_live_record(
    live_record: Mapping[str, Any],
    partial: Mapping[str, Any],
) -> dict[str, Any]:
    live = deepcopy(dict(live_record))
    live_source = live.get("source")
    partial_source = partial["source"]
    if (
        not isinstance(live_source, Mapping)
        or live_source.get("matchId") != partial_source.get("matchId")
    ):
        raise MatchDetailError("live payload source match ID disagrees with calendar")

    live_score = live.get("score")
    if not isinstance(live_score, Mapping) or (
        live_score.get("home"),
        live_score.get("away"),
        live_score.get("note", ""),
    ) != (
        partial["score"]["home"],
        partial["score"]["away"],
        partial["score"]["note"],
    ):
        raise MatchDetailError("live payload score disagrees with bracket result")

    raw_home = live.get("home")
    raw_away = live.get("away")
    team_names = {
        raw_home: partial["home"],
        raw_away: partial["away"],
    }
    for collection in ("goals", "cards"):
        for event in live.get(collection, []):
            event_team = event.get("team")
            if event_team not in team_names:
                raise MatchDetailError(
                    f"live payload {collection} event has an unknown team"
                )
            event["team"] = team_names[event_team]

    live["source"] = deepcopy(partial["source"])
    live["home"] = partial["home"]
    live["away"] = partial["away"]
    live["winner"] = partial["winner"]
    live["round"] = partial["round"]
    live["kickoff"] = partial["kickoff"]
    return live


def _needs_refresh(
    old: Mapping[str, Any] | None,
    partial: Mapping[str, Any],
) -> bool:
    return (
        old is None
        or record_state(old) == "partial"
        or _identity(old) != _identity(partial)
    )


def _result_identity(record: Mapping[str, Any]) -> tuple[Any, ...]:
    score = record.get("score")
    return (
        record.get("home"),
        record.get("away"),
        score.get("home") if isinstance(score, Mapping) else None,
        score.get("away") if isinstance(score, Mapping) else None,
        score.get("note", "") if isinstance(score, Mapping) else None,
        record.get("winner"),
    )


def update_details(
    topology: Mapping[str, Any],
    results: Mapping[str, Any],
    old_details: Mapping[str, Any] | None,
    calendar_feed: Mapping[str, Mapping[str, Any]],
    fetch_fn,
    *,
    refreshed: str | None = None,
) -> tuple[dict[str, Any], list[str], bool]:
    """Update missing, partial, or score-changed records using an injected fetcher."""

    feeds = _mapping(topology.get("ko_feed"), "topology.ko_feed")
    known_codes = set(feeds)
    for children in feeds.values():
        if isinstance(children, list):
            known_codes.update(children)
        elif isinstance(children, tuple):
            known_codes.update(children)
    known_codes.discard("M103")

    result_map = _mapping(results.get("res"), "results.res")
    previous = old_details or {"version": 1, "matches": {}}
    if previous.get("version") != 1:
        raise MatchDetailError("old match-details version must be 1")
    old_matches = _mapping(previous.get("matches", {}), "old match-details matches")

    records: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    for code in sorted(result_map, key=lambda item: int(item[1:])):
        if code not in known_codes:
            continue
        old = old_matches.get(code)
        calendar_match = calendar_feed.get(code)
        if calendar_match is None:
            if isinstance(old, Mapping):
                records[code] = deepcopy(dict(old))
            else:
                warnings.append(f"{code}: no matched FIFA calendar record")
            continue

        partial = _partial_record(code, calendar_match, result_map.get(code))
        if fetch_fn is None or partial["source"]["provider"] != "FIFA":
            if (
                isinstance(old, Mapping)
                and _result_identity(old) == _result_identity(partial)
            ):
                records[code] = deepcopy(dict(old))
            else:
                records[code] = merge_details(
                    old if isinstance(old, Mapping) else None,
                    partial,
                )
            continue
        if not _needs_refresh(old if isinstance(old, Mapping) else None, partial):
            records[code] = deepcopy(dict(old))
            continue

        ids = tuple(partial["source"][field] for field in (
            "competitionId",
            "seasonId",
            "stageId",
            "matchId",
        ))
        try:
            live = _align_live_record(parse_live_match(fetch_fn(ids)), partial)
        except (OSError, TimeoutError, ValueError) as error:
            warnings.append(
                f"{code} ({partial['source']['matchId']}): "
                f"detail fetch unavailable: {error}"
            )
            records[code] = merge_details(
                old if isinstance(old, Mapping) else None,
                partial,
            )
            continue
        records[code] = merge_details(
            old if isinstance(old, Mapping) else None,
            live,
        )

    old_records = {
        code: deepcopy(dict(record))
        for code, record in old_matches.items()
        if code in result_map and isinstance(record, Mapping)
    }
    if records == old_records and old_details is not None:
        return deepcopy(dict(old_details)), warnings, False

    timestamp = refreshed or (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    document = {
        "version": 1,
        "refreshed": timestamp,
        "matches": records,
    }
    return document, warnings, True


def serialize_details(document: Mapping[str, Any]) -> str:
    """Return stable, readable JSON bytes for the generated document."""

    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def write_details(document: Mapping[str, Any], path: Path = DETAILS_PATH) -> None:
    path.write_text(serialize_details(document), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    import fetch_results as results_sync

    tmap = results_sync.load_team_map()
    with open(results_sync.TOPOLOGY, encoding="utf-8") as handle:
        topology = json.load(handle)
    with open(results_sync.RESULTS, encoding="utf-8") as handle:
        results = json.load(handle)
    old_details = None
    if DETAILS_PATH.exists():
        with DETAILS_PATH.open(encoding="utf-8") as handle:
            old_details = json.load(handle)

    feed, _upcoming = results_sync.results_from_fifa(tmap)
    r32 = [(row[0], row[2], row[3]) for row in topology["r32"]]
    ko_feed = {key: tuple(value) for key, value in topology["ko_feed"].items()}
    _resolved, applied = results_sync.match_all(
        r32,
        ko_feed,
        {key: tuple(value) for key, value in results["res"].items()},
        feed,
    )
    document, warnings, changed = update_details(
        topology,
        results,
        old_details,
        applied,
        results_sync.fetch_fifa_live,
    )
    for warning in warnings:
        print(f"warning: {warning}")
    if not changed:
        print("Match details already current.")
        return 0
    if args.dry_run:
        print(
            f"dry-run: would write {len(document['matches'])} match-detail records."
        )
        return 0
    write_details(document)
    print(f"Updated {DETAILS_PATH.relative_to(ROOT)} ({len(document['matches'])} matches).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
