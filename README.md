# Eunsoo Cho: portfolio site

A static site for GitHub Pages. No build step, no dependencies, no cookies or analytics.

## Publish

1. Copy everything in this folder to the root of your Pages repository, keeping the folders as they are. The hidden `.nojekyll` file tells GitHub to serve the files as-is; if your upload skips it, the site still works.
2. In the repository, open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`.
3. After a minute, the site is live at `https://<username>.github.io/` (or `/<repository>/` for a project repository; all links are relative, so both work).

To preview on your own computer, run `python3 -m http.server` in this folder and open <http://localhost:8000>. Opening `index.html` directly mostly works, but some browsers block local font files.

## Where things are

| Path | What it holds |
| --- | --- |
| `index.html` | All of the content |
| `assets/css/site.css` | The design. Colors and fonts are set once, at the top |
| `assets/js/voice.js` | The formant synthesizer, phone-line simulation, spectrogram, and audio playback in the hero |
| `assets/js/charts.js` | The two charts. They read their numbers from the tables under them in `index.html` |
| `assets/js/site.js` | Navigation, project disclosure, publication filters, BibTeX copy, example tabs |
| `assets/Eunsoo_Cho_CV.pdf` | Public copy of the CV with the phone number removed |
| `assets/img/` | App icon |
| `assets/fonts/` | Font subsets and their licenses |
| `tools/build_fonts.py` | Rebuilds the font subsets (not needed for publishing) |

## Common edits

- **Change a number in a chart.** Edit the matching row of the table under the chart (`data-ledger-table` or `data-thesis-table`). Change both the `data-*` attribute and the visible cell; the chart redraws from the table.
- **Add a row to the gains-and-costs chart.** Add a `<tr>` with `data-target` (the project's `id`), `data-gain`, `data-general` (negative for a regression), `data-detail`, and `data-approx="true"` if the cost is approximate.
- **Add a project.** Copy a `<details class="entry">` block inside the right theme and give it a new `id`. Any link to `#that-id` opens it.
- **Add a publication.** Copy an `<li class="pub">` block. `data-tags` drives the filters: use `intl` or `domestic`, `journal` or `conference`, and `first` for first-author papers.
- **Replace the CV.** Overwrite `assets/Eunsoo_Cho_CV.pdf`, keeping the file name.
- **Link previews.** Social sites need an absolute image URL. Once you know the address, add `<meta property="og:image" content="https://<username>.github.io/assets/img/apple-touch-icon.png">` (or any image you add) to the `<head>`.

## Fonts

The text face is a subset of Charis SIL, made by SIL for linguists, which is why the IPA renders properly. The interface face is a subset of IBM Plex Sans. Korean uses subsets of IBM Plex Sans KR and Noto Serif CJK KR. All are under the SIL Open Font License. Charis SIL and IBM Plex have Reserved Font Names, so the subsets are renamed (`Eunsoo Text`, `Eunsoo UI`); see `assets/fonts/LICENSES.md`.

The subsets only contain the characters used today. New characters still display, in a fallback font. To embed them, run `tools/build_fonts.py` as described at the top of that file.
