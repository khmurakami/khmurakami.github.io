import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/stack.js';
import '../js/layers.js';
import '../js/baked.js';

test('atlas packs all layer geometry without serializing pixel arrays', () => {
    const layers = [0, 1, 2].map(i => ({ h: i + 0.5, t: i / 3, x0: -3, z0: -2,
        res: 2, width: 7, height: 5, data: new Uint8ClampedArray(140) }));
    const manifest = BakedAtlas.layout(layers, { query: 'mode=layers&seed=5' });
    assert.equal(manifest.version, 1);
    assert.equal(manifest.layers.length, 3);
    for (const [i, layer] of manifest.layers.entries()) {
        assert.equal(layer.h, layers[i].h);
        assert.equal(layer.x0, -3);
        assert.equal(layer.data, undefined);
        assert.ok(layer.x + layer.width <= manifest.width);
        assert.ok(layer.y + layer.height <= manifest.height);
        for (const other of manifest.layers.slice(0, i))
            assert.ok(layer.x >= other.x + other.width || layer.y >= other.y + other.height);
    }
    assert.equal(BakedAtlas.validate(JSON.parse(JSON.stringify(manifest))), undefined);
});

test('atlas rejects empty, unsupported and out-of-bounds manifests', () => {
    assert.throws(() => BakedAtlas.layout([]));
    const valid = BakedAtlas.layout([{ h: 1, t: 0.5, x0: 0, z0: 0, res: 1, width: 3, height: 2 }]);
    for (const change of [{ version: 2 }, { width: 0 }, { layers: [] },
        { layers: [{ ...valid.layers[0], x: -1 }] },
        { layers: [{ ...valid.layers[0], res: 0 }] }])
        assert.throws(() => BakedAtlas.validate({ ...valid, ...change }));
});

test('loaded atlases require an image and a usable studio recipe', () => {
    const valid = BakedAtlas.layout([{ h: 1, t: 0.5, x0: 0, z0: 0, res: 1, width: 3, height: 2 }],
        { query: 'mode=layers', bounds: { x0: -1, x1: 1, z0: -1, z1: 1, top: 2, radius: 2 } });
    assert.doesNotThrow(() => BakedAtlas.validateLoaded(valid));
    for (const change of [{ image: '' }, { recipe: {} }, { recipe: { ...valid.recipe, bounds: { top: NaN } } },
        { recipe: { ...valid.recipe, query: 'mode=paper' } }])
        assert.throws(() => BakedAtlas.validateLoaded({ ...valid, ...change }));
});
