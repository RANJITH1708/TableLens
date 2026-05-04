# TableLens — Edit, Visualize & Export Web Tables

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/lahononablbbfocabaeliibgiicgbjkl?label=Chrome%20Web%20Store&logo=google-chrome&color=4285F4)](https://chromewebstore.google.com/detail/tablelens-edit-visualize/lahononablbbfocabaeliibgiicgbjkl)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lahononablbbfocabaeliibgiicgbjkl?label=Users&color=34A853)](https://chromewebstore.google.com/detail/tablelens-edit-visualize/lahononablbbfocabaeliibgiicgbjkl)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)

> Bring spreadsheet-level power to any table on the web. Sort, filter, edit, chart, and export HTML tables directly in your browser — no copy-pasting required.

## Install

[**→ Add to Chrome**](https://chromewebstore.google.com/detail/tablelens-edit-visualize/lahononablbbfocabaeliibgiicgbjkl)

## Features

- **In-place editing** — click any cell to edit table data directly on the page
- **Sort & filter** — sort columns ascending/descending and filter rows by keyword
- **Charts** — visualize table data as bar, line, or pie charts powered by Chart.js
- **Export to Excel** — download the full table as a `.xlsx` spreadsheet in one click
- **Export to CSV** — save raw data as comma-separated values for any tool
- **Export to PDF** — generate a formatted PDF with auto-table layout via jsPDF
- **Export to Word** — save styled tables as `.docx` documents
- **Works everywhere** — activates on any HTML table across the entire web
- **Privacy-first** — all processing happens locally in your browser; no data ever leaves your device

## How It Works

TableLens injects a lightweight toolbar alongside any HTML `<table>`. Click the extension icon on any page, then use the panel to sort, filter, edit cells inline, generate charts from selected columns, or export the data in your preferred format — all without leaving the site.

## Getting Started (Development)

```bash
git clone https://github.com/RANJITH1708/TableLens.git
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the cloned folder
4. Navigate to any webpage containing a table and click the TableLens icon

## Project Structure

| File / Folder | Purpose |
|---|---|
| `manifest.json` | Extension config — permissions, icons, entry points (Manifest V3) |
| `content.js` | Injected script — detects and wraps HTML tables |
| `background.js` | Service worker — handles cross-tab messaging and state |
| `injected-ui.js/html/css` | TableLens toolbar and panel UI |
| `offscreen.js/html` | Offscreen document used for file generation (xlsx, docx, pdf) |
| `options.html/js` | Extension options page |
| `lib/` | Bundled libraries — Chart.js, jsPDF, xlsx, docx.js, PapaParse, Boxicons |

## Contributing

Contributions are very welcome — bug fixes, new export formats, UI improvements, and more.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

- **Bug reports** → [open an issue](https://github.com/RANJITH1708/TableLens/issues/new?template=bug_report.md)
- **Feature requests** → [open an issue](https://github.com/RANJITH1708/TableLens/issues/new?template=feature_request.md)
- **Pull requests** → fork the repo, create a branch, and submit a PR

## License

[MIT](LICENSE) © Ranjith Saila
