/**
 * The blog index, derived from the posts rather than kept alongside them.
 *
 * `js/config/posts.js` used to be hand-maintained, with a comment asking the
 * author to keep it matching the front matter of every file. Nothing enforced
 * it, and publishing from the browser rewrote the Markdown without touching the
 * index — so editing a title left the `.md` saying one thing and every listing
 * on the site saying another.
 *
 * The Markdown IS the source of truth now. This module renders the index file
 * from parsed post front matter, and both writers use it:
 *
 *   - `scripts/build_posts.mjs` regenerates the file from `posts/*.md`, and CI
 *     fails if the committed copy has drifted.
 *   - The in-browser editor renders the same file and commits it in the SAME
 *     commit as the Markdown, so a publish can never land half-applied.
 *
 * One renderer means the two can never disagree about the format.
 */

const HEADER = `// GENERATED FILE — do not edit by hand.
//
// Rendered from the front matter of every file in \`posts/\` by
// \`npm run posts\`, and by the in-browser editor when it publishes. CI fails if
// this file disagrees with the Markdown, so an edit here is a change that is
// about to be overwritten.
//
// To change a post's metadata, edit the front matter of its \`.md\` file.
`;

/** A JS string literal. JSON quoting is exactly the escaping we want. */
const str = (v) => JSON.stringify(String(v == null ? '' : v));

/**
 * Post metadata from one parsed document.
 *
 * @param {string} id     The file's basename, which is also its URL.
 * @param {Object} data   Front matter.
 * @returns {Object} An index entry.
 */
export function entryFor(id, data) {
    return {
        id,
        title: data.title || id,
        date: data.date || '',
        tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
        category: data.category || 'Uncategorised',
        summary: data.summary || '',
        file: `./posts/${id}.md`
    };
}

/**
 * Renders `js/config/posts.js`.
 *
 * Entries are sorted newest first so the file reads in the order the site
 * shows them, and so that regenerating it never reorders for an unrelated
 * reason and produces a noisy diff.
 *
 * @param {Array<Object>} entries
 * @returns {string} The file's full text.
 */
export function renderIndex(entries) {
    const sorted = [...entries].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.id < b.id ? -1 : 1;
    });

    const body = sorted.map(p => `    {
        id: ${str(p.id)},
        title: ${str(p.title)},
        date: ${str(p.date)},
        tags: [${p.tags.map(str).join(', ')}],
        category: ${str(p.category)},
        summary: ${str(p.summary)},
        file: ${str(p.file)}
    }`).join(',\n');

    return `${HEADER}
export const posts = [
${body}
];
`;
}
