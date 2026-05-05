# Vota — Setup Guide
## Firebase + Vercel Deployment

---

## STEP 1 — Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it (e.g. `vota-voting`) → Continue → Disable Google Analytics (optional) → **Create project**

---

## STEP 2 — Enable Firebase Authentication

1. In your project sidebar: **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in method**, click **Email/Password**
4. Toggle **Enable** → **Save**

---

## STEP 3 — Create the Firestore Database

1. Sidebar: **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → Next
4. Select a region (pick closest to your users, e.g. `europe-west1`) → **Enable**
5. Once created, go to the **Rules** tab and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Students can read their own profile, write only to create it
    match /students/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Elections: public read for active, admin-only write
    match /elections/{elId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;

      // Candidates: authenticated read, admin write
      match /candidates/{candId} {
        allow read: if request.auth != null;
        allow write: if request.auth.token.admin == true;
      }

      // Votes: student can create their own vote (no update/delete)
      match /votes/{voteId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null
          && request.resource.data.voterId == request.auth.uid;
        allow update, delete: if false;
      }
    }

    // Admins collection: admin only
    match /admins/{uid} {
      allow read, write: if request.auth.token.admin == true;
    }
  }
}
```

6. Click **Publish**

---

## STEP 4 — Get Your Firebase Config (for the frontend)

1. Sidebar: **Project Settings** (gear icon) → **General** tab
2. Scroll to **"Your apps"** → click **"</> Web"**
3. Register the app (name it anything) → you'll see a config block like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

4. Open `public/js/firebase-config.js` in your code and **paste your values** replacing the placeholders.

---

## STEP 5 — Get Your Service Account Key (for the backend)

1. **Project Settings** → **Service accounts** tab
2. Click **"Generate new private key"** → **Generate key**
3. A JSON file downloads. Open it — you need these three values:
   - `project_id`
   - `client_email`
   - `private_key`

---

## STEP 6 — Deploy to Vercel

### First time setup:

1. Go to **https://vercel.com** → Sign up (use GitHub recommended)
2. Push your project to a GitHub repo (or use Vercel CLI)
3. In Vercel dashboard → **"Add New Project"** → Import your repo
4. Framework Preset: **Other**
5. Root Directory: leave as `/`
6. **Before deploying**, go to **Environment Variables** and add:

| Variable Name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | Your `project_id` from the JSON |
| `FIREBASE_CLIENT_EMAIL` | Your `client_email` from the JSON |
| `FIREBASE_PRIVATE_KEY` | Your `private_key` (the full `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` string) |
| `ADMIN_GRANT_SECRET` | A secret password YOU make up (e.g. `my-super-secret-2025`) |
| `NODE_ENV` | `production` |

7. Click **Deploy**
8. Vercel gives you a URL like `https://vota-xyz.vercel.app`

### Redeploys:
Every time you push to GitHub, Vercel auto-redeploys. That's it.

---

## STEP 7 — Create Your First Admin Account

This is a ONE-TIME setup after deployment.

### 7a. Create the admin Firebase Auth account
1. Go to Firebase Console → **Authentication → Users**
2. Click **"Add user"**
3. Enter the admin email + password → **Add user**
4. Copy the **User UID** shown in the list

### 7b. Grant the admin role
Call this API endpoint ONCE using your browser or any REST client:

```
POST https://your-vercel-url.vercel.app/api/admin/grant
Content-Type: application/json

{
  "uid": "PASTE_THE_UID_FROM_STEP_7a",
  "secret": "your-ADMIN_GRANT_SECRET-from-step-6"
}
```

**Easiest way** — paste this in your browser console (on any page):
```js
fetch('https://your-vercel-url.vercel.app/api/admin/grant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: 'PASTE_UID_HERE',
    secret: 'PASTE_YOUR_SECRET_HERE'
  })
}).then(r => r.json()).then(console.log)
```

You should see: `{ "message": "Admin claim granted to UID" }`

### 7c. Log in to admin portal
Go to `https://your-vercel-url.vercel.app/admin` and sign in with the email + password from 7a.

---

## STEP 8 — Student Signup

Students go to `https://your-vercel-url.vercel.app/student` and create their own accounts.
- They sign up with email, password, student ID, and full name
- Their profile is saved to Firestore automatically
- Votes are tracked by Firebase UID — one vote per position per student, enforced in the database

---

## Your App URLs

| Page | URL |
|---|---|
| Student login/signup | `/student` |
| Student dashboard | `/student-dashboard` |
| Admin login | `/admin` |
| Admin dashboard | `/admin-dashboard` |

---

## Firestore Data Structure

```
elections/
  {electionId}/
    name, type, active, createdAt, createdBy
    positions: [...] (array, positions-type only)
    
    candidates/
      {candidateId}/
        name, info, votes, electionId, positionId?
    
    votes/
      {voterId_positionId}/         ← unique per student per position
        voterId, candidateId, electionId, positionId, type, votedAt

students/
  {uid}/
    studentId, username, email, createdAt

admins/
  {uid}/
    email, displayName, grantedAt
```

---

## Local Development

1. Copy `.env.example` to `.env` and fill in your Firebase values
2. Run:
```bash
npm install
npm run dev
```
3. App runs at `http://localhost:5000`
