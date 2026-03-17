#!/usr/bin/env bash
# CEO Command Center — Redeploy Script
# Usage: ./redeploy.sh "optional commit message"
# Reads VPS_PASS and GH_TOKEN from environment or prompts

set -euo pipefail

REPO_DIR="/Users/nunocostafernandes/CRANK Dropbox/18B-Crank Nuno/Claude/ceo-command-center"
VPS_USER="root"
VPS_IP="187.77.129.84"
APP_DIR="/var/www/ceo-command-center"

# Load from env or secrets file if available
SECRETS_FILE="$REPO_DIR/.deploy-secrets"
if [ -f "$SECRETS_FILE" ]; then
  source "$SECRETS_FILE"
fi

VPS_PASS="${VPS_PASS:?Set VPS_PASS in .deploy-secrets or environment}"
GH_TOKEN="${GH_TOKEN:?Set GH_TOKEN in .deploy-secrets or environment}"

COMMIT_MSG="${1:-Update: $(date '+%Y-%m-%d %H:%M')}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}[1/2] Committing and pushing to GitHub...${NC}"
cd "$REPO_DIR"
git remote set-url origin "https://${GH_TOKEN}@github.com/nunocostafernandes/ceo-command-center.git"
git add -A
if git diff --cached --quiet; then
  echo "  No local changes to commit."
else
  git commit -m "$COMMIT_MSG"
fi
git push
echo -e "${GREEN}  ✓ GitHub up to date${NC}"

echo -e "${YELLOW}[2/2] Pulling and rebuilding on VPS...${NC}"
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
  set -e
  cd $APP_DIR
  git pull
  npm install --legacy-peer-deps --silent
  npm run build 2>&1 | tail -3
"
echo -e "${GREEN}  ✓ Build complete — live at https://ceo.aitaskforce.pro${NC}"
