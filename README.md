# CTS on Web

Browser edition of **Comparison Timeline Studio**, prepared for automatic deployment with GitHub Pages.

## GitHub Pages mode

The default deployment is fully static:

- projects are stored in the browser with `localStorage`;
- templates, card editing, spreadsheet paste, CSV export, live preview, playback, timeline controls, model switching, image URLs, and JSON project import/export work without a server;
- routing uses URL hashes so refreshes and direct navigation work under `/ctsonweb/`;
- every push to `main` builds and deploys through GitHub Actions.

GitHub Pages cannot run FFmpeg, so H.264/AAC MP4 rendering remains an optional backend feature. To reconnect the CTS backend, add a repository Actions variable named `REACT_APP_BACKEND_URL` containing the backend origin, without `/api` at the end.

## First-time Pages activation

For a new repository, open **Settings → Pages** and set **Source** to **GitHub Actions** once. GitHub will then use `.github/workflows/deploy-pages.yml` for future deployments.

## Local development

```bash
cd frontend
npm install
npm start
```

Create a production build with:

```bash
npm run build
```

## Deployment

The workflow at `.github/workflows/deploy-pages.yml` builds pull requests for verification and deploys `frontend/build` after changes reach `main`.
