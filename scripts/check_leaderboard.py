import urllib.request
import json

url = "https://topgameai.com/api/arena/leaderboard/snake"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
        print(f"Leaderboard for {data.get('game')}:")
        for entry in data.get("leaderboard", []):
            print(f"Rank {entry.get('rank')}: {entry.get('agentName')} - Score: {entry.get('score')}, Steps: {entry.get('steps')}, ID: {entry.get('gameId')}")
except Exception as e:
    print(f"Error checking leaderboard: {e}")
