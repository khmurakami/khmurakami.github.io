/*
 * Links out of the room. Every outside address (a GitHub repo, a profile's
 * website) goes through here: only http and https are allowed, and new tabs
 * never get a handle back on this page.
 *
 *   Links.safe(url)        the url if it's http(s), else null
 *   Links.open(url)        open it in a new tab
 *   Links.anchor(url, text) an <a> for it, or plain text if it isn't safe
 */
(function () {
    'use strict';

    function safe(url) {
        try {
            const u = new URL(String(url), location.href);
            return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
        } catch {
            return null;
        }
    }

    function anchor(url, text) {
        const href = safe(url);
        if (!href) return document.createTextNode(text || String(url));
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = text || href;
        return a;
    }

    function open(url) {
        const href = safe(url);
        if (!href) return false;
        const w = window.open(href, '_blank', 'noopener,noreferrer');
        if (!w) { const a = anchor(href); document.body.appendChild(a); a.click(); a.remove(); }
        return true;
    }

    window.Links = { safe, open, anchor };
})();
