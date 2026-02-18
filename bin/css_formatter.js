/**
 * css_formatter.js
 * Converts AST back to CSS string with category-based sorting.
 */

export function format(root, sort_spec = []) {
	// 1. Create a Case-Insensitive Set for reliable matching
	const category_set = new Set(sort_spec.map(s => s.category.toUpperCase()));

	const is_cat = (str) => {
		if (!str) return false;
		const clean = str.replace(/^\/\*+|\*+\/$/g, "").trim();

		// Match against spec (Case Insensitive)
		if (category_set.has(clean.toUpperCase())) return true;

		// 2. HEURISTIC FIX: Treat any "ALL CAPS" comment as a category header.
		// This ensures "Ghost" headers (like OLD_CATEGORY) are recognized 
		// as headers and removed if they are empty.
		// Regex: Uppercase letters, underscores, or spaces only.
		return /^[A-Z_\s]+$/.test(clean);
	};

	function process(node, depth) {
		const indent = "\t".repeat(depth);
		let out = "";

		// 1. Comments (Attached to the block itself)
		if (node.comments?.length) {
			for (const c of node.comments) {
				if (c.trim() === "/* Auto-generated */") continue;
				if (is_cat(c)) continue; // Strip ghost headers attached to block
				out += `${indent}${c}\n`;
			}
		}

		// 2. Leaf (Properties)
		if (node.type === "leaf" && node.content) {
			const clean = node.content.replace(/;+$/, "").trim();
			out += `${indent}${clean};\n`;
		} else if (node.type === "block") {
			// 3. Block
			const head = node.selector ? `${indent}${node.selector} {\n` : "";
			const tail = node.selector ? `${indent}}\n` : "";

			out += head;

			if (node.children) {
				const decls = [];
				const others = [];

				for (const child of node.children) {
					// Detect and skip existing headers (so we can regenerate them sorted)
					if (child.type === "comment" && is_cat(child.content)) continue;
					if (child.type === "header") continue;

					const is_decl = child.type === "leaf" &&
						child.content &&
						child.content.includes(":") &&
						!child.content.trim().startsWith("@");

					(is_decl ? decls : others).push(child);
				}

				if (node.selector && decls.length === 0) out += "\n";

				if (decls.length) {
					const grouped = {};

					for (const decl of decls) {
						const prop = decl.content.split(":")[0].trim();

						// Find index in sort_spec
						const cat_idx = sort_spec.findIndex(s => s.keywords.some(k =>
							k.endsWith("...") ? prop.startsWith(k.slice(0, -3)) : prop === k
						));

						// If not found in spec, push to end (sort_spec.length)
						const key = cat_idx === -1 ? sort_spec.length : cat_idx;
						(grouped[key] ||= []).push(decl);
					}

					const processed = [];

					// Sort keys numerically to ensure spec order (0, 1, 2...)
					// If sort_spec is empty, this simply groups everything into key '0'
					Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).forEach(idx => {
						const category = sort_spec[idx];

						// Only add header if category exists in spec
						if (category) {
							processed.push({
								type: "header",
								content: `\n${indent}\t/* ${category.category} */`,
							});
						}

						// Sort properties alphabetically within their group
						grouped[idx].sort((a, b) => a.content.localeCompare(b.content));
						processed.push(...grouped[idx]);
					});

					// Append non-declaration children (other comments, nested blocks)
					for (const child of [...processed, ...others]) {
						if (child.type === "header") out += `${child.content}\n`;
						else out += process(child, node.selector ? depth + 1 : depth);
					}
				} else {
					for (const child of others) out += process(child, node.selector ? depth + 1 : depth);
				}
			}

			out += tail;
			if (node.selector) out += "\n";
		}

		return out;
	}

	return process(root, 0);
}