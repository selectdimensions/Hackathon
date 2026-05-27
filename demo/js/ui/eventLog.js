// EventLogUI — rolling ndjson viewer. Output matches DataAnalysisLog/
// log_format.md v1 exactly so the file can be fed straight to
// parse_log.py / triangulate.py.

(function (root) {
  function makeEventLogUI(containerId, opts) {
    const cfg = Object.assign({ maxLines: 200 }, opts || {});
    const root = document.getElementById(containerId);
    root.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'evlog-list';
    root.appendChild(list);
    const buf = [];

    function append(ev) {
      // Strip demo-only underscore-prefixed fields when forming the canonical
      // ndjson row, but display the lot.
      const canonical = {};
      for (const k of Object.keys(ev)) if (!k.startsWith('_')) canonical[k] = ev[k];
      buf.push(JSON.stringify(canonical));
      if (buf.length > cfg.maxLines) buf.shift();
      const row = document.createElement('div');
      row.className = 'evlog-row ev-' + (ev.event || 'other');
      const time = new Date(ev.ts_unix_ms).toISOString().substring(11, 23);
      row.innerHTML =
        `<span class="evlog-ts">${time}</span>` +
        `<span class="evlog-evt">${ev.event}</span>` +
        `<span class="evlog-body">${escapeHtml(JSON.stringify(canonical))}</span>`;
      list.appendChild(row);
      while (list.childElementCount > cfg.maxLines) list.removeChild(list.firstChild);
      list.scrollTop = list.scrollHeight;
    }

    function clear() { buf.length = 0; list.innerHTML = ''; }

    function downloadNdjson() {
      const blob = new Blob([buf.join('\n') + '\n'], { type: 'application/x-ndjson' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'master_log.ndjson';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function escapeHtml(s) {
      return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    }

    return { append, clear, downloadNdjson };
  }

  root.UI = root.UI || {};
  root.UI.makeEventLogUI = makeEventLogUI;
})(window);
