/**
 * Publishing a post from the browser.
 *
 * This is the only code on the site that WRITES, and it had no tests at all —
 * 1,100 lines of editor and a GitHub client, exercised only by pushing the
 * button and seeing what landed in the repository. Every bug the audit found in
 * it was invisible to CI:
 *
 *   - the leading `# ` heading was deleted from the source file on first publish
 *   - `js/config/posts.js` was never updated, so listings drifted from the posts
 *   - the properties panel's category, date and tags were read from the index
 *     rather than from the panel, so editing metadata did nothing
 *   - front matter was built by string concatenation, so a title containing a
 *     colon produced a file that no longer parsed
 *
 * The GitHub client is faked at `fetch`, so the whole path runs — parse, edit,
 * serialise, render the index, build the tree, make the commit — without
 * touching the network.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubStorageService } from '../js/engine/GitHubStorageService.js';
import { PostDocument } from '../js/engine/PostDocument.js';
import { entryFor, renderIndex } from '../js/engine/PostIndex.js';

const ORIGINAL = `---
title: Welcome to My Blog
date: 2026-03-14
tags: [Personal, Project]
category: General
summary: An introduction to my new blog.
---

# Welcome to My Blog

I'm excited to share my journey.
`;

/**
 * A GitHub that remembers what it was told.
 *
 * Returns plausible SHAs for the plumbing calls and records every blob body, so
 * a test can assert on the file contents that were actually committed rather
 * than on the calls that were made.
 */
function fakeGitHub() {
    const blobs = [];
    const calls = [];
    let tree = null;
    let commit = null;

    globalThis.fetch = vi.fn(async (url, options = {}) => {
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ url, method: options.method || 'GET', body, headers: options.headers });

        const json = (data) => ({ ok: true, status: 200, json: async () => data });

        if (url.includes('/git/refs/heads/')) {
            if ((options.method || 'GET') === 'GET') return json({ object: { sha: 'parent000' } });
            return json({ ref: 'refs/heads/main' });
        }
        if (url.includes('/git/commits/parent000')) return json({ tree: { sha: 'basetree0' } });
        if (url.endsWith('/git/blobs')) {
            blobs.push(body.content);
            return json({ sha: `blob${blobs.length}` });
        }
        if (url.endsWith('/git/trees')) { tree = body; return json({ sha: 'newtree0' }); }
        if (url.endsWith('/git/commits')) { commit = body; return json({ sha: 'newcommit0' }); }

        throw new Error(`unexpected request: ${url}`);
    });

    return { blobs, calls, tree: () => tree, commit: () => commit };
}

/**
 * The publish, as `EditorController.publishToGitHub` performs it.
 *
 * Mirrors that method's body rather than driving the DOM, because what is worth
 * pinning down is the transformation — which parts of the old file survive,
 * which are replaced, and what is written alongside. The controller's own
 * wiring (which button, which input) is the part that changes freely.
 */
async function publish({ source, editorMarkdown, title, props, post, allPosts }) {
    const doc = PostDocument.parse(source);

    const data = {
        ...doc.data,
        title,
        date: props.date || post.date,
        tags: props.tags.length ? props.tags : post.tags,
        category: props.category || post.category,
        summary: doc.data.summary || post.summary
    };

    const heading = doc.heading
        ? (doc.heading.trim() === String(post.title).trim() ? title : doc.heading)
        : null;

    const markdown = PostDocument.serialize({ data, heading, body: editorMarkdown });
    const index = renderIndex(
        allPosts.map(p => (p.id === post.id ? entryFor(post.id, data) : p))
    );

    const github = new GitHubStorageService('owner', 'repo', 'main');
    github.setToken('ghp_test');
    await github.commitFiles(`docs(blog): update ${post.id}`, [
        { path: post.file.replace('./', ''), content: markdown },
        { path: 'js/config/posts.js', content: index }
    ]);

    return { markdown, index };
}

const POST = {
    id: '2026-03-14-welcome-to-my-blog',
    title: 'Welcome to My Blog',
    date: '2026-03-14',
    tags: ['Personal', 'Project'],
    category: 'General',
    summary: 'An introduction to my new blog.',
    file: './posts/2026-03-14-welcome-to-my-blog.md'
};

const UNCHANGED_PROPS = { category: '', date: '', tags: [] };

describe('publishing a post', () => {
    let gh;
    beforeEach(() => { gh = fakeGitHub(); });

    it('keeps the heading the editor never saw', async () => {
        const { markdown } = await publish({
            source: ORIGINAL,
            editorMarkdown: "I'm excited to share my journey.",
            title: 'Welcome to My Blog',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        expect(markdown).toContain('# Welcome to My Blog');
    });

    it('publishing an untouched post changes nothing', async () => {
        // The strongest statement of the round trip: opening a post and
        // pressing Push should be a no-op, not a silent edit.
        const { markdown } = await publish({
            source: ORIGINAL,
            editorMarkdown: "I'm excited to share my journey.",
            title: 'Welcome to My Blog',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        expect(markdown.trim()).toBe(ORIGINAL.trim());
    });

    it('renames the heading along with the title when they matched', async () => {
        const { markdown } = await publish({
            source: ORIGINAL,
            editorMarkdown: 'Body.',
            title: 'A Better Title',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        expect(markdown).toContain('# A Better Title');
        expect(markdown).not.toContain('# Welcome to My Blog');
    });

    it('leaves a heading alone when it never matched the title', async () => {
        const source = ORIGINAL.replace('# Welcome to My Blog', '# A deliberate opener');
        const { markdown } = await publish({
            source,
            editorMarkdown: 'Body.',
            title: 'A Better Title',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        expect(markdown).toContain('# A deliberate opener');
    });

    it('writes a title containing a colon as valid front matter', async () => {
        const { markdown } = await publish({
            source: ORIGINAL,
            editorMarkdown: 'Body.',
            title: 'Rooftop: a portfolio',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        expect(PostDocument.parse(markdown).data.title).toBe('Rooftop: a portfolio');
    });

    it('takes the metadata from the properties panel, not the index', async () => {
        const { markdown, index } = await publish({
            source: ORIGINAL,
            editorMarkdown: 'Body.',
            title: 'Welcome to My Blog',
            props: { category: 'Engineering', date: '2026-08-01', tags: ['Rewrite'] },
            post: POST,
            allPosts: [POST]
        });

        const data = PostDocument.parse(markdown).data;
        expect(data.category).toBe('Engineering');
        expect(data.date).toBe('2026-08-01');
        expect(data.tags).toEqual(['Rewrite']);

        // And the index agrees, which is the half that used to be skipped.
        expect(index).toContain('"Engineering"');
        expect(index).toContain('"Rewrite"');
    });

    it('commits the Markdown and the index together, in one commit', async () => {
        await publish({
            source: ORIGINAL,
            editorMarkdown: 'Body.',
            title: 'Renamed',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        const paths = gh.tree().tree.map(t => t.path);
        expect(paths).toContain('posts/2026-03-14-welcome-to-my-blog.md');
        expect(paths).toContain('js/config/posts.js');

        // One commit, one parent — never two commits with the site broken
        // in between.
        expect(gh.commit().parents).toEqual(['parent000']);
        expect(gh.calls.filter(c => c.url.endsWith('/git/commits') && c.method === 'POST'))
            .toHaveLength(1);
    });

    it('leaves other posts in the index untouched', async () => {
        const other = { ...POST, id: 'other', title: 'Other', file: './posts/other.md' };
        const { index } = await publish({
            source: ORIGINAL,
            editorMarkdown: 'Body.',
            title: 'Renamed',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST, other]
        });

        expect(index).toContain('"Other"');
        expect(index).toContain('"Renamed"');
    });

    it('does not force-push over somebody else', async () => {
        await publish({
            source: ORIGINAL,
            editorMarkdown: 'Body.',
            title: 'Renamed',
            props: UNCHANGED_PROPS,
            post: POST,
            allPosts: [POST]
        });

        const patch = gh.calls.find(c => c.method === 'PATCH');
        expect(patch.body.force).toBe(false);
    });
});

describe('the GitHub client', () => {
    beforeEach(() => { fakeGitHub(); });

    it('refuses to act without a token', async () => {
        const github = new GitHubStorageService('owner', 'repo');
        await expect(github.commitFiles('m', [])).rejects.toThrow(/token/i);
    });

    it('sends the token as an Authorization header and nowhere else', async () => {
        const gh = fakeGitHub();
        const github = new GitHubStorageService('owner', 'repo');
        github.setToken('ghp_secret');
        await github.commitFiles('m', [{ path: 'a.md', content: 'x' }]);

        for (const call of gh.calls) {
            expect(call.headers.Authorization).toBe('token ghp_secret');
            expect(call.url).not.toContain('ghp_secret');
            expect(JSON.stringify(call.body || {})).not.toContain('ghp_secret');
        }
    });

    it('clears the token on request', () => {
        const github = new GitHubStorageService('owner', 'repo');
        github.setToken('ghp_secret');
        expect(github.hasToken()).toBe(true);
        github.clearToken();
        expect(github.hasToken()).toBe(false);
    });

    it('surfaces a GitHub error rather than swallowing it', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ message: 'Bad credentials' })
        }));

        const github = new GitHubStorageService('owner', 'repo');
        github.setToken('bad');
        await expect(github.commitFiles('m', [])).rejects.toThrow(/401|Bad credentials/);
    });
});
