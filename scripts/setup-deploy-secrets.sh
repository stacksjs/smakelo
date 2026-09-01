#!/usr/bin/env bash
#
# Give the Deploy workflow the two secrets it needs, and prove they work.
#
#   bash scripts/setup-deploy-secrets.sh
#
# The secrets are a private SSH key and the key that decrypts .env.production,
# so they are yours to install: this script moves them from your machine to
# GitHub and never prints them or copies them anywhere else.
#
# Re-runnable. Setting a secret that already exists overwrites it.
#
# The first version of this script took `~/.ssh/id_ed25519` on faith. That key
# has a passphrase, and `ssh-add` in a runner has no terminal to ask on, so the
# deploy failed at "Load the deploy key" with `Command failed: ssh-add -` and
# nothing to say why. A key CI cannot use is worse than no key: the secret
# exists, the gate passes, and the failure moves somewhere less obvious. So
# this checks first, and makes a usable key when the default will not do.

set -euo pipefail

REPO="${DEPLOY_REPO:-stacksjs/smakelo}"
ENVIRONMENT="${DEPLOY_ENVIRONMENT:-production}"
SERVER="${DEPLOY_SERVER:-178.105.248.188}"
SERVER_USER="${DEPLOY_SERVER_USER:-root}"
DEPLOY_KEY="${DEPLOY_SSH_KEY_PATH:-$HOME/.ssh/smakelo-deploy}"

command -v gh >/dev/null || { echo "gh is not installed: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not logged in. Run: gh auth login"; exit 1; }

echo "Repository:  $REPO"
echo "Environment: $ENVIRONMENT"
echo "Server:      $SERVER_USER@$SERVER"
echo

usable() {
  # A key CI can load is one that needs no passphrase. `-P ''` succeeds only
  # when the empty passphrase is the right one.
  [ -f "$1" ] && ssh-keygen -y -P '' -f "$1" >/dev/null 2>&1
}

# --- 1. A key a runner can actually load ------------------------------------
if usable "$DEPLOY_KEY"; then
  echo "→ Using existing deploy key at $DEPLOY_KEY"
else
  if [ -f "$DEPLOY_KEY" ]; then
    echo "The key at $DEPLOY_KEY has a passphrase, which a CI runner cannot answer."
    echo "Move it aside or set DEPLOY_SSH_KEY_PATH to a different path, then re-run."
    exit 1
  fi

  echo "→ Creating a dedicated deploy key at $DEPLOY_KEY (no passphrase)"
  # Its own key rather than your personal one: it lives in a CI secret, it is
  # only trusted for this deploy, and revoking it is one line on the server.
  ssh-keygen -t ed25519 -N '' -C "smakelo-deploy (github actions)" -f "$DEPLOY_KEY" >/dev/null

  echo "→ Authorising it on $SERVER_USER@$SERVER"
  # Appends only if absent, so re-running does not grow the file.
  ssh -o ConnectTimeout=20 "$SERVER_USER@$SERVER" \
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && grep -qxF '$(cat "$DEPLOY_KEY.pub")' ~/.ssh/authorized_keys || echo '$(cat "$DEPLOY_KEY.pub")' >> ~/.ssh/authorized_keys"
fi

# --- 2. Prove the key works before trusting it -------------------------------
#
# BatchMode so it fails rather than falling back to a prompt or another key in
# the agent — which is exactly how an unusable key looked fine from a laptop
# and failed in CI.
echo "→ Checking the key can reach the server on its own"
if ! ssh -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 \
       -o StrictHostKeyChecking=accept-new "$SERVER_USER@$SERVER" true 2>/dev/null; then
  echo "  Could not log in with $DEPLOY_KEY."
  echo "  Authorise its public half on the server and re-run:"
  echo "    ssh-copy-id -i $DEPLOY_KEY.pub $SERVER_USER@$SERVER"
  exit 1
fi
echo "  ok"

# --- 3. Install it -----------------------------------------------------------
echo "→ DEPLOY_SSH_KEY"
gh secret set DEPLOY_SSH_KEY --repo "$REPO" --env "$ENVIRONMENT" < "$DEPLOY_KEY"

# --- 4. The key that decrypts .env.production --------------------------------
#
# Without it the encrypted values fall back to defaults, which is how an app
# deploys with the wrong APP_KEY and invalidates every session it had.
KEYS_FILE="${DOTENV_KEYS_FILE:-.env.keys}"
[ -f "$KEYS_FILE" ] || { echo "No $KEYS_FILE here. Run from the repo root, or set DOTENV_KEYS_FILE."; exit 1; }

PRIVATE_KEY="$(grep -m1 '^DOTENV_PRIVATE_KEY_PRODUCTION=' "$KEYS_FILE" | cut -d= -f2- | tr -d '"'"'"'')"
[ -n "$PRIVATE_KEY" ] || { echo "No DOTENV_PRIVATE_KEY_PRODUCTION in $KEYS_FILE."; exit 1; }

echo "→ DOTENV_PRIVATE_KEY_PRODUCTION"
printf '%s' "$PRIVATE_KEY" | gh secret set DOTENV_PRIVATE_KEY_PRODUCTION --repo "$REPO" --env "$ENVIRONMENT"
unset PRIVATE_KEY

# --- 5. The values the deploy ships to the server ---------------------------
#
# `buddy deploy` writes the environment it runs with to the box. A runner
# starts with no `.env`, so it made one and generated a random APP_KEY into it
# - which would have replaced production's and signed every session out. These
# come from the local `.env`, which is where they already live.
ENV_FILE="${DEPLOY_ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE here, so APP_KEY and HCLOUD_TOKEN cannot be read."; exit 1; }

from_env() {
  # Strip either quote style; dotenv writes both.
  grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d "\"'"
}

for name in APP_KEY HCLOUD_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  value="$(from_env "$name")"

  if [ -z "$value" ]; then
    # Cloudflare's pair is only needed for DNS reconciliation; the first two
    # are not optional, and the workflow refuses to deploy without them.
    case "$name" in
      APP_KEY|HCLOUD_TOKEN) echo "  $name is missing from $ENV_FILE - the deploy needs it."; exit 1 ;;
      *) echo "→ $name (absent, skipping)"; continue ;;
    esac
  fi

  echo "→ $name"
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" --env "$ENVIRONMENT"
done
unset value

echo
echo "All secrets are on the $ENVIRONMENT environment, and the key is known to work."
echo "Ship something, or trigger it directly:"
echo "  gh workflow run Deploy --repo $REPO"
