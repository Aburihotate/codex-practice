#!/usr/bin/env python3
"""Rebuild the embedded brush-font subset after ANY kanji/text change.

The Yuji Syuku subset only contains characters present in index.html at
build time — adding a kanji to the tables (or new Japanese UI text)
without re-running this script makes that character silently fall back
to a system serif font.

Requires: pip install fonttools brotli, and YujiSyuku-Regular.ttf
(download: https://github.com/google/fonts/tree/main/ofl/yujisyuku)

Usage: python3 scripts/rebuild-font-subset.py path/to/YujiSyuku-Regular.ttf
"""
import base64, re, subprocess, sys, tempfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src_font = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not src_font or not src_font.exists():
    sys.exit("usage: rebuild-font-subset.py <YujiSyuku-Regular.ttf>")

html_path = root / "index.html"
html = html_path.read_text(encoding="utf8")

chars = {c for c in html if 0x2E80 <= ord(c) < 0x1F000}          # CJK, no emoji
for lo, hi in [(0x3041, 0x3096), (0x30A0, 0x30FF), (0x3000, 0x3003)]:
    chars |= {chr(c) for c in range(lo, hi + 1)}                  # full kana
chars |= {chr(c) for c in range(0x20, 0x7F)}                      # ASCII

with tempfile.TemporaryDirectory() as td:
    uni = Path(td) / "u.txt"
    out = Path(td) / "sub.woff2"
    uni.write_text(",".join(f"U+{ord(c):04X}" for c in sorted(chars)))
    subprocess.run(["pyftsubset", str(src_font), f"--unicodes-file={uni}",
                    "--flavor=woff2", f"--output-file={out}",
                    "--layout-features=*"], check=True)
    woff = out.read_bytes()

b64 = base64.b64encode(woff).decode()
html2, n = re.subn(r"url\(data:font/woff2;base64,[A-Za-z0-9+/=]+\)",
                   f"url(data:font/woff2;base64,{b64})", html, count=1)
assert n == 1, "embedded @font-face not found in index.html"
html_path.write_text(html2, encoding="utf8")
(root / "fonts" / "yuji-subset.woff2").write_bytes(woff)

# verify: every needed char must be in the new subset
from fontTools.ttLib import TTFont
cps = set()
for t in TTFont(str(root / "fonts" / "yuji-subset.woff2"))["cmap"].tables:
    cps |= set(t.cmap.keys())
missing = sorted({c for c in html2 if 0x2E80 <= ord(c) < 0x1F000 and ord(c) not in cps})
if missing:
    sys.exit(f"MISSING FROM SOURCE FONT (pick different kanji): {''.join(missing)}")
print(f"ok: {len(chars)} chars, {len(woff)} bytes, embedded + fonts/yuji-subset.woff2 updated")
