// The Chase 300: draws a finished chase as a shareable PNG scorecard (1080px wide, no libraries).
// makeScorecard(res, info) -> Promise<HTMLCanvasElement>
// info: { competition, verdictTitle, verdictText, site }
(function () {
  const PALETTES = {
    night: { bg: "#0a1812", line: "#2a4a3a", board: "#050b08", chalk: "#ebe6d6", dim: "#9fb3a7", faint: "#647d70",
      accent: "#ffb627", gold: "#ffd866", wkt: "#ff5468", notout: "#7fd6ff", four: "#7fd6ff",
      t95: "#ffd24a", t90: "#c39bff", t85: "#6fe39a", glow: "255,240,200", glowA: 0.13 },
    ipl: { bg: "#0a1838", line: "#2b4778", board: "#050c20", chalk: "#eef1fa", dim: "#a9b7d8", faint: "#7083ad",
      accent: "#ffb627", gold: "#ffd866", wkt: "#ff5d73", notout: "#7fd6ff", four: "#7fd6ff",
      t95: "#ffd24a", t90: "#c7a4ff", t85: "#6fe39a", glow: "150,190,255", glowA: 0.18 },
    wc: { bg: "#1c0b2b", line: "#4d2675", board: "#0c0414", chalk: "#f4edf9", dim: "#c6b0d9", faint: "#9179a8",
      accent: "#ffb627", gold: "#ffd866", wkt: "#ff5d73", notout: "#7fd6ff", four: "#7fd6ff",
      t95: "#ffd24a", t90: "#dcbcff", t85: "#6fe39a", glow: "255,80,190", glowA: 0.24 },
  };
  // board-only colours (always on the dark scoreboard)
  const LED = "#ffb627", LED_DIM = "#7a5a1c", BOARD_WKT = "#ff5468", BOARD_GOLD = "#ffd866";
  const C = Object.assign({}, PALETTES.night);
  const F = {
    display: '"Big Shoulders Display","Arial Narrow",Impact,sans-serif',
    body: '"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif',
    led: '"DotGothic16","Courier New",monospace',
  };
  const HOW = { c: "caught", b: "bowled", lbw: "lbw", ro: "run out", st: "stumped" };

  async function fontsReady() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`900 80px ${F.display}`), document.fonts.load(`800 40px ${F.display}`),
          document.fonts.load(`400 40px ${F.led}`), document.fonts.load(`400 28px ${F.body}`),
          document.fonts.load(`700 28px ${F.body}`),
        ]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch (e) {}
  }

  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  async function makeScorecard(res, info) {
    await fontsReady();
    Object.assign(C, PALETTES[info.theme] || PALETTES.night);
    const W = 1080, P = 64;
    const played = res.bat.filter((b) => b.b > 0 || b.in || b.out);
    const dnb = res.bat.filter((b) => !(b.b > 0 || b.in || b.out));
    const rowH = 74;
    const H = 2800; // drawn tall, then cropped to the content
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // ground
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, -80, 40, W / 2, -80, 760);
    glow.addColorStop(0, `rgba(${C.glow},${C.glowA})`); glow.addColorStop(1, `rgba(${C.glow},0)`);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 700);
    for (let x = 64; x < W; x += 128) { ctx.fillStyle = "rgba(255,255,255,0.014)"; ctx.fillRect(x, 0, 64, H); }

    // header
    let y = P + 44;
    ctx.fillStyle = C.chalk; ctx.font = `900 54px ${F.display}`;
    ctx.fillText("THE CHASE 300", P, y);
    const titleW = ctx.measureText("THE CHASE 300").width;
    ctx.textAlign = "right"; ctx.fillStyle = C.dim; ctx.font = `600 22px ${F.body}`;
    ctx.fillText(fit(ctx, (info.competition || "").toUpperCase(), W - 2 * P - titleW - 32), W - P, y - 4);
    ctx.textAlign = "left";
    y += 22;
    ctx.fillStyle = C.faint; ctx.font = `400 24px ${F.body}`;
    ctx.fillText("Chasing 301 off 120 balls · opposition 300/0", P, y + 18);

    // scoreboard block
    y += 48;
    const boxH = 230;
    ctx.fillStyle = C.board; roundRect(ctx, P, y, W - 2 * P, boxH, 14); ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.shadowColor = "rgba(255,182,39,0.55)"; ctx.shadowBlur = 26;
    ctx.fillStyle = res.won ? BOARD_GOLD : LED; ctx.font = `400 136px ${F.led}`;
    ctx.fillText(`${res.runs}/${res.wk}`, P + 36, y + 150);
    ctx.restore();
    const ov = Math.floor(res.legal / 6) + "." + (res.legal % 6);
    ctx.fillStyle = LED_DIM; ctx.font = `400 30px ${F.led}`;
    ctx.fillText(`${ov} OV`, P + 40, y + 200);
    ctx.textAlign = "right";
    ctx.fillText(`TARGET 301`, W - P - 36, y + 200);
    ctx.fillStyle = res.won ? BOARD_GOLD : BOARD_WKT; ctx.font = `900 46px ${F.display}`;
    ctx.fillText(res.won ? "CHASED" : (300 - res.runs <= 0 ? "TIED" : `${301 - res.runs} SHORT`), W - P - 36, y + 72);
    ctx.textAlign = "left";

    // verdict
    y += boxH + 60;
    ctx.fillStyle = res.won ? C.accent : C.wkt; ctx.fillRect(P, y - 40, 6, 92);
    ctx.fillStyle = C.chalk; ctx.font = `900 50px ${F.display}`;
    ctx.fillText(fit(ctx, info.verdictTitle.toUpperCase(), W - 2 * P - 28), P + 26, y);
    ctx.fillStyle = C.dim; ctx.font = `400 25px ${F.body}`;
    wrap(ctx, info.verdictText, P + 26, y + 40, W - 2 * P - 28, 33, 2);

    // ratings strip
    y += 116;
    const R = res.R;
    const stats = [["ANCHOR", R.anc], ["POWER", R.pow], ["BOWLING", R.bwl]];
    const colW = (W - 2 * P) / 4;
    stats.forEach(([l, v], i) => {
      ctx.fillStyle = C.faint; ctx.font = `700 18px ${F.body}`; ctx.fillText(l, P + i * colW, y);
      ctx.fillStyle = tierColor(v); ctx.font = `400 40px ${F.led}`; ctx.fillText(v.toFixed(0), P + i * colW, y + 44);
    });
    ctx.fillStyle = C.faint; ctx.font = `700 18px ${F.body}`; ctx.fillText("CAPTAIN", P + 3 * colW, y);
    ctx.fillStyle = C.chalk; ctx.font = `700 26px ${F.body}`;
    ctx.fillText(fit(ctx, R.captain ? R.captain.name : "None", colW), P + 3 * colW, y + 40);

    // worm
    y += 84;
    const wormH = 170;
    drawWorm(ctx, res, P, y, W - 2 * P, wormH);

    // batting table
    y += wormH + 56;
    const cols = [
      { x: P, a: "left" }, { x: P, a: "left" },
      { x: W - P - 330, a: "right" }, { x: W - P - 245, a: "right" }, { x: W - P - 165, a: "right" },
      { x: W - P - 90, a: "right" }, { x: W - P, a: "right" },
    ];
    const head = ["BATTER", "", "R", "B", "4S", "6S", "SR"];
    ctx.font = `700 18px ${F.body}`; ctx.fillStyle = C.faint;
    head.forEach((h, i) => { ctx.textAlign = cols[i].a; ctx.fillText(h, cols[i].x, y); });
    ctx.textAlign = "left";
    ctx.fillStyle = C.line; ctx.fillRect(P, y + 14, W - 2 * P, 2);
    y += 14;
    played.forEach((b) => {
      y += rowH;
      const no = !b.out;
      const nameCol = no ? C.notout : C.chalk;
      let name = b.p.name + (no ? "*" : "") + (b.p === R.captain ? " (c)" : "");
      ctx.font = `700 28px ${F.body}`;
      let nx = P;
      if (b.p.pott) { ctx.fillStyle = C.gold; ctx.fillText("★", nx, y); nx += 32; }
      ctx.fillStyle = b.p.pott && !no ? C.gold : nameCol;
      ctx.fillText(fit(ctx, name, cols[2].x - 90 - nx), nx, y - 10);
      ctx.font = `400 21px ${F.body}`; ctx.fillStyle = no ? C.notout : C.faint;
      ctx.fillText(fit(ctx, (no ? "not out" : HOW[b.out]) + `  ·  ${abbr(b.p.team)} ${b.p.year}`, cols[2].x - 90 - P), P, y + 20);
      const vals = [b.r, b.b, b.f, b.s, b.b ? ((b.r / b.b) * 100).toFixed(0) : "–"];
      vals.forEach((v, i) => {
        ctx.textAlign = "right";
        ctx.font = i === 0 ? `400 30px ${F.led}` : `400 24px ${F.led}`;
        ctx.fillStyle = i === 0 ? (no ? C.notout : C.accent) : i === 3 && b.s ? C.accent : i === 2 && b.f ? C.four : C.chalk;
        ctx.fillText(String(v), cols[i + 2].x, y + 4);
      });
      ctx.textAlign = "left";
      ctx.fillStyle = C.line;
      for (let x = P; x < W - P; x += 12) ctx.fillRect(x, y + 36, 6, 1);
    });
    y += 78;
    ctx.font = `400 22px ${F.body}`; ctx.fillStyle = C.dim;
    const extrasLine = `Extras ${res.extras}` + (dnb.length ? `   ·   Did not bat: ${dnb.map((b) => b.p.name).join(", ")}` : "");
    const lines = wrap(ctx, extrasLine, P, y, W - 2 * P, 30, 2);
    y += (lines - 1) * 30;

    // crop to content, then footer
    const Hf = Math.round(y + 140);
    const out = document.createElement("canvas");
    out.width = W; out.height = Hf;
    const c2 = out.getContext("2d");
    c2.drawImage(cv, 0, 0);
    footer(c2, W, Hf, P, info);
    return out;
  }

  function footer(ctx, W, H, P, info) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, H - 88, W, 88);
    ctx.fillStyle = C.line; ctx.fillRect(0, H - 88, W, 2);
    ctx.fillStyle = C.faint; ctx.font = `400 22px ${F.body}`;
    ctx.fillText("Draft your XI and chase 301", P, H - 38);
    ctx.textAlign = "right"; ctx.fillStyle = C.accent; ctx.font = `800 28px ${F.display}`;
    ctx.fillText(fit(ctx, (info.site || "").toUpperCase(), W / 2), W - P, H - 36);
    ctx.textAlign = "left";
  }

  const ABBR = {
    "Chennai Super Kings": "CSK", "Mumbai Indians": "MI", "Royal Challengers Bangalore": "RCB", "Royal Challengers Bengaluru": "RCB",
    "Kolkata Knight Riders": "KKR", "Sunrisers Hyderabad": "SRH", "Delhi Daredevils": "DD", "Delhi Capitals": "DC",
    "Kings XI Punjab": "KXIP", "Punjab Kings": "PBKS", "Rajasthan Royals": "RR", "Deccan Chargers": "Deccan",
    "Gujarat Titans": "GT", "Gujarat Lions": "GL", "Lucknow Super Giants": "LSG", "Kochi Tuskers Kerala": "Kochi",
    "Pune Warriors India": "PWI", "Rising Pune Supergiants": "RPS", "Rising Pune Supergiant": "RPS",
    "South Africa": "SA", "New Zealand": "NZ", "Sri Lanka": "SL", "West Indies": "WI", "Afghanistan": "AFG", "Bangladesh": "BAN",
    "Netherlands": "NED", "Zimbabwe": "ZIM", "Australia": "AUS", "England": "ENG", "Pakistan": "PAK", "Scotland": "SCO", "Ireland": "IRE", "Namibia": "NAM",
  };
  const abbr = (t) => ABBR[t] || (t.length > 11 ? t.split(" ").map((w) => w[0]).join("") : t);

  function tierColor(v) { return v >= 95 ? C.t95 : v >= 90 ? C.t90 : v >= 85 ? C.t85 : C.chalk; }

  function drawWorm(ctx, res, x0, y0, w, h) {
    const L = 46, B = 30;
    const X = (o) => x0 + L + (o / 20) * (w - L - 8);
    const Y = (r) => y0 + h - B - (Math.min(r, 320) / 320) * (h - B - 6);
    ctx.font = `400 18px ${F.body}`; ctx.fillStyle = C.faint;
    [100, 200, 300].forEach((v) => {
      ctx.fillStyle = C.line; ctx.fillRect(x0 + L, Y(v), w - L - 8, 1);
      ctx.fillStyle = C.faint; ctx.textAlign = "right"; ctx.fillText(String(v), x0 + L - 10, Y(v) + 6);
    });
    ctx.textAlign = "center";
    [0, 5, 10, 15, 20].forEach((o) => ctx.fillText(String(o), X(o), y0 + h - 4));
    ctx.textAlign = "left";
    ctx.setLineDash([8, 8]); ctx.strokeStyle = C.wkt; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(20), Y(301)); ctx.stroke(); ctx.setLineDash([]);
    const pts = [[0, 0]].concat(res.overs.map((o) => [o.over, o.runs]));
    ctx.beginPath(); pts.forEach(([o, r], i) => (i ? ctx.lineTo(X(o), Y(r)) : ctx.moveTo(X(o), Y(r))));
    const last = pts[pts.length - 1];
    ctx.lineTo(X(last[0]), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); pts.forEach(([o, r], i) => (i ? ctx.lineTo(X(o), Y(r)) : ctx.moveTo(X(o), Y(r))));
    ctx.strokeStyle = C.accent; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.stroke();
    res.fow.forEach((f) => { ctx.fillStyle = C.wkt; ctx.beginPath(); ctx.arc(X(f.ball / 6), Y(f.runs), 6, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(X(last[0]), Y(last[1]), 7, 0, Math.PI * 2); ctx.fill();
  }

  function wrap(ctx, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(" "); let line = "", n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        n++;
        if (n === maxLines) { ctx.fillText(fit(ctx, line + " " + words.slice(i).join(" "), maxW), x, y); return n; }
        ctx.fillText(line, x, y); y += lh; line = words[i];
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
    return n + 1;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  window.makeScorecard = makeScorecard;
})();
