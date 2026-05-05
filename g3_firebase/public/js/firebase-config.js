// ─── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────────
// Get this from: Firebase Console → Project Settings → Your apps → Web app
const firebaseConfig = {
  apiKey: "AIzaSyD_yGkwppXQWH6c1cu7pC1Z-iGYhJfhYpo",
  authDomain: "nsuk-vote.firebaseapp.com",
  projectId: "nsuk-vote",
  storageBucket: "nsuk-vote.firebasestorage.app",
  messagingSenderId: "334517551345",
  appId: "1:334517551345:web:4fd38c502648720234e950"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();

// ─── Helpers ──────────────────────────────────────────────────────

// Get the current user's ID token (auto-refreshed by Firebase)
async function getToken() {
  const user = fbAuth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

// Authenticated fetch — adds Bearer token automatically
async function authFetch(url, options = {}) {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// Redirect if not logged in
function requireLogin(redirectTo) {
  return new Promise((resolve) => {
    fbAuth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = redirectTo;
      } else {
        resolve(user);
      }
    });
  });
}
