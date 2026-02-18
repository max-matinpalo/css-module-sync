const BLOCK_MIN_DECLS = 7;

/**
 * css_formatter.js
 * Converts AST back to CSS string with category-based sorting.
 */

export function format(root, sort_spec = []) {
	const category_set = new Set(sort_spec.map(s => s.category.toUpperCase()));
	category_set.add("ELSE");

	const is_cat = (str) => {
		if (!str) return false;
		const clean = str.replace(/^\/\*+|\*+\/$/g, "").trim();
		if (category_set.has(clean.toUpperCase())) return true;
		return /^[A-Z_\s]+$/.test(clean);
	};

	function process(node, depth, is_last = false) {
		const indent = "\t".repeat(depth);
		let out = "";

		if (node.comments?.length) {
			for (const c of node.comments) {
				if (c.trim() === "/* Auto-generated */" || is_cat(c)) continue;
				out += `${indent}${c}\n`;
			}
		}

		if (node.type === "leaf" && node.content) {
			out += `${indent}${node.content.replace(/;+$/, "").trim()};\n`;
		} else if (node.type === "block") {
			const head = node.selector ? `${indent}${node.selector} {\n` : "";
			const tail = node.selector ? `${indent}}\n` : "";
			out += head;

			if (node.children) {
				const decls = [];
				const others = [];

				for (const child of node.children) {
					if (child.type === "comment" && is_cat(child.content)) continue;
					if (child.type === "header") continue;

					const is_decl = child.type === "leaf" &&
						child.content &&
						child.content.includes(":") &&
						!child.content.trim().startsWith("@");

					(is_decl ? decls : others).push(child);
				}

				if (node.selector && decls.length === 0 && others.length > 0) out += "\n";

				if (decls.length) {
					const grouped = {};
					const else_idx = sort_spec.length;

					for (const decl of decls) {
						const prop = decl.content.split(":")[0].trim();
						const cat_idx = sort_spec.findIndex(s => s.keywords.some(k => {
							const clean_k = k.replace(/\.+$/, "");
							return k.includes("...") ? (prop === clean_k || prop.startsWith(clean_k + "-")) : prop === k;
						}));
						const key = cat_idx === -1 ? else_idx : cat_idx;
						(grouped[key] ||= []).push(decl);
					}

					Object.keys(grouped).forEach(idx => {
						const cat = sort_spec[idx];
						grouped[idx].sort((a, b) => {
							const prop_a = a.content.split(":")[0].trim();
							const prop_b = b.content.split(":")[0].trim();
							if (!cat) return prop_a.localeCompare(prop_b);

							const find = (p) => cat.keywords.findIndex(k => {
								const clean_k = k.replace(/\.+$/, "");
								return k.includes("...") ? (p === clean_k || p.startsWith(clean_k + "-")) : p === k;
							});
							const i_a = find(prop_a);
							const i_b = find(prop_b);

							if (i_a !== i_b) return i_a - i_b;
							return prop_a.localeCompare(prop_b);
						});
					});

					const processed = [];
					const sorted_keys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
					const skip_all_spacers = decls.length < BLOCK_MIN_DECLS;
					let accumulated_decls = 0;

					sorted_keys.forEach((idx, k_idx) => {
						const items = grouped[idx];
						if (k_idx > 0 && !skip_all_spacers && items.length >= 2 && accumulated_decls >= 2) {
							processed.push({ type: "header", content: "" });
						}
						processed.push(...items);
						accumulated_decls += items.length;
					});

					const all_children = [...processed, ...others];
					all_children.forEach((child, i) => {
						const is_child_last = i === all_children.length - 1;
						if (child.type === "header") out += `${child.content}\n`;
						else out += process(child, node.selector ? depth + 1 : depth, is_child_last);
					});
				} else {
					others.forEach((child, i) => {
						const is_child_last = i === others.length - 1;
						out += process(child, node.selector ? depth + 1 : depth, is_child_last);
					});
				}
			}

			out += tail;
			// Only add empty line between top-level blocks
			if (node.selector && depth === 0 && !is_last) out += "\n";
		}

		return out;
	}

	const root_children = root.children || [];
	return root_children.map((child, i) =>
		process(child, 0, i === root_children.length - 1)
	).join("");
}