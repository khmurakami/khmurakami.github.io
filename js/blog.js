import { BlogService } from './engine/BlogService.js';
import { BlogRenderer } from './engine/BlogRenderer.js';

document.addEventListener('DOMContentLoaded', () => {
    const postList = document.getElementById('post-list');
    const postDetail = document.getElementById('post-detail');
    const postBody = document.getElementById('post-body');
    const backBtn = document.getElementById('back-to-list');
    const searchInput = document.getElementById('blog-search');
    const categoryFilters = document.getElementById('category-filters');
    const blogLayout = document.querySelector('.blog-layout');

    // Sidebar View Toggles
    const modeFeedBtn = document.getElementById('mode-feed');
    const modeTreeBtn = document.getElementById('mode-tree');
    const feedView = document.getElementById('sidebar-feed-view');
    const treeView = document.getElementById('sidebar-tree-view');

    /**
     * Initialize the blog page.
     */
    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('id');
        const category = urlParams.get('category');
        const tag = urlParams.get('tag');

        if (postId) {
            loadPost(postId);
        } else if (category) {
            renderPostList(BlogService.filterByCategory(category));
        } else if (tag) {
            renderPostList(BlogService.filterByTag(tag));
        } else {
            renderPostList(BlogService.getAllPosts());
        }

        setupFilters();
        setupRecentSidebar();
        setupDiscoveryPanel();
        setupSearch();
        setupNavigation();
        setupModeToggles();
    }

    /**
     * Set up sidebar mode toggles.
     */
    function setupModeToggles() {
        if (!modeFeedBtn || !modeTreeBtn) return;

        modeFeedBtn.addEventListener('click', () => {
            modeFeedBtn.classList.add('active');
            modeTreeBtn.classList.remove('active');
            feedView.classList.remove('hidden');
            treeView.classList.add('hidden');
        });

        modeTreeBtn.addEventListener('click', () => {
            modeTreeBtn.classList.add('active');
            modeFeedBtn.classList.remove('active');
            treeView.classList.remove('hidden');
            feedView.classList.add('hidden');
            
            // Build tree if it's the first time
            buildDocTree();
        });
    }

    /**
     * Build the Documentation Tree structure.
     * (Simplified version for Phase 1 UI setup)
     */
    function buildDocTree() {
        const treeContainer = document.getElementById('doc-tree-container');
        if (!treeContainer) return;

        const posts = BlogService.getAllPosts();
        const categories = [...new Set(posts.map(p => p.category))];

        treeContainer.innerHTML = '';
        categories.forEach(cat => {
            const folder = document.createElement('div');
            folder.className = 'tree-folder';
            folder.innerHTML = `<div class="folder-header">📁 ${cat}</div>`;
            
            const fileList = document.createElement('ul');
            fileList.className = 'tree-file-list';
            
            const catPosts = BlogService.filterByCategory(cat);
            catPosts.forEach(post => {
                const li = document.createElement('li');
                li.className = 'tree-file';
                li.textContent = `📄 ${post.title}`;
                li.addEventListener('click', () => {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('id', post.id);
                    window.history.pushState({id: post.id}, '', newUrl);
                    loadPost(post.id);
                });
                fileList.appendChild(li);
            });
            
            folder.appendChild(fileList);
            treeContainer.appendChild(folder);
        });
    }

    /**
     * Set up the discovery panel with suggested content.
     */
    function setupDiscoveryPanel() {
        const exploration = document.querySelector('.blog-exploration');
        if (!exploration) return;

        // Create Discovery section if it doesn't exist
        let discoverySection = document.getElementById('discovery-suggestions');
        if (!discoverySection) {
            discoverySection = document.createElement('div');
            discoverySection.id = 'discovery-suggestions';
            discoverySection.className = 'sidebar-section';
            discoverySection.innerHTML = `<h3>Top Findings</h3><ul class="blog-nav-list"></ul>`;
            exploration.appendChild(discoverySection);
        }

        const list = discoverySection.querySelector('ul');
        list.innerHTML = '';
        
        // Pick 3 random or top-weighted posts for discovery
        const posts = BlogService.getAllPosts();
        const suggested = posts.sort(() => 0.5 - Math.random()).slice(0, 3);
        
        suggested.forEach(post => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.innerHTML = `${post.title} <span>→</span>`;
            btn.addEventListener('click', () => {
                // Update URL and load
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('id', post.id);
                window.history.pushState({id: post.id}, '', newUrl);
                loadPost(post.id);
            });
            li.appendChild(btn);
            list.appendChild(li);
        });
    }

    /**
     * Render a list of posts to the UI.
     * @param {Array} posts Array of post metadata.
     */
    function renderPostList(posts) {
        postList.innerHTML = '';
        posts.forEach(post => {
            const preview = BlogRenderer.createPreviewElement(post);
            preview.addEventListener('click', () => {
                // Update URL without reloading
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('id', post.id);
                newUrl.searchParams.delete('category');
                newUrl.searchParams.delete('tag');
                window.history.pushState({id: post.id}, '', newUrl);
                loadPost(post.id);
            });
            postList.appendChild(preview);
        });
        
        postList.classList.remove('hidden');
        postDetail.classList.add('hidden');
        if (blogLayout) blogLayout.classList.remove('single-post-mode');
        window.scrollTo(0, 0);
    }

    /**
     * Load and display a full blog post.
     * @param {string} id Post ID.
     */
    async function loadPost(id) {
        const post = BlogService.getPostById(id);
        if (!post) return;

        try {
            const response = await fetch(post.file);
            const markdown = await response.text();
            
            // Basic front-matter stripping (crude but effective for now)
            const content = markdown.replace(/^---[\s\S]*?---/, '').trim();
            
            // Populate post detail fields
            document.getElementById('post-title-display').textContent = post.title;
            document.getElementById('post-meta-top').textContent = `${post.date} • ${post.category}`;
            
            const tagsDisplay = document.getElementById('post-tags-display');
            tagsDisplay.innerHTML = '';
            post.tags.forEach(tag => {
                const span = document.createElement('span');
                span.className = 'tag';
                span.textContent = `#${tag}`;
                tagsDisplay.appendChild(span);
            });

            postBody.innerHTML = BlogRenderer.render(content);
            
            postList.classList.add('hidden');
            postDetail.classList.remove('hidden');
            if (blogLayout) blogLayout.classList.add('single-post-mode');
            window.scrollTo(0, 0);
        } catch (error) {
            console.error('Failed to load post content:', error);
            alert('Failed to load post content. Please try again later.');
        }
    }

    /**
     * Set up category filter buttons.
     */
    function setupFilters() {
        const posts = BlogService.getAllPosts();
        const categories = [...new Set(posts.map(p => p.category))];
        
        categories.forEach(cat => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.textContent = cat;
            btn.dataset.category = cat;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update URL
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('category', cat);
                newUrl.searchParams.delete('id');
                newUrl.searchParams.delete('tag');
                window.history.pushState({category: cat}, '', newUrl);

                renderPostList(BlogService.filterByCategory(cat));
            });
            li.appendChild(btn);
            categoryFilters.appendChild(li);
        });

        // "All" button logic
        const allBtn = categoryFilters.querySelector('[data-category="all"]');
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                allBtn.classList.add('active');
                
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('id');
                newUrl.searchParams.delete('category');
                newUrl.searchParams.delete('tag');
                window.history.pushState({}, '', newUrl);

                renderPostList(BlogService.getAllPosts());
            });
        }
    }

    /**
     * Set up recent posts in the sidebar.
     */
    function setupRecentSidebar() {
        const recentList = document.getElementById('sidebar-recent-list');
        if (!recentList) return;

        recentList.innerHTML = '';
        const recentPosts = BlogService.getAllPosts().slice(0, 5);
        recentPosts.forEach(post => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.innerHTML = `${post.title} <span>${post.date}</span>`;
            btn.addEventListener('click', () => {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('id', post.id);
                window.history.pushState({id: post.id}, '', newUrl);
                loadPost(post.id);
            });
            li.appendChild(btn);
            recentList.appendChild(li);
        });
    }

    /**
     * Set up search functionality.
     */
    function setupSearch() {
        if (!searchInput) return;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            const results = BlogService.searchPosts(query);
            renderPostList(results);
        });
    }

    /**
     * Set up general navigation events.
     */
    function setupNavigation() {
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('id');
                window.history.pushState({}, '', newUrl);
                renderPostList(BlogService.getAllPosts());
            });
        }

        // Handle back/forward buttons
        window.addEventListener('popstate', (e) => {
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('id');
            if (id) {
                loadPost(id);
            } else {
                renderPostList(BlogService.getAllPosts());
            }
        });
    }

    init();
});
