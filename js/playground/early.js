// Runs before anything is drawn. Coming back out of a work (?from=id), the
// screen starts on that work's picture, so the walk back into the house is
// one unbroken shot; plan.js takes it from there.
(function () {
    var from = new URLSearchParams(location.search).get('from');
    if (!from || !/^[a-z0-9-]+$/.test(from)) return;
    var root = document.documentElement;
    root.classList.add('from-room');
    // A full address: a url() in a custom property resolves against the stylesheet, not this page.
    root.style.setProperty('--arrive', 'url("' + new URL('works/' + from + '/poster.png', location.href).href + '")');
})();
