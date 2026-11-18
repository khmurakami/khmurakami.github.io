// Independent fixed-step oracle: never uses Volume._safe or sphere tracing.
export class ShadowReference {
    constructor(volume, sun, step = 0.1) {
        this.volume = volume;
        const length = Math.hypot(...sun);
        this.sun = sun.map(v => v / length);
        this.step = step;
    }
    visibility(p, { bias = 2, softness = 8 } = {}) {
        const v = this.volume, L = this.sun;
        const at = t => p.map((q, i) => q + L[i] * t);
        let exit = 0;
        while (v.distance(...at(exit)) < 0 && exit < 2000) exit += this.step;
        let result = 1;
        for (let t = exit + bias; t < 2000; t += this.step) {
            const q = at(t);
            if (v._gone(...q)) break;
            const d = v.distance(...q);
            if (d < 0.05) return 0;
            result = Math.min(result, softness * d / (t - exit));
        }
        return result * result * (3 - 2 * result);
    }
    // First surface from above at a regular x/z grid, refined to outside.
    surfaces(spacing = 24) {
        const v = this.volume, B = v.bounds, points = [];
        for (let x = B.x0 + spacing / 2; x < B.x1; x += spacing) {
            for (let z = B.z0 + spacing / 2; z < B.z1; z += spacing) {
                for (let y = B.top; y > 0; y -= 0.5) {
                    if (v.distance(x, y, z) >= 0) continue;
                    let lo = y, hi = y + 0.5;
                    for (let i = 0; i < 24; i++) {
                        const mid = (lo + hi) / 2;
                        if (v.distance(x, mid, z) < 0) lo = mid; else hi = mid;
                    }
                    const p = [x, hi, z], n = v.normal(...p);
                    if (n.reduce((sum, q, i) => sum + q * this.sun[i], 0) > 0.2) points.push(p);
                    break;
                }
            }
        }
        return points;
    }
    measure(points) {
        const rows = points.map(p => ({ p, actual: this.volume.sunVisibility(...p, this.sun), reference: this.visibility(p) }));
        return {
            count: rows.length,
            mean: rows.reduce((s, r) => s + r.actual, 0) / rows.length,
            referenceMean: rows.reduce((s, r) => s + r.reference, 0) / rows.length,
            mae: rows.reduce((s, r) => s + Math.abs(r.actual - r.reference), 0) / rows.length,
            falseDark: rows.filter(r => r.reference > 0.9 && r.actual < 0.5).length,
            blocked: rows.filter(r => r.reference === 0).length,
            rows
        };
    }
}
