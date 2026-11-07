// The Chase 300: draft, chase replay, scorecard and optional online honours board.
(async () => {
const REROLLS = 3;
const CFG = window.CHASE300_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- load squads (fetched at runtime so the data can be edited without touching code) ---------- */
let RAW = window.SQUAD_DATA;
if (!RAW) {
  try {
    const res = await fetch("data/squads.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    RAW = await res.json();
  } catch (e) {
    $("play").innerHTML = `<div class="empty-state">Couldn't load the squads file (data/squads.json). If you opened index.html straight from your disk, run a local server instead: <code>python3 -m http.server</code></div>`;
    return;
  }
}
const EDITIONS = RAW.editions;
const SQ = parseData(RAW);
const key = (p) => p.year + "|" + p.team + "|" + p.name;
const ALL = new Map(SQ.flatMap((s) => s.players.map((p) => [key(p), p])));

const fresh = () => ({ xi: Array(11).fill(null), rerolls: REROLLS, squad: null, stage: "spin", lastSlot: null });
let st = fresh();
let best = null, lastRes = null;
try { best = JSON.parse(localStorage.getItem("chase300-best") || "null"); } catch (e) {}

const tier = (v) => (v >= 95 ? "t95" : v >= 90 ? "t90" : v >= 85 ? "t85" : v >= 80 ? "t80" : "t0");
const roleOf = (s) => (s <= 2 ? "Opener" : s <= 4 ? "Top order" : s <= 7 ? "Middle / finisher" : "Tail");
const picked = () => st.xi.filter(Boolean).length;
const leader = () => teamRatings(st.xi).captain;
// lead: the captain leading this XI. Other drafted captains get a dimmed tag.
const tags = (p, lead) => (p.k ? '<span class="tag k">WK</span>' : "") +
  (p.c ? (lead === undefined || lead === p ? '<span class="tag c">C</span>' : '<span class="tag c off" title="Captained his side, but not leading this XI">C</span>') : "");

/* ---------- line-up ---------- */
function renderLineup() {
  const lead = leader();
  $("lineup").innerHTML = st.xi.map((p, i) => {
    const s = i + 1;
    const cls = (p ? "filled" : "empty") + (s === 7 ? " cut" : "") + (st.lastSlot === s ? " new" : "") + (p && p.pott ? " pott" : "");
    if (!p) return `<li class="${cls}"><span class="slotn">${s}</span><span class="lname"><span class="n">${roleOf(s)}</span></span><span></span></li>`;
    return `<li class="${cls}"><span class="slotn">${s}</span><span class="lname"><span class="n">${p.pott ? '<span class="star" title="Player of the Tournament">★</span>' : ""}${esc(p.name)}${tags(p, lead)}</span><span class="m">${esc(p.team)} ${p.year}</span></span>
      <span class="mini num"><span class="${tier(p.bat)}" title="BAT">${p.bat}</span><span class="${tier(p.pow)}" title="POW">${p.pow}</span><span class="${tier(p.bwl)}" title="BWL">${p.bwl}</span></span></li>`;
  }).join("");
  $("picked").textContent = picked() + " / 11 picked";
  const R = teamRatings(st.xi), any = picked() > 0;
  const set = (id, v) => { $("r-" + id).textContent = any ? v.toFixed(0) : "–"; $("b-" + id).style.width = any ? Math.min(100, v) + "%" : "0"; };
  set("anc", R.anc); set("pow", R.pow); set("bwl", R.bwl);
  $("r-ovr").textContent = picked() === 11 ? R.ovr.toFixed(1) : any ? "…" : "–";
  $("ck-k").className = R.hasK ? "ok" : "no"; $("ck-k").textContent = (R.hasK ? "✓" : "✕") + " Keeper";
  $("ck-c").className = R.hasC ? "ok" : "no"; $("ck-c").textContent = (R.hasC ? "✓" : "✕") + " Captain";
  const nCaps = st.xi.filter((p) => p && p.c).length;
  $("capline").textContent = R.captain ? (nCaps > 1 ? `${R.captain.name} leads: the best captaincy of your ${nCaps} captains. Ratings stay hidden.` : `${R.captain.name} leads the side. Captaincy rating is hidden.`) : "No captain yet. Draft as many as you like; the best one leads.";
  $("best").textContent = best ? `Your best: ${best.runs}/${best.wk}${best.won ? " (chased)" : ""}.` : "";
}

/* ---------- draft ---------- */
function openSlots(p) { const o = []; for (let s = p.lo; s <= p.hi; s++) if (!st.xi[s - 1]) o.push(s); return o; }
const usedNames = () => new Set(st.xi.filter(Boolean).map((p) => p.name));
function blockReason(p, used) {
  if (used.has(p.name)) return "Already in your XI";
  if (!openSlots(p).length) return "No open slot";
  return "";
}
const eligible = (sq) => { const u = usedNames(); return sq.players.some((p) => !blockReason(p, u)); };
const reelHTML = (sq) => `<span class="yr">${sq.year}</span><span>${esc(sq.team.toUpperCase())}</span>`;

function renderPlay() {
  const el = $("play");
  if (st.stage === "ready") {
    const R = teamRatings(st.xi);
    el.innerHTML = `<div class="ph"><h2>XI locked in</h2><span class="lbl">Team rating ${R.ovr.toFixed(1)}</span></div>
      <p class="note">Anchor ${R.anc.toFixed(0)} · Power ${R.pow.toFixed(0)} · Bowling ${R.bwl.toFixed(0)}${R.hasK ? "" : " · no keeper"} · ${R.captain ? "Captain " + esc(R.captain.name) : "no captain"}</p>
      <p>Your openers walk out needing 301 off 120 balls. That is 15.05 an over from the first ball.</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="go">Start the chase</button><button class="btn ghost sm" id="instant">Skip to result</button></div>`;
    $("go").onclick = () => startChase(false);
    $("instant").onclick = () => startChase(true);
    return;
  }
  const sq = st.squad;
  let h = `<div class="ph"><h2>${picked() ? "Pick " + (picked() + 1) + " of 11" : "Spin the wheel"}</h2>
    <span class="lbl">${st.rerolls} re-roll${st.rerolls === 1 ? "" : "s"} left</span></div>
    <div class="wheel"><div class="reel ${sq ? "" : "idle"}" id="reel">${sq ? reelHTML(sq) : "— — — —"}</div>
    <div class="row">${st.stage === "pick"
      ? `<button class="btn ghost" id="reroll" ${st.rerolls ? "" : "disabled"}>Re-roll</button>`
      : `<button class="btn" id="spin" ${st.stage === "spinning" ? "disabled" : ""}>Spin</button>`}</div></div>`;
  if (st.stage === "pick" && sq) {
    const used = usedNames();
    h += `<div class="squadhead"><h3>${esc(sq.team)} ${sq.year}${sq.champ ? '<span class="tag ch">Champions</span>' : ""}</h3><span class="note">T20 World Cup in ${esc(EDITIONS[sq.year].host)}</span></div>`;
    if (!eligible(sq)) {
      h += `<div class="empty-state">Nobody in this squad fits your open slots.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn sm" id="freespin">Free spin</button></div></div>`;
    } else {
      const ps = sq.players.slice().sort((a, b) => !blockReason(b, used) - !blockReason(a, used) || b.pott - a.pott);
      h += `<div class="cards">` + ps.map((p) => {
        const why = blockReason(p, used), sl = openSlots(p);
        const range = p.lo === p.hi ? p.lo : p.lo + "–" + p.hi;
        return `<div class="pc ${why ? "dis" : ""} ${p.pott ? "pott" : ""}">
          ${p.pott ? `<div class="gold">Player of the Tournament</div>` : ""}
          <div class="n">${esc(p.name)}${tags(p)}</div>
          <div class="meta">Bats ${range}</div>
          <div class="stats num">
            <div><small>BAT</small><b class="${tier(p.bat)}">${p.bat}</b></div>
            <div><small>POW</small><b class="${tier(p.pow)}">${p.pow}</b></div>
            <div><small>BWL</small><b class="${tier(p.bwl)}">${p.bwl}</b></div>
          </div>
          ${why ? `<div class="why">${why}</div>`
            : `<div class="slots"><span>Bat at</span>${sl.map((s) => `<button data-p="${esc(key(p))}" data-s="${s}" aria-label="Put ${esc(p.name)} at number ${s}">${s}</button>`).join("")}</div>`}
        </div>`;
      }).join("") + `</div>`;
    }
  } else if (!sq) {
    h += `<div class="empty-state">Eleven spins, eleven picks, no undos.<br>Openers, a keeper and a captain go fast, so grab them when you see them.</div>`;
  }
  el.innerHTML = h;
  $("spin") && ($("spin").onclick = () => spin(false));
  $("reroll") && ($("reroll").onclick = () => { st.rerolls--; spin(true); });
  $("freespin") && ($("freespin").onclick = () => spin(true));
  el.querySelectorAll(".slots button").forEach((b) => (b.onclick = () => place(ALL.get(b.dataset.p), +b.dataset.s)));
}

function spin(fast) {
  st.stage = "spinning"; renderPlay();
  const final = SQ[Math.floor(Math.random() * SQ.length)];
  const reel = $("reel"); reel.classList.remove("idle");
  let n = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : fast ? 8 : 16, d = 40;
  const tick = () => {
    if (n-- > 0) { reel.innerHTML = reelHTML(SQ[Math.floor(Math.random() * SQ.length)]); d *= 1.13; setTimeout(tick, d); }
    else { st.squad = final; st.stage = "pick"; renderPlay(); }
  };
  tick();
}

function place(p, s) {
  if (!p || st.xi[s - 1] || blockReason(p, usedNames())) return;
  st.xi[s - 1] = p; st.lastSlot = s; st.squad = null;
  st.stage = picked() === 11 ? "ready" : "spin";
  renderLineup(); renderPlay();
  if (st.stage === "spin") spin(false);
}

/* ---------- chase ---------- */
let timer = null, speed = 220;
const HOW = { c: "caught", b: "bowled", lbw: "lbw", ro: "run out", st: "stumped" };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function startChase(instant) {
  clearTimeout(timer);
  const res = simulateChase(st.xi);
  st.stage = "chase";
  const el = $("play");
  el.innerHTML = `<div class="ph"><h2>The chase</h2><div class="speed" role="group" aria-label="Speed">
      <button data-v="450">Slow</button><button data-v="220" aria-pressed="true">Normal</button><button data-v="45">Fast</button><button data-v="0">Skip</button></div></div>
    <div class="score num">
      <div><div class="lbl">Score</div><div class="v" id="c-score">0/0</div></div>
      <div><div class="lbl">Overs</div><div class="v w" id="c-ov">0.0</div></div>
      <div><div class="lbl">Need</div><div class="v w" id="c-need">301</div></div>
      <div><div class="lbl">Req. rate</div><div class="v w" id="c-rr">15.05</div></div>
    </div>
    <div class="ticker" id="c-tick" aria-label="This over"></div>
    <div class="chasegrid">
      <div><div class="lbl">At the crease</div><div class="crease num" id="c-crease"></div>
        <div class="worm" style="margin-top:14px"><div class="lbl">Runs by over</div><svg viewBox="0 0 320 170" id="c-worm" role="img" aria-label="Runs against the required rate"></svg></div></div>
      <div><div class="lbl">Commentary</div><ul class="feed" id="c-feed"></ul></div>
    </div>
    <div id="c-result"></div>`;
  el.querySelectorAll(".speed button").forEach((b) => (b.onclick = () => {
    speed = +b.dataset.v;
    el.querySelectorAll(".speed button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  speed = instant ? 0 : 220;
  replay(res);
}

function line(e, capName) {
  const n = esc(e.who);
  if (e.t === "wd") return ["", "Wide. One more to the total."];
  if (e.t === "W") {
    let t = `<b>OUT!</b> ${n} ${HOW[e.how]} for ${e.r} off ${e.bb}. ${e.wk} down.`;
    if (e.collapse && e.wk < 10) t += capName ? ` Two in quick time. ${esc(capName)} needs to steady this.` : " Two in quick time and nobody to settle the dressing room.";
    return ["eW", t];
  }
  if (e.t === 6) return ["e6", pick([`${n} launches it into the second tier. SIX.`, `Six! ${n} clears long-on without breaking a sweat.`, `${n} picks the length early and deposits it over midwicket. Six.`, `That's gone miles. ${n}, six.`])];
  if (e.t === 4) return ["e4", pick([`${n} drives through cover, four.`, `Four. ${n} pulls it in front of square.`, `Edged, but it flies past slip for four.`, `${n} finds the gap at point. Four.`])];
  if (e.t === 0) return ["", pick(["Dot ball. The rate climbs.", "Beaten outside off.", "Straight to the fielder, no run.", "Good yorker, dug out."])];
  if (e.t === 1) return ["", `${n} works it away for one.`];
  return ["", `${n} pushes hard for ${e.t}.`];
}

function replay(res) {
  const ev = res.events, bat = res.bat, feed = $("c-feed");
  const capName = res.R.captain ? res.R.captain.name : null;
  const stats = new Map(bat.map((b) => [b.p.name, { r: 0, b: 0 }]));
  let i = 0, legal = 0, curOver = [], nextIn = 2, atCrease = [bat[0].p.name, bat[1].p.name];
  const overPts = [[0, 0]], live = { runs: 0, wk: 0 };

  const step = () => {
    if (i >= ev.length) return finish(res);
    const e = ev[i++];
    live.runs = e.runs; live.wk = e.wk;
    if (e.t !== "wd") { legal++; const s = stats.get(e.who); s.b++; if (e.t !== "W") s.r += e.t; }
    if (e.t === "W") atCrease = atCrease.map((n) => (n === e.who && nextIn < 11 && e.wk < 10 ? bat[nextIn++].p.name : n));
    curOver.push(e);
    const [cls, txt] = line(e, capName);
    if (speed > 0 || cls) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ov num">${e.over}.${e.t === "wd" ? e.ball : e.ball + 1}</span><span class="${cls}">${txt}</span>`;
      feed.prepend(li);
      while (feed.children.length > 80) feed.lastChild.remove();
    }
    const overDone = legal % 6 === 0 && e.t !== "wd";
    if (overDone) overPts.push([legal / 6, live.runs]);
    if (speed > 0 || i >= ev.length) paint(e);
    if (overDone && i < ev.length) curOver = [];
    if (speed > 0) timer = setTimeout(step, e.t === "W" || e.t === 6 ? speed * 2.4 : speed);
    else step();
  };
  function paint(e) {
    $("c-score").textContent = live.runs + "/" + live.wk;
    $("c-ov").textContent = Math.floor(legal / 6) + "." + (legal % 6);
    const need = Math.max(0, TARGET - live.runs), left = 120 - legal;
    $("c-need").textContent = need ? need + (left ? " off " + left : "") : "Done";
    $("c-rr").textContent = need && left ? ((need / left) * 6).toFixed(2) : "–";
    $("c-tick").innerHTML = curOver.map((x) => {
      const c = x.t === "W" ? "bW" : x.t === 6 ? "b6" : x.t === 4 ? "b4" : x.t === "wd" ? "bx" : "";
      return `<span class="ball ${c}">${x.t === "W" ? "W" : x.t === "wd" ? "wd" : x.t === 0 ? "•" : x.t}</span>`;
    }).join("");
    $("c-crease").innerHTML = live.wk >= 10 ? "<div>All out</div>" : atCrease.map((n) => {
      const s = stats.get(n);
      return `<div class="${n === e.who ? "on" : ""}"><span>${esc(n)}</span><span>${s.r} (${s.b})</span></div>`;
    }).join("");
    drawWorm(overPts.concat(legal % 6 ? [[legal / 6, live.runs]] : []));
  }
  step();
}

function drawWorm(pts) {
  const W = 320, H = 170, L = 34, B = 22, T = 8, Rr = 8;
  const x = (o) => L + (o / 20) * (W - L - Rr), y = (r) => H - B - (Math.min(r, 320) / 320) * (H - B - T);
  let g = "";
  [100, 200, 300].forEach((v) => (g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--chalk-faint)">${v}</text>`));
  [0, 5, 10, 15, 20].forEach((v) => (g += `<text x="${x(v)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--chalk-faint)">${v}</text>`));
  g += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(20)}" y2="${y(301)}" stroke="var(--wkt)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  const d = pts.map((p, i) => (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  g += `<path d="${d} L${x(last[0]).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z" fill="var(--led)" fill-opacity=".1" stroke="none"/>`;
  g += `<path d="${d}" fill="none" stroke="var(--led)" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${x(last[0])}" cy="${y(last[1])}" r="3.5" fill="var(--led)"/>`;
  $("c-worm").innerHTML = g;
}

function verdict(res) {
  const R = res.R, left = 120 - res.legal;
  if (res.won) return { won: true, h: "300 chased. Legendary.", p: `Won with ${10 - res.wk} wicket${10 - res.wk === 1 ? "" : "s"} and ${left} ball${left === 1 ? "" : "s"} to spare. Nobody has ever done this for real.` };
  const clusters = res.events.filter((e) => e.t === "W" && e.collapse).length;
  const gaps = [
    ["anc", R.ra - 72, "Your top six didn't last. Wickets fell before the hitters could cash in."],
    ["pow", R.rp - 84, "Not enough power. Twelve an over doesn't cut it when you need fifteen."],
    ["bwl", R.rw - 85, "Bowling too thin. Without elite bowlers in the XI, the side never got the lift a record chase needs."],
  ];
  if (clusters >= 3) gaps.push(["cap", -20, R.captain ? `Wickets came in clusters, and ${R.captain.name} couldn't stop the slide.` : "Wickets came in clusters with no captain to stop the slide."]);
  gaps.sort((a, b) => a[1] - b[1]);
  let reason = gaps[0][2];
  if (!R.hasK) reason += " You also went in without a keeper.";
  const short = TARGET - 1 - res.runs;
  const h = res.runs >= 280 ? `${short === 0 ? "Tied" : short + " short"}. Agonising.` : res.runs >= 250 ? "A huge chase, still short." : res.runs >= 200 ? "Respectable, not historic." : "Blown away.";
  return { won: false, h, p: `${res.runs}/${res.wk}${res.wk === 10 ? "" : " in 20 overs"}. ${reason}` };
}

function finish(res) {
  lastRes = res;
  const v = verdict(res);
  if (!best || res.runs > best.runs || (res.won && !best.won)) { best = { runs: res.runs, wk: res.wk, won: res.won }; try { localStorage.setItem("chase300-best", JSON.stringify(best)); } catch (e) {} }
  renderLineup();
  const rows = res.bat.map((b) => {
    if (!(b.b > 0 || b.in || b.out)) return `<tr class="dnb"><td>${esc(b.p.name)}</td><td>did not bat</td><td></td><td></td><td></td><td></td><td></td></tr>`;
    return `<tr><td>${esc(b.p.name)}${b.p === res.R.captain ? " (c)" : ""}</td><td>${b.out ? HOW[b.out] : "not out"}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${b.b ? ((b.r / b.b) * 100).toFixed(0) : "–"}</td></tr>`;
  }).join("");
  const ov = Math.floor(res.legal / 6) + "." + (res.legal % 6);
  $("c-result").innerHTML = `<div class="verdict ${v.won ? "" : "lost"}"><h3>${v.h}</h3><p>${v.p}</p></div>
    <div class="row"><button class="btn" id="again">Draft a new XI</button><button class="btn ghost sm" id="rerun">Chase again with this XI</button></div>
    ${board.on ? `<form class="submit" id="submit"><input id="hb-name" maxlength="20" placeholder="Your name for the honours board" autocomplete="nickname" required><button class="btn sm" type="submit">Post score</button><span class="note" id="hb-msg"></span></form>` : ""}
    <div class="tablewrap"><table><thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${res.extras} extras · ${ov} ov</td><td>${res.runs}/${res.wk}</td><td colspan="4"></td></tr></tfoot></table></div>
    ${res.fow.length ? `<div class="fow"><span class="lbl">Fall of wickets</span><br>${res.fow.map((f) => `${f.runs}-${f.wk} (${esc(f.name)}, ${Math.floor(f.ball / 6)}.${f.ball % 6})`).join(" · ")}</div>` : ""}`;
  $("again").onclick = () => { clearTimeout(timer); st = fresh(); renderLineup(); renderPlay(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("rerun").onclick = () => startChase(false);
  if (board.on) {
    try { $("hb-name").value = localStorage.getItem("chase300-name") || ""; } catch (e) {}
    $("submit").onsubmit = (ev) => { ev.preventDefault(); board.post(res, $("hb-name").value.trim()); };
  }
}

/* ---------- optional online honours board (Supabase) ---------- */
const board = {
  on: !!(CFG.supabaseUrl && CFG.supabaseAnonKey),
  url() { return CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/scores"; },
  headers() { return { apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + CFG.supabaseAnonKey, "Content-Type": "application/json" }; },
  async load() {
    if (!this.on) return;
    $("honours").hidden = false;
    try {
      const r = await fetch(this.url() + "?select=name,runs,wk,balls,won,captain,created_at&order=score.desc,created_at.asc&limit=10", { headers: this.headers() });
      if (!r.ok) throw new Error(r.status);
      const rows = await r.json();
      $("board-list").innerHTML = rows.length ? rows.map((x) => `<li><span class="who">${esc(x.name)}<small>${x.captain ? "Captain " + esc(x.captain) + " · " : ""}${new Date(x.created_at).toLocaleDateString()}</small></span>
        <span class="sc num ${x.won ? "won" : ""}">${x.runs}/${x.wk}${x.won ? ` <small>(${Math.floor(x.balls / 6)}.${x.balls % 6} ov)</small>` : ""}</span></li>`).join("")
        : `<li><span class="who">No chases posted yet. Be the first.</span><span></span></li>`;
    } catch (e) {
      $("board-list").innerHTML = `<li><span class="who">Couldn't load the honours board right now.</span><span></span></li>`;
    }
  },
  async post(res, name) {
    const msg = $("hb-msg");
    if (!name) { msg.textContent = "Add a name first."; return; }
    try { localStorage.setItem("chase300-name", name); } catch (e) {}
    const body = {
      name, runs: res.runs, wk: res.wk, balls: res.legal, won: res.won,
      score: res.won ? 1000 + (120 - res.legal) : res.runs,
      captain: res.R.captain ? res.R.captain.name : null,
      xi: res.bat.map((b) => `${b.p.name} ${b.p.year}`).join(", "),
    };
    msg.textContent = "Posting…";
    try {
      const r = await fetch(this.url(), { method: "POST", headers: { ...this.headers(), Prefer: "return=minimal" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.status);
      msg.textContent = "Posted.";
      $("submit").querySelector("button").disabled = true;
      this.load();
    } catch (e) { msg.textContent = "Couldn't post. Try again in a moment."; }
  },
};

/* ---------- boot (keeps the draft across live reloads inside Claude's viewer) ---------- */
window.claude?.hot?.snapshot?.(() => ({ xi: st.xi.map((p) => (p ? key(p) : null)), rerolls: st.rerolls }));
function boot(data) {
  if (data && data.xi) {
    st.xi = data.xi.map((k) => (k ? ALL.get(k) || null : null));
    st.rerolls = data.rerolls ?? REROLLS;
    st.stage = picked() === 11 ? "ready" : "spin";
  }
  renderLineup(); renderPlay(); board.load();
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
})();
