# Implementation Notes

The task tracker now runs as a **local full-stack Express application**. The frontend remains vanilla HTML/CSS/JavaScript; `server.js` serves the pages and authenticated REST API routes. Persistent user data is stored in an atomic JSON file rather than browser `localStorage`.

## Included features

- Bcrypt-backed account registration and login; opaque HTTP-only session cookies; sign-out and rate-limited authentication routes.
- Per-account tasks, folders, history, rewards/Karma, and group-member lists, isolated by the authenticated server session.
- Profile editing for name/email and optional password change, plus validated PNG/JPEG/WebP avatar upload handled by Multer.
- API-backed dashboard statistics, Today/Upcoming filters, calendar, history, group-member pages, backup export, and clear-workspace action.
- Backend reminder polling: scheduled alerts, lead-time reminders, missed-occurrence Karma deductions, and history audit entries are persisted by the server.
- Existing calendar/time-blocking, recurring schedule parser, title activity icons, voice dictation, history controls, and layout switching remain in the frontend.

## Run and verify

See [`README.md`](README.md) for Node.js requirements, exact Windows PowerShell commands, local data locations, account setup, and limitations. Run the full suite with:

```bash
npm test
```

The Group Tasks area stores email addresses in the current account but does not send invitation emails or provide cross-account collaborative task synchronization. Existing data previously stored in browser `localStorage` is not imported automatically.
