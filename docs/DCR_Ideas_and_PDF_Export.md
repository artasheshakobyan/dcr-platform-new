# DCR Platform — Ideas for PMs, Leadership + PDF Export Guide

---

## PDF / Export — the honest answer

**You don't have it anywhere.** No PDF export, no CSV download, no print button exists in the current codebase. The closest thing is the `/share/[token]` client page, which renders nicely in a browser but has no export.

There are three approaches, from easiest to most powerful:

### Option A — Browser print (30 minutes, zero dependencies)
Add a `🖨 Print` button to any page that calls `window.print()`. Add a `@media print` CSS block that hides the sidebar, nav, and buttons, and makes the content full width. The browser generates a PDF from whatever is on screen. Works for Command Center, Progress, individual projects. The output looks like a screenshot of the page — fine for internal use, not great for clients.

### Option B — CSV export from tables (1–2 hours per page)
For the Projects list, Progress log, Alerts — add a "⬇ Export CSV" button that builds a CSV string from the current filtered data and triggers a download via a Blob URL. No dependencies needed. Extremely useful for PMs who need to paste data into Excel or send to finance. Build this on Projects first.

### Option C — jsPDF + html2canvas (3–4 hours, looks professional)
Install `jsPDF` and `html2canvas`. Add a `📄 Export PDF` button on the Command Center and the Share page. The library captures a DOM element as a canvas and embeds it in a PDF. Output looks exactly like the screen. Best for the weekly leadership report and client-facing project pages.

**Codex prompt for Option B (CSV export on Projects page):**
```
In src/app/projects/page.tsx, add a "⬇ Export CSV" button to the page header 
(next to the existing "+ Add Project" button).

When clicked, it should:
1. Take the currently filtered projects array (same array used to render the 
   project list — respects any active status/region filters)
2. Build a CSV string with these columns:
   Name, Region, Category, Status, PM, Total KM, Systems/Wk, Start Date, 
   End Date, CRM %, Finance ID, City/State, Notes
3. Trigger a browser download of the file named 
   "dcr-projects-{YYYY-MM-DD}.csv" using a Blob with type "text/csv"

No dependencies needed — use vanilla JS Blob and URL.createObjectURL.
Button style: same as the existing secondary Btn component in the UI library.
```

**Codex prompt for Option C (PDF export on Command Center):**
```
In src/app/command-center/CommandCenterDashboard.tsx, add a "📄 Export PDF" 
button next to the existing "🔗 Share Link" button.

Install dependencies first:
  npm install jspdf html2canvas

When clicked:
1. Show a loading state on the button: "Generating…"
2. Use html2canvas to capture the div with id="command-center-content" 
   (wrap the main content area with this id if not present)
3. Create a jsPDF instance in landscape A4 format
4. Add the canvas as an image filling the page
5. Save as "DCR-CommandCenter-Week{selectedWeek}-{YYYY-MM-DD}.pdf"
6. Restore button to normal state

Add id="command-center-content" to the main scrollable content div 
(everything below the header bar).

The button should be disabled while loading.
```

---

## Ideas for Project Managers

These are the things PMs ask that the platform can't currently answer.

---

### 1. Weekly status digest email — send to PM automatically every Monday

Every PM wants to start Monday knowing: which of their projects logged progress last week, which didn't, and whether any are falling behind. Right now they have to open the platform and remember to check. A Monday morning email removes the friction entirely.

This is a Supabase Edge Function on a cron schedule, not a UI feature. Zero new DB tables. The email is plain text with three sections: projects that logged last week, projects that are stale (no log in 2+ weeks), and any that are behind forecast pace.

**Codex prompt:**
```
Create a Supabase Edge Function called "weekly-pm-digest" that runs 
every Monday at 07:00 UTC.

The function should:
1. Query all Committed projects with a PM assigned
2. For each project, check project_progress for entries in the last 7 days
3. Query the latest cumulative_images per project and compute % complete 
   and pace (km/week over last 4 entries)
4. Group projects into:
   - "Logged last week" — has a progress entry in the past 7 days
   - "Stale — no log in 2+ weeks" — last entry > 14 days ago
   - "Behind pace" — projected completion date > end_date based on current pace
5. Send one email per unique PM value using Resend (or SendGrid) to a 
   PM_EMAIL environment variable (or look up from a pms table if email exists)
6. Subject: "DCR Week {n} — Your projects at a glance"
7. Plain text body with the three sections

Use SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment.
Use RESEND_API_KEY from environment.
```

---

### 2. Project timeline view — Gantt-style dates, not just weeks

The current Progress page shows cumulative KM charts per project. What PMs actually want when planning is a horizontal bar showing: the project's contracted start→end dates, how far in they are today (a vertical "now" line), and whether the estimated completion (based on current pace) lands before or after the contract end.

This is a visual summary of "on time or not" for all projects at once — one row per project, sorted by urgency.

**Codex prompt:**
```
Add a "Timeline" tab to the Progress page (src/app/progress/page.tsx) 
alongside the existing project cards.

Render a horizontal Gantt-style timeline where:
- Each row = one Committed or Pipeline project
- X axis = calendar weeks for the current year (1–52)
- Each project bar spans from start_date to end_date (convert to ISO week)
- The bar is coloured by health:
  - Green: projected completion <= end_date
  - Amber: projected completion is within 2 weeks of end_date
  - Red: projected completion > end_date
- Inside the bar: project name (truncated) + "X% done" 
- A vertical dashed teal line at the current week
- A vertical red line at the projected completion week (based on pace)
  — only if different from the end_date bar edge
- The "now" line is always visible; scroll the timeline so today is 
  centered on first render

Projected completion = current week + ceil(remaining_km / pace_km_per_week)
Pace = km change over last 3 progress entries / weeks elapsed

Sort rows by: most urgently behind first (largest overshoot), 
then by start_date.

Use vanilla div/CSS for the bars (no new chart library). 
The container scrolls horizontally on small screens.
```

---

### 3. Quick-log history — show the last 5 logs per project in the modal

When a PM opens the Quick-Log FAB to log progress for a project, they currently see only the current cumulative images field. They have no way to see what was logged last week or the week before without navigating away. Adding the last 5 entries in the modal means they can verify they're entering a number that makes sense (e.g. not accidentally going backwards).

**Codex prompt:**
```
In the Quick-Log modal (in src/components/ui/Shell.tsx), after the user 
selects a project, fetch the last 5 project_progress entries for that 
project ordered by week_number DESC.

Display them below the cumulative images input as a compact table:
  Week | Images | KM | Δ KM (change from previous entry)

Show this while the user is typing the new value. If the new value is 
less than the most recent cumulative_images, show a red warning:
  "⚠ This is lower than last week's value ({n} images). 
   Cumulative values should only increase."

Don't block saving — just warn. Fetch the history only when a project 
is selected (not on modal open), using a separate supabase query.
```

---

### 4. Project completion checklist — required fields before marking Finished

Right now a project can be marked Finished with missing data: no final KM, no PM sign-off note, systems still showing as assigned. This creates data quality problems downstream (fleet shows systems as active, capacity numbers stay inflated). A completion checklist enforces clean closure.

**Codex prompt:**
```
In src/app/progress/page.tsx, when a PM clicks "Mark as Finished" 
(the sign-off flow), before showing the sign-off modal, run a 
preflight checklist:

Check these conditions:
1. project.pm is set (not null/empty)
2. At least 3 project_progress entries exist for this project
3. The latest cumulative_images is > 80% of (total_km * 200) 
   — i.e. at least 80% of expected images are logged
4. No operator_assignments exist for this project in future weeks 
   (week_number > current week)
5. project.end_date is set

For each failing check, show a checklist item with a red ✗ and 
the issue. For passing checks, show green ✓.

If all 5 pass: proceed directly to the sign-off modal.
If any fail: show the checklist in a modal titled "Before you close this project…" 
with the failing items highlighted. Include two buttons:
  - "Fix these first" — closes modal
  - "Complete anyway" — proceeds to sign-off despite warnings

This doesn't block closing — it just makes the PM aware.
```

---

## Ideas for Senior Leadership

These answer the questions leadership actually asks, without requiring them to navigate the platform.

---

### 5. Executive summary page — one-screen "state of the business"

Leadership doesn't want 11 pages. They want one page that answers: are we on track globally, what's at risk, and are we going to hit our numbers. The Command Center is close but it's week-centric. An Executive Summary page is portfolio-centric: how many projects, how much KM contracted vs delivered, revenue-at-risk from late projects, and a traffic-light per region.

This is a new `/executive` route (or a tab on the Command Center) that aggregates across the full year, not just one week.

**Codex prompt:**
```
Create a new page at src/app/executive/page.tsx with the route /executive.
Add it to the Shell navigation as "Executive" with a 📈 icon, between 
Command Center and Projects.

The page shows a year-to-date portfolio summary with no week selector needed.

Section 1 — Portfolio Health (3 big numbers):
- Total KM contracted (sum of total_km for Committed projects)
- KM delivered YTD (sum of latest cumulative_images * imagesToKm per project)
- Delivery rate % (delivered / contracted * 100)

Section 2 — Regional Traffic Lights (one card per region: NL, BE, DE, US):
For each region, show:
- Projects active (Committed, in current year)
- Avg % complete across those projects
- Projects at risk (projected completion > end_date)
- Traffic light: 🟢 if 0 at-risk, 🟡 if 1-2 at-risk, 🔴 if 3+ at-risk

Section 3 — Projects At Risk table:
Projects where projected completion > end_date, sorted by weeks late.
Columns: Project Name, Region, PM, % Complete, Projected Finish, Contract End, Weeks Late
Show max 10 rows. "Weeks Late" cell coloured red.

Section 4 — Capacity Utilization bar:
The next 8 weeks as a horizontal bar chart (use recharts BarChart).
Each bar = utilization % for that week. Colour: green <75%, amber 75-90%, red >90%.

All data comes from existing tables: projects, project_progress, 
operator_assignments, weekly_capacity.
Use Promise.all for all fetches. Show loading skeletons.

Add a "📄 Export PDF" button that uses window.print() with a print stylesheet 
that hides the sidebar and makes content full-width.
```

---

### 6. Revenue-at-risk indicator

This is the one number leadership wants: how much contracted revenue is at risk because projects are behind pace. This requires knowing the revenue per project (which may not be in the DB yet) or estimating it from KM × a per-km rate.

If you don't have revenue data, you can at least show **KM at risk** — the total remaining KM across all projects that are behind forecast pace. That's a proxy for the problem even without financials.

**Codex prompt:**
```
Add a "Revenue / KM at Risk" card to the Executive page (or the Home page 
if /executive doesn't exist yet).

Calculation:
1. For each Committed project, compute pace (km/week) from the last 3 
   project_progress entries
2. Compute projected completion date from remaining_km / pace
3. If projected completion > end_date: the project is "at risk"
4. Sum the remaining_km for all at-risk projects = "KM at risk"

Display as a KpiTile:
- Label: "KM At Risk"
- Value: the sum formatted with commas (e.g. "12,400 km")
- Sub-label: "across {n} projects behind pace"
- Color: red if > 5000 km, amber if 1000–5000 km, green if < 1000 km

If any project has no pace data yet (fewer than 2 progress entries), 
exclude it from the at-risk calculation and show a footnote:
"{m} projects excluded — insufficient progress data"

Add a small "?" icon that, on hover, shows: 
"At-risk = projects where current pace projects completion after contract end date"
```

---

### 7. Year-over-year comparison — are we faster than last year?

Leadership cares about whether the business is improving. The most useful single metric is whether average KM delivery per system per week is higher than it was in the same period last year. This requires last year's data in project_progress, but if it exists, it's a powerful chart.

This is a "nice to have" that requires historical data — worth noting but build the other things first.

---

### 8. Capacity sold vs capacity available — the pipeline gap

Leadership needs to know: if all Pipeline projects convert to Committed, do we have enough systems? The Forecast page shows this per week, but leadership wants a summary number: "If everything in pipeline converts, we're short X systems in weeks Y–Z." This is a single callout card, not a full page.

**Codex prompt:**
```
Add a "Pipeline Gap" card to the Command Center or Executive page.

Calculation:
1. Compute weekly demand for Committed + Pipeline projects combined 
   (use forecastProject from lib/forecast.ts, weight pipeline by crm_percent/100)
2. Compare to weekly_capacity for the next 12 weeks
3. Find all weeks where combined demand > total_capacity
4. Report:
   - "No gap — capacity covers all committed + pipeline" (green) if no such weeks
   - "Gap detected in {n} weeks — worst shortfall: {x} systems in Wk {y}" (amber/red)

Show as a single card with an expand button that reveals the full 12-week breakdown 
as a small table: Week | Capacity | Committed | Pipeline | Gap

Title: "Pipeline Capacity Gap"
Subtitle: "What happens if all pipeline converts"
```

---

## Summary — what to build first

| Feature | Audience | Effort | Value |
|---|---|---|---|
| CSV export on Projects | PMs | 1h | High — replaces Excel copy-paste |
| PDF export on Command Center | Leadership | 2h | High — replaces manual slides |
| Quick-log history in modal | PMs | 1h | Medium — prevents data entry errors |
| Weekly PM email digest | PMs | 2h | High — removes "remember to check" |
| Project timeline view | PMs | 3h | High — "are we on time?" at a glance |
| Completion checklist | PMs | 2h | Medium — data quality |
| Executive summary page | Leadership | 4h | Very high — single screen for the board |
| KM at risk indicator | Leadership | 1h | High — one number they always ask |
| Pipeline gap card | Leadership | 2h | High — drives sales decisions |

The two highest-leverage things to build right now are the **Executive Summary page** and **CSV/PDF export**. The export exists in zero form currently — it means every meeting still needs someone to manually copy data somewhere. The Executive page means leadership has their own view without having to interpret the capacity planning UI that's really designed for PMs.
