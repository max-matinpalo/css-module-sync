// css_parser.js
export function parse(input) {
	let i = 0;
	const n = input.length;

	const root = { type: "block", selector: null, children: [], comments: [] };
	let pending = [];

	const is_ws = c => c === " " || c === "\n" || c === "\t" || c === "\r";
	const skip_ws = () => { while (i < n && is_ws(input[i])) i++; };

	const read_comment = () => {
		if (input[i] !== "/" || input[i + 1] !== "*") return null;
		const start = i;
		i += 2;
		while (i < n && !(input[i] === "*" && input[i + 1] === "/")) i++;
		i = Math.min(n, i + 2);
		return input.slice(start, i);
	};

	const read_until = stops => {
		let out = "", q = null, esc = false;
		while (i < n) {
			const c = input[i];
			if (esc) { out += c; esc = false; i++; continue; }
			if (c === "\\") { out += c; esc = true; i++; continue; }
			if (q) { if (c === q) q = null; out += c; i++; continue; }
			if (c === "'" || c === `"`) { q = c; out += c; i++; continue; }
			if (stops.includes(c)) break;
			out += c; i++;
		}
		return out;
	};

	const parse_block = selector => {
		const node = { type: "block", selector, children: [], comments: pending };
		pending = [];
		i++; // skip '{'
		while (i < n) {
			skip_ws();
			const cmt = read_comment();
			if (cmt) { pending.push(cmt); continue; }
			if (input[i] === "}") { i++; break; }

			const head = read_until(["{", ";", "}"]).trim();
			if (!head) { if (input[i] === ";") i++; continue; }

			if (input[i] === "{") node.children.push(parse_block(head));
			else {
				if (input[i] === ";") i++;
				node.children.push({ type: "leaf", content: head, comments: pending });
				pending = [];
			}
		}
		return node;
	};

	while (i < n) {
		skip_ws();
		const cmt = read_comment();
		if (cmt) { pending.push(cmt); continue; }
		if (i >= n) break;

		const head = read_until(["{", ";"]).trim();
		if (!head) { i++; continue; }

		if (input[i] === "{") root.children.push(parse_block(head));
		else {
			if (input[i] === ";") i++;
			root.children.push({ type: "leaf", content: head, comments: pending });
			pending = [];
		}
	}

	if (pending.length) root.comments = pending;
	return root;
}
