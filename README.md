# Helix BOM

A simple, single-user BOM manager for the Helix drone: parts, multi-level BOM with cost roll-up, purchase orders, stock and spares, and a "can I build N?" check.

- **Your data stays in a folder you choose** (e.g. `OneDrive\Helix BOM`). OneDrive syncs it between computers.
- **The app is a web page** hosted free on GitHub Pages. Pushing a change to `main` publishes a new version, and open copies of the app show a “new version — reload” bar.
- Works in **Chrome or Edge on a computer** (it uses the browser’s folder access).

## What's in the data folder

| Path | What it is |
|---|---|
| `helix-bom-data.json` | Everything: parts, BOM, suppliers, orders, stock |
| `files/<PN or PO>/…` | Attachments: invoices, drawings, datasheets, STEP files |
| `backups/` | A copy of the data file from before every save (last 100) |

To undo a bad save, close the app, copy a file from `backups/` over `helix-bom-data.json`, and open the app again. OneDrive's own version history works too.

## Using two computers

Each time the app opens, or you switch back to its window, it checks for newer data from your other computer. If there is newer data and you have no unsaved changes, it loads it. If you do have unsaved changes, it asks which version to keep. Save before you walk away from a computer.

## Importing from Inventor

1. In Inventor: **Assemble › Bill of Materials › Export Bill of Materials**.
2. Choose the **Structured** view (all levels) and save as **.csv**.
3. In the app: **Settings › Import BOM from Inventor**, pick the file, check the changes, then **Apply**.

Parts are matched on **Part Number**. Lines you added by hand in the app, such as glue or cables, are kept when you re-import.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build in dist/
```

## One-time GitHub Pages setup

1. Push this folder to a GitHub repository (the free plan needs it to be **public**; your data is never in it).
2. In the repository: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
3. Every push to `main` now deploys to `https://<your-user>.github.io/<repo>/`.

## Security notes

- The page has a Content-Security-Policy with `connect-src 'self'`, so it cannot send data to other websites.
- No external scripts or fonts are loaded; all libraries are bundled.
- Keep 2-factor login on for both GitHub and your Microsoft account.
