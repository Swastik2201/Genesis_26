import urllib.request
import sys
sys.stdout.reconfigure(encoding='utf-8')

url = "https://topgameai.com/_next/static/chunks/25ff87edaeca8f72.js"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
content = urllib.request.urlopen(req).read().decode('utf-8')

pos = content.find('function y(')
print(content[pos-600:pos])
