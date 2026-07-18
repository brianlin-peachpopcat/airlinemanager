"""Download a photo for selected airports into airportpictures/<CODE>.jpg.
Uses Wikipedia lead images (Wikimedia-hosted). Run from project root."""
import json, os, time, urllib.parse, urllib.request

AIRPORTS = {
    "YVR": "Vancouver International Airport",
    "HND": "Haneda Airport",
    "DEL": "Indira Gandhi International Airport",
    "LHR": "Heathrow Airport",
    "SYD": "Sydney Airport",
    "IST": "Istanbul Airport",
    "FRA": "Frankfurt Airport",
    "BOB": "Bora Bora Airport",
    "NBO": "Jomo Kenyatta International Airport",
}
UA = {"User-Agent": "SkyTycoonGame/1.0 (local hobby game; one-time asset fetch)"}
API = ("https://en.wikipedia.org/w/api.php?action=query&titles={t}"
       "&prop=pageimages&piprop=thumbnail&pithumbsize=640&format=json&redirects=1")

def get(url, tries=4):
    for a in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30)
        except urllib.error.HTTPError as e:
            if e.code == 429 and a < tries - 1:
                time.sleep(8 * (a + 1)); continue
            raise

def main():
    os.makedirs("airportpictures", exist_ok=True)
    for code, title in AIRPORTS.items():
        try:
            if os.path.exists(f"airportpictures/{code}.jpg"):
                print("HAVE", code); continue
            time.sleep(2.5)
            meta = json.load(get(API.format(t=urllib.parse.quote(title))))
            page = next(iter(meta["query"]["pages"].values()))
            thumb = page.get("thumbnail", {}).get("source")
            if not thumb:
                print("SKIP", code, title); continue
            with get(thumb) as r, open(f"airportpictures/{code}.jpg", "wb") as f:
                f.write(r.read())
            print("OK  ", code, "<-", title)
        except Exception as e:
            print("FAIL", code, e)
    print("done.")

if __name__ == "__main__":
    main()
