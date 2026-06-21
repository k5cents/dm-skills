#!/usr/bin/env bash
# dm-skills/scripts/setup.sh
#
# First-run setup: clone 5etools repos, build SQLite databases, export core
# sourcebooks as markdown. Safe to re-run — skips steps already completed.
#
# Usage:
#   bash scripts/setup.sh                    # default: XPHB + XDMG + XMM
#   bash scripts/setup.sh --books "XPHB XMM ERLW EFA ExploringEberron24"
#   bash scripts/setup.sh --no-clone         # skip repo cloning (repos already exist)
#   bash scripts/setup.sh --force            # rebuild even if artifacts exist
#
# Environment overrides (set before running if repos live elsewhere):
#   FIVETOOLS_SRC=~/somewhere/5etools-src
#   FIVETOOLS_HOMEBREW=~/somewhere/5etools-homebrew

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; NC=''
fi

info()    { echo -e "${BLUE}▶${NC} $*"; }
ok()      { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SIBLING_DIR="$(dirname "$REPO_ROOT")"

FIVETOOLS_SRC="${FIVETOOLS_SRC:-$SIBLING_DIR/5etools-src}"
FIVETOOLS_HOMEBREW="${FIVETOOLS_HOMEBREW:-$SIBLING_DIR/5etools-homebrew}"

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_BOOKS="XPHB XDMG XMM"
BOOKS="$DEFAULT_BOOKS"
SKIP_CLONE=false
FORCE=false

# ── Argument parsing ──────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --no-clone)    SKIP_CLONE=true ;;
    --force)       FORCE=true ;;
    --books=*)     BOOKS="${arg#--books=}" ;;
    --help|-h)
      echo "Usage: bash scripts/setup.sh [--no-clone] [--force] [--books=\"XPHB XDMG ...\"]"
      echo ""
      echo "Known book IDs: XPHB XDMG XMM PHB DMG TCE XGE XSAC"
      echo "                ERLW EFA ExploringEberron24 FoEQuickstone"
      exit 0 ;;
    *) die "Unknown argument: $arg. Run with --help for usage." ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}dm-skills setup${NC}"
echo "Repo:       $REPO_ROOT"
echo "5etools:    $FIVETOOLS_SRC"
echo "Homebrew:   $FIVETOOLS_HOMEBREW"
echo "Books:      $BOOKS"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
header "Checking prerequisites..."

check_cmd() {
  local cmd="$1" label="${2:-$1}"
  if ! command -v "$cmd" &>/dev/null; then
    die "$label not found. Install it and re-run."
  fi
}

check_cmd git
check_cmd python3
check_cmd sqlite3

# Node.js 24+
check_cmd node "Node.js"
NODE_VERSION="$(node --version | sed 's/v//' | cut -d. -f1)"
if [ "$NODE_VERSION" -lt 24 ]; then
  die "Node.js 24+ required (found v$NODE_VERSION). Update at https://nodejs.org"
fi

# Python 3.10+
PYTHON_VERSION="$(python3 --version 2>&1 | sed 's/Python //' | cut -d. -f2)"
if [ "$PYTHON_VERSION" -lt 10 ]; then
  warn "Python 3.10+ recommended (found $(python3 --version 2>&1)). Proceeding anyway."
fi

ok "All prerequisites met (Node $(node --version), $(python3 --version), git $(git --version | cut -d' ' -f3))"

# ── Clone external repos ──────────────────────────────────────────────────────
if [ "$SKIP_CLONE" = true ]; then
  warn "Skipping repo clone (--no-clone)"
else
  header "Cloning external repos..."

  clone_or_pull() {
    local url="$1" dest="$2" label="$3"
    if [ -d "$dest/.git" ]; then
      if [ "$FORCE" = true ]; then
        info "Pulling latest $label..."
        git -C "$dest" pull --ff-only
        ok "Updated $label"
      else
        ok "$label already exists at $dest — skipping (use --force to pull updates)"
      fi
    else
      info "Cloning $label (shallow)..."
      git clone --depth=1 "$url" "$dest"
      ok "Cloned $label → $dest"
    fi
  }

  clone_or_pull \
    "https://github.com/5etools-mirror-3/5etools-src.git" \
    "$FIVETOOLS_SRC" \
    "5etools-src"

  clone_or_pull \
    "https://github.com/TheGiddyLimit/homebrew.git" \
    "$FIVETOOLS_HOMEBREW" \
    "5etools-homebrew"
fi

# Verify repos are present
[ -d "$FIVETOOLS_SRC/data" ]      || die "5etools-src not found at $FIVETOOLS_SRC"
[ -d "$FIVETOOLS_HOMEBREW/collection" ] || die "5etools-homebrew not found at $FIVETOOLS_HOMEBREW"

# ── Build databases ───────────────────────────────────────────────────────────
header "Building databases..."

export FIVETOOLS_SRC FIVETOOLS_HOMEBREW

build_db() {
  local script="$1" db="$2" label="$3"
  if [ -f "$REPO_ROOT/databases/$db" ] && [ "$FORCE" = false ]; then
    ok "$db already exists — skipping (use --force to rebuild)"
  else
    info "Building $label..."
    python3 "$REPO_ROOT/scripts/$script"
    ok "Built $db"
  fi
}

build_db "build-spells.py" "spells.db" "spells database"
build_db "build-items.py"  "items.db"  "items database"

if [ ! -f "$REPO_ROOT/databases/monsters.db" ]; then
  warn "monsters.db not found — it is not built by this script."
  warn "See databases/monsters-README.md for rebuild instructions."
fi

# ── Export sourcebooks ────────────────────────────────────────────────────────
header "Exporting sourcebooks..."

for book in $BOOKS; do
  # Derive expected output dir slug (lowercase book ID)
  slug="$(echo "$book" | tr '[:upper:]' '[:lower:]')"
  out_dir="$REPO_ROOT/sourcebooks/$slug"

  if [ -d "$out_dir" ] && [ "$FORCE" = false ]; then
    ok "$slug/ already exists — skipping (use --force to re-export)"
  else
    info "Exporting $book..."
    node "$REPO_ROOT/scripts/export-book.mjs" "$book" 2>&1 \
      | grep -E '^\s+\[(write|skip|error)\]|Done —' \
      | sed 's/^/  /'
    ok "Exported $book → sourcebooks/$slug/"
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
header "Setup complete!"
echo ""
echo "Add these lines to your shell profile (~/.zshrc or ~/.bashrc):"
echo ""
echo -e "  ${GREEN}export DM_SKILLS_DIR=\"$REPO_ROOT\"${NC}"
if [ "$FIVETOOLS_SRC" != "$SIBLING_DIR/5etools-src" ]; then
  echo -e "  ${GREEN}export FIVETOOLS_SRC=\"$FIVETOOLS_SRC\"${NC}"
fi
if [ "$FIVETOOLS_HOMEBREW" != "$SIBLING_DIR/5etools-homebrew" ]; then
  echo -e "  ${GREEN}export FIVETOOLS_HOMEBREW=\"$FIVETOOLS_HOMEBREW\"${NC}"
fi
echo ""
echo "Then reload your shell:  source ~/.zshrc"
echo ""
echo "To export additional sourcebooks:"
echo "  node scripts/export-book.mjs ERLW"
echo "  node scripts/export-book.mjs EFA"
echo "  node scripts/export-book.mjs ExploringEberron24"
echo ""
echo "Smoke test:"
echo "  sqlite3 databases/spells.db \"SELECT name, level, school FROM spells WHERE name='Fireball' AND source='XPHB';\""
echo ""
