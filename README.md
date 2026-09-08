# Nonlocal Correlation

An interactive static visualization of two probabilistic systems and the correlations observed between them.

The project has two device-specific versions:

- `main` — the primary smartphone experience, designed for portrait touch interaction.
- `desktop` — a dedicated desktop interpretation with a wider field and pointer-aware observation.

## Personalise the session

Open [`experiment.js`](experiment.js) and edit the first configuration block:

```js
const CONFIG = {
  systemAName: "Théo",
  systemBName: "À CONFIGURER",
  experimentTitle: "ÉTUDE DE CORRÉLATION NON LOCALE",
  session: "01",
  variant: "mobile"
};
```

Change `systemBName` to the displayed recipient name. Keep `variant: "mobile"` on `main`; the `desktop` branch uses `variant: "desktop"`.

## Preview locally

Because this is a static site, it can be opened directly in a browser. A local server is more reliable for pointer and canvas behaviour:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` from the project directory.

## GitHub Pages

The repository is designed for GitHub Pages with no build step. In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and the root folder, then save.

The desktop version can be previewed locally after switching to the `desktop` branch, or published separately from that branch if desired.

## Files

- `index.html` — semantic document shell and accessible status regions.
- `styles.css` — visual system, responsive layout and motion states.
- `experiment.js` — configuration, interaction state machine and canvas visualization.
- `.nojekyll` — keeps GitHub Pages deployment direct and predictable.

There are no runtime dependencies, trackers, analytics, cookies, external assets or API calls.
