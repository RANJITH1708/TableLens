# Contributing to TableLens

Thank you for your interest in contributing! Here is everything you need to get started.

## Ways to Contribute

- **Report a bug** — open an issue using the bug report template
- **Request a feature** — open an issue using the feature request template
- **Submit a fix or improvement** — fork, branch, and open a pull request

## Development Setup

```bash
git clone https://github.com/RANJITH1708/TableLens.git
cd TableLens
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode**
3. Click **Load unpacked** → select the cloned folder
4. Make your changes — Chrome reloads the extension automatically when you click the refresh icon on the extensions page

## Pull Request Guidelines

- Create a branch from `main` with a descriptive name (`fix/sort-bug`, `feat/json-export`)
- Keep PRs focused — one change per PR
- Test your changes on at least two different pages with HTML tables
- Describe what you changed and why in the PR description

## Reporting Bugs

Please include:
- Chrome version and OS
- The URL or type of page where the bug occurs
- Steps to reproduce
- What you expected vs. what actually happened

## Code Style

- Plain JavaScript (no build step required)
- Match the formatting of the existing files
- Avoid adding new external libraries unless absolutely necessary — bundle size matters for extensions
