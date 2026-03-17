# Flipping Market M15 — Trading Dashboard

A fully client-side trading analytics dashboard built for the **Flipping Market M15** methodology.  
No backend, no server, no dependencies to install — runs entirely in the browser.

---

## Features

- **Equity curve** with drawdown overlay, range selection, and day-click detail
- **Statistics Overview** — 9 KPIs in a single row: Trades, Win Rate, Avg R/Trade, Total R, Profit Factor, Max Drawdown, Win/Loss Streaks, BE Trades
- **Session & Day heatmap** — EV by session × weekday
- **Monthly P&L** — stacked or net bar chart
- **Setup / Session / Day / Pair / M15 Obstacles / H4 Obstacles** performance bars
- **Trade Sequence** — last 60 trades visualised with hover tooltip (pair, outcome, R, obstacles)
- **Selection widget** — click a day or drag a range on the equity chart to inspect trades
- **Trade Log** — sortable table with outcome-coloured rows
- **CSV Import** — drag & drop your Flipping Market M15 CSV (classic or Pro Template format)
- **4 filter presets** (P0–P3) + P4 No-Filters, each tunable
- **Drag & resize widgets** (GridStack), save/load custom layouts
- **Dark theme** with multiple colour variants

---

## Project Structure

```
/
├── index.html          ← Single-file dashboard (HTML + CSS + JS)
├── data/
│   └── sample_trades.json   ← Sample dataset (anonymised, 300 trades)
└── README.md
```

---

## Running Locally

> **Note:** Because the dashboard loads `data/sample_trades.json` via `fetch()`, you need a local web server — opening `index.html` directly as a `file://` URL will be blocked by the browser's CORS policy.

**Option 1 — Python (built-in, no install needed):**
```bash
cd flipping-dashboard
python3 -m http.server 8080
# Then open http://localhost:8080
```

**Option 2 — Node.js (npx):**
```bash
npx serve .
```

**Option 3 — VS Code Live Server extension:**  
Right-click `index.html` → *Open with Live Server*

---

## Deploying to GitHub Pages

1. **Push the project** to a GitHub repository (public or private with Pages enabled):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Enable GitHub Pages:**
   - Go to your repo → *Settings* → *Pages*
   - Source: **Deploy from a branch**
   - Branch: `main` / `root`
   - Click **Save**

3. **Access your dashboard** at:
   ```
   https://YOUR_USERNAME.github.io/YOUR_REPO/
   ```
   
   GitHub Pages usually deploys within 1–2 minutes.

---

## Using Your Own Data

The dashboard loads `data/sample_trades.json` on startup (anonymised demo data).  
To analyse your real trades, use the **Import CSV** button in the top bar.

Two CSV formats are supported — both detected automatically:

| Format | Key columns |
|--------|-------------|
| **Flipping Market M15** | `Résultat TP 1`, `RR TP 1`, `M15 Type`, `Obstacles M15`, `Actif`, `Session`, `Jour` |
| **Pro Template** | `Position Result`, `RR TP 1`, `M15 Confirmation / Continu`, `M15 Obstacles`, `Pair`, `Session`, `Day` |

Trades marked `Invalide` or `Bad feeling = Yes` are excluded automatically.

---

## Screenshots

*Add screenshots here after deployment.*

---

## License

MIT — free to use and modify.
