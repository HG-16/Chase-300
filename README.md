# The Chase 300

The opposition made 300/0 in 20 overs. Spin for a real squad, from every T20 World Cup (2007 to 2026) or every IPL season (2008 to 2026), draft eleven players into the batting slots they actually filled, and chase 301 ball by ball.

Plain HTML, CSS and JavaScript. No build step, no framework, no server code. It runs on GitHub Pages for free.

## What's in the folder

```
index.html          The Chase 300
perfect-ssn.html    Perfect Season (the IPL season game)
css/style.css       all styling
js/engine.js        ratings and the 120-ball chase simulation
js/app.js           the draft, the live chase, scorecard and honours board
js/share.js         draws the shareable PNG scorecard
js/flags.js         small flags for the Nation picker
js/config.js        which squad files to offer, plus optional leaderboard keys
data/squads.json    every T20 World Cup squad, 2007 to 2026
data/ipl.json       every IPL franchise, every season, 2008 to 2026
favicon.svg         tab icon
img/                trophy images for the edition picker
.nojekyll           tells GitHub Pages to serve files as they are
```

The site is dynamic: the page fetches the squad file when it loads and builds every squad, card and rating from it. Edit a file, push, and the game changes. No code edits needed.

## Squad files and the competition switch

The buttons at the top of the game (T20 World Cup / IPL) come from `js/config.js`:

```js
window.CHASE300_SETS = [
  { id: "wc", label: "T20 World Cup", short: "World Cup", file: "data/squads.json", trophy: "img/trophy-wc.png", theme: "wc" },
  { id: "ipl", label: "IPL", short: "IPL", file: "data/ipl.json", trophy: "img/trophy-ipl.png", theme: "ipl" },
];
window.CHASE300_DEFAULT_SET = "wc";
```

- **Add your own set** (BBL, PSL, an all-time XI pool, your college league): copy `data/ipl.json`, change the squads, save it as `data/mine.json`, and add `{ id: "mine", label: "My League", file: "data/mine.json" }` to the list.
- **Picker and colours**: the picker sits in the top-right corner. `short` is the button text and `trophy` is the small image beside it; replace `img/trophy-wc.png` or `img/trophy-ipl.png` with your own square PNG (64px or bigger) to change them. `theme` sets the page colours: `"wc"` is purple, `"ipl"` is blue, and leaving it out gives the original night green. The shared scorecard image follows the same colours.
- **Start over**: the small 300/0 scoreboard in the top-left corner resets the draft at any time.
- **Remove a set**: delete its line. With only one set, the switch hides itself.
- **Link straight to a set**: add `#` and its id to the address, e.g. `https://you.github.io/chase300/#ipl`.
- The switch is locked mid-draft so a half-built XI isn't lost; it unlocks after the chase.

Each file starts with a `meta` block that sets the intro text and record facts shown on the page:

```json
"meta": {
  "competition": "IPL", "short": "IPL",
  "blurb": "Spin for a real IPL franchise season...",
  "facts": [["287", "Highest IPL total: SRH v RCB, Bengaluru 2024"]]
}
```

## Put it on GitHub Pages

1. **Create a GitHub account** at github.com if you don't have one.
2. **Create a repository.** Click **New** (top left on github.com), name it something like `chase300`, set it to **Public**, and click **Create repository**.
3. **Upload the files.** On the new repo page, click **uploading an existing file**. Drag in everything from this folder, including the `css`, `js` and `data` folders. Make sure `index.html` sits at the top level of the repo, not inside another folder. Click **Commit changes**.
   - `.nojekyll` is a hidden file. If your file browser hides it, you can skip it; the site still works.
4. **Turn on Pages.** In the repo, go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then click **Save**.
5. **Wait a minute or two**, then refresh the Pages settings screen. It shows your live address, which looks like:
   `https://YOUR-USERNAME.github.io/chase300/`

Every time you push a change, GitHub republishes the site within a minute or two.

### Using git instead of the upload page

```bash
cd chase300
git init
git add .
git commit -m "The Chase 300"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/chase300.git
git push -u origin main
```

Then do step 4 above.

### Custom domain (optional)

Buy a domain (for example `chase300.in`), then in **Settings → Pages → Custom domain** enter it and follow GitHub's DNS instructions. Tick **Enforce HTTPS** once it's available.

## Modes

Each squad file can offer modes, chosen before the first spin. They are listed in the file's `meta.modes`.

**IPL**
- **Easy**: draft anyone.
- **Authentic**: real IPL rules, at most 4 overseas players in your XI. Overseas players carry an **OS** tag, the line-up shows the count (e.g. `3/4 overseas`), and once you have 4 the rest are blocked. Comes from `"overseas": 4` on the mode and each player's `"overseas": true`.

**T20 World Cup**
- **Authentic**: every spin can land on any squad from any World Cup.
- **Nation**: pick a country first (each shown with its flag), then every spin lands on one of that country's World Cup squads. Only nations with at least `minSquads` (4) squads are offered. If no squad of that nation can fill your remaining slots, the game offers one spin from any nation.

Each mode (and each nation) keeps its own best score and honours board. Flags live in `js/flags.js`; add one for a new team with `window.CHASE300_FLAGS["Team"] = '<svg ...>'`.

## My chases

The counter next to the 300/0 logo shows how many times you have chased 301. Every successful chase is saved in your browser with its full scorecard (up to 100). Tap the counter to see them, fastest first; open one to see the batting card, make its scorecard image again, or delete it. They live in this browser only, so another phone or a cleared browser starts at 0.

## Perfect Season (second game)

`perfect-ssn.html` is a second game on the same site, at `https://YOUR-USERNAME.github.io/chase300/perfect-ssn.html`. The two pages link to each other.

- **Draft**: the same draft as The Chase 300. IPL has Easy and Authentic (max 4 overseas) modes.
- **Season**: your XI joins nine real IPL squads from random years. 70 league matches (14 each), then Qualifier 1, Eliminator, Qualifier 2 and the final. Play your matches one at a time or sim ahead.
- **World Cup edition**: switch at the top right. Same World Cup draft (Authentic or Nation mode), then a ten-team World Cup: everyone plays everyone once (9 matches each), top four to the semi-finals (1st v 4th, 2nd v 3rd), then the final. A perfect World Cup is 11-0. In Nation mode your own country sits out as an opponent.
- **Real bowling**: your five best BWL ratings bowl four overs each, so a side without bowlers gets hit.
- **Stats**: every match has a scorecard for your side; tabs show the league table with net run rate, your batting and bowling figures, and awards (Orange Cap, Purple Cap, MVP).
- **Perfect season**: win all 14 league matches, Qualifier 1 and the final, 16-0. Your best season and number of perfect seasons are kept in your browser.

It uses `data/ipl.json`, so squad or rating edits change both games. Its code is `js/season-engine.js` (match and season simulation) and `js/season.js` (the page).

## Sharing a scorecard

After every chase, **Share scorecard** draws the result as a 1080px-wide PNG: final score, verdict, team ratings, the run-rate chart and the full batting card. Players can then:

- **Share image**: opens the phone's share sheet (WhatsApp, Instagram, X…). It appears only on browsers that support sharing files, which is most phones.
- **Download PNG**: saves the file.
- **Copy image**: puts it on the clipboard to paste into a chat.

The site name printed at the bottom of the image is your site's address. To print something else, set `siteName` in `js/config.js`.

## Run it on your own computer

The page loads `data/squads.json` with `fetch`, which browsers block for files opened straight from disk. Start a tiny local server in this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Editing squads and ratings

Each player in `data/squads.json` looks like this:

```json
{ "name": "MS Dhoni", "slots": "4-6", "bat": 80, "pow": 82, "bwl": 0, "keeper": true, "captaincy": 95 }
```

- `slots` is the range of batting positions he can be placed in (`"3"` for a single slot).
- `bat`, `pow`, `bwl` are raw 0 to 100 ratings. The game lifts them for display (80 shows as 88), and the chase engine uses the raw values.
- `keeper: true` marks a wicketkeeper.
- `captaincy` is only on the squad's captain. It is never shown in the game. You can draft several captains; the one with the highest captaincy leads automatically. After a wicket, the side is wobbly for about two overs; a higher captaincy keeps that wobble small. With no captain the game uses 35, so collapses come in clusters.
- A golden card is the Player of the Tournament (World Cup) or MVP (IPL), set by `pott` in the `editions` block. That block also sets each season's `host` and `champ` (the champions tag).

To add a squad, copy an existing squad block, change `year`, `team` and the players, and push. To add a new World Cup, add its year to `editions` too.

## Optional: an online honours board

Without this, each player's best score is kept only in their own browser. To share a top 10 across everyone, use a free [Supabase](https://supabase.com) database:

1. Create a free Supabase project.
2. Open **SQL Editor**, paste this and click **Run**:

```sql
create table scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  comp text not null default 'wc',
  name text not null check (char_length(name) between 1 and 20),
  runs int not null check (runs between 0 and 340),
  wk int not null check (wk between 0 and 10),
  balls int not null check (balls between 1 and 120),
  won boolean not null,
  score int not null check (score between 0 and 1120),
  captain text,
  xi text check (char_length(xi) < 800)
);

alter table scores enable row level security;
create policy "anyone can read scores" on scores for select using (true);
create policy "anyone can post a score" on scores for insert with check (true);
```

3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. Paste them into `js/config.js`:

```js
window.CHASE300_CONFIG = {
  supabaseUrl: "https://abcd1234.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...",
};
```

If you already created the table before the IPL update, add the new column with:

```sql
alter table scores add column comp text not null default 'wc';
```

5. Push. An **Honours board** panel appears under the game (one board per competition), and after each chase players can post their score. Successful chases rank first (fastest chase on top), then the highest totals.

The anon key is designed to be public; the row-level security rules above only allow reading and adding scores, not editing or deleting them. Scores are submitted by the browser, so a determined person could post a fake one. For a fan game that's usually fine; you can delete bad rows from Supabase's **Table Editor**.

## Credits

Unofficial fan-made game, not affiliated with the ICC, any cricket board, team or player. Ratings are fan estimates, not official data.
