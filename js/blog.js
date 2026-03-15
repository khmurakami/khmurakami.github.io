import { BlogService } from './engine/BlogService.js';
import { BlogRenderer } from './engine/BlogRenderer.js';
import { DocTreeService } from './engine/DocTreeService.js';
import { GitHubStorageService } from './engine/GitHubStorageService.js';

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

        // Initialize table grid cells
        const gridCellsContainer = document.getElementById('grid-cells');
        const gridDimensionsLabel = document.getElementById('grid-dimensions');
        const tableGridSelector = document.getElementById('table-grid-selector');
        const tableBtn = document.getElementById('table-btn');

        if (gridCellsContainer) {
            for (let r = 1; r <= 10; r++) {
                for (let c = 1; c <= 10; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'grid-cell';
                    cell.dataset.row = r;
                    cell.dataset.col = c;

                    cell.addEventListener('mouseover', () => {
                        gridDimensionsLabel.textContent = `${c} x ${r}`;
                        document.querySelectorAll('.grid-cell').forEach(el => {
                            const er = parseInt(el.dataset.row);
                            const ec = parseInt(el.dataset.col);
                            el.classList.toggle('active', er <= r && ec <= c);
                        });
                    });

                    cell.addEventListener('click', () => {
                        const tableMd = generateMarkdownTable(r, c);
                        insertAtCursor(tableMd);
                        tableGridSelector.classList.add('hidden');
                    });

                    gridCellsContainer.appendChild(cell);
                }
            }
        }

        if (tableBtn && tableGridSelector) {
            tableBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                tableGridSelector.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!tableGridSelector.contains(e.target) && e.target !== tableBtn) {
                    tableGridSelector.classList.add('hidden');
                }
            });
        }

        editModeToggle.addEventListener('click', () => {
            isEditMode = !isEditMode;

            if (isEditMode) {
                editModeToggle.textContent = '👁️ View Page';
                editorToolbar.classList.remove('hidden');
                postBody.classList.add('hidden');
                postTitleDisplay.classList.add('hidden');
                postEditorTextarea.classList.remove('hidden');
                postTitleInput.classList.remove('hidden');

                const draft = localStorage.getItem(`draft_${currentPostId}`);
                if (draft) {
                    postEditorTextarea.value = draft;
                    autoSaveStatus.textContent = 'Draft loaded';
                }
            } else {
                editModeToggle.textContent = '✏️ Edit Page';
                editorToolbar.classList.add('hidden');
                postBody.classList.remove('hidden');
                postTitleDisplay.classList.remove('hidden');
                postEditorTextarea.classList.add('hidden');
                postTitleInput.classList.add('hidden');

                postTitleDisplay.textContent = postTitleInput.value || 'Untitled';
                postBody.innerHTML = BlogRenderer.render(postEditorTextarea.value);
            }
        });

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

        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!postEditorTextarea) return;
                const title = e.currentTarget.title;
                let insert = '';

                if (title === 'Bold') insert = '**bold text**';
                if (title === 'Italic') insert = '*italic text*';
                if (title === 'Code') insert = '`code`';
                if (title === 'Image') {
                    const url = prompt('Enter image URL:');
                    const alt = prompt('Enter image description (alt text):', 'Image');
                    if (url) insert = `![${alt}](${url})`;
                }

                if (insert) {
                    insertAtCursor(insert);
                }
            });
        });

        const publishBtn = document.getElementById('publish-github-btn');
        if (publishBtn) {
            publishBtn.addEventListener('click', async () => {
                if (!currentPostId) return;
                const token = prompt('Enter PAT:');
                if (!token) return;

                try {
                    publishBtn.textContent = 'Publishing...';
                    publishBtn.disabled = true;
                    const github = new GitHubStorageService('khmurakami', 'khmurakami.github.io');
                    github.setToken(token);
                    const post = BlogService.getPostById(currentPostId);
                    const markdownContent = `---\ntitle: ${postTitleInput.value || post.title}\ndate: ${post.date}\ntags: [${post.tags.join(', ')}]\ncategory: ${post.category}\nsummary: ${post.summary}\n---\n\n${postEditorTextarea.value}`;
                    await github.commitFiles(`docs(blog): Update post ${currentPostId}`, [{ path: post.file.replace('./', ''), content: markdownContent }]);
                    alert('Published!');
                    localStorage.removeItem(`draft_${currentPostId}`);
                    editModeToggle.click();
                } catch (error) {
                    alert('Error: ' + error.message);
                } finally {
                    publishBtn.textContent = 'Publish to GitHub';
                    publishBtn.disabled = false;
                }
            });
        }
    }

    function insertAtCursor(text) {
        if (!postEditorTextarea) return;
        const start = postEditorTextarea.selectionStart;
        const end = postEditorTextarea.selectionEnd;
        const val = postEditorTextarea.value;
        postEditorTextarea.value = val.substring(0, start) + text + val.substring(end);
        postEditorTextarea.dispatchEvent(new Event('input'));
    }

    function generateMarkdownTable(rows, cols) {
        let table = '\n|';
        for (let c = 1; c <= cols; c++) table += ` Column ${c} |`;
        table += '\n|';
        for (let c = 1; c <= cols; c++) table += ' --- |';
        for (let r = 1; r <= rows; r++) {
            table += '\n|';
            for (let c = 1; c <= cols; c++) table += ` Row ${r} Col ${c} |`;
        }
        return table + '\n';
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
                    const folder = createTreeFolder({ name, type: 'category', children: [] }, 'category');
                    treeContainer.prepend(folder);
                }
            });
        }
        if (addPageBtn) {
            addPageBtn.addEventListener('click', () => {
                const title = prompt('Enter page title:');
                if (title) alert('Draft page "' + title + '" created. GitHub save in progress!');
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
        tree.forEach(catNode => treeContainer.appendChild(createTreeFolder(catNode, 'category')));
    }

    /**
     * Create a tree folder element.
     */
    function createTreeFolder(node, level) {
        const folderDiv = document.createElement('div');
        folderDiv.className = `tree-node ${level}`;
        folderDiv.draggable = true;
        const header = document.createElement('div');
        header.className = 'node-header';
        header.innerHTML = `<span class="node-chevron">▶</span><span class="node-label">${level === 'category' ? '📁' : '📄'} ${node.name}</span>`;
        const content = document.createElement('div');
        content.className = 'node-children hidden';
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            if (level === 'category') {
                const isOpen = header.classList.toggle('open');
                content.classList.toggle('hidden', !isOpen);
                header.querySelector('.node-chevron').style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
            } else {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('id', node.id);
                window.history.pushState({id: node.id}, '', newUrl);
                loadPost(node.id);
            }
        });
        folderDiv.addEventListener('dragstart', (e) => { draggedItem = folderDiv; folderDiv.classList.add('node-dragging'); e.dataTransfer.setData('text/plain', node.name); });
        folderDiv.addEventListener('dragend', () => { folderDiv.classList.remove('node-dragging'); draggedItem = null; });
        folderDiv.addEventListener('dragover', (e) => { e.preventDefault(); folderDiv.classList.add('node-drop-target'); });
        folderDiv.addEventListener('dragleave', () => { folderDiv.classList.remove('node-drop-target'); });
        folderDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            folderDiv.classList.remove('node-drop-target');
            if (draggedItem && draggedItem !== folderDiv) {
                if (level === 'category' && !draggedItem.classList.contains('category')) {
                    content.classList.remove('hidden');
                    header.classList.add('open');
                    header.querySelector('.node-chevron').style.transform = 'rotate(90deg)';
                    content.appendChild(draggedItem);
                } else {
                    folderDiv.parentNode.insertBefore(draggedItem, folderDiv);
                }
            }
        });
        if (level === 'category') node.children.forEach(postNode => content.appendChild(createTreeFolder(postNode, 'post')));
        folderDiv.appendChild(header);
        if (level === 'category') folderDiv.appendChild(content);
        else header.querySelector('.node-chevron').style.opacity = '0';
        return folderDiv;
    }

    /**
     * Set up discovery panel.
     */
    function setupDiscoveryPanel() {
        const exploration = document.querySelector('.blog-exploration');
        if (!exploration) return;
        let discoverySection = document.getElementById('discovery-suggestions') || document.createElement('div');
        discoverySection.id = 'discovery-suggestions';
        discoverySection.className = 'sidebar-section';
        discoverySection.innerHTML = `<h3>Top Findings</h3><ul class="blog-nav-list"></ul>`;
        exploration.appendChild(discoverySection);
        const list = discoverySection.querySelector('ul');
        const suggested = BlogService.getAllPosts().sort(() => 0.5 - Math.random()).slice(0, 3);
        suggested.forEach(post => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.innerHTML = `${post.title} <span>→</span>`;
            btn.addEventListener('click', () => { const newUrl = new URL(window.location.href); newUrl.searchParams.set('id', post.id); window.history.pushState({id: post.id}, '', newUrl); loadPost(post.id); });
            li.appendChild(btn);
            list.appendChild(li);
        });
    }

    /**
     * Render post list.
     */
    function renderPostList(posts) {
        postList.innerHTML = '';
        posts.forEach(post => {
            const preview = BlogRenderer.createPreviewElement(post);
            preview.addEventListener('click', () => { const newUrl = new URL(window.location.href); newUrl.searchParams.set('id', post.id); newUrl.searchParams.delete('category'); newUrl.searchParams.delete('tag'); window.history.pushState({id: post.id}, '', newUrl); loadPost(post.id); });
            postList.appendChild(preview);
        });
        postList.classList.remove('hidden');
        postDetail.classList.add('hidden');
        if (blogLayout) blogLayout.classList.remove('single-post-mode');
        window.scrollTo(0, 0);
    }

    /**
     * Load a full post.
     */
    async function loadPost(id) {
        const post = BlogService.getPostById(id);
        if (!post) return;
        try {
            const response = await fetch(post.file);
            const markdown = await response.text();
            const content = markdown.replace(/^---[\s\S]*?---/, '').trim();
            document.getElementById('post-title-display').textContent = post.title;
            if (postTitleInput) postTitleInput.value = post.title;
            document.getElementById('post-meta-top').textContent = `${post.date} • ${post.category}`;
            const tagsDisplay = document.getElementById('post-tags-display');
            tagsDisplay.innerHTML = '';
            post.tags.forEach(tag => { const span = document.createElement('span'); span.className = 'tag'; span.textContent = `#${tag}`; tagsDisplay.appendChild(span); });
            postBody.innerHTML = BlogRenderer.render(content);
            if (postEditorTextarea) postEditorTextarea.value = content;
            postList.classList.add('hidden');
            postDetail.classList.remove('hidden');
            if (blogLayout) blogLayout.classList.add('single-post-mode');
            window.scrollTo(0, 0);
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * Set up category filters.
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
            btn.addEventListener('click', () => { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); const newUrl = new URL(window.location.href); newUrl.searchParams.set('category', cat); newUrl.searchParams.delete('id'); newUrl.searchParams.delete('tag'); window.history.pushState({category: cat}, '', newUrl); renderPostList(BlogService.filterByCategory(cat)); });
            li.appendChild(btn);
            categoryFilters.appendChild(li);
        });
        const allBtn = categoryFilters.querySelector('[data-category="all"]');
        if (allBtn) {
            allBtn.addEventListener('click', () => { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); allBtn.classList.add('active'); const newUrl = new URL(window.location.href); newUrl.searchParams.delete('id'); newUrl.searchParams.delete('category'); newUrl.searchParams.delete('tag'); window.history.pushState({}, '', newUrl); renderPostList(BlogService.getAllPosts()); });
        }
    }

    /**
     * Set up recent sidebar.
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
            btn.addEventListener('click', () => { const newUrl = new URL(window.location.href); newUrl.searchParams.set('id', post.id); window.history.pushState({id: post.id}, '', newUrl); loadPost(post.id); });
            li.appendChild(btn);
            recentList.appendChild(li);
        });
    }

    /**
     * Set up search.
     */
    function setupSearch() {
        if (!searchInput) return;
        searchInput.addEventListener('input', (e) => { renderPostList(BlogService.searchPosts(e.target.value)); });
    }

    /**
     * Set up general nav.
     */
    function setupNavigation() {
        if (backBtn) {
            backBtn.addEventListener('click', () => { const newUrl = new URL(window.location.href); newUrl.searchParams.delete('id'); window.history.pushState({}, '', newUrl); renderPostList(BlogService.getAllPosts()); });
        }
        window.addEventListener('popstate', (e) => {
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('id');
            if (id) loadPost(id);
            else renderPostList(BlogService.getAllPosts());
        });
    }

    init();
});
