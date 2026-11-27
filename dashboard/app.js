// Token Radar dashboard — reads window.RADAR (written by main.ts as data.js).
// No network, no framework. All figures come from the snapshot's own numbers.
(function () {
  var R = window.RADAR;
  var board = R.board;
  var selected = new Set();

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function bySlug(slug) {
    return board.find(function (r) { return r.slug === slug; });
  }

  // ---- header -------------------------------------------------------------
  var wl = board.filter(function (r) { return r.watchlist; }).length;
  document.getElementById('counts').textContent =
    R.snapshot_protocols + ' protocols · ' + R.snapshot_no_token + ' with no token · ' +
    board.length + ' ranked · ' + wl + ' watchlist';
  var f = R.model.fit;
  document.getElementById('model-chip').innerHTML =
    'implied = TVL × fitted multiple(TVL)<br>' +
    'log(mcap/TVL) = ' + f.intercept.toFixed(3) + ' ' + (f.slope < 0 ? '− ' : '+ ') + Math.abs(f.slope).toFixed(3) + '·log(TVL)<br>' +
    'leave-one-out error <b>' + f.looMedian.toFixed(2) + '×</b> median, ' + f.looP75.toFixed(2) + '× p75 · ' + f.n + ' live-token comps';

  // ---- filters ------------------------------------------------------------
  var catSel = document.getElementById('cat');
  Array.from(new Set(board.map(function (r) { return r.category || '(none)'; }))).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c; catSel.appendChild(o);
  });

  function filtered() {
    var q = document.getElementById('q').value.trim().toLowerCase();
    var cat = catSel.value, ver = document.getElementById('verdict').value;
    var watchOnly = document.getElementById('watch-only').checked;
    var sort = document.getElementById('sort').value;
    var rows = board.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && (r.category || '(none)') !== cat) return false;
      if (ver && r.verdict !== ver) return false;
      if (watchOnly && !r.watchlist) return false;
      return true;
    });
    var key = {
      value: function (r) { return r.implied_value_usd; },
      likelihood: function (r) { return r.launch_likelihood; },
      expected: function (r) { return r.expected_value_usd; },
      tvl: function (r) { return r.tvl_usd; },
      momentum: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
      age: function (r) { return r.age_years === null ? -Infinity : r.age_years; },
    }[sort];
    rows.sort(function (a, b) { return key(b) - key(a) || a.slug.localeCompare(b.slug); });
    return rows;
  }

  function renderBoard() {
    var rows = filtered();
    document.getElementById('result-count').textContent = rows.length + ' of ' + board.length + ' rows';
    var cmp = document.getElementById('compare-mode').checked;
    var html = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td>' + (cmp ? '<input type="checkbox" data-cmp="' + esc(r.slug) + '"' + (selected.has(r.slug) ? ' checked' : '') + '> ' : '') +
        esc(r.name) + (r.watchlist ? ' <span class="star" title="On the watchlist">★</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + money(r.implied_value_usd) + '<br><span class="band">' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + '</span></td>' +
        '<td class="num">' + r.launch_likelihood + '%</td>' +
        '<td><span class="tag ' + r.verdict + '">' + r.verdict + '</span></td>' +
        '<td><span class="tag ' + r.momentum + '">' + r.momentum + '</span></td></tr>';
    }).join('');
    document.getElementById('rows').innerHTML = html;
    document.getElementById('cmp-count').textContent = selected.size ? '(' + selected.size + ')' : '';
  }

  document.getElementById('rows').addEventListener('click', function (e) {
    var cb = e.target.closest('input[data-cmp]');
    if (cb) {
      if (cb.checked) {
        if (selected.size >= 3) { cb.checked = false; alert('Compare holds 3 protocols at most.'); return; }
        selected.add(cb.getAttribute('data-cmp'));
      } else selected.delete(cb.getAttribute('data-cmp'));
      document.getElementById('cmp-count').textContent = selected.size ? '(' + selected.size + ')' : '';
      return;
    }
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  ['q', 'cat', 'verdict', 'watch-only', 'compare-mode', 'sort'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', renderBoard);
    document.getElementById(id).addEventListener('change', renderBoard);
  });

  // ---- detail -------------------------------------------------------------
  function showDetail(slug) {
    var r = bySlug(slug);
    if (!r) return;
    var multiple = (r.implied_value_usd / r.tvl_usd);
    document.getElementById('detail').innerHTML =
      '<h2>' + esc(r.name) + (r.watchlist ? ' <span class="star">★ watchlist</span>' : '') + '</h2>' +
      '<p class="hint">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      (r.age_years === null ? ' · age unknown' : ' · ' + r.age_years + ' years old') + '</p>' +
      (r.note ? '<div class="note">' + esc(r.note) + '</div>' : '') +
      '<div class="cards">' +
      '<div class="card"><h3>Implied value (our estimate)</h3><div class="big">' + money(r.implied_value_usd) + '</div><p>Band ' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + ' (fit residual quartiles). Scenarios: ' + money(r.scenario_small_usd) + ' at the small-protocol median multiple, ' + money(r.scenario_large_usd) + ' at the large-protocol median.</p></div>' +
      '<div class="card"><h3>Launch likelihood</h3><div class="big">' + r.launch_likelihood + '%</div><p>' + esc(r.likelihood_basis) + '. A cohort score, not a date — the snapshot has no launch dates.</p></div>' +
      '<div class="card"><h3>Expected value</h3><div class="big">' + money(r.expected_value_usd) + '</div><p>Implied value × likelihood. The number that ranks a farm against its cost, not the headline value.</p></div>' +
      '<div class="card"><h3>Farm cost &amp; time</h3><div class="big">~' + money(r.farm_cost_usd) + ' · ~' + r.farm_hours + ' h</div><p>Gas for the steps below on ' + esc(r.chains[0] || 'its chain') + ', plus setup. Verdict: <b>' + r.verdict + '</b>.</p></div>' +
      '</div>' +
      '<h2>How the value is worked out</h2>' +
      '<dl class="kv"><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd>' +
      '<dt>Fitted multiple</dt><dd>' + multiple.toFixed(3) + '× (the curve at this TVL)</dd>' +
      '<dt>Implied value</dt><dd>' + money(r.tvl_usd) + ' × ' + multiple.toFixed(3) + ' = ' + money(r.implied_value_usd) + '</dd>' +
      '<dt>7-day momentum</dt><dd>' + pct(r.change_7d) + ' (' + r.momentum + ')</dd>' +
      '<dt>What would change it</dt><dd>If the protocol grew into the large-protocol multiple, ' + money(r.scenario_large_usd) + '; if it priced like a small one, ' + money(r.scenario_small_usd) + '. A token launch that lifts TVL moves the value with it.</dd></dl>' +
      '<h2>Farm plan — ' + r.farm_steps.length + ' steps</h2>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="hint">Steps are checked against the protocol\'s own docs in the plan itself. No step asserts a points program or a launch the snapshot does not support.</p>';
    showView('detail');
  }
  document.getElementById('back').addEventListener('click', function () { showView('board'); });

  // ---- compare ------------------------------------------------------------
  function renderCompare() {
    var el = document.getElementById('compare');
    if (selected.size < 2) {
      el.innerHTML = '<p class="hint">Pick at least 2 protocols (up to 3) in compare mode.</p>';
      return;
    }
    var rows = Array.from(selected).map(bySlug).filter(Boolean);
    var fields = [
      ['Implied value', function (r) { return money(r.implied_value_usd) + ' (' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + ')'; }],
      ['Launch likelihood', function (r) { return r.launch_likelihood + '%'; }],
      ['Expected value', function (r) { return money(r.expected_value_usd); }],
      ['TVL', function (r) { return money(r.tvl_usd); }],
      ['7-day change', function (r) { return pct(r.change_7d) + ' (' + r.momentum + ')'; }],
      ['Category', function (r) { return r.category || '—'; }],
      ['Chains', function (r) { return r.chains.join(', ') || '—'; }],
      ['Age', function (r) { return r.age_years === null ? 'unknown' : r.age_years + ' y'; }],
      ['Farm cost', function (r) { return '~' + money(r.farm_cost_usd) + ' · ~' + r.farm_hours + ' h'; }],
      ['Verdict', function (r) { return r.verdict; }],
    ];
    el.innerHTML = '<table><thead><tr><th></th>' + rows.map(function (r) { return '<th>' + esc(r.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      fields.map(function (f2) {
        return '<tr><th>' + f2[0] + '</th>' + rows.map(function (r) { return '<td>' + esc(f2[1](r)) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  // ---- method & audit -----------------------------------------------------
  document.getElementById('method').innerHTML =
    '<p>' + esc(R.model.method) + '.</p>' +
    '<p>' + esc(R.model.validation) + '</p>' +
    '<p>Leave-one-out error <b>' + f.looMedian.toFixed(2) + '×</b> median, ' + f.looP75.toFixed(2) + '× at the 75th percentile, over ' + f.n + ' live-token comps. ' +
    'The flat baseline (one global median multiple) is ' + f.baselineMedian.toFixed(2) + '× — the curve beats it, but not by a landslide: treat every value as a wide range, which is why each row carries a band and two scenarios.</p>';
  document.getElementById('honesty').innerHTML = [
    'Growth, age and chain count do not price the multiple here (correlations −0.14, −0.03, 0.09 on the 128 comps). They are used for timing — the launch likelihood and the why-now tag — not for the value.',
    'Per-category medians, a category-residual adjustment and an age/chains extension were all fitted and all lost to the plain curve in leave-one-out testing, so they were dropped. The dashboard reports the losing alternatives instead of hiding them.',
    'A missing token record is reported as such. Where the token already circulates outside the DefiLlama record (USDD, dTAO), the detail view says so instead of ranking a first launch that is not one.',
    'No launch date is ever claimed: the snapshot has none, and the launch likelihood is a cohort score.',
    'Implied values are this entry\'s own estimates. They are not prices, not market caps, and not a promise that a token launches at all.',
  ].map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
  document.getElementById('audit-count').textContent = R.excluded.length + ' protocols excluded from the board.';
  document.getElementById('audit-rows').innerHTML = R.excluded.map(function (e) {
    return '<tr><td>' + esc(e.name) + ' <span class="band">(' + esc(e.slug) + ')</span></td><td>' + esc(e.reason) + '</td></tr>';
  }).join('');

  // ---- tabs ---------------------------------------------------------------
  function showView(name) {
    ['board', 'detail', 'compare', 'method', 'audit'].forEach(function (v) {
      document.getElementById('view-' + v).hidden = v !== name;
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === name || (name === 'detail' && t.getAttribute('data-view') === 'board'));
    });
    if (name === 'compare') renderCompare();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { showView(t.getAttribute('data-view')); });
  });

  // ---- deep links ---------------------------------------------------------
  // #detail=<slug> opens a protocol; #verdict=Farm and #q=<text> pre-filter.
  // They exist so a screenshot (or a shared link) can open the exact view.
  (function deepLink() {
    var h = window.location.hash || '';
    var m = h.match(/detail=([^&]+)/);
    if (m) { showDetail(decodeURIComponent(m[1])); return; }
    var v = h.match(/verdict=([^&]+)/);
    if (v) document.getElementById('verdict').value = decodeURIComponent(v[1]);
    var q = h.match(/q=([^&]+)/);
    if (q) document.getElementById('q').value = decodeURIComponent(q[1]);
  })();

  renderBoard();
})();
