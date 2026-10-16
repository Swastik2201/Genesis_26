"""Launches Chrome or Edge with the BeatTheBot extension preloaded to https://topgameai.com/arena/snake"""

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_DIR = REPO_ROOT / "extension"
TARGET_URL = "https://topgameai.com/arena/snake"

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

browser_exe = None
for p in CANDIDATES:
    if os.path.exists(p):
        browser_exe = p
        break

if not browser_exe:
    print("[Error] No Chrome or Edge executable found.", file=sys.stderr)
    sys.exit(1)

print(f"[*] Found browser: {browser_exe}")
print(f"[*] Extension directory: {EXTENSION_DIR}")
print(f"[*] Target URL: {TARGET_URL}")

cmd = [
    browser_exe,
    f"--load-extension={EXTENSION_DIR}",
    TARGET_URL,
]

print(f"[*] Launching: {' '.join(cmd)}")
subprocess.Popen(cmd)
print("[✓] Browser launched with extension active!")
