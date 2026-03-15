import { BlogService } from './engine/BlogService.js';
import { BlogRenderer } from './engine/BlogRenderer.js';

document.addEventListener('DOMContentLoaded', () => {
    const postList = document.getElementById('post-list');
    const postDetail = document.getElementById('post-detail');
    const postBody = document.getElementById('post-body');
    const backBtn = document.getElementById('back-to-list');
    const searchInput = document.getElementById('blog-search');
    const categoryFilters = document.getElementById('category-filters');

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
        setupSearch();
        setupNavigation();
    }

    /**
     * Render a list of posts to the UI.
     * @param {Array} posts Array of post metadata.
     */
    function renderPostList(posts) {
        postList.innerHTML = '';
        posts.forEach(post => {
            const preview = BlogRenderer.createPreviewElement(post);
            preview.addEventListener('click', () => loadPost(post.id));
            postList.appendChild(preview);
        });
        
        postList.classList.remove('hidden');
        postDetail.classList.add('hidden');
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
            
            postBody.innerHTML = BlogRenderer.render(content);
            
            postList.classList.add('hidden');
            postDetail.classList.remove('hidden');
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
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.textContent = cat;
            btn.dataset.category = cat;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                if (cat === 'all') {
                    renderPostList(BlogService.getAllPosts());
                } else {
                    renderPostList(BlogService.filterByCategory(cat));
                }
            });
            categoryFilters.appendChild(btn);
        });

        // Add "All" functionality to existing button
        const allBtn = categoryFilters.querySelector('[data-category="all"]');
        allBtn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            renderPostList(BlogService.getAllPosts());
        });
    }

    /**
     * Set up search functionality.
     */
    function setupSearch() {
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
        backBtn.addEventListener('click', () => {
            postList.classList.remove('hidden');
            postDetail.classList.add('hidden');
        });
    }

    init();
});
