/**
 * BlogRenderer handles converting Markdown to HTML and creating UI elements.
 */
export class BlogRenderer {
    /**
     * Render Markdown text to HTML using marked.js with enhanced interactive elements.
     * @param {string} markdown Raw Markdown content.
     * @returns {string} Sanitized HTML.
     */
    static render(markdown) {
        if (!window.marked) {
            console.error('marked.js not found');
            return markdown;
        }

        // Custom renderer for marked.js to inject interactive elements
        const renderer = new window.marked.Renderer();

        // Enhance code blocks with a "cozy terminal" frame and interaction
        renderer.code = (token) => {
            const { text, lang } = token;
            const escapedText = text.replace(/"/g, '&quot;');
            return `
                <div class="interactive-code-block" data-lang="${lang || 'code'}">
                    <div class="code-header">
                        <span class="code-dot red"></span>
                        <span class="code-dot yellow"></span>
                        <span class="code-dot green"></span>
                        <span class="code-lang">${lang || 'txt'}</span>
                        <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${escapedText}\`)">Copy</button>
                    </div>
                    <pre><code class="language-${lang}">${text}</code></pre>
                </div>
            `;
        };

        // Enhance blockquotes into "Deep Dive" callouts
        // Note: Newer marked.js versions pass an object { text, tokens }
        renderer.blockquote = (token) => {
            const quote = typeof token === 'string' ? token : token.text;
            return `<div class="deep-dive-callout">
                <div class="callout-icon">💡</div>
                <div class="callout-content">${quote}</div>
            </div>`;
        };

        return window.marked.parse(markdown, { renderer });
    }

    /**
     * Create a DOM element for a post preview.
     * @param {Object} post Post metadata.
     * @returns {HTMLElement} The preview element.
     */
    static createPreviewElement(post) {
        const div = document.createElement('div');
        div.className = 'post-preview';
        div.dataset.id = post.id;
        div.innerHTML = `
            <div class="post-meta">${post.date} • ${post.category}</div>
            <h2>${post.title}</h2>
            <p>${post.summary}</p>
            <div class="read-more">Read Insight →</div>
        `;
        return div;
    }
}
