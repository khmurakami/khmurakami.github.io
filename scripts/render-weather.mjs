// Capture the real studio canvas and verify its weather score and accessibility.
import { studioBrowser } from './studio-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const started = performance.now();
try {
    const result = await studioBrowser(`
        const frame=document.createElement('iframe');
        frame.width=800;frame.height=600;frame.src='../../studio/world.html?time=13:00';
        document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);
        const w=frame.contentWindow,world=w.world,canvas=frame.contentDocument.querySelector('canvas');
        const check=(ok,message)=>{if(!ok)throw new Error(message);};
        check(world,'World initialized');w.requestAnimationFrame=()=>0;
        check(!world.furin.enabled&&!world.furin.audio,'Silent until opt-in');
        const seekHour=hour=>world.seek(hour/24*world.clock.duration);
        const frames=[],states=[];
        for(let i=0;i<81;i++) {
            const hour=13+i*0.1;seekHour(hour);
            frames.push(canvas.toDataURL('image/png').split(',')[1]);
            states.push({hour,...world.scene.snapshot().weather});
        }
        seekHour(15);check(world.scene.snapshot().weather.rain>0.9,'Afternoon rain');
        seekHour(16.5);check(world.scene.snapshot().weather.rainbow>0.9,'Clearing rainbow');
        const clear=canvas.toDataURL();seekHour(14);seekHour(16.5);
        check(clear===canvas.toDataURL(),'Deterministic seek pixels');
        seekHour(20.8);
        const lit=canvas.toDataURL(), sample=world.scene.weather.sample.bind(world.scene.weather);
        world.scene.weather.sample=(...args)=>({...sample(...args),glow:0});world.paint();
        check(lit!==canvas.toDataURL(),'Hanabi illuminates rendered cloud undersides');
        world.scene.weather.sample=sample;
        world.breeze.setReduced(true);
        for(const hour of [15,19,21]) {
            seekHour(hour);const still=canvas.toDataURL();
            world.breeze.tap();world.breeze.step(0.1,world.clock);
            world.scene.landscape.step(0.1,true);world.paint();
            check(still===canvas.toDataURL(),'Reduced motion stable at '+hour);
            check(world.scene.snapshot().weather.glow===0,'Reduced motion suppresses flash');
        }
        return {frames,states,checks:['default silence','afternoon rain','clearing rainbow','deterministic seek pixels','hanabi cloud illumination pixels','reduced motion pixels at rain/dusk/night','reduced motion flash suppression']};
    `);
    const dir='renders/weather';mkdirSync(dir,{recursive:true});
    const paths=result.frames.map((data,i)=>{
        const path=`${dir}/${String(i).padStart(3,'0')}.png`;
        writeFileSync(path,Buffer.from(data,'base64'));return path;
    });
    const gifStarted=performance.now();
    const gif=spawnSync('python',['-m','studio.analysis','animate',`${dir}/world-weather.gif`,...paths,'--fps','6'],{encoding:'utf8',windowsHide:true});
    console.error(`GIF elapsed: ${(performance.now()-gifStarted).toFixed(0)} ms`);
    if(gif.status!==0)throw new Error(gif.stderr);
    const evidence={checks:result.checks,states:result.states,frames:paths.length,elapsedMs:performance.now()-started};
    writeFileSync(`${dir}/checks.json`,JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({checks:result.checks,frames:paths.length}));console.log(gif.stdout);
} finally {console.error(`weather render elapsed: ${(performance.now()-started).toFixed(0)} ms`);}
