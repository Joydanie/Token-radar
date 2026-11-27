# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Joydanie/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Joydanie/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols in a sealed DefiLlama snapshot (758 protocols, 2026-11-14) by what a token launch would be worth — and how likely a launch is, and what to do about it. It answers "which, how big, how likely, and what to do" in one place: 198 ranked rows, each with an implied value, an uncertainty band, a launch likelihood, a why-now signal, and a costed farm plan.

## How it works

- **Valuation is a fitted curve, not a table.** `implied value = TVL × fitted multiple(TVL)`, where the multiple is the log-log OLS fit of mcap/TVL on TVL over the snapshot's own 128 live-token protocols: `log(mcap/TVL) = 6.965 − 0.478·log(TVL)`. Bigger protocols trade at lower multiples — the terciles confirm it (median mcap/TVL 0.87 small / 0.29 mid / 0.05 large).
- **Validated out of sample, honestly.** Leave-one-out median error 3.40× (p75 8.55×), against 5.09× for a flat global-median multiple. Per-category medians, a category-residual adjustment and an age/chains extension were all fitted and all lost, so they were dropped — and the dashboard says so with the numbers.
- **Uncertainty on every row.** Each row carries a low–high band from the fit's residual quartiles, plus two scenario values (at the small- and large-protocol median multiples). No false precision.
- **Launch likelihood is separate from value.** A cohort score (category × age-band token rate, shrunk when the cell is thin) + TVL percentile within category + 7-day momentum. It is labelled a heuristic, never a launch date — the snapshot has none.
- **Rigour where it matters.** All 40 watchlist slugs are covered. 144 protocols that record no token are excluded from the board — wrapped, staked, bridged, exchange and versioned products — and listed with reasons in the dashboard's audit section. Where the token already circulates outside the DefiLlama record (USDD, dTAO), the detail view says so.
- **Farm plans are executable.** Category-tailored steps with real gas costs by chain, timeframes, and a second qualifying action per family. No step asserts a points program or a launch the snapshot does not support.

Top of the board: Sentora Curator ($90.2M implied, 51% launch odds), Steakhouse Financial ($90.1M, 47%), Gauntlet ($67.4M, 51%), Veda ($67.1M, 47%), USDD ($54.6M, 55%). Verdicts: 30 Farm, 109 Watch, 59 Skip.

## Run it

```sh
node main.ts --input /input/snapshot.json --output /output
```

Node 22.18+ (24 works). No network, no dependencies: `main.ts` reads the snapshot, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored make.fun library. No wall clock in any output: two runs on the same snapshot byte-match.

Local check against the kit's snapshot:

```sh
mkdir -p out && node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json --output out
```

## Files

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the model: eligibility, curve fit + leave-one-out validation, launch likelihood, farm plans, board builder, gate checks.
- `dashboard/` — offline page (index.html, app.css, app.js; 20.8 KB total): search/filter/sort, per-protocol detail view with the valuation explained in plain figures, compare mode, methodology + validation panel, excluded-protocols audit.
- `screenshots/` — board, detail view, filtered view (1440×900).
- `vendor/makefun-board.ts` — make.fun's dossier library, copied byte-for-byte from the kit (the scorer runs this same file).
- `BUILD_LOG.md` — design decisions and verification results.

Implied values are this entry's own estimates from the snapshot, not facts and not prices. A launch likelihood is a cohort score, never a launch date. Nothing here is financial advice.

---

Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
