/* Admin portal: open/close the website and ordering, set the cut-off time, create accounts.
   Everything is saved on the server. */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'accounts', label: 'Accounts', icon: 'users' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];
const V = { page: 'dashboard', tab: 'student', q: '', users: { student: null, staff: null, admin: null }, counts: null };
let lastCreds = null, lastActivity = Date.now();
const me = () => Auth.current('admin');
const ROLE_LABEL = { student: 'Student', staff: 'Canteen Staff', admin: 'Admin' };
const TAB_LABEL = { student: 'Students', staff: 'Canteen Staff', admin: 'Admins' };
const ID_LABEL = { student: 'Student No.', staff: 'Username', admin: 'Username' };
const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

/* ---------- loading from the server ---------- */
async function loadUsers(role) { V.users[role] = await Auth.call('admin_list_users', { p_role: role }); }
async function loadCounts() { V.counts = await Auth.call('admin_counts'); }
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(e.message, 'error'); return false; }
}
async function saveSettings(p) { await Auth.call('admin_set_settings', { p }); await Auth.sync(true); }

/* ---------- pages ---------- */
function controls() {
  const s = Auth.settings();
  const sw = (key, on, title, hint) => `<label class="switch-row"><span><b>${title}</b><small>${hint}</small></span><input type="checkbox" class="sw" data-change="${key}" ${on ? 'checked' : ''}></label>`;
  return `<section class="panel">
    <div class="panel-head"><h2>Website &amp; ordering</h2></div>
    ${sw('site', s.websiteOpen, 'Website open', 'Turn off to close the whole student website. Students will see a “closed” page.')}
    ${sw('orders', s.ordersOpen, 'Taking orders', 'Turn off to close ordering right away. Students can still see the menu.')}
    ${sw('preorder', s.preorderOn, 'Pre-orders for tomorrow', 'Students can order for tomorrow, even after today’s cut-off. Turns off with “Taking orders”.')}
    ${sw('cutoff', s.cutoffOn, 'Daily cut-off time', 'Ordering opens and closes by itself every day (Philippine time).')}
    <form data-form="schedule" style="margin-top:1rem">
      <div class="row">
        <label class="field"><span>Ordering opens at</span><input type="time" name="opensAt" value="${esc(s.opensAt)}" required></label>
        <label class="field"><span>Cut-off (orders close at)</span><input type="time" name="cutoffAt" value="${esc(s.cutoffAt)}" required></label>
      </div>
      <label class="field"><span>Message for students (optional)</span><input name="notice" maxlength="120" value="${esc(s.notice)}" placeholder="e.g. Canteen closed for the school event."></label>
      <p class="error-text" id="sched-err" role="alert"></p>
      <button class="btn btn-primary">Save schedule</button>
    </form>
  </section>`;
}

function dashboardPage() {
  const s = Auth.settings(), st = Auth.orderStatus(), c = V.counts || { students: '–', staff: '–' };
  return `
  <div class="stats">
    <div class="stat ${s.websiteOpen ? '' : 'warn'}"><small>Website</small><strong>${s.websiteOpen ? 'Open' : 'Closed'}</strong><span class="mute">Student site</span></div>
    <div class="stat ${st.open ? '' : 'warn'}"><small>Ordering right now</small><strong>${st.open ? 'Open' : 'Closed'}</strong><span class="mute">${esc(st.msg)}</span></div>
    <div class="stat"><small>Cut-off time</small><strong>${s.cutoffOn ? Auth.fmt(s.cutoffAt) : 'Off'}</strong><span class="mute">${s.cutoffOn ? 'Opens ' + Auth.fmt(s.opensAt) : 'No daily schedule'}</span></div>
    <div class="stat"><small>Accounts</small><strong>${c.students}</strong><span class="mute">students · ${c.staff} canteen staff · ${c.admins ?? '–'} admin${c.admins === 1 ? '' : 's'}</span></div>
  </div>
  ${controls()}`;
}

/* the accounts shown right now (search applied), in print order */
function shownUsers() {
  const q = V.q.toLowerCase();
  return (V.users[V.tab] || []).filter((u) => !q || (u.name + u.id + (u.section || '')).toLowerCase().includes(q))
    .sort((a, b) => (a.section || '').localeCompare(b.section || '') || a.name.localeCompare(b.name));
}

function accountsPage() {
  const all = V.users[V.tab], list = shownUsers(), t = V.tab, set = Auth.settings(), self = me().id;
  const noun = { student: 'student', staff: 'canteen staff', admin: 'admin' }[t];
  const hasExp = t !== 'admin';
  return `
  <div class="subtabs">${Object.keys(TAB_LABEL).map((k) => `<button data-act="tab" data-v="${k}" aria-selected="${t === k}">${TAB_LABEL[k]}</button>`).join('')}</div>
  <section class="panel">
    <div class="panel-head"><h2>Create ${noun} accounts</h2></div>
    <form data-form="create">
      <label class="field"><span>${t === 'student' ? 'Names, one per line (add a comma and the grade &amp; section if you like)' : 'Names, one per line'}</span>
        <textarea class="names" name="names" required placeholder="${t === 'student' ? 'Juan Dela Cruz, Grade 10 - Rizal&#10;Maria Santos, Grade 9 - Bonifacio' : t === 'staff' ? 'Ana Reyes&#10;Pedro Cruz' : 'Ms. Garcia&#10;Mr. Lopez'}"></textarea></label>
      ${hasExp ? `<label class="field"><span>Auto-delete on (optional)</span><input type="date" name="expires" min="${esc(set.tomorrow || '')}"><small class="mute">The account stops working at the start of this date and is then removed.</small></label>` : ''}
      <p class="mute" style="margin-bottom:1rem">${t === 'student' ? 'A Student No. (like 2026-0001) and a password are generated for each one.' : t === 'staff' ? 'A username (like staff01) and a password are generated for each one.' : 'An admin username (like admin02) and a password are generated. Admins can do everything you can, so only add people you trust.'}</p>
      <button class="btn btn-primary">${icon('plus')} Generate accounts</button>
    </form>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>${TAB_LABEL[t]}${all ? ` (${list.length})` : ''}</h2>
      <input type="search" data-input="acc-q" placeholder="Search…" value="${esc(V.q)}" style="padding:.5rem .8rem;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:inherit"></div>
    ${all && list.length ? `<div class="toolbar">
      <button class="btn btn-sm" data-act="print-list">Print list</button>
      <button class="btn btn-sm" data-act="bulk-reset">New passwords &amp; print</button>
      ${hasExp ? '<button class="btn btn-sm" data-act="expiry-bulk">Set auto-delete date for these</button>' : ''}
    </div>` : ''}
    ${!all ? '<p class="mute">Loading…</p>' : list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${ID_LABEL[t]}</th><th>Name</th>${t === 'student' ? '<th>Grade &amp; section</th>' : ''}<th>Status</th>${hasExp ? '<th>Auto-delete</th>' : ''}<th></th></tr></thead><tbody>
      ${list.map((u) => `<tr><td><code>${esc(u.id)}</code></td><td>${esc(u.name)}</td>${t === 'student' ? `<td>${esc(u.section || '—')}</td>` : ''}
        <td><span class="chip ${u.active === false ? 'chip-pending' : 'chip-ready'}">${u.active === false ? 'Off' : 'Active'}</span></td>
        ${hasExp ? `<td>${u.expiresOn ? esc(fmtDate(u.expiresOn)) : '—'}</td>` : ''}
        <td class="acts">${u.id === self ? '<span class="mute">You</span>' : `<button class="btn btn-sm" data-act="reset" data-id="${esc(u.id)}">New password</button>
        ${hasExp ? `<button class="btn btn-sm" data-act="expiry" data-id="${esc(u.id)}">Auto-delete…</button>` : ''}
        <button class="btn btn-sm" data-act="toggle" data-id="${esc(u.id)}">${u.active === false ? 'Turn on' : 'Turn off'}</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${esc(u.id)}">Delete</button>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="mute">No accounts yet.</p>'}
  </section>`;
}

function profilePage() {
  const a = me();
  return `<section class="panel form-box">
    <h2 style="margin-bottom:.4rem">${esc(a.name)}</h2>
    <p class="mute" style="margin-bottom:1.2rem">Admin username: <b>${esc(a.id)}</b> · Last sign-in: ${a.lastLogin ? esc(new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(a.lastLogin))) : 'first sign-in'}</p>
    <form data-form="password">
      <h3 style="margin-bottom:.8rem">Change password</h3>
      <label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required></label>
      <label class="field"><span>New password</span><input name="next" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="field"><span>Confirm new password</span><input name="confirm" type="password" autocomplete="new-password" required></label>
      <p class="error-text" id="pw-err" role="alert"></p>
      <button class="btn btn-primary">Update password</button>
    </form>
    <hr style="margin:1.4rem 0">
    <button class="btn btn-danger" data-act="logout">${icon('logout')} Sign out</button>
  </section>`;
}
const PAGES = { dashboard: dashboardPage, accounts: accountsPage, profile: profilePage };

function render() {
  if (!me()) { location.replace('../index.html'); return; }
  const a = me(), y = scrollY, typing = document.activeElement?.dataset?.input === 'acc-q';
  const nav = NAV.map((n) => `<button class="nav-btn" data-act="nav" data-page="${n.id}" ${V.page === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></button>`).join('');
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="rail"><div class="brand"><img class="logo" src="pickago_Logo.png" alt="">Pickago</div><nav aria-label="Main">${nav}</nav><p class="rail-foot">Admin</p></aside>
    <div class="main">
      <header class="top"><h1>${NAV.find((n) => n.id === V.page).label}</h1>
        <button class="me" data-act="nav" data-page="profile" aria-label="Open profile"><span class="avatar">${esc((a.name || 'A')[0].toUpperCase())}</span><span>${esc(a.name)}</span></button></header>
      <main class="content">${PAGES[V.page]()}</main>
    </div>
    <nav class="tabbar" aria-label="Main">${nav}</nav>
  </div>`;
  scrollTo(0, y);
  if (typing) { const i = $('[data-input=acc-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

/* ---------- generated credentials ---------- */
function showCreds(rows, role) {
  lastCreds = { rows, role };
  const stu = role === 'student';
  Modal.open(`<h2>${rows.length} account${rows.length === 1 ? '' : 's'} ready</h2>
    <p class="mute">Save or print these now. Passwords are stored scrambled, so they can’t be shown again (you can make a new one any time).</p>
    <div class="tbl-wrap" style="max-height:50vh;overflow:auto;margin:.8rem 0"><table class="tbl"><thead><tr><th>Name</th>${stu ? '<th>Grade &amp; section</th>' : ''}<th>${ID_LABEL[role]}</th><th>Password</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.name)}</td>${stu ? `<td>${esc(r.section || '—')}</td>` : ''}<td><code>${esc(r.id)}</code></td><td><code>${esc(r.password)}</code></td></tr>`).join('')}</tbody></table></div>
    <div class="sheet-actions"><button class="btn" data-act="copy-creds">Copy</button><button class="btn" data-act="print-creds">Print</button><button class="btn btn-primary" data-act="modal-close">Done</button></div>`);
}
/* open a clean page and print a table */
function printTable(title, head, rows, note = '') {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print.', 'error');
  const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.document.write(`<title>${e(title)}</title><style>body{font-family:sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}p{margin:0 0 14px;color:#555;font-size:13px}
    table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #999;padding:7px 9px;text-align:left}th{background:#eee}tr{page-break-inside:avoid}</style>
    <h2>${e(title)}</h2><p>${e(note)}Printed ${e(new Date().toLocaleString('en-PH'))}</p>
    <table><tr>${head.map((h) => `<th>${e(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</table>`);
  w.document.close(); w.print();
}
function printCreds() {
  const { rows, role } = lastCreds, stu = role === 'student';
  printTable(`Pickago ${ROLE_LABEL[role]} logins`, ['Name', ...(stu ? ['Grade & section'] : []), ID_LABEL[role], 'Password'],
    rows.map((r) => [r.name, ...(stu ? [r.section || ''] : []), r.id, r.password]), 'Keep this sheet private. ');
}

/* ---------- actions ---------- */
const findUser = (id) => [...(V.users.student || []), ...(V.users.staff || []), ...(V.users.admin || [])].find((u) => u.id === id);
function openExpiry(ids, title, current) {
  Modal.open(`<form data-form="expiry" data-ids="${esc(ids.join('|'))}">
    <h2>${esc(title)}</h2>
    <p class="mute">The account stops working at the start of this date and is then deleted. Past orders stay in the records.</p>
    <label class="field"><span>Delete on</span><input type="date" name="date" value="${esc(current)}" min="${esc(Auth.settings().tomorrow || '')}"></label>
    <p class="mute" style="margin-bottom:1rem">Leave it empty to keep the account forever.</p>
    <p class="error-text" id="exp-err" role="alert"></p>
    <div class="sheet-actions"><button type="button" class="btn" data-act="modal-close">Cancel</button><button class="btn btn-primary">Save</button></div>
  </form>`);
}
const Actions = {
  nav: (d) => { V.page = d.page; render(); scrollTo(0, 0); if (d.page === 'accounts' && !V.users[V.tab]) loadUsers(V.tab).then(render); },
  tab: async (d) => { V.tab = d.v; V.q = ''; render(); await run(() => loadUsers(d.v)); render(); },
  'modal-close': () => Modal.close(),
  'copy-creds': () => {
    const t = lastCreds.rows.map((r) => [r.name, r.id, r.password].join('\t')).join('\n');
    navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Could not copy', 'error'));
  },
  'print-creds': printCreds,
  'print-list': () => {
    const t = V.tab, list = shownUsers(), stu = t === 'student', exp = t !== 'admin';
    printTable(`Pickago ${TAB_LABEL[t]} list`, [ID_LABEL[t], 'Name', ...(stu ? ['Grade & section'] : []), 'Status', ...(exp ? ['Auto-delete'] : [])],
      list.map((u) => [u.id, u.name, ...(stu ? [u.section || ''] : []), u.active === false ? 'Off' : 'Active', ...(exp ? [u.expiresOn ? fmtDate(u.expiresOn) : ''] : [])]),
      'Passwords are not shown because they are stored scrambled. Use “New passwords & print” to hand out logins. ');
  },
  'bulk-reset': async () => {
    const list = shownUsers().filter((u) => u.id !== me().id), t = V.tab;
    if (!list.length || !(await Modal.confirm(`Make new passwords for ${list.length} account${list.length === 1 ? '' : 's'}?`, 'Their old passwords stop working and they are signed out. You will get a list to print.', 'Make new passwords'))) return;
    try { showCreds(await Auth.call('admin_reset_passwords', { p_ids: list.map((u) => u.id) }), t); }
    catch (e) { toast(e.message, 'error'); }
  },
  expiry: (d) => { const u = findUser(d.id); if (u) openExpiry([u.id], `Auto-delete ${u.name}`, u.expiresOn || ''); },
  'expiry-bulk': () => { const l = shownUsers(); if (l.length) openExpiry(l.map((u) => u.id), `Auto-delete date for ${l.length} account${l.length === 1 ? '' : 's'}`, ''); },
  reset: async (d) => {
    const u = findUser(d.id); if (!u || !(await Modal.confirm(`New password for ${u.name}?`, 'The old password will stop working and they will be signed out.', 'Make new password'))) return;
    try { const r = await Auth.call('admin_reset_password', { p_id: u.id }); showCreds([{ name: u.name, id: u.id, password: r.password }], u.role); }
    catch (e) { toast(e.message, 'error'); }
  },
  toggle: async (d) => {
    const u = findUser(d.id); if (!u) return;
    if (await run(() => Auth.call('admin_set_active', { p_id: u.id, p_active: u.active === false }))) { await run(() => loadUsers(u.role)); render(); }
  },
  del: async (d) => {
    const u = findUser(d.id);
    if (!u || !(await Modal.confirm(`Delete ${u.name}?`, `${u.id} won’t be able to sign in any more. Past orders stay in the records.`, 'Delete account', true))) return;
    if (await run(() => Auth.call('admin_delete_user', { p_id: u.id }), 'Account deleted')) { await run(() => Promise.all([loadUsers(u.role), loadCounts()])); render(); }
  },
  logout: async () => { if (await Modal.confirm('Sign out?', 'You will need to sign in again.', 'Sign out')) { Auth.logout(); location.replace('../index.html'); } },
};
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el) Actions[el.dataset.act]?.(el.dataset, el); });
document.addEventListener('input', (e) => { if (e.target.dataset.input === 'acc-q') { V.q = e.target.value; render(); } });
document.addEventListener('change', async (e) => {
  const t = e.target, map = { site: 'websiteOpen', orders: 'ordersOpen', preorder: 'preorderOn', cutoff: 'cutoffOn' }, k = map[t.dataset.change];
  if (!k) return;
  const ok = await run(() => saveSettings({ [k]: t.checked }), t.checked ? 'Turned on' : 'Turned off');
  render();
  if (!ok) await run(() => Auth.sync(true)).then(render);
});

const Forms = {
  async schedule(f) {
    const fd = new FormData(f), err = $('#sched-err'), a = fd.get('opensAt'), b = fd.get('cutoffAt');
    if (b <= a) { err.textContent = 'The cut-off must be later than the opening time.'; return; }
    try { await saveSettings({ opensAt: a, cutoffAt: b, notice: fd.get('notice').trim() }); }
    catch (e) { err.textContent = e.message; return; }
    toast('Schedule saved'); render();
  },
  async create(f) {
    const role = V.tab, btn = f.querySelector('button'), expires = new FormData(f).get('expires') || null;
    const rows = String(new FormData(f).get('names')).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200).map((l) => {
      const [name, ...rest] = l.split(',');
      return { name: name.trim(), section: role === 'student' ? rest.join(',').trim() : '' };
    }).filter((r) => r.name.length >= 2);
    if (!rows.length) return toast('Type at least one name.', 'error');
    btn.disabled = true;
    try {
      const out = await Auth.call('admin_create_users', { p_role: role, p_rows: rows, p_expires: role === 'admin' ? null : expires });
      await Promise.all([loadUsers(role), loadCounts()]);
      render(); showCreds(out, role);
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  },
  async expiry(f) {
    const ids = f.dataset.ids.split('|'), date = new FormData(f).get('date') || null, err = $('#exp-err');
    try { await Auth.call('admin_set_expiry', { p_ids: ids, p_date: date }); }
    catch (e) { err.textContent = e.message; return; }
    Modal.close(); await run(() => loadUsers(V.tab)); toast(date ? 'Auto-delete date saved' : 'Auto-delete date cleared'); render();
  },
  async password(f) {
    const fd = new FormData(f), err = $('#pw-err'), next = fd.get('next');
    if (next.length < 8) { err.textContent = 'New password needs at least 8 characters.'; return; }
    if (next === fd.get('current')) { err.textContent = 'Choose a different password.'; return; }
    if (next !== fd.get('confirm')) { err.textContent = 'New passwords don’t match.'; return; }
    try { await Auth.changePassword(fd.get('current'), next); } catch (e) { err.textContent = e.message; return; }
    toast('Password updated'); f.reset(); err.textContent = '';
  },
};
document.addEventListener('submit', (e) => { const h = Forms[e.target.dataset.form]; if (h) { e.preventDefault(); h(e.target); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => { if (me() && Date.now() - lastActivity > 30 * 60000) { Auth.logout(); location.replace('../index.html'); } }, 30000);
/* keep the status cards fresh (e.g. when the cut-off time passes) */
setInterval(async () => {
  if (!me() || V.page !== 'dashboard' || $('.scrim') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  try { const r = await Auth.sync(); if (r.changed) render(); } catch {}
}, 15000);

(async () => {
  if (!me()) { location.replace('../index.html'); return; }
  $('#app').innerHTML = '<p class="mute" style="padding:2rem">Loading…</p>';
  try { await Promise.all([Auth.sync(true), loadCounts()]); }
  catch (e) { $('#app').innerHTML = `<div class="empty" style="margin:2rem"><strong>Can’t load the admin page</strong>${esc(e.message)}<br><br><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`; return; }
  render();
})();
