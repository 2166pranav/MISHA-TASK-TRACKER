# Misha Task Tracker — Local Full-Stack App

This project serves the existing vanilla HTML/CSS/JavaScript task tracker from an Express server. Accounts, tasks, folders, history, group-member lists, reminders, Karma, and profile data are stored server-side in a local JSON database.

## Requirements

- Node.js **20 or newer** (current LTS recommended)
- npm (installed with Node.js)

Check whether Node.js is already installed:

```powershell
node --version
npm --version
```

If `node` is not recognized, install the current Node.js LTS from [nodejs.org](https://nodejs.org/), reopen PowerShell, and run the version checks again.

## Start the application on Windows

Open PowerShell, change to the project directory, then install dependencies and start the server:

```powershell
cd "C:\Users\ASUS\Downloads\MISHA-TASK-TRACKER-current (4)\MISHA-TASK-TRACKER"
npm install
npm start
```

Keep that terminal open while using the app. Visit **http://localhost:3000** (or **http://localhost:3000/home.html**) in your browser. To stop the server, press **Ctrl+C** in PowerShell. For automatic restart while editing, use `npm run dev`.

If that folder is in a different location on your computer, change the `cd` path to the folder containing `package.json`.

## First use

1. Open the landing page and choose **Create an account**.
2. Register with a name, email, and password of at least 10 characters.
3. The app signs you in and opens Tasks. The browser receives an HTTP-only session cookie; passwords are stored as bcrypt hashes, never as plain text.
4. Use **Settings** to update your name/email, optionally change your password (current password required), upload a PNG/JPEG/WebP profile picture (maximum 5 MB), export your workspace, or sign out.

## Persistent data and configuration

- JSON database: `.tracker-data/tracker.json` (created after the first data mutation)
- Avatar uploads: `uploads/avatars/`
- Both locations are excluded from Git by `.gitignore`. Back up these files before moving/reinstalling the project; JSON export is also available in Settings.
- Optional environment variables: `PORT` (default `3000`), `HOST` (default `127.0.0.1`), `DATA_FILE`, and `AVATAR_DIR`.
- The default host is loopback-only. Do not expose this development server to a public network without production-grade deployment, TLS, and security review.

The app uses one local JSON file and is intended for a personal/local instance. It is not a multi-process database. Email delivery, password-reset email, and cross-account task collaboration are not configured; Group Tasks saves invitee email addresses to the signed-in account and clearly labels the copied link as a prototype. Reminder popups are checked while an authenticated tracker page is open; there is no operating-system push or separate scheduler while the browser is closed.

### Existing browser-only data

Previously saved data in the old browser `localStorage` is **not migrated automatically**. The new app starts with an empty server workspace for each account. Keep the old browser profile available if you need to recover prior tasks; do not clear its browser data until you have exported or otherwise preserved it.

## Tests

Run the automated parser, account, authorization, profile/avatar, group-member, history, reminder, task-normalization, and Karma regression suite:

```powershell
npm test
```

The tests use isolated temporary JSON databases and do not modify your live `.tracker-data` workspace.
