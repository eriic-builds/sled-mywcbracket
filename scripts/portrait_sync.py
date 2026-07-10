#!/usr/bin/env python3
"""Discover and verify published data portraits for completed matches."""

from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from datetime import date
from html import unescape
from http.client import HTTPException
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
DETAILS_PATH = ROOT / "docs" / "data" / "match-details.json"
PORTRAITS_PATH = ROOT / "docs" / "data" / "match-portraits.json"
PORTRAIT_HOST = "https://wc26.bogachev.fr"
PORTRAIT_PERMISSIONS = {
    "pending-author-approval",
    "approved-for-production",
}
PORTRAIT_STAGE_BY_ROUND = {
    "Round of 32": "Round of 32",
    "Round of 16": "Round of 16",
    "Quarterfinal": "Quarter-final",
    "Semifinal": "Semi-final",
    "Final": "Final",
}

# These are the portrait publisher's reviewed codes, not FIFA or ISO codes.
PORTRAIT_TEAM_CODES = {
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
_PORTRAIT_TEAM_NAME_ALIASES = {
    "Bosnia & Herz.": {"Bosnia and Herzegovina"},
    "Cape Verde": {"Cabo Verde"},
    "DR Congo": {"Democratic Republic of the Congo"},
    "Ivory Coast": {"Cote d'Ivoire", "Côte d'Ivoire"},
    "United States": {"USA", "United States of America"},
}

_SLUG_RE = re.compile(r"^[a-z]{3}-[a-z]{3}$")
_PAGE_ID_RE = re.compile(r"""window\.__MATCH_ID\s*=\s*["'](\d+)["']""")
_TITLE_RE = re.compile(
    r"<title[^>]*>\s*([A-Z]{3})\s+(\d+)\s*[-\u2013\u2014]\s*(\d+)"
    r"\s+([A-Z]{3})\b",
    re.IGNORECASE,
)
_USER_AGENT = "Mozilla/5.0 (compatible; wc-bracket-sync/1.0; +https://github.com)"


class PortraitSyncError(ValueError):
    """Raised when portrait data cannot be safely matched to a local game."""


def _mapping(value: Any, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise PortraitSyncError(f"{field} must be an object")
    return value


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PortraitSyncError(f"{field} must be a non-empty string")
    return value.strip()


def _score(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise PortraitSyncError(f"{field} must be a non-negative integer")
    return value


def _date(value: Any, field: str) -> date:
    text = _text(value, field)
    try:
        return date.fromisoformat(text)
    except ValueError as error:
        raise PortraitSyncError(f"{field} must be YYYY-MM-DD") from error


def _match_key(code: str) -> int:
    try:
        return int(code[1:])
    except (TypeError, ValueError):
        return 10_000


def portrait_slug(home: str, away: str) -> str:
    """Return the publisher-specific slug for a local home/away pair."""

    missing = [team for team in (home, away) if team not in PORTRAIT_TEAM_CODES]
    if missing:
        raise PortraitSyncError(
            "missing reviewed portrait team code for " + ", ".join(missing)
        )
    return f"{PORTRAIT_TEAM_CODES[home]}-{PORTRAIT_TEAM_CODES[away]}"


def portrait_slug_candidates(home: str, away: str) -> tuple[str, ...]:
    """Return both possible publisher orientations for a matchup."""

    primary = portrait_slug(home, away)
    reverse = portrait_slug(away, home)
    return tuple(dict.fromkeys((primary, reverse)))


def _read_url(url: str, *, missing_ok: bool = False) -> str | None:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
    except HTTPError as error:
        if missing_ok and error.code == 404:
            return None
        raise OSError(f"HTTP {error.code} for {url}") from error
    except URLError as error:
        raise OSError(f"request failed for {url}: {error.reason}") from error
    except HTTPException as error:
        raise OSError(f"HTTP response failed for {url}: {error}") from error
    try:
        return payload.decode(charset)
    except (LookupError, UnicodeDecodeError) as error:
        raise OSError(f"could not decode {url}") from error


def fetch_portrait_catalog(host: str) -> Any:
    """Fetch the publisher's portrait catalog."""

    text = _read_url(f"{host.rstrip('/')}/matches.json")
    try:
        return json.loads(text or "")
    except json.JSONDecodeError as error:
        raise OSError("portrait catalog returned invalid JSON") from error


def fetch_portrait_page(host: str, slug: str) -> str | None:
    """Fetch one published portrait page, returning None until it exists."""

    return _read_url(f"{host.rstrip('/')}/m/{slug}/", missing_ok=True)


def _catalog_index(catalog: Any) -> dict[str, Mapping[str, Any]]:
    if not isinstance(catalog, list):
        raise PortraitSyncError("portrait catalog must be an array")
    indexed: dict[str, Mapping[str, Any]] = {}
    for raw_entry in catalog:
        if not isinstance(raw_entry, Mapping):
            continue
        slug = raw_entry.get("slug")
        if not isinstance(slug, str) or not _SLUG_RE.fullmatch(slug):
            continue
        if slug in indexed:
            raise PortraitSyncError(f"portrait catalog has duplicate slug {slug}")
        indexed[slug] = raw_entry
    return indexed


def _mapping_from_catalog(
    detail: Mapping[str, Any],
    slug: str,
    entry: Mapping[str, Any],
) -> dict[str, Any]:
    home = _text(detail.get("home"), "detail.home")
    away = _text(detail.get("away"), "detail.away")
    detail_score = _mapping(detail.get("score"), "detail.score")
    home_score = _score(detail_score.get("home"), "detail.score.home")
    away_score = _score(detail_score.get("away"), "detail.score.away")
    round_name = _text(detail.get("round"), "detail.round")
    try:
        stage = PORTRAIT_STAGE_BY_ROUND[round_name]
    except KeyError as error:
        raise PortraitSyncError(f"unsupported portrait round {round_name}") from error
    kickoff = _text(detail.get("kickoff"), "detail.kickoff")
    local_date = _date(kickoff[:10], "detail.kickoff date")

    if entry.get("slug") != slug:
        raise PortraitSyncError("catalog slug disagrees with the expected matchup")
    external_id = entry.get("id")
    if isinstance(external_id, bool) or not isinstance(external_id, (str, int)):
        raise PortraitSyncError("catalog portrait ID must be numeric")
    external_id = str(external_id)
    if not external_id.isdigit():
        raise PortraitSyncError("catalog portrait ID must be numeric")

    catalog_home = _mapping(entry.get("home"), "catalog.home")
    catalog_away = _mapping(entry.get("away"), "catalog.away")
    catalog_names = [
        _text(catalog_home.get("name"), "catalog.home.name"),
        _text(catalog_away.get("name"), "catalog.away.name"),
    ]
    expected_codes = slug.upper().split("-")
    actual_codes = [
        _text(catalog_home.get("abbr"), "catalog.home.abbr").upper(),
        _text(catalog_away.get("abbr"), "catalog.away.abbr").upper(),
    ]
    if actual_codes != expected_codes:
        raise PortraitSyncError(
            "catalog team codes disagree with the reviewed portrait slug"
        )
    catalog_score = [
        _score(catalog_home.get("score"), "catalog.home.score"),
        _score(catalog_away.get("score"), "catalog.away.score"),
    ]
    primary_slug, *reversed_slug = portrait_slug_candidates(home, away)
    if slug == primary_slug:
        teams = [home, away]
        expected_score = [home_score, away_score]
    elif reversed_slug and slug == reversed_slug[0]:
        teams = [away, home]
        expected_score = [away_score, home_score]
    else:
        raise PortraitSyncError("catalog slug disagrees with the local matchup")
    accepted_names = [
        {team, *_PORTRAIT_TEAM_NAME_ALIASES.get(team, set())}
        for team in teams
    ]
    if any(
        catalog_name not in accepted
        for catalog_name, accepted in zip(catalog_names, accepted_names)
    ):
        raise PortraitSyncError("catalog team names disagree with local match details")
    if catalog_score != expected_score:
        raise PortraitSyncError("catalog score disagrees with local match details")
    if entry.get("stage") != stage:
        raise PortraitSyncError("catalog stage disagrees with local match details")

    catalog_date = _date(entry.get("date"), "catalog.date")
    if abs((catalog_date - local_date).days) > 1:
        raise PortraitSyncError("catalog date disagrees with local match details")

    return {
        "slug": slug,
        "externalId": external_id,
        "date": local_date.isoformat(),
        "stage": stage,
        "teams": teams,
        "score": expected_score,
    }


def _verify_portrait_page(page: str, mapping: Mapping[str, Any]) -> None:
    document = unescape(page)
    id_match = _PAGE_ID_RE.search(document)
    if not id_match:
        raise PortraitSyncError("portrait page is missing window.__MATCH_ID")
    if id_match.group(1) != mapping["externalId"]:
        raise PortraitSyncError("portrait page ID disagrees with the catalog")

    title_match = _TITLE_RE.search(document)
    if not title_match:
        raise PortraitSyncError("portrait page title is not recognizable")
    expected_codes = mapping["slug"].upper().split("-")
    actual_codes = [title_match.group(1).upper(), title_match.group(4).upper()]
    if actual_codes != expected_codes:
        raise PortraitSyncError("portrait page teams disagree with the catalog")
    actual_score = [int(title_match.group(2)), int(title_match.group(3))]
    if actual_score != mapping["score"]:
        raise PortraitSyncError("portrait page score disagrees with the catalog")


def _portrait_document(old_portraits: Mapping[str, Any] | None) -> dict[str, Any]:
    if old_portraits is None:
        return {
            "version": 1,
            "permission": "pending-author-approval",
            "host": PORTRAIT_HOST,
            "matches": {},
        }

    document = deepcopy(dict(_mapping(old_portraits, "portrait document")))
    if document.get("version") != 1:
        raise PortraitSyncError("portrait document version must be 1")
    if document.get("permission") not in PORTRAIT_PERMISSIONS:
        raise PortraitSyncError("portrait document permission is invalid")
    if document.get("host") != PORTRAIT_HOST:
        raise PortraitSyncError("portrait document host is not allowlisted")
    matches = _mapping(document.get("matches"), "portrait document matches")
    document["matches"] = {
        code: deepcopy(dict(_mapping(mapping, f"portrait document matches.{code}")))
        for code, mapping in matches.items()
    }
    return document


def update_portraits(
    details_document: Mapping[str, Any],
    old_portraits: Mapping[str, Any] | None,
    catalog_fetch_fn: Callable[[str], Any] | None = fetch_portrait_catalog,
    page_fetch_fn: Callable[[str, str], str | None] | None = fetch_portrait_page,
) -> tuple[dict[str, Any], list[str], bool]:
    """Add verified mappings for completed matches that do not have one yet."""

    document = _portrait_document(old_portraits)
    details = _mapping(details_document.get("matches"), "match details")
    matches = document["matches"]
    missing_codes = [
        code
        for code in sorted(details, key=_match_key)
        if code not in matches
    ]
    if not missing_codes or catalog_fetch_fn is None or page_fetch_fn is None:
        return document, [], False

    warnings: list[str] = []
    host = document["host"]
    try:
        catalog = _catalog_index(catalog_fetch_fn(host))
    except (OSError, TimeoutError, PortraitSyncError) as error:
        warnings.append(f"portrait catalog unavailable: {error}")
        return document, warnings, False

    slug_owners: dict[str, str] = {}
    id_owners: dict[str, str] = {}
    for code, mapping in matches.items():
        slug = mapping.get("slug")
        external_id = mapping.get("externalId")
        if isinstance(slug, str):
            slug_owners.setdefault(slug, code)
        if isinstance(external_id, str):
            id_owners.setdefault(external_id, code)

    added = 0
    for code in missing_codes:
        detail = _mapping(details[code], f"match details.{code}")
        try:
            slug_candidates = portrait_slug_candidates(
                _text(detail.get("home"), f"match details.{code}.home"),
                _text(detail.get("away"), f"match details.{code}.away"),
            )
        except PortraitSyncError as error:
            warnings.append(f"{code}: {error}")
            continue

        published = [
            (slug, catalog[slug])
            for slug in slug_candidates
            if slug in catalog
        ]
        if not published:
            warnings.append(
                f"{code} ({' or '.join(slug_candidates)}): portrait not published yet"
            )
            continue
        verified: list[tuple[str, dict[str, Any]]] = []
        rejected: list[str] = []
        for slug, entry in published:
            try:
                mapping = _mapping_from_catalog(detail, slug, entry)
            except PortraitSyncError as error:
                rejected.append(f"{slug}: {error}")
                continue

            try:
                page = page_fetch_fn(host, slug)
            except (OSError, TimeoutError) as error:
                rejected.append(f"{slug}: portrait page unavailable: {error}")
                continue
            if page is None:
                rejected.append(f"{slug}: portrait page not published yet")
                continue
            try:
                _verify_portrait_page(page, mapping)
            except PortraitSyncError as error:
                rejected.append(f"{slug}: {error}")
                continue

            slug_owner = slug_owners.get(mapping["slug"])
            if slug_owner is not None:
                rejected.append(
                    f"{slug}: portrait slug already mapped to {slug_owner}"
                )
                continue
            id_owner = id_owners.get(mapping["externalId"])
            if id_owner is not None:
                rejected.append(
                    f"{slug}: portrait ID already mapped to {id_owner}"
                )
                continue
            verified.append((slug, mapping))

        if not verified:
            reason = "; ".join(rejected)
            warnings.append(
                f"{code}: no published portrait matches local details"
                + (f" ({reason})" if reason else "")
            )
            continue
        if len(verified) > 1:
            warnings.append(
                f"{code}: multiple portrait orientations match local details; "
                "refusing to guess"
            )
            continue

        slug, mapping = verified[0]
        matches[code] = mapping
        slug_owners[mapping["slug"]] = code
        id_owners[mapping["externalId"]] = code
        added += 1

    if added == 0:
        return document, warnings, False
    document["matches"] = {
        code: matches[code]
        for code in sorted(matches, key=_match_key)
    }
    return document, warnings, True


def serialize_portraits(document: Mapping[str, Any]) -> str:
    """Return the compact, stable JSON format used by match-portraits.json."""

    matches = _mapping(document.get("matches"), "portrait document matches")
    lines = [
        "{",
        f'  "version": {json.dumps(document.get("version"))},',
        f'  "permission": {json.dumps(document.get("permission"), ensure_ascii=False)},',
        f'  "host": {json.dumps(document.get("host"), ensure_ascii=False)},',
        '  "matches": {',
    ]
    ordered = sorted(matches, key=_match_key)
    for index, code in enumerate(ordered):
        mapping = _mapping(matches[code], f"portrait document matches.{code}")
        comma = "," if index < len(ordered) - 1 else ""
        lines.extend(
            [
                f'    {json.dumps(code)}: {{',
                f'      "slug": {json.dumps(mapping.get("slug"), ensure_ascii=False)},',
                f'      "externalId": {json.dumps(mapping.get("externalId"), ensure_ascii=False)},',
                f'      "date": {json.dumps(mapping.get("date"), ensure_ascii=False)},',
                f'      "stage": {json.dumps(mapping.get("stage"), ensure_ascii=False)},',
                f'      "teams": {json.dumps(mapping.get("teams"), ensure_ascii=False)},',
                f'      "score": {json.dumps(mapping.get("score"), ensure_ascii=False)}',
                f"    }}{comma}",
            ]
        )
    lines.extend(["  }", "}"])
    return "\n".join(lines) + "\n"


def write_portraits(
    document: Mapping[str, Any],
    path: Path = PORTRAITS_PATH,
) -> None:
    path.write_text(serialize_portraits(document), encoding="utf-8")


def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--details", type=Path, default=DETAILS_PATH)
    parser.add_argument("--portraits", type=Path, default=PORTRAITS_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        details = _load(args.details)
        old_portraits = _load(args.portraits) if args.portraits.exists() else None
        document, warnings, changed = update_portraits(details, old_portraits)
    except (OSError, json.JSONDecodeError, PortraitSyncError) as error:
        print(f"portrait sync failed: {error}")
        return 1

    for warning in warnings:
        print(f"warning: {warning}")
    if not changed:
        print("No new verified portrait mappings.")
        return 0
    if args.dry_run:
        print("dry-run: verified portrait mappings found; no file written.")
        return 0

    write_portraits(document, args.portraits)
    print("Updated docs/data/match-portraits.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
