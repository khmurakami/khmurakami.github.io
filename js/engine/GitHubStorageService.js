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
     * High-level method to commit multiple files at once.
     * @param {string} message The commit message.
     * @param {Array} fileUpdates Array of objects: { path: "string", content: "string" }
     */
    async commitFiles(message, fileUpdates) {
        try {
            console.log('Starting GitHub commit process...');
            
            // 1. Get current commit SHA
            const latestCommitSha = await this.getLatestCommitSha();
            console.log(`1. Got latest commit: ${latestCommitSha.substring(0, 7)}`);

            // 2. Get the tree SHA for the latest commit (implicitly used as base_tree)
            const baseCommitData = await this._request(`git/commits/${latestCommitSha}`);
            const baseTreeSha = baseCommitData.tree.sha;
            console.log(`2. Got base tree: ${baseTreeSha.substring(0, 7)}`);

            // 3. Create a new tree with our updated files
            const newTreeSha = await this.createTree(baseTreeSha, fileUpdates);
            console.log(`3. Created new tree: ${newTreeSha.substring(0, 7)}`);

            // 4. Create the new commit
            const newCommitSha = await this.createCommit(message, newTreeSha, latestCommitSha);
            console.log(`4. Created new commit: ${newCommitSha.substring(0, 7)}`);

            // 5. Update the reference (push)
            await this.updateReference(newCommitSha);
            console.log('5. Successfully updated branch reference. Commit complete!');
            
            return newCommitSha;
        } catch (error) {
            console.error('Failed to commit files to GitHub:', error);
            throw error;
        }
    }
}
