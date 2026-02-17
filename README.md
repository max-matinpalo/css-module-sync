
# CSS-MODULE-SYNC
Auto generates and syncs your module.css classes with react components.

### Install
```bash
npm install css-module-sync
```

### Usage
```bash
npx css-sync
```

### Options

| Option  | Description |
|---------|----------------------------------------------------------|
| --watch | Watches components all time and keeps styles in sync |
| --dir   | Directory to watch (default is `src`) |
| --gen   | Auto generates `.module.css` files for `.jsx` / `.tsx` files. Filename must start with uppercase letter and contain no spaces |


npx css-sync --watch --gen




# Sync Logic Plan

Step-by-step logic plan for the **css-module-sync** tool.

---

## 1. File Identification & Trigger

### Target Files

* Matches `.jsx` and `.tsx` files
* Requires filenames to begin with an uppercase letter
* Aligns with standard React component naming conventions

### Execution Modes

* **Single file**: Processes one component
* **Batch mode (`--gen`)**: Generates CSS modules for multiple components
* **Watch mode (`--watch`)**: Continuously monitors and syncs changes

---

## 2. Three-Bucket CSS Parser

When reading an existing `.module.css` file, the tool splits content into three cascade-safe buckets:

### Bucket 1: Imports

* Captures:

  * `@import`
  * `@use`
* Always placed at the top
* Ensures CSS validity and dependency order

### Bucket 2: Classes

* Groups class declarations by base name
* Includes:

  * Base class (example: `.button`)
  * Pseudo-classes (`:hover`, `:focus`)
  * Pseudo-elements (`::after`, `::before`)
  * Extensions and modifiers

Example grouping:

```css
.button {}
.button:hover {}
.button::after {}
```

### Bucket 3: Others

* Collects complex and override-priority structures:

  * `@media`
  * `@keyframes`
  * Global comments
* Always placed at the bottom
* Preserves correct cascade override behavior

---

## 3. Dependency Extraction

### Scanning

* Uses regex to detect:

```ts
styles.className
```

### Ordering

* Produces a unique class list
* Preserves exact appearance order from JSX/TSX
* Ensures predictable and stable CSS structure

---

## 4. Smart CSS Rebuild

Reconstructs the CSS file without destroying existing logic.

### Header

* Writes all **Imports bucket** content first

### Active Styles

* Writes classes detected in JSX/TSX
* Maintains UI appearance order
* Behavior:

  * Reuses existing blocks if present
  * Creates empty blocks if missing

Example generated block:

```css
.container {}
```

### Orphan Management

Handles classes no longer used in the component.

* If block is empty → **removed**
* If block contains logic → **preserved and marked**

Example:

```css
/* Not used anymore */
.oldClass {
	color: red;
}
```

Placed below active styles.

### Footer

* Appends **Others bucket** content
* Keeps media queries and overrides intact

---

## 5. Component Update

### Import Injection

* Checks for existing import:

```ts
import styles from "./ComponentName.module.css";
```

* Adds automatically if missing

### Save Strategy

* Only overwrites files when content has changed
* Prevents unnecessary rebuild triggers
* Improves performance and stability

---

## Summary Flow

```
Scan component
  ↓
Extract styles usage
  ↓
Parse CSS into buckets
  ↓
Rebuild CSS safely
  ↓
Preserve orphan logic
  ↓
Append media/overrides
  ↓
Ensure component imports CSS
  ↓
Save only if changed
```

---

## Design Goals

* Preserve developer-written CSS
* Maintain cascade correctness
* Prevent accidental logic loss
* Ensure deterministic ordering
* Enable safe automation
* Minimize unnecessary file writes
