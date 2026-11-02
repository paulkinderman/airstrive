// The landing page for every share link (src/friends/links.ts):
//   /f/CODE  be my friend      /g/CODE  join my grid
//   /a/GRID?f=CODE  try this grid      /p/CODE  see my grid
// It shows what the link is for, read from invite_preview (which works signed out), and
// hands the link to the app: airstrive://<path> on a phone that has it, /app/<path> in the
// browser. Someone who still has to install the app copies the link first, since it doesn't
// survive the App Store; onboarding offers to paste it.
(function () {
  var cfg = window.AIRSTRIVE || {};
  var path = location.pathname.replace(/\/+$/, '');
  var m = /^\/(f|g|p)\/([A-Za-z0-9]{12})$/.exec(path) || /^\/(a)\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, t) { $(id).textContent = t; };

  if (!m) {
    text('title', "This invite link isn't complete");
    text('lede', 'Ask your friend to send it again, or find them by username in AirStrive.');
    $('actions').hidden = true;
    return;
  }

  var kind = m[1];
  var code = kind === 'a' ? m[2] : m[2].toUpperCase();
  var from = kind === 'a' ? ((/[?&]f=([A-Za-z0-9]{12})/.exec(location.search) || [])[1] || null) : null;
  var rest = path.slice(1) + (from ? '?f=' + from : '');
  var link = location.origin + '/' + rest;

  $('open-app').href = 'airstrive://' + rest;
  $('open-web').href = '/app/' + rest;

  // Copies the link, so the app can pick it up after it's installed.
  function copy() {
    var done = function () { $('copied').hidden = false; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(link).then(done, function () { done(); });
    }
    var t = document.createElement('textarea');
    t.value = link; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) { /* the link is on the page */ }
    t.remove(); done();
    return Promise.resolve();
  }
  text('link', link);
  $('copy').addEventListener('click', function (e) { e.preventDefault(); copy(); });
  if (cfg.appStoreUrl) {
    var store = $('get-app');
    store.href = cfg.appStoreUrl;
    store.hidden = false;
    store.addEventListener('click', function (e) {
      e.preventDefault();
      copy().then(function () { location.href = cfg.appStoreUrl; });
    });
  }

  function el(tag, cls, t) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (t != null) n.textContent = t;
    return n;
  }

  function board(grid, squares) {
    var b = el('div', 'invite-board');
    b.style.setProperty('--c', grid.color);
    b.style.gridTemplateColumns = 'repeat(' + grid.cols + ', 1fr)';
    b.style.maxWidth = Math.min(360, grid.cols * 44 + 32) + 'px';
    for (var i = 0; i < grid.cols * grid.rows; i++) {
      // Without squares (a grid not started yet), the whole board in its color.
      var s = squares ? squares[i] || { state: 'hidden' } : { state: 'revealed' };
      var t = el('i', s.state === 'done' ? 'd' : s.state === 'revealed' ? 'r' : '');
      if (s.title) t.title = s.title;
      b.appendChild(t);
    }
    return b;
  }

  function show(p) {
    var extra = $('extra');
    if (kind === 'f') {
      text('title', p.username + ' wants to be friends');
      text('lede', 'Friends on AirStrive see the grids and moments each of you chooses to share with friends. Nothing private is shared, and either of you can remove the other at any time.');
    } else if (kind === 'g') {
      text('title', p.from + ' invited you to do ' + p.grid.title + ' together');
      var others = (p.members || []).filter(function (n) { return n !== p.from; });
      var names = [p.from].concat(others);
      var who = names.length === 1 ? p.from
        : names.length === 2 ? names[0] + ' and ' + names[1]
        : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      text('lede', who + (names.length > 1 ? ' are' : ' is') +
        ' filling in this grid. Anyone in the group can do a square, and each of you adds your own words and photos. Only the group sees it, and joining makes you friends with ' + p.from + '.');
      extra.appendChild(board(p.grid));
    } else if (kind === 'a') {
      text('title', (p.from ? p.from + ' sent you ' : 'Try ') + p.grid.title);
      text('lede', (p.grid.description || 'A grid of small experiences to fill in, one square at a time.') +
        (p.from ? ' Start your own, and be friends with ' + p.from + ' to see each other’s.' : ''));
      extra.appendChild(board(p.grid));
    } else if (kind === 'p') {
      text('title', p.owner + '’s ' + p.grid.title);
      var done = (p.squares || []).filter(function (s) { return s.title; });
      text('lede', done.length
        ? p.owner + ' has filled in ' + done.length + (done.length === 1 ? ' square' : ' squares') + ' so far. Be friends to see the words and photos too.'
        : p.owner + ' has just started this grid. Be friends to follow along.');
      extra.appendChild(board(p.grid, p.squares));
      if (done.length) {
        var ul = el('ul', 'invite-list');
        done.forEach(function (s) { ul.appendChild(el('li', null, s.title)); });
        extra.appendChild(ul);
      }
    }
    document.title = $('title').textContent + ' · AirStrive';
  }

  if (!cfg.supabaseUrl || !cfg.anonKey) return; // the page still works with its general wording
  var body = { kind: kind, code: code };
  if (from) body.from_code = from;
  fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/invite_preview', {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (p) {
    if (p) { show(p); return; }
    text('title', "This link doesn't work any more");
    text('lede', 'Whoever shared it may have turned it off or made a new one. Ask them to send it again.');
    $('actions').hidden = true;
  }, function () { /* offline or misconfigured: keep the general wording */ });
})();
