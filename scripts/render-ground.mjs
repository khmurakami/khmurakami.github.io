// Real studio canvas, deterministic wind and water playback. No external assets.
import { studioBrowser } from './studio-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const started = performance.now();
try {
    const result = await studioBrowser(`
        const frame = document.createElement('iframe');
        frame.width = 960; frame.height = 720; frame.src = '../../studio/world.html?time=12:45';
        document.body.append(frame); await new Promise(resolve => frame.onload = resolve);
        const w = frame.contentWindow, world = w.world, canvas = frame.contentDocument.querySelector('canvas');
        const check = (ok, message) => { if (!ok) throw new Error(message); };
        check(world, 'Studio initializes'); w.requestAnimationFrame = () => 0; world.seek(90);
        check(!world.furin.enabled && !world.furin.audio, 'Default silence');
        // Pointer handlers, including water coordinates and drag cancellation.
        canvas.setPointerCapture = () => {}; canvas.hasPointerCapture = () => false;
        const tap = (x,y) => {
            canvas.dispatchEvent(new w.PointerEvent('pointerdown', {pointerId:1, button:0, clientX:x, clientY:y}));
            canvas.dispatchEvent(new w.PointerEvent('pointerup', {pointerId:1, button:0, clientX:x, clientY:y}));
        };
        tap(634,569); check(world.scene.landscape.active, 'Water pointer tap starts ripple');
        world.sendBreeze(); const frames = [];
        for (let i=0;i<50;i++) {
            world.breeze.step(0.1, world.clock); world.scene.landscape.step(0.1, false); world.paint();
            frames.push(canvas.toDataURL('image/png').split(',')[1]);
        }
        check(!world.scene.landscape.active, 'Ripples expire');
        world.breeze.setReduced(true); world.scene.landscape.step(0,true); tap(634,569);
        check(!world.scene.landscape.active, 'Reduced motion suppresses water animation');
        world.paint(); const still = canvas.toDataURL();
        world.scene.landscape.step(0.1,true); world.paint();
        check(still === canvas.toDataURL(), 'Reduced motion stays visually still');
        return {frames, checks:['water pointer tap','ripple expiry','default silence','reduced motion pixel stability']};
    `);
    const dir = 'renders/ground'; mkdirSync(dir, {recursive:true});
    const paths = result.frames.map((data,i) => {
        const path = `${dir}/${String(i).padStart(3,'0')}.png`;
        writeFileSync(path,Buffer.from(data,'base64')); return path;
    });
    const gif = spawnSync('python',['-m','studio.analysis','animate',`${dir}/world-ground.gif`,...paths,'--fps','10'],{encoding:'utf8',windowsHide:true});
    if (gif.status !== 0) throw new Error(gif.stderr);
    const evidence = {checks:result.checks,frames:paths.length,elapsedMs:performance.now()-started};
    writeFileSync(`${dir}/checks.json`,JSON.stringify(evidence,null,2)); console.log(evidence); console.log(gif.stdout);
} finally { console.error(`ground render elapsed: ${(performance.now()-started).toFixed(0)} ms`); }
