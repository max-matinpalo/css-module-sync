#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// -----------------------------------------------------
// 1. CSS Parser: Grouping by Base Class
// -----------------------------------------------------
function parseCssIntoBuckets(css) {
	const buckets = {
		imports: [],
		classes: {}, // Key: baseName, Value: Array of full blocks
		others: []
	};

	let cursor = 0;
	while (cursor < css.length) {
		const slice = css.slice(cursor).trimStart();
		if (!slice) break;
		cursor += css.slice(cursor).indexOf(slice[0]);

		// Bucket 1: Imports
		if (css.startsWith("@import", cursor) || css.startsWith("@use", cursor)) {
			const end = css.indexOf(";", cursor);
			if (end !== -1) {
				buckets.imports.push(css.slice(cursor, end + 1));
				cursor = end + 1;
				continue;
			}
		}

		// Bucket 2: Classes & Pseudo-classes (Base name + extensions)
		const classMatch = css.slice(cursor).match(/^\.([a-zA-Z0-9_-]+)([:.[][\s\S]*?)?\s*\{/);
		if (classMatch) {
			const baseName = classMatch[1];
			const braceIdx = css.indexOf("{", cursor);
			const end = findBlockEnd(css, braceIdx);
			const block = css.slice(cursor, end);

			if (!buckets.classes[baseName]) buckets.classes[baseName] = [];
			buckets.classes[baseName].push(block);

			cursor = end;
			continue;
		}

		// Bucket 3: Others (@media, @keyframes, comments)
		let end;
		if (css.startsWith("/*", cursor)) {
			end = css.indexOf("*/", cursor) + 2;
		} else if (css[cursor] === "@") {
			const braceIdx = css.indexOf("{", cursor);
			const semiIdx = css.indexOf(";", cursor);
			end = (semiIdx !== -1 && (braceIdx === -1 || semiIdx < braceIdx))
				? semiIdx + 1
				: findBlockEnd(css, braceIdx);
		} else {
			const nextLine = css.indexOf("\n", cursor);
			end = nextLine === -1 ? css.length : nextLine + 1;
		}

		buckets.others.push(css.slice(cursor, end));
		cursor = end;
	}
	return buckets;
}

function findBlockEnd(css, openIdx) {
	let depth = 0;
	for (let i = openIdx; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}") {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return css.length;
}

// -----------------------------------------------------
// 2. Rebuild Logic: In-Order & Orphan Handling
// -----------------------------------------------------
function isBlockEmpty(block) {
	const content = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}")).trim();
	return content.length === 0;
}

function rebuildCss(jsxClasses, buckets) {
	let out = "";

	// 1. Imports
	if (buckets.imports.length) out += buckets.imports.join("\n") + "\n\n";

	const used = new Set();

	// 2. Active Classes (matching JSX/TSX order)
	jsxClasses.forEach(name => {
		used.add(name);
		if (buckets.classes[name]) {
			buckets.classes[name].forEach(block => {
				out += block.trim() + "\n\n";
			});
		} else {
			out += `.${name} {\n\t\n}\n\n`;
		}
	});

	// 3. Orphaned Classes (not in JSX/TSX, keep if not empty)
	let orphanOut = "";
	Object.keys(buckets.classes).forEach(name => {
		if (!used.has(name)) {
			const nonEmptyBlocks = buckets.classes[name].filter(block => !isBlockEmpty(block));
			if (nonEmptyBlocks.length > 0) {
				nonEmptyBlocks.forEach(block => {
					orphanOut += `// Not used anymore, probably can delete\n${block.trim()}\n\n`;
				});
			}
		}
	});
	if (orphanOut) out += orphanOut;

	// 4. Others (@media, etc.)
	if (buckets.others.length) out += buckets.others.map(s => s.trim()).join("\n\n") + "\n";

	return out.trimEnd() + "\n";
}

// -----------------------------------------------------
// 3. File Processing
// -----------------------------------------------------
function processSourceFile(filePath) {
	const ext = path.extname(filePath);
	if (![".jsx", ".tsx"].includes(ext) || !/^[A-Z]/.test(path.basename(filePath))) return;

	let src;
	try { src = fs.readFileSync(filePath, "utf8"); } catch (e) { return; }

	// Extract unique classnames used via styles.xxx
	const classRegex = /styles\.([a-zA-Z0-9_]+)/g;
	const jsxClasses = [...new Set((src.match(classRegex) || []).map(s => s.split(".")[1]))];
	if (!jsxClasses.length) return;

	const cssFile = filePath.replace(ext, ".module.css");
	const existingCss = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";

	const finalCss = rebuildCss(jsxClasses, parseCssIntoBuckets(existingCss));

	if (existingCss !== finalCss) {
		fs.writeFileSync(cssFile, finalCss);
		console.log(`✨ Updated: ${path.basename(cssFile)}`);
	}

	// Inject import if missing
	const importRegex = new RegExp(`import\\s+styles\\s+from\\s+["']\\.\\/${path.basename(cssFile)}["']`);
	if (!importRegex.test(src)) {
		fs.writeFileSync(filePath, `import styles from "./${path.basename(cssFile)}";\n${src}`);
		console.log(`➕ Added import to: ${path.basename(filePath)}`);
	}
}

// -----------------------------------------------------
// 4. CLI Execution
// -----------------------------------------------------
function main() {
	const args = process.argv.slice(2);
	const srcIdx = args.indexOf("--src");
	const srcDir = srcIdx !== -1 ? path.resolve(args[srcIdx + 1]) : path.join(process.cwd(), "src");

	const isSource = (f) => f && (f.endsWith(".jsx") || f.endsWith(".tsx"));

	if (args.includes("--watch")) {
		console.log(`👀 Watching: ${srcDir}`);
		fs.watch(srcDir, { recursive: true }, (_, f) => isSource(f) && processSourceFile(path.join(srcDir, f)));
	} else if (args.includes("--gen")) {
		console.log(`🚀 Batch generating for ${srcDir}...`);
		const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
			const p = path.join(d, e.name);
			e.isDirectory() ? walk(p) : processSourceFile(p);
		});
		walk(srcDir);
	} else if (args[0]) {
		processSourceFile(path.resolve(args[0]));
	} else {
		console.log("Usage: css-module-sync [--watch | --gen] [--src dir] [file]");
	}
}

main();