// Warm camera-turn throughput, including canvas flush, at 640x480 DPR 1.
import { writeFileSync, mkdirSync } from 'node:fs';
import { studioBrowser } from './studio-browser.mjs';
const result = await studioBrowser(`
    const rows=[];
    for(const mode of ['layers','splat'])for(const dabs of (mode==='layers'?[5000]:[1500,5000,10000])) {
        const frame=await openStudio('still&mode='+mode+'&dabs='+dabs+'&size=1&seed=5');
        const w=frame.contentWindow, studio=w.stackStudio, c=w.document.querySelector('canvas'), g=c.getContext('2d');
        for(let i=0;i<5;i++){studio.turn(i/5);g.getImageData(0,0,1,1);}
        const samples=[];
        for(let i=0;i<60;i++) {
            const t=performance.now();studio.turn(i*Math.PI*2/60);g.getImageData(0,0,1,1);
            samples.push(performance.now()-t);
        }
        samples.sort((a,b)=>a-b);
        const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
        rows.push({mode,dabs:mode==='splat'?dabs:null,readyMs:studio.readyMs,meanMs:mean,fps:1000/mean,p95Ms:samples[56]});
        frame.remove();
    }
    return {width:640,height:480,dpr:1,frames:60,method:'warm draw + synchronous canvas readback; throughput, not RAF refresh',rows};
`);
mkdirSync('renders/splat', { recursive:true });
writeFileSync('renders/splat/benchmark.json', JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
