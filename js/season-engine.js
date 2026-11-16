// Perfect Season: full T20 match simulation (both innings, real bowlers) and an IPL-style season.
// Plain script: globals in the browser, module.exports in Node. Uses player cards from engine.js parseData().

const LINEAGE = {
  "Royal Challengers Bangalore": "RCB", "Royal Challengers Bengaluru": "RCB", "Delhi Daredevils": "DC", "Delhi Capitals": "DC",
  "Kings XI Punjab": "PBKS", "Punjab Kings": "PBKS", "Deccan Chargers": "DCH", "Sunrisers Hyderabad": "SRH",
  "Rising Pune Supergiants": "RPS", "Rising Pune Supergiant": "RPS", "Chennai Super Kings": "CSK", "Mumbai Indians": "MI",
  "Kolkata Knight Riders": "KKR", "Rajasthan Royals": "RR", "Gujarat Titans": "GT", "Gujarat Lions": "GL",
  "Lucknow Super Giants": "LSG", "Kochi Tuskers Kerala": "KTK", "Pune Warriors India": "PWI",
};
// franchises that changed names share a key; national teams are their own key
const lineage = (team) => LINEAGE[team] || team;

// Best available XI from a real squad, respecting each player's batting slots. `exclude` = names already in the user's XI.
function buildXI(squad, exclude) {
  const pool = squad.players.filter((p) => !exclude || !exclude.has(p.name));
  const xi = Array(11).fill(null), used = new Set();
  const bat = (p) => p.rb * 0.55 + p.rp * 0.45, bowl = (p) => p.rw;
  // bowlers first into the tail (8-11), then batters top-down, then fill gaps with whoever is left
  for (let s = 11; s >= 8; s--) {
    const c = pool.filter((p) => !used.has(p) && p.lo <= s && p.hi >= s).sort((a, b) => bowl(b) - bowl(a))[0];
    if (c) { xi[s - 1] = c; used.add(c); }
  }
  for (let s = 1; s <= 7; s++) {
    const c = pool.filter((p) => !used.has(p) && p.lo <= s && p.hi >= s)
      .sort((a, b) => (bat(b) + (s >= 5 ? bowl(b) * 0.25 : 0)) - (bat(a) + (s >= 5 ? bowl(a) * 0.25 : 0)))[0];
    if (c) { xi[s - 1] = c; used.add(c); }
  }
  // gaps: anyone left in the pool, then (rarely) squad members the user also drafted, so every side fields eleven
  for (const src of [pool, squad.players]) for (let s = 0; s < 11; s++) if (!xi[s]) {
    const c = src.filter((p) => !used.has(p)).sort((a, b) => (s < 7 ? bat(b) - bat(a) : bowl(b) - bowl(a)))[0];
    if (c) { xi[s] = c; used.add(c); }
  }
  return xi;
}

// Five bowlers, four overs each. Best two share the powerplay start and the death.
const OVER_PATTERN = [0, 1, 0, 1, 2, 3, 4, 2, 4, 3, 4, 2, 3, 4, 2, 3, 0, 1, 0, 1];
function bowlingAttack(xi) {
  return xi.map((p, i) => ({ p, i })).sort((a, b) => b.p.rw - a.p.rw || b.i - a.i).slice(0, 5).map((x) => x.i);
}

function teamInfo(xi) {
  const caps = xi.filter((p) => p.c).sort((a, b) => b.cap - a.cap);
  return { cap: caps[0] ? caps[0].cap : 35, captain: caps[0] || null, hasK: xi.some((p) => p.k), attack: bowlingAttack(xi) };
}

// One innings. target = runs needed to win (null when batting first).
function simInnings(batXI, bowlXI, target, rng) {
  const B = teamInfo(batXI), F = teamInfo(bowlXI);
  const wobble = 1.25 * (1 - B.cap / 100);
  const keepW = F.hasK ? 1 : 0.94, keepR = F.hasK ? 1 : 1.015;
  const bat = batXI.map((p) => ({ p, r: 0, b: 0, f: 0, s: 0, out: false, in: false }));
  const bowl = new Map(F.attack.map((i) => [i, { p: bowlXI[i], balls: 0, r: 0, w: 0 }]));
  let striker = 0, non = 1, next = 2, runs = 0, wk = 0, legal = 0;
  bat[0].in = bat[1].in = true;
  const wkBalls = [];
  while (legal < 120 && wk < 10 && (target == null || runs < target)) {
    const over = Math.floor(legal / 6);
    const bw = bowl.get(F.attack[OVER_PATTERN[over]]);
    const q = Math.max(50, bw.p.rw), bf = (q - 78) / 100;
    const wMult = 1 + 1.15 * bf, rMult = 1 - 0.6 * bf;
    const pp = over < 6, death = over >= 15;
    let aggr;
    if (target == null) { aggr = over >= 18 ? 1.0 : death ? 0.7 : pp ? 0.35 : 0.22; if (wk >= 7) aggr *= 0.5; }
    else { const req = (target - runs) / ((120 - legal) / 6); aggr = Math.max(0.1, Math.min(1.7, (req - 7.2) / 6.5)); }
    if (rng() < 0.035) { runs++; bw.r++; continue; } // wide
    const s = bat[striker], k = s.p.rp / 100, settling = s.b < 4;
    let pressure = 0;
    for (const wb of wkBalls) { const since = legal - wb; if (since < 12) pressure += (12 - since) / 12; }
    const collapse = 1 + wobble * Math.min(pressure, 1.4);
    let w = 0.043 * (1.45 - s.p.rb / 100) * (1 + 0.5 * aggr) * wMult * keepW * collapse * (pp ? 0.9 : death ? 1.12 : 1) * (settling ? 1.2 : 1);
    let p6 = (0.009 + 0.165 * Math.pow(k, 2.9)) * (1 + 0.32 * aggr) * (death ? 1.22 : pp ? 0.95 : 1) * rMult * keepR * (settling ? 0.65 : 1);
    let p4 = (0.042 + 0.112 * k) * (1 + 0.15 * aggr) * (pp ? 1.25 : 1) * rMult * keepR;
    const p3 = 0.007, p2 = 0.06;
    let p1 = Math.max(0.14, 0.3 - 0.08 * aggr);
    if (1 - (w + p6 + p4 + p3 + p2 + p1) < 0.08) { const sc = (1 - 0.08 - w) / (p6 + p4 + p3 + p2 + p1); p6 *= sc; p4 *= sc; p1 *= sc; }
    const r = rng();
    let out = 0, wicket = false, acc = w;
    if (r < acc) wicket = true;
    else if (r < (acc += p6)) out = 6;
    else if (r < (acc += p4)) out = 4;
    else if (r < (acc += p3)) out = 3;
    else if (r < (acc += p2)) out = 2;
    else if (r < (acc += p1)) out = 1;
    legal++; s.b++; bw.balls++;
    if (wicket) {
      s.out = true; wk++; wkBalls.push(legal);
      if (rng() > 0.08) bw.w++; // the rest are run-outs
      if (wk < 10) { striker = next; bat[next].in = true; next++; }
    } else {
      runs += out; s.r += out; bw.r += out;
      if (out === 4) s.f++; if (out === 6) s.s++;
      if (out % 2 === 1) [striker, non] = [non, striker];
    }
    if (legal % 6 === 0) [striker, non] = [non, striker];
  }
  return { runs, wk, legal, bat: bat.filter((b) => b.in), bowl: [...bowl.values()].filter((b) => b.balls > 0) };
}

const oversOf = (balls) => Math.floor(balls / 6) + "." + (balls % 6);

// A full match between two team objects {id, name, xi}. Returns scores, result text and both scorecards.
function simMatch(A, Bt, rng = Math.random) {
  const aFirst = rng() < 0.5;
  const first = aFirst ? A : Bt, second = aFirst ? Bt : A;
  const i1 = simInnings(first.xi, second.xi, null, rng);
  const i2 = simInnings(second.xi, first.xi, i1.runs + 1, rng);
  let winner, margin;
  if (i2.runs > i1.runs) { winner = second; margin = `by ${10 - i2.wk} wicket${10 - i2.wk === 1 ? "" : "s"}`; }
  else if (i2.runs < i1.runs) { winner = first; margin = `by ${i1.runs - i2.runs} run${i1.runs - i2.runs === 1 ? "" : "s"}`; }
  else { winner = rng() < 0.5 ? first : second; margin = "in a Super Over"; }
  const loser = winner === first ? second : first;
  // player of the match: best single contribution on the winning side
  const wBat = winner === first ? i1.bat : i2.bat, wBowl = winner === first ? i2.bowl : i1.bowl;
  let pom = null, best = -1;
  wBat.forEach((b) => { const v = b.r + (b.b ? Math.max(0, (b.r / b.b - 1.3) * 20) : 0); if (v > best) { best = v; pom = { name: b.p.name, text: `${b.r}${b.out ? "" : "*"} (${b.b})` }; } });
  wBowl.forEach((b) => { const v = b.w * 24 + Math.max(0, (9 - (b.r / b.balls) * 6) * 3); if (v > best) { best = v; pom = { name: b.p.name, text: `${b.w}/${b.r}` }; } });
  return { first, second, i1, i2, winner, loser, margin, pom };
}

/* ---------- season ---------- */
// teams: array of 10 {id, name, short, xi, user?}. Builds the 70-match league: everyone once (45) + 5 repeat fixtures each (25).
// format "ipl": everyone once (45) + 5 repeat fixtures each (25) = 70. format "wc": everyone once = 45.
function makeSchedule(n, rng = Math.random, format = "ipl") {
  const fx = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) fx.push([i, j]);
  const seen = new Set();
  const add = (i, j) => { const a = Math.min(i, j), b = Math.max(i, j), k = a + "-" + b; if (a !== b && !seen.has(k)) { seen.add(k); fx.push([a, b]); } };
  if (format === "ipl") for (let i = 0; i < n; i++) { add(i, (i + 1) % n); add(i, (i + 2) % n); add(i, (i + n / 2) % n); }
  for (let i = fx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [fx[i], fx[j]] = [fx[j], fx[i]]; }
  return fx;
}

function newSeason(teams, rng = Math.random, format = "ipl") {
  // shuffle team order so the repeat fixtures differ every season
  const order = teams.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const table = new Map(order.map((t) => [t.id, { team: t, p: 0, w: 0, l: 0, pts: 0, rf: 0, bf: 0, ra: 0, bb: 0 }]));
  return {
    teams: order, table, stats: new Map(), results: [], format,
    fixtures: makeSchedule(order.length, rng, format).map(([a, b], i) => ({ n: i + 1, a: order[a], b: order[b], done: false })),
    stage: "league", playoffs: [], champion: null,
  };
}

function statFor(S, team, p) {
  const key = team.id + "|" + p.name;
  let s = S.stats.get(key);
  if (!s) { s = { team, p, m: 0, inns: 0, runs: 0, balls: 0, no: 0, hs: 0, hsNo: false, f: 0, s: 0, fifty: 0, hundred: 0, bb: 0, br: 0, w: 0, bestW: -1, bestR: 0, pom: 0 }; S.stats.set(key, s); }
  return s;
}

function record(S, M, countTable) {
  const sides = [[M.first, M.i1, M.i2], [M.second, M.i2, M.i1]];
  for (const [team, batI, bowlI] of sides) {
    team.xi.forEach((p) => statFor(S, team, p).m++);
    batI.bat.forEach((b) => {
      const s = statFor(S, team, b.p);
      s.inns++; s.runs += b.r; s.balls += b.b; s.f += b.f; s.s += b.s; if (!b.out) s.no++;
      if (b.r > s.hs || (b.r === s.hs && !b.out)) { s.hs = b.r; s.hsNo = !b.out; }
      if (b.r >= 100) s.hundred++; else if (b.r >= 50) s.fifty++;
    });
    bowlI.bowl.forEach((b) => {
      const s = statFor(S, team, b.p);
      s.bb += b.balls; s.br += b.r; s.w += b.w;
      if (b.w > s.bestW || (b.w === s.bestW && b.r < s.bestR)) { s.bestW = b.w; s.bestR = b.r; }
    });
    if (countTable) {
      const t = S.table.get(team.id), opp = batI === M.i1 ? M.i2 : M.i1;
      t.p++; t.rf += batI.runs; t.bf += batI.wk === 10 ? 120 : batI.legal; t.ra += opp.runs; t.bb += opp.wk === 10 ? 120 : opp.legal;
      if (M.winner === team) { t.w++; t.pts += 2; } else t.l++;
    }
  }
  if (M.pom) { const side = M.winner; const pl = side.xi.find((p) => p.name === M.pom.name); if (pl) statFor(S, side, pl).pom++; }
}

const nrr = (t) => (t.bf && t.bb ? (t.rf / t.bf) * 6 - (t.ra / t.bb) * 6 : 0);
function standings(S) {
  return [...S.table.values()].sort((x, y) => y.pts - x.pts || nrr(y) - nrr(x) || y.w - x.w);
}

// Plays league fixtures in order up to and including the user's next match (or all of them). Returns the user's match, if any.
function playLeague(S, userId, all, rng = Math.random) {
  let mine = null;
  for (const f of S.fixtures) {
    if (f.done) continue;
    const M = simMatch(f.a, f.b, rng);
    f.done = true; f.result = M; record(S, M, true);
    const isMine = f.a.id === userId || f.b.id === userId;
    if (isMine) { mine = f; S.results.push({ label: "Match " + (S.results.length + 1), M }); if (!all) break; }
  }
  // once the user's league programme is over, play out everyone else's remaining fixtures
  if (!S.fixtures.some((f) => !f.done && (f.a.id === userId || f.b.id === userId))) {
    for (const f of S.fixtures) if (!f.done) { const M = simMatch(f.a, f.b, rng); f.done = true; f.result = M; record(S, M, true); }
  }
  if (S.fixtures.every((f) => f.done) && S.stage === "league") {
    const top = standings(S).slice(0, 4).map((t) => t.team);
    S.stage = "playoffs"; S.top4 = top;
    // win/lose: where the winner and loser go next, as [game key, side]. A loser with nowhere to go is out.
    S.playoffs = S.format === "ipl" ? [
      { key: "Q1", name: "Qualifier 1", a: top[0], b: top[1], win: ["F", "a"], lose: ["Q2", "a"] },
      { key: "EL", name: "Eliminator", a: top[2], b: top[3], win: ["Q2", "b"] },
      { key: "Q2", name: "Qualifier 2", a: null, b: null, win: ["F", "b"] },
      { key: "F", name: "Final", a: null, b: null },
    ] : [
      { key: "SF1", name: "Semi-final 1", a: top[0], b: top[3], win: ["F", "a"] },
      { key: "SF2", name: "Semi-final 2", a: top[1], b: top[2], win: ["F", "b"] },
      { key: "F", name: "Final", a: null, b: null },
    ];
  }
  return mine;
}

// Plays playoff games up to and including the user's next one (or to the end). Returns the user's game, if any.
function playPlayoffs(S, userId, all, rng = Math.random) {
  let mine = null;
  for (const g of S.playoffs) {
    if (g.done) continue;
    if (!g.a || !g.b) continue;
    const M = simMatch(g.a, g.b, rng);
    g.done = true; g.result = M; record(S, M, false);
    const game = (k) => S.playoffs.find((x) => x.key === k);
    if (g.win) game(g.win[0])[g.win[1]] = M.winner;
    if (g.lose) game(g.lose[0])[g.lose[1]] = M.loser;
    if (g.key === "F") { S.champion = M.winner; S.runnerUp = M.loser; S.stage = "done"; }
    if (g.a.id === userId || g.b.id === userId) { mine = g; S.results.push({ label: g.name, M }); if (!all) break; }
    // user knocked out or not involved: carry on to the end automatically
  }
  if (S.playoffs.every((g) => g.done)) S.stage = "done";
  return mine;
}

if (typeof module !== "undefined") module.exports = { LINEAGE, buildXI, bowlingAttack, simInnings, simMatch, newSeason, playLeague, playPlayoffs, standings, nrr, lineage, oversOf, statFor };
