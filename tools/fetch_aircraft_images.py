"""Download a real photo for each aircraft type into img/<id>.jpg.

Also fetches a second, distinct photo per type into img/<id>-used.jpg for
the used-aircraft market (different angle/livery so it doesn't match new).

Photos are the lead images of each type's Wikipedia article (hosted on
Wikimedia Commons, freely licensed). Attribution is written to
img/CREDITS.txt. Uses only the standard library.

Run from the project root:  python tools/fetch_aircraft_images.py
"""
import json
import os
import time
import urllib.parse
import urllib.request

ARTICLES = {
    "blgxl":  "BelugaXL",
    "dhc6":   "De Havilland Canada DHC-6 Twin Otter",
    "b74sp":  "747SP",
    "ka350":  "Super King Air",
    "atr42":  "ATR 42",
    "crj7":   "Bombardier CRJ700",
    "crj9":   "CRJ900",
    "e175":   "Embraer E175",
    "e195e2": "E195-E2",
    "a21x":   "A321XLR",
    "a310":   "A310",
    "a310f":  "A310",
    "b7810":  "787-10",
    "a35k":   "A350-1000",
    "an124":  "Antonov An-124 Ruslan",
    "an225":  "Antonov An-225 Mriya",
    "c208":   "208 Caravan",
    "c408":   "408 SkyCourier",
    "b1900":  "Beechcraft 1900",
    "dc9":    "DC-9",
    "a318":   "A318",
    "dc10":   "DC-10",
    "l1011":  "L-1011 TriStar",
    "a343":   "A340",
    "a346":   "A340-600",
    "b744":   "747-400",
    "b779":   "777X",
    "atr72":  "ATR 72",
    "q400":   "De Havilland Canada Dash 8",
    "e190e2": "E-Jet E2 family",
    "a220":   "A220",
    "a320n":  "A320neo family",
    "b38m":   "737 MAX",
    "a321n":  "Airbus A321neo",
    "b752":   "757",
    "b763":   "767",
    "a339":   "A330neo",
    "b789":   "787 Dreamliner",
    "a359":   "A350",
    "b77w":   "777",
    "b748":   "747-8",
    "a388":   "A380",
    "b737":   "737 Next Generation",
    "b738":   "737",
    "md88":   "MD-80",
    "md11":   "MD-11",
    "a332":   "A330",
    "a300":   "A300",
    "b707":   "707",
    "conc":   "Concorde",
    # charter VIP jets
    "ph300":  "Phenom 300",
    "citx":   "Citation X",
    "lin1000": "Lineage 1000",
    "g650":   "G650",
    # newer / used-market additions
    "mc214":  "Yakovlev MC-21",
    "b717":   "717",
    "l188":   "L-188 Electra",
    "dc8":    "Douglas DC-8",
    "b77l":   "777",
    "b74d":   "747",
    "il964":  "Ilyushin Il-96",
    "il96":   "Ilyushin Il-96",
    "s340":   "Saab 340",
    "b146":   "British Aerospace 146",
    # A350F freighter photos are scarce on Commons; use a clear A350 airframe shot.
    "a35f":   "Airbus A350",
}

# Variants without a distinct Wikipedia article (or whose article shares its
# lead image with a sibling — every variant must get a DIFFERENT photo):
# search Commons files instead. Delete the jpg and re-run to refetch.
COMMONS = {
    "a333":   "A330-300 landing",
    "b738f":  "737-8AS takeoff",
    "b763f":  "767-300F",
    "md11f":  "MD-11F Cargo",
    "a332f":  "A330-200F",
    "b77f":   "777F landing",
    "b748f":  "747-8F Cargolux",
    "a21x":   "A321XLR",
    "a310f":  "A310-300F",
    "a346":   "A340-600",
    "a35k":   "A350-1000 Qatar",
    "b7810":  "787-10 Singapore Airlines",
    "crj9":   "CRJ900",
    "e195e2": "E195-E2 aircraft",
    "a35u":   "A350-941",
    "b738":   "737-800 landing",
    "c208":   "208 Grand Caravan in flight",
    "a320":   "A320-200 landing",
    "b764":   "767-400ER",
    "b788":   "787-8 Dreamliner takeoff",
    "b731":   "737-100",
    "b741":   "747-100 Pan Am",
    # VIP jets use Wikipedia lead images (ARTICLES) — Commons searches
    # sometimes return cabin interiors or accident photos.
    "mc214":  "Irkut MC-21 aircraft",
    "b717":   "717-200",
    "l188":   "L-188 Electra Airlines",
    "dc8":    "Douglas DC-8 takeoff",
    "b77l":   "777-200LR",
    "b74d":   "747-400D",
    "il964":  "Ilyushin Il-96-400",
    "s340":   "Saab 340 airline landing",
    "b146":   "BAe 146 landing",
    "a35f":   "Airbus A350-941 landing",
    "b1900":  "Beechcraft 1900D airline",
    "crj7":   "Bombardier CRJ700",
    "e175":   "Embraer E175 American Eagle",
    "a321n":  "Airbus A321neo landing",
    "b752":   "Boeing 757-200 landing",
    "b763":   "Boeing 767-300ER takeoff",
    "b77w":   "Boeing 777-300ER landing",
    "blgxl":  "Airbus BelugaXL",
}

# Alternate Commons searches for the used market — aim for a visibly different
# photo (different airline, angle, or era). Falls back to the 2nd hit of the
# primary search when a type isn't listed here.
USED_COMMONS = {
    "a320":   "A320 classic livery",
    "a320n":  "A320neo takeoff",
    "a321n":  "A321neo Wizz Air",
    "a21x":   "A321XLR prototype",
    "a318":   "A318 British Airways",
    "a220":   "A220",
    "a310":   "A310-300 airline",
    "a310f":  "A310F cargo",
    "a332":   "A330-200 takeoff",
    "a333":   "A330-300 Cathay",
    "a332f":  "A330-200F",
    "a339":   "A330-900neo",
    "a343":   "A340-300",
    "a346":   "A340-600 takeoff",
    "a359":   "A350-900 Singapore",
    "a35k":   "A350-1000 Cathay",
    "a35u":   "A350-900ULR Singapore",
    "a35f":   "Airbus A350-900 Singapore",
    "a388":   "A380 takeoff",
    "b737":   "737-700 Southwest",
    "b738":   "737-800",
    "b738f":  "737-400F cargo",
    "b38m":   "737 MAX 8",
    "b752":   "757-200",
    "b763":   "767-300ER",
    "b764":   "767-400ER",
    "b763f":  "767-300F",
    "b788":   "787-8 All Nippon",
    "b789":   "787-9",
    "b7810":  "787-10 Etihad",
    "b744":   "747-400 British Airways",
    "b748":   "747-8i",
    "b748f":  "747-400F",
    "b74sp":  "747SP",
    "b77w":   "777-300ER",
    "b779":   "777-9 rollout",
    "b77f":   "777F",
    "dc9":    "DC-9",
    "md88":   "MD-88",
    "dc10":   "DC-10",
    "md11":   "MD-11",
    "md11f":  "MD-11F cargo",
    "l1011":  "L-1011",
    "atr42":  "ATR 42 airline",
    "atr72":  "ATR 72 Finnair",
    "crj7":   "CRJ700 takeoff",
    "crj9":   "CRJ900",
    "q400":   "De Havilland Dash 8 Q400",
    "e175":   "Embraer 175 airline",
    "e190e2": "E190-E2",
    "e195e2": "E195-E2",
    "c208":   "208 Caravan",
    "c408":   "408 SkyCourier",
    "b1900":  "Beech 1900D Air New Zealand",
    "ka350":  "King Air 350",
    "dhc6":   "DHC-6 Twin Otter",
    "blgxl":  "BelugaXL",
    "an124":  "Antonov An-124",
    "an225":  "Antonov An-225",
    "a300":   "A300B4 airline",
    "b707":   "707 takeoff",
    "b731":   "737-100 airline",
    "b741":   "747-100 classic livery",
    "conc":   "Concorde Air France",
    "ph300":  "Phenom 300 landing",
    "citx":   "Citation X NetJets",
    "lin1000": "Lineage 1000 flight",
    "g650":   "G650 airport",
    "mc214":  "MC-21-300 Aeroflot",
    "b717":   "717 Hawaiian",
    "l188":   "NWT Air Electra",
    "dc8":    "Douglas DC-8 airline",
    "b77l":   "777-200LR",
    "b74d":   "747-400D",
    "il964":  "Ilyushin Il-96 Cubana",
}

USED_SUFFIX = "-used"

UA = {"User-Agent": "SkyTycoonGame/1.0 (local hobby game; one-time asset fetch)"}
API = ("https://en.wikipedia.org/w/api.php?action=query&titles={title}"
       "&prop=pageimages&piprop=thumbnail|name&pithumbsize=560&format=json&redirects=1")


def get(url, tries=4):
    for attempt in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < tries - 1:
                time.sleep(8 * (attempt + 1))   # back off and retry
                continue
            raise


COMMONS_API = ("https://commons.wikimedia.org/w/api.php?action=query"
               "&generator=search&gsrsearch=filetype:bitmap%20{terms}&gsrnamespace=6"
               "&gsrlimit=8&prop=imageinfo&iiprop=url|size&iiurlwidth=560&format=json")


def wikipedia_thumb(title):
    """Lead-image thumbnail of a Wikipedia article -> (url, credit_suffix)."""
    meta = json.load(get(API.format(title=urllib.parse.quote(title))))
    page = next(iter(meta["query"]["pages"].values()))
    thumb = page.get("thumbnail", {}).get("source")
    fname = page.get("pageimage", "")
    return thumb, (f'Wikipedia article "{title}" - '
                   f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(fname)}")


def commons_thumb(terms, pick=0):
    """Commons file-search hit #pick -> (url, credit_suffix).

    Prefers wide landscape photos so we skip diagrams, seat maps and
    portrait-orientation shots.
    """
    meta = json.load(get(COMMONS_API.format(terms=urllib.parse.quote(terms))))
    pages = sorted(meta.get("query", {}).get("pages", {}).values(),
                   key=lambda p: p.get("index", 99))
    hits = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        w, h = info.get("width", 0), info.get("height", 0)
        if info.get("thumburl") and w >= 700 and h < w:
            hits.append((info["thumburl"],
                           f'Commons search "{terms}" - {info.get("descriptionurl", "")}'))
    if pick < len(hits):
        return hits[pick]
    return None, None


def used_terms(pid, kind, ref):
    """Search terms for the alternate used-market photo."""
    if pid in USED_COMMONS:
        return USED_COMMONS[pid], "commons", 0
    if kind == "commons":
        return ref, "commons", 1          # 2nd hit of the new-market search
    return f"{ref} aircraft", "commons", 1


def fetch_used(pid, kind, ref):
    """Download img/<pid>-used.jpg if missing."""
    path = f"img/{pid}{USED_SUFFIX}.jpg"
    if os.path.exists(path):
        return f"{pid}{USED_SUFFIX}.jpg - {ref}", "HAVE"
    terms, src_kind, pick = used_terms(pid, kind, ref)
    time.sleep(2.5)
    thumb, credit = commons_thumb(terms, pick)
    if not thumb and pick:
        thumb, credit = commons_thumb(terms, 0)
    if not thumb:
        return None, f"SKIP {pid}{USED_SUFFIX}: no alternate image"
    with get(thumb) as r, open(path, "wb") as f:
        f.write(r.read())
    return f"{pid}{USED_SUFFIX}.jpg - from {credit}", "OK"


def main(force=None):
    force = set(force or [])
    os.makedirs("img", exist_ok=True)
    credits = []
    # Commons overrides Wikipedia when both exist (better photo control).
    sources = {**{k: ("article", v) for k, v in ARTICLES.items()},
               **{k: ("commons", v) for k, v in COMMONS.items()}}
    for pid, (kind, ref) in sources.items():
        try:
            path = f"img/{pid}.jpg"
            if os.path.exists(path) and pid not in force:
                credits.append(f"{pid}.jpg - {ref}")
                print(f"HAVE {pid}")
                continue
            if pid in force and os.path.exists(path):
                os.remove(path)
            time.sleep(2.5)   # be polite to the API
            thumb, credit = wikipedia_thumb(ref) if kind == "article" else commons_thumb(ref)
            if not thumb and kind == "article":
                thumb, credit = commons_thumb(ref)
            if not thumb:
                print(f"SKIP {pid} ({ref}): no image found")
                continue
            with get(thumb) as r, open(path, "wb") as f:
                f.write(r.read())
            credits.append(f"{pid}.jpg - from {credit}")
            print(f"OK   {pid} <- {ref}")
        except Exception as e:
            print(f"FAIL {pid}: {e}")
    # used-market alternates (separate photo per type)
    for pid, (kind, ref) in sources.items():
        try:
            used_path = f"img/{pid}{USED_SUFFIX}.jpg"
            if pid in force and os.path.exists(used_path):
                os.remove(used_path)
            credit, status = fetch_used(pid, kind, ref)
            if status == "HAVE":
                credits.append(credit)
                print(f"HAVE {pid}{USED_SUFFIX}")
            elif status == "OK":
                credits.append(credit)
                print(f"OK   {pid}{USED_SUFFIX}")
            elif credit:
                print(credit)
        except Exception as e:
            print(f"FAIL {pid}{USED_SUFFIX}: {e}")
    with open("img/CREDITS.txt", "w", encoding="utf-8") as f:
        f.write("Aircraft photos sourced from Wikipedia/Wikimedia Commons (freely licensed).\n"
                "Primary images (img/<id>.jpg) appear in the new-aircraft shop;\n"
                "alternates (img/<id>-used.jpg) appear on the used market.\n"
                "See each file page for author and license details:\n\n")
        f.write("\n".join(credits) + "\n")
    print("done.")


if __name__ == "__main__":
    import sys
    main(force=sys.argv[1:])
