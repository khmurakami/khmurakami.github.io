import { BlogService } from './engine/BlogService.js';
import { BlogRenderer } from './engine/BlogRenderer.js';
import { DocTreeService } from './engine/DocTreeService.js';

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

    // Tree Actions
    const addFolderBtn = document.getElementById('add-folder-btn');
    const addPageBtn = document.getElementById('add-page-btn');

    // Drag & Drop State
    let draggedItem = null;

    // Editor UI Elements
    const editModeToggle = document.getElementById('edit-mode-toggle');
    const editorToolbar = document.getElementById('editor-toolbar');
    const postTitleDisplay = document.getElementById('post-title-display');
    const postTitleInput = document.getElementById('post-title-input');
    const postEditorTextarea = document.getElementById('post-editor-textarea');
    const autoSaveStatus = document.getElementById('auto-save-status');

    let currentPostId = null;
    let isEditMode = false;
    // Drag & Drop State
    let draggedItem = null;

    // Editor UI Elements
    const editModeToggle = document.getElementById('edit-mode-toggle');
    const editorToolbar = document.getElementById('editor-toolbar');
    const postBody = document.getElementById('post-body');
    const postTitleDisplay = document.getElementById('post-title-display');
    const postTitleInput = document.getElementById('post-title-input');
    const postEditorTextarea = document.getElementById('post-editor-textarea');
    const autoSaveStatus = document.getElementById('auto-save-status');

    let currentPostId = null;
    let isEditMode = false;
    let autoSaveTimeout = null;

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
        setupTreeActions();
        setupEditor();
    }

    /**
     * Set up Edit Mode and Auto-Save logic.
     */
    function setupEditor() {
        if (!editModeToggle) return;

        editModeToggle.addEventListener('click', () => {
            isEditMode = !isEditMode;

            if (isEditMode) {
                // Enter Edit Mode
                editModeToggle.textContent = '👁️ View Page';
                editorToolbar.classList.remove('hidden');
                postBody.classList.add('hidden');
                postTitleDisplay.classList.add('hidden');
                postEditorTextarea.classList.remove('hidden');
                postTitleInput.classList.remove('hidden');

                // Load draft from local storage
                const draft = localStorage.getItem(`draft_${currentPostId}`);
                if (draft) {
                    postEditorTextarea.value = draft;
                    autoSaveStatus.textContent = 'Draft loaded';
                }
            } else {
                // Exit Edit Mode (Preview)
                editModeToggle.textContent = '✏️ Edit Page';
                editorToolbar.classList.add('hidden');
                postBody.classList.remove('hidden');
                postTitleDisplay.classList.remove('hidden');
                postEditorTextarea.classList.add('hidden');
                postTitleInput.classList.add('hidden');

                // Re-render preview
                postTitleDisplay.textContent = postTitleInput.value || 'Untitled';
                postBody.innerHTML = BlogRenderer.render(postEditorTextarea.value);
            }
        });

        // Auto-save logic
        const handleInput = () => {
            autoSaveStatus.textContent = 'Saving...';
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                if (currentPostId) {
                    localStorage.setItem(`draft_${currentPostId}`, postEditorTextarea.value);
                    autoSaveStatus.textContent = 'Saved locally';
                }
            }, 1000);
        };

        if (postEditorTextarea) postEditorTextarea.addEventListener('input', handleInput);
        if (postTitleInput) postTitleInput.addEventListener('input', handleInput);

        // Simple Toolbar formatting
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!postEditorTextarea) return;
                const title = e.currentTarget.title;
                const start = postEditorTextarea.selectionStart;
                const end = postEditorTextarea.selectionEnd;
                const text = postEditorTextarea.value;
                let insert = '';

                if (title === 'Bold') insert = '**bold text**';
                if (title === 'Italic') insert = '*italic text*';
                if (title === 'Code') insert = '`code`';

                postEditorTextarea.value = text.substring(0, start) + insert + text.substring(end);
                handleInput();
            });
        });
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
            
            buildDocTree();
        });
    }

    /**
     * Set up "New Folder" and "New Page" actions.
     */
    function setupTreeActions() {
        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', () => {
                const name = prompt('Enter folder name:');
                if (name) {
                    const treeContainer = document.getElementById('doc-tree-container');
                    const newNode = { name, type: 'category', children: [] };
                    const folder = createTreeFolder(newNode, 'category');
                    treeContainer.prepend(folder);
                }
            });
        }

        if (addPageBtn) {
            addPageBtn.addEventListener('click', () => {
                const title = prompt('Enter page title:');
                if (title) {
                    alert('New page "' + title + '" created as draft. Saving to GitHub will be available in Phase 3!');
                }
            });
        }
    }

    /**
     * Build the Documentation Tree structure.
     */
    function buildDocTree() {
        const treeContainer = document.getElementById('doc-tree-container');
        if (!treeContainer) return;

        const posts = BlogService.getAllPosts();
        const tree = DocTreeService.generateTree(posts);

        treeContainer.innerHTML = '';
        tree.forEach(catNode => {
            const folder = createTreeFolder(catNode, 'category');
            treeContainer.appendChild(folder);
        });
    }

    /**
     * Create a tree folder element (Category or Tag).
     */
    function createTreeFolder(node, level) {
        const folderDiv = document.createElement('div');
        folderDiv.className = `tree-node ${level}`;
        folderDiv.draggable = true;
        
        const header = document.createElement('div');
        header.className = 'node-header';
        header.innerHTML = `
            <span class="node-chevron">▶</span>
            <span class="node-label">${level === 'category' ? '📁' : '📄'} ${node.name}</span>
        `;
        
        const content = document.createElement('div');
        content.className = 'node-children hidden';
        
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            if (level === 'category') {
                const isOpen = header.classList.toggle('open');
                content.classList.toggle('hidden', !isOpen);
                header.querySelector('.node-chevron').style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
            } else {
                // Post level click
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('id', node.id);
                window.history.pushState({id: node.id}, '', newUrl);
                loadPost(node.id);
            }
        });

        // Drag & Drop Handlers
        folderDiv.addEventListener('dragstart', (e) => {
            draggedItem = folderDiv;
            folderDiv.classList.add('node-dragging');
            e.dataTransfer.setData('text/plain', node.name);
        });

        folderDiv.addEventListener('dragend', () => {
            folderDiv.classList.remove('node-dragging');
            draggedItem = null;
        });

        folderDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            folderDiv.classList.add('node-drop-target');
        });

        folderDiv.addEventListener('dragleave', () => {
            folderDiv.classList.remove('node-drop-target');
        });

        folderDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            folderDiv.classList.remove('node-drop-target');
            
            if (draggedItem && draggedItem !== folderDiv) {
                // If dropping on a category folder, move into its children
                if (level === 'category' && !draggedItem.classList.contains('category')) {
                    content.classList.remove('hidden');
                    header.classList.add('open');
                    header.querySelector('.node-chevron').style.transform = 'rotate(90deg)';
                    content.appendChild(draggedItem);
                } else {
                    // Otherwise move it before this node
                    folderDiv.parentNode.insertBefore(draggedItem, folderDiv);
                }
                console.log('UI structure updated. Permanent save will be available in Phase 3!');
            }
        });

        if (level === 'category') {
            node.children.forEach(postNode => {
                content.appendChild(createTreeFolder(postNode, 'post'));
            });
        }

        folderDiv.appendChild(header);
        if (level === 'category') {
            folderDiv.appendChild(content);
        } else {
            header.querySelector('.node-chevron').style.opacity = '0'; // Hide chevron for posts
        }
        return folderDiv;
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
