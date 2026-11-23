"""Turning a guest's brief into decisions, and decisions back into a ranking.

Following the System One guidance: anything code can check exactly (price, guests, bedrooms, pets) is a hard
filter in code, every soft criterion is one narrow yes/no question, and the ranking is a weighted combination
computed here, not in a prompt.
"""

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


@dataclass
class Criterion:
    id: str
    label: str
    question: str
    yes: str = ""
    no: str = ""
    must: bool = False
    photo: bool = False  # answered from the listing's cover photo, which every model is sent

    def noul(self) -> dict:
        q = {"type": "noul", "instructions": self.question}
        if self.yes or self.no:
            q["criteria"] = {"true": self.yes or "Yes.", "false": self.no or "No."}
        return q


LIBRARY = {c.id: c for c in [
    Criterion("desk", "Real desk for work", "Does the listing have a dedicated workspace with a desk or table for a laptop?",
              "A desk, office or dedicated workspace is mentioned", "No workspace is mentioned, or only a couch or bed"),
    Criterion("wifi", "Fast Wi-Fi", "Does the listing say its Wi-Fi is fast or reliable enough for video calls?",
              "Fast, high-speed or reliable Wi-Fi, or a speed in Mbps, is mentioned", "Wi-Fi speed isn't described"),
    Criterion("quiet", "Quiet street", "Is the listing on a quiet street or in a quiet area?",
              "Described as quiet, peaceful or secluded", "Described as lively or busy, or noise isn't mentioned"),
    Criterion("cafe", "Walk to coffee", "Can a guest walk to a cafe or coffee shop from the listing?",
              "Cafes or coffee shops are described as walkable or nearby", "No walkable cafes are mentioned"),
    Criterion("dining", "Walk to restaurants", "Can a guest walk to restaurants or bars from the listing?",
              "Restaurants or bars are described as walkable", "No walkable restaurants are mentioned"),
    Criterion("yard", "Private outdoor space", "Is there a private outdoor space such as a yard, patio, deck or balcony?",
              "A private yard, patio, deck or balcony", "No private outdoor space, or only shared space"),
    Criterion("fenced", "Fenced yard", "Is there a fenced yard?", "The yard is described as fenced", "No fenced yard is mentioned"),
    Criterion("parking", "Free parking", "Is there free parking at the listing or on the street?",
              "Free parking on the premises, a driveway, or free street parking", "Paid parking only, or none mentioned"),
    Criterion("kitchen", "Full kitchen", "Does the listing have a full kitchen guests can cook in?",
              "A full kitchen with a stove or oven", "No kitchen, or only a microwave or kitchenette"),
    Criterion("kids", "Good for kids", "Is the listing well suited to a family with young children?",
              "Child-friendly features or described as good for families", "Not suited to children, or not mentioned"),
    Criterion("views", "Views", "Does the listing have a notable view, such as mountains, water or a skyline?",
              "A mountain, water, ocean or skyline view is described", "No notable view is mentioned"),
    Criterion("nature", "Near nature", "Is the listing close to trails, parks or nature?",
              "Trails, parks, hiking or nature are nearby", "No nearby nature is mentioned"),
    Criterion("beach", "Walk to the beach", "Can a guest walk to a beach from the listing?",
              "A beach is described as walkable or a few blocks away", "No walkable beach"),
    Criterion("romantic", "Romantic getaway", "Is the listing well suited to a romantic getaway for a couple?",
              "Cozy, intimate or described as great for couples", "Not suited to a couple's getaway"),
    Criterion("pool", "Pool", "Does the listing have a pool? Check the photo and the amenities.",
              "A pool is shown in the photo or listed as an amenity", "No pool", photo=True),
    Criterion("stylish", "Stylish interior", "Look at the photo. Is the space modern and stylishly designed?",
              "The photo shows a modern, well-designed, stylish space", "The photo shows a dated, plain or cluttered space",
              photo=True),
    Criterion("bright", "Bright and airy", "Look at the photo. Is the space bright, with lots of natural light?",
              "The photo shows a bright space with natural light", "The photo is dim, dark or taken at night", photo=True),
    Criterion("outdoor_photo", "Great outdoor space", "Look at the photo. Does it show an inviting outdoor space, such as a "
              "patio, deck, garden or pool area?", "The photo shows an inviting outdoor space",
              "The photo shows an interior, or no inviting outdoor space", photo=True),
    Criterion("cozy", "Cozy feel", "Look at the photo. Does the space look warm and cozy?",
              "The photo shows a warm, cozy, inviting space", "The photo looks cold, bare or impersonal", photo=True),
    Criterion("accessible", "Step-free entry", "Does the listing have step-free access into the home?",
              "Step-free, ground-floor or no-stairs entry", "Stairs to enter, or not mentioned"),
]}

PRESETS = {
    "remote-work-dog": {
        "title": "Work trip, with a dog",
        "filters": {"guests": 2, "max_price": 300, "pets": True},
        "criteria": [("desk", True), ("wifi", False), ("stylish", False), ("pool", False), ("cafe", False), ("yard", False),
                     ("quiet", False)],
    },
    "family-weekend": {
        "title": "Family weekend",
        "filters": {"guests": 5, "max_price": 400, "pets": False},
        "criteria": [("kitchen", True), ("kids", True), ("outdoor_photo", False), ("bright", False), ("yard", False),
                     ("parking", False), ("nature", False)],
    },
    "couples-getaway": {
        "title": "Couple's getaway",
        "filters": {"guests": 2, "max_price": 300, "pets": False},
        "criteria": [("romantic", True), ("cozy", False), ("stylish", False), ("views", False), ("dining", False),
                     ("quiet", False)],
    },
}


def load_city(slug: str) -> dict:
    path = DATA / f"{slug}.json"
    if not path.exists() or not slug.replace("-", "").isalnum():
        raise KeyError(slug)
    return json.loads(path.read_text())


def cities() -> list[dict]:
    out = []
    for path in sorted(DATA.glob("*.json")):
        d = json.loads(path.read_text())
        out.append({"slug": d["slug"], "city": d["city"], "listings": len(d["listings"])})
    return out


def criteria_from(items: list[dict]) -> list[Criterion]:
    """Criteria from the page: library ids, optionally with must set, or custom {label, question}."""
    out, seen = [], set()
    for i, item in enumerate(items):
        if item.get("id") in LIBRARY:
            c = Criterion(**{**asdict(LIBRARY[item["id"]]), "must": bool(item.get("must"))})
        elif (item.get("question") or "").strip():
            question = item["question"].strip()[:300]
            c = Criterion(id=f"custom{i}", label=(item.get("label") or question)[:60], question=question,
                          must=bool(item.get("must")), photo="photo" in question.lower())
        else:
            continue
        if c.id not in seen:
            seen.add(c.id)
            out.append(c)
    return out


def passes_filters(listing: dict, filters: dict) -> bool:
    if filters.get("max_price") and listing["price"] > float(filters["max_price"]):
        return False
    if filters.get("guests") and listing["accommodates"] < int(filters["guests"]):
        return False
    if filters.get("bedrooms") and (listing["bedrooms"] or 0) < int(filters["bedrooms"]):
        return False
    if filters.get("pets") and not any("pets allowed" in a.lower() for a in listing["amenities"]):
        return False
    return True


def candidates(city: dict, filters: dict, limit: int) -> list[dict]:
    """Listings that pass the hard filters, most-reviewed first."""
    ok = [l for l in city["listings"] if passes_filters(l, filters)]
    return sorted(ok, key=lambda l: (-l["reviews"], l["id"]))[:limit]


LISTING_FIELDS = ("name", "property_type", "room_type", "neighbourhood", "accommodates", "bedrooms", "price", "rating",
                  "reviews", "description", "neighborhood_overview", "amenities")


def trip_context(filters: dict) -> dict:
    """The guest's hard limits, as context for judging fit. They were already enforced in code."""
    trip = {}
    if filters.get("guests"): trip["guests"] = int(filters["guests"])
    if filters.get("bedrooms"): trip["min_bedrooms"] = int(filters["bedrooms"])
    if filters.get("max_price"): trip["max_price_per_night_usd"] = float(filters["max_price"])
    if filters.get("pets"): trip["bringing_a_pet"] = True
    return trip


def listing_state(l: dict, trip: dict | None = None) -> dict:
    """What the models see: every listing field that bears on fit (its own words, size, price and reviews), plus the
    guest's trip. Price is per night in USD; rating is out of 5."""
    state = {k: l[k] for k in LISTING_FIELDS if l.get(k) not in (None, "", [])}
    if trip:
        state["guest_trip"] = trip
    return state


def photo_url(l: dict, width: int = 720) -> str:
    """The cover photo, resized by Airbnb's image CDN (the dataset links the full-size original)."""
    return l["picture"].replace("/pictures/", "/im/pictures/", 1) + f"?im_w={width}"


def card(l: dict) -> dict:
    blurb = " ".join((l.get("description") or "").split())
    return {**{k: l[k] for k in ("id", "name", "url", "neighbourhood", "room_type", "property_type", "price", "rating",
                                  "reviews", "accommodates", "bedrooms")},
            "picture": photo_url(l, 480), "blurb": blurb[:160]}


def score(probs: dict[str, float], criteria: list[Criterion]) -> tuple[float, bool]:
    """Weighted mean of the yes-probabilities (must-haves count double), and whether every must-have is met."""
    weights = {c.id: 2.0 if c.must else 1.0 for c in criteria}
    total = sum(weights[c.id] * probs.get(c.id, 0.0) for c in criteria) / (sum(weights.values()) or 1)
    met = all(probs.get(c.id, 0.0) >= 0.5 for c in criteria if c.must)
    return total, met


def ranking(results: dict[str, dict], criteria: list[Criterion]) -> list[str]:
    """Listing ids, best first: listings that meet every must-have, then by score."""
    scored = {lid: score(p, criteria) for lid, p in results.items() if p is not None}
    return sorted(scored, key=lambda lid: (not scored[lid][1], -scored[lid][0], lid))


def agreement(a: dict[str, dict], b: dict[str, dict], criteria: list[Criterion], top: int = 10) -> dict:
    """How closely lane b agreed with lane a over the listings both answered."""
    shared = [lid for lid in a if a[lid] is not None and b.get(lid) is not None]
    if not shared:
        return {"listings": 0}
    ra, rb = ranking({k: a[k] for k in shared}, criteria), ranking({k: b[k] for k in shared}, criteria)
    n = min(top, len(shared))
    pos_a, pos_b = {lid: i for i, lid in enumerate(ra)}, {lid: i for i, lid in enumerate(rb)}
    m = len(shared)
    rho = 1 - 6 * sum((pos_a[k] - pos_b[k]) ** 2 for k in shared) / (m * (m * m - 1)) if m > 1 else 1.0
    pairs = [(a[k][c.id] >= 0.5, b[k][c.id] >= 0.5) for k in shared for c in criteria]
    return {"listings": m, "top": n, "top_overlap": len(set(ra[:n]) & set(rb[:n])),
            "rank_correlation": round(rho, 3), "yes_no_agreement": round(sum(x == y for x, y in pairs) / len(pairs), 3)}


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(len(s) - 1, max(0, math.ceil(q * len(s)) - 1))]
