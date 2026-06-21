#!/usr/bin/env python3
"""
fetch-wiki.py — Fetch Eberron fandom wiki articles via the MediaWiki API
and write clean markdown to sourcebooks/eberron-wiki/<slug>.md

Content is CC BY-SA 3.0 (eberron.fandom.com). Personal/non-commercial use only.

Usage:
  python3 scripts/fetch-wiki.py Kurmaac Darguun "Gathering Stone"
  python3 scripts/fetch-wiki.py --search "druid clan darguun"
  python3 scripts/fetch-wiki.py --category "Organizations in Darguun"
  python3 scripts/fetch-wiki.py --list topics.txt
  python3 scripts/fetch-wiki.py Kurmaac --print    # also print to stdout
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://eberron.fandom.com/api.php"
WIKI_CREDIT = "Eberron wiki (eberron.fandom.com) — CC BY-SA 3.0"

# ── Infobox handling ──────────────────────────────────────────────────────────

def _find_template_end(text: str, start: int) -> int:
    """Return index after the closing }} of the template starting at `start`."""
    depth = 0
    i = start
    while i < len(text) - 1:
        if text[i : i + 2] == "{{":
            depth += 1
            i += 2
        elif text[i : i + 2] == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return i
        else:
            i += 1
    return len(text)


def extract_infobox(text: str) -> tuple[str, str]:
    """Pull the first {{Template}} block out of wikitext, returning (header_md, rest)."""
    start = text.find("{{")
    if start == -1:
        return "", text

    end = _find_template_end(text, start)
    block = text[start + 2 : end - 2]
    rest = text[:start] + text[end:].lstrip("\n")

    lines = block.split("\n")
    template_name = lines[0].split("|")[0].strip()

    # Don't turn citation/maintenance templates into headers
    noise = {"refs", "incomplete", "stub", "cite", "cleanup", "spoiler"}
    if any(template_name.lower().startswith(n) for n in noise):
        return "", rest

    pairs: dict[str, str] = {}
    for line in lines[1:]:
        line = line.lstrip("|").strip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip()
        # Strip nested templates, refs, wikilinks, and italic/bold markup
        v = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/?>", "", v, flags=re.DOTALL)
        v = re.sub(r"<br\s*/?>", ", ", v, flags=re.IGNORECASE)  # br → comma separator
        v = re.sub(r"<[^>]+>", "", v)  # other HTML tags
        v = re.sub(r"\{\{[^{}]*\}\}", "", v)  # one level of nested templates
        v = re.sub(r"\[\[Category:[^\]]+\]\]", "", v, flags=re.IGNORECASE)
        v = re.sub(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]", r"\1", v)
        v = re.sub(r"'{2,3}", "", v)  # strip '' and ''' markup
        v = v.strip()
        if k and v and k not in {"image", "caption", "showmembers", "orgname",
                                  "memberstable", "memtableheader", "poptable",
                                  "rulertable", "usethe", "useon",
                                  "inhabitants", "locations", "organizations",
                                  "settlements", "roads", "mountains",
                                  "bodies of water", "forests", "events",
                                  "food and drink", "items"}:
            pairs[k] = v

    if not pairs:
        return "", rest

    lines_out = [f"> **{template_name}**"]
    for k, v in pairs.items():
        lines_out.append(f"> - **{k}:** {v}")
    return "\n".join(lines_out) + "\n\n", rest


# ── Wikitext pre-processing ───────────────────────────────────────────────────

def _strip_templates(text: str) -> str:
    """Depth-aware removal of {{...}} blocks from text."""
    result = []
    i = 0
    while i < len(text):
        if text[i : i + 2] == "{{":
            end = _find_template_end(text, i)
            i = end
        else:
            result.append(text[i])
            i += 1
    return "".join(result)


def clean_wikitext(text: str) -> str:
    """Pre-process wikitext so pandoc produces clean markdown."""
    # HTML comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    # Citation refs
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.DOTALL)
    text = re.sub(r"<ref[^>]*/?>", "", text)
    # HTML tags (small, span, div, br, etc.)
    text = re.sub(r"<[^>]+>", "", text)
    # Category links — must come before general wikilink stripping
    text = re.sub(r"\[\[Category:[^\]]+\]\]\n?", "", text, flags=re.IGNORECASE)
    # File/image links
    text = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", text, flags=re.IGNORECASE)
    # Leave [[wikilinks]] for pandoc to convert — handled in postprocess_markdown
    # Strip remaining {{...}} templates (refs, incomplete, cite, etc.)
    text = _strip_templates(text)
    # External links: [url text] → text
    text = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", text)
    text = re.sub(r"\[https?://\S+\]", "", text)
    return text.strip()


# ── Pandoc conversion ─────────────────────────────────────────────────────────

def wikitext_to_markdown(wikitext: str, title: str) -> str:
    result = subprocess.run(
        ["pandoc", "--from", "mediawiki", "--to", "markdown", "--wrap=none"],
        input=wikitext,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  [WARNING] pandoc error for '{title}': {result.stderr.strip()}",
              file=sys.stderr)
    return result.stdout


def postprocess_markdown(text: str) -> str:
    # Raw mediawiki code blocks (leftover templates pandoc couldn't handle)
    text = re.sub(r"```\{=mediawiki\}.*?```\n?", "", text, flags=re.DOTALL)
    # Compact wikilinks: [Display](Target "Title"){.wikilink}
    # → [Display] when display matches target (same article)
    # → [Display](Target) when they differ (alias → article name)
    def _compact_wikilink(m: re.Match) -> str:
        display = m.group(1)
        target = m.group(2).replace("_", " ")
        if display.lower() == target.lower():
            return f"[{display}]"
        return f"[{display}]({target})"
    text = re.sub(
        r"\[([^\]]+)\]\(([^) \"]+)(?:\s+\"[^\"]*\")?\)\{\.wikilink\}",
        _compact_wikilink,
        text,
    )
    # Footnote refs in prose [^N]
    text = re.sub(r"\[\^\d+\]", "", text)
    # Footnote definition lines [^N]: ...
    text = re.sub(r"^\[\^\d+\]:.*\n?", "", text, flags=re.MULTILINE)
    # Inline HTML artifacts (e.g. `<small>`{=html})
    text = re.sub(r"`<[^`]+>`\{=html\}", "", text)
    # Heading ID anchors: ## Rumors & Legends {#rumors_legends} → ## Rumors & Legends
    text = re.sub(r"(\#{1,4} [^\n{]+)\s*\{#[^}]+\}", r"\1", text)
    # Stray "Category:Foo Category:Bar" lines (categories that slipped through)
    text = re.sub(r"^(Category:\S+\s*)+$", "", text, flags=re.MULTILINE)
    # Drop the Appendix section and everything after (boilerplate)
    text = re.sub(r"\n## Appendix\b.*", "", text, flags=re.DOTALL)
    # Drop known boilerplate-only subsections regardless of position
    _BOILERPLATE = r"(?:References|Appearances|Connections|Further Reading)"
    text = re.sub(
        rf"\n### {_BOILERPLATE}\n(?:(?!\n###|\n##|\n#)[^\n]*\n)*",
        "\n",
        text,
    )
    # Multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ── API helpers ───────────────────────────────────────────────────────────────

def _api_get(params: dict) -> dict:
    params["format"] = "json"
    url = API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "dm-skills/1.0 (fetch-wiki.py; personal DM tool)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_pages(titles: list[str]) -> dict[str, str]:
    """Return {title: wikitext} for all found articles (batched 50 at a time)."""
    results: dict[str, str] = {}
    for i in range(0, len(titles), 50):
        batch = titles[i : i + 50]
        data = _api_get({
            "action": "query",
            "titles": "|".join(batch),
            "prop": "revisions",
            "rvprop": "content",
        })
        for page in data["query"]["pages"].values():
            if "revisions" in page:
                results[page["title"]] = page["revisions"][0]["*"]
    return results


def search_wiki(query: str, limit: int = 5) -> list[str]:
    """Return article titles matching a search query."""
    data = _api_get({
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srlimit": str(limit),
    })
    return [r["title"] for r in data["query"].get("search", [])]


def get_category_members(category: str) -> list[str]:
    """List all article titles in a wiki category (paginated)."""
    titles: list[str] = []
    params: dict = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": f"Category:{category}",
        "cmlimit": "500",
        "cmtype": "page",
    }
    while True:
        data = _api_get(params)
        titles.extend(m["title"] for m in data["query"]["categorymembers"])
        if "continue" not in data:
            break
        params["cmcontinue"] = data["continue"]["cmcontinue"]
    return titles


# ── Output ────────────────────────────────────────────────────────────────────

def title_to_slug(title: str) -> str:
    slug = title.lower()
    slug = re.sub(r"[^\w\s'-]", "", slug)
    slug = re.sub(r"[\s']+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def process_article(title: str, wikitext: str) -> str:
    """Convert one wiki article to clean markdown. Returns the markdown string."""
    infobox_md, body = extract_infobox(wikitext)
    body = clean_wikitext(body)
    md = wikitext_to_markdown(body, title)
    md = postprocess_markdown(md)

    parts = [f"# {title}", "", f"> *Source: {WIKI_CREDIT}*", ""]
    if infobox_md:
        parts += [infobox_md.rstrip(), ""]
    parts.append(md)
    return "\n".join(parts) + "\n"


def find_out_dir() -> Path:
    dm_skills = os.environ.get("DM_SKILLS_DIR")
    if dm_skills:
        d = Path(dm_skills) / "sourcebooks" / "eberron-wiki"
    else:
        d = Path(__file__).parent.parent / "sourcebooks" / "eberron-wiki"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Eberron wiki articles and save as local markdown."
    )
    parser.add_argument("titles", nargs="*", help="Article title(s) to fetch")
    parser.add_argument("--search", "-s", metavar="QUERY",
                        help="Search wiki and fetch the top match")
    parser.add_argument("--search-limit", type=int, default=1,
                        help="How many search results to fetch (default: 1)")
    parser.add_argument("--category", "-c", metavar="CATEGORY",
                        help="Fetch all articles in a wiki category")
    parser.add_argument("--list", "-l", metavar="FILE",
                        help="Text file with one title per line")
    parser.add_argument("--out", "-o", metavar="DIR",
                        help="Output directory (default: sourcebooks/eberron-wiki/)")
    parser.add_argument("--print", dest="print_stdout", action="store_true",
                        help="Print markdown to stdout (saves file too unless --no-save)")
    parser.add_argument("--no-save", action="store_true",
                        help="Do not write files (use with --print for pure stdout mode)")
    args = parser.parse_args()

    titles: list[str] = list(args.titles)

    if args.search:
        found = search_wiki(args.search, args.search_limit)
        if not found:
            print(f"No results for: {args.search}", file=sys.stderr)
            sys.exit(1)
        print(f"Search '{args.search}' → {found}", file=sys.stderr)
        titles.extend(found)

    if args.category:
        members = get_category_members(args.category)
        print(f"Category '{args.category}': {len(members)} articles", file=sys.stderr)
        titles.extend(members)

    if args.list:
        with open(args.list) as f:
            titles.extend(line.strip() for line in f if line.strip())

    if not titles:
        parser.error("Provide at least one title, --search, --category, or --list")

    out_dir = Path(args.out) if args.out else find_out_dir()
    if not args.no_save:
        out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {len(titles)} article(s)…", file=sys.stderr)
    pages = fetch_pages(titles)

    fetched_titles = {p["title"] for p in []}  # placeholder
    for title, wikitext in pages.items():
        md = process_article(title, wikitext)
        if args.print_stdout:
            print(md)
        if not args.no_save:
            slug = title_to_slug(title)
            out_path = out_dir / f"{slug}.md"
            out_path.write_text(md, encoding="utf-8")
            print(f"  [saved] {out_path}", file=sys.stderr)

    # Report any titles the API couldn't resolve
    found_titles = set(pages.keys())
    for t in titles:
        if t not in found_titles:
            print(f"  [not found] {t}", file=sys.stderr)


if __name__ == "__main__":
    main()
