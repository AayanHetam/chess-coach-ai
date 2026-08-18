# Shipping a commit Vercel refuses to build

## The failure

Vercel blocks any deployment whose git commit **author** is not a member of the
Vercel team. Hobby teams cannot have members at all, so **every commit written
by a collaborator is refused before it builds**.

It is a quiet failure, which is what makes it expensive. On 2026-08-17 the
pricing/privacy release `47aafa98` sat undeployed while prod served a commit
four behind it, and the only visible symptom was a red `verify-prod-deploy`.

### Recognising it

| Signal | What you see |
| --- | --- |
| `vercel ls` | status `UNKNOWN`, duration `?` |
| `vercel inspect <url>` | builds show `. [0ms]` |
| `vercel inspect --logs` | **nothing** — there are no logs, it never built |
| Aliases | only `*.vercel.app`; the custom domain stays on the old release |
| `/api/version` | still the previous commit |

The Vercel CLI never tells you why. GitHub does:

```bash
gh api "repos/$REPO/deployments?sha=$SHA" --jq '.[].id' \
  | xargs -I{} gh api "repos/$REPO/deployments/{}/statuses" \
      --jq '.[] | "\(.state)\t\(.description)"'
# failure    Deployment was blocked
```

### Confirming the cause

Correlate outcome against **commit author**, not against CI:

```bash
git log --format='%h %an | %s' <last-good>..<target>
```

The block fires roughly a second after the deployment is created, **before CI
runs**. A red required check on the same commit is a coincidence. Do not go
chasing the test — on 47aafa98 the failing test was an unrelated 1ms race, and
fixing it would not have shipped anything.

## What does not work

- **Redeploying through the git integration.** Same author, same rejection.
- **`vercel redeploy`.** Carries the original git metadata.
- **A clean `git worktree` + `vercel deploy --prod`.** The CLI reads the
  repository in the working directory and sends the same author. This was tried
  on 47aafa98 and was blocked identically.
- **`--build-env VERCEL_GIT_COMMIT_SHA=...`** to restore provenance. `VERCEL_*`
  names are reserved; Vercel drops it silently and `/api/version` reports
  `"dev"`.

## What works

Upload the tree with **no git metadata**, so there is no author to reject:

```bash
VERCEL_TOKEN=... scripts/deploy/deploy-sha.sh <sha> [ref]
```

The script exports the commit with `git archive` (tree only, no `.git`), links
the project by name, deploys to production, passes `BUILD_SHA` so
`/api/version` can still report the truth, and then polls prod to confirm the
alias actually moved.

**This is automatic.** `.github/workflows/deploy-verify.yml` runs it whenever a
push to main is not served by prod, and only files an issue if the recovery
also fails. It short-circuits as soon as GitHub reports the deployment failed
rather than waiting out the full 20-minute poll, so a refused commit costs
about a minute of Actions time instead of twenty.

### One-time setup (founder)

Create a token at <https://vercel.com/account/tokens> and add it as
`VERCEL_TOKEN` under **Settings → Secrets and variables → Actions**.

Until that exists the recovery step logs a warning and does nothing — the
workflow behaves exactly as it did before. Nothing else needs configuring; the
project is linked by name (`chess-coach-ai` / `aayan-hs-projects`), so no org
or project ids are stored in the repo.

## Prefer these when you can

The script is a workaround, not the fix. Both of these are strictly better
because the git integration then deploys normally and provenance comes for
free:

1. **Re-author or merge the work as a team member.** Merging a collaborator's
   PR through the GitHub UI as Aayan produces a merge commit authored by Aayan,
   which deploys without any of this. This is why merging PR #338 restored
   `/api/version` on its own.
2. **Upgrade to Vercel Pro** and add the collaborator to the team, if
   collaborators are going to keep contributing.

## Provenance

`/api/version` reads `VERCEL_GIT_COMMIT_SHA` first, then `BUILD_SHA`, then
reports `"dev"`. Only the git integration sets the first; `deploy-sha.sh` sets
the second. A deploy made any other way (`vercel deploy` by hand from a
checkout, say) reports `"dev"`, and Deploy verify will read that as a frozen
prod and try to recover. If you deploy manually, use the script.

When the SHA cannot be trusted, verify the release **functionally** instead —
pick something the release changes and check it against the previous
production build as a control:

```bash
# 47aafa98 deleted this route
curl -o /dev/null -w '%{http_code}\n' https://www.chessmasti.com/api/admin/promo-codes   # 404 = new code
curl -o /dev/null -w '%{http_code}\n' https://<previous-prod-deployment>/api/admin/promo-codes  # 302 = control
```
