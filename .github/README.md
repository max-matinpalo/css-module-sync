# css-module-sync

Auto sync CSS Module classes with React components.

## Install

```bash
npm install css-module-sync
```

## Usage

```bash
npx css-sync [options]
```

## Features

- Extracts classes from `.jsx` / `.tsx` files and creates matching blocks in `.module.css`
- Preserves the exact order of classes as they appear in your component
- Comments out removed classes as `/* unused class */` (doesn’t delete)
- Detects component file renames and renames orphaned `.module.css` files
- Formats CSS and sorts properties by category

## Options

| Option | Description |
| --- | --- |
| `--watch` | Watches components continuously and keeps styles in sync |
| `--dir <path>` | Directory to watch or scan (default: `src`) |
| `--gen` | Auto-generates `.module.css` files and injects `import styles from "./Component.module.css";` |
| `--sort [path]` | Formats CSS and sorts properties; optional custom JSON sorting spec path |
| `--a` | Shortcut for `--watch --gen --sort` |
