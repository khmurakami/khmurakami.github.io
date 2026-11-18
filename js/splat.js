/* Painterly particles (Meier 1996): object-space Gaussian brush dabs.
 * KEEP IT A DRAWING: one paint-chain colour per dab, opaque body, soft rim.
 * EWA uses the studio's orthographic Jacobian; no perspective approximation.
 * No assets. Loaded only in the stack studio.
 */
(function (root) {
    'use strict';
    const S = root.Stack, L = root.Layers;
    const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const norm = v => { const m = Math.hypot(...v); return v.map(x => x / m); };
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    // Row-major 3x3 covariance: each axis includes its standard deviation.
    function covariance(axes) {
        return Array.from({ length: 9 }, (_, k) => axes.reduce((s, a) => s + a[Math.floor(k/3)] * a[k%3], 0));
    }
    function projectCovariance(sigma, cam) {
        const c = Math.cos(cam.theta), s = Math.sin(cam.theta), p = Math.sin(cam.phi), q = Math.cos(cam.phi);
        // J W, where W rotates world into camera space, J scales x/y.
        const a = [c, 0, -s].map(v => v*cam.scale);
        const b = [-s*p, -q, -c*p].map(v => v*cam.scale);
        const product = (u, v) => u.reduce((sum, x, i) => sum + x * v.reduce((t, y, j) => t + sigma[i*3+j]*y, 0), 0);
        return [product(a,a), product(a,b), product(b,b)];
    }
    function sort(dabs, cam) {
        const away = [Math.sin(cam.theta)*Math.cos(cam.phi), -Math.sin(cam.phi), Math.cos(cam.theta)*Math.cos(cam.phi)];
        return dabs.map(d => ({ d, depth: dot(d.p, away) })).sort((a,b) => b.depth-a.depth || a.d.id-b.d.id).map(q => q.d);
    }
    class Cloud {
        constructor(volume, chain, { dabs = 5000, size = 1, seed = 5, stroke = [1, 0.35, 0.2] } = {}) {
            if (!Number.isInteger(dabs) || dabs < 1 || dabs > 100000 || !Number.isFinite(size) || size <= 0) throw new RangeError('dabs: 1..100000; size: positive');
            if (!Array.isArray(stroke) || stroke.length !== 3 || !stroke.every(Number.isFinite) || Math.hypot(...stroke) === 0)
                throw new RangeError('stroke must be a finite nonzero 3D direction');
            stroke = norm(stroke);
            this.dabs = [];
            const random = S.rng(seed), spheres = volume.spheres;
            const areas = []; let area = 0;
            for (const s of spheres) areas.push(area += s.r*s.r);
            // Area-weighted sphere proposals; reject buried surfaces. Noise is
            // located by bisection of the same Volume field used by the paints.
            const width = size * Math.sqrt(4*Math.PI*area/dabs) * 0.18;
            for (let attempt = 0; this.dabs.length < dabs; attempt++) {
                if (attempt > dabs * 1000) throw new Error('Cannot seed exposed Volume surface');
                const pick = random()*area, sphere = spheres[areas.findIndex(a => a >= pick)];
                const y = random()*2-1, angle = random()*Math.PI*2, r = Math.sqrt(1-y*y);
                const dir = [r*Math.cos(angle), y, r*Math.sin(angle)];
                const point = t => [sphere.x+dir[0]*t, sphere.y+dir[1]*t, sphere.z+dir[2]*t];
                let lo = Math.max(0, sphere.r-volume.amount-0.01), hi = sphere.r+volume.amount+0.01;
                if (volume.distance(...point(hi)) < 0 || volume.distance(...point(lo)) > 0) continue;
                for (let i=0; i<20; i++) { const mid=(lo+hi)/2; if(volume.distance(...point(mid))>0)hi=mid;else lo=mid; }
                const p = point((lo+hi)/2);
                if (p[1] < 0) continue;
                const n = volume.normal(...p);
                let t = stroke.map((v,i) => v-dot(stroke,n)*n[i]);
                if (Math.hypot(...t)<0.01) {
                    // Choose the least-aligned axis, including at either pole.
                    const axis = n.map(Math.abs).indexOf(Math.min(...n.map(Math.abs)));
                    t = cross(n, [0, 1, 2].map(i => Number(i === axis)));
                }
                t=norm(t);
                const b = cross(n,t), w=width*(0.8+random()*0.4);
                const sigma=covariance([t.map(v=>v*w*1.8), b.map(v=>v*w*0.6), n.map(v=>v*w*0.06)]);
                const color=L.paint(chain,{x:p[0],y:p[1],z:p[2],n,t:p[1]/volume.bounds.top,volume});
                this.dabs.push({id:this.dabs.length,p,n,tangent:t,sigma,color});
            }
        }
    }
    class View {
        constructor(cloud) { this.cloud=cloud; this.brushes=new Map(); }
        brush(color) {
            const key=color.map(Math.round).join(',');
            if (!this.brushes.has(key)) {
                const c=document.createElement('canvas'); c.width=c.height=64;
                const g=c.getContext('2d'), image=g.createImageData(64,64);
                for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
                    const r=Math.hypot((x+0.5-32)/32,(y+0.5-32)/32);
                    // Saturated, truncated Gaussian: flat paint body, narrow soft rim.
                    const alpha=Math.min(1, Math.max(0,(Math.exp(-r*r*4.5)-Math.exp(-4.5))*90));
                    const k=(y*64+x)*4;
                    image.data.set([...color.map(Math.round),Math.round(alpha*255)],k);
                }
                g.putImageData(image,0,0); this.brushes.set(key,c);
            }
            return this.brushes.get(key);
        }
        draw(g,cam) {
            g.save(); g.globalCompositeOperation='source-over';
            for(const d of sort(this.cloud.dabs,cam)) {
                const [x,y]=cam.project(...d.p), [a,b,c]=projectCovariance(d.sigma,cam);
                // Cholesky maps a unit disk to the EWA ellipse (three sigma).
                const u=Math.sqrt(a+0.04), v=b/u, w=Math.sqrt(Math.max(0.04,c-v*v));
                g.setTransform(3*u/32,3*v/32,0,3*w/32,x,y);
                g.drawImage(this.brush(d.color),-32,-32);
            }
            g.restore();
        }
    }
    S.modes.splat={defaults:{style:'afternoon',dabs:5000,size:1,seed:5},draw(g,pile,cam,o){
        const style=L.styles[o.style]; if(!style)throw new Error(`Unknown style: ${o.style}`);
        const r=L.resolve(style,o), key=JSON.stringify(['splat',r,o.dabs,o.size,o.seed,o.stroke,!!o.mask]);
        pile._views ||= new Map();
        if(!pile._views.has(key)) {
            const volume=new L.Volume(pile.spheres,{blend:r.blend,noise:r.noise});
            const chain=o.mask?[new L.paints.Flat()]:L.build(r.paints,{sun:r.sun,shadow:r.shadow});
            pile._views.set(key,new View(new Cloud(volume,chain,o)));
        }
        pile._views.get(key).draw(g,cam);
    }};
    root.Splat={covariance,projectCovariance,sort,Cloud,View};
})(typeof window !== 'undefined' ? window : globalThis);
