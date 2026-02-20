#!/usr/bin/env node
import fs from "node:fs/promises";
import { watch, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./css_parser.js";
import { format } from "./css_formatter.js";

const CWD = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------
// 0. CLI Arguments
// ------------------------------------------------------------------
const args = process.argv.slice(2);
const dir_idx = args.indexOf("--dir");
const sort_idx = args.indexOf("--sort");
const has_a = args.includes("--a");

const FLAGS = {
	watch: has_a || args.includes("--watch"),
	gen: has_a || args.includes("--gen"),
	sort: has_a || args.includes("--sort"),
	dir: dir_idx > -1 && args[dir_idx + 1] ? args[dir_idx + 1] : "src"
};

function find_root(start) {
	let curr = start;
	while (curr !== path.parse(curr).root) {
		if (existsSync(path.join(curr, "package.json"))) return curr;
		curr = path.dirname(curr);
	}
	return start;
}

const ROOT_DIR = find_root(CWD);
const TARGET_DIR = path.basename(CWD) === FLAGS.dir ? CWD : path.resolve(ROOT_DIR, FLAGS.dir);
let SORT_SPEC = [];

// ------------------------------------------------------------------
// 1. Helpers
// ------------------------------------------------------------------

function extract_classes(code) {
	code = code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
	const out = [], seen = new Set();
	code = code.replace(/\bstyles\[(["'])([\w-]+)\1\]/g, (_, __, cls) => ` __SB_${cls}__ `);
	code = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*\1/g, " ");
	for (const m of code.matchAll(/__SB_([\w-]+)__/g)) if (!seen.has(m[1])) {
		seen.add(m[1]);
		out.push(m[1]);
	}
	for (const m of code.matchAll(/\bstyles\.([A-Za-z_]\w*)\b/g)) if (!seen.has(m[1])) {
		seen.add(m[1]);
		out.push(m[1]);
	}
	return out;
}

function get_classes(node) {
	const set = new Set();
	if (node.type === "block" && node.selector) {
		const m = node.selector.match(/\.[A-Za-z_][\w-]*/g);
		if (m) m.forEach(c => set.add(c.slice(1)));
	}
	return set;
}

function has_content(node) {
	if (node.type === "leaf") return !!node.content;
	return node.children ? node.children.some(has_content) : false;
}

function update_marker(node, is_unused) {
	node.comments = (node.comments || []).filter(c => !c.includes("UNUSED") && c !== "/* unused class */");
	if (is_unused) node.comments.unshift("/* unused class */");
}

async function resolve_css_path(tsx_path) {
	const dir = path.dirname(tsx_path);
	const name = path.basename(tsx_path, path.extname(tsx_path));
	const module_path = path.join(dir, `${name}.module.css`);
	try {
		await fs.access(module_path);
		return module_path;
	} catch { }
	if (FLAGS.gen && /^[A-Z][^ ]*$/.test(name)) {
		await fs.writeFile(module_path, "/* Auto-generated */\n");
		console.log(`Generated: ${path.relative(CWD, module_path)}`);
		return module_path;
	}
	return null;
}

// ------------------------------------------------------------------
// 2. Sync Logic
// ------------------------------------------------------------------

async function format_css_only(css_path) {
	try {
		const css = await fs.readFile(css_path, "utf-8");
		const root = parse(css);
		const out = format(root, SORT_SPEC);
		if (out !== css) {
			await fs.writeFile(css_path, out);
			console.log(`Formatted: ${path.relative(CWD, css_path)}`);
		}
	} catch (e) { }
}

async function sync_file(tsx_path) {
	let tsx;
	try { tsx = await fs.readFile(tsx_path, "utf-8"); } catch { return; }

	const used_ordered = extract_classes(tsx);
	const dir = path.dirname(tsx_path);
	const name = path.basename(tsx_path, path.extname(tsx_path));
	const module_path = path.join(dir, `${name}.module.css`);
	const css_exists = existsSync(module_path);

	if (FLAGS.gen && used_ordered.length === 0 && !css_exists) return;

	const css_path = await resolve_css_path(tsx_path);
	if (!css_path) return;

	let css;
	try { css = await fs.readFile(css_path, "utf-8"); } catch { return; }

	if (FLAGS.gen && used_ordered.length > 0) {
		const target = `import styles from "./${path.basename(css_path)}";`;
		const next = tsx.replace(/^import\s+styles\s+from\s+["'][^"']+["'];?\s*\n?/gm, "");
		const m = next.match(/^(\s*(?:(?:\/\*.*?\*\/)\s*|\/\/.*\s*)*)(["']use client["'];?\s*\n)?/s);
		const i = m ? m[0].length : 0;
		const final = `${next.slice(0, i)}${target}\n${next.slice(i)}`;
		if (final !== tsx) await fs.writeFile(tsx_path, tsx = final);
	}

	let root;
	try { root = parse(css); } catch { return; }
	const class_to_idxs = new Map();
	root.children.forEach((node, i) => {
		get_classes(node).forEach(c => {
			const list = class_to_idxs.get(c) || [];
			list.push(i);
			class_to_idxs.set(c, list);
		});
	});
	const new_children = [], moved_idxs = new Set();
	for (const cls of used_ordered) {
		const idxs = class_to_idxs.get(cls);
		if (idxs) {
			for (const i of idxs) if (!moved_idxs.has(i)) {
				update_marker(root.children[i], false);
				new_children.push(root.children[i]);
				moved_idxs.add(i);
			}
		} else new_children.push({ type: "block", selector: `.${cls}`, children: [], comments: [] });
	}
	root.children.forEach((node, i) => {
		if (moved_idxs.has(i)) return;
		const classes = get_classes(node);
		if (classes.size === 0) new_children.push(node);
		else if (has_content(node)) {
			update_marker(node, true);
			new_children.push(node);
		}
	});
	root.children = new_children;
	let out;
	try { out = format(root, SORT_SPEC); } catch { return; }
	if (out !== css) {
		await fs.writeFile(css_path, out);
		console.log(`Updated: ${path.relative(CWD, css_path)}`);
	}
}

// ------------------------------------------------------------------
// 3. Execution
// ------------------------------------------------------------------

async function run_scan() {
	try {
		const files = await fs.readdir(TARGET_DIR, { recursive: true });
		for (const f of files) if (!f.includes("node_modules") && /\.(jsx|tsx)$/.test(f)) await sync_file(path.join(TARGET_DIR, f));
	} catch (e) { console.error(`Error scanning ${TARGET_DIR}:`, e.message); }
}

async function main() {
	const default_path = path.join(__dirname, "default_sort_spec.json");
	let sort_path = default_path;
	let custom_mode = false;
	if (sort_idx > -1 && args[sort_idx + 1] && !args[sort_idx + 1].startsWith("--")) {
		sort_path = path.resolve(CWD, args[sort_idx + 1]);
		custom_mode = true;
	}
	async function load_spec(p) {
		const raw = await fs.readFile(p, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) throw new Error("JSON is not an Array");
		return parsed;
	}
	if (FLAGS.sort) {
		try {
			SORT_SPEC = await load_spec(sort_path);
			console.log(`[SORT] Loaded: ${path.relative(CWD, sort_path)} (${SORT_SPEC.length} categories)`);
		} catch (e) {
			if (custom_mode) {
				console.warn(`[SORT] Custom spec failed (${e.message}). Falling back to default...`);
				try {
					SORT_SPEC = await load_spec(default_path);
					console.log(`[SORT] Loaded default: ${path.relative(CWD, default_path)} (${SORT_SPEC.length} categories)`);
				} catch (e2) {
					console.error(`[SORT] Critical: Could not load default spec. Sorting disabled.`);
					SORT_SPEC = [];
				}
			} else {
				console.error(`[SORT] Error: Could not load default spec (${e.message}).`);
				SORT_SPEC = [];
			}
		}
	}
	console.log(`Mode: ${FLAGS.watch ? "Watch" : "Scan"}\nDir:  ${TARGET_DIR}\nGen:  ${FLAGS.gen ? "Enabled" : "Disabled"}\nSort: ${FLAGS.sort ? "Enabled" : "Disabled"}\n`);
	await run_scan();
	if (FLAGS.watch) {
		const debouncers = new Map();
		let cache = new Set();
		const refresh_cache = async () => {
			const files = await fs.readdir(TARGET_DIR, { recursive: true });
			cache = new Set(files.map(f => path.resolve(TARGET_DIR, f)));
		};
		await refresh_cache();

		console.log("Watching for changes...");
		watch(TARGET_DIR, { recursive: true }, async (event, filename) => {
			if (!filename) return;
			const full_path = path.resolve(TARGET_DIR, filename.toString());
			const exists = existsSync(full_path);
			const is_tsx = /\.(jsx|tsx)$/.test(full_path);

			if (event === "rename") {
				const was_cached = cache.has(full_path);
				if (!exists) setTimeout(() => { if (!existsSync(full_path)) cache.delete(full_path); }, 100);
				else {
					cache.add(full_path);
					if (is_tsx && FLAGS.gen && !was_cached) setTimeout(async () => {
						const dir = path.dirname(full_path);
						const name = path.basename(full_path, path.extname(full_path));
						const orphans = Array.from(cache).filter(p => {
							if (!p.endsWith(".module.css") || path.dirname(p) !== dir || !existsSync(p)) return false;
							const base = path.basename(p, ".module.css");
							return !existsSync(path.join(dir, `${base}.tsx`)) && !existsSync(path.join(dir, `${base}.jsx`));
						});
						if (orphans.length === 1) {
							const orphan = orphans[0];
							const next_css = path.join(dir, `${name}.module.css`);
							if (!existsSync(next_css)) {
								await fs.rename(orphan, next_css);
								cache.delete(orphan);
								cache.add(next_css);
								console.log(`Renamed: ${path.basename(orphan)} -> ${path.basename(next_css)}`);
							}
						} else if (orphans.length > 1) {
							console.warn(`[RENAME] Multiple orphan .module.css in ${dir}; skipping:\n` +
								orphans.map(p => `- ${path.basename(p)}`).join("\n"));
						}
					}, 150);
				}
			}

			if (!is_tsx && !/\.css$/.test(full_path)) return;
			if (debouncers.has(full_path)) clearTimeout(debouncers.get(full_path));
			debouncers.set(full_path, setTimeout(() => {
				debouncers.delete(full_path);
				if (is_tsx) sync_file(full_path).catch(() => { });
				else if (FLAGS.sort) format_css_only(full_path).catch(() => { });
			}, 100));
		});
	}
}

main().catch(console.error);