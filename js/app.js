// The Chase 300: draft, chase replay, scorecard and optional online honours board.
(async () => {
const REROLLS = 3;
const CFG = window.CHASE300_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- squad sets (each is a JSON file fetched at runtime, so data can change without touching code) ---------- */
const SETS = window.CHASE300_SETS || [{ id: "wc", label: "T20 World Cup", file: "data/squads.json" }];
const EMBED = window.SQUAD_SETS || {}; // single-file builds embed the data instead of fetching it
const cache = {};
let SET = null, META = {}, EDITIONS = {}, SQ = [], ALL = new Map();
const key = (p) => p.year + "|" + p.team + "|" + p.name;

async function fetchSet(set) {
  if (cache[set.id]) return cache[set.id];
  let raw = EMBED[set.id];
  if (!raw) {
    const res = await fetch(set.file, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    raw = await res.json();
  }
  const parsed = { raw, meta: raw.meta || {}, editions: raw.editions || {}, squads: parseData(raw) };
  parsed.all = new Map(parsed.squads.flatMap((s) => s.players.map((p) => [key(p), p])));
  return (cache[set.id] = parsed);
}

async function useSet(id) {
  const set = SETS.find((s) => s.id === id) || SETS[0];
  let data;
  try { data = await fetchSet(set); }
  catch (e) {
    $("play").innerHTML = `<div class="empty-state">Couldn't load the squads file (${esc(set.file)}). If you opened index.html straight from your disk, run a local server instead: <code>python3 -m http.server</code></div>`;
    return false;
  }
  SET = set; META = data.meta; EDITIONS = data.editions; SQ = data.squads; ALL = data.all;
  if (set.theme) document.documentElement.setAttribute("data-edition", set.theme); else document.documentElement.removeAttribute("data-edition");
  try { localStorage.setItem("chase300-set", set.id); } catch (e) {}
  if (location.hash.slice(1) !== set.id) history.replaceState(null, "", "#" + set.id);
  renderHero();
  return true;
}

function renderHero() {
  if (META.blurb) $("blurb").textContent = META.blurb;
  $("facts").innerHTML = (META.facts || []).map(([n, t]) => `<span><b>${esc(n)}</b>${esc(t)}</span>`).join("") + `<span><b>301</b>What you need</span>`;
  renderSwitch();
}

function renderSwitch() {
  const locked = picked() > 0 && st.stage !== "chase";
  $("comp").hidden = SETS.length < 2;
  $("comp").innerHTML = SETS.map((s) => `<button type="button" data-set="${esc(s.id)}" aria-pressed="${SET && s.id === SET.id}" ${locked ? "disabled" : ""} title="${esc(s.label)}">${s.trophy ? `<img src="${esc(s.trophy)}" alt="" width="30" height="30">` : ""}<span>${esc(s.short || s.label)}</span></button>`).join("");
  $("comp").title = locked ? "Finish this draft, or tap the 300/0 logo to start over, to switch" : "";
  $("comp").querySelectorAll("button").forEach((b) => (b.onclick = async () => {
    if (b.dataset.set === SET.id || (picked() > 0 && st.stage !== "chase")) return;
    clearTimeout(timer);
    if (await useSet(b.dataset.set)) { st = fresh(); loadBest(); renderLineup(); renderPlay(); board.load(); }
  }));
}

function startOver() {
  clearTimeout(timer);
  st = fresh(); loadBest(); renderLineup(); renderPlay(); renderSwitch(); board.load();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("home").onclick = startOver;

// Modes come from the squad file's meta.modes: [{id, label, desc, overseas?: n, nation?: true, minSquads?: n}]
const modes = () => (META && Array.isArray(META.modes) ? META.modes : []);
const hasModes = () => modes().length > 0;
const fresh = () => ({ xi: Array(11).fill(null), rerolls: REROLLS, squad: null, stage: hasModes() ? "mode" : "spin", lastSlot: null, mode: hasModes() ? modes()[0].id : "", nation: null, widen: false });
const curMode = () => modes().find((m) => m.id === st.mode) || null;
const osLimit = () => (curMode() && curMode().overseas) || Infinity;
const osCount = () => st.xi.filter((p) => p && p.os).length;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const scoreKey = () => SET.id + (hasModes() ? "-" + st.mode : "") + (st.nation ? "-" + slug(st.nation) : "");
const modeLabel = () => (curMode() ? curMode().label + (st.nation ? " · " + st.nation : "") : "");
const modeText = () => (curMode() ? curMode().label + " mode" + (st.nation ? ", " + st.nation : "") : "");
const FLAGS = window.CHASE300_FLAGS || {};
const flag = (team) => FLAGS[team] || "";
const pool = () => (st.nation && !st.widen ? SQ.filter((s) => s.team === st.nation) : SQ);
function nations(min) {
  const m = new Map();
  SQ.forEach((s) => m.set(s.team, (m.get(s.team) || 0) + 1));
  return [...m].filter(([, n]) => n >= (min || 1)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function loadBest() { try { best = JSON.parse(localStorage.getItem("chase300-best-" + scoreKey()) || "null"); } catch (e) { best = null; } }
let st = fresh();
let best = null, lastRes = null;

const tier = (v) => (v >= 95 ? "t95" : v >= 90 ? "t90" : v >= 85 ? "t85" : v >= 80 ? "t80" : "t0");
const roleOf = (s) => (s <= 2 ? "Opener" : s <= 4 ? "Top order" : s <= 7 ? "Middle / finisher" : "Tail");
const picked = () => st.xi.filter(Boolean).length;
const leader = () => teamRatings(st.xi).captain;
// lead: the captain leading this XI. Other drafted captains get a dimmed tag.
const tags = (p, lead) => (p.os ? '<span class="tag os" title="Overseas player">OS</span>' : "") + (p.k ? '<span class="tag k">WK</span>' : "") +
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
  $("picked").textContent = picked() + " / 11 picked" + (osLimit() < Infinity ? ` · ${osCount()}/${osLimit()} overseas` : "");
  const R = teamRatings(st.xi), any = picked() > 0;
  const set = (id, v) => { $("r-" + id).textContent = any ? v.toFixed(0) : "–"; $("b-" + id).style.width = any ? Math.min(100, v) + "%" : "0"; };
  set("anc", R.anc); set("pow", R.pow); set("bwl", R.bwl);
  $("r-ovr").textContent = picked() === 11 ? R.ovr.toFixed(1) : any ? "…" : "–";
  $("ck-k").className = R.hasK ? "ok" : "no"; $("ck-k").textContent = (R.hasK ? "✓" : "✕") + " Keeper";
  $("ck-c").className = R.hasC ? "ok" : "no"; $("ck-c").textContent = (R.hasC ? "✓" : "✕") + " Captain";
  const nCaps = st.xi.filter((p) => p && p.c).length;
  $("capline").textContent = R.captain ? (nCaps > 1 ? `${R.captain.name} leads: the best captaincy of your ${nCaps} captains. Ratings stay hidden.` : `${R.captain.name} leads the side. Captaincy rating is hidden.`) : "No captain yet. Draft as many as you like; the best one leads.";
  $("best").textContent = best ? `Your best ${SET ? SET.label + " " : ""}chase${modeText() ? " (" + modeText() + ")" : ""}: ${best.runs}/${best.wk}${best.won ? " (chased)" : ""}.` : "";
  if (SET) renderSwitch();
}

/* ---------- draft ---------- */
function openSlots(p) { const o = []; for (let s = p.lo; s <= p.hi; s++) if (!st.xi[s - 1]) o.push(s); return o; }
const usedNames = () => new Set(st.xi.filter(Boolean).map((p) => p.name));
function blockReason(p, used) {
  if (used.has(p.name)) return "Already in your XI";
  if (!openSlots(p).length) return "No open slot";
  if (p.os && osCount() >= osLimit()) return `Overseas limit reached (${osLimit()})`;
  return "";
}
const eligible = (sq) => { const u = usedNames(); return sq.players.some((p) => !blockReason(p, u)); };
const reelHTML = (sq) => `<span class="yr">${sq.year}</span><span>${esc(sq.team.toUpperCase())}</span>`;

function renderPlay() {
  const el = $("play");
  if (st.stage === "mode") {
    let last = ""; try { last = localStorage.getItem("chase300-mode-" + SET.id) || ""; } catch (e) {}
    if (!modes().some((m) => m.id === last)) last = modes()[0].id;
    el.innerHTML = `<div class="ph"><h2>Choose a mode</h2><span class="lbl">${esc(SET.label)}</span></div>
      <div class="modes">${modes().map((m) => `<button class="mode ${m.id === last ? "last" : ""}" data-mode="${esc(m.id)}"><b>${esc(m.label)}</b><span>${esc(m.desc || "")}</span>${m.overseas ? `<small>Overseas players carry an <span class="tag os">OS</span> tag</small>` : ""}${m.nation ? `<small class="flagrow">${nations(m.minSquads).slice(0, 8).map(([n]) => flag(n)).join("")}</small>` : ""}</button>`).join("")}</div>
      <p class="note">Each mode keeps its own best score${board.on ? " and honours board" : ""}.</p>`;
    el.querySelectorAll(".mode").forEach((b) => (b.onclick = () => {
      st.mode = b.dataset.mode;
      try { localStorage.setItem("chase300-mode-" + SET.id, st.mode); } catch (e) {}
      if (curMode() && curMode().nation) { st.stage = "nation"; renderPlay(); return; }
      st.stage = "spin"; loadBest(); renderLineup(); renderPlay(); board.load(); spin(false);
    }));
    return;
  }
  if (st.stage === "nation") {
    const list = nations(curMode().minSquads);
    el.innerHTML = `<div class="ph"><h2>Choose a nation</h2><button class="linkbtn" id="backmode">Change mode</button></div>
      <div class="nations">${list.map(([n, c]) => `<button class="nation" data-nation="${esc(n)}">${flag(n)}<span class="nn">${esc(n)}</span><span class="nc">${c} World Cups</span></button>`).join("")}</div>
      <p class="note">Only nations with ${curMode().minSquads || 1} or more World Cup squads are listed, so there are always enough players to fill an XI.</p>`;
    $("backmode").onclick = () => { st.stage = "mode"; renderPlay(); };
    el.querySelectorAll(".nation").forEach((b) => (b.onclick = () => {
      st.nation = b.dataset.nation; st.stage = "spin";
      loadBest(); renderLineup(); renderPlay(); board.load(); spin(false);
    }));
    return;
  }
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
    <span class="lbl">${modeLabel() ? `<span class="modechip">${st.nation ? flag(st.nation) : ""}${esc(modeLabel())}</span> ` : ""}${st.rerolls} re-roll${st.rerolls === 1 ? "" : "s"} left</span></div>
    <div class="wheel"><div class="reel ${sq ? "" : "idle"}" id="reel">${sq ? reelHTML(sq) : "— — — —"}</div>
    <div class="row">${st.stage === "pick"
      ? `<button class="btn ghost" id="reroll" ${st.rerolls ? "" : "disabled"}>Re-roll</button>`
      : `<button class="btn" id="spin" ${st.stage === "spinning" ? "disabled" : ""}>Spin</button>`}</div></div>`;
  if (st.stage === "pick" && sq) {
    const used = usedNames();
    h += `<div class="squadhead"><h3>${esc(sq.team)} ${sq.year}${sq.champ ? '<span class="tag ch">Champions</span>' : ""}</h3><span class="note">${esc(META.short || SET.label)} ${sq.year} · ${esc((EDITIONS[sq.year] || {}).host || "")}</span></div>`;
    if (!eligible(sq)) {
      const stuck = st.nation && !SQ.some((s) => s.team === st.nation && eligible(s));
      h += stuck
        ? `<div class="empty-state">No ${esc(st.nation)} squad has anyone left for your open slots.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn sm" id="widespin">Spin from any nation</button></div></div>`
        : `<div class="empty-state">Nobody in this squad fits your open slots.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn sm" id="freespin">Free spin</button></div></div>`;
    } else {
      const ps = sq.players.slice().sort((a, b) => !blockReason(b, used) - !blockReason(a, used) || b.pott - a.pott);
      h += `<div class="cards">` + ps.map((p) => {
        const why = blockReason(p, used), sl = openSlots(p);
        const range = p.lo === p.hi ? p.lo : p.lo + "–" + p.hi;
        return `<div class="pc ${why ? "dis" : ""} ${p.pott ? "pott" : ""}">
          ${p.pott ? `<div class="gold">${esc(META.pottLabel || "Player of the Tournament")}</div>` : ""}
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
  $("widespin") && ($("widespin").onclick = () => { st.widen = true; spin(true); });
  el.querySelectorAll(".slots button").forEach((b) => (b.onclick = () => place(ALL.get(b.dataset.p), +b.dataset.s)));
}

function spin(fast) {
  st.stage = "spinning"; renderPlay();
  const P = pool(); st.widen = false;
  const final = P[Math.floor(Math.random() * P.length)];
  const reel = $("reel"); reel.classList.remove("idle");
  let n = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : fast ? 8 : 16, d = 40;
  const tick = () => {
    if (n-- > 0) { reel.innerHTML = reelHTML(P[Math.floor(Math.random() * P.length)]); d *= 1.13; setTimeout(tick, d); }
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
  if (res.won) recordChase(res, v);
  if (!best || res.runs > best.runs || (res.won && !best.won)) { best = { runs: res.runs, wk: res.wk, won: res.won }; try { localStorage.setItem("chase300-best-" + scoreKey(), JSON.stringify(best)); } catch (e) {} }
  renderLineup();
  const rows = res.bat.map((b) => {
    if (!(b.b > 0 || b.in || b.out)) return `<tr class="dnb"><td>${esc(b.p.name)}</td><td>did not bat</td><td></td><td></td><td></td><td></td><td></td></tr>`;
    return `<tr class="${b.out ? "" : "notout"}"><td>${esc(b.p.name)}${b.out ? "" : "*"}${b.p === res.R.captain ? " (c)" : ""}</td><td>${b.out ? HOW[b.out] : "not out"}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${b.b ? ((b.r / b.b) * 100).toFixed(0) : "–"}</td></tr>`;
  }).join("");
  const ov = Math.floor(res.legal / 6) + "." + (res.legal % 6);
  $("c-result").innerHTML = `<div class="verdict ${v.won ? "" : "lost"}"><h3>${v.h}</h3><p>${v.p}</p></div>
    <div class="row"><button class="btn" id="again">Draft a new XI</button><button class="btn ghost sm" id="shot">Share scorecard</button></div>
    <div class="sharebox" id="sharebox" hidden>
      <img id="sh-img" alt="Scorecard image of your chase">
      <div class="row"><button class="btn sm" id="sh-share" hidden>Share image</button><button class="btn sm" id="sh-dl">Download PNG</button><button class="btn ghost sm" id="sh-copy">Copy image</button></div>
      <p class="note" id="sh-msg"></p>
    </div>
    ${board.on ? `<form class="submit" id="submit"><input id="hb-name" maxlength="20" placeholder="Your name for the honours board" autocomplete="nickname" required><button class="btn sm" type="submit">Post score</button><span class="note" id="hb-msg"></span></form>` : ""}
    <div class="tablewrap"><table><thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${res.extras} extras · ${ov} ov</td><td>${res.runs}/${res.wk}</td><td colspan="4"></td></tr></tfoot></table></div>
    ${res.fow.length ? `<div class="fow"><span class="lbl">Fall of wickets</span><br>${res.fow.map((f) => `${f.runs}-${f.wk} (${esc(f.name)}, ${Math.floor(f.ball / 6)}.${f.ball % 6})`).join(" · ")}</div>` : ""}`;
  $("again").onclick = startOver;
  $("shot").onclick = () => shareScorecard(res, v);
  if (board.on) {
    try { $("hb-name").value = localStorage.getItem("chase300-name") || ""; } catch (e) {}
    $("submit").onsubmit = (ev) => { ev.preventDefault(); board.post(res, $("hb-name").value.trim()); };
  }
}

/* ---------- shareable PNG scorecard ---------- */
let DL = null;
if (window.claude && typeof window.claude.use === "function") window.claude.use("downloads").then((d) => (DL = d), () => {});
function siteName() {
  if (CFG.siteName) return CFG.siteName;
  const h = location.hostname;
  return h && !/claude|localhost|^127\.|usercontent/.test(h) ? h + location.pathname.replace(/\/index\.html$|\/$/, "") : "The Chase 300";
}
async function shareScorecard(res, v) {
  return drawShare("sh", res, v, { theme: SET.theme, label: SET.label + (modeText() ? " · " + modeText() : ""), file: `chase300-${SET.id}-${res.runs}-${res.wk}.png` }, $("shot"));
}

// Draws the PNG and wires Share / Download / Copy for a share panel whose element ids start with `px` (sh-..., mc-...).
async function drawShare(px, res, v, info, btn) {
  const box = $(px + "box"), msg = $(px + "-msg"), img = $(px + "-img");
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Drawing…"; }
  let blob, url;
  try {
    const cv = await makeScorecard(res, { theme: info.theme, competition: info.label, verdictTitle: v.h, verdictText: v.p, site: siteName() });
    blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    url = URL.createObjectURL(blob);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    msg.textContent = "Couldn't draw the image."; box.hidden = false; return;
  }
  if (btn) { btn.disabled = false; btn.textContent = "Redraw image"; }
  const fname = info.file;
  const file = new File([blob], fname, { type: "image/png" });
  img.src = url; box.hidden = false; msg.textContent = "";
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const text = res.won ? `I chased 301 in ${Math.floor(res.legal / 6)}.${res.legal % 6} overs on The Chase 300.` : `${res.runs}/${res.wk} chasing 301 on The Chase 300. Can you beat it?`;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  $(px + "-share").hidden = !canShare;
  $(px + "-share").onclick = async () => {
    try { await navigator.share({ files: [file], title: "The Chase 300", text }); msg.textContent = ""; }
    catch (e) { if (e && e.name !== "AbortError") msg.textContent = "Sharing didn't work here. Download the image instead."; }
  };
  $(px + "-dl").onclick = async () => {
    if (DL) { // inside Claude's viewer: saves go through its download prompt
      try { await DL.save({ filename: fname, data: blob }); msg.textContent = "Saved."; }
      catch (e) { msg.textContent = e && e.code === "declined" ? "" : "Saving isn't available here. Right-click or long-press the image to save it."; }
      return;
    }
    const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    msg.textContent = "If nothing downloaded, right-click or long-press the image to save it.";
  };
  $(px + "-copy").onclick = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); msg.textContent = "Copied. Paste it into a chat or post."; }
    catch (e) { msg.textContent = "Copying images isn't allowed here. Right-click or long-press the image instead."; }
  };
}

/* ---------- My chases: every successful chase, kept in this browser ---------- */
const MY_KEY = "chase300-my-chases";
let myMem = [];
function myChases() { try { const v = JSON.parse(localStorage.getItem(MY_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return myMem; } }
function saveMyChases(list) { myMem = list; try { localStorage.setItem(MY_KEY, JSON.stringify(list)); } catch (e) {} }
function recordChase(res, v) {
  const rec = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(),
    set: SET.id, label: SET.label + (modeText() ? " · " + modeText() : ""), theme: SET.theme || "",
    runs: res.runs, wk: res.wk, legal: res.legal, extras: res.extras, verdict: { h: v.h, p: v.p },
    R: { anc: res.R.anc, pow: res.R.pow, bwl: res.R.bwl, captain: res.R.captain ? res.R.captain.name : null },
    bat: res.bat.map((b) => ({ name: b.p.name, team: b.p.team, year: b.p.year, pott: !!b.p.pott, c: b.p === res.R.captain,
      played: !!(b.b > 0 || b.in || b.out), out: b.out, r: b.r, b: b.b, f: b.f, s: b.s })),
    fow: res.fow, overs: res.overs.map((o) => ({ over: o.over, runs: o.runs })),
  };
  saveMyChases([rec].concat(myChases()).slice(0, 100));
  renderMyCount(true);
}
function recToRes(rec) {
  const bat = rec.bat.map((b) => ({ p: { name: b.name, team: b.team, year: b.year, pott: b.pott }, c: b.c, in: b.played, out: b.out, r: b.r, b: b.b, f: b.f, s: b.s }));
  const cap = bat.find((b) => b.c);
  return { won: true, runs: rec.runs, wk: rec.wk, legal: rec.legal, extras: rec.extras, bat, fow: rec.fow || [], overs: rec.overs || [],
    R: { anc: rec.R.anc, pow: rec.R.pow, bwl: rec.R.bwl, captain: cap ? cap.p : null } };
}
function renderMyCount(pulse) {
  const n = myChases().length, b = $("mychases");
  b.innerHTML = `<span class="mc-n num">${n}</span><span class="mc-l">${n === 1 ? "chase" : "chases"}<br>landed</span>`;
  b.title = n ? `You have chased 301 ${n} time${n === 1 ? "" : "s"}. Tap to see them.` : "No successful chases yet";
  if (pulse) { b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); }
}
const ovs = (l) => Math.floor(l / 6) + "." + (l % 6);
function openMy(id) {
  const list = myChases(), ov = $("myov"), body = $("my-body");
  ov.hidden = false; document.body.classList.add("noscroll");
  const rec = id && list.find((r) => r.id === id);
  if (!rec) {
    $("my-title").textContent = "My chases";
    body.innerHTML = list.length
      ? `<p class="note">Every time you chase 301 it's saved here, in this browser only. Fastest chases first.</p>
         <ul class="mylist">${list.slice().sort((a, b) => a.legal - b.legal).map((r) => `<li><button data-id="${r.id}">
           <span class="ml-s num">${r.runs}/${r.wk}</span>
           <span class="ml-m"><b>${ovs(r.legal)} overs</b><small>${esc(r.label)}${r.R.captain ? " · Captain " + esc(r.R.captain) : ""}</small></span>
           <span class="ml-d">${new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></button></li>`).join("")}</ul>`
      : `<div class="empty-state">No successful chases yet.<br>Chase down 301 and the scorecard lands here.</div>`;
    body.querySelectorAll(".mylist button").forEach((b) => (b.onclick = () => openMy(b.dataset.id)));
    $("my-close").focus();
    return;
  }
  const res = recToRes(rec);
  $("my-title").textContent = `${rec.runs}/${rec.wk} in ${ovs(rec.legal)} overs`;
  const rows = res.bat.map((b) => {
    if (!b.in) return `<tr class="dnb"><td>${esc(b.p.name)}</td><td>did not bat</td><td></td><td></td><td></td><td></td><td></td></tr>`;
    return `<tr class="${b.out ? "" : "notout"}"><td>${b.p.pott ? '<span class="star">★</span>' : ""}${esc(b.p.name)}${b.out ? "" : "*"}${b.c ? " (c)" : ""}</td><td>${b.out ? HOW[b.out] : "not out"} · ${esc(b.p.team)} ${b.p.year}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${b.b ? ((b.r / b.b) * 100).toFixed(0) : "–"}</td></tr>`;
  }).join("");
  body.innerHTML = `<button class="linkbtn" id="my-back">← All my chases</button>
    <div class="verdict"><h3>${esc(rec.verdict.h)}</h3><p>${esc(rec.verdict.p)}</p></div>
    <p class="note">${esc(rec.label)} · ${new Date(rec.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · Anchor ${rec.R.anc.toFixed(0)} · Power ${rec.R.pow.toFixed(0)} · Bowling ${rec.R.bwl.toFixed(0)}</p>
    <div class="tablewrap"><table><thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${rec.extras} extras · ${ovs(rec.legal)} ov</td><td>${rec.runs}/${rec.wk}</td><td colspan="4"></td></tr></tfoot></table></div>
    <div class="row" style="margin-top:14px"><button class="btn sm" id="mc-draw">Make scorecard image</button><button class="btn ghost sm" id="mc-del">Delete</button></div>
    <div class="sharebox" id="mcbox" hidden>
      <img id="mc-img" alt="Scorecard image of this chase">
      <div class="row"><button class="btn sm" id="mc-share" hidden>Share image</button><button class="btn sm" id="mc-dl">Download PNG</button><button class="btn ghost sm" id="mc-copy">Copy image</button></div>
      <p class="note" id="mc-msg"></p>
    </div>`;
  $("my-back").onclick = () => openMy();
  $("mc-draw").onclick = () => drawShare("mc", res, rec.verdict, { theme: rec.theme, label: rec.label, file: `chase300-${rec.set}-${rec.runs}-${rec.wk}-${ovs(rec.legal).replace(".", "_")}ov.png` }, $("mc-draw"));
  $("mc-del").onclick = () => {
    if ($("mc-del").dataset.sure) { saveMyChases(myChases().filter((r) => r.id !== rec.id)); renderMyCount(); openMy(); return; }
    $("mc-del").dataset.sure = "1"; $("mc-del").textContent = "Tap again to delete";
  };
  $("my-back").focus();
}
function closeMy() { $("myov").hidden = true; document.body.classList.remove("noscroll"); $("mychases").focus(); }
$("mychases").onclick = () => openMy();
$("my-close").onclick = closeMy;
$("myov").addEventListener("click", (e) => { if (e.target === $("myov")) closeMy(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("myov").hidden) closeMy(); });
renderMyCount();

/* ---------- optional online honours board (Supabase) ---------- */
const board = {
  on: !!(CFG.supabaseUrl && CFG.supabaseAnonKey),
  url() { return CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/scores"; },
  headers() { return { apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + CFG.supabaseAnonKey, "Content-Type": "application/json" }; },
  async load() {
    if (!this.on) return;
    $("honours").hidden = false;
    try {
      const r = await fetch(this.url() + "?select=name,runs,wk,balls,won,captain,created_at&comp=eq." + encodeURIComponent(scoreKey()) + "&order=score.desc,created_at.asc&limit=10", { headers: this.headers() });
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
      name, comp: scoreKey(), runs: res.runs, wk: res.wk, balls: res.legal, won: res.won,
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
window.claude?.hot?.snapshot?.(() => ({ set: SET && SET.id, mode: st.mode, nation: st.nation, xi: st.xi.map((p) => (p ? key(p) : null)), rerolls: st.rerolls }));
async function boot(data) {
  let start = location.hash.slice(1);
  if (data && data.set) start = data.set;
  if (!SETS.some((s) => s.id === start)) { try { start = localStorage.getItem("chase300-set") || ""; } catch (e) { start = ""; } }
  if (!SETS.some((s) => s.id === start)) start = window.CHASE300_DEFAULT_SET || SETS[0].id;
  if (!(await useSet(start))) return;
  st = fresh();
  if (data && data.xi && data.xi.some(Boolean)) {
    st.xi = data.xi.map((k) => (k ? ALL.get(k) || null : null));
    st.rerolls = data.rerolls ?? REROLLS;
    if (modes().some((m) => m.id === data.mode)) st.mode = data.mode;
    st.nation = data.nation || null;
    st.stage = picked() === 11 ? "ready" : "spin";
  }
  loadBest(); renderLineup(); renderPlay(); board.load();
}
window.addEventListener("hashchange", async () => {
  const id = location.hash.slice(1);
  if (!SET || id === SET.id || !SETS.some((s) => s.id === id) || (picked() > 0 && st.stage !== "chase")) return;
  clearTimeout(timer);
  if (await useSet(id)) { st = fresh(); loadBest(); renderLineup(); renderPlay(); board.load(); }
});
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
})();
