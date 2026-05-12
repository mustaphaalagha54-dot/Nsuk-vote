require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');
const admin      = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Firebase Admin Init ───────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db   = admin.firestore();
const auth = admin.auth();

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth helpers ──────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ message: 'Not authenticated' });
  try {
    const decoded = await auth.verifyIdToken(header.split('Bearer ')[1]);
    req.uid   = decoded.uid;
    req.email = decoded.email;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ message: 'Not authenticated' });
  try {
    const decoded = await auth.verifyIdToken(header.split('Bearer ')[1]);
    if (!decoded.admin)
      return res.status(403).json({ message: 'Admin access required' });
    req.uid   = decoded.uid;
    req.email = decoded.email;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ── Page routes ───────────────────────────────────────────
app.get('/student',           (_, res) => res.sendFile(path.join(__dirname, 'views', 'student-portal.html')));
app.get('/student-dashboard', (_, res) => res.sendFile(path.join(__dirname, 'views', 'student-dashboard.html')));
app.get('/admin',             (_, res) => res.sendFile(path.join(__dirname, 'views', 'admin-portal.html')));
app.get('/admin-dashboard',   (_, res) => res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html')));
app.get('/',                  (_, res) => res.redirect('/student'));

// ── Student profile ───────────────────────────────────────
// Save profile after Firebase Auth signup
app.post('/api/student/profile', requireAuth, async (req, res) => {
  const { studentId, username } = req.body;
  if (!studentId || !username)
    return res.status(400).json({ message: 'studentId and username are required' });
  try {
    // Check studentId not already taken by someone else
    const existing = await db.collection('students')
      .where('studentId', '==', studentId).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== req.uid)
      return res.status(400).json({ message: 'Student ID already in use' });

    await db.collection('students').doc(req.uid).set({
      studentId,
      username,
      email: req.email || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(201).json({ message: 'Profile saved' });
  } catch (err) {
    console.error('profile save error:', err);
    res.status(500).json({ message: 'Failed to save profile', detail: err.message });
  }
});

// Get student profile — returns basic info even if Firestore profile missing
app.get('/api/student/me', requireAuth, async (req, res) => {
  try {
    const doc = await db.collection('students').doc(req.uid).get();
    if (!doc.exists) {
      // Profile not in Firestore yet — return basic info from Auth token
      return res.json({ uid: req.uid, email: req.email, username: '', studentId: '' });
    }
    res.json({ uid: req.uid, ...doc.data() });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Admin grant ───────────────────────────────────────────
app.post('/api/admin/grant', async (req, res) => {
  const { uid, secret } = req.body;
  if (!secret || secret !== process.env.ADMIN_GRANT_SECRET)
    return res.status(403).json({ message: 'Wrong secret' });
  if (!uid)
    return res.status(400).json({ message: 'uid is required' });
  try {
    await auth.setCustomUserClaims(uid, { admin: true });
    const userRecord = await auth.getUser(uid);
    await db.collection('admins').doc(uid).set({
      email:       userRecord.email,
      displayName: userRecord.displayName || userRecord.email,
      grantedAt:   admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ message: `Admin granted to ${userRecord.email}` });
  } catch (err) {
    console.error('grant error:', err);
    res.status(500).json({ message: 'Failed to grant admin', detail: err.message });
  }
});

// Get admin profile
app.get('/api/admin/me', requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('admins').doc(req.uid).get();
    res.json({ uid: req.uid, email: req.email, ...doc.data() });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Elections (admin CRUD) ────────────────────────────────

// Get all elections — NO compound query, avoids needing a Firestore index
app.get('/api/elections', async (req, res) => {
  try {
    const snap = await db.collection('elections').get();
    const elections = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
    res.json(elections);
  } catch (err) {
    console.error('elections get error:', err);
    res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
});

// Create election
app.post('/api/elections', requireAdmin, async (req, res) => {
  const { name, type } = req.body;
  if (!name || !['positions', 'direct'].includes(type))
    return res.status(400).json({ message: 'Name and valid type required' });
  try {
    const data = {
      name: name.trim(),
      type,
      active: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.uid,
      ...(type === 'positions' ? { positions: [] } : {}),
    };
    const ref = await db.collection('elections').add(data);
    res.status(201).json({ message: 'Election created', election: { id: ref.id, ...data } });
  } catch (err) {
    console.error('create election error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Toggle active/closed
app.patch('/api/elections/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const ref = db.collection('elections').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Not found' });
    const newActive = !doc.data().active;
    await ref.update({ active: newActive });
    res.json({ active: newActive });
  } catch (err) {
    console.error('toggle error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete election + all subcollections
app.delete('/api/elections/:id', requireAdmin, async (req, res) => {
  try {
    const elRef    = db.collection('elections').doc(req.params.id);
    const batch    = db.batch();
    const candsSnap = await elRef.collection('candidates').get();
    const votesSnap = await elRef.collection('votes').get();
    candsSnap.docs.forEach(d => batch.delete(d.ref));
    votesSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(elRef);
    await batch.commit();
    res.json({ message: 'Election deleted' });
  } catch (err) {
    console.error('delete election error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Positions ─────────────────────────────────────────────

app.post('/api/elections/:id/positions', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Position name required' });
  try {
    const ref = db.collection('elections').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().type !== 'positions')
      return res.status(404).json({ message: 'Positions election not found' });
    const posId     = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const positions = doc.data().positions || [];
    positions.push({ id: posId, name: name.trim() });
    await ref.update({ positions });
    res.status(201).json({ message: 'Position added', position: { id: posId, name: name.trim() } });
  } catch (err) {
    console.error('add position error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/elections/:id/positions/:posId', requireAdmin, async (req, res) => {
  try {
    const ref       = db.collection('elections').doc(req.params.id);
    const doc       = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Not found' });
    const positions = (doc.data().positions || []).filter(p => p.id !== req.params.posId);
    await ref.update({ positions });
    // Delete candidates for this position
    const snap  = await ref.collection('candidates').where('positionId', '==', req.params.posId).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ message: 'Position deleted' });
  } catch (err) {
    console.error('delete position error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Candidates ────────────────────────────────────────────

app.post('/api/elections/:id/candidates', requireAdmin, async (req, res) => {
  const { name, info, positionId } = req.body;
  if (!name) return res.status(400).json({ message: 'Candidate name required' });
  try {
    const elDoc = await db.collection('elections').doc(req.params.id).get();
    if (!elDoc.exists) return res.status(404).json({ message: 'Election not found' });
    if (elDoc.data().type === 'positions' && !positionId)
      return res.status(400).json({ message: 'positionId required' });
    const candData = {
      name: name.trim(), info: info || '', votes: 0,
      electionId: req.params.id,
      ...(positionId ? { positionId } : {}),
    };
    const ref = await db.collection('elections').doc(req.params.id)
      .collection('candidates').add(candData);
    res.status(201).json({ message: 'Candidate added', candidate: { id: ref.id, ...candData } });
  } catch (err) {
    console.error('add candidate error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/elections/:id/candidates/:candId', requireAdmin, async (req, res) => {
  try {
    await db.collection('elections').doc(req.params.id)
      .collection('candidates').doc(req.params.candId).delete();
    res.json({ message: 'Candidate deleted' });
  } catch (err) {
    console.error('delete candidate error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Student voting ────────────────────────────────────────

// Get active elections — simple get + filter in JS, no compound index needed
app.get('/api/student/elections', requireAuth, async (req, res) => {
  try {
    const snap      = await db.collection('elections').get();
    const allEls    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const activeEls = allEls
      .filter(e => e.active)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    const result = await Promise.all(activeEls.map(async el => {
      const candSnap   = await db.collection('elections').doc(el.id).collection('candidates').get();
      const candidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));
      const voteSnap   = await db.collection('elections').doc(el.id)
        .collection('votes').where('voterId', '==', req.uid).get();
      const votedKeys  = voteSnap.docs.map(v => v.data().positionId || 'direct');

      if (el.type === 'positions') {
        el.positions = (el.positions || []).map(p => ({
          ...p,
          candidatesCount: candidates.filter(c => c.positionId === p.id).length,
          hasVoted:        votedKeys.includes(p.id),
        }));
      } else {
        el.candidatesCount = candidates.length;
        el.hasVoted        = votedKeys.includes('direct');
      }
      return el;
    }));

    res.json(result);
  } catch (err) {
    console.error('student elections error:', err);
    res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
});

// Get candidates for a specific election/position
app.get('/api/student/candidates', requireAuth, async (req, res) => {
  const { electionId, positionId } = req.query;
  try {
    const elDoc = await db.collection('elections').doc(electionId).get();
    if (!elDoc.exists || !elDoc.data().active)
      return res.status(404).json({ message: 'Election not found or inactive' });

    // Get candidates — filter by positionId in JS to avoid needing an index
    const candSnap   = await db.collection('elections').doc(electionId).collection('candidates').get();
    const candidates = candSnap.docs
      .map(c => ({ id: c.id, ...c.data() }))
      .filter(c => positionId ? c.positionId === positionId : !c.positionId);

    // Check if already voted
    const voteKey  = positionId ? `${req.uid}_${positionId}` : `${req.uid}_direct`;
    const voteDoc  = await db.collection('elections').doc(electionId).collection('votes').doc(voteKey).get();

    res.json({ candidates, hasVoted: voteDoc.exists });
  } catch (err) {
    console.error('candidates error:', err);
    res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
});

// Cast a vote
app.post('/api/student/vote', requireAuth, async (req, res) => {
  const { electionId, candidateId, positionId } = req.body;
  try {
    const elRef = db.collection('elections').doc(electionId);
    const elDoc = await elRef.get();
    if (!elDoc.exists || !elDoc.data().active)
      return res.status(403).json({ message: 'Election is not active' });

    const voteKey = positionId ? `${req.uid}_${positionId}` : `${req.uid}_direct`;
    const voteRef = elRef.collection('votes').doc(voteKey);
    const candRef = elRef.collection('candidates').doc(candidateId);

    await db.runTransaction(async t => {
      const [voteDoc, candDoc] = await Promise.all([t.get(voteRef), t.get(candRef)]);
      if (voteDoc.exists)  throw Object.assign(new Error('Already voted'), { code: 'ALREADY_VOTED' });
      if (!candDoc.exists) throw Object.assign(new Error('Candidate not found'), { code: 'NOT_FOUND' });
      t.update(candRef, { votes: (candDoc.data().votes || 0) + 1 });
      t.set(voteRef, {
        voterId:    req.uid,
        candidateId,
        electionId,
        positionId: positionId || null,
        type:       positionId ? 'position' : 'direct',
        votedAt:    admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    res.json({ message: 'Vote recorded successfully' });
  } catch (err) {
    if (err.code === 'ALREADY_VOTED')
      return res.status(400).json({ message: 'You have already voted here' });
    if (err.code === 'NOT_FOUND')
      return res.status(404).json({ message: 'Candidate not found' });
    console.error('vote error:', err);
    res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
});

// ── Results (admin) ───────────────────────────────────────


// ── Per-election candidates (used by manage modal) ────────

app.get('/api/elections/:id/results', requireAdmin, async (req, res) => {
  try {
    const elDoc = await db.collection('elections').doc(req.params.id).get();
    if (!elDoc.exists) return res.status(404).json({ message: 'Election not found' });

    const candSnap   = await db.collection('elections').doc(req.params.id)
      .collection('candidates').get();
    const candidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));

    const voteSnap = await db.collection('elections').doc(req.params.id)
      .collection('votes').get();

    res.json({
      election:   { id: elDoc.id, ...elDoc.data() },
      candidates,
      totalVotes: voteSnap.size,
    });
  } catch (err) {
    console.error('election results error:', err);
    res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
});

app.get('/api/results', requireAdmin, async (req, res) => {
  try {
    const snap    = await db.collection('elections').get();
    const results = await Promise.all(snap.docs.map(async d => {
      const el         = { id: d.id, ...d.data() };
      const candSnap   = await d.ref.collection('candidates').get();
      el.allCandidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));
      const voteSnap   = await d.ref.collection('votes').get();
      el.totalVotes    = voteSnap.size;
      return el;
    }));
    results.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json(results);
  } catch (err) {
    console.error('results error:', err);
    res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🗳️  Vota`);
  console.log(`   Student:  http://localhost:${PORT}/student`);
  console.log(`   Admin:    http://localhost:${PORT}/admin\n`);
});

module.exports = app;
