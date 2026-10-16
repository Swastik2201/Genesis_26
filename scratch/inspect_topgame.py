import urllib.request
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

url = 'https://topgameai.com/_next/static/chunks/25ff87edaeca8f72.js'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
content = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
idx = content.find('/api/arena/sessions')
print(content[idx-100:idx+1500])
