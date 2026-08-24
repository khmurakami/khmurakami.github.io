/**
 * GitHubStorageService handles secure interaction with the GitHub API
 * to commit changes directly from the browser.
 */
export class GitHubStorageService {
    constructor(repoOwner, repoName, branch = 'main') {
        this.repoOwner = repoOwner;
        this.repoName = repoName;
        this.branch = branch;
        this.token = null;
    }

    /**
     * Set the Personal Access Token for the session.
     * @param {string} token GitHub PAT
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Check if a token is currently set.
     */
    hasToken() {
        return !!this.token;
    }

    /**
     * Clear the token for security.
     */
    clearToken() {
        this.token = null;
    }

    /**
     * Helper to make authenticated requests.
     */
    async _request(path, method = 'GET', body = null) {
        if (!this.token) throw new Error('No GitHub token provided.');

        const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/${path}`;
        const headers = {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`GitHub API Error: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown'}`);
        }
        return response.json();
    }

    /**
     * Get the latest commit SHA of the target branch.
     */
    async getLatestCommitSha() {
        const data = await this._request(`git/refs/heads/${this.branch}`);
        return data.object.sha;
    }

    /**
     * Create a blob for file content.
     */
    async createBlob(content) {
        // Text content must be utf-8 encoded, and GitHub expects JSON strings
        const data = await this._request('git/blobs', 'POST', {
            content: content,
            encoding: 'utf-8'
        });
        return data.sha;
    }

    /**
     * Create a new tree combining the base tree with new modified blobs.
     * @param {string} baseTreeSha The base tree SHA
     * @param {Array} fileUpdates Array of { path, content }
     */
    async createTree(baseTreeSha, fileUpdates) {
        const tree = [];
        for (const file of fileUpdates) {
            const blobSha = await this.createBlob(file.content);
            tree.push({
                path: file.path,
                mode: '100644', // Normal file
                type: 'blob',
                sha: blobSha
            });
        }

        const data = await this._request('git/trees', 'POST', {
            base_tree: baseTreeSha,
            tree: tree
        });
        return data.sha;
    }

    /**
     * Create a new commit.
     */
    async createCommit(message, treeSha, parentSha) {
        const data = await this._request('git/commits', 'POST', {
            message: message,
            tree: treeSha,
            parents: [parentSha]
        });
        return data.sha;
    }

    /**
     * Update the branch reference to point to the new commit.
     */
    async updateReference(commitSha) {
        const data = await this._request(`git/refs/heads/${this.branch}`, 'PATCH', {
            sha: commitSha,
            force: false
        });
        return data;
    }

    /**
     * Get the current SHA of a specific file on GitHub.
     * @param {string} path File path in repo.
     */
    async getFileSha(path) {
        try {
            const data = await this._request(`contents/${path}`, 'GET');
            return data.sha;
        } catch (error) {
            // If file doesn't exist, return null
            if (error.message.includes('404')) return null;
            throw error;
        }
    }

    /**
     * Commits several files as one commit.
     *
     * Was narrated with seven `console.log` lines walking through each step of
     * the git plumbing. Useful while it was being written, noise in a shipped
     * module — and it logged commit SHAs into the console of anyone who opened
     * the blog with devtools open.
     *
     * @param {string} message The commit message.
     * @param {Array<{path: string, content: string}>} fileUpdates
     * @returns {Promise<string>} The new commit's SHA.
     */
    async commitFiles(message, fileUpdates) {
        // One commit for every file, always.
        //
        // The blog's Markdown and the generated index have to move together —
        // a commit carrying one without the other publishes a site whose
        // listings disagree with its posts. Building a tree and a single commit
        // is what buys that; committing them one at a time through the contents
        // API would deploy the half-applied state in between.
        const latestCommitSha = await this.getLatestCommitSha();
        const baseCommit = await this._request(`git/commits/${latestCommitSha}`);
        const newTreeSha = await this.createTree(baseCommit.tree.sha, fileUpdates);
        const newCommitSha = await this.createCommit(message, newTreeSha, latestCommitSha);

        // `force: false` on the ref update, so a push that raced someone else's
        // is rejected rather than silently discarding their commit.
        await this.updateReference(newCommitSha);

        return newCommitSha;
    }
}
