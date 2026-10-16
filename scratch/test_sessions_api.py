import urllib.request
import urllib.error

def test(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            print(f"GET {url} -> {r.status} {r.read()[:200]}")
    except urllib.error.HTTPError as e:
        print(f"GET {url} -> {e.code} {e.read()[:200]}")
    except Exception as e:
        print(f"GET {url} -> {e}")

test("https://topgameai.com/api/arena/sessions")
test("https://topgameai.com/api/arena/sessions/active")
test("https://topgameai.com/api/arena/sessions?game=snake")
test("https://topgameai.com/api/arena/leaderboard/snake")
