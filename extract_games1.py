import re
import json
from pathlib import Path

src = Path("games1.json").read_text(encoding="utf-8", errors="ignore")

extracted = []

# 1) Strict-ish extraction from downloads array
m = re.search(r'"downloads"\s*:\s*\[', src, flags=re.IGNORECASE)
if m:
    start = src.find("[", m.end() - 1)
    if start != -1:
        depth = 0
        end = -1
        for i, ch in enumerate(src[start:], start):
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end != -1:
            arr_text = src[start:end + 1]
            arr_text = re.sub(r",\s*([}\]])", r"\1", arr_text)
            try:
                data = json.loads(arr_text)
                for g in data:
                    if not isinstance(g, dict):
                        continue
                    title = str(g.get("title", "")).strip()
                    size = str(g.get("fileSize", g.get("filesize", ""))).strip()
                    uris = g.get("uris", [])
                    uri = uris[0] if isinstance(uris, list) and uris else str(g.get("uri", "")).strip()
                    if title and size:
                        extracted.append({
                            "title": title,
                            "fileSize": size,
                            "uri": uri
                        })
            except Exception:
                pass

# 2) Tolerant regex extraction across entire file
# Supports:
# - "title" OR "name"
# - "fileSize" OR "filesize"
# - multi-line object fields with optional commas
obj_pattern = re.compile(
    r'\{(?P<body>.*?)\}',
    flags=re.DOTALL
)

title_patterns = [
    re.compile(r'"title"\s*:\s*"([^"]+)"', re.IGNORECASE | re.DOTALL),
    re.compile(r'"name"\s*:\s*"([^"]+)"', re.IGNORECASE | re.DOTALL),
]
size_patterns = [
    re.compile(r'"fileSize"\s*:\s*"([^"]+)"', re.IGNORECASE | re.DOTALL),
    re.compile(r'"filesize"\s*:\s*"([^"]+)"', re.IGNORECASE | re.DOTALL),
]
uris_pattern = re.compile(r'"uris"\s*:\s*\[(.*?)\]', re.IGNORECASE | re.DOTALL)
uri_item_pattern = re.compile(r'"([^"]+)"')

for mobj in obj_pattern.finditer(src):
    body = mobj.group("body")

    title = ""
    for tp in title_patterns:
        mt = tp.search(body)
        if mt:
            title = mt.group(1).strip()
            break
    if not title:
        continue

    size = ""
    for sp in size_patterns:
        ms = sp.search(body)
        if ms:
            size = ms.group(1).strip()
            break
    if not size:
        continue

    uri = ""
    mu = uris_pattern.search(body)
    if mu:
        content = mu.group(1)
        mi = uri_item_pattern.search(content)
        if mi:
            uri = mi.group(1).strip()

    extracted.append({
        "title": title,
        "fileSize": size,
        "uri": uri
    })

# 3) Deduplicate
seen = set()
out = []
for g in extracted:
    key = (g["title"], g["fileSize"], g["uri"])
    if key in seen:
        continue
    seen.add(key)
    out.append(g)

Path("games1_clean.json").write_text(
    json.dumps(out, ensure_ascii=False),
    encoding="utf-8"
)

titles_text = "\n".join(x["title"].lower() for x in out)
print(f"Extracted {len(out)} games to games1_clean.json")
print("contains_gta:", ("gta" in titles_text) or ("grand theft auto" in titles_text))
print("contains_red_dead:", "red dead" in titles_text)
