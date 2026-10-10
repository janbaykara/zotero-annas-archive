# Anna's Archive for Zotero

A Zotero plugin that downloads PDFs for library items with a DOI via [Anna's Archive SciDB](https://annas-archive.org/scidb).

Compatible with **Zotero 7–10**.

This project is a Zotero 7+/10 rewrite of the legacy [zotero-scihub](https://github.com/ethanwillis/zotero-scihub) overlay plugin, adapted for Anna's Archive SciDB.

## Install

1. Download the latest `.xpi` from the [Releases](https://github.com/JG8203/zotero-annas-archive/releases) page  
   (in Firefox, right-click → Save As).
2. In Zotero: **Tools → Plugins**.
3. Gear icon → **Install Plugin From File…** and choose the `.xpi`.
4. Restart Zotero if prompted.

## Usage

- Right-click item(s) → **Download PDF from Anna's Archive**
- Right-click a collection → **Download PDFs for Collection**
- **Tools → Update All PDFs from Anna's Archive**

New items with a DOI are downloaded automatically when that option is enabled in settings.

## Settings

Open **Zotero → Settings → Anna's Archive**:

- **SciDB Endpoint URL** — default `https://annas-archive.org/scidb/` (mirrors are supported)
- **Automatically download PDFs for new items**

## Development

Requires Node.js 20+.

```bash
npm install
npm start          # build + hot-reload against a local Zotero
npm run build      # production XPI in .scaffold/build/
```

## Disclaimer

Use this software in accordance with the laws of your jurisdiction. No warranties are provided.
