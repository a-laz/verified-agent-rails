#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Agent Stack — Local development setup
# Installs deps, creates .env files, and starts both servers.
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Check tools ---
check_tools() {
    log "Checking tools..."
    command -v node   >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org"
    command -v npm    >/dev/null 2>&1 || err "npm not found"
    command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 || err "Python not found"
    command -v pip    >/dev/null 2>&1 || command -v pip3 >/dev/null 2>&1 || err "pip not found"
    log "Tools OK (node $(node -v), python $(python --version 2>&1 | awk '{print $2}'))"
}

# --- Create .env files ---
setup_env() {
    log "Setting up environment files..."

    # Backend .env
    if [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
        cp "$PROJECT_ROOT/backend/.env.example" "$PROJECT_ROOT/backend/.env"
        log "Created backend/.env from template"

        # Prompt for API key
        echo ""
        read -p "  Enter your Anthropic API key (sk-ant-...): " api_key
        if [ -n "$api_key" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|your-anthropic-api-key-here|$api_key|" "$PROJECT_ROOT/backend/.env"
            else
                sed -i "s|your-anthropic-api-key-here|$api_key|" "$PROJECT_ROOT/backend/.env"
            fi
            log "API key saved to backend/.env"
        else
            warn "No API key entered. Edit backend/.env manually before running."
        fi
    else
        log "backend/.env already exists"
    fi

    # Frontend .env.local
    if [ ! -f "$PROJECT_ROOT/frontend/.env.local" ]; then
        cp "$PROJECT_ROOT/frontend/.env.example" "$PROJECT_ROOT/frontend/.env.local"
        log "Created frontend/.env.local from template"
    else
        log "frontend/.env.local already exists"
    fi
}

# --- Install dependencies ---
install_deps() {
    log "Installing frontend + package dependencies..."
    cd "$PROJECT_ROOT"
    npm install

    log "Installing backend dependencies..."
    cd "$PROJECT_ROOT/backend"

    # Use venv if it doesn't exist
    if [ ! -d "venv" ] && [ ! -d ".venv" ]; then
        log "Creating Python virtual environment..."
        python -m venv venv 2>/dev/null || python3 -m venv venv
        log "Virtual environment created at backend/venv/"
    fi

    # Activate and install
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    elif [ -f "venv/Scripts/activate" ]; then
        source venv/Scripts/activate
    elif [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
    elif [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    fi

    pip install -r requirements.txt -q
    log "All dependencies installed"
}

# --- Verify build ---
verify_build() {
    log "Verifying frontend build..."
    cd "$PROJECT_ROOT/frontend"
    npm run build >/dev/null 2>&1 && log "Frontend build: OK" || warn "Frontend build failed — check for errors"

    log "Verifying backend imports..."
    cd "$PROJECT_ROOT/backend"
    python -c "from src.agentstack.agent import Agent; from src.agents import AGENT_FACTORIES; print(f'Backend OK — {len(AGENT_FACTORIES)} agents registered')" 2>/dev/null || \
    python3 -c "from src.agentstack.agent import Agent; from src.agents import AGENT_FACTORIES; print(f'Backend OK — {len(AGENT_FACTORIES)} agents registered')" 2>/dev/null || \
    warn "Backend import check failed"
}

# --- Print instructions ---
print_start() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            Setup Complete!                   ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Start the app with two terminals:"
    echo ""
    echo -e "  ${CYAN}Terminal 1 (backend):${NC}"
    echo -e "    cd backend"
    echo -e "    source venv/bin/activate   ${YELLOW}# or venv\\Scripts\\activate on Windows${NC}"
    echo -e "    uvicorn src.main:app --reload --port 8000"
    echo ""
    echo -e "  ${CYAN}Terminal 2 (frontend):${NC}"
    echo -e "    cd frontend"
    echo -e "    npm run dev"
    echo ""
    echo -e "  Then open ${CYAN}http://localhost:3000${NC}"
    echo ""
    echo -e "  To deploy: ${CYAN}./scripts/deploy.sh${NC}"
    echo ""
}

# --- Main ---
main() {
    echo ""
    echo -e "${CYAN}  Agent Stack — Local Setup${NC}"
    echo -e "${CYAN}  ────────────────────────${NC}"
    echo ""

    check_tools
    setup_env
    install_deps
    verify_build
    print_start
}

main "$@"
