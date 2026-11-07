// The Chase 300: card parsing, team ratings and the 120-ball chase engine.
// Plain script: defines globals in the browser, module.exports in Node.
const TARGET = 301;
const NO_CAPTAIN = 35; // captaincy used when the XI has no captain

// Raw ratings (0-100) live in squads.json. Displayed ratings are lifted toward 99.
const lift = (v) => Math.round(v + (99 - v) * 0.4);

function parseData(json) {
  const eds = json.editions;
  return json.squads.map((s, id) => {
    const ed = eds[s.year] || {};
    return {
      id, year: s.year, team: s.team, champ: ed.champ === s.team,
      players: s.players.map((p) => {
        const [lo, hi] = String(p.slots).split("-").map(Number);
        return {
          name: p.name, lo, hi: hi || lo, year: s.year, team: s.team,
          rb: p.bat, rp: p.pow, rw: p.bwl,
          bat: lift(p.bat), pow: lift(p.pow), bwl: lift(p.bwl),
          k: !!p.keeper, c: p.captaincy != null, cap: p.captaincy ?? null,
          pott: ed.pott === p.name,
        };
      }),
    };
  });
}

function teamRatings(xi) {
  const pl = xi.filter(Boolean);
  const top = xi.slice(0, 6).filter(Boolean);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const best = (f, n) => avg(pl.map(f).sort((a, b) => b - a).slice(0, n));
  // Any number of captains can be drafted; the one with the best (hidden) captaincy leads.
  const captain = pl.filter((p) => p.c).sort((x, y) => y.cap - x.cap)[0] || null;
  const R = {
    anc: avg(top.map((p) => p.bat)), ra: avg(top.map((p) => p.rb)),
    pow: best((p) => p.pow, 8), rp: best((p) => p.rp, 8),
    bwl: best((p) => p.bwl, 4), rw: best((p) => p.rw, 4),
    hasK: pl.some((p) => p.k), hasC: !!captain, captain,
    cap: captain ? captain.cap : NO_CAPTAIN,
  };
  R.ovr = 0.33 * R.anc + 0.42 * R.pow + 0.25 * R.bwl - (R.hasK ? 0 : 2) - (R.hasC ? 0 : 2);
  return R;
}

function simulateChase(xi, rng = Math.random) {
  const R = teamRatings(xi);
  const moraleW = 1 - (R.rw - 80) / 110;
  const moraleR = 1 + (R.rw - 80) / 170;
  const keepW = R.hasK ? 1 : 1.06, keepR = R.hasK ? 1 : 0.985;
  // Captaincy: after a wicket, the side is wobbly for two overs. A calm captain keeps that small.
  const wobble = 1.25 * (1 - R.cap / 100);
  const bat = xi.map((p, i) => ({ p, slot: i + 1, r: 0, b: 0, f: 0, s: 0, out: null, in: i < 2 }));
  let striker = 0, non = 1, next = 2, runs = 0, wk = 0, legal = 0, extras = 0;
  const events = [], overs = [], fow = [], wkBalls = [];
  let overRuns = 0;
  while (legal < 120 && wk < 10 && runs < TARGET) {
    const over = Math.floor(legal / 6);
    const reqRR = (TARGET - runs) / ((120 - legal) / 6);
    const aggr = Math.max(0, Math.min(1.7, (reqRR - 10.5) / 7));
    const pp = over < 6, death = over >= 15;
    if (rng() < 0.035) {
      runs += 1; extras += 1; overRuns += 1;
      events.push({ t: "wd", over, ball: legal % 6, runs, wk, who: bat[striker].p.name });
      continue;
    }
    const s = bat[striker];
    const k = s.p.rp / 100;
    const settling = s.b < 4;
    // collapse pressure: each wicket in the last 12 balls adds wobble, fading as the over count moves on
    let pressure = 0;
    for (const wb of wkBalls) { const since = legal - wb; if (since < 12) pressure += (12 - since) / 12; }
    const collapse = 1 + wobble * Math.min(pressure, 2);
    let w = 0.056 * (1.45 - s.p.rb / 100);
    w *= (1 + 0.5 * aggr) * moraleW * keepW * collapse * (pp ? 0.9 : death ? 1.12 : 1) * (settling ? 1.2 : 1);
    let p6 = (0.01 + 0.19 * Math.pow(k, 2.9)) * (1 + 0.32 * aggr) * (death ? 1.22 : pp ? 0.95 : 1) * moraleR * keepR * (settling ? 0.65 : 1);
    let p4 = (0.045 + 0.12 * k) * (1 + 0.15 * aggr) * (pp ? 1.25 : 1) * moraleR * keepR;
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
    legal++; s.b++;
    if (wicket) {
      const m = rng();
      const how = m < 0.6 ? "c" : m < 0.75 ? "b" : m < 0.87 ? "lbw" : m < 0.95 ? "ro" : "st";
      const inCollapse = wkBalls.some((wb) => legal - wb <= 12);
      s.out = how; wk++; wkBalls.push(legal);
      fow.push({ wk, runs, ball: legal, name: s.p.name });
      events.push({ t: "W", how, over, ball: (legal - 1) % 6, runs, wk, who: s.p.name, r: s.r, bb: s.b, collapse: inCollapse });
      if (wk < 10) { striker = next; bat[next].in = true; next++; }
    } else {
      runs += out; s.r += out; overRuns += out;
      if (out === 4) s.f++; if (out === 6) s.s++;
      events.push({ t: out, over, ball: (legal - 1) % 6, runs, wk, who: s.p.name, r: s.r, bb: s.b });
      if (out % 2 === 1) [striker, non] = [non, striker];
    }
    if (legal % 6 === 0) { overs.push({ over: legal / 6, runs, wk, made: overRuns }); overRuns = 0; [striker, non] = [non, striker]; }
  }
  if (legal % 6 !== 0) overs.push({ over: legal / 6, runs, wk, made: overRuns });
  return { R, runs, wk, legal, extras, bat, events, overs, fow, won: runs >= TARGET };
}

if (typeof module !== "undefined") module.exports = { TARGET, parseData, teamRatings, simulateChase, lift };
