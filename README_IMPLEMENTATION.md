# Task Tracker Scheduling Upgrade

This static HTML/CSS/JavaScript app extends the earlier task-tracker upgrade while retaining existing per-user `localStorage` task records. The original task key is unchanged; new schedule fields are normalized when older records load.

## Scheduling features

- **Five-day upcoming view and Today view:** The calendar uses CSS Grid with a 12 AM–11 PM vertical timeline. Today view summarizes task count and total hours of timed work.
- **All-day tasks:** Untimed tasks appear in a separate row. More than two per day collapse behind a “more” control.
- **Time blocks:** Scheduled tasks show start time and duration, priority-colored left accents, a current-time line, and overlap-aware columns. Drag a block to a different date/time to reschedule it; drag the bottom handle to resize in 15-minute increments. Double-click a block to edit it.
- **Natural-language scheduling:** The schedule field accepts phrases such as `tomorrow at 7:30` and `every other day at 7:30`. `chrono-node` v2.10.2 is imported from a pinned jsDelivr ESM URL for date/time parsing; recurrence rules are interpreted locally. A smaller fallback parser covers common date/time phrases if the CDN is unavailable.
- **Duration shortcut:** Add `!30m`, `!1h`, or `!1h30m` to the task title. The shortcut is removed from the saved title and shown as a duration pill. Timed tasks default to 60 minutes.
- **Reminders:** Choose a reminder lead time at task creation or edit. The shared client-side checker polls every 15 seconds while a main app page is open, catches scheduled start times within a five-minute grace window, shows a prominent dismissible in-app alert, and attempts a soft two-tone chime. Lead-time reminders remain available. Alert occurrence keys persist with the task to avoid repeats. This static app cannot run while closed; durable background notifications require a service worker plus a backend/push subscription or a server scheduler. Audio is best-effort and browser autoplay policy may suppress it.
- **Description dictation:** The create and edit description textareas have their own Web Speech API microphone controls, distinct from the task-title microphone. Captured speech appends to the description; unsupported browsers and speech errors show a hint. Speech recognition requires a supported browser and microphone permission, typically over HTTPS or localhost.
- **History management:** The History page supports per-entry checkboxes, Select all/Deselect all, confirmation-gated Delete Selected, and confirmation-gated Clear All History. These actions update only the current user's history key; tasks, folders, and rewards remain untouched.
- **Missed-task Karma:** An incomplete task loses 5 Karma once for each missed scheduled occurrence. Timed tasks use their scheduled start as the deadline; all-day tasks use the end of their due date. Recurring occurrences are tracked independently. Late completion is evaluated using `completedAt`; penalties are audited in history and the total cannot fall below zero. Evaluation catches up on the next open Tasker page, but cannot execute while the static app is closed.
- **Recurrence currently supported:** daily, every other day, every N days, weekly, and weekdays. Dragging a recurring block re-anchors the series. Recurrence end dates/exceptions are not yet modeled.

## Task-list view controls

- The top-right **View** menu switches the main task area among **List**, **Board**, and **Calendar** without navigating to another page. Calendar offers **Week** and **Month** grids, a **Future occurrences** toggle, previous/next navigation, and a Today shortcut. Calendar items can be dragged to another date; clicking one opens the task editor.
- The menu's **Filter by** controls cover assignee, due-date presets/custom date, priority, and labels (categories, folders, and task labels), alongside task status. Assignee choices are populated from task data; this project does not currently include an assignment editor.
- List rows show a title/activity icon, priority and folder, description (or first subtask), and compact date/time/status pills. Clicking a date pill opens the browser's native date picker; changing a date re-anchors a recurring series and preserves the scheduled time.

## Activity-based title icons

Task titles receive a keyword-matched emoji from a shared JavaScript dictionary (for example, groceries, dentist, yoga, meetings, coding, and reading). Matching is case-insensitive, uses word boundaries, and falls back to a checkmark for unmatched titles. The emoji is decorative and appears only within task-title text in the list, Kanban cards, dashboard recent tasks, and calendar entries; it is not stored in the task name or added to category/status/navigation labels. The add/edit title fields show a live matching preview as the text changes.

## Run locally

Serve this folder with any static web server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/home.html` or `tasks.html`. Notification permission is generally available on localhost or HTTPS, not on arbitrary `file://` pages.

Run the automated scheduling, reminder, selective-history, and Karma-penalty tests with:

```bash
node --test tests/*.test.cjs
```

## Data and limitations

- Task data remains local to each browser/profile; there is no backend synchronization. Vercel preview URLs have a different origin from production and therefore do not share localStorage.
- Calendar and parsed times use the browser’s local timezone. Existing untimed tasks remain all-day tasks.
- Browser alerts, audio, and speech recognition are subject to browser support, permissions, and power-saving behavior. Reminder checks require a Tasker page to remain open.
- Chrono, icons, fonts, SortableJS, Chart.js, and the confetti effect are loaded from CDNs. Schedule parsing has a small fallback, but other optional effects may be unavailable offline.
- The current reminder implementation is client-side only. Durable background notifications require a service worker plus a backend/push subscription or a server scheduler.
