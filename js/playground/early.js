// Runs before anything is drawn. Coming back out of a work (?from=id), the
// page starts with its eyes closed: the story of walking back out begins with
// them opening, inside the room (plan.js takes it from there).
(function () {
    var from = new URLSearchParams(location.search).get('from');
    if (from && /^[a-z0-9-]+$/.test(from)) document.documentElement.classList.add('from-room');
})();
