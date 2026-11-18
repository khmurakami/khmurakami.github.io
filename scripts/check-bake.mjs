#!/usr/bin/env node
// Real browser equivalence + fresh-document first-frame timing; run after bake.mjs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { studioBrowser } from './studio-browser.mjs';
const path = resolve(process.argv[2] || 'renders/bake/cloud.json');
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const baked = relative(resolve('studio'), path).replaceAll('\\', '/');
const result = await studioBrowser(`
    const comparisons=[], timings={live:[],baked:[]};
    for(const theta of [0.35,1.8,3.4]) {
        let reference;
        for(const kind of ['live','baked']) {
            const q=new URLSearchParams(kind==='live'?${JSON.stringify(manifest.recipe.query)}:'');
            if(kind==='baked')q.set('baked',${JSON.stringify(baked)});
            q.set('still','');q.set('theta',theta);
            const frame=await openStudio(q.toString()), w=frame.contentWindow;
            timings[kind].push(w.stackStudio.readyMs);
            const c=w.document.querySelector('canvas'), data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            if(kind==='live') reference=Array.from(data);
            else {
                let sum=0,max=0;
                for(let i=0;i<data.length;i++){const d=Math.abs(data[i]-reference[i]);sum+=d;max=Math.max(max,d);}
                comparisons.push({theta,mae:sum/data.length,max});
            }
            if(theta===0.35)timings[kind+'PNG']=c.toDataURL('image/png');
            frame.remove();
        }
    }
    return {comparisons,timings};
`);
for (const kind of ['live', 'baked']) {
    writeFileSync(`renders/bake/${kind}.png`, Buffer.from(result.timings[kind + 'PNG'].split(',')[1], 'base64'));
    delete result.timings[kind + 'PNG'];
}
result.tolerance = { mae: 0.1, max: 2 };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
result.load = { metric: 'navigation to first canvas frame, milliseconds',
    environment: 'local HTTP, no-store, Chromium, 640x480, DPR 1; three fresh documents per mode',
    liveMedianMs: median(result.timings.live), bakedMedianMs: median(result.timings.baked) };
result.load.speedup = result.load.liveMedianMs / result.load.bakedMedianMs;
writeFileSync('renders/bake/comparison.json', JSON.stringify(result, null, 2) + '\n');
for (const c of result.comparisons) {
    assert.ok(c.mae <= result.tolerance.mae && c.max <= result.tolerance.max, JSON.stringify(c));
}
console.log(JSON.stringify(result, null, 2));
