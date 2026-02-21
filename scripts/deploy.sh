#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Agent Stack — One-command deployment
# Creates GitHub repo → deploys backend to Railway → frontend to Vercel
# Then cross-links the URLs so they can talk to each other.
# ============================================================

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# --- Defaults ---
REPO_NAME="${1:-$(basename "$(pwd)")}"
VISIBILITY="--public"
RAILWAY_BACKEND_URL=""
VERCEL_FRONTEND_URL=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Prerequisites ---
check_prereqs() {
    log "Checking prerequisites..."
    local missing=()

    command -v git     >/dev/null 2>&1 || missing+=("git")
    command -v gh      >/dev/null 2>&1 || missing+=("gh (GitHub CLI) — https://cli.github.com")
    command -v vercel  >/dev/null 2>&1 || missing+=("vercel — npm i -g vercel")
    command -v railway >/dev/null 2>&1 || missing+=("railway — npm i -g @railway/cli")

    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing tools:\n$(printf '  - %s\n' "${missing[@]}")"
    fi

    # Check auth
    gh auth status    >/dev/null 2>&1 || err "Not logged into GitHub. Run: gh auth login"
    vercel whoami     >/dev/null 2>&1 || err "Not logged into Vercel. Run: vercel login"
    railway whoami    >/dev/null 2>&1 || err "Not logged into Railway. Run: railway login"

    # Check for API key
    if [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
        if [ -f "$PROJECT_ROOT/backend/.env.example" ]; then
            warn "No backend/.env found. Creating from .env.example..."
            cp "$PROJECT_ROOT/backend/.env.example" "$PROJECT_ROOT/backend/.env"
            warn "Edit backend/.env and add your ANTHROPIC_API_KEY before continuing."
            read -p "Press Enter when ready (or Ctrl+C to abort)..."
        fi
    fi

    log "Prerequisites OK"
}

# --- Step 1: GitHub ---
setup_github() {
    log "Step 1/4: GitHub repository"

    cd "$PROJECT_ROOT"

    # Ensure we have a git repo with commits
    if [ ! -d .git ]; then
        git init
        git add -A
        git commit -m "Initial commit"
    fi

    # Create or use existing remote
    if git remote get-url origin >/dev/null 2>&1; then
        info "Remote 'origin' already exists"
        git push -u origin "$(git branch --show-current)" 2>/dev/null || true
    else
        log "Creating GitHub repo: $REPO_NAME"
        gh repo create "$REPO_NAME" $VISIBILITY --source=. --remote=origin --push
    fi

    GITHUB_URL=$(gh repo view --json url -q '.url' 2>/dev/null || echo "")
    log "GitHub: $GITHUB_URL"
}

# --- Step 2: Railway (backend) ---
setup_railway() {
    log "Step 2/4: Railway backend"

    cd "$PROJECT_ROOT"

    # Railway init is interactive — guide the user
    if ! railway status >/dev/null 2>&1; then
        info "Creating Railway project..."
        info "When prompted:"
        info "  - Project name: ${REPO_NAME}-backend"
        info "  - Select 'Empty Project'"
        railway init
    fi

    # Read ANTHROPIC_API_KEY from backend/.env
    local api_key=""
    if [ -f "$PROJECT_ROOT/backend/.env" ]; then
        api_key=$(grep -E "^ANTHROPIC_API_KEY=" "$PROJECT_ROOT/backend/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    fi

    # Set env vars
    log "Setting Railway environment variables..."
    railway variables set STORAGE_BACKEND=memory 2>/dev/null || true

    if [ -n "$api_key" ]; then
        railway variables set "ANTHROPIC_API_KEY=$api_key" 2>/dev/null || true
        log "ANTHROPIC_API_KEY set from backend/.env"
    else
        warn "No ANTHROPIC_API_KEY found. Set it manually: railway variables set ANTHROPIC_API_KEY=sk-ant-..."
    fi

    # Deploy
    log "Deploying backend to Railway..."
    info "NOTE: Set Root Directory to 'backend' in Railway dashboard if not auto-detected"
    railway up --detach 2>/dev/null || railway up -d 2>/dev/null || warn "Deploy command failed — you may need to deploy from Railway dashboard"

    # Try to get the URL
    info "Fetching Railway service URL..."
    RAILWAY_BACKEND_URL=$(railway domain 2>/dev/null || echo "")

    if [ -z "$RAILWAY_BACKEND_URL" ]; then
        warn "Could not auto-detect Railway URL."
        echo ""
        read -p "Enter your Railway backend URL (e.g., https://my-app.up.railway.app): " RAILWAY_BACKEND_URL
    fi

    # Ensure https prefix
    if [[ -n "$RAILWAY_BACKEND_URL" && ! "$RAILWAY_BACKEND_URL" =~ ^https?:// ]]; then
        RAILWAY_BACKEND_URL="https://$RAILWAY_BACKEND_URL"
    fi

    log "Railway backend: $RAILWAY_BACKEND_URL"
}

# --- Step 3: Vercel (frontend) ---
setup_vercel() {
    log "Step 3/4: Vercel frontend"

    cd "$PROJECT_ROOT"

    # Link project
    log "Linking Vercel project..."
    vercel link --yes 2>/dev/null || vercel link

    # Set env vars
    log "Setting Vercel environment variables..."
    if [ -n "$RAILWAY_BACKEND_URL" ]; then
        echo "$RAILWAY_BACKEND_URL" | vercel env add NEXT_PUBLIC_API_URL production --force 2>/dev/null || \
        echo "$RAILWAY_BACKEND_URL" | vercel env add NEXT_PUBLIC_API_URL production 2>/dev/null || true

        echo "$RAILWAY_BACKEND_URL" | vercel env add NEXT_PUBLIC_API_URL preview --force 2>/dev/null || \
        echo "$RAILWAY_BACKEND_URL" | vercel env add NEXT_PUBLIC_API_URL preview 2>/dev/null || true
        log "NEXT_PUBLIC_API_URL=$RAILWAY_BACKEND_URL"
    fi

    # Deploy
    log "Deploying frontend to Vercel..."
    info "NOTE: Set Root Directory to 'frontend' in Vercel Dashboard > Settings > General"
    VERCEL_FRONTEND_URL=$(vercel --prod --yes 2>/dev/null || echo "")

    if [ -z "$VERCEL_FRONTEND_URL" ]; then
        warn "Could not get Vercel URL from CLI output."
        read -p "Enter your Vercel frontend URL (e.g., https://my-app.vercel.app): " VERCEL_FRONTEND_URL
    fi

    log "Vercel frontend: $VERCEL_FRONTEND_URL"
}

# --- Step 4: Cross-link ---
crosslink() {
    log "Step 4/4: Cross-linking frontend ↔ backend"

    if [ -n "$VERCEL_FRONTEND_URL" ]; then
        railway variables set "FRONTEND_URL=$VERCEL_FRONTEND_URL" 2>/dev/null || \
            warn "Could not set FRONTEND_URL on Railway. Set manually: railway variables set FRONTEND_URL=$VERCEL_FRONTEND_URL"
        log "Railway FRONTEND_URL=$VERCEL_FRONTEND_URL (for CORS)"
    fi

    # Redeploy Vercel to pick up env vars (build-time NEXT_PUBLIC_*)
    if [ -n "$RAILWAY_BACKEND_URL" ]; then
        log "Redeploying Vercel to bake in NEXT_PUBLIC_API_URL..."
        vercel --prod --yes >/dev/null 2>&1 || warn "Vercel redeploy failed — trigger manually from dashboard"
    fi

    log "Cross-linking complete"
}

# --- Summary ---
print_summary() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          Deployment Complete!                ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Frontend (Vercel):  ${CYAN}${VERCEL_FRONTEND_URL:-'check dashboard'}${NC}"
    echo -e "  Backend  (Railway): ${CYAN}${RAILWAY_BACKEND_URL:-'check dashboard'}${NC}"
    echo -e "  GitHub:             ${CYAN}${GITHUB_URL:-'check dashboard'}${NC}"
    echo ""
    echo -e "  ${YELLOW}Manual steps (if needed):${NC}"
    echo -e "  1. Vercel: Set Root Directory to '${CYAN}frontend${NC}' in Settings > General"
    echo -e "  2. Railway: Set Root Directory to '${CYAN}backend${NC}' in Service Settings"
    echo -e "  3. Both platforms auto-deploy on ${CYAN}git push${NC}"
    echo ""
    echo -e "  ${GREEN}Test it:${NC}"
    echo -e "  curl ${RAILWAY_BACKEND_URL:-'<backend-url>'}/api/agents"
    echo -e "  open ${VERCEL_FRONTEND_URL:-'<frontend-url>'}"
    echo ""
}

# --- Main ---
main() {
    echo ""
    echo -e "${CYAN}  Agent Stack — Deploy Script${NC}"
    echo -e "${CYAN}  ───────────────────────────${NC}"
    echo ""

    check_prereqs
    setup_github
    setup_railway
    setup_vercel
    crosslink
    print_summary
}

main "$@"
