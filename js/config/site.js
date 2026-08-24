/**
 * The site's own settings, as opposed to any one place inside it.
 *
 * These used to live in `city.js`, the ROOF's manifest, which made them
 * unreachable from anywhere else: the terminal on the workshop bench handed
 * `resumePanel` an undefined path and threw outright on the guestbook, and the
 * fix at the time was for the main loop to reach back into `city` by name from
 * whatever room the player was standing in.
 *
 * The repository coordinates were worse — hardcoded inside `EditorController`,
 * so a fork published to the original author's repo.
 *
 * A scene manifest describes a place. This describes the site. Nothing here is
 * a secret: the token is typed in at publish time and never stored.
 */
export const site = {
    /**
     * Where the site lives.
     *
     * Read by the generated `sitemap.xml` and `robots.txt`, and by the
     * canonical and Open Graph URLs in the markup. A fork changes this and the
     * three of them follow.
     */
    baseUrl: 'https://khmurakami.github.io',

    /** Where the in-browser editor commits, and where the guestbook posts. */
    repo: {
        owner: 'khmurakami',
        name: 'khmurakami.github.io',
        branch: 'main'
    },

    /** `owner/name`, the form GitHub's own URLs take. */
    get repoPath() {
        return `${this.repo.owner}/${this.repo.name}`;
    },

    /**
     * The résumé, offered as a download from the clipboard and the terminal.
     *
     * `null` means there is not one published. The site said `./assets/resume.pdf`
     * for months and no such file was ever committed, so the Download button
     * 404'd on every visitor while CI stayed green — the asset check only looked
     * at images.
     *
     * It checks this now. Set the path when the PDF is committed, and CI will
     * hold it to being there; leave it null and the panels say plainly that
     * there is nothing to download yet, which is the honest version of the same
     * state.
     */
    resumeFile: null,

    /** The guestbook opens a GitHub issue rather than needing a backend. */
    guestbook: {
        labels: 'guestbook'
    },

    /** Where "my code lives here" links point. */
    githubProfile: 'https://github.com/khmurakami'
};
