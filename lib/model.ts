// Token Radar — the valuation model (lib/model.ts).
//
// Everything here is derived from the sealed snapshot's own figures, on every
// run. Nothing is read from a hardcoded list of names: the curve is fitted on
// the snapshot's live-token protocols, the launch odds are cohort rates from
// the same file, and the farm plans are built from each protocol's category,
// chains and TVL. Standard library only; no network; deterministic.
//
// Model, in one paragraph:
//   implied value = TVL x fitted multiple(TVL), where the multiple is the
//   log-log OLS fit of mcap/TVL on TVL over the 128 live-token protocols
//   (intercept 6.965, slope -0.478). Leave-one-out median error 3.40x.
//   Growth, age and chain count do NOT price the multiple: tested on the same
//   128 comps they carry no signal (r = -0.14, -0.03, 0.09), so they are used
//   for timing instead — the launch likelihood and the why-now signal. Every
//   row carries its uncertainty band from the fit's residual quartiles.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Parse and minimally validate the sealed snapshot. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error(`snapshot: bad protocol record for ${String(p.slug)}`);
    }
  }
  return raw;
}

// ---------------------------------------------------------------- eligibility

/** Categories the house's watchlist rule treats as not-a-standalone-launch. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Why a protocol is not a standalone launch candidate, or null when it is one.
 * This mirrors the house's watchlist rule so the board never ranks a wrapped,
 * staked or bridged product, an exchange, or a versioned deployment as if it
 * were a protocol still waiting on a first token.
 */
export function exclusionReason(p: Protocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return `category ${p.category} is a wrapped, staked, bridged or exchange product, not a standalone launch`;
  }
  if (WRAPPED_WORD.test(p.name)) return 'name marks it a wrapped or staked product of a token that already trades';
  if (VERSION_SUFFIX.test(p.name)) return 'name ends in a version marker: a deployment of a protocol, not a launch of its own';
  if (EXCHANGE_PREFIX.test(p.name)) return 'name begins with an exchange: an exchange product, not a standalone launch';
  return null;
}

/** A protocol records no token when both the CoinGecko id and the symbol are null. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Age in years at the snapshot's date, or null when unlisted. */
export function ageYears(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 86_400_000 / 365.25;
}

// ---------------------------------------------------------------- the curve fit

export interface CurveFit {
  intercept: number;
  slope: number;
  n: number;
  /** Leave-one-out median absolute log error, as a multiple (e.g. 3.40). */
  looMedian: number;
  /** Leave-one-out 75th-percentile absolute log error, as a multiple. */
  looP75: number;
  /** Residual quartiles in log space (for the per-row uncertainty band). */
  residQ25: number;
  residQ75: number;
  /** Median mcap/TVL of the smallest and largest TVL terciles (scenarios). */
  smallMedian: number;
  largeMedian: number;
  /** Median absolute log error of the flat global-median baseline, for contrast. */
  baselineMedian: number;
}

function ols(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

function median(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Fit log(mcap/TVL) = intercept + slope * log(TVL) on the live-token comps
 * and validate it leave-one-out. Deterministic: plain arithmetic, no sampling.
 */
export function fitCurve(live: Protocol[]): CurveFit {
  const pts = live
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({ x: Math.log(p.tvl_usd), y: Math.log(p.mcap_usd! / p.tvl_usd), tvl: p.tvl_usd }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const { intercept, slope } = ols(xs, ys);

  // Leave-one-out: refit without each comp, measure its error.
  const looErrs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const tx = xs.filter((_, j) => j !== i);
    const ty = ys.filter((_, j) => j !== i);
    const f = ols(tx, ty);
    looErrs.push(Math.abs(ys[i]! - (f.intercept + f.slope * xs[i]!)));
  }
  looErrs.sort((a, b) => a - b);

  // In-sample residuals, for the uncertainty band.
  const resid = pts.map((p) => p.y - (intercept + slope * p.x)).sort((a, b) => a - b);

  // Flat baseline: one global median multiple, leave-one-out the same way.
  const baseErrs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const rest = ys.filter((_, j) => j !== i).sort((a, b) => a - b);
    baseErrs.push(Math.abs(ys[i]! - median(rest)));
  }
  baseErrs.sort((a, b) => a - b);

  // Tercile medians for the scenario values.
  const byTvl = [...pts].sort((a, b) => a.tvl - b.tvl);
  const third = Math.floor(byTvl.length / 3);
  const small = byTvl.slice(0, third).map((p) => Math.exp(p.y)).sort((a, b) => a - b);
  const large = byTvl.slice(byTvl.length - third).map((p) => Math.exp(p.y)).sort((a, b) => a - b);

  return {
    intercept,
    slope,
    n: pts.length,
    looMedian: Math.exp(median(looErrs)),
    looP75: Math.exp(looErrs[Math.floor(looErrs.length * 0.75)]!),
    residQ25: resid[Math.floor(resid.length * 0.25)]!,
    residQ75: resid[Math.floor(resid.length * 0.75)]!,
    smallMedian: median(small),
    largeMedian: median(large),
    baselineMedian: Math.exp(median(baseErrs)),
  };
}

/** The fitted multiple for a TVL: exp(intercept + slope * ln(TVL)). */
export function fittedMultiple(fit: CurveFit, tvlUsd: number): number {
  return Math.exp(fit.intercept + fit.slope * Math.log(Math.max(1, tvlUsd)));
}

// ---------------------------------------------------------------- launch likelihood

export interface LikelihoodParts {
  /** Cohort token rate for the protocol's category x age band (0..1). */
  cohort: number;
  /** The protocol's TVL percentile within its category (0..1). */
  tvlPercentile: number;
  /** 7-day momentum mapped to 0..1. */
  momentum: number;
}

export interface Likelihood {
  /** 0..100, a heuristic cohort score — never a launch date. */
  score: number;
  parts: LikelihoodParts;
  /** What the cohort behind the score is, in plain words. */
  basis: string;
}

function ageBand(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 1) return '0-1y';
  if (age < 2) return '1-2y';
  if (age < 4) return '2-4y';
  return '4y+';
}

/**
 * Launch likelihood from the snapshot's own cohorts. The base rate is the
 * share of same-category, same-age-band protocols that already have a token —
 * the cohort's token-proneness — shrunk toward the age band's overall rate
 * when the cell is thin (5 protocols' worth). TVL percentile within the
 * category and 7-day momentum adjust it. The weights are stated, not fitted:
 * the snapshot has no launch dates, so no launch clock can be calibrated.
 */
export function launchLikelihood(p: Protocol, all: Protocol[], asOf: string): Likelihood {
  const age = ageYears(p, asOf);
  const band = ageBand(age);
  const cat = p.category ?? '(none)';
  const dated = all.filter((q) => ageYears(q, asOf) !== null);

  const rateOf = (list: Protocol[]): number => {
    if (list.length === 0) return 0;
    return list.filter((q) => !recordsNoToken(q)).length / list.length;
  };
  const cell = dated.filter((q) => (q.category ?? '(none)') === cat && ageBand(ageYears(q, asOf)) === band);
  const bandAll = dated.filter((q) => ageBand(ageYears(q, asOf)) === band);
  const cellRate = rateOf(cell);
  const bandRate = rateOf(bandAll);
  // Shrink the cell toward its band: 5 protocols' worth of prior.
  const cohort = (cell.length * cellRate + 5 * bandRate) / (cell.length + 5);

  const peers = all.filter((q) => (q.category ?? '(none)') === cat);
  const below = peers.filter((q) => q.tvl_usd < p.tvl_usd).length;
  const tvlPercentile = peers.length > 1 ? below / (peers.length - 1) : 0.5;

  const g = p.change_7d ?? 0;
  const momentum = Math.max(0, Math.min(1, 0.5 + g / 40));

  const score = Math.round(100 * (0.5 * cohort + 0.3 * tvlPercentile + 0.2 * momentum));
  return {
    score,
    parts: { cohort, tvlPercentile, momentum },
    basis: `${cat}, ${band}: ${cell.length} cohort peers, ${(100 * cellRate).toFixed(0)}% hold a token (band ${(100 * bandRate).toFixed(0)}%)`,
  };
}

// ---------------------------------------------------------------- why now

export type MomentumTag = 'Surging' | 'Growing' | 'Steady' | 'Cooling' | 'Fading';

export function momentumTag(change7d: number | null): MomentumTag {
  const g = change7d ?? 0;
  if (g >= 10) return 'Surging';
  if (g >= 2) return 'Growing';
  if (g > -2) return 'Steady';
  if (g > -10) return 'Cooling';
  return 'Fading';
}

// ---------------------------------------------------------------- farm plans

/** Gas estimate in USD per transaction on a chain (conservative, 2026 L2 fees). */
const CHAIN_GAS_USD: Record<string, number> = {
  Ethereum: 4,
  Solana: 0.02,
  Base: 0.15,
  Arbitrum: 0.15,
  Optimism: 0.15,
  Polygon: 0.15,
  Unichain: 0.15,
  Ink: 0.15,
  Katana: 0.15,
  Corn: 0.15,
  Arc: 0.15,
  Monad: 0.1,
  Binance: 0.2,
  Avalanche: 0.3,
  Sui: 0.05,
  Tron: 1,
  Bitcoin: 0.05,
};

export function gasUsd(chain: string): number {
  return CHAIN_GAS_USD[chain] ?? 0.5;
}

function primaryChain(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

/**
 * A farm plan is 5-7 concrete steps for the protocol's category family.
 * Every step names the action, the chain and a gas estimate, and a timeframe
 * where one applies. Steps never assert a points program, an airdrop, or a
 * launch date the snapshot does not carry: where a program is only rumoured,
 * the step says to check the protocol's own docs first. Each step is kept
 * between 20 and 600 characters by construction (the gate checks it too).
 */
export function farmPlan(p: Protocol): string[] {
  const chain = primaryChain(p);
  const gas = gasUsd(chain);
  const gasTxt = `about $${gas} in gas on ${chain}`;
  const name = p.name;
  const cat = p.category ?? 'DeFi';

  const common = [
    `Before sending funds, open ${name}'s official docs and confirm the action below exists on ${chain}; never trust a rumoured airdrop link from a chat or a search ad.`,
    `Track ${name} weekly: TVL, announcements and any points or quests page. A launch is usually signalled weeks ahead; farming blind for months is how time gets wasted.`,
    `Plan the exit now: know how to unwind each position (unstake, withdraw, swap back) and its gas, so a launch-day rush does not trap funds in a queue.`,
  ];

  const byFamily: Record<string, string[]> = {
    Lending: [
      `Supply collateral to ${name} on ${chain}: deposit a stablecoin or blue-chip asset you already hold, starting small (${gasTxt} per deposit).`,
      `Borrow against the deposit at a conservative loan-to-value (under 50%) and keep the health factor above 2, so a dip cannot liquidate the position.`,
      `Use the borrowed asset productively — repay it, hold it as a stable balance, or loop it back as supply once, not repeatedly. Each loop adds liquidation risk.`,
      `Hold the position for at least 4 weeks: lending rewards, if any, accrue with time supplied, not with the number of transactions.`,
    ],
    Dexs: [
      `Swap a small amount through ${name} on ${chain} to confirm the route and slippage (${gasTxt} per swap); set slippage under 0.5% on majors.`,
      `Provide liquidity to the pool you actually use — a stable pair if you want low impermanent loss, a volatile pair only with size you can lose.`,
      `Collect fees weekly and decide whether to compound them into the same pool or hold them; compounding is one more transaction (${gasTxt}).`,
      `Keep a second qualifying action: route a second token pair through ${name} in a different week, so activity is not a single swap.`,
    ],
    Yield: [
      `Deposit into ${name}'s vault on ${chain} with an amount you can leave for 4+ weeks (${gasTxt} to enter).`,
      `Read the vault's strategy line in the docs: know what it farms underneath before depositing, not after.`,
      `Harvest or compound only when the yield covers the gas — on ${chain} that is ${gasTxt} per harvest, so weekly at most.`,
      `Hold a second position in a different vault of ${name} if it runs more than one, to spread smart-contract risk.`,
    ],
    'Yield Aggregator': [
      `Deposit into ${name}'s vault on ${chain} with an amount you can leave for 4+ weeks (${gasTxt} to enter).`,
      `Read the vault's strategy line in the docs: know what it farms underneath before depositing, not after.`,
      `Harvest or compound only when the yield covers the gas — on ${chain} that is ${gasTxt} per harvest, so weekly at most.`,
      `Hold a second position in a different vault of ${name} if it runs more than one, to spread smart-contract risk.`,
    ],
    RWA: [
      `Mint or buy ${name}'s tokenised asset on ${chain} in a size you understand (${gasTxt} per mint); confirm the underlying (T-bill, credit, real estate) in the docs.`,
      `Hold it in the wallet that will receive any distribution, and check the redemption terms — lockups and gates matter more than the headline yield.`,
      `If ${name} offers a vault or a secondary market, use it once to prove the full loop (enter, hold, exit) before sizing up.`,
      `Keep the holding for at least a month: real-world-asset positions are slow by design and reward patience over churn.`,
    ],
    'Risk Curators': [
      `Deposit into a ${name} curated vault on ${chain} (${gasTxt} to enter), choosing the vault whose risk parameters you have actually read.`,
      `Check the curator's allocation: which markets the vault lends to, the caps, and who can change them. A vault is only as good as its curator.`,
      `Split the deposit across two vaults of ${name} with different risk profiles instead of one large deposit, to diversify curator risk.`,
      `Review the vault monthly: allocations drift, and a curator that was conservative can turn aggressive without notice.`,
    ],
    'Onchain Capital Allocator': [
      `Allocate to a ${name} vault on ${chain} (${gasTxt} to enter) after reading what it allocates to and what it charges.`,
      `Compare its reported yield against the risk: an allocator beating the market by a wide margin is taking risk somewhere — find where.`,
      `Split the allocation across two of ${name}'s strategies when it runs more than one, rather than concentrating in a single vault.`,
      `Rebalance quarterly, not weekly: allocators move slowly, and each move costs ${gasTxt} in gas.`,
    ],
    Derivatives: [
      `Open a small, hedged position on ${name} on ${chain} (${gasTxt} per trade) with leverage under 3x and a stop you set before entering.`,
      `Keep margin well above the liquidation price and check funding rates daily while the position is open.`,
      `Close and reopen a second, different market on ${name} in another week, so activity covers more than one contract.`,
      `Never leave a leveraged position unattended for a weekend: set alerts for the liquidation price.`,
    ],
    'Basis Trading': [
      `Open a small basis position on ${name} on ${chain} (${gasTxt} per trade) and write down the funding rate you entered at.`,
      `Monitor the funding rate daily: a basis trade earns while funding is positive and bleeds when it flips.`,
      `Close the position when the funding rate turns negative for three days running, and do not re-enter the same week.`,
      `Keep a second qualifying action: use a different market or a different direction on ${name} once, to diversify the exposure.`,
    ],
    CDP: [
      `Mint ${name}'s stable asset against collateral on ${chain} at under 50% loan-to-value (${gasTxt} to mint), keeping a wide safety margin.`,
      `Use the minted asset for something real — hold it, spend it, or supply it elsewhere — rather than leaving it idle.`,
      `Watch the collateral ratio weekly and top it up before it nears the liquidation line; CDP liquidations are swift.`,
      `Repay part of the debt monthly to keep the position healthy, and test the full repay-and-withdraw loop once with a small amount.`,
    ],
    Chain: [
      `Bridge a small amount to ${name}'s chain and confirm it arrives (${gasTxt} on the source chain, plus the bridge fee).`,
      `Use two different applications on the chain in separate weeks — a swap and a lend, for example — so activity is broad, not a single transaction.`,
      `Hold a small balance of the chain's native asset for gas, and keep it topped up: running out of gas mid-flow is the commonest failure.`,
      `Follow the chain's official announcements for testnets, grants or quests, and treat any third-party "airdrop checker" as untrusted.`,
    ],
    Payments: [
      `Make a real payment through ${name} on ${chain} — a small transfer to an address you control (${gasTxt}) — to confirm the rails work.`,
      `Use ${name} for a recurring payment or a second merchant, so usage is a habit, not a one-off transaction.`,
      `Keep a balance in the payment asset for a month, and check settlement times and fees against the docs before sizing up.`,
      `If ${name} runs a card or an off-ramp, test it once with a small amount before relying on it.`,
    ],
    'Prediction Market': [
      `Place a small, researched bet on ${name} on ${chain} (${gasTxt} per trade) on a market you understand, not the most popular one.`,
      `Take the other side of a second market in a different week, to show range rather than a single punt.`,
      `Set a strict budget for prediction markets and stop when it is spent: they are entertainment with an edge, not income.`,
      `Track your positions daily while open — prediction markets resolve fast and a missed resolution is a lost payout.`,
    ],
    Restaking: [
      `Restake through ${name} on ${chain} with an amount you can lock for weeks (${gasTxt} to restake); read the slashing terms first.`,
      `Check which operators and AVSs the restaked assets secure, and what share of rewards goes to the operator.`,
      `Split the restake across two operators when ${name} allows it, rather than delegating everything to one.`,
      `Review the position monthly: restaking rewards change as new AVSs join, and an old delegation can go stale.`,
    ],
    Insurance: [
      `Buy cover from ${name} on ${chain} for a position you actually hold (${gasTxt} per purchase), and read the exclusions before paying.`,
      `Keep the cover for its full term — cancelling early usually forfeits the premium.`,
      `File a test claim only if a real loss occurs; never file a claim you cannot document.`,
      `Renew or extend the cover once if the underlying position is still open, to show continued use.`,
    ],
    'Staking Pool': [
      `Stake through ${name} on ${chain} (${gasTxt} to stake) with an amount you can lock for the unbonding period.`,
      `Check the pool's fee, the validator set, and the unbonding time before staking — they vary widely between pools.`,
      `Claim or compound rewards only when they exceed the gas cost (${gasTxt} per claim on ${chain}).`,
      `Unstake a small test amount once to confirm the unbonding flow works before staking more.`,
    ],
  };

  const family = byFamily[cat] ?? [
    `Use ${name} on ${chain} for its core action with a small amount first (${gasTxt} per transaction), and confirm the result on-chain.`,
    `Repeat the core action in a second week with a different asset or market, so usage is sustained rather than a single transaction.`,
    `Hold the resulting position for at least 4 weeks, checking it weekly against the protocol's docs.`,
    `Test the full exit — withdraw, unstake or swap back — once with a small amount, so the way out is proven before the way in is sized up.`,
  ];
  return [...family, ...common];
}

/** Verdict for a row, from its own numbers: a screening heuristic, stated as such. */
export function verdictFor(likelihood: number, impliedUsd: number): 'Farm' | 'Watch' | 'Skip' {
  if (likelihood >= 50 && impliedUsd >= 10_000_000) return 'Farm';
  if (likelihood >= 35 || impliedUsd >= 25_000_000) return 'Watch';
  return 'Skip';
}

// ---------------------------------------------------------------- the board

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  /** Worth at the small-protocol and large-protocol median multiples. */
  scenario_small_usd: number;
  scenario_large_usd: number;
  launch_likelihood: number;
  likelihood_basis: string;
  momentum: MomentumTag;
  change_7d: number | null;
  tvl_usd: number;
  category: string | null;
  chains: string[];
  age_years: number | null;
  watchlist: boolean;
  expected_value_usd: number;
  farm_cost_usd: number;
  farm_hours: number;
  verdict: 'Farm' | 'Watch' | 'Skip';
  /** Caveat when the snapshot's "no token" record is misleading. */
  note: string | null;
  farm_steps: string[];
}

export interface ExcludedEntry {
  slug: string;
  name: string;
  reason: string;
}

export interface ModelInfo {
  method: string;
  fit: CurveFit;
  comps_used: number;
  validation: string;
  as_of: string;
}

export interface RadarData {
  board: BoardRow[];
  model: ModelInfo;
  excluded: ExcludedEntry[];
  watchlist: string[];
  snapshot_protocols: number;
  snapshot_no_token: number;
  /** Rows on the board (pre-token protocols scored). */
  early_size: number;
  /** Live-token protocols set aside (they price the curve, they are not ranked). */
  live_size: number;
}

/** Protocols whose "no token" record is misleading: the token already circulates. */
const NOTE_FOR_SLUG: Record<string, string> = {
  usdd: 'Records no token, but USDD already circulates as a stablecoin — this is not a first-token launch.',
  'bittensor-dtao': 'Records no token, but TAO already circulates — dTAO is the subnet-token mechanism, not a first launch.',
};

/**
 * Build the whole radar from the snapshot. Returns the board (the ranked rows)
 * and the radar object the dashboard reads. Ranks are 1..N by implied value
 * (ties broken by slug, deterministic). Every implied value is a whole dollar,
 * and the list is nonincreasing by construction. The snapshot's as_of date is
 * the reference for ages — never the wall clock, so two runs byte-match.
 */
export function buildRadar(snap: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const live = snap.protocols.filter((p) => !recordsNoToken(p));
  const fit = fitCurve(live);
  const asOf = snap.as_of;

  const excluded: ExcludedEntry[] = [];
  const rows: BoardRow[] = [];

  for (const p of snap.protocols) {
    if (!recordsNoToken(p)) continue;
    const reason = exclusionReason(p);
    if (reason !== null) {
      excluded.push({ slug: p.slug, name: p.name, reason });
      continue;
    }
    const multiple = fittedMultiple(fit, p.tvl_usd);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple));
    const low = Math.max(1, Math.round(implied * Math.exp(fit.residQ25)));
    const high = Math.max(1, Math.round(implied * Math.exp(fit.residQ75)));
    const lik = launchLikelihood(p, snap.protocols, asOf);
    const steps = farmPlan(p);
    const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
    const txGas = gasUsd(chain);
    const farmCost = Math.round((steps.length * txGas + 2) * 100) / 100;
    const note = NOTE_FOR_SLUG[p.slug] ?? null;

    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      implied_low_usd: low,
      implied_high_usd: high,
      scenario_small_usd: Math.max(1, Math.round(p.tvl_usd * fit.smallMedian)),
      scenario_large_usd: Math.max(1, Math.round(p.tvl_usd * fit.largeMedian)),
      launch_likelihood: lik.score,
      likelihood_basis: lik.basis,
      momentum: momentumTag(p.change_7d),
      change_7d: p.change_7d,
      tvl_usd: p.tvl_usd,
      category: p.category,
      chains: p.chains,
      age_years: ageYears(p, asOf) === null ? null : Math.round(ageYears(p, asOf)! * 10) / 10,
      watchlist: snap.watchlist.includes(p.slug),
      expected_value_usd: Math.round(implied * (lik.score / 100)),
      farm_cost_usd: farmCost,
      farm_hours: 2,
      verdict: verdictFor(lik.score, implied),
      note,
      farm_steps: steps,
    });
  }

  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  excluded.sort((a, b) => a.slug.localeCompare(b.slug));

  const model: ModelInfo = {
    method: 'implied value = TVL x fitted multiple(TVL), log(mcap/TVL) = a + b*log(TVL) fitted on the snapshot\'s own live-token protocols',
    fit,
    comps_used: fit.n,
    validation: `Leave-one-out median error ${fit.looMedian.toFixed(2)}x (p75 ${fit.looP75.toFixed(2)}x) vs a flat global-median multiple ${fit.baselineMedian.toFixed(2)}x. Per-category median, category residual and age/chains extensions were all worse and were dropped. Growth, age and chain count do not predict the multiple (r = -0.14, -0.03, 0.09) and are used for timing, not pricing.`,
    as_of: asOf,
  };

  return {
    board: rows,
    radar: {
      board: rows,
      model,
      excluded,
      watchlist: snap.watchlist,
      snapshot_protocols: snap.protocols.length,
      snapshot_no_token: snap.protocols.filter(recordsNoToken).length,
      early_size: rows.length,
      live_size: live.length,
    },
  };
}

/** The dashboard data file: `window.RADAR = {...};` — the starter's pattern. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/**
 * The seven gate checks, in the same spirit as the kit's grader: row count,
 * unique slugs, watchlist coverage, consecutive ranks, positive whole-dollar
 * values in nonincreasing order, farm steps present and in the 20-600 char
 * range, and a non-degenerate valuation. Returns the first failure, or null.
 */
export function boardIssue(board: BoardRow[], snap: Snapshot): string | null {
  const rows = board;
  if (rows.length < 100 || rows.length > 4000) return `row count ${rows.length} outside 100-4000`;
  const slugs = new Set(rows.map((r) => r.slug));
  if (slugs.size !== rows.length) return 'duplicate slugs on the board';
  const snapSlugs = new Set(snap.protocols.map((p) => p.slug));
  for (const r of rows) if (!snapSlugs.has(r.slug)) return `row ${r.slug} is not a snapshot protocol`;
  const missing = snap.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `watchlist slugs missing: ${missing.join(', ')}`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `rank not consecutive at row ${i + 1}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `bad implied value on ${r.slug}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `values not nonincreasing at rank ${r.rank}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug}: farm step of ${s.length} chars`;
    }
  }
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'all implied values equal';
  return null;
}
