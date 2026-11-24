// The "drawn" date in the title block: today, as an architect would write it.
const t = document.getElementById('drawn'), d = new Date();
if (t) { t.dateTime = d.toISOString().slice(0, 10); t.textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; }
