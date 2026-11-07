# The Chase 300

The opposition made 300/0 in 20 overs. Spin for a real T20 World Cup squad (2007 to 2026), draft eleven players into the batting slots they actually filled, and chase 301 ball by ball.

Plain HTML, CSS and JavaScript. No build step, no framework, no server code. It runs on GitHub Pages for free.

## What's in the folder

```
index.html          the page
css/style.css       all styling
js/engine.js        ratings and the 120-ball chase simulation
js/app.js           the draft, the live chase, scorecard and honours board
js/config.js        optional online leaderboard keys (empty by default)
data/squads.json    every squad and player rating, loaded when the page opens
favicon.svg         tab icon
.nojekyll           tells GitHub Pages to serve files as they are
```

The site is dynamic: the page fetches `data/squads.json` when it loads and builds every squad, card and rating from it. Edit that file, push, and the game changes. No code edits needed.

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
- A golden card is the Player of the Tournament, set by `pott` in the `editions` block at the top of the file.

To add a squad, copy an existing squad block, change `year`, `team` and the players, and push. To add a new World Cup, add its year to `editions` too.

## Optional: an online honours board

Without this, each player's best score is kept only in their own browser. To share a top 10 across everyone, use a free [Supabase](https://supabase.com) database:

1. Create a free Supabase project.
2. Open **SQL Editor**, paste this and click **Run**:

```sql
create table scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
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

5. Push. An **Honours board** panel appears under the game, and after each chase players can post their score. Successful chases rank first (fastest chase on top), then the highest totals.

The anon key is designed to be public; the row-level security rules above only allow reading and adding scores, not editing or deleting them. Scores are submitted by the browser, so a determined person could post a fake one. For a fan game that's usually fine; you can delete bad rows from Supabase's **Table Editor**.

## Credits

Unofficial fan-made game, not affiliated with the ICC, any cricket board, team or player. Ratings are fan estimates, not official data.
