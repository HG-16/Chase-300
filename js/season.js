// Perfect Season: draft an XI (IPL or World Cup edition), then play a full simulated IPL season or ten-team World Cup.
(async () => {
const REROLLS = 3;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SETS = (window.CHASE300_SETS && window.CHASE300_SETS.length ? window.CHASE300_SETS : [{ id: "ipl", label: "IPL", file: "data/ipl.json", theme: "ipl" }]);
const EMBED = window.SQUAD_SETS || {};
const FLAGS = window.CHASE300_FLAGS || {};
const flag = (team) => FLAGS[team] || "";

// What each edition's competition looks like. A set picks one with `season: "ipl" | "wc"` in config (default: its id, else "wc").
const FORMATS = {
  ipl: { id: "ipl", games: 14, perfect: 16, board: "16-0", title: "Play the IPL.", unit: "season", comp: "IPL season", ko: "playoffs", champs: "IPL champions",
    blurb: "Spin for real IPL franchise seasons and build your XI one pick at a time. Then take it through a full IPL season: fourteen league matches and the playoffs, against nine real squads. Here your bowlers actually bowl, so a batting line-up alone won't do it.",
    facts: [["70", "League matches, 14 of them yours"], ["4", "Teams reach the playoffs"], ["16-0", "The perfect season"]],
    runs: "Orange Cap", wkts: "Purple Cap", sides: "IPL sides", note: "Fourteen league matches against nine real IPL sides, then the playoffs. Win every one for a perfect season." },
  wc: { id: "wc", games: 9, perfect: 11, board: "11-0", title: "Play the World Cup.", unit: "World Cup", comp: "World Cup", ko: "semi-finals", champs: "World champions",
    blurb: "Spin for real T20 World Cup squads and build your XI one pick at a time. Then take it into a ten-team World Cup: nine league matches, the semi-finals and the final, against nine real national sides. Here your bowlers actually bowl, so a batting line-up alone won't do it.",
    facts: [["45", "League matches, 9 of them yours"], ["4", "Teams reach the semi-finals"], ["11-0", "The perfect World Cup"]],
    runs: "Most runs", wkts: "Most wickets", sides: "national sides", note: "Nine league matches against nine real national sides, then a semi-final and the final. Win every one for a perfect World Cup." },
};
const FMT = () => FORMATS[SET.season] || FORMATS[SET.id] || FORMATS.wc;

/* ---------- data: each edition is a JSON file, fetched once ---------- */
const cache = {};
let SET = null, META = {}, EDITIONS = {}, SQ = [], ALL = new Map();
const key = (p) => p.year + "|" + p.team + "|" + p.name;
async function useSet(id) {
  const set = SETS.find((s) => s.id === id) || SETS[0];
  if (!cache[set.id]) {
    let raw = EMBED[set.id];
    if (!raw) {
      try { const r = await fetch(set.file, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); raw = await r.json(); }
      catch (e) { $("play").innerHTML = `<div class="empty-state">Couldn't load the squads file (${esc(set.file)}). If you opened this page straight from your disk, run a local server instead: <code>python3 -m http.server</code></div>`; return false; }
    }
    const squads = parseData(raw);
    cache[set.id] = { meta: raw.meta || {}, editions: raw.editions || {}, squads, all: new Map(squads.flatMap((s) => s.players.map((p) => [key(p), p]))) };
  }
  const d = cache[set.id];
  SET = set; META = d.meta; EDITIONS = d.editions; SQ = d.squads; ALL = d.all;
  if (set.theme) document.documentElement.setAttribute("data-edition", set.theme); else document.documentElement.removeAttribute("data-edition");
  try { localStorage.setItem("perfect-ssn-set", set.id); } catch (e) {}
  if (location.hash.slice(1) !== set.id) history.replaceState(null, "", "#" + set.id);
  return true;
}
const modes = () => (Array.isArray(META.modes) && META.modes.length ? META.modes : [{ id: "easy", label: "Easy", desc: "Draft anyone." }]);

/* ---------- state ---------- */
const fresh = () => ({ xi: Array(11).fill(null), rerolls: REROLLS, squad: null, stage: "mode", lastSlot: null, mode: modes()[0].id, nation: null, widen: false, name: "My XI", season: null, tab: "matches" });
let st = { xi: Array(11).fill(null), stage: "mode" }, spinTimer = null;
const savedName = () => { try { return localStorage.getItem("perfect-ssn-name") || "My XI"; } catch (e) { return "My XI"; } };
const curMode = () => modes().find((m) => m.id === st.mode) || modes()[0];
const modeText = () => curMode().label + " mode" + (st.nation ? ", " + st.nation : "");
const osLimit = () => curMode().overseas || Infinity;
const osCount = () => st.xi.filter((p) => p && p.os).length;
const picked = () => st.xi.filter(Boolean).length;
const pool = () => (st.nation && !st.widen ? SQ.filter((s) => s.team === st.nation) : SQ);
// the nations that take part in a Perfect Season tournament (meta.seasonTeams), or everyone
const inSeason = (team) => !Array.isArray(META.seasonTeams) || META.seasonTeams.includes(team);
// opponents: the season teams minus your own nation; the reserve (meta.seasonReserve) steps in for it
const isOpponent = (team) => team !== st.nation && (inSeason(team) || (st.nation && inSeason(st.nation) && team === META.seasonReserve));
function nations(min) {
  const m = new Map();
  SQ.forEach((s) => { if (inSeason(s.team)) m.set(s.team, (m.get(s.team) || 0) + 1); });
  return [...m].filter(([, n]) => n >= (min || 1)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
const tier = (v) => (v >= 95 ? "t95" : v >= 90 ? "t90" : v >= 85 ? "t85" : v >= 80 ? "t80" : "t0");
const roleOf = (s) => (s <= 2 ? "Opener" : s <= 4 ? "Top order" : s <= 7 ? "Middle / finisher" : "Tail");
const leader = () => teamRatings(st.xi).captain;
const tags = (p, lead) => (p.os ? '<span class="tag os" title="Overseas player">OS</span>' : "") + (p.k ? '<span class="tag k">WK</span>' : "") +
  (p.c ? (lead === undefined || lead === p ? '<span class="tag c">C</span>' : '<span class="tag c off" title="Captained his side, but not leading this XI">C</span>') : "");
const short = (team) => (team.user ? team.name : (LINEAGE[team.base] || team.base) + " " + team.year);
const bestKey = () => "perfect-ssn-best-" + SET.id;

/* ---------- hero and edition picker ---------- */
function renderHero() {
  const F = FMT();
  $("h1-comp").textContent = F.title;
  $("blurb").textContent = F.blurb;
  $("facts").innerHTML = F.facts.map(([n, t]) => `<span><b>${esc(n)}</b>${esc(t)}</span>`).join("");
  renderSwitch();
}
function renderSwitch() {
  const busy = picked() > 0 && !(st.stage === "season" && st.season && st.season.stage === "done");
  $("comp").hidden = SETS.length < 2;
  $("comp").innerHTML = SETS.map((s) => `<button type="button" data-set="${esc(s.id)}" aria-pressed="${s.id === SET.id}" ${busy ? "disabled" : ""} title="${esc(s.label)}">${s.trophy ? `<img src="${esc(s.trophy)}" alt="" width="30" height="30">` : ""}<span>${esc(s.short || s.label)}</span></button>`).join("");
  $("comp").title = busy ? "Tap the logo to start over before switching edition" : "";
  $("comp").querySelectorAll("button").forEach((b) => (b.onclick = async () => {
    if (b.dataset.set === SET.id || busy) return;
    clearTimeout(spinTimer);
    if (await useSet(b.dataset.set)) { st = fresh(); st.name = savedName(); renderHero(); renderLineup(); renderPlay(); }
  }));
}

/* ---------- line-up panel ---------- */
function renderLineup() {
  const lead = leader();
  $("lineup").innerHTML = st.xi.map((p, i) => {
    const s = i + 1;
    const cls = (p ? "filled" : "empty") + (s === 7 ? " cut" : "") + (st.lastSlot === s ? " new" : "") + (p && p.pott ? " pott" : "");
    if (!p) return `<li class="${cls}"><span class="slotn">${s}</span><span class="lname"><span class="n">${roleOf(s)}</span></span><span></span></li>`;
    return `<li class="${cls}"><span class="slotn">${s}</span><span class="lname"><span class="n">${p.pott ? '<span class="star" title="Season MVP">★</span>' : ""}${esc(p.name)}${tags(p, lead)}</span><span class="m">${esc(p.team)} ${p.year}</span></span>
      <span class="mini num"><span class="${tier(p.bat)}" title="BAT">${p.bat}</span><span class="${tier(p.pow)}" title="POW">${p.pow}</span><span class="${tier(p.bwl)}" title="BWL">${p.bwl}</span></span></li>`;
  }).join("");
  $("picked").textContent = picked() + " / 11 picked" + (osLimit() < Infinity ? ` · ${osCount()}/${osLimit()} overseas` : "");
  const R = teamRatings(st.xi), any = picked() > 0;
  const set = (id, v) => { $("r-" + id).textContent = any ? v.toFixed(0) : "–"; $("b-" + id).style.width = any ? Math.min(100, v) + "%" : "0"; };
  set("anc", R.anc); set("pow", R.pow);
  // bowling here is the five who will actually bowl
  const five = st.xi.filter(Boolean).map((p) => p.bwl).sort((a, b) => b - a).slice(0, 5);
  const b5 = five.length ? five.reduce((a, b) => a + b, 0) / five.length : 0;
  set("bwl", b5);
  $("ck-k").className = R.hasK ? "ok" : "no"; $("ck-k").textContent = (R.hasK ? "✓" : "✕") + " Keeper";
  $("ck-c").className = R.hasC ? "ok" : "no"; $("ck-c").textContent = (R.hasC ? "✓" : "✕") + " Captain";
  $("capline").textContent = R.captain ? `${R.captain.name} leads the side.` : "No captain yet. The best one you draft leads.";
  renderBest(); renderSwitch();
}
function renderBest() {
  let b = null; try { b = JSON.parse(localStorage.getItem(bestKey()) || "null"); } catch (e) {}
  $("best").textContent = b ? `Your best ${FMT().unit}: ${b.w}-${b.l}${b.perfect ? " (perfect)" : b.champ ? " (champions)" : ""}. Perfect runs: ${b.perfects || 0}.` : "";
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
  document.body.classList.toggle("in-season", st.stage === "season");
  if (st.stage === "season") return renderSeason();
  if (st.stage === "mode") {
    let last = ""; try { last = localStorage.getItem("perfect-ssn-mode-" + SET.id) || ""; } catch (e) {}
    if (!modes().some((m) => m.id === last)) last = modes()[0].id;
    el.innerHTML = `<div class="ph"><h2>Choose a mode</h2><span class="lbl">${esc(SET.label)} draft</span></div>
      <div class="modes">${modes().map((m) => `<button class="mode ${m.id === last ? "last" : ""}" data-mode="${esc(m.id)}"><b>${esc(m.label)}</b><span>${esc(m.desc || "")}</span>${m.overseas ? `<small>Overseas players carry an <span class="tag os">OS</span> tag</small>` : ""}${m.nation ? `<small class="flagrow">${nations(m.minSquads).slice(0, 8).map(([n]) => flag(n)).join("")}</small>` : ""}</button>`).join("")}</div>
      <p class="note">Your five best bowlers bowl four overs each, every match. Draft at least five you trust.</p>`;
    el.querySelectorAll(".mode").forEach((b) => (b.onclick = () => {
      st.mode = b.dataset.mode;
      try { localStorage.setItem("perfect-ssn-mode-" + SET.id, st.mode); } catch (e) {}
      if (curMode().nation) { st.stage = "nation"; renderPlay(); return; }
      st.stage = "spin"; renderLineup(); renderPlay(); spin(false);
    }));
    return;
  }
  if (st.stage === "nation") {
    const list = nations(curMode().minSquads);
    el.innerHTML = `<div class="ph"><h2>Choose a nation</h2><button class="linkbtn" id="backmode">Change mode</button></div>
      <div class="nations">${list.map(([n, c]) => `<button class="nation" data-nation="${esc(n)}">${flag(n)}<span class="nn">${esc(n)}</span><span class="nc">${c} World Cups</span></button>`).join("")}</div>
      <p class="note">Every spin lands on one of your nation's squads. Your nation can't play itself, so ${esc(META.seasonReserve || "another nation")} takes its place in the World Cup.`;
    $("backmode").onclick = () => { st.stage = "mode"; renderPlay(); };
    el.querySelectorAll(".nation").forEach((b) => (b.onclick = () => { st.nation = b.dataset.nation; st.stage = "spin"; renderLineup(); renderPlay(); spin(false); }));
    return;
  }
  if (st.stage === "ready") {
    const R = teamRatings(st.xi);
    const attack = bowlingAttack(st.xi).map((i) => st.xi[i]);
    el.innerHTML = `<div class="ph"><h2>XI locked in</h2><span class="lbl">${esc(modeText())}</span></div>
      <p class="note">Anchor ${R.anc.toFixed(0)} · Power ${R.pow.toFixed(0)} · ${R.hasK ? "" : "no keeper · "}${R.captain ? "Captain " + esc(R.captain.name) : "no captain"}</p>
      <div class="attack"><span class="lbl">Your bowling attack (4 overs each)</span>
        <ul>${attack.map((p) => `<li><span>${esc(p.name)}</span><b class="num ${tier(p.bwl)}">${p.bwl}</b></li>`).join("")}</ul>
        ${attack.some((p) => p.rw < 55) ? `<p class="note warn">You are short of bowlers. Part-timers will go for plenty.</p>` : ""}</div>
      <label class="namefield"><span class="lbl">Team name</span><input id="teamname" maxlength="18" value="${esc(st.name)}" autocomplete="off"></label>
      <p>${seasonNote()}</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="go">Start the ${esc(FMT().unit)}</button></div>`;
    $("go").onclick = startSeason;
    $("teamname").addEventListener("keydown", (e) => { if (e.key === "Enter") startSeason(); });
    return;
  }
  const sq = st.squad;
  let h = `<div class="ph"><h2>${picked() ? "Pick " + (picked() + 1) + " of 11" : "Spin the wheel"}</h2>
    <span class="lbl"><span class="modechip">${st.nation ? flag(st.nation) : ""}${esc(curMode().label + (st.nation ? " · " + st.nation : ""))}</span> ${st.rerolls} re-roll${st.rerolls === 1 ? "" : "s"} left</span></div>
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
    if (st.stage !== "spinning") return;
    if (n-- > 0) { reel.innerHTML = reelHTML(P[Math.floor(Math.random() * P.length)]); d *= 1.13; spinTimer = setTimeout(tick, d); }
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
function startOver() {
  clearTimeout(spinTimer);
  st = fresh(); st.name = savedName();
  renderLineup(); renderPlay(); window.scrollTo({ top: 0, behavior: "smooth" });
}
$("home").onclick = startOver;

/* ---------- season ---------- */
// how many opponents this tournament will have, given the edition and the chosen nation
function oppCount() {
  const k = new Set(SQ.filter((s) => s.players.length >= 11 && isOpponent(s.team)).map((s) => lineage(s.team)));
  return Math.min(9, k.size);
}
function seasonNote() {
  if (FMT().id === "ipl") return FMT().note;
  const n = oppCount();
  return `${n} league matches against ${n} real national sides, then a semi-final and the final. Win every one for a perfect World Cup, ${n + 2}-0.`;
}
function startSeason() {
  const nm = ($("teamname").value || "").trim() || "My XI";
  st.name = nm; try { localStorage.setItem("perfect-ssn-name", nm); } catch (e) {}
  const mine = { id: "me", name: nm, user: true, xi: st.xi.slice() };
  const taken = new Set(st.xi.map((p) => p.name));
  const lines = new Map();
  // one squad per franchise or nation (only squads that can field eleven); in Nation mode your own country sits out and the reserve steps in
  SQ.forEach((s) => { if (s.players.length < 11 || !isOpponent(s.team)) return; const k = lineage(s.team); (lines.get(k) || lines.set(k, []).get(k)).push(s); });
  const keys = [...lines.keys()].sort(() => Math.random() - 0.5).slice(0, 9);
  const opp = keys.map((k, i) => { const list = lines.get(k), s = list[Math.floor(Math.random() * list.length)]; return { id: "o" + i, name: s.team + " " + s.year, base: s.team, year: s.year, champ: s.champ, xi: buildXI(s, taken) }; });
  st.season = newSeason([mine].concat(opp), Math.random, FMT().id);
  st.season.lostAt = null;
  st.stage = "season"; st.tab = "matches";
  renderPlay(); window.scrollTo({ top: 0, behavior: "smooth" });
}

const myRecord = (S) => { const w = S.results.filter((r) => r.M.winner.id === "me").length; return { w, l: S.results.length - w }; };
const fmtNrr = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
const scoreLine = (inn) => `${inn.runs}/${inn.wk} <small>(${oversOf(inn.legal)})</small>`;

function advance(all) {
  const S = st.season;
  if (S.stage === "league") playLeague(S, "me", all);
  else if (S.stage === "playoffs") playPlayoffs(S, "me", all);
  if (S.lostAt == null) { const i = S.results.findIndex((r) => r.M.winner.id !== "me"); if (i >= 0) S.lostAt = S.results[i].label; }
  if (S.stage === "done") finishSeason();
  st.tab = "matches";
  renderSeason();
}

function outcome(S) {
  const rec = myRecord(S), pos = standings(S).findIndex((t) => t.team.id === "me") + 1;
  const inPlayoffs = S.top4 && S.top4.some((t) => t.id === "me");
  const champ = S.champion && S.champion.id === "me";
  const perfect = champ && rec.l === 0;
  let h, p;
  const F = FMT();
  if (perfect) { h = `Perfect ${F.unit}. ${rec.w}-0.`; p = `${esc(st.name)} won every league match, then the ${F.ko}, and lifted the trophy unbeaten.`; }
  else if (champ) { h = `Champions. ${rec.w}-${rec.l}.`; p = `${esc(st.name)} are ${F.champs}. The perfect run went in ${esc(S.lostAt || "the league")}, but the trophy is yours.`; }
  else if (S.runnerUp && S.runnerUp.id === "me") { h = "Runners-up."; p = `Beaten in the final by ${esc(short(S.champion))}. ${rec.w}-${rec.l} for the ${F.unit}.`; }
  else if (inPlayoffs) { h = `Knocked out in the ${F.ko}.`; p = `Finished ${ord(pos)} in the league, then fell short. ${esc(short(S.champion))} took the title.`; }
  else { h = `Missed the ${F.ko}. Finished ${ord(pos)}.`; p = `${rec.w}-${rec.l} in the league. ${esc(short(S.champion))} took the title.`; }
  return { h, p, rec, pos, champ, perfect };
}
const ord = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

function finishSeason() {
  const S = st.season; if (S.saved) return; S.saved = true;
  const o = outcome(S);
  let b = null; try { b = JSON.parse(localStorage.getItem(bestKey()) || "null"); } catch (e) {}
  const perfects = ((b && b.perfects) || 0) + (o.perfect ? 1 : 0);
  const score = (x) => (x.perfect ? 3e4 : x.champ ? 2e4 : 0) + x.w * 100 - x.l;
  const cand = { w: o.rec.w, l: o.rec.l, champ: o.champ, perfect: o.perfect };
  const keep = !b || score(cand) > score(b) ? cand : { w: b.w, l: b.l, champ: b.champ, perfect: b.perfect };
  try { localStorage.setItem(bestKey(), JSON.stringify({ ...keep, perfects })); } catch (e) {}
  renderBest(); renderSwitch();
}

function matchCard(r, open) {
  const M = r.M, me = M.first.id === "me" ? M.first : M.second, opp = M.first.id === "me" ? M.second : M.first;
  const myInn = M.first.id === "me" ? M.i1 : M.i2, opInn = M.first.id === "me" ? M.i2 : M.i1;
  const won = M.winner.id === "me";
  const batRows = myInn.bat.map((b) => `<tr class="${b.out ? "" : "notout"}"><td>${esc(b.p.name)}${b.out ? "" : "*"}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${b.b ? ((b.r / b.b) * 100).toFixed(0) : "–"}</td></tr>`).join("");
  const bowlRows = opInn.bowl.map((b) => `<tr><td>${esc(b.p.name)}</td><td>${oversOf(b.balls)}</td><td>${b.r}</td><td>${b.w}</td><td>${((b.r / b.balls) * 6).toFixed(1)}</td></tr>`).join("");
  const topOpp = opInn.bat.slice().sort((a, b) => b.r - a.r)[0], bestOpp = myInn.bowl.slice().sort((a, b) => b.w - a.w || a.r - b.r)[0];
  return `<details class="match ${won ? "won" : "lost"}" ${open ? "open" : ""}>
    <summary><span class="res">${won ? "W" : "L"}</span>
      <span class="mm"><b>${esc(r.label)} v ${esc(short(opp))}</b>
        <small>${esc(me.name)} <span class="num">${scoreLine(myInn)}</span> · ${esc(short(opp))} <span class="num">${scoreLine(opInn)}</span></small></span>
      <span class="mr">${won ? "Won" : "Lost"} ${esc(M.margin)}</span></summary>
    <div class="mbody">
      <p class="note">${M.first.id === "me" ? esc(me.name) + " batted first." : esc(me.name) + " chased " + (M.i1.runs + 1) + "."} Player of the match: <b>${esc(M.pom.name)}</b> (${esc(M.pom.text)}). ${esc(short(opp))}: ${topOpp ? esc(topOpp.p.name) + " " + topOpp.r : ""}${bestOpp ? ", " + esc(bestOpp.p.name) + " " + bestOpp.w + "/" + bestOpp.r : ""}.</p>
      <div class="two">
        <div class="tablewrap"><table class="mini-t"><thead><tr><th>Batting</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${batRows}</tbody></table></div>
        <div class="tablewrap"><table class="mini-t"><thead><tr><th>Bowling</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>${bowlRows}</tbody></table></div>
      </div>
    </div></details>`;
}

function tableHTML(S) {
  const rows = standings(S).map((t, i) => `<tr class="${t.team.user ? "me" : ""} ${i === 3 ? "cutline" : ""}"><td>${i + 1}</td><td>${esc(t.team.user ? t.team.name : t.team.name)}${t.team.champ ? ' <span class="tag ch" title="Real-life champions that year">C</span>' : ""}</td><td>${t.p}</td><td>${t.w}</td><td>${t.l}</td><td><b>${t.pts}</b></td><td>${fmtNrr(nrr(t))}</td></tr>`).join("");
  return `<div class="tablewrap"><table class="lg league"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Top four reach the ${FMT().ko}. Opponents are real squads from the year shown.</p>`;
}

function battingHTML(S) {
  const rows = [...S.stats.values()].filter((s) => s.team.id === "me").sort((a, b) => b.runs - a.runs).map((s) => {
    const outs = s.inns - s.no;
    return `<tr><td>${esc(s.p.name)}</td><td>${s.m}</td><td>${s.inns}</td><td><b>${s.runs}</b></td><td>${s.inns ? s.hs + (s.hsNo ? "*" : "") : "–"}</td><td>${outs ? (s.runs / outs).toFixed(1) : s.runs ? "–" : "–"}</td><td>${s.balls ? ((s.runs / s.balls) * 100).toFixed(1) : "–"}</td><td>${s.fifty}</td><td>${s.hundred}</td><td>${s.f}</td><td>${s.s}</td></tr>`;
  }).join("");
  return `<div class="tablewrap"><table class="lg"><thead><tr><th>Batter</th><th>M</th><th>Inns</th><th>Runs</th><th>HS</th><th>Avg</th><th>SR</th><th>50</th><th>100</th><th>4s</th><th>6s</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bowlingHTML(S) {
  const rows = [...S.stats.values()].filter((s) => s.team.id === "me" && s.bb > 0).sort((a, b) => b.w - a.w || a.br / a.bb - b.br / b.bb).map((s) =>
    `<tr><td>${esc(s.p.name)}</td><td>${s.m}</td><td>${oversOf(s.bb)}</td><td>${s.br}</td><td><b>${s.w}</b></td><td>${s.bestW >= 0 ? s.bestW + "/" + s.bestR : "–"}</td><td>${s.w ? (s.br / s.w).toFixed(1) : "–"}</td><td>${((s.br / s.bb) * 6).toFixed(2)}</td><td>${s.w ? (s.bb / s.w).toFixed(1) : "–"}</td></tr>`).join("");
  return `<div class="tablewrap"><table class="lg"><thead><tr><th>Bowler</th><th>M</th><th>Overs</th><th>Runs</th><th>Wkts</th><th>Best</th><th>Avg</th><th>Econ</th><th>SR</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function awardsHTML(S) {
  const all = [...S.stats.values()];
  if (!all.length) return `<div class="empty-state">Awards appear once matches have been played.</div>`;
  const by = (f) => all.slice().sort((a, b) => f(b) - f(a))[0];
  const orange = by((s) => s.runs), purple = by((s) => s.w * 1000 - s.br), mvp = by((s) => s.runs + s.w * 25 + s.pom * 20), sixes = by((s) => s.s);
  const mine = all.filter((s) => s.team.id === "me");
  const mb = mine.slice().sort((a, b) => b.runs - a.runs)[0], mw = mine.slice().sort((a, b) => b.w - a.w)[0];
  const mm = S.results.map((r) => ({ r, inn: r.M.first.id === "me" ? r.M.i1 : r.M.i2 }));
  const hi = mm.slice().sort((a, b) => b.inn.runs - a.inn.runs)[0], lo = mm.slice().sort((a, b) => a.inn.runs - b.inn.runs)[0];
  const who = (s) => `${esc(s.p.name)} <small>${esc(short(s.team))}</small>`;
  const a = (label, main, sub, cls) => `<div class="award ${cls || ""}"><span class="lbl">${label}</span><b>${main}</b><span class="note">${sub}</span></div>`;
  const done = S.stage === "done";
  return `<div class="awards">
    ${done ? a("Champions", esc(short(S.champion)), `beat ${esc(short(S.runnerUp))} in the final`, "gold-a") : ""}
    ${a(FMT().runs + (done ? "" : " race"), who(orange), `${orange.runs} runs`, "orange")}
    ${a(FMT().wkts + (done ? "" : " race"), who(purple), `${purple.w} wickets`, "purple")}
    ${a("Most valuable player", who(mvp), `${mvp.runs} runs, ${mvp.w} wickets, ${mvp.pom} match awards`)}
    ${a("Most sixes", who(sixes), `${sixes.s} sixes`)}
    ${mb ? a("Your top scorer", esc(mb.p.name), `${mb.runs} runs, best ${mb.hs}${mb.hsNo ? "*" : ""}`) : ""}
    ${mw && mw.w ? a("Your top wicket-taker", esc(mw.p.name), `${mw.w} wickets, best ${mw.bestW}/${mw.bestR}`) : ""}
    ${hi ? a("Your highest total", `${hi.inn.runs}/${hi.inn.wk}`, `${esc(hi.r.label)}`) : ""}
    ${lo && mm.length > 1 ? a("Your lowest total", `${lo.inn.runs}/${lo.inn.wk}`, `${esc(lo.r.label)}`) : ""}
  </div>`;
}
function playoffsHTML(S) {
  if (!S.playoffs.length) return "";
  return `<div class="bracket">${S.playoffs.map((g) => {
    const M = g.result;
    const side = (t) => (t ? `<span class="${t.user ? "meT" : ""}">${esc(short(t))}</span>` : `<span class="tbd">To be decided</span>`);
    return `<div class="tie ${g.done ? "done" : ""}"><span class="lbl">${g.name}</span>
      <div>${side(g.a)} <small>v</small> ${side(g.b)}</div>
      ${M ? `<p class="note"><b>${esc(short(M.winner))}</b> won ${esc(M.margin)} <span class="num">(${M.i1.runs}/${M.i1.wk} v ${M.i2.runs}/${M.i2.wk})</span></p>` : ""}</div>`;
  }).join("")}</div>`;
}

function renderSeason() {
  const S = st.season, el = $("play"), rec = myRecord(S);
  const pos = standings(S).findIndex((t) => t.team.id === "me") + 1, me = S.table.get("me");
  const unbeaten = rec.l === 0;
  const leagueLeft = S.fixtures.filter((f) => !f.done && (f.a.id === "me" || f.b.id === "me")).length;
  const myGame = S.stage === "playoffs" ? S.playoffs.find((g) => !g.done && g.a && g.b && (g.a.id === "me" || g.b.id === "me")) : null;
  const alive = S.stage === "playoffs" && S.playoffs.some((g) => !g.done && ((g.a && g.a.id === "me") || (g.b && g.b.id === "me") || (!g.a || !g.b)) ) && stillIn(S);
  let controls = "", status = "";
  if (S.stage === "league") {
    const nf = S.fixtures.find((f) => !f.done && (f.a.id === "me" || f.b.id === "me"));
    const opp = nf ? (nf.a.id === "me" ? nf.b : nf.a) : null;
    status = `Next: Match ${rec.w + rec.l + 1} of ${S.teams.length === 10 && FMT().id === "ipl" ? 14 : S.teams.length - 1} v <b>${esc(short(opp))}</b>`;
    controls = `<button class="btn" id="next">Play match ${rec.w + rec.l + 1}</button><button class="btn ghost sm" id="simall">Sim rest of league (${leagueLeft})</button>`;
  } else if (S.stage === "playoffs") {
    if (myGame) { const opp = myGame.a.id === "me" ? myGame.b : myGame.a; status = `<b>${myGame.name}</b> v <b>${esc(short(opp))}</b>`; controls = `<button class="btn" id="next">Play the ${myGame.name.toLowerCase()}</button>`; }
    else if (alive) { status = "Waiting on the other knockout match."; controls = `<button class="btn" id="next">Play on</button>`; }
    else { status = S.top4.some((t) => t.id === "me") ? `You are out. The ${FMT().ko} go on without you.` : `League over. You finished ${ord(pos)}, outside the top four.`; controls = `<button class="btn" id="simall">See who wins the title</button>`; }
  }
  const o = S.stage === "done" ? outcome(S) : null;
  const tabs = [["matches", "Matches"], ["table", "Table"], ["batting", "Batting"], ["bowling", "Bowling"], ["awards", "Awards"]];
  let body = "";
  if (st.tab === "matches") body = (S.playoffs.length ? playoffsHTML(S) : "") + (S.results.length ? S.results.slice().reverse().map((r, i) => matchCard(r, i === 0 && S.stage !== "done")).join("") : `<div class="empty-state">Nine real ${FMT().sides} are waiting. Play your first match.</div>`);
  else if (st.tab === "table") body = tableHTML(S);
  else if (st.tab === "batting") body = S.results.length ? battingHTML(S) : `<div class="empty-state">Batting figures appear after your first match.</div>`;
  else if (st.tab === "bowling") body = S.results.length ? bowlingHTML(S) : `<div class="empty-state">Bowling figures appear after your first match.</div>`;
  else body = awardsHTML(S);

  el.innerHTML = `<div class="ph"><h2>${esc(st.name)}</h2><span class="lbl">${esc(modeText())} · ${esc(FMT().comp)}</span></div>
    <div class="score num season-score">
      <div><div class="lbl">Record</div><div class="v">${rec.w}-${rec.l}</div></div>
      <div><div class="lbl">League position</div><div class="v w">${me.p ? ord(pos) : "–"}</div></div>
      <div><div class="lbl">Points</div><div class="v w">${me.pts}</div></div>
      <div><div class="lbl">Net run rate</div><div class="v w">${me.p ? fmtNrr(nrr(me)) : "–"}</div></div>
    </div>
    ${o ? `<div class="verdict ${o.champ ? "" : "lost"}"><h3>${o.h}</h3><p>${o.p}</p></div>
           <div class="row"><button class="btn" id="again">Draft a new XI</button></div>`
        : `<div class="seasonbar"><span class="perfect ${unbeaten ? "on" : "off"}">${unbeaten ? (rec.w ? "Still perfect" : "Perfect run on") : "Perfect run gone: " + esc(S.lostAt)}</span><span class="note">${status}</span></div>
           <div class="row">${controls}</div>`}
    <div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" aria-selected="${st.tab === id}" data-tab="${id}">${l}</button>`).join("")}</div>
    <div class="tabbody">${body}</div>`;
  $("next") && ($("next").onclick = () => advance(false));
  $("simall") && ($("simall").onclick = () => advance(true));
  $("again") && ($("again").onclick = startOver);
  el.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { st.tab = b.dataset.tab; renderSeason(); }));
}
// is the user still alive in the playoffs?
function stillIn(S) {
  if (!S.top4 || !S.top4.some((t) => t.id === "me")) return false;
  // out once you lose a knockout game whose loser has nowhere to go
  return !S.playoffs.some((g) => g.done && !g.lose && g.result.loser.id === "me") && !S.playoffs.every((g) => g.done);
}

window.addEventListener("hashchange", async () => {
  const id = location.hash.slice(1);
  if (!SET || id === SET.id || !SETS.some((s) => s.id === id) || picked() > 0) return;
  if (await useSet(id)) { st = fresh(); st.name = savedName(); renderHero(); renderLineup(); renderPlay(); }
});
let start = location.hash.slice(1);
if (!SETS.some((s) => s.id === start)) { try { start = localStorage.getItem("perfect-ssn-set") || ""; } catch (e) { start = ""; } }
if (!SETS.some((s) => s.id === start)) start = SETS.some((s) => s.id === "ipl") ? "ipl" : SETS[0].id;
if (!(await useSet(start))) return;
st = fresh(); st.name = savedName();
renderHero(); renderLineup(); renderPlay();
})();
