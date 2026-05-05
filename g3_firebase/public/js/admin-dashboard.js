let currentElections = [];

document.addEventListener('DOMContentLoaded', () => {
  fbAuth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = '/admin'; return; }
    const tokenResult = await user.getIdTokenResult(true);
    if (!tokenResult.claims.admin) { window.location.href = '/admin'; return; }

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
    document.getElementById('manageModalClose').addEventListener('click', () => document.getElementById('manageModal').classList.remove('open'));
    document.getElementById('manageModal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

    await loadElections();
  });
});

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg; el.className = 'alert show ' + type;
  setTimeout(() => { if (el) el.className = 'alert'; }, 3500);
}

async function loadElections() {
  try {
    const res = await authFetch('/api/elections');
    currentElections = await res.json();
    renderElections();
  } catch {
    document.getElementById('electionsGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><p>Failed to load.</p></div>';
  }
}

function renderElections() {
  const grid = document.getElementById('electionsGrid');
  document.getElementById('electionsCount').textContent = `${currentElections.length} total`;

  if (currentElections.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🗳️</div><p>No elections yet.</p></div>';
    return;
  }

  grid.innerHTML = '';
  currentElections.forEach(el => {
    const posCount = el.type === 'positions'
      ? `${(el.positions||[]).length} position${(el.positions||[]).length !== 1 ? 's' : ''}`
      : `${el.candidatesCount || 0} candidates`;

    const card = document.createElement('div');
    card.className = 'election-card';
    card.innerHTML = `
      <div class="election-card-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="type-chip ${el.type}">${el.type === 'positions' ? '🏛️ Positions' : '👤 Direct'}</span>
          <span class="section-badge" style="background:${el.active ? 'var(--green-light)' : 'var(--gray-100)'};color:${el.active ? 'var(--green-2)' : 'var(--gray-400)'}">
            ${el.active ? '● Active' : '○ Closed'}
          </span>
        </div>
        <div class="election-card-name">${el.name}</div>
        <div class="election-card-meta">${posCount}</div>
      </div>
      <div class="election-card-footer">
        <label class="toggle-switch">
          <input type="checkbox" class="status-check" data-id="${el.id}" ${el.active ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
        <span class="status-label ${el.active ? 'active' : 'closed'}" id="slabel-${el.id}">${el.active ? 'Active' : 'Closed'}</span>
        <button class="btn-manage" data-id="${el.id}" style="margin-left:auto">Manage</button>
        <button class="btn-del-election" data-id="${el.id}">Delete</button>
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
      if (!confirm(`Delete "${el.name}"? Cannot be undone.`)) return;
      await authFetch(`/api/elections/${el.id}`, { method: 'DELETE' });
      await loadElections();
    });

    grid.appendChild(card);
  });
}

async function createElection() {
  const name = document.getElementById('electionName').value.trim();
  const type = document.querySelector('input[name="electionType"]:checked').value;
  if (!name) { showAlert('createAlert', 'Enter a name', 'error'); return; }
  const btn = document.getElementById('createElectionBtn');
  btn.textContent = 'Creating…'; btn.disabled = true;
  try {
    const res = await authFetch('/api/elections', { method: 'POST', body: JSON.stringify({ name, type }) });
    const data = await res.json();
    if (res.ok) { showAlert('createAlert', `✓ "${name}" created!`, 'success'); document.getElementById('electionName').value = ''; await loadElections(); }
    else showAlert('createAlert', data.message || 'Failed', 'error');
  } catch { showAlert('createAlert', 'Network error', 'error'); }
  btn.textContent = '+ Create'; btn.disabled = false;
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
  body.innerHTML = '';

  // Fetch current candidates from server
  const res = await authFetch(`/api/elections/${el.id}/results`);
  const { candidates = [] } = await res.json();
  el._candidates = candidates;

  if (el.type === 'positions') renderPositionsManager(el, body, candidates);
  else renderDirectManager(el, body, candidates);
}

function renderPositionsManager(el, body, candidates) {
  const addRow = document.createElement('div');
  addRow.innerHTML = `
    <p style="font-size:.75rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;margin-bottom:.5rem">Add Position</p>
    <div class="inline-row">
      <input type="text" class="inline-input" id="newPosName" placeholder="Position name, e.g. President">
      <button class="btn-inline-add" id="addPosBtn">+ Add</button>
    </div>
    <div class="alert" id="posAlert" style="margin-top:8px"></div>`;
  body.appendChild(addRow);

  addRow.querySelector('#addPosBtn').addEventListener('click', async () => {
    const name = addRow.querySelector('#newPosName').value.trim();
    if (!name) return;
    const r = await authFetch(`/api/elections/${el.id}/positions`, { method: 'POST', body: JSON.stringify({ name }) });
    if (r.ok) { addRow.querySelector('#newPosName').value = ''; await refreshManage(el.id); }
  });

  if (!el.positions || el.positions.length === 0) {
    const e = document.createElement('div');
    e.className = 'empty-state'; e.style.padding = '1.5rem';
    e.innerHTML = '<div class="empty-icon">📋</div><p>No positions yet.</p>';
    body.appendChild(e); return;
  }

  el.positions.forEach(pos => {
    const posCands = candidates.filter(c => c.positionId === pos.id);
    const block = document.createElement('div');
    block.className = 'pos-block';
    block.innerHTML = `
      <div class="pos-block-head">
        <h4>${pos.name} <span style="color:var(--gray-400);font-size:.75rem;font-weight:400">${posCands.length} candidates</span></h4>
        <button class="btn-del-election" style="padding:5px 12px;font-size:.75rem" data-pos-id="${pos.id}">Remove</button>
      </div>
      <div class="pos-candidates">
        ${posCands.map(c => `
          <div class="mini-cand">
            <div><div style="font-size:.85rem;font-weight:600;color:var(--gray-800)">${c.name}</div>${c.info ? `<div class="mini-cand-info">${c.info}</div>` : ''}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="vote-count-badge">${c.votes}v</span>
              <button class="btn-mini-del" data-cid="${c.id}">✕</button>
            </div>
          </div>`).join('')}
        <div class="inline-row">
          <input type="text" class="inline-input cand-name-in" placeholder="Name">
          <input type="text" class="inline-input cand-info-in" placeholder="Info (optional)">
          <button class="btn-inline-add add-cand-btn" data-pos-id="${pos.id}">+ Add</button>
        </div>
      </div>`;

    block.querySelector('[data-pos-id="' + pos.id + '"].btn-del-election').addEventListener('click', async () => {
      if (!confirm(`Remove "${pos.name}"?`)) return;
      await authFetch(`/api/elections/${el.id}/positions/${pos.id}`, { method: 'DELETE' });
      await refreshManage(el.id);
    });

    block.querySelectorAll('.btn-mini-del').forEach(btn => btn.addEventListener('click', async () => {
      await authFetch(`/api/elections/${el.id}/candidates/${btn.dataset.cid}`, { method: 'DELETE' });
      await refreshManage(el.id);
    }));

    block.querySelector('.add-cand-btn').addEventListener('click', async () => {
      const ni = block.querySelector('.cand-name-in'), ii = block.querySelector('.cand-info-in');
      if (!ni.value.trim()) return;
      const r = await authFetch(`/api/elections/${el.id}/candidates`, { method: 'POST', body: JSON.stringify({ name: ni.value.trim(), info: ii.value.trim(), positionId: pos.id }) });
      if (r.ok) { ni.value = ''; ii.value = ''; await refreshManage(el.id); }
    });

    body.appendChild(block);
  });
}

function renderDirectManager(el, body, candidates) {
  const div = document.createElement('div');
  div.innerHTML = `
    <p style="font-size:.75rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;margin-bottom:.75rem">Candidates (${candidates.length})</p>
    <div class="pos-candidates">
      ${candidates.map(c => `
        <div class="mini-cand">
          <div><div style="font-size:.85rem;font-weight:600;color:var(--gray-800)">${c.name}</div>${c.info ? `<div class="mini-cand-info">${c.info}</div>` : ''}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="vote-count-badge">${c.votes}v</span>
            <button class="btn-mini-del btn-del-dc" data-cid="${c.id}">✕</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="inline-row" style="margin-top:8px">
      <input type="text" class="inline-input" id="dcName" placeholder="Candidate name">
      <input type="text" class="inline-input" id="dcInfo" placeholder="Info (optional)">
      <button class="btn-inline-add" id="addDcBtn">+ Add</button>
    </div>`;

  div.querySelectorAll('.btn-del-dc').forEach(btn => btn.addEventListener('click', async () => {
    await authFetch(`/api/elections/${el.id}/candidates/${btn.dataset.cid}`, { method: 'DELETE' });
    await refreshManage(el.id);
  }));

  div.querySelector('#addDcBtn').addEventListener('click', async () => {
    const n = div.querySelector('#dcName').value.trim();
    if (!n) return;
    const r = await authFetch(`/api/elections/${el.id}/candidates`, { method: 'POST', body: JSON.stringify({ name: n, info: div.querySelector('#dcInfo').value.trim() }) });
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
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No elections yet.</p></div>';
      return;
    }

    elections.forEach(el => {
      const section = document.createElement('div');
      section.className = 'result-election';
      section.innerHTML = `
        <div class="result-election-header">
          <h3>${el.name}</h3>
          <span class="type-chip ${el.type}">${el.type === 'positions' ? '🏛️ Positions' : '👤 Direct'}</span>
          <span class="section-badge">${el.active ? '● Active' : '○ Closed'}</span>
          <span style="font-size:.78rem;color:var(--gray-400);margin-left:auto">${el.totalVotes} total vote${el.totalVotes !== 1 ? 's' : ''}</span>
        </div>`;

      const renderCands = (cands) => {
        const max = Math.max(...cands.map(c => c.votes), 0);
        [...cands].sort((a,b) => b.votes - a.votes).forEach(c => {
          const pct = max > 0 ? Math.round((c.votes / max) * 100) : 0;
          const row = document.createElement('div');
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
          const lbl = document.createElement('p');
          lbl.className = 'result-pos-label';
          lbl.textContent = pos.name;
          section.appendChild(lbl);
          const posCands = (el.allCandidates || []).filter(c => c.positionId === pos.id);
          if (posCands.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = 'color:var(--gray-400);font-size:.82rem;margin-bottom:.5rem';
            empty.textContent = 'No candidates';
            section.appendChild(empty);
          } else renderCands(posCands);
        });
      } else {
        renderCands(el.allCandidates || []);
      }

      container.appendChild(section);
    });
  } catch {
    document.getElementById('resultsContainer').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load results.</p></div>';
  }
}
