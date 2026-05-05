let currentElectionId = null;
let currentPositionId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Wait for Firebase Auth to confirm user
  fbAuth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = '/student'; return; }

    // Load profile
    try {
      const res = await authFetch('/api/student/me');
      const profile = await res.json();
      const name = profile.username || user.displayName || 'Student';
      document.getElementById('username').textContent  = name;
      document.getElementById('greetName').textContent = name;
      document.getElementById('userInitial').textContent = name.charAt(0).toUpperCase();
    } catch {
      document.getElementById('username').textContent  = user.displayName || 'Student';
      document.getElementById('greetName').textContent = user.displayName || 'there';
      document.getElementById('userInitial').textContent = (user.displayName || 'S').charAt(0).toUpperCase();
    }

    await loadElections();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fbAuth.signOut();
    window.location.href = '/student';
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('voteModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
});

function closeModal() { document.getElementById('voteModal').classList.remove('open'); }

async function loadElections() {
  try {
    const res = await authFetch('/api/student/elections');
    if (!res.ok) throw new Error();
    renderElections(await res.json());
  } catch {
    document.getElementById('electionsContainer').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load elections.</p></div>';
  }
}

function renderElections(elections) {
  const container = document.getElementById('electionsContainer');
  container.innerHTML = '';

  if (elections.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🗳️</div><p>No active elections right now. Check back later!</p></div>';
    return;
  }

  elections.forEach(el => {
    const section = document.createElement('div');
    section.className = 'election-section';
    section.style.marginBottom = '2.5rem';

    const hdr = document.createElement('div');
    hdr.className = 'election-section-title';
    hdr.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:1.1rem';
    hdr.innerHTML = `<h2 style="font-size:1.1rem;font-weight:800;color:var(--gray-800)">${el.name}</h2>
      <span class="section-badge">${el.type === 'positions' ? '🏛️ Positions' : '👤 Direct'}</span>
      <span class="yellow-accent">Active</span>`;
    section.appendChild(hdr);

    const grid = document.createElement('div');
    grid.className = 'categories-grid';

    if (el.type === 'positions') {
      if (!el.positions || el.positions.length === 0) {
        grid.innerHTML = '<p style="color:var(--gray-400);font-size:.88rem">No positions added yet.</p>';
      } else {
        el.positions.forEach(pos => {
          const card = document.createElement('div');
          card.className = 'category-card';
          if (pos.hasVoted) card.style.cssText = 'border-color:var(--green-mid);background:var(--green-light);cursor:default';
          card.innerHTML = `
            <div class="card-icon">🏛️</div>
            <h3>${pos.name}</h3>
            <p>${pos.candidatesCount} candidate${pos.candidatesCount !== 1 ? 's' : ''}</p>
            ${pos.hasVoted
              ? '<div class="voted-tick" style="display:inline-flex;align-items:center;gap:5px;margin-top:.75rem;font-size:.8rem;font-weight:700;color:var(--green-2)">✓ Voted</div>'
              : '<div class="card-cta">Vote →</div>'
            }`;
          if (!pos.hasVoted) card.addEventListener('click', () => openVoteModal(el.id, el.name, pos.id, pos.name));
          grid.appendChild(card);
        });
      }
    } else {
      const card = document.createElement('div');
      card.className = 'category-card';
      if (el.hasVoted) card.style.cssText = 'border-color:var(--green-mid);background:var(--green-light);cursor:default';
      card.innerHTML = `
        <div class="card-icon">👤</div>
        <h3>${el.name}</h3>
        <p>${el.candidatesCount} candidate${el.candidatesCount !== 1 ? 's' : ''}</p>
        ${el.hasVoted
          ? '<div class="voted-tick" style="display:inline-flex;align-items:center;gap:5px;margin-top:.75rem;font-size:.8rem;font-weight:700;color:var(--green-2)">✓ Voted</div>'
          : '<div class="card-cta">Cast Your Vote →</div>'
        }`;
      if (!el.hasVoted) card.addEventListener('click', () => openVoteModal(el.id, el.name, null, null));
      grid.appendChild(card);
    }

    section.appendChild(grid);
    container.appendChild(section);
  });
}

async function openVoteModal(electionId, electionName, positionId, positionName) {
  currentElectionId = electionId;
  currentPositionId = positionId;

  const title = positionName ? `${electionName} · ${positionName}` : electionName;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('candidatesList').innerHTML = '<p style="color:var(--gray-400);padding:1rem 0">Loading…</p>';
  document.getElementById('voteModal').classList.add('open');

  try {
    let url = `/api/student/candidates?electionId=${encodeURIComponent(electionId)}`;
    if (positionId) url += `&positionId=${encodeURIComponent(positionId)}`;
    const res = await authFetch(url);
    const { candidates, hasVoted } = await res.json();
    const list = document.getElementById('candidatesList');
    list.innerHTML = '';

    if (hasVoted) {
      const chip = document.createElement('div');
      chip.className = 'voted-chip'; chip.style.marginBottom = '14px';
      chip.textContent = '✓ You have already voted here';
      list.appendChild(chip);
    }

    if (candidates.length === 0) {
      list.innerHTML += '<div class="empty-state"><div class="empty-icon">👤</div><p>No candidates yet.</p></div>';
      return;
    }

    candidates.forEach(c => {
      const row = document.createElement('div');
      row.className = 'candidate-item';
      row.innerHTML = `
        <div class="candidate-info"><h4>${c.name}</h4><p>${c.info || ''}</p></div>
        <span class="vote-count-badge">${c.votes} vote${c.votes !== 1 ? 's' : ''}</span>
        ${hasVoted
          ? '<span class="voted-chip">✓ Voted</span>'
          : `<button class="btn-vote" data-id="${c.id}">Vote</button>`
        }`;
      if (!hasVoted) row.querySelector('.btn-vote').addEventListener('click', () => castVote(c.id));
      list.appendChild(row);
    });
  } catch {
    document.getElementById('candidatesList').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error loading.</p></div>';
  }
}

async function castVote(candidateId) {
  try {
    const body = { electionId: currentElectionId, candidateId };
    if (currentPositionId) body.positionId = currentPositionId;
    const res = await authFetch('/api/student/vote', {
      method: 'POST', body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      const titleText = document.getElementById('modalTitle').textContent;
      const parts = titleText.split(' · ');
      await openVoteModal(currentElectionId, parts[0], currentPositionId, parts[1] || null);
      await loadElections();
    } else {
      alert(data.message || 'Failed to record vote');
    }
  } catch { alert('An error occurred while voting'); }
}
