require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');
const admin      = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Firebase Admin Init ──────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db   = admin.firestore();
const auth = admin.auth();

// ─── Middleware ───────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Middleware ──────────────────────────────────────────────
// Verifies Firebase ID token sent in Authorization: Bearer <token> header
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = await auth.verifyIdToken(header.split('Bearer ')[1]);
    req.uid   = decoded.uid;
    req.email = decoded.email;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Require admin role (stored as custom claim on Firebase Auth user)
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = await auth.verifyIdToken(header.split('Bearer ')[1]);
    if (!decoded.admin) return res.status(403).json({ message: 'Admin access required' });
    req.uid      = decoded.uid;
    req.email    = decoded.email;
    req.isAdmin  = true;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ─── PAGE ROUTES ──────────────────────────────────────────────────
app.get('/student',           (_, res) => res.sendFile(path.join(__dirname, 'views', 'student-portal.html')));
app.get('/student-dashboard', (_, res) => res.sendFile(path.join(__dirname, 'views', 'student-dashboard.html')));
app.get('/admin',             (_, res) => res.sendFile(path.join(__dirname, 'views', 'admin-portal.html')));
app.get('/admin-dashboard',   (_, res) => res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html')));
app.get('/',                  (_, res) => res.redirect('/student'));

// ─── STUDENT PROFILE ──────────────────────────────────────────────
// Called after Firebase Auth signup to save student profile in Firestore
app.post('/api/student/profile', requireAuth, async (req, res) => {
  const { studentId, username } = req.body;
  if (!studentId || !username)
    return res.status(400).json({ message: 'studentId and username are required' });
  try {
    // Check studentId not already taken
    const existing = await db.collection('students')
      .where('studentId', '==', studentId).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== req.uid)
      return res.status(400).json({ message: 'Student ID already in use' });

    await db.collection('students').doc(req.uid).set({
      studentId,
      username,
      email: req.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(201).json({ message: 'Profile saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save profile' });
  }
});

// Get current student profile
app.get('/api/student/me', requireAuth, async (req, res) => {
  try {
    const doc = await db.collection('students').doc(req.uid).get();
    if (!doc.exists) return res.status(404).json({ message: 'Profile not found' });
    res.json({ uid: req.uid, ...doc.data() });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── ADMIN SETUP ──────────────────────────────────────────────────
// Grants admin custom claim. Protected — only works if a secret header matches.
// Use this ONCE to make your first admin, then remove or protect this route.
app.post('/api/admin/grant', async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== process.env.ADMIN_GRANT_SECRET)
    return res.status(403).json({ message: 'Wrong secret' });
  try {
    await auth.setCustomUserClaims(uid, { admin: true });
    // Save admin profile to Firestore
    const userRecord = await auth.getUser(uid);
    await db.collection('admins').doc(uid).set({
      email: userRecord.email,
      displayName: userRecord.displayName || '',
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ message: `Admin claim granted to ${uid}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to grant admin' });
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

// ─── ELECTIONS (admin) ────────────────────────────────────────────

// Get all elections
app.get('/api/elections', async (req, res) => {
  try {
    const snap = await db.collection('elections').orderBy('createdAt', 'desc').get();
    const elections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(elections);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
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
  } catch {
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
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete election (also deletes all candidates + votes subcollections)
app.delete('/api/elections/:id', requireAdmin, async (req, res) => {
  try {
    const elRef = db.collection('elections').doc(req.params.id);

    // Delete candidates subcollection
    const candsSnap = await elRef.collection('candidates').get();
    const batch = db.batch();
    candsSnap.docs.forEach(d => batch.delete(d.ref));

    // Delete votes subcollection
    const votesSnap = await elRef.collection('votes').get();
    votesSnap.docs.forEach(d => batch.delete(d.ref));

    batch.delete(elRef);
    await batch.commit();
    res.json({ message: 'Election deleted' });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POSITIONS (positions-type elections) ─────────────────────────

// Add position
app.post('/api/elections/:id/positions', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Position name required' });
  try {
    const ref = db.collection('elections').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().type !== 'positions')
      return res.status(404).json({ message: 'Positions election not found' });

    const posId = `pos_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const positions = doc.data().positions || [];
    positions.push({ id: posId, name: name.trim() });
    await ref.update({ positions });
    res.status(201).json({ message: 'Position added', position: { id: posId, name: name.trim() } });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete position (and its candidates)
app.delete('/api/elections/:id/positions/:posId', requireAdmin, async (req, res) => {
  try {
    const ref = db.collection('elections').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Not found' });

    const positions = (doc.data().positions || []).filter(p => p.id !== req.params.posId);
    await ref.update({ positions });

    // Delete candidates for this position
    const candsSnap = await ref.collection('candidates')
      .where('positionId', '==', req.params.posId).get();
    const batch = db.batch();
    candsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    res.json({ message: 'Position deleted' });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── CANDIDATES ───────────────────────────────────────────────────

// Add candidate
// Body: { name, info, positionId? }
app.post('/api/elections/:id/candidates', requireAdmin, async (req, res) => {
  const { name, info, positionId } = req.body;
  if (!name) return res.status(400).json({ message: 'Candidate name required' });
  try {
    const elDoc = await db.collection('elections').doc(req.params.id).get();
    if (!elDoc.exists) return res.status(404).json({ message: 'Election not found' });
    if (elDoc.data().type === 'positions' && !positionId)
      return res.status(400).json({ message: 'positionId required for positions election' });

    const candData = {
      name: name.trim(),
      info: info || '',
      votes: 0,
      electionId: req.params.id,
      ...(positionId ? { positionId } : {}),
    };
    const ref = await db.collection('elections').doc(req.params.id)
      .collection('candidates').add(candData);
    res.status(201).json({ message: 'Candidate added', candidate: { id: ref.id, ...candData } });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete candidate
app.delete('/api/elections/:id/candidates/:candId', requireAdmin, async (req, res) => {
  try {
    await db.collection('elections').doc(req.params.id)
      .collection('candidates').doc(req.params.candId).delete();
    res.json({ message: 'Candidate deleted' });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── VOTING (student) ─────────────────────────────────────────────

// Get active elections for student view
app.get('/api/student/elections', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('elections')
      .where('active', '==', true).orderBy('createdAt', 'desc').get();

    const elections = await Promise.all(snap.docs.map(async d => {
      const el = { id: d.id, ...d.data() };

      // Get candidates
      const candSnap = await d.ref.collection('candidates').get();
      const candidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));

      // Check what the student has voted for
      const voteSnap = await d.ref.collection('votes')
        .where('voterId', '==', req.uid).get();
      const votedFor = voteSnap.docs.map(v => v.data().positionId || 'direct');

      if (el.type === 'positions') {
        el.positions = (el.positions || []).map(p => ({
          ...p,
          candidatesCount: candidates.filter(c => c.positionId === p.id).length,
          hasVoted: votedFor.includes(p.id),
        }));
      } else {
        el.candidatesCount = candidates.length;
        el.hasVoted = votedFor.includes('direct');
      }

      return el;
    }));

    res.json(elections);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get candidates for a specific election/position
app.get('/api/student/candidates', requireAuth, async (req, res) => {
  const { electionId, positionId } = req.query;
  try {
    const elDoc = await db.collection('elections').doc(electionId).get();
    if (!elDoc.exists || !elDoc.data().active)
      return res.status(404).json({ message: 'Election not found or inactive' });

    let query = db.collection('elections').doc(electionId).collection('candidates');
    if (positionId) query = query.where('positionId', '==', positionId);

    const candSnap = await query.get();
    const candidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));

    // Has this student already voted?
    const voteQuery = db.collection('elections').doc(electionId)
      .collection('votes').where('voterId', '==', req.uid);
    const voteSnap = positionId
      ? await voteQuery.where('positionId', '==', positionId).get()
      : await voteQuery.where('type', '==', 'direct').get();

    res.json({ candidates, hasVoted: !voteSnap.empty });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Cast a vote
// Body: { electionId, candidateId, positionId? }
app.post('/api/student/vote', requireAuth, async (req, res) => {
  const { electionId, candidateId, positionId } = req.body;
  try {
    const elRef   = db.collection('elections').doc(electionId);
    const elDoc   = await elRef.get();
    if (!elDoc.exists || !elDoc.data().active)
      return res.status(403).json({ message: 'Election is not active' });

    // Check already voted (using a unique vote doc keyed by voter+position)
    const voteKey = positionId ? `${req.uid}_${positionId}` : `${req.uid}_direct`;
    const voteRef = elRef.collection('votes').doc(voteKey);
    const voteDoc = await voteRef.get();
    if (voteDoc.exists)
      return res.status(400).json({ message: 'You have already voted here' });

    // Increment candidate votes + record vote atomically
    const candRef = elRef.collection('candidates').doc(candidateId);
    await db.runTransaction(async t => {
      const candDoc = await t.get(candRef);
      if (!candDoc.exists) throw new Error('Candidate not found');
      t.update(candRef, { votes: (candDoc.data().votes || 0) + 1 });
      t.set(voteRef, {
        voterId:     req.uid,
        candidateId,
        electionId,
        positionId:  positionId || null,
        type:        positionId ? 'position' : 'direct',
        votedAt:     admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    res.json({ message: 'Vote recorded successfully' });
  } catch (err) {
    if (err.message === 'Candidate not found')
      return res.status(404).json({ message: 'Candidate not found' });
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── RESULTS (admin) ──────────────────────────────────────────────
app.get('/api/elections/:id/results', requireAdmin, async (req, res) => {
  try {
    const elDoc   = await db.collection('elections').doc(req.params.id).get();
    if (!elDoc.exists) return res.status(404).json({ message: 'Not found' });

    const candSnap = await db.collection('elections').doc(req.params.id)
      .collection('candidates').orderBy('votes', 'desc').get();
    const candidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));

    const voteSnap = await db.collection('elections').doc(req.params.id)
      .collection('votes').get();

    res.json({
      election:   { id: elDoc.id, ...elDoc.data() },
      candidates,
      totalVotes: voteSnap.size,
    });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all elections with full candidate+vote data for results dashboard
app.get('/api/results', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('elections').orderBy('createdAt', 'desc').get();
    const results = await Promise.all(snap.docs.map(async d => {
      const el = { id: d.id, ...d.data() };
      const candSnap = await d.ref.collection('candidates').get();
      el.allCandidates = candSnap.docs.map(c => ({ id: c.id, ...c.data() }));
      const voteSnap = await d.ref.collection('votes').get();
      el.totalVotes = voteSnap.size;
      return el;
    }));
    res.json(results);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🗳️  Vota Running`);
  console.log(`─────────────────────────────`);
  console.log(`   Student:  http://localhost:${PORT}/student`);
  console.log(`   Admin:    http://localhost:${PORT}/admin`);
  console.log(`─────────────────────────────\n`);
});

module.exports = app;
