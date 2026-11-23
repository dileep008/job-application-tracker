# Shortlist · Job Application Tracker

Shortlist keeps job openings, interview stages, and follow-up dates on one board. It runs entirely in the browser with HTML, CSS, and vanilla JavaScript.

## Run locally

Clone the repository, then start a static server from the project directory.

```sh
git clone https://github.com/dileep008/job-application-tracker.git
cd job-application-tracker
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>. Use the same address and browser profile on future visits to return to your saved workspace.

## Try the workflow

1. Choose **Explore demo board** to try the app with seven fictional roles, or select **Add application** in your own workspace.
2. Enter a company and job title. Choose a stage and optionally add a job posting, notes, or a follow-up date.
3. Open a card to edit it. Move it through **Saved**, **Applied**, **Interviewing**, **Offer**, and **Closed** as your search progresses.
4. Open **Follow-ups** to see overdue, today's, and upcoming items. Edit a date to reschedule or clear it to mark the follow-up complete. Closing a role removes its reminder from the schedule.
5. Search either view by company or job title.

## Data and architecture

- IndexedDB stores applications on this device, scoped to the browser profile and site address. Clearing site data removes the saved applications. The public repository contains only source code and fictional demo records.
- The demo and personal workspaces are separate. The demo dates are calculated the first time the database is created.
- Tabs refresh on focus and notify one another after changes. Revision checks in the write transaction prevent an edit from overwriting a newer change from another tab.
- Follow-ups appear inside the app. Dates use the local calendar. The app requires no account, API keys, or build step.

| File | Purpose |
| --- | --- |
| `index.html` | Dashboard, navigation, and accessible application editor |
| `styles.css` | Responsive board, cards, and dialog layouts |
| `app.js` | IndexedDB storage, stage updates, search, and follow-up views |
| `mark.svg` | Shortlist app icon |
