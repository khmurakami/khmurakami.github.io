// The room as baked for this screen: art size (A), camera (cam) and the live scene state (S).

let A = null, cam = null, S = null;
export function setA(v) { A = v; }
export function setCam(v) { cam = v; }
export function setS(v) { S = v; }

export { A, S, cam };
