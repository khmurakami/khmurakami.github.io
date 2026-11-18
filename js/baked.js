/* Procedural painted layers persisted as a lossless atlas. Studio only. */
(function (root) {
    'use strict';
    class BakedAtlas {
        static layout(layers, recipe = {}) {
            if (!layers.length) throw new Error('Cannot bake empty layers');
            const cellW = Math.max(...layers.map(l => l.width));
            const cellH = Math.max(...layers.map(l => l.height));
            const cols = Math.max(1, Math.ceil(Math.sqrt(layers.length * cellH / cellW)));
            const manifest = { version: 1, image: 'atlas.png', recipe,
                width: cols * cellW, height: Math.ceil(layers.length / cols) * cellH,
                layers: layers.map(({ data, ...l }, i) => ({ ...l, x: i % cols * cellW, y: Math.floor(i / cols) * cellH })) };
            BakedAtlas.validate(manifest);
            return manifest;
        }
        static validate(m) {
            const positive = n => Number.isInteger(n) && n > 0;
            if (m.version !== 1 || !positive(m.width) || !positive(m.height) ||
                !Array.isArray(m.layers) || !m.layers.length) throw new Error('Invalid atlas manifest');
            for (const l of m.layers) {
                if (!positive(l.width) || !positive(l.height) || !Number.isInteger(l.x) || !Number.isInteger(l.y) ||
                    l.x < 0 || l.y < 0 || l.x + l.width > m.width || l.y + l.height > m.height ||
                    ![l.h, l.t, l.x0, l.z0, l.res].every(Number.isFinite) || l.res <= 0)
                    throw new Error('Invalid atlas layer');
            }
        }
        static pack(layers, recipe) {
            const manifest = this.layout(layers, recipe);
            const canvas = document.createElement('canvas');
            canvas.width = manifest.width; canvas.height = manifest.height;
            const g = canvas.getContext('2d');
            layers.forEach((l, i) => g.putImageData(new ImageData(l.data, l.width, l.height), manifest.layers[i].x, manifest.layers[i].y));
            return { manifest, png: canvas.toDataURL('image/png') };
        }
        static validateLoaded(manifest) {
            this.validate(manifest);
            const recipe = manifest.recipe, b = recipe?.bounds;
            if (typeof manifest.image !== 'string' || !manifest.image.trim() ||
                typeof recipe?.query !== 'string' || new URLSearchParams(recipe.query).get('mode') !== 'layers' ||
                !b || !['x0', 'x1', 'z0', 'z1', 'top', 'radius'].every(k => Number.isFinite(b[k])) ||
                b.x1 <= b.x0 || b.z1 <= b.z0 || b.top <= 0 || b.radius <= 0)
                throw new Error('Invalid atlas recipe or image');
        }
        static async load(path) {
            const url = new URL(path, location.href);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Atlas manifest: ${response.status}`);
            const manifest = await response.json();
            this.validateLoaded(manifest);
            const img = new Image();
            img.src = new URL(manifest.image, url).href;
            await img.decode();
            if (img.naturalWidth !== manifest.width || img.naturalHeight !== manifest.height)
                throw new Error('Atlas image dimensions do not match manifest');
            // Separate canvases preserve StackView's edge sampling exactly; no neighbouring tile bleed.
            const view = new root.Layers.StackView(manifest.layers);
            view.images = manifest.layers.map(l => {
                const c = document.createElement('canvas'); c.width = l.width; c.height = l.height;
                c.getContext('2d').drawImage(img, l.x, l.y, l.width, l.height, 0, 0, l.width, l.height);
                return c;
            });
            return { manifest, view };
        }
    }
    root.BakedAtlas = BakedAtlas;
})(typeof window !== 'undefined' ? window : globalThis);
