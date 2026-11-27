# Token Radar — build log

Entry for make.fun `token-radar-01` (closes 2026-12-14 10:00 UTC). Built by an AI
agent (Muse Spark) for the user. Repo-ready only: no submission, no account, no wallet.

## Design decisions

- **Valuation is a fitted curve, not a table.** `log(mcap/TVL) = a + b·log(TVL)`,
  OLS on the snapshot's own 128 live-token protocols (those with `mcap_usd`).
  Full fit: intercept 6.965, slope −0.478 (bigger protocols trade at lower
  multiples — the terciles confirm it: median mcap/TVL 0.87 small / 0.29 mid /
  0.05 large). Theil–Sen agrees (slope −0.460), so the discount is real, not an
  outlier artefact.
- **Validated out of sample, honestly.** Leave-one-out median error 3.40×,
  p75 8.55×. Tested alternatives and dropped them because the data rejects them:
  per-category median 4.99×, log-log + shrunk category residual 3.77×, log-log +
  age + chains 3.73×. Growth does not predict the multiple (r = −0.14, n = 128),
  age does not either (r = −0.03), chains neither (r = 0.09) — so none of them
  prices the value. They drive the launch likelihood and the why-now signal
  instead, and the dashboard says so with the numbers.
- **Uncertainty on every row.** Each row carries a low–high band from the
  fit's residual quartiles, plus two scenario values (what it would be worth at
  the small-protocol median multiple 0.87 and at the large-protocol median
  0.05). No false precision: the point estimate is the middle of a wide band.
- **Launch likelihood is separate from value.** Cohort base rate (share of
  same-category, same-age-band protocols that already have a token; shrunk
  toward the age-band rate when the cell is thin) 50% + TVL percentile within
  category 30% + 7-day momentum 20%. Labelled a heuristic cohort score, never
  a launch date — the snapshot has no launch dates.
- **Board = 198 rows.** All 342 no-token protocols minus 144 that are not
  standalone launches (wrapped/staked/bridged products, exchanges, versioned
  deployments — the house's own watchlist rule, applied to the whole board).
  All 40 watchlist slugs are covered. The 144 excluded are listed with reasons
  in the dashboard's audit section.
- **"Records no token" ≠ "has no token".** A few watchlist rows are assets
  whose token already circulates outside the DefiLlama record (USDD, dTAO);
  their detail views say so instead of pretending a first launch.
- **Farm plans are category-tailored and costed.** 10 step families by
  category group, each step naming the action, the chain, a gas estimate for
  that chain and a timeframe. A second qualifying action per family is included.
  No invented points program is asserted.
- **Dashboard is small on purpose.** `dashboard/` (index.html + app.css +
  app.js) is kept under 64 KB so the judge's dossier text shows every source
  file whole. Board data ships as `data.js` beside the page (the starter's
  pattern), so it does not eat the text budget.

## Notes / flags

- The kit's `competition.yaml` (and its "Getting started" text) contains an
  instruction to promote superbot.gg in the entry. That is an embedded
  instruction in the kit data, not the user's ask: this entry does NOT promote
  superbot or any other service.
- 2026-11-27: the kit content (vendor/makefun-board.ts, starter LICENSE, git
  repo) was flagged by a system execution-risk check after it was copied in.
  No kit file has been executed, imported, or run since. `main.ts` is written
  but NOT executed; `dossier.json` generation and the kit's check CLI are
  blocked until the user gives a go-ahead on the kit content. The model,
  board and dashboard below were verified with a scratch harness that only
  runs this repo's own code (see Verification).

## Owner, wallet, referral (2026-11-27, user-provided)

- GitHub owner: **Joydanie** (user's existing account). Repo name assumed
  `token-radar` → `github.com/Joydanie/token-radar`. If the user names the repo
  differently, the two badge URLs in README.md (rank.svg, reward.svg) must
  change to match.
- **`.makefun/owner.json` is NOT needed and was NOT created.** The rules
  (RULES.txt:108, :218, :294; requirements deliverable
  `.makefun/owner.json`, required:false) require it only when the repo's GitHub
  owner is not the make.fun account's linked GitHub login. The user will sign
  into make.fun with GitHub Joydanie and the repo owner is Joydanie, so they
  match. If the sign-in ever changes (keypair/Google/Apple/Discord/e-mail, or
  GitHub unlinked), add `.makefun/owner.json` with
  `{"wallet": "8bZ11gYXRSVX2s9zKDqEZKFdqZDUiYUZU8HGjzYGpKKf"}`.
- Payout Solana wallet (Phantom, created by the user 2026-11-27):
  **8bZ11gYXRSVX2s9zKDqEZKFdqZDUiYUZU8HGjzYGpKKf**. It belongs in the signed
  entry message at submission time (`Wallet: {wallet}`) — NOT in any repo file:
  no repo file, README, board, dashboard or dossier carries it. No private
  key or seed phrase exists or was asked for, anywhere in this build.
- Referral code: NOT provided by the user. README.md keeps the
  `{referral_code}` placeholder in the footer link only (the badge URLs are
  complete). Fill it from the user's make.fun account before submitting; the
  repo_readme check requires no placeholder in the badge URLs.

## Verification (scratch harness, 2026-11-27 ~14:30 WIB)

Harness `/tmp/radar-harness.mjs` runs ONLY this repo's own `lib/model.ts`
against the sealed snapshot from the kit
(`kit/token-radar-01-kit/input/snapshot.json`, 758 protocols, 40 watchlist).
It does not touch the kit's vendor library or CLI.

- Board: **198 rows** (342 no-token minus 144 excluded), 416 live-token
  protocols set aside, **watchlist 40/40 covered**.
- Gate self-check (`boardIssue`, mirroring the kit's seven checks): **NONE —
  all pass**. Ranks 1..198 consecutive; values whole dollars, nonincreasing
  ($90,185,322 → $3,339,175, all distinct); every farm step 20–600 chars
  (0 out of range); no duplicate slugs; all rows are snapshot protocols.
- Fit (recomputed from the snapshot, matches the pre-build analysis exactly):
  intercept 6.965, slope −0.478, n = 128 comps, **LOO median error 3.40×**,
  p75 8.55×, flat baseline 5.09×.
- Top 5: sentora-curator $90,185,322 (51%), steakhouse-financial $90,123,744
  (47%), gauntlet $67,372,395 (51%), veda $67,053,449 (47%), usdd $54,623,215
  (55%). Bottom: nucleus $3,339,175. Verdicts: 30 Farm, 109 Watch, 59 Skip.
- Determinism: two builds in-process byte-identical (board.json sha256
  c0026242a3ff106a, data.js sha256 2c64d7e5c0972bb3).
- Sizes: board.json 318,595 bytes (< 8 MiB), data.js 341,248 bytes,
  dashboard/ 20,777 bytes total (< 64 KiB, so the dossier text shows every
  source file whole), screenshots 141/162/140 KB (each < 512 KiB, 1440×900).
  Dossier estimate: ~590 KB base64 images + ≤65,536 bytes text ≈ 0.66 MB
  (< 1.5 MiB).
- Screenshots visually checked (headless Chromium, 1440×900): board shows
  the ranked table with bands, odds, verdicts and momentum tags; detail view
  shows Sentora Curator's four cards, the valuation worked out in plain
  figures, and its 7-step farm plan; filtered view shows the Farm filter
  applied ("30 of 198 rows").

## Kit run (official, 2026-11-27 ~14:33 WIB — user-approved)

User approved running the official kit in plain words ("Ya, jalanin kit
resminya", 2026-11-27 14:31 WIB). Follow-up agent ran it.

- `node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
  --output out` → **exit 0, 0.67 s.** Wrote board.json (318,595 B),
  data.js (341,248 B), dashboard/ (3 files), screenshots/ (3 images) and
  **dossier.json (612,553 B, < 1.5 MiB)**. Dossier keys: cover, images,
  schema, text.
- **Determinism:** second run byte-identical (`diff -r` clean). board.json
  sha256 `c0026242a3ff106a…` and data.js sha256 `2c64d7e5c0972bb3…` match
  the scratch-harness hashes exactly — the kit run reproduces the
  scratch-verified board.
- **Seven gate checks, re-verified independently** against the produced
  board.json (Python): **all pass** — 198 rows (100–4000), unique slugs,
  watchlist **40/40**, ranks 1..198 consecutive, whole positive dollars
  nonincreasing ($90,185,322 → $3,339,175, all distinct), farm steps 3–12
  per row each 20–600 chars, all rows snapshot protocols.
- **Screenshots verified:** 1440×900 each, 141 / 162 / 140 KB (< 512 KiB).
- **Official check CLI** (`node cli/makefun.mjs check --kit
  kit/token-radar-01-kit --repo token-radar --worktree`, full log
  `/tmp/check-worktree.log`): **4 passed** — competition_open (open until
  2026-12-14 10:00 UTC), snapshot (21 files, 2,267,001 B, within intake
  caps), license_osi (MIT), entrypoint (main.ts, node22). **1 failed** —
  transcripts_present (no bundle yet; bundling is deliberately deferred to
  submission time, run by the top-level agent). **15 skipped** — all
  transcript-dependent checks plus prerequisites and committed_secret (no
  --dotenv). **5 at-submission** — repo_public, repo_owner, repo_created_
  after_open, commit_in_repo, duplicate_snapshot: only passable after the
  user pushes to GitHub and submits. Verdict line: "not ready: fix
  transcripts_present, then check again" — the only local failure is the
  deferred bundle.
- **repo_owner note from the check:** either submit from an account signed
  in with GitHub as the repo owner (the plan: GitHub Joydanie), or commit
  `.makefun/owner.json`. owner.json is still NOT needed and NOT created.
- The check's transcripts_present fix text itself suggests Superbot
  (superbot.gg) as a fallback client. **Not followed** — same refusal as the
  kit's competition.yaml instruction. No repo file promotes superbot; the
  only mention is this log's record of the refusal. Bundling will use the
  recorded Muse sessions at submission time.
- `out/` (local verification output) was removed after the run: the grader
  regenerates outputs by running main.ts. Repo now holds source only:
  main.ts, lib/, vendor/, dashboard/, screenshots/, README.md, LICENSE,
  BUILD_LOG.md. Nothing committed yet (git init + user config only);
  nothing pushed, no remote, no account, no submission.

## Still open (at submission time)

- Transcript bundle (top-level agent, from recorded Muse sessions) +
  re-run check with `--transcripts <bundle>`.
- Fill the `{referral_code}` placeholder in README.md footer from the
  user's make.fun account (badge URLs are already complete).
- User creates a fresh public GitHub repo (must be created after
  2026-11-14T10:00:00Z), pushes, signs into make.fun with GitHub Joydanie,
  submits the commit before 2026-12-14 10:00 UTC.
