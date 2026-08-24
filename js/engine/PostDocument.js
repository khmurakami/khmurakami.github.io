/**
 * A blog post's file, as a value.
 *
 * A post on disk is three things stacked: YAML front matter, an optional `# `
 * heading, and the body. Every one of them used to be handled ad hoc — the
 * front matter was stripped with a regex on load and REBUILT by string concat
 * on publish, and the heading was stripped and never put back, so the first
 * publish silently deleted it from the source file.
 *
 * Parsing and serialising in one place makes the round trip lossless by
 * construction: `serialize(parse(text))` returns the same document. The tests
 * assert exactly that, over the awkward cases — colons in titles, quotes,
 * empty values, no heading at all.
 *
 * The front matter subset is deliberately small, because that is all a post
 * needs: scalars and flow lists (`tags: [a, b]`). Anything else is preserved
 * verbatim as a string rather than being silently reinterpreted.
 */

/** Keys written first, in this order, so generated files have a stable shape. */
const KEY_ORDER = ['title', 'date', 'tags', 'category', 'summary'];

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const LEADING_H1 = /^#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;

/**
 * True where a scalar cannot be written bare.
 *
 * YAML gives meaning to a leading indicator character and to `: ` anywhere in
 * the value, so `title: Rooftop: a portfolio` parses as a mapping and the file
 * stops being readable. Quoting on those cases and only those keeps ordinary
 * titles unquoted and unremarkable.
 */
function needsQuoting(s) {
    if (s === '') return true;
    if (s !== s.trim()) return true;
    if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
    if (/:\s/.test(s) || /\s#/.test(s)) return true;
    if (s.endsWith(':')) return true;
    // Bare words YAML would read as something other than a string.
    if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
    return false;
}

/** Wraps a value in double quotes, escaping what has to be escaped. */
const quoted = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** One scalar, quoted only where it has to be. Newlines collapse to spaces. */
function scalar(value) {
    const s = String(value == null ? '' : value).replace(/\s*\r?\n\s*/g, ' ');
    return needsQuoting(s) ? quoted(s) : s;
}

/**
 * One item of a flow list, which has stricter rules than a bare scalar.
 *
 * Inside `[a, b]` the comma and the brackets are structure, so a tag containing
 * one has to be quoted or it splits into two tags on the way back in. Caught by
 * the round-trip test rather than by reading the spec, which is the point of
 * having the test.
 */
function flowScalar(value) {
    const s = String(value == null ? '' : value).replace(/\s*\r?\n\s*/g, ' ');
    return (needsQuoting(s) || /[,[\]{}]/.test(s)) ? quoted(s) : s;
}

/** Undoes `scalar` for one value: strips matching quotes, unescapes. */
function unscalar(raw) {
    const s = raw.trim();
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
        return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
        return s.slice(1, -1).replace(/''/g, "'");
    }
    return s;
}

/**
 * Splits a flow list body on commas that are not inside quotes.
 *
 * A naive `split(',')` tears `tags: ["a, b", c]` in half. Tags rarely contain
 * commas, but a lossless round trip is not a thing you get to be nearly right
 * about.
 */
function splitFlow(body) {
    const out = [];
    let cur = '';
    let quote = null;
    for (const ch of body) {
        if (quote) {
            cur += ch;
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            cur += ch;
        } else if (ch === ',') {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map(unscalar).filter(v => v !== '');
}

/** One `key: value` line into a typed value. */
function parseValue(raw) {
    const s = raw.trim();
    if (s.startsWith('[') && s.endsWith(']')) return splitFlow(s.slice(1, -1));
    return unscalar(s);
}

export const PostDocument = {
    /**
     * Reads a post file.
     *
     * @param {string} text The whole file.
     * @returns {{data: Object, heading: string|null, body: string}}
     *   `heading` is the text of a leading `# ` line if the file has one, so
     *   that publishing can put it back rather than dropping it.
     */
    parse(text) {
        const src = String(text == null ? '' : text);

        const data = {};
        let rest = src;

        const fm = src.match(FRONT_MATTER);
        if (fm) {
            rest = src.slice(fm[0].length);
            for (const line of fm[1].split(/\r?\n/)) {
                if (!line.trim() || line.trim().startsWith('#')) continue;
                const at = line.indexOf(':');
                if (at === -1) continue;
                const key = line.slice(0, at).trim();
                if (key) data[key] = parseValue(line.slice(at + 1));
            }
        }

        rest = rest.replace(/^\s*\r?\n/, '');

        let heading = null;
        const h1 = rest.match(LEADING_H1);
        if (h1) {
            heading = h1[1];
            rest = rest.slice(h1[0].length);
        }

        return { data, heading, body: rest.replace(/^\s*\r?\n/, '').trimEnd() };
    },

    /**
     * Writes a post file.
     *
     * @param {{data: Object, heading?: string|null, body?: string}} doc
     * @returns {string}
     */
    serialize({ data = {}, heading = null, body = '' }) {
        const keys = [
            ...KEY_ORDER.filter(k => k in data),
            ...Object.keys(data).filter(k => !KEY_ORDER.includes(k))
        ];

        const lines = keys.map(key => {
            const value = data[key];
            if (Array.isArray(value)) {
                return `${key}: [${value.map(flowScalar).join(', ')}]`;
            }
            return `${key}: ${scalar(value)}`;
        });

        const parts = ['---', ...lines, '---', ''];
        if (heading) parts.push(`# ${String(heading).replace(/\s*\r?\n\s*/g, ' ')}`, '');
        parts.push(String(body).trim(), '');

        return parts.join('\n');
    }
};
