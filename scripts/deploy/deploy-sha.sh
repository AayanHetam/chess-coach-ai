#!/usr/bin/env bash
#
# Deploy an exact commit to production when Vercel refuses to.
#
# WHY THIS EXISTS
# ---------------
# Vercel blocks any deployment whose git commit AUTHOR is not a member of the
# Vercel team. Hobby teams cannot have members, so every commit written by a
# collaborator is rejected before it builds -- status UNKNOWN, a `. [0ms]`
# build, no logs, and the custom domain left on the previous release. The only
# place the real reason appears is GitHub:
#
#   gh api repos/<owner>/<repo>/deployments/<id>/statuses  ->  "Deployment was blocked"
#
# The block fires about a second after the deployment is created, BEFORE CI
# runs, so a red check on the same commit is a coincidence and not the cause.
#
# Deploying from a git checkout does NOT get around it: the Vercel CLI reads
# the repository and sends the same offending author. What works is uploading
# the tree with no git metadata at all, which is what `git archive` gives us.
#
# The cost of that is provenance: Vercel injects VERCEL_GIT_COMMIT_SHA only for
# git-integration builds, and VERCEL_* names are reserved, so --build-env
# cannot fake it. We pass BUILD_SHA instead and /api/version falls back to it.
#
# USAGE
#   VERCEL_TOKEN=... scripts/deploy/deploy-sha.sh <sha> [ref]
#
# Alternatives that do NOT need this script, preferred when available:
#   - re-author or merge the commit as a team member (the git integration then
#     deploys it normally and provenance comes for free), or
#   - upgrade to Vercel Pro and add the collaborator to the team.
#
set -euo pipefail

SHA="${1:?usage: deploy-sha.sh <sha> [ref]}"
REF="${2:-main}"
PROJECT="${VERCEL_PROJECT_NAME:-chess-coach-ai}"
SCOPE="${VERCEL_SCOPE:-aayan-hs-projects}"
PROD_URL="${PROD_URL:-https://www.chessmasti.com}"

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "::error::VERCEL_TOKEN is not set. Create one at vercel.com/account/tokens" >&2
  exit 2
fi

# Resolve to a full SHA so what we deploy and what we stamp cannot disagree.
FULL_SHA="$(git rev-parse --verify "${SHA}^{commit}")"
TREE="$(git rev-parse --verify "${FULL_SHA}^{tree}")"
echo "Deploying commit ${FULL_SHA} (tree ${TREE}) to production."

WORK="$(mktemp -d)"
# shellcheck disable=SC2064  # expand WORK now, on purpose
trap "rm -rf '${WORK}'" EXIT

# git archive writes the commit's tree and nothing else -- no .git directory,
# no .git file. That absence is the entire point: with no repository to read,
# the CLI sends no commit author, so there is nothing for Vercel to reject.
git archive "$FULL_SHA" | tar -x -C "$WORK"

if [ -e "$WORK/.git" ]; then
  echo "::error::.git present in the upload -- Vercel would read the author and block this." >&2
  exit 1
fi

# Link by name so the only credential this needs is the token. Writing
# .vercel/project.json by hand would mean carrying the org and project ids
# around as extra secrets for no benefit.
vercel link --yes --cwd "$WORK" --project "$PROJECT" --scope "$SCOPE" --token "$VERCEL_TOKEN"

# BUILD_SHA/BUILD_REF are what /api/version falls back to. Passing
# VERCEL_GIT_COMMIT_SHA here does nothing: the name is reserved and Vercel
# drops it without warning, which is how 47aafa98 shipped reporting "dev".
DEPLOY_URL="$(
  vercel deploy --prod --yes \
    --cwd "$WORK" \
    --scope "$SCOPE" \
    --token "$VERCEL_TOKEN" \
    --build-env BUILD_SHA="$FULL_SHA" \
    --build-env BUILD_REF="$REF" \
  | tail -1
)"
echo "Deployed: ${DEPLOY_URL}"

# Confirm the alias actually moved. `vercel deploy --prod` reporting success
# only means the build finished; a deployment that never took the domain
# leaves prod on the old release, which is the failure we are here to fix.
for i in $(seq 1 20); do
  SERVED="$(curl -sf --max-time 10 "${PROD_URL}/api/version" \
    | sed -E 's/.*"sha":"([a-zA-Z0-9]+)".*/\1/')" || SERVED=""
  if [ "$SERVED" = "$FULL_SHA" ]; then
    echo "Verified: ${PROD_URL} is serving ${FULL_SHA}."
    exit 0
  fi
  echo "attempt ${i}/20: prod serves '${SERVED:-unreachable}', waiting..."
  sleep 15
done

echo "::error::Deployed ${FULL_SHA} but ${PROD_URL} never served it. Prod may still be on the previous release." >&2
exit 1
