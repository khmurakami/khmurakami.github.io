/*
 * look.js — the art style, applied on top of a painted scene.
 *
 * Scenes paint into an offscreen 2D canvas. The look takes that frame as a
 * texture and runs one WebGL2 shader over it, so a single scene can be shown
 * in many styles without being repainted: colour grading and gradient maps,
 * bloom, chromatic aberration, watercolour wobble and wet edges, ink lines,
 * posterised cel bands, halftone and screentone, paper, grain, scanlines and
 * light leaks.
 *
 * A style is a plain object of numbers and colours (see PRESETS). Anything left
 * out falls back to DEFAULTS, which leave the frame untouched.
 */
(function () {
    'use strict';

    const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
    uv = p * 0.5 + 0.5;
    uv.y = 1.0 - uv.y;
    gl_Position = vec4(p, 0.0, 1.0);
}`;

    const FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D img;
uniform vec2 res;
uniform float time, scale;
uniform float uSat, uContrast, uGamma, uLift, uBloom, uBloomThresh, uCA, uVig, uGrain,
              uPaper, uHalftone, uHalftoneSize, uPoster, uEdges, uEdgeWidth, uWobble, uSoft,
              uLeak, uScan, uMapMix, uTone, uSharpen;
uniform vec3 uShadowTint, uHighTint, uEdgeColor, uLeakColor, uInk, uPaperCol;
uniform vec3 uMap0, uMap1, uMap2, uMap3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
    return s;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 ramp(float l) {
    if (l < 0.3333) return mix(uMap0, uMap1, l * 3.0);
    if (l < 0.6666) return mix(uMap1, uMap2, (l - 0.3333) * 3.0);
    return mix(uMap2, uMap3, (l - 0.6666) * 3.0);
}

void main() {
    vec2 px = uv * res / scale;          // CSS pixels, so styles look the same at any DPR
    vec2 st = uv;

    // Watercolour: the whole image drifts a little off its lines.
    if (uWobble > 0.0) {
        vec2 w = vec2(fbm(px / 70.0), fbm(px / 70.0 + 7.3)) - 0.5;
        st += w * uWobble * 6.0 * scale / res;
    }

    // Chromatic aberration: channels pulled apart toward the edges.
    vec2 d = st - 0.5;
    vec3 c;
    c.r = texture(img, st + d * uCA * 0.006).r;
    c.g = texture(img, st).g;
    c.b = texture(img, st - d * uCA * 0.006).b;

    if (uSoft > 0.0) c = mix(c, textureLod(img, st, 1.6).rgb, uSoft);
    // Unsharp mask: crisper edges, the way a painted background is crisp.
    if (uSharpen > 0.0) c += (c - textureLod(img, st, 1.2).rgb) * uSharpen;

    // Bloom: light from the bright parts, gathered from the blurred mips.
    if (uBloom > 0.0) {
        vec3 m = textureLod(img, st, 3.0).rgb * 0.4 + textureLod(img, st, 4.5).rgb * 0.35 + textureLod(img, st, 6.0).rgb * 0.25;
        // Only light that is genuinely bright blooms: keyed on brightness, not
        // on any one channel, or a saturated blue sky would glow everywhere.
        vec3 b = m * smoothstep(uBloomThresh, 1.0, luma(m));
        c += b * uBloom;
    }

    // Lines: the edges of shapes, found by a Sobel pass on brightness.
    if (uEdges > 0.0) {
        vec2 t = uEdgeWidth * scale / res;
        float tl = luma(texture(img, st + t * vec2(-1, -1)).rgb), tc = luma(texture(img, st + t * vec2(0, -1)).rgb), tr = luma(texture(img, st + t * vec2(1, -1)).rgb);
        float ml = luma(texture(img, st + t * vec2(-1, 0)).rgb), mr = luma(texture(img, st + t * vec2(1, 0)).rgb);
        float bl = luma(texture(img, st + t * vec2(-1, 1)).rgb), bc = luma(texture(img, st + t * vec2(0, 1)).rgb), br = luma(texture(img, st + t * vec2(1, 1)).rgb);
        float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
        float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
        float e = smoothstep(0.06, 0.3, length(vec2(gx, gy)));
        c = mix(c, uEdgeColor, e * uEdges);
    }

    // Grade.
    float l = luma(c);
    if (uMapMix > 0.0) c = mix(c, ramp(clamp(l, 0.0, 1.0)), uMapMix);
    l = luma(c);
    c = mix(vec3(l), c, uSat);
    c = (c - 0.5) * uContrast + 0.5;
    c = pow(max(c, 0.0), vec3(uGamma));
    c = c * (1.0 - uLift) + uLift;
    c *= mix(uShadowTint, uHighTint, smoothstep(0.0, 1.0, l));

    // Cel bands.
    if (uPoster > 0.0) c = mix(c, floor(c * uPoster + 0.5) / uPoster, 0.85);

    // Halftone: one ink on paper, dots on a 45-degree screen.
    if (uHalftone > 0.0) {
        float a = 0.785;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * px / uHalftoneSize;
        vec2 f = fract(q) - 0.5;
        float dark = 1.0 - clamp(luma(c), 0.0, 1.0);
        float dotR = sqrt(dark) * 0.62;
        float ink = 1.0 - smoothstep(dotR - 0.06, dotR + 0.06, length(f));
        vec3 h = mix(uPaperCol, uInk, ink);
        c = mix(c, h, uHalftone);
    }

    // Screentone: dots only in the mid-greys, like manga tone sheets.
    if (uTone > 0.0) {
        vec2 f = fract(px / 4.0) - 0.5;
        float mid = smoothstep(0.25, 0.45, luma(c)) * (1.0 - smoothstep(0.6, 0.8, luma(c)));
        float dotm = 1.0 - smoothstep(0.24, 0.3, length(f));
        c = mix(c, c * 0.55, dotm * mid * uTone);
    }

    // Paper: fibres and blotches, multiplied in.
    if (uPaper > 0.0) {
        float pn = fbm(px / 2.5) * 0.5 + fbm(px / 36.0) * 0.5;
        c *= 1.0 - uPaper * (0.5 - pn) * 0.5 - uPaper * 0.04;
        // Wet edges pool darker where colour changes.
        c *= 1.0 - uPaper * 0.08 * smoothstep(0.55, 0.75, fbm(px / 120.0));
    }

    if (uScan > 0.0) c *= 1.0 - uScan * (0.5 + 0.5 * sin(px.y * 3.14159));

    // Light leak: warm light bleeding in from a corner, wandering slowly.
    if (uLeak > 0.0) {
        vec2 lp = vec2(0.1 + 0.08 * sin(time * 0.13), 0.08 + 0.06 * cos(time * 0.11));
        vec2 dd = (uv - lp) * vec2(res.x / res.y, 1.0);
        float lk = exp(-dot(dd, dd) * 3.5);
        c = 1.0 - (1.0 - c) * (1.0 - uLeakColor * lk * uLeak);
    }

    if (uVig > 0.0) {
        float v = smoothstep(1.0, 0.25, length((uv - 0.5) * vec2(res.x / res.y, 1.0)));
        c *= mix(1.0, v, uVig);
    }

    c += (hash(px + fract(time * 7.0) * 113.0) - 0.5) * uGrain;
    o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

    const DEFAULTS = {
        sat: 1, contrast: 1, gamma: 1, lift: 0,
        bloom: 0, bloomThresh: 0.6, ca: 0, vig: 0, grain: 0,
        paper: 0, halftone: 0, halftoneSize: 5, poster: 0,
        edges: 0, edgeWidth: 1, edgeColor: '#0b1030',
        wobble: 0, soft: 0, leak: 0, leakColor: '#ffb27a', scan: 0, tone: 0, sharpen: 0,
        shadowTint: '#ffffff', highTint: '#ffffff',
        ink: '#1d2c6e', paperCol: '#f3ede0',
        map: null, mapMix: 0
    };

    /**
     * The styles. Each is a variation on the same anime-background family:
     * how the light behaves, what the image is printed on, and its colours.
     */
    const PRESETS = {
        painted: {
            label: 'Painted', sharpen: 0.45, bloom: 0.2, bloomThresh: 0.72, sat: 1.06, contrast: 1.04,
            vig: 0.2, grain: 0.015, ca: 0.25, shadowTint: '#eef1ff', highTint: '#fffdf8'
        },
        cel: { label: 'Cel', bloom: 0.12, grain: 0.02 },
        radiant: {
            label: 'Radiant', sat: 1.22, contrast: 1.1, bloom: 0.75, bloomThresh: 0.55, ca: 0.7,
            vig: 0.45, grain: 0.03, leak: 0.45, leakColor: '#ffc08a', shadowTint: '#e9eeff', highTint: '#fff8ee'
        },
        watercolor: {
            label: 'Watercolour', sat: 0.82, contrast: 0.92, lift: 0.07, gamma: 0.95, soft: 0.4, wobble: 1,
            edges: 0.4, edgeWidth: 1.2, edgeColor: '#24305e', paper: 0.6, grain: 0.015, bloom: 0.2,
            map: ['#1e2a55', '#4d6db5', '#a9c3ea', '#fbf6ea'], mapMix: 0.3
        },
        lofi: {
            label: 'Lo-fi dusk', sat: 0.8, contrast: 0.86, lift: 0.1, gamma: 1.05,
            map: ['#1c1033', '#5b3a78', '#e08b8c', '#ffe6c8'], mapMix: 0.55,
            grain: 0.08, scan: 0.12, ca: 0.9, vig: 0.6, bloom: 0.35, soft: 0.15
        },
        retro: {
            label: '90s cel', poster: 7, sat: 0.92, contrast: 1.05, lift: 0.04, grain: 0.07, bloom: 0.4,
            bloomThresh: 0.55, shadowTint: '#f0f0ff', highTint: '#fff4dc', ca: 0.35, vig: 0.45, soft: 0.25
        },
        sunset: {
            label: 'Golden hour', map: ['#1b1036', '#6b2f73', '#f0806e', '#ffe2b4'], mapMix: 0.85,
            sat: 1.1, bloom: 0.7, bloomThresh: 0.5, leak: 0.35, leakColor: '#ffb070', vig: 0.4, grain: 0.03
        },
        moonlit: {
            label: 'Moonlit', map: ['#02040f', '#0d1f4d', '#3a6fb0', '#d4ebff'], mapMix: 0.9,
            contrast: 1.12, bloom: 0.6, bloomThresh: 0.55, vig: 0.55, grain: 0.04
        },
        riso: {
            label: 'Riso print', halftone: 1, halftoneSize: 4.5, ink: '#2a3fa8', paperCol: '#f4eedf',
            paper: 0.45, wobble: 0.35, contrast: 1.15, gamma: 0.9
        },
        manga: {
            label: 'Manga ink', map: ['#141414', '#5c5c5c', '#c9c9c9', '#f7f4ee'], mapMix: 1,
            edges: 0.95, edgeWidth: 1, edgeColor: '#101010', tone: 0.9, paper: 0.3, contrast: 1.2, poster: 5
        }
    };

    function create(canvas) {
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
        if (!gl) return null;

        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const U = {};
        const names = ['img', 'res', 'time', 'scale', 'uSat', 'uContrast', 'uGamma', 'uLift', 'uBloom', 'uBloomThresh', 'uCA', 'uVig', 'uGrain',
            'uPaper', 'uHalftone', 'uHalftoneSize', 'uPoster', 'uEdges', 'uEdgeWidth', 'uWobble', 'uSoft', 'uLeak', 'uScan', 'uMapMix', 'uTone', 'uSharpen',
            'uShadowTint', 'uHighTint', 'uEdgeColor', 'uLeakColor', 'uInk', 'uPaperCol', 'uMap0', 'uMap1', 'uMap2', 'uMap3'];
        for (const n of names) U[n] = gl.getUniformLocation(prog, n);

        function setStyle(style) {
            const s = { ...DEFAULTS, ...style };
            const f = (n, v) => gl.uniform1f(U[n], v);
            const v3 = (n, h) => gl.uniform3fv(U[n], hex(h));
            f('uSat', s.sat); f('uContrast', s.contrast); f('uGamma', s.gamma); f('uLift', s.lift);
            f('uBloom', s.bloom); f('uBloomThresh', s.bloomThresh); f('uCA', s.ca); f('uVig', s.vig); f('uGrain', s.grain);
            f('uPaper', s.paper); f('uHalftone', s.halftone); f('uHalftoneSize', s.halftoneSize); f('uPoster', s.poster);
            f('uEdges', s.edges); f('uEdgeWidth', s.edgeWidth); f('uWobble', s.wobble); f('uSoft', s.soft);
            f('uLeak', s.leak); f('uScan', s.scan); f('uTone', s.tone); f('uSharpen', s.sharpen);
            v3('uShadowTint', s.shadowTint); v3('uHighTint', s.highTint); v3('uEdgeColor', s.edgeColor); v3('uLeakColor', s.leakColor);
            v3('uInk', s.ink); v3('uPaperCol', s.paperCol);
            const map = s.map || ['#000000', '#555555', '#aaaaaa', '#ffffff'];
            v3('uMap0', map[0]); v3('uMap1', map[1]); v3('uMap2', map[2]); v3('uMap3', map[3]);
            f('uMapMix', s.map ? s.mapMix : 0);
        }

        return {
            setStyle,
            render(src, t, dpr) {
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.uniform1i(U.img, 0);
                gl.uniform2f(U.res, canvas.width, canvas.height);
                gl.uniform1f(U.time, t);
                gl.uniform1f(U.scale, dpr);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        };
    }

    window.Look = { create, PRESETS, DEFAULTS, names: Object.keys(PRESETS) };
})();
