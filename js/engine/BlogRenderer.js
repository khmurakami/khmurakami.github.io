/**
 * BlogRenderer handles converting Markdown to HTML and creating UI elements.
 */
export class BlogRenderer {
    /**
     * Render Markdown text to HTML using marked.js.
     * @param {string} markdown Raw Markdown content.
     * @returns {string} Sanitized HTML.
     */
    static render(markdown) {
        if (!window.marked) {
            console.error('marked.js not found');
            return markdown;
        }
        return window.marked.parse(markdown);
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
