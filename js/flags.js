// Small hand-drawn SVG flags for the Nation picker (30x20). Keyed by squad team name.
// Add one for a new team with: window.CHASE300_FLAGS["Team name"] = '<svg ...>';
(function () {
  const svg = (body) => `<svg class="flag" viewBox="0 0 30 20" width="30" height="20" aria-hidden="true">${body}<rect width="30" height="20" fill="none" stroke="rgba(0,0,0,.25)"/></svg>`;
  const tri = (a, b, c) => `<rect width="30" height="6.67" fill="${a}"/><rect y="6.67" width="30" height="6.67" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>`;
  const vtri = (a, b, c) => `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
  const star = (cx, cy, r, fill) => {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
      d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(2) + " " + (cy + rr * Math.sin(a)).toFixed(2);
    }
    return `<path d="${d}Z" fill="${fill}"/>`;
  };
  const unionJack = `<rect width="15" height="10" fill="#012169"/><path d="M0 0L15 10M15 0L0 10" stroke="#fff" stroke-width="2"/><path d="M0 0L15 10M15 0L0 10" stroke="#C8102E" stroke-width=".8"/><path d="M7.5 0v10M0 5h15" stroke="#fff" stroke-width="3"/><path d="M7.5 0v10M0 5h15" stroke="#C8102E" stroke-width="1.6"/>`;
  const F = {
    "India": svg(tri("#FF9933", "#fff", "#138808") + `<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".7"/><circle cx="15" cy="10" r=".6" fill="#000080"/>`),
    "Pakistan": svg(`<rect width="30" height="20" fill="#01411C"/><rect width="7.5" height="20" fill="#fff"/><circle cx="19" cy="10" r="5" fill="#fff"/><circle cx="20.6" cy="8.9" r="4.3" fill="#01411C"/>` + star(21.6, 7.6, 1.7, "#fff")),
    "Australia": svg(`<rect width="30" height="20" fill="#012169"/>` + unionJack + star(7.5, 15, 2.2, "#fff") + star(22.5, 4, 1.1, "#fff") + star(19.5, 9, 1.1, "#fff") + star(25.5, 8, 1.1, "#fff") + star(22.5, 16, 1.2, "#fff")),
    "New Zealand": svg(`<rect width="30" height="20" fill="#012169"/>` + unionJack + star(22.5, 4.5, 1.3, "#C8102E") + star(19.5, 9.5, 1.3, "#C8102E") + star(25.5, 8.5, 1.2, "#C8102E") + star(22.5, 15.5, 1.4, "#C8102E")),
    "South Africa": svg(`<rect width="30" height="10" fill="#E03C31"/><rect y="10" width="30" height="10" fill="#001489"/><path d="M0 0L13 10L0 20" fill="#fff"/><path d="M0 0L13 10L0 20M13 10H30" stroke="#fff" stroke-width="6"/><path d="M0 0L13 10L0 20M13 10H30" stroke="#007749" stroke-width="3.6" fill="none"/><path d="M0 2.5L9.5 10L0 17.5Z" fill="#FFB81C"/><path d="M0 4L7.6 10L0 16Z" fill="#000"/>`),
    "Sri Lanka": svg(`<rect width="30" height="20" fill="#FFBE29"/><rect x="1" y="1" width="3.5" height="18" fill="#00534E"/><rect x="4.5" y="1" width="3.5" height="18" fill="#EB7400"/><rect x="9" y="1" width="20" height="18" fill="#8D153A"/><path d="M14 13c1-3 3-5 6-5 2 0 3 1 4 3l-1 3h-8z" fill="#FFBE29"/>`),
    "England": svg(`<rect width="30" height="20" fill="#fff"/><path d="M15 0v20M0 10h30" stroke="#CE1124" stroke-width="4"/>`),
    "West Indies": svg(`<rect width="30" height="20" fill="#7B0A2A"/><rect y="15" width="30" height="2" fill="#F2B705"/><rect y="3" width="30" height="2" fill="#F2B705"/>`),
    "Bangladesh": svg(`<rect width="30" height="20" fill="#006A4E"/><circle cx="13.5" cy="10" r="5.6" fill="#F42A41"/>`),
    "Afghanistan": svg(vtri("#000", "#D32011", "#007A36") + `<circle cx="15" cy="10" r="3.6" fill="none" stroke="#fff" stroke-width=".9"/><rect x="13.6" y="8.4" width="2.8" height="2.6" fill="#fff"/>`),
    "Ireland": svg(vtri("#169B62", "#fff", "#FF883E")),
    "Zimbabwe": svg(`<rect width="30" height="20" fill="#319208"/><rect y="2.86" width="30" height="2.86" fill="#FFD200"/><rect y="5.71" width="30" height="2.86" fill="#DE2010"/><rect y="8.57" width="30" height="2.86" fill="#000"/><rect y="11.43" width="30" height="2.86" fill="#DE2010"/><rect y="14.29" width="30" height="2.86" fill="#FFD200"/><path d="M0 0L11 10L0 20Z" fill="#fff" stroke="#000" stroke-width=".5"/>` + star(4.2, 10, 2.4, "#DE2010")),
    "Netherlands": svg(tri("#AE1C28", "#fff", "#21468B")),
    "Scotland": svg(`<rect width="30" height="20" fill="#005EB8"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="3.2"/>`),
    "USA": svg(`<rect width="30" height="20" fill="#fff"/>` + [0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 20) / 13}" width="30" height="${20 / 13}" fill="#B22234"/>`).join("") + `<rect width="12" height="10.77" fill="#3C3B6E"/>` + [[2, 2], [5, 2], [8, 2], [3.5, 4.5], [6.5, 4.5], [2, 7], [5, 7], [8, 7], [3.5, 9.3], [6.5, 9.3]].map(([x, y]) => `<circle cx="${x + 1}" cy="${y}" r=".6" fill="#fff"/>`).join("")),
    "Namibia": svg(`<rect width="30" height="20" fill="#009543"/><path d="M0 0H30L0 20Z" fill="#003580"/><path d="M0 20L30 0" stroke="#fff" stroke-width="7"/><path d="M0 20L30 0" stroke="#D21034" stroke-width="5"/><circle cx="6" cy="5" r="2.4" fill="#FFCE00"/>`),
  };
  window.CHASE300_FLAGS = Object.assign(F, window.CHASE300_FLAGS || {});
})();
