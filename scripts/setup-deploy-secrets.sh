#!/usr/bin/env bash
#
# Give the Deploy workflow the two secrets it needs.
#
# Push-to-deploy is gated on these, and without them the workflow fails with a
# notice naming them. They are a private SSH key and a dotenv decryption key,
# so they are yours to install rather than something automation should route
# through a third party - this script only puts them where GitHub wants them,
# and never prints or copies them anywhere else.
#
#   bash scripts/setup-deploy-secrets.sh
#
# Re-runnable: setting a secret that already exists overwrites it.

set -euo pipefail

REPO="${DEPLOY_REPO:-stacksjs/smakelo}"
ENVIRONMENT="${DEPLOY_ENVIRONMENT:-production}"
SSH_KEY="${DEPLOY_SSH_KEY_PATH:-$HOME/.ssh/id_ed25519}"

command -v gh >/dev/null || { echo "gh is not installed: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not logged in. Run: gh auth login"; exit 1; }

echo "Repository:  $REPO"
echo "Environment: $ENVIRONMENT"
echo

# --- 1. The key the server trusts -------------------------------------------
#
# The deploy talks to the box as root over SSH with BatchMode on, so the key
# has to be one the box already accepts. This is the same key a working
# `ssh root@<box>` from this machine uses.
if [ ! -f "$SSH_KEY" ]; then
  echo "No SSH key at $SSH_KEY."
  echo "Set DEPLOY_SSH_KEY_PATH to the private key the server trusts, then re-run."
  exit 1
fi

echo "→ DEPLOY_SSH_KEY   from $SSH_KEY"
gh secret set DEPLOY_SSH_KEY --repo "$REPO" --env "$ENVIRONMENT" < "$SSH_KEY"

# --- 2. The key that decrypts .env.production -------------------------------
#
# Without it the encrypted values fall back to defaults, which is how an app
# deploys with the wrong APP_KEY and invalidates every session it had. It lives
# in .env.keys, which is gitignored.
KEYS_FILE="${DOTENV_KEYS_FILE:-.env.keys}"

if [ ! -f "$KEYS_FILE" ]; then
  echo "No $KEYS_FILE here. Run this from the repo root, or set DOTENV_KEYS_FILE."
  exit 1
fi

# The line is DOTENV_PRIVATE_KEY_PRODUCTION="<hex>". Take everything after the
# first `=` and strip the quotes, without echoing it anywhere.
PRIVATE_KEY="$(grep -m1 '^DOTENV_PRIVATE_KEY_PRODUCTION=' "$KEYS_FILE" | cut -d= -f2- | tr -d '"'"'"'')"

if [ -z "$PRIVATE_KEY" ]; then
  echo "No DOTENV_PRIVATE_KEY_PRODUCTION found in $KEYS_FILE."
  exit 1
fi

echo "→ DOTENV_PRIVATE_KEY_PRODUCTION   from $KEYS_FILE"
printf '%s' "$PRIVATE_KEY" | gh secret set DOTENV_PRIVATE_KEY_PRODUCTION --repo "$REPO" --env "$ENVIRONMENT"

unset PRIVATE_KEY

echo
echo "Done. Both secrets are on the $ENVIRONMENT environment."
echo
echo "Verify by shipping something, or trigger it directly:"
echo "  gh workflow run Deploy --repo $REPO"
echo
echo "The run should now get past 'Is deployment configured?' and finish with"
echo "'<site> is serving build <id>' from the post-deploy check."
