let currentElectionId = null;
let currentPositionId = null;

// Inline SVGs for JS-generated content
const IC = {
  arrow:   `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  check:   `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  vote:    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  users:   `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  layout:  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  star:    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  warn:    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  empty:   `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
};

const CARD_ICONS = [IC.vote, IC.layout, IC.users, IC.star];

document.addEventListener('DOMContentLoaded', () => {
  fbAuth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = '/student'; return; }

    // Reload user to get latest auth profile
    try { await user.reload(); } catch (e) { console.warn('reload failed', e); }
    const freshUser = fbAuth.currentUser;

    // Fetch name — Firestore first, fallback to Auth displayName
    let name = 'Student';
    try {
      const fsdb = firebase.firestore();
      const doc  = await fsdb.collection('students').doc(freshUser.uid).get();
      if (doc.exists && doc.data().username) {
        name = doc.data().username;
      } else if (freshUser.displayName) {
        name = freshUser.displayName;
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      if (freshUser.displayName) name = freshUser.displayName;
    }

    document.getElementById('username').textContent    = name;
    document.getElementById('greetName').textContent   = name;
    document.getElementById('userInitial').textContent = name.charAt(0).toUpperCase();

    await loadElections();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fbAuth.signOut(); window.location.href = '/student';
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('voteModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});

function closeModal() { document.getElementById('voteModal').classList.remove('open'); }

async function loadElections() {
  try {
    const res = await authFetch('/api/student/elections');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed');
    const elections = await res.json();
    updateStats(elections);
    renderElections(elections);
  } catch (err) {
    document.getElementById('electionsContainer').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${IC.warn}</div>
        <h4>Could not load elections</h4>
        <p>${err.message}</p>
      </div>`;
  }
}

function updateStats(elections) {
  const strip = document.getElementById('dashStats');
  let totalVoted = 0, totalPending = 0;
  elections.forEach(el => {
    if (el.type === 'positions') {
      (el.positions || []).forEach(p => { p.hasVoted ? totalVoted++ : totalPending++; });
    } else {
      el.hasVoted ? totalVoted++ : totalPending++;
    }
  });
  document.getElementById('statActive').textContent  = elections.length;
  document.getElementById('statVoted').textContent   = totalVoted;
  document.getElementById('statPending').textContent = totalPending;
  strip.style.display = elections.length > 0 ? 'flex' : 'none';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderElections(elections) {
  const container = document.getElementById('electionsContainer');
  container.innerHTML = '';

  if (elections.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${IC.empty}</div>
        <h4>No active elections</h4>
        <p>There are no active elections right now. Check back later!</p>
      </div>`;
    return;
  }

  elections.forEach((el, elIdx) => {
    const section = document.createElement('div');
    section.className = 'election-section';
    section.style.marginBottom = '2.5rem';

    const hdr = document.createElement('div');
    hdr.className = 'section-header';
    hdr.innerHTML = `
      <h3>${el.name}</h3>
      <span class="section-badge">${el.type === 'positions' ? 'Positions' : 'Direct'}</span>
      <span class="yellow-accent">Active</span>`;
    section.appendChild(hdr);

    const grid = document.createElement('div');
    grid.className = 'categories-grid';

    if (el.type === 'positions') {
      if (!el.positions || el.positions.length === 0) {
        grid.innerHTML = `<p style="color:var(--gray-400);font-size:.88rem">No positions added yet.</p>`;
      } else {
        el.positions.forEach((pos, i) => {
          const card = document.createElement('div');
          card.className = 'category-card';
          if (pos.hasVoted) {
            card.style.cssText = 'border-color:rgba(45,158,87,0.35);background:rgba(232,247,239,0.7);cursor:default';
          }
          card.innerHTML = `
            <div class="card-icon">${CARD_ICONS[i % CARD_ICONS.length]}</div>
            <h3>${pos.name}</h3>
            <p>${pos.candidatesCount} candidate${pos.candidatesCount !== 1 ? 's' : ''} running</p>
            ${pos.hasVoted
              ? `<div class="voted-tick">${IC.check} Vote Cast</div>`
              : `<div class="card-cta">${IC.arrow} Cast Vote</div>`
            }`;
          if (!pos.hasVoted) card.addEventListener('click', () => openVoteModal(el.id, el.name, pos.id, pos.name));
          grid.appendChild(card);
        });
      }
    } else {
      const card = document.createElement('div');
      card.className = 'category-card';
      if (el.hasVoted) {
        card.style.cssText = 'border-color:rgba(45,158,87,0.35);background:rgba(232,247,239,0.7);cursor:default';
      }
      card.innerHTML = `
        <div class="card-icon">${IC.users}</div>
        <h3>${el.name}</h3>
        <p>${el.candidatesCount} candidate${el.candidatesCount !== 1 ? 's' : ''} running</p>
        ${el.hasVoted
          ? `<div class="voted-tick">${IC.check} Vote Cast</div>`
          : `<div class="card-cta">${IC.arrow} Cast Vote</div>`
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
  document.getElementById('modalTitle').textContent = positionName ? `${electionName} · ${positionName}` : electionName;
  document.getElementById('candidatesList').innerHTML = `<p style="color:var(--gray-400);padding:1rem 0">Loading candidates…</p>`;
  document.getElementById('voteModal').classList.add('open');

  try {
    let url = `/api/student/candidates?electionId=${encodeURIComponent(electionId)}`;
    if (positionId) url += `&positionId=${encodeURIComponent(positionId)}`;
    const res = await authFetch(url);
    if (!res.ok) throw new Error('Failed to load');
    const { candidates, hasVoted } = await res.json();
    const list = document.getElementById('candidatesList');
    list.innerHTML = '';

    if (hasVoted) {
      const chip = document.createElement('div');
      chip.className = 'voted-chip'; chip.style.marginBottom = '14px';
      chip.innerHTML = `${IC.check} You have already voted here`;
      list.appendChild(chip);
    }

    if (candidates.length === 0) {
      list.innerHTML += `<div class="empty-state" style="padding:1.5rem">
        <div class="empty-icon">${IC.warn}</div><p>No candidates in this category yet.</p></div>`;
      return;
    }

    candidates.forEach(c => {
      const row = document.createElement('div');
      row.className = 'candidate-item';
      row.innerHTML = `
        <div class="candidate-info"><h4>${c.name}</h4><p>${c.info || 'No additional info'}</p></div>
        <span class="vote-count-badge">${c.votes} vote${c.votes !== 1 ? 's' : ''}</span>
        ${hasVoted
          ? `<span class="voted-chip" style="font-size:.72rem;padding:5px 11px">${IC.check} Voted</span>`
          : `<button class="btn-vote" data-id="${c.id}">${IC.arrow} Vote</button>`
        }`;
      if (!hasVoted) row.querySelector('.btn-vote').addEventListener('click', () => castVote(c.id));
      list.appendChild(row);
    });
  } catch (err) {
    document.getElementById('candidatesList').innerHTML =
      `<div class="empty-state"><div class="empty-icon">${IC.warn}</div><p>${err.message}</p></div>`;
  }
}

async function castVote(candidateId) {
  try {
    const body = { electionId: currentElectionId, candidateId };
    if (currentPositionId) body.positionId = currentPositionId;
    const res  = await authFetch('/api/student/vote', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      const parts = document.getElementById('modalTitle').textContent.split(' · ');
      await openVoteModal(currentElectionId, parts[0], currentPositionId, parts[1] || null);
      await loadElections();
    } else {
      alert(data.message || 'Failed to record vote');
    }
  } catch { alert('An error occurred while voting'); }
}
