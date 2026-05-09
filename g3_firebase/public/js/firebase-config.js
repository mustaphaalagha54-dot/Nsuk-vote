// ─── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────────
// Get this from: Firebase Console → Project Settings → Your apps → Web app
const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY",
  authDomain:        "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "PASTE_YOUR_PROJECT_ID",
  storageBucket:     "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId:             "PASTE_YOUR_APP_ID",
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
