let currentElections = [];

const IC = {
  trash:   `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
  settings:`<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
  plus:    `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  layout:  `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  users:   `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  chart:   `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  vote:    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  warn:    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

document.addEventListener('DOMContentLoaded', () => {
  fbAuth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = '/admin'; return; }
    const token = await user.getIdTokenResult(true);
    if (!token.claims.admin) { window.location.href = '/admin'; return; }

    document.getElementById('adminUsername').textContent = user.displayName || user.email;
    document.getElementById('adminInitial').textContent  = (user.displayName || user.email).charAt(0).toUpperCase();

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'results') loadResults();
      });
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fbAuth.signOut(); window.location.href = '/admin';
    });

    document.getElementById('createElectionBtn').addEventListener('click', createElection);
    document.getElementById('manageModalClose').addEventListener('click', () =>
      document.getElementById('manageModal').classList.remove('open'));
    document.getElementById('manageModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });

    await loadElections();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
});

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg; el.className = 'alert show ' + type;
  el.style.display = 'flex';
  setTimeout(() => { if (el) { el.className = 'alert'; el.style.display = 'none'; } }, 3500);
}

async function loadElections() {
  try {
    const res = await authFetch('/api/elections');
    currentElections = await res.json();
    renderElections();
  } catch {
    document.getElementById('electionsGrid').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">${IC.warn}</div><p>Failed to load elections.</p></div>`;
  }
}

function renderElections() {
  const grid = document.getElementById('electionsGrid');
  document.getElementById('electionsCount').textContent = `${currentElections.length} total`;

  if (currentElections.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">${IC.vote}</div>
        <h4>No elections yet</h4>
        <p>Create your first election above to get started.</p>
      </div>`;
    return;
  }

  grid.innerHTML = '';
  currentElections.forEach(el => {
    const posCount = el.type === 'positions'
      ? `${(el.positions||[]).length} position${(el.positions||[]).length !== 1 ? 's' : ''}`
      : `${el.candidatesCount || 0} candidate${el.candidatesCount !== 1 ? 's' : ''}`;

    const typeChip = el.type === 'positions'
      ? `<span class="type-chip positions">${IC.layout} Positions</span>`
      : `<span class="type-chip direct">${IC.users} Direct</span>`;

    const statusBadge = el.active
      ? `<span class="section-badge" style="background:var(--green-light);color:var(--green-2)">● Active</span>`
      : `<span class="section-badge" style="background:var(--gray-100);color:var(--gray-400)">○ Closed</span>`;

    const card = document.createElement('div');
    card.className = 'election-card';
    card.innerHTML = `
      <div class="election-card-body">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
          ${typeChip}
          ${statusBadge}
        </div>
        <div class="election-card-name">${el.name}</div>
        <div class="election-card-meta">
          ${IC.users.replace('var(--gray-400)','var(--gray-400)')}
          ${posCount}
        </div>
      </div>
      <div class="election-card-footer">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <label class="toggle-switch">
            <input type="checkbox" class="status-check" data-id="${el.id}" ${el.active ? 'checked' : ''}>
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
          <span class="status-label ${el.active ? 'active' : 'closed'}" id="slabel-${el.id}">
            ${el.active ? 'Active' : 'Closed'}
          </span>
        </label>
        <button class="btn-manage" data-id="${el.id}" style="margin-left:auto">
          ${IC.settings} Manage
        </button>
        <button class="btn-del-election" data-id="${el.id}">
          ${IC.trash}
        </button>
      </div>`;

    card.querySelector('.status-check').addEventListener('change', async e => {
      const r = await authFetch(`/api/elections/${e.target.dataset.id}/toggle`, { method: 'PATCH' });
      const d = await r.json();
      const lbl = document.getElementById('slabel-' + e.target.dataset.id);
      if (lbl) { lbl.textContent = d.active ? 'Active' : 'Closed'; lbl.className = 'status-label ' + (d.active ? 'active' : 'closed'); }
      await loadElections();
    });

    card.querySelector('.btn-manage').addEventListener('click', () => openManageModal(el.id));
    card.querySelector('.btn-del-election').addEventListener('click', async () => {
      if (!confirm(`Delete "${el.name}"? This cannot be undone.`)) return;
      await authFetch(`/api/elections/${el.id}`, { method: 'DELETE' });
      await loadElections();
    });

    grid.appendChild(card);
  });
}

async function createElection() {
  const name = document.getElementById('electionName').value.trim();
  const type = document.querySelector('input[name="electionType"]:checked').value;
  if (!name) { showAlert('createAlert', 'Please enter an election name', 'error'); return; }
  const btn = document.getElementById('createElectionBtn');
  btn.style.opacity = '0.7'; btn.disabled = true;
  try {
    const res  = await authFetch('/api/elections', { method: 'POST', body: JSON.stringify({ name, type }) });
    const data = await res.json();
    if (res.ok) {
      showAlert('createAlert', `✓ "${name}" created!`, 'success');
      document.getElementById('electionName').value = '';
      await loadElections();
    } else showAlert('createAlert', data.message || 'Failed to create', 'error');
  } catch { showAlert('createAlert', 'Network error', 'error'); }
  btn.style.opacity = '1'; btn.disabled = false;
}

function openManageModal(electionId) {
  const el = currentElections.find(e => e.id === electionId);
  if (!el) return;
  document.getElementById('manageModalTitle').textContent = el.name;
  renderManageBody(el);
  document.getElementById('manageModal').classList.add('open');
}

async function renderManageBody(el) {
  const body = document.getElementById('manageModalBody');
  body.innerHTML = `<p style="color:var(--gray-400);font-size:.88rem">Loading…</p>`;
  try {
    const res = await authFetch(`/api/elections/${el.id}/results`);
    const { candidates = [] } = await res.json();
    el._candidates = candidates;
    body.innerHTML = '';
    if (el.type === 'positions') renderPositionsManager(el, body, candidates);
    else renderDirectManager(el, body, candidates);
  } catch {
    body.innerHTML = `<p style="color:#dc2626;font-size:.88rem">Failed to load candidates.</p>`;
  }
}

function renderPositionsManager(el, body, candidates) {
  // Add position row
  const addRow = document.createElement('div');
  addRow.innerHTML = `
    <p style="font-size:.73rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px;margin-bottom:.6rem">Add Position</p>
    <div class="inline-row">
      <input type="text" class="inline-input" id="newPosName" placeholder="e.g. President, Secretary…">
      <button class="btn-inline-add" id="addPosBtn">${IC.plus} Add Position</button>
    </div>
    <div class="alert" id="posAlert" style="margin-top:8px;display:none"></div>`;
  body.appendChild(addRow);

  addRow.querySelector('#addPosBtn').addEventListener('click', async () => {
    const name = addRow.querySelector('#newPosName').value.trim();
    if (!name) return;
    const r = await authFetch(`/api/elections/${el.id}/positions`, {
      method: 'POST', body: JSON.stringify({ name })
    });
    if (r.ok) { addRow.querySelector('#newPosName').value = ''; await refreshManage(el.id); }
  });

  if (!el.positions || el.positions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state'; empty.style.padding = '1.5rem';
    empty.innerHTML = `<div class="empty-icon">${IC.vote}</div><p>No positions yet. Add one above.</p>`;
    body.appendChild(empty); return;
  }

  el.positions.forEach(pos => {
    const posCands = candidates.filter(c => c.positionId === pos.id);
    const block = document.createElement('div');
    block.className = 'pos-block';
    block.innerHTML = `
      <div class="pos-block-head">
        <h4>${pos.name}
          <span style="color:var(--gray-400);font-size:.73rem;font-weight:400;margin-left:4px">
            ${posCands.length} candidate${posCands.length !== 1 ? 's' : ''}
          </span>
        </h4>
        <button class="btn-del-election" style="padding:5px 10px;font-size:.75rem" data-pos-id="${pos.id}">
          ${IC.trash} Remove
        </button>
      </div>
      <div class="pos-candidates">
        ${posCands.map(c => `
          <div class="mini-cand">
            <div>
              <div class="mini-cand-name">${c.name}</div>
              ${c.info ? `<div class="mini-cand-info">${c.info}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="vote-count-badge">${c.votes}v</span>
              <button class="btn-mini-del" data-cid="${c.id}" data-pos-id="${pos.id}">
                ${IC.trash}
              </button>
            </div>
          </div>`).join('')}
        <div class="inline-row">
          <input type="text" class="inline-input cand-name-in" placeholder="Candidate name">
          <input type="text" class="inline-input cand-info-in" placeholder="Info (optional)">
          <button class="btn-inline-add add-cand-btn" data-pos-id="${pos.id}">${IC.plus}</button>
        </div>
      </div>`;

    block.querySelector(`[data-pos-id="${pos.id}"].btn-del-election`).addEventListener('click', async () => {
      if (!confirm(`Remove position "${pos.name}" and all its candidates?`)) return;
      await authFetch(`/api/elections/${el.id}/positions/${pos.id}`, { method: 'DELETE' });
      await refreshManage(el.id);
    });

    block.querySelectorAll('.btn-mini-del').forEach(btn => btn.addEventListener('click', async () => {
      await authFetch(`/api/elections/${el.id}/candidates/${btn.dataset.cid}`, { method: 'DELETE' });
      await refreshManage(el.id);
    }));

    block.querySelector('.add-cand-btn').addEventListener('click', async () => {
      const ni = block.querySelector('.cand-name-in');
      const ii = block.querySelector('.cand-info-in');
      if (!ni.value.trim()) return;
      const r = await authFetch(`/api/elections/${el.id}/candidates`, {
        method: 'POST',
        body: JSON.stringify({ name: ni.value.trim(), info: ii.value.trim(), positionId: pos.id })
      });
      if (r.ok) { ni.value = ''; ii.value = ''; await refreshManage(el.id); }
    });

    body.appendChild(block);
  });
}

function renderDirectManager(el, body, candidates) {
  const div = document.createElement('div');
  div.innerHTML = `
    <p style="font-size:.73rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.4px;margin-bottom:.75rem">
      Candidates
      <span class="section-badge" style="margin-left:8px;font-size:.68rem">${candidates.length}</span>
    </p>
    <div class="pos-candidates" style="margin-bottom:1rem">
      ${candidates.map(c => `
        <div class="mini-cand">
          <div>
            <div class="mini-cand-name">${c.name}</div>
            ${c.info ? `<div class="mini-cand-info">${c.info}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="vote-count-badge">${c.votes}v</span>
            <button class="btn-mini-del btn-del-dc" data-cid="${c.id}">${IC.trash}</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="inline-row">
      <input type="text" class="inline-input" id="dcName" placeholder="Candidate name">
      <input type="text" class="inline-input" id="dcInfo" placeholder="Info (optional)">
      <button class="btn-inline-add" id="addDcBtn">${IC.plus} Add</button>
    </div>`;

  div.querySelectorAll('.btn-del-dc').forEach(btn => btn.addEventListener('click', async () => {
    await authFetch(`/api/elections/${el.id}/candidates/${btn.dataset.cid}`, { method: 'DELETE' });
    await refreshManage(el.id);
  }));

  div.querySelector('#addDcBtn').addEventListener('click', async () => {
    const n = div.querySelector('#dcName').value.trim();
    if (!n) return;
    const r = await authFetch(`/api/elections/${el.id}/candidates`, {
      method: 'POST',
      body: JSON.stringify({ name: n, info: div.querySelector('#dcInfo').value.trim() })
    });
    if (r.ok) { div.querySelector('#dcName').value = ''; div.querySelector('#dcInfo').value = ''; await refreshManage(el.id); }
  });

  body.appendChild(div);
}

async function refreshManage(electionId) {
  await loadElections();
  const updated = currentElections.find(e => e.id === electionId);
  if (updated) await renderManageBody(updated);
}

async function loadResults() {
  try {
    const res = await authFetch('/api/results');
    const elections = await res.json();
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    if (elections.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">${IC.chart}</div><h4>No elections yet</h4><p>Create an election to see results here.</p></div>`;
      return;
    }

    elections.forEach(el => {
      const section = document.createElement('div');
      section.className = 'result-election';

      const typeChip = el.type === 'positions'
        ? `<span class="type-chip positions">${IC.layout} Positions</span>`
        : `<span class="type-chip direct">${IC.users} Direct</span>`;

      const statusBadge = el.active
        ? `<span class="section-badge" style="background:var(--green-light);color:var(--green-2)">● Active</span>`
        : `<span class="section-badge" style="background:var(--gray-100);color:var(--gray-400)">○ Closed</span>`;

      section.innerHTML = `
        <div class="result-election-header">
          <h3>${el.name}</h3>
          ${typeChip} ${statusBadge}
          <span style="font-size:.75rem;color:var(--gray-400);margin-left:auto">
            ${el.totalVotes || 0} total vote${(el.totalVotes||0) !== 1 ? 's' : ''}
          </span>
        </div>`;

      const renderCands = (cands, label) => {
        if (label) {
          const lbl = document.createElement('p');
          lbl.className = 'result-pos-label'; lbl.textContent = label;
          section.appendChild(lbl);
        }
        if (cands.length === 0) {
          const empty = document.createElement('p');
          empty.style.cssText = 'color:var(--gray-400);font-size:.82rem;margin-bottom:.5rem';
          empty.textContent = 'No candidates'; section.appendChild(empty); return;
        }
        const max = Math.max(...cands.map(c => c.votes), 0);
        [...cands].sort((a,b) => b.votes - a.votes).forEach(c => {
          const pct  = max > 0 ? Math.round((c.votes / max) * 100) : 0;
          const row  = document.createElement('div');
          row.className = 'result-row' + (c.votes === max && max > 0 ? ' leading' : '');
          row.innerHTML = `
            <div class="result-info">
              <h4>${c.name}${c.info ? ` <span style="font-weight:400;color:var(--gray-400);font-size:.78rem">· ${c.info}</span>` : ''}</h4>
              <div class="vote-bar-track"><div class="vote-bar-fill" style="width:${pct}%"></div></div>
            </div>
            <span class="result-count">${c.votes}</span>`;
          section.appendChild(row);
        });
      };

      if (el.type === 'positions') {
        (el.positions || []).forEach(pos => {
          renderCands((el.allCandidates || []).filter(c => c.positionId === pos.id), pos.name);
        });
      } else {
        renderCands(el.allCandidates || [], null);
      }

      container.appendChild(section);
    });
  } catch {
    document.getElementById('resultsContainer').innerHTML =
      `<div class="empty-state"><div class="empty-icon">${IC.warn}</div><p>Failed to load results.</p></div>`;
  }
}
