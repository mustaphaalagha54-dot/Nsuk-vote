// ─── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────────
// Firebase Console → Project Settings → Your apps → Web app
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

// ─── Authenticated fetch — sends Bearer token automatically ───────
async function authFetch(url, options = {}) {
  const user = fbAuth.currentUser;
  const token = user ? await user.getIdToken() : null;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
