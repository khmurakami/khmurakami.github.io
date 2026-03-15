import { BlogService } from '../engine/BlogService.js';
import { DocTreeService } from '../engine/DocTreeService.js';
import { BlogRenderer } from '../engine/BlogRenderer.js';

export class SidebarController {
    constructor(appContext) {
        this.appContext = appContext;
        this.modeFeedBtn = document.getElementById('mode-feed');
        this.modeTreeBtn = document.getElementById('mode-tree');
        this.feedView = document.getElementById('sidebar-feed-view');
        this.treeView = document.getElementById('sidebar-tree-view');
        this.treeContainer = document.getElementById('doc-tree-container');
        this.draggedItem = null;

        this.initToggles();
        this.initFilters();
        this.initRecentList();
        this.initDiscoveryPanel();
        this.initTreeActions();
    }

    initToggles() {
        if (!this.modeFeedBtn || !this.modeTreeBtn) return;

        this.modeFeedBtn.addEventListener('click', () => {
            this.modeFeedBtn.classList.add('active');
            this.modeTreeBtn.classList.remove('active');
            this.feedView.classList.remove('hidden');
            this.treeView.classList.add('hidden');
        });

        this.modeTreeBtn.addEventListener('click', () => {
            this.modeTreeBtn.classList.add('active');
            this.modeFeedBtn.classList.remove('active');
            this.treeView.classList.remove('hidden');
            this.feedView.classList.add('hidden');
            this.buildDocTree();
        });
    }

    initFilters() {
        const categoryFilters = document.getElementById('category-filters');
        if (!categoryFilters) return;

        const posts = BlogService.getAllPosts();
        const categories = [...new Set(posts.map(p => p.category))];
        
        categories.forEach(cat => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.textContent = cat;
            btn.dataset.category = cat;
            btn.addEventListener('click', () => {
                document.querySelectorAll('#category-filters .nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.appContext.navigation.updateUrl({ category: cat });
                this.appContext.renderFeed(BlogService.filterByCategory(cat));
            });
            li.appendChild(btn);
            categoryFilters.appendChild(li);
        });

        const allBtn = categoryFilters.querySelector('[data-category="all"]');
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                document.querySelectorAll('#category-filters .nav-btn').forEach(b => b.classList.remove('active'));
                allBtn.classList.add('active');
                this.appContext.navigation.clearUrl();
                this.appContext.renderFeed(BlogService.getAllPosts());
            });
        }
    }

    initRecentList() {
        const recentList = document.getElementById('sidebar-recent-list');
        if (!recentList) return;
        
        const recentPosts = BlogService.getAllPosts().slice(0, 5);
        recentPosts.forEach(post => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.innerHTML = `${post.title} <span>${post.date}</span>`;
            btn.addEventListener('click', () => {
                this.appContext.navigation.updateUrl({ id: post.id });
                this.appContext.loadPost(post.id);
            });
            li.appendChild(btn);
            recentList.appendChild(li);
        });
    }

    initDiscoveryPanel() {
        const exploration = document.querySelector('.blog-exploration');
        if (!exploration) return;
        
        let discoverySection = document.getElementById('discovery-suggestions');
        if (!discoverySection) {
            discoverySection = document.createElement('div');
            discoverySection.id = 'discovery-suggestions';
            discoverySection.className = 'sidebar-section';
            discoverySection.innerHTML = `<h3>Top Findings</h3><ul class="blog-nav-list"></ul>`;
            exploration.appendChild(discoverySection);
        }

        const list = discoverySection.querySelector('ul');
        const suggested = BlogService.getAllPosts().sort(() => 0.5 - Math.random()).slice(0, 3);
        suggested.forEach(post => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.innerHTML = `${post.title} <span>→</span>`;
            btn.addEventListener('click', () => {
                this.appContext.navigation.updateUrl({ id: post.id });
                this.appContext.loadPost(post.id);
            });
            li.appendChild(btn);
            list.appendChild(li);
        });
    }

    initTreeActions() {
        const addFolderBtn = document.getElementById('add-folder-btn');
        const addPageBtn = document.getElementById('add-page-btn');

        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', () => {
                const name = prompt('Enter folder name:');
                if (name && this.treeContainer) {
                    const folder = this.createTreeFolder({ name, type: 'category', children: [] }, 'category');
                    this.treeContainer.prepend(folder);
                }
            });
        }
        
        if (addPageBtn) {
            addPageBtn.addEventListener('click', () => {
                const title = prompt('Enter page title:');
                if (title) alert('Draft page created. Save will be available in GitHub publish!');
            });
        }
    }

    buildDocTree() {
        if (!this.treeContainer) return;
        const posts = BlogService.getAllPosts();
        const tree = DocTreeService.generateTree(posts);
        this.treeContainer.innerHTML = '';
        tree.forEach(catNode => this.treeContainer.appendChild(this.createTreeFolder(catNode, 'category')));
    }

    createTreeFolder(node, level) {
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
                this.appContext.navigation.updateUrl({ id: node.id });
                this.appContext.loadPost(node.id);
            }
        });

        // Drag & Drop
        folderDiv.addEventListener('dragstart', (e) => {
            this.draggedItem = folderDiv;
            folderDiv.classList.add('node-dragging');
            e.dataTransfer.setData('text/plain', node.name);
        });

        folderDiv.addEventListener('dragend', () => {
            folderDiv.classList.remove('node-dragging');
            this.draggedItem = null;
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
            if (this.draggedItem && this.draggedItem !== folderDiv) {
                if (level === 'category' && !this.draggedItem.classList.contains('category')) {
                    content.classList.remove('hidden');
                    header.classList.add('open');
                    header.querySelector('.node-chevron').style.transform = 'rotate(90deg)';
                    content.appendChild(this.draggedItem);
                } else {
                    folderDiv.parentNode.insertBefore(this.draggedItem, folderDiv);
                }
            }
        });

        if (level === 'category') {
            node.children.forEach(postNode => content.appendChild(this.createTreeFolder(postNode, 'post')));
            folderDiv.appendChild(content);
        } else {
            header.querySelector('.node-chevron').style.opacity = '0';
        }
        
        folderDiv.prepend(header); // Header must be first
        return folderDiv;
    }
}