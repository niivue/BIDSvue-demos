# BIDSvue Demos

Hands-on tutorials for [BIDSvue](https://github.com/niivue/BIDSvue) — creating, curating, de-identifying, and sharing BIDS datasets.

The tutorials are written as plain, GitHub-readable Markdown. A small build step compiles them into a styled static site (light/dark themes, BIDSvue's accent colors, and each numbered step rendered as its own panel) that is published to **GitHub Pages**.

## Tutorials

- [Convert ReproIn MRI to BIDS](./mri-reproin-1/README.md) — turn a folder of ReproIn-named DICOMs into a validated, de-identified, shareable dataset.
- [From MEG to BIDS](./meg-mne-1/README.md) — use the MNE-BIDS plug-in to create, edit, and share a BIDS dataset.
- [Convert PET to BIDS](./pet-pet2bids-1/README.md) — use PET2BIDS to create, edit, and share a BIDS dataset.
- [Explore a DataLad dataset](./datalad-1/README.md) — clone a huge remote dataset and fetch only the files you need.
- [View MRS](./mrs-dcm-1/README.md) — convert MRS DICOMs and read the metabolite peaks in the spectrum.
- [Embedded physiological recordings](./mri-physio-1/README.md) — import and inspect physiological measures acquired with MRI, and refine with AI.

## Reading the tutorials

Every tutorial folder holds a `README.md` plus its screenshots, so you can read it right here on GitHub. The published site simply gives the same content a nicer home.

## Writing a new tutorial

1. Create a folder (e.g. `my-tutorial/`) with a `README.md` and its images.
2. Follow the panel convention — it stays ordinary Markdown:

   ```markdown
   # Tutorial title
   A short intro paragraph becomes the page lead.

   ## Requirements
   - …a plain prose panel…

   ## 1. First step
   Explain the step, then drop in a screenshot:

   ![Caption shown under the image](my-screenshot.png)

   ## 2. Second step
   …
   ```

   - A `# Heading` is the page title.
   - Text before the first `##` becomes the lead.
   - A `## N. …` heading becomes a **numbered step panel**; a screenshot in it floats into an alternating column with the accent glow.
   - Any other `##` heading becomes a plain prose panel.
   - GitHub alerts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`) render as callouts.
3. Register it in [`site.config.ts`](./site.config.ts) under `tutorials` (title, summary, tags, duration) so it appears on the landing page.

The build reads each screenshot's real dimensions and emits `<img width/height>` so images reserve their space up front (no layout shift), and it **warns at build time if a referenced image is missing** — so typos surface before they 404 on the live site.

## Local development

Requires [Bun](https://bun.sh).

```bash
bun install        # first time only (also activates the pre-commit hook)
bun run dev        # build + serve at http://localhost:5173 with live reload
bun run build      # compile the static site into dist/
bun run preview    # build, then serve dist/ exactly as Pages will
bun run typecheck  # tsc --noEmit
bun run test       # bun test
```

Editing any Markdown file, a screenshot, or the assets while `bun run dev` is running rebuilds the site and reloads the browser. Changing `site.config.ts` needs a dev restart (the running process keeps the cached config module).

A version-controlled **pre-commit hook** (`.githooks/pre-commit`) runs `bun run typecheck` and blocks commits that don't type-check. `bun install` points `core.hooksPath` at `.githooks` via the `prepare` script; if you cloned without installing, run `git config core.hooksPath .githooks` once. Bypass a single commit with `git commit --no-verify`.

## Deploying

Pushing to `main` runs the [GitHub Actions workflow](./.github/workflows/deploy.yml), which builds the site and deploys `dist/` to GitHub Pages. Enable it once under **Settings → Pages → Build and deployment → Source → GitHub Actions**.

## Design

The look and feel is drawn from BIDSvue itself: the same system font, the same six accent schemes (Orange by default, plus Sage, Garnet, Periwinkle, Violet, and Indigo), and matching light/dark surfaces.

The chrome is two small floating ribbons rather than full-width bars:

- A **nav ribbon** in the top-left corner — "BIDSvue demos", plus links to the tutorials, the source repo, and downloads. On the home page it carries an accent **"Peek at BIDSvue" drawer** that slides out of the ribbon's right edge and opens the app splash in the lightbox.
- A **controls ribbon** in the bottom-right corner — the accent swatches and the light/dark toggle. Your theme and accent choices are remembered.

The accent color also tints the translucent glow around each numbered step's screenshot, and clicking any screenshot opens it enlarged in a lightbox over a blurred backdrop (click anywhere or press <kbd>Esc</kbd> to close).
