
# CSS-MODULE-SYNC
Speed up react development by auto sync css module classes with react components.


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
