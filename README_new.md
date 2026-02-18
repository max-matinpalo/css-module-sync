# css_module_sync

Keep **CSS Modules** (`*.module.css`) in sync with your **React `*.tsx` / `*.jsx`** files:

- Orders `.class {}` blocks to match the order classes are referenced in code
- Optionally generates missing `*.module.css` files
- Optionally ensures the `import styles from "./X.module.css";` line exists
- Optionally formats + sorts CSS declarations by category spec

---

## What it does

Given `Component.tsx` and `Component.module.css`:

1. **Scans TSX/JSX** for CSS module usage:
	- `styles.foo`
	- `styles["foo-bar"]`
2. **Finds matching CSS blocks** whose selector contains classes like `.foo` (top-level blocks only).
3. **Rebuilds CSS order**:
	- Blocks used in code appear first, in code order
	- If a referenced class is missing in CSS, it **creates an empty stub**:
	  ```css
	  .missingClass {
	  }
	  ```
	- Unused class blocks that still have content are kept, but marked:
	  ```css
	  /* unused class */
	  .oldThing { ... }
	  ```
	- Blocks with **no class selector** (e.g. `@keyframes`, `:root`, element selectors) are preserved after used blocks.
4. **Formats output** via the internal parser/formatter (`css_parser.js`, `css_formatter.js`).
5. **Watch mode** can continuously apply updates on file changes.

---

## CLI

### Run
```bash
node css_sync.js
```

### Flags

| Flag | Meaning | Default |
|---|---|---|
| `--dir <path>` | directory to scan/watch | `src` |
| `--watch` | keep watching for changes | off |
| `--gen` | auto-create missing `*.module.css` + add `styles` import | off |
| `--sort [spec.json]` | sort declarations by category spec | off |
| `--a` | shortcut for `--watch --gen --sort` | off |

Examples:
```bash
# One-time scan (default: src)
node css_sync.js

# Scan a different directory
node css_sync.js --dir app

# Watch mode
node css_sync.js --watch

# Generate missing module files + ensure import
node css_sync.js --gen

# Enable declaration sorting (uses default_sort_spec.json next to css_sync.js)
node css_sync.js --sort

# Use a custom sort spec
node css_sync.js --sort ./my_sort_spec.json

# All-in mode
node css_sync.js --a
```

---

## Declaration sorting (`--sort`)

When enabled, declarations inside each block are:

- **Grouped** by category from a JSON spec (array of `{ category, keywords }`)
- **Category headers** are inserted as comments:
  ```css
  	/* LAYOUT */
  	display: flex;
  ```
- **Properties are alphabetized** within each category group
- Properties not matched by any category go to the end

Notes:
- The script looks for `default_sort_spec.json` next to `css_sync.js`.
- If a custom spec fails to load, it falls back to default (if available), otherwise sorting is disabled.

---

## Watch behavior

In `--watch`:

- On `*.tsx` / `*.jsx` change: runs full sync for that file
- On `*.css` change: only reformats **if `--sort` is enabled**

(There’s a small debounce to avoid rapid double-runs.)

---

## Conventions / assumptions

- `--gen` only auto-creates a CSS module if the TSX/JSX filename (without extension) looks like a component name (`PascalCase`).
- Class extraction intentionally ignores strings/comments and focuses on `styles.*` usage.
- “Unused” means “not referenced via `styles.*` in the paired TSX/JSX file”.

---

## Suggested package.json script

```json
{
  "scripts": {
    "css:sync": "node css_sync.js --a"
  },
  "type": "module"
}
```
