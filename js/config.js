// Squad files the game can load. Add your own by copying an entry and pointing "file" at a new JSON file in data/.
// id:     short and unique; also what goes after # in the address (e.g. yoursite/#ipl)
// label:  full name; short: what the picker button shows
// trophy: small PNG shown in the picker (swap in your own image, ideally square, 64px or larger)
// theme:  page colours: "wc" (purple), "ipl" (blue), or leave out for the default night green
window.CHASE300_SETS = [
  { id: "wc", label: "T20 World Cup", short: "World Cup", file: "data/squads.json", trophy: "img/trophy-wc.png", theme: "wc" },
  { id: "ipl", label: "IPL", short: "IPL", file: "data/ipl.json", trophy: "img/trophy-ipl.png", theme: "ipl" },
];
window.CHASE300_DEFAULT_SET = "wc";

// Optional online honours board.
// Leave both values empty to run without it (scores then stay in each player's own browser).
// To turn it on, create a free Supabase project, run the SQL in README.md, then paste the
// Project URL and the "anon public" key from Supabase > Project Settings > API below.
window.CHASE300_CONFIG = {
  // Name printed at the bottom of shared scorecard images. Empty = your site's address.
  siteName: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
};
