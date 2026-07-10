#!/usr/bin/env python3
"""Validate generated match details and optional portrait mappings."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parent.parent
DETAILS_PATH = ROOT / "docs" / "data" / "match-details.json"
PORTRAITS_PATH = ROOT / "docs" / "data" / "match-portraits.json"
TOPOLOGY_PATH = ROOT / "docs" / "data" / "topology.json"
RESULTS_PATH = ROOT / "docs" / "data" / "results.json"

_PORTRAIT_PERMISSIONS = {
    "pending-author-approval",
    "approved-for-production",
}
_DETAIL_PROVIDERS = {
    "FIFA",
    "football-data.org",
    "local-result-feed",
}
_DETAIL_FIELDS = {
    "source",
    "state",
    "home",
    "away",
    "score",
    "winner",
    "round",
    "kickoff",
    "venue",
    "attendance",
    "referee",
    "goals",
    "cards",
}
_BASE_FIELDS = {
    "source",
    "state",
    "home",
    "away",
    "score",
    "winner",
    "round",
    "kickoff",
}
_SOURCE_FIELDS = {
    "provider",
    "competitionId",
    "seasonId",
    "stageId",
    "matchId",
}
_ROUND_BY_NUMBER = {
    **{number: "Round of 32" for number in range(73, 89)},
    **{number: "Round of 16" for number in range(89, 97)},
    **{number: "Quarterfinal" for number in range(97, 101)},
    **{number: "Semifinal" for number in range(101, 103)},
    104: "Final",
}
_PORTRAIT_STAGE = {
    "Round of 32": "Round of 32",
    "Round of 16": "Round of 16",
    "Quarterfinal": "Quarter-final",
    "Semifinal": "Semi-final",
    "Final": "Final",
}
_SLUG_RE = re.compile(r"^[a-z]{3}-[a-z]{3}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_PORTRAIT_TEAM_CODES = {
    "Algeria": "alg",
    "Argentina": "arg",
    "Australia": "aus",
    "Austria": "aus",
    "Belgium": "bel",
    "Bosnia & Herz.": "ban",
    "Brazil": "bra",
    "Canada": "can",
    "Cape Verde": "cve",
    "Colombia": "col",
    "Croatia": "cro",
    "DR Congo": "dco",
    "Ecuador": "ecu",
    "Egypt": "egy",
    "England": "eng",
    "France": "fra",
    "Germany": "ger",
    "Ghana": "gha",
    "Ivory Coast": "ico",
    "Japan": "jap",
    "Mexico": "mex",
    "Morocco": "mor",
    "Netherlands": "net",
    "Norway": "nor",
    "Paraguay": "par",
    "Portugal": "por",
    "Senegal": "sen",
    "South Africa": "saf",
    "Spain": "spa",
    "Sweden": "swe",
    "Switzerland": "swi",
    "United States": "usa",
}


def _object(value: Any, path: str, errors: list[str]) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        errors.append(f"{path}: expected object")
        return None
    return value


def _exact_keys(
    value: Mapping[str, Any],
    required: set[str],
    allowed: set[str],
    path: str,
    errors: list[str],
) -> None:
    missing = sorted(required - set(value))
    unknown = sorted(set(value) - allowed)
    if missing:
        errors.append(f"{path}: missing fields {', '.join(missing)}")
    if unknown:
        errors.append(f"{path}: unknown fields {', '.join(unknown)}")


def _text(value: Any, path: str, errors: list[str]) -> bool:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path}: expected non-empty string")
        return False
    return True


def _nonnegative_int(value: Any, path: str, errors: list[str]) -> bool:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        errors.append(f"{path}: expected non-negative integer")
        return False
    return True


def _iso_timestamp(value: Any, path: str, errors: list[str]) -> bool:
    if not _text(value, path, errors):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{path}: expected ISO-8601 timestamp")
        return False
    if parsed.tzinfo is None:
        errors.append(f"{path}: timestamp must include a timezone")
        return False
    return True


def known_match_codes(topology: Mapping[str, Any]) -> set[str]:
    feeds = topology.get("ko_feed")
    if not isinstance(feeds, Mapping):
        return set()
    codes = set(feeds)
    for children in feeds.values():
        if isinstance(children, list):
            codes.update(child for child in children if isinstance(child, str))
    codes.discard("M103")
    return codes


def _expected_participants(
    topology: Mapping[str, Any],
    results: Mapping[str, Any],
) -> dict[str, tuple[str, str]]:
    participants: dict[str, tuple[str, str]] = {}
    r32 = topology.get("r32")
    if isinstance(r32, list):
        for row in r32:
            if (
                isinstance(row, list)
                and len(row) >= 4
                and all(isinstance(item, str) for item in (row[0], row[2], row[3]))
            ):
                participants[row[0]] = (row[2], row[3])

    feeds = topology.get("ko_feed")
    result_map = results.get("res")
    if not isinstance(feeds, Mapping) or not isinstance(result_map, Mapping):
        return participants
    for code in sorted(feeds, key=lambda item: int(item[1:])):
        children = feeds.get(code)
        if not isinstance(children, list) or len(children) != 2:
            continue
        winners: list[str] = []
        for child in children:
            result = result_map.get(child)
            if not isinstance(result, list) or len(result) < 3:
                winners = []
                break
            winner = result[2]
            if not isinstance(winner, str) or not winner:
                winners = []
                break
            winners.append(winner)
        if len(winners) == 2:
            participants[code] = (winners[0], winners[1])
    return participants


def _expected_round(code: str) -> str | None:
    if not isinstance(code, str) or not code.startswith("M"):
        return None
    try:
        number = int(code[1:])
    except ValueError:
        return None
    return _ROUND_BY_NUMBER.get(number)


def _validate_source(value: Any, path: str, errors: list[str]) -> None:
    source = _object(value, path, errors)
    if source is None:
        return
    _exact_keys(source, {"provider", "matchId"}, _SOURCE_FIELDS, path, errors)
    provider = source.get("provider")
    if provider not in _DETAIL_PROVIDERS:
        errors.append(
            f"{path}.provider: expected FIFA, football-data.org, "
            "or local-result-feed"
        )
    if _text(source.get("matchId"), f"{path}.matchId", errors):
        if provider == "FIFA" and not source["matchId"].isdigit():
            errors.append(f"{path}.matchId: expected numeric string")
    routing = ("competitionId", "seasonId", "stageId")
    present = [field in source for field in routing]
    if any(present) and not all(present):
        errors.append(f"{path}: competitionId, seasonId, and stageId travel together")
    for field in routing:
        if field in source and _text(source[field], f"{path}.{field}", errors):
            if not source[field].isdigit():
                errors.append(f"{path}.{field}: expected numeric string")
    if provider != "FIFA" and any(present):
        errors.append(f"{path}: routing IDs are only valid for FIFA records")


def _validate_score(value: Any, path: str, errors: list[str]) -> None:
    score = _object(value, path, errors)
    if score is None:
        return
    _exact_keys(score, {"home", "away", "note"}, {"home", "away", "note"}, path, errors)
    _nonnegative_int(score.get("home"), f"{path}.home", errors)
    _nonnegative_int(score.get("away"), f"{path}.away", errors)
    if not isinstance(score.get("note"), str):
        errors.append(f"{path}.note: expected string")


def _validate_venue(value: Any, path: str, errors: list[str]) -> None:
    venue = _object(value, path, errors)
    if venue is None:
        return
    _exact_keys(venue, set(), {"stadium", "city"}, path, errors)
    if not venue:
        errors.append(f"{path}: empty venue must be omitted")
    for field in ("stadium", "city"):
        if field in venue:
            _text(venue[field], f"{path}.{field}", errors)


def _validate_events(
    value: Any,
    path: str,
    teams: set[str],
    *,
    event_type: str,
    errors: list[str],
) -> None:
    if not isinstance(value, list):
        errors.append(f"{path}: expected array")
        return
    if not value:
        errors.append(f"{path}: empty arrays must be omitted")
    discriminator = "kind" if event_type == "goal" else "card"
    allowed_values = (
        {"goal", "penalty", "own-goal"}
        if event_type == "goal"
        else {"yellow", "second-yellow", "red"}
    )
    required = {"team", "player", "minute", discriminator}
    for index, raw_event in enumerate(value):
        event_path = f"{path}[{index}]"
        event = _object(raw_event, event_path, errors)
        if event is None:
            continue
        _exact_keys(event, required, required, event_path, errors)
        for field in ("team", "player", "minute", discriminator):
            _text(event.get(field), f"{event_path}.{field}", errors)
        if event.get("team") not in teams:
            errors.append(f"{event_path}.team: expected a match participant")
        if event.get(discriminator) not in allowed_values:
            errors.append(
                f"{event_path}.{discriminator}: unsupported {event_type} value"
            )


def validate_record(
    code: str,
    value: Any,
    *,
    expected_teams: tuple[str, str] | None = None,
    expected_result: Any = None,
) -> list[str]:
    errors: list[str] = []
    path = f"matches.{code}"
    record = _object(value, path, errors)
    if record is None:
        return errors
    _exact_keys(record, _BASE_FIELDS, _DETAIL_FIELDS, path, errors)

    _validate_source(record.get("source"), f"{path}.source", errors)
    if record.get("state") not in {"complete", "partial"}:
        errors.append(f"{path}.state: expected complete or partial")
    home_ok = _text(record.get("home"), f"{path}.home", errors)
    away_ok = _text(record.get("away"), f"{path}.away", errors)
    if home_ok and away_ok and record["home"] == record["away"]:
        errors.append(f"{path}: home and away teams must differ")
    _validate_score(record.get("score"), f"{path}.score", errors)
    winner_ok = _text(record.get("winner"), f"{path}.winner", errors)
    teams = {
        team
        for team in (record.get("home"), record.get("away"))
        if isinstance(team, str)
    }
    if winner_ok and record["winner"] not in teams:
        errors.append(f"{path}.winner: expected a match participant")

    expected_round = _expected_round(code)
    if record.get("round") != expected_round:
        errors.append(f"{path}.round: expected {expected_round}")
    _iso_timestamp(record.get("kickoff"), f"{path}.kickoff", errors)

    if "venue" in record:
        _validate_venue(record["venue"], f"{path}.venue", errors)
    if "attendance" in record:
        _nonnegative_int(record["attendance"], f"{path}.attendance", errors)
    if "referee" in record:
        _text(record["referee"], f"{path}.referee", errors)
    if "goals" in record:
        _validate_events(
            record["goals"],
            f"{path}.goals",
            teams,
            event_type="goal",
            errors=errors,
        )
    if "cards" in record:
        _validate_events(
            record["cards"],
            f"{path}.cards",
            teams,
            event_type="card",
            errors=errors,
        )
    if record.get("state") == "partial":
        forbidden = {"attendance", "referee", "goals", "cards"}.intersection(record)
        if forbidden:
            errors.append(
                f"{path}: partial record contains detail fields "
                + ", ".join(sorted(forbidden))
            )

    if expected_teams and (record.get("home"), record.get("away")) != expected_teams:
        errors.append(
            f"{path}: participants disagree with topology "
            f"({expected_teams[0]} vs {expected_teams[1]})"
        )
    if isinstance(expected_result, list) and len(expected_result) >= 4:
        score = record.get("score")
        if isinstance(score, Mapping):
            actual = (score.get("home"), score.get("away"), score.get("note"))
            expected = (
                expected_result[0],
                expected_result[1],
                expected_result[3],
            )
            if actual != expected:
                errors.append(f"{path}.score: disagrees with results.json")
        if record.get("winner") != expected_result[2]:
            errors.append(f"{path}.winner: disagrees with results.json")
    return errors


def validate_match_details(
    document: Any,
    topology: Mapping[str, Any],
    results: Mapping[str, Any],
    *,
    require_coverage: bool = True,
) -> list[str]:
    errors: list[str] = []
    details = _object(document, "document", errors)
    if details is None:
        return errors
    _exact_keys(
        details,
        {"version", "refreshed", "matches"},
        {"version", "refreshed", "matches"},
        "document",
        errors,
    )
    if details.get("version") != 1:
        errors.append("document.version: expected 1")
    _iso_timestamp(details.get("refreshed"), "document.refreshed", errors)
    matches = _object(details.get("matches"), "document.matches", errors)
    if matches is None:
        return errors

    known = known_match_codes(topology)
    if len(known) != 31:
        errors.append(f"topology: expected 31 knockout match codes, found {len(known)}")
    participants = _expected_participants(topology, results)
    result_map = results.get("res")
    if not isinstance(result_map, Mapping):
        errors.append("results.res: expected object")
        result_map = {}

    for code, record in matches.items():
        if code not in known:
            errors.append(f"document.matches.{code}: unknown knockout match code")
            continue
        errors.extend(
            validate_record(
                code,
                record,
                expected_teams=participants.get(code),
                expected_result=result_map.get(code),
            )
        )
    if require_coverage:
        expected_codes = known.intersection(result_map)
        missing = sorted(expected_codes - set(matches), key=lambda item: int(item[1:]))
        if missing:
            errors.append(
                "document.matches: missing completed matches " + ", ".join(missing)
            )
    return errors


def validate_portraits(
    document: Any,
    details_document: Mapping[str, Any],
    topology: Mapping[str, Any],
) -> list[str]:
    errors: list[str] = []
    portraits = _object(document, "portraits", errors)
    if portraits is None:
        return errors
    _exact_keys(
        portraits,
        {"version", "permission", "host", "matches"},
        {"version", "permission", "host", "matches"},
        "portraits",
        errors,
    )
    if portraits.get("version") != 1:
        errors.append("portraits.version: expected 1")
    if portraits.get("permission") not in _PORTRAIT_PERMISSIONS:
        errors.append(
            "portraits.permission: expected pending-author-approval "
            "or approved-for-production"
        )
    if portraits.get("host") != "https://wc26.bogachev.fr":
        errors.append("portraits.host: host is not allowlisted")
    mappings = _object(portraits.get("matches"), "portraits.matches", errors)
    details = details_document.get("matches")
    if mappings is None:
        return errors
    if not isinstance(details, Mapping):
        errors.append("document.matches: required for portrait identity checks")
        return errors

    known = known_match_codes(topology)
    identities: set[tuple[Any, ...]] = set()
    slugs: set[str] = set()
    external_ids: set[str] = set()
    fields = {"slug", "externalId", "date", "stage", "teams", "score"}
    for code, raw_mapping in mappings.items():
        path = f"portraits.matches.{code}"
        if code not in known:
            errors.append(f"{path}: unknown knockout match code")
            continue
        mapping = _object(raw_mapping, path, errors)
        if mapping is None:
            continue
        _exact_keys(mapping, fields, fields, path, errors)

        slug = mapping.get("slug")
        if not _text(slug, f"{path}.slug", errors) or not _SLUG_RE.fullmatch(slug):
            errors.append(f"{path}.slug: expected lowercase three-letter pair")
        elif slug in slugs:
            errors.append(f"{path}.slug: duplicate portrait slug")
        else:
            slugs.add(slug)

        external_id = mapping.get("externalId")
        if (
            not _text(external_id, f"{path}.externalId", errors)
            or not external_id.isdigit()
        ):
            errors.append(f"{path}.externalId: expected numeric string")
        elif external_id in external_ids:
            errors.append(f"{path}.externalId: duplicate external ID")
        else:
            external_ids.add(external_id)

        date = mapping.get("date")
        if not _text(date, f"{path}.date", errors) or not _DATE_RE.fullmatch(date):
            errors.append(f"{path}.date: expected YYYY-MM-DD")
        expected_round = _expected_round(code)
        expected_stage = _PORTRAIT_STAGE.get(expected_round)
        if mapping.get("stage") != expected_stage:
            errors.append(f"{path}.stage: expected {expected_stage}")

        teams = mapping.get("teams")
        if (
            not isinstance(teams, list)
            or len(teams) != 2
            or not all(isinstance(team, str) and team for team in teams)
            or teams[0] == teams[1]
        ):
            errors.append(f"{path}.teams: expected two distinct team names")
            teams = []
        elif all(team in _PORTRAIT_TEAM_CODES for team in teams):
            expected_slug = "-".join(_PORTRAIT_TEAM_CODES[team] for team in teams)
            if slug != expected_slug:
                errors.append(
                    f"{path}.slug: expected reviewed team slug {expected_slug}"
                )
        else:
            errors.append(f"{path}.teams: missing reviewed portrait team code")
        score = mapping.get("score")
        if (
            not isinstance(score, list)
            or len(score) != 2
            or not all(
                isinstance(number, int)
                and not isinstance(number, bool)
                and number >= 0
                for number in score
            )
        ):
            errors.append(f"{path}.score: expected two non-negative integers")
            score = []

        detail = details.get(code)
        if not isinstance(detail, Mapping):
            errors.append(f"{path}: matching local match detail is unavailable")
            continue
        detail_teams = [detail.get("home"), detail.get("away")]
        detail_score = detail.get("score")
        detail_date = detail.get("kickoff")
        if len(teams) == 2 and set(teams) != set(detail_teams):
            errors.append(f"{path}.teams: disagree with local match details")
        if (
            len(teams) == 2
            and len(score) == 2
            and isinstance(detail_score, Mapping)
            and all(team in detail_teams for team in teams)
        ):
            oriented = [
                detail_score.get("home")
                if team == detail.get("home")
                else detail_score.get("away")
                for team in teams
            ]
            if score != oriented:
                errors.append(f"{path}.score: disagrees with local match details")
        if (
            isinstance(date, str)
            and isinstance(detail_date, str)
            and date != detail_date[:10]
        ):
            errors.append(f"{path}.date: disagrees with local match details")

        if len(teams) == 2 and isinstance(date, str):
            identity = (date, mapping.get("stage"), tuple(sorted(teams)))
            if identity in identities:
                errors.append(f"{path}: duplicate date/stage/team identity")
            identities.add(identity)
    return errors


def portrait_coverage(
    details_document: Mapping[str, Any],
    portrait_document: Mapping[str, Any],
) -> dict[str, Any]:
    details = details_document.get("matches")
    portraits = portrait_document.get("matches")
    detail_codes = set(details) if isinstance(details, Mapping) else set()
    portrait_codes = set(portraits) if isinstance(portraits, Mapping) else set()
    missing = sorted(
        detail_codes - portrait_codes,
        key=lambda item: int(item[1:]),
    )
    return {
        "completed": len(detail_codes),
        "mapped": len(detail_codes.intersection(portrait_codes)),
        "missing": missing,
    }


def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--details", type=Path, default=DETAILS_PATH)
    parser.add_argument("--portraits", type=Path, default=PORTRAITS_PATH)
    parser.add_argument("--topology", type=Path, default=TOPOLOGY_PATH)
    parser.add_argument("--results", type=Path, default=RESULTS_PATH)
    args = parser.parse_args()

    try:
        topology = _load(args.topology)
        results = _load(args.results)
        details = _load(args.details)
        errors = validate_match_details(details, topology, results)
        portraits = _load(args.portraits) if args.portraits.exists() else None
        if portraits is not None:
            errors.extend(validate_portraits(portraits, details, topology))
    except (OSError, json.JSONDecodeError) as error:
        print(f"match-details validation failed: {error}")
        return 1

    if errors:
        print("match-details validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    portrait_note = " and portraits" if args.portraits.exists() else ""
    print(f"match-details{portrait_note} validation passed")
    if portraits is not None:
        coverage = portrait_coverage(details, portraits)
        message = (
            f"portrait coverage: {coverage['mapped']}/{coverage['completed']} "
            "completed matches"
        )
        if coverage["missing"]:
            message += "; awaiting reviewed mappings for " + ", ".join(coverage["missing"])
        print(message)
        print(f"portrait permission: {portraits['permission']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
