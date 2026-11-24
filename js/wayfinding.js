/*
 * Inside a work: you always know you're in a room of the house, and how to
 * get back out.
 *
 *  - Arriving from the house, the screen starts on the picture you just
 *    stepped through, and the live room fades up underneath it.
 *  - A small plan of the house sits in the corner, this room marked with
 *    "you are here". Click it and you leave the way you came: the room settles
 *    back into its picture, and the house walks you back out from there.
 *
 * Loaded in <head> without defer, so the arrival picture is up before the
 * first frame.
 */
(function () {
    'use strict';
    var ROOM = 'tatami-room', HOUSE = '../', root = document.documentElement;
    var arriving = false;
    try { arriving = sessionStorage.getItem('entering') === ROOM; sessionStorage.removeItem('entering'); } catch (e) { /* fine */ }
    if (arriving) root.classList.add('arriving');

    function plan() {
        // The house in miniature, in mats: corridor, three rooms, veranda; this room marked.
        var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '-0.4 -0.4 10.8 6.8');
        svg.setAttribute('aria-hidden', 'true');
        var shape = function (tag, attrs) { var el = document.createElementNS(NS, tag); for (var k in attrs) el.setAttribute(k, attrs[k]); svg.appendChild(el); return el; };
        shape('rect', { x: 0, y: 0, width: 10, height: 5, class: 'wall' });
        shape('line', { x1: 0, y1: 1, x2: 10, y2: 1, class: 'part' });
        shape('rect', { x: 0, y: 1, width: 3, height: 4, class: 'planned' });
        shape('rect', { x: 7, y: 2, width: 3, height: 3, class: 'planned' });
        shape('rect', { x: 3, y: 1, width: 4, height: 4, class: 'here' });
        shape('line', { x1: 0, y1: 6, x2: 10, y2: 6, class: 'edge' });
        shape('circle', { cx: 5, cy: 3, r: 0.42, class: 'dot' });
        var a = document.createElement('a');
        a.href = HOUSE + '?from=' + ROOM;
        a.className = 'wayfinding';
        a.setAttribute('aria-label', 'You are in the Tatami Room. Back to the house.');
        var top = document.createElement('span'); top.className = 'where'; top.textContent = 'The house › Tatami Room';
        var bottom = document.createElement('span'); bottom.className = 'back'; bottom.textContent = '← Back to the house';
        a.append(top, svg, bottom);
        a.addEventListener('click', leave);
        document.body.appendChild(a);
    }

    // Leaving: the room settles back into its picture, then the house walks you back out.
    function leave(e) {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button)) return;
        if (e) e.preventDefault();
        var href = HOUSE + '?from=' + ROOM;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { location.href = href; return; }
        root.classList.remove('arriving', 'arrived');
        root.classList.add('leaving-room');
        setTimeout(function () { location.href = href; }, 600);
    }

    addEventListener('DOMContentLoaded', function () {
        plan();
        // The room's own "playground" link leaves the same way.
        document.querySelectorAll('a[href="../"]').forEach(function (a) { a.addEventListener('click', leave); });
        if (arriving) addEventListener('load', function () { setTimeout(function () { root.classList.add('arrived'); }, 350); });
    });
    addEventListener('pageshow', function (e) { if (e.persisted) { root.classList.remove('leaving-room'); root.classList.add('arrived'); } });
})();
