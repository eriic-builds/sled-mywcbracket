#!/usr/bin/env python3
"""Hermetic fixture tests for the FIFA match-detail contract."""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from http.client import IncompleteRead
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from match_details import (  # noqa: E402
    MatchDetailError,
    merge_details,
    parse_calendar,
    parse_live_match,
    record_state,
    serialize_details,
    update_details,
)
from validate_match_details import (  # noqa: E402
    portrait_coverage,
    validate_match_details,
    validate_portraits,
)
from fetch_results import match_all  # noqa: E402
from portrait_sync import (  # noqa: E402
    PORTRAIT_HOST,
    PORTRAIT_TEAM_CODES,
    fetch_portrait_catalog,
    portrait_slug,
    portrait_slug_candidates,
    serialize_portraits,
    update_portraits,
)


def load(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


fixtures = ROOT / "tests" / "fixtures" / "fifa"
calendar_payload = load(fixtures / "calendar.frozen.json")
live_payload = load(fixtures / "live-M97.frozen.json")
malformed_payload = load(fixtures / "malformed.frozen.json")
team_map = load(ROOT / "scripts" / "team_map.json")
topology = load(ROOT / "docs" / "data" / "topology.json")
results = load(ROOT / "docs" / "data" / "results.json")


calendar = parse_calendar(calendar_payload, team_map)
assert len(calendar) == 25, f"expected 25 completed knockout games, got {len(calendar)}"
assert list(calendar) == [f"M{number}" for number in range(73, 98)]
assert calendar["M97"] == {
    "source": {
        "provider": "FIFA",
        "competitionId": "17",
        "seasonId": "285023",
        "stageId": "289289",
        "matchId": "400021536",
    },
    "state": "partial",
    "home": "France",
    "away": "Morocco",
    "score": {"home": 2, "away": 0, "note": ""},
    "winner": "France",
    "round": "Quarterfinal",
    "kickoff": "2026-07-09T20:00:00Z",
    "venue": {"stadium": "Boston Stadium", "city": "Boston"},
}


m97 = parse_live_match(live_payload)
assert m97 == {
    "source": {
        "provider": "FIFA",
        "competitionId": "17",
        "seasonId": "285023",
        "stageId": "289289",
        "matchId": "400021536",
    },
    "state": "complete",
    "home": "France",
    "away": "Morocco",
    "score": {"home": 2, "away": 0, "note": ""},
    "winner": "France",
    "round": "Quarterfinal",
    "kickoff": "2026-07-09T20:00:00Z",
    "venue": {"stadium": "Boston Stadium", "city": "Boston"},
    "attendance": 63811,
    "referee": "Facundo Tello",
    "goals": [
        {"team": "France", "player": "Mbappe", "minute": "60'", "kind": "goal"},
        {"team": "France", "player": "Dembele", "minute": "66'", "kind": "goal"},
    ],
    "cards": [
        {"team": "Morocco", "player": "Diop", "minute": "63'", "card": "yellow"}
    ],
}
assert "possession" not in m97
assert all(value is not None for value in m97.values())


feed_edge_cases = deepcopy(live_payload)
feed_edge_cases["HomeTeam"]["Goals"].append(
    {
        "Type": 1,
        "IdPlayer": "389867",
        "Minute": "",
        "Period": 11,
        "IdTeam": "43946",
    }
)
feed_edge_cases["HomeTeam"]["Goals"].append(
    {
        "Type": 3,
        "IdPlayer": "403083",
        "Minute": "70'",
        "Period": 5,
        "IdTeam": "43946",
    }
)
feed_edge_cases["AwayTeam"]["Bookings"].append(
    {
        "Card": 1,
        "IdPlayer": None,
        "IdCoach": "coach-id",
        "Minute": "80'",
        "Period": 5,
        "IdTeam": "43872",
    }
)
parsed_edge_cases = parse_live_match(feed_edge_cases)
assert len(parsed_edge_cases["goals"]) == 3
assert parsed_edge_cases["goals"][-1] == {
    "team": "France",
    "player": "Diop",
    "minute": "70'",
    "kind": "own-goal",
}
assert parsed_edge_cases["cards"] == m97["cards"]


missing_optional_payload = deepcopy(live_payload)
for field in ("Attendance", "Officials", "Stadium", "BallPossession"):
    missing_optional_payload.pop(field, None)
missing_optional = parse_live_match(missing_optional_payload)
assert "attendance" not in missing_optional
assert "referee" not in missing_optional
assert "venue" not in missing_optional
assert record_state(missing_optional) == "complete"


missing_required = deepcopy(live_payload)
missing_required.pop("IdMatch")
try:
    parse_live_match(missing_required)
except MatchDetailError as error:
    assert "IdMatch" in str(error)
else:
    raise AssertionError("missing IdMatch should fail loudly")


old_complete = deepcopy(m97)
same_partial = deepcopy(calendar["M97"])
assert merge_details(old_complete, same_partial) == old_complete
assert old_complete == m97, "merge mutated the existing record"
assert same_partial == calendar["M97"], "merge mutated the incoming record"

changed_partial = deepcopy(same_partial)
changed_partial["score"]["home"] = 3
changed_partial["winner"] = "France"
merged_changed = merge_details(old_complete, changed_partial)
assert merged_changed["state"] == "partial"
assert "goals" not in merged_changed
assert merge_details(same_partial, m97) == m97
assert merge_details(None, same_partial) == same_partial
assert record_state({"source": {}, "attendance": 1}) == "complete"
assert record_state({"source": {}}) == "partial"


_resolved, applied_ids = match_all(
    [("M73", "Alpha", "Beta")],
    {},
    {},
    [
        {
            "home": "Alpha",
            "away": "Beta",
            "gh": 1,
            "ga": 0,
            "winner": "Alpha",
            "note": "",
            "date": "2026-06-28T00:00:00Z",
            "stage": "Round of 32",
            "stadium": "Test Stadium",
            "city": "Test City",
            "_ids": ("17", "285023", "stage", "match"),
        }
    ],
)
assert applied_ids["M73"]["_ids"] == ("17", "285023", "stage", "match")


applied_m97 = {
    "M97": {
        "a": "France",
        "b": "Morocco",
        "gA": 2,
        "gB": 0,
        "winner": "France",
        "note": "",
        "date": "2026-07-09T20:00:00Z",
        "stage": "Quarter-final",
        "stadium": "Boston Stadium",
        "city": "Boston",
        "_ids": ("17", "285023", "289289", "400021536"),
    }
}
m97_results = {"res": {"M97": [2, 0, "France", ""]}}
fetch_calls = []


def successful_fetch(ids):
    fetch_calls.append(ids)
    return deepcopy(live_payload)


generated, warnings, changed = update_details(
    topology,
    m97_results,
    None,
    applied_m97,
    successful_fetch,
    refreshed="2026-07-10T02:36:41Z",
)
assert changed is True
assert warnings == []
assert fetch_calls == [("17", "285023", "289289", "400021536")]
assert generated["matches"]["M97"] == m97


def unexpected_fetch(_ids):
    raise AssertionError("complete unchanged records must not be refetched")


unchanged, warnings, changed = update_details(
    topology,
    m97_results,
    generated,
    applied_m97,
    unexpected_fetch,
    refreshed="2099-01-01T00:00:00Z",
)
assert changed is False
assert warnings == []
assert serialize_details(unchanged) == serialize_details(generated)


def failed_fetch(_ids):
    raise OSError("fixture endpoint unavailable")


partial_document, warnings, changed = update_details(
    topology,
    m97_results,
    None,
    applied_m97,
    failed_fetch,
    refreshed="2026-07-10T02:36:41Z",
)
assert changed is True
assert partial_document["matches"]["M97"]["state"] == "partial"
assert warnings and "M97" in warnings[0] and "400021536" in warnings[0]

retried, warnings, changed = update_details(
    topology,
    m97_results,
    partial_document,
    applied_m97,
    successful_fetch,
    refreshed="2026-07-10T03:00:00Z",
)
assert changed is True
assert warnings == []
assert retried["matches"]["M97"]["state"] == "complete"

canonical_complete = deepcopy(m97)
canonical_complete["score"] = {"home": 1, "away": 1, "note": "4–3 pens"}
canonical_applied = deepcopy(applied_m97)
canonical_applied["M97"]["gA"] = 1
canonical_applied["M97"]["gB"] = 1
canonical_applied["M97"]["note"] = ""
canonical_document = {
    "version": 1,
    "refreshed": "2026-07-10T02:36:41Z",
    "matches": {"M97": canonical_complete},
}
canonical_results = {"res": {"M97": [1, 1, "France", "4–3 pens"]}}
preserved, warnings, changed = update_details(
    topology,
    canonical_results,
    canonical_document,
    canonical_applied,
    failed_fetch,
    refreshed="2026-07-10T03:00:00Z",
)
assert changed is False
assert warnings == []
assert preserved["matches"]["M97"] == canonical_complete

wrong_winner = deepcopy(m97)
wrong_winner["winner"] = "Morocco"
winner_document = {
    "version": 1,
    "refreshed": "2026-07-10T02:36:41Z",
    "matches": {"M97": wrong_winner},
}
fetch_calls.clear()
corrected_winner, warnings, changed = update_details(
    topology,
    m97_results,
    winner_document,
    applied_m97,
    successful_fetch,
    refreshed="2026-07-10T03:00:00Z",
)
assert changed is True
assert warnings == []
assert fetch_calls == [("17", "285023", "289289", "400021536")]
assert corrected_winner["matches"]["M97"]["winner"] == "France"

fallback_results = deepcopy(results)
fallback_results["res"]["M98"] = [1, 1, "Spain", "5–4 pens"]
fallback_applied = {
    "M98": {
        "a": "Spain",
        "b": "Belgium",
        "gA": 1,
        "gB": 1,
        "winner": "Spain",
        "note": "5–4 pens",
        "date": "2026-07-10T19:00:00Z",
        "stage": "Quarter-final",
        "stadium": "Los Angeles Stadium",
        "city": "Los Angeles",
        "_source": {
            "provider": "football-data.org",
            "matchId": "987654",
        },
    }
}
committed_details = load(ROOT / "docs" / "data" / "match-details.json")
fallback_document, warnings, changed = update_details(
    topology,
    fallback_results,
    committed_details,
    fallback_applied,
    None,
    refreshed="2026-07-10T19:30:00Z",
)
assert changed is True
assert warnings == []
assert fallback_document["matches"]["M98"] == {
    "source": {
        "provider": "football-data.org",
        "matchId": "987654",
    },
    "state": "partial",
    "home": "Spain",
    "away": "Belgium",
    "score": {"home": 1, "away": 1, "note": "5–4 pens"},
    "winner": "Spain",
    "round": "Quarterfinal",
    "kickoff": "2026-07-10T19:00:00Z",
    "venue": {
        "stadium": "Los Angeles Stadium",
        "city": "Los Angeles",
    },
}
assert validate_match_details(
    fallback_document,
    topology,
    fallback_results,
) == []


valid_document = {
    "version": 1,
    "refreshed": "2026-07-10T02:36:41Z",
    "matches": {"M97": m97},
}
assert validate_match_details(
    valid_document,
    topology,
    results,
    require_coverage=False,
) == []

malformed_errors = validate_match_details(
    malformed_payload,
    topology,
    results,
    require_coverage=False,
)
assert len(malformed_errors) >= 3
assert any("M103" in error for error in malformed_errors)
assert any("timestamp" in error for error in malformed_errors)


valid_portrait = {
    "version": 1,
    "permission": "pending-author-approval",
    "host": "https://wc26.bogachev.fr",
    "matches": {
        "M97": {
            "slug": "fra-mor",
            "externalId": "1998582",
            "date": "2026-07-09",
            "stage": "Quarter-final",
            "teams": ["France", "Morocco"],
            "score": [2, 0],
        }
    },
}
assert validate_portraits(valid_portrait, valid_document, topology) == []
approved_portrait = deepcopy(valid_portrait)
approved_portrait["permission"] = "approved-for-production"
assert validate_portraits(approved_portrait, valid_document, topology) == []
unknown_permission = deepcopy(valid_portrait)
unknown_permission["permission"] = "required-for-production"
assert any(
    "permission" in error
    for error in validate_portraits(unknown_permission, valid_document, topology)
)
assert portrait_coverage(valid_document, valid_portrait) == {
    "completed": 1,
    "mapped": 1,
    "missing": [],
}
assert portrait_coverage(
    {
        "matches": {
            "M97": m97,
            "M98": m97,
        }
    },
    valid_portrait,
) == {
    "completed": 2,
    "mapped": 1,
    "missing": ["M98"],
}

bad_portrait = deepcopy(valid_portrait)
bad_portrait["matches"]["M97"]["slug"] = "https://example.com/fra-mor"
portrait_errors = validate_portraits(bad_portrait, valid_document, topology)
assert any("slug" in error for error in portrait_errors)

switzerland_document = {
    "version": 1,
    "refreshed": "2026-07-08T00:00:00Z",
    "matches": {
        "M96": {
            "source": {"provider": "FIFA", "matchId": "1998572"},
            "state": "complete",
            "home": "Switzerland",
            "away": "Colombia",
            "score": {"home": 0, "away": 0, "note": "4–3 pens"},
            "winner": "Switzerland",
            "round": "Round of 16",
            "kickoff": "2026-07-07T20:00:00Z",
        }
    },
}
wrong_swiss_slug = {
    "version": 1,
    "permission": "pending-author-approval",
    "host": "https://wc26.bogachev.fr",
    "matches": {
        "M96": {
            "slug": "sui-col",
            "externalId": "1998572",
            "date": "2026-07-07",
            "stage": "Round of 16",
            "teams": ["Switzerland", "Colombia"],
            "score": [0, 0],
        }
    },
}
swiss_errors = validate_portraits(
    wrong_swiss_slug,
    switzerland_document,
    topology,
)
assert any("expected reviewed team slug swi-col" in error for error in swiss_errors)


assert {
    team: PORTRAIT_TEAM_CODES[team]
    for team in ("Norway", "England", "Argentina", "Switzerland", "France", "Spain")
} == {
    "Norway": "nor",
    "England": "eng",
    "Argentina": "arg",
    "Switzerland": "swi",
    "France": "fra",
    "Spain": "spa",
}
assert portrait_slug("Spain", "Belgium") == "spa-bel"
assert portrait_slug("Argentina", "Switzerland") == "arg-swi"
assert portrait_slug("France", "Spain") == "fra-spa"
assert portrait_slug_candidates("Norway", "England") == ("nor-eng", "eng-nor")

m98_document = {
    "version": 1,
    "refreshed": committed_details["refreshed"],
    "matches": {
        "M98": deepcopy(committed_details["matches"]["M98"]),
    },
}
empty_portraits = {
    "version": 1,
    "permission": "approved-for-production",
    "host": PORTRAIT_HOST,
    "matches": {},
}
m98_catalog_entry = {
    "id": "1998994",
    "date": "2026-07-10",
    "round": "knockout",
    "stage": "Quarter-final",
    "home": {
        "name": "Spain",
        "abbr": "SPA",
        "score": 2,
    },
    "away": {
        "name": "Belgium",
        "abbr": "BEL",
        "score": 1,
    },
    "slug": "spa-bel",
}
m98_portrait_page = """
<!doctype html>
<html>
<head>
  <script>window.__MATCH_ID='1998994';</script>
  <title>SPA 2–1 BEL — FIFA World Cup 2026 Data Portraits</title>
</head>
</html>
"""
portrait_fetch_calls = []


def portrait_catalog_fetch(host):
    portrait_fetch_calls.append(("catalog", host))
    return [deepcopy(m98_catalog_entry)]


def portrait_page_fetch(host, slug):
    portrait_fetch_calls.append(("page", host, slug))
    return m98_portrait_page


synced_portraits, warnings, changed = update_portraits(
    m98_document,
    empty_portraits,
    portrait_catalog_fetch,
    portrait_page_fetch,
)
assert changed is True
assert warnings == []
assert portrait_fetch_calls == [
    ("catalog", PORTRAIT_HOST),
    ("page", PORTRAIT_HOST, "spa-bel"),
]
assert empty_portraits["matches"] == {}, "portrait sync mutated the old document"
assert synced_portraits["permission"] == "approved-for-production"
assert synced_portraits["matches"]["M98"] == {
    "slug": "spa-bel",
    "externalId": "1998994",
    "date": "2026-07-10",
    "stage": "Quarter-final",
    "teams": ["Spain", "Belgium"],
    "score": [2, 1],
}
serialized_portraits = serialize_portraits(synced_portraits)
assert '"teams": ["Spain", "Belgium"]' in serialized_portraits
assert '"score": [2, 1]' in serialized_portraits

missing_page, warnings, changed = update_portraits(
    m98_document,
    empty_portraits,
    lambda _host: [deepcopy(m98_catalog_entry)],
    lambda _host, _slug: None,
)
assert changed is False
assert missing_page == empty_portraits
assert any("portrait page not published yet" in warning for warning in warnings)

bad_score_entry = deepcopy(m98_catalog_entry)
bad_score_entry["home"]["score"] = 3
bad_score, warnings, changed = update_portraits(
    m98_document,
    empty_portraits,
    lambda _host: [bad_score_entry],
    lambda _host, _slug: (_ for _ in ()).throw(
        AssertionError("mismatched catalog entries must not fetch a page")
    ),
)
assert changed is False
assert bad_score == empty_portraits
assert any("catalog score disagrees" in warning for warning in warnings)

bad_team_entry = deepcopy(m98_catalog_entry)
bad_team_entry["home"]["abbr"] = "ESP"
bad_teams, warnings, changed = update_portraits(
    m98_document,
    empty_portraits,
    lambda _host: [bad_team_entry],
    lambda _host, _slug: (_ for _ in ()).throw(
        AssertionError("mismatched catalog entries must not fetch a page")
    ),
)
assert changed is False
assert bad_teams == empty_portraits
assert any("catalog team codes disagree" in warning for warning in warnings)

bad_team_name_entry = deepcopy(m98_catalog_entry)
bad_team_name_entry["home"]["name"] = "Australia"
bad_team_names, warnings, changed = update_portraits(
    m98_document,
    empty_portraits,
    lambda _host: [bad_team_name_entry],
    lambda _host, _slug: (_ for _ in ()).throw(
        AssertionError("mismatched catalog entries must not fetch a page")
    ),
)
assert changed is False
assert bad_team_names == empty_portraits
assert any("catalog team names disagree" in warning for warning in warnings)

bad_page_score = m98_portrait_page.replace("SPA 2–1 BEL", "SPA 3–1 BEL")
bad_page, warnings, changed = update_portraits(
    m98_document,
    empty_portraits,
    lambda _host: [deepcopy(m98_catalog_entry)],
    lambda _host, _slug: bad_page_score,
)
assert changed is False
assert bad_page == empty_portraits
assert any("portrait page score disagrees" in warning for warning in warnings)

duplicate_slug_portraits = deepcopy(empty_portraits)
duplicate_slug_portraits["matches"]["M97"] = {
    "slug": "spa-bel",
    "externalId": "1111111",
    "date": "2026-07-09",
    "stage": "Quarter-final",
    "teams": ["France", "Morocco"],
    "score": [2, 0],
}
duplicate_slug, warnings, changed = update_portraits(
    m98_document,
    duplicate_slug_portraits,
    lambda _host: [deepcopy(m98_catalog_entry)],
    lambda _host, _slug: m98_portrait_page,
)
assert changed is False
assert duplicate_slug == duplicate_slug_portraits
assert any("portrait slug already mapped to M97" in warning for warning in warnings)

duplicate_id_portraits = deepcopy(empty_portraits)
duplicate_id_portraits["matches"]["M97"] = {
    "slug": "fra-mor",
    "externalId": "1998994",
    "date": "2026-07-09",
    "stage": "Quarter-final",
    "teams": ["France", "Morocco"],
    "score": [2, 0],
}
duplicate_id, warnings, changed = update_portraits(
    m98_document,
    duplicate_id_portraits,
    lambda _host: [deepcopy(m98_catalog_entry)],
    lambda _host, _slug: m98_portrait_page,
)
assert changed is False
assert duplicate_id == duplicate_id_portraits
assert any("portrait ID already mapped to M97" in warning for warning in warnings)

m99_document = {
    "version": 1,
    "refreshed": "2026-07-11T23:00:00Z",
    "matches": {
        "M99": {
            "source": {"provider": "FIFA", "matchId": "future-M99"},
            "state": "complete",
            "home": "Norway",
            "away": "England",
            "score": {"home": 1, "away": 2, "note": ""},
            "winner": "England",
            "round": "Quarterfinal",
            "kickoff": "2026-07-11T21:00:00Z",
        }
    },
}
eng_nor_entry = {
    "id": "2000001",
    "date": "2026-07-11",
    "round": "knockout",
    "stage": "Quarter-final",
    "home": {"name": "England", "abbr": "ENG", "score": 2},
    "away": {"name": "Norway", "abbr": "NOR", "score": 1},
    "slug": "eng-nor",
}
eng_nor_page = """
<script>window.__MATCH_ID='2000001';</script>
<title>ENG 2–1 NOR — FIFA World Cup 2026 Data Portraits</title>
"""
reversed_portraits, warnings, changed = update_portraits(
    m99_document,
    empty_portraits,
    lambda _host: [eng_nor_entry],
    lambda _host, _slug: eng_nor_page,
)
assert changed is True
assert warnings == []
assert reversed_portraits["matches"]["M99"] == {
    "slug": "eng-nor",
    "externalId": "2000001",
    "date": "2026-07-11",
    "stage": "Quarter-final",
    "teams": ["England", "Norway"],
    "score": [2, 1],
}

rematch_document = {
    "version": 1,
    "refreshed": "2026-07-19T22:00:00Z",
    "matches": {
        "M104": {
            "source": {"provider": "FIFA", "matchId": "future-M104"},
            "state": "complete",
            "home": "France",
            "away": "Norway",
            "score": {"home": 2, "away": 1, "note": ""},
            "winner": "France",
            "round": "Final",
            "kickoff": "2026-07-19T19:00:00Z",
        }
    },
}
stale_nor_fra_entry = {
    "id": "1900001",
    "date": "2026-06-17",
    "round": "group",
    "stage": "Group stage",
    "home": {"name": "Norway", "abbr": "NOR", "score": 1},
    "away": {"name": "France", "abbr": "FRA", "score": 2},
    "slug": "nor-fra",
}
final_fra_nor_entry = {
    "id": "2000002",
    "date": "2026-07-19",
    "round": "knockout",
    "stage": "Final",
    "home": {"name": "France", "abbr": "FRA", "score": 2},
    "away": {"name": "Norway", "abbr": "NOR", "score": 1},
    "slug": "fra-nor",
}
rematch_page_calls = []


def rematch_page_fetch(_host, slug):
    rematch_page_calls.append(slug)
    if slug != "fra-nor":
        raise AssertionError("stale rematch orientation must fail before page fetch")
    return """
    <script>window.__MATCH_ID='2000002';</script>
    <title>FRA 2–1 NOR — FIFA World Cup 2026 Data Portraits</title>
    """


rematch_portraits, warnings, changed = update_portraits(
    rematch_document,
    empty_portraits,
    lambda _host: [stale_nor_fra_entry, final_fra_nor_entry],
    rematch_page_fetch,
)
assert changed is True
assert warnings == []
assert rematch_page_calls == ["fra-nor"]
assert rematch_portraits["matches"]["M104"] == {
    "slug": "fra-nor",
    "externalId": "2000002",
    "date": "2026-07-19",
    "stage": "Final",
    "teams": ["France", "Norway"],
    "score": [2, 1],
}


class TruncatedResponse:
    def __enter__(self):
        return self

    def __exit__(self, _error_type, _error, _traceback):
        return False

    def read(self):
        raise IncompleteRead(b"{", 20)


with patch("portrait_sync.urlopen", return_value=TruncatedResponse()):
    try:
        fetch_portrait_catalog(PORTRAIT_HOST)
    except OSError as error:
        assert "HTTP response failed" in str(error)
    else:
        raise AssertionError("truncated portrait responses must become OSError")


print("match_details fixture tests passed")
