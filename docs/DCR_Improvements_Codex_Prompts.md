# DCR Platform — Three Improvements + Codex Prompts

Three things to build next, in order of complexity. Each section explains the approach, the data model behind it, and the exact prompt to paste into Codex in VS Code.

---

## 1. Project Gantt Chart (full project × week view)

### What you're missing and why it matters

The current Gantt in **Operators** shows **operators as rows** and weeks as columns. That's useful for scheduling individuals. But when you have 100 projects — some Committed, some Pipeline — you need the **inverse view**: projects as rows, weeks as columns, and each cell showing how many systems are actually assigned.

This answers different questions:
- Which projects are understaffed vs plan?
- Which weeks does a project have no coverage at all?
- Which projects overlap and compete for the same systems in the same week?

### How the data works

Two numbers exist per project per week:

| Field | Source | Meaning |
|---|---|---|
| `desired_systems_per_week` | `projects` table | How many systems the PM said they need |
| Actual systems | Count of `operator_assignments` rows for `project_id` + `week_number` with `status = 'assigned'` | How many are actually assigned |

When actual < planned: yellow. When actual = 0 but project is active: red. When actual ≥ planned: green.

### What to build

A new tab on the existing **Projects page** (or a standalone `/gantt` route) with:

- Projects as rows (filterable by status, region, PM)
- Weeks as columns (default: current week → current week + 16, scrollable)
- Each cell shows `actual / planned` — e.g. `2/3` — colour coded
- Sticky left column with project name, region pill, status pill
- Sticky header row with week numbers, current week highlighted
- "Systems this week" summary row at the bottom (total planned vs total actual across all projects)
- Clicking a cell opens the assignment modal (same one from the Operators Gantt, but scoped to that project + week: show which operators are assigned, add/remove)

### Codex prompt

```
I'm working on a Next.js + Supabase app called DCR Platform.

I need to add a Project Gantt Chart as a new tab on the Projects page 
(src/app/projects/page.tsx). The existing page already has tabs for list and form.

## Data model

- `projects` table: id, name, region, status (Committed/Pipeline/Finished/Other), 
  desired_systems_per_week, start_date, end_date, pm, category (EU/US)
- `operator_assignments` table: id, operator_id, project_id, week_number, year, 
  status ('assigned'|'pto'|'sick'|'training'|'repair'|'transit')
- `operators` table: id, name, region

## What to build

Add a "📊 Project Gantt" tab to the existing tab row. When selected:

1. Fetch all projects (excluding status 'Other' and 'Finished'), all 
   operator_assignments for the current year, and all operators.

2. Render a scrollable table where:
   - Left column (sticky, 240px wide): project name, region pill, status pill, 
     desired_systems_per_week shown as "plan: X"
   - Remaining columns: one per week, default range = current ISO week to 
     current week + 16 (so 17 columns visible). Add ← → arrow buttons to 
     shift the visible window by 4 weeks at a time. A "Today" button resets 
     to the default window.
   - Each cell shows: how many operator_assignments exist for that project_id + 
     week_number with status='assigned'. Format as "A / P" where A = actual 
     assigned, P = desired_systems_per_week.

3. Cell colour coding:
   - A === 0 AND project is Committed AND week is within project start_date–end_date: 
     red background (rgba(239,68,68,0.2)), red border
   - A > 0 AND A < P: amber (rgba(245,158,11,0.18)), amber border  
   - A >= P AND A > 0: green (rgba(16,185,129,0.12)), green border
   - A === 0 AND project is Pipeline: grey (rgba(75,98,128,0.12))
   - Empty / outside project dates: no background, just a faint border

4. Clicking any cell opens a modal showing:
   - Project name + week number
   - List of currently assigned operators (name from operators table)
   - A select dropdown to assign a new operator to this project/week (creates 
     operator_assignments row with status='assigned')
   - A remove button on each existing assignment

5. Bottom summary row (sticky): "Total" label, then for each visible week: 
   sum of actual assigned / sum of planned (desired_systems_per_week) across 
   all visible projects. Use same colour coding.

6. Filter controls above the table:
   - Status filter: All / Committed / Pipeline (buttons)
   - Region filter: dropdown
   - Search: text input that filters project names

## Style

Use the existing DCR Platform dark theme variables:
- --bg: #080E1C, --card: #0F1824, --card2: #162030, --border: #1E2D42
- --teal: #00D4B8, --blue: #3B82F6, --violet: #8B5CF6
- --amber: #F59E0B, --red: #EF4444, --green: #10B981
- --muted: #4B6280, --dim: #8BA3BE, --text: #D1E4F5
- Font: Inter. Monospace numbers: JetBrains Mono

The table must handle 100 projects without performance issues — 
use useMemo for all computed values.

The existing ASSIGN_COLORS, REGION_C, STATUS_C constants are already in the file. 
Reuse them. The Supabase client is imported from '@/lib/supabase'.
```

---

## 2. Planned vs Actual Systems — per project, per week

### What you're missing and why it matters

You know from `desired_systems_per_week` how many systems a project was **planned** to use. You know from `operator_assignments` how many systems it **actually** used each week. These two numbers are never shown together anywhere in the current platform.

The gap between them is where management questions live:
- "Why is this project behind?" — because it got 1 system instead of 3 for 4 weeks running
- "Why did we go over capacity?" — because 3 projects each requested 2 systems but only 1 was available
- "Is our planning accurate?" — look at planned vs actual over 3 months

### Where to put it

Two places, each serving a different purpose:

**A) Progress page — per project card**
Each project card already shows % complete and pace. Add a small bar or number showing planned vs actual systems for the current week. `2 / 3 sys ⚠` is enough. Tap to see the history.

**B) Forecast page — new "System Coverage" chart**
A new chart on the project drill-down view: a bar chart where each week has two bars — planned systems (from `desired_systems_per_week`) and actual systems (from `operator_assignments` count). The gap between them visually explains why a project is ahead or behind forecast.

### Codex prompt

```
I'm working on a Next.js + Supabase app called DCR Platform.

I need to add "Planned vs Actual Systems" visibility in two places.

## Data model

- `projects.desired_systems_per_week`: integer — how many systems the project needs
- `operator_assignments`: rows with project_id, week_number, year, status
  — count rows where status='assigned' for a project+week = actual systems used
- `project_progress`: rows with project_id, week_number, year, cumulative_images
  — used to calculate actual KM progress

## Change 1: Progress page (src/app/progress/page.tsx)

On each project card in the grid view (not the detail view), below the progress bar 
and the pace indicator, add a one-line system coverage indicator for the current week:

- Query the actual count of operator_assignments for this project + current week + 
  status='assigned' 
- The data is already fetched — add operator_assignments to the existing Promise.all load
- Show: "This week: X / Y sys" where X = actual, Y = desired_systems_per_week
- Colour: green if X >= Y, amber if 0 < X < Y, red if X === 0 and project is Committed
- If project has no desired_systems_per_week set (0 or null), show nothing

This is read-only display. No click interaction needed.

## Change 2: Forecast page (src/app/forecast/page.tsx)

In the project drill-down view (when a project is selected from the list), 
add a new card titled "System Coverage — Planned vs Actual" below the 
existing confidence bands chart.

Build a bar chart using Recharts ComposedChart:
- X axis: week numbers (only weeks within the project's start_date to 
  today + 4 weeks)
- Two bars per week:
  - "Planned" bar: always equals desired_systems_per_week (flat line, same height 
    every week — it's the plan)
  - "Actual" bar: count of operator_assignments for this project + week + 
    status='assigned'
- Colour the Actual bar:
  - Green (var(--green)) if actual >= planned
  - Amber (var(--amber)) if 0 < actual < planned  
  - Red (var(--red)) if actual === 0
- Add a ReferenceLine at Y = desired_systems_per_week labelled "Plan"
- Height: 180px
- Below the chart, show a summary: 
  "Average coverage: X.X sys/wk planned · Y.Y sys/wk actual · Z% coverage rate"
  where coverage rate = (sum actual / sum planned * 100) across all weeks shown

The assignments data is already fetched in the Forecast page — it's in the 
`assignments` state variable. Filter it by project_id and group by week_number.

## Style

Use existing DCR theme variables. Keep the same card/SectionHead pattern 
already used throughout the file.
```

---

## 3. Command Center — week navigation arrows

### What's broken

The week selector at the top of Command Center shows a row of ~12 week buttons starting from the current week. Two problems:

1. You can't go **backwards** — you can't look at last week or last month
2. You can only see 12 weeks ahead — for a long-horizon planning meeting you can't get to Week 40 without typing
3. The 8-week heatmap strip is hardcoded to `current week → +7` — it doesn't follow the selected week, so the two components are out of sync

### What to build

Replace the scrolling buttons with a clean prev/next arrow navigation:

```
← Wk 20  [Wk 21] [Wk 22] [Wk 23] [Wk 24★] [Wk 25] [Wk 26] [Wk 27]  Wk 28 →
                                       ↑ current week indicator
```

- `←` shifts the visible window left by 1 week (or 4 weeks with Shift+click)
- `→` shifts right by 1 week
- Selected week is highlighted with teal border
- Current week always shows a small `★` or `●` dot
- "Now" button jumps back to current week instantly
- The 8-week heatmap below updates to show `selectedWeek → selectedWeek+7` (not hardcoded to current week)
- The URL updates to `?week=X` on every change (already does this, keep it)
- Keyboard: left/right arrow keys navigate weeks when not focused on a text input

### Codex prompt

```
I'm working on a Next.js + Supabase app called DCR Platform.

I need to improve the week navigation on the Command Center page 
(src/app/command-center/CommandCenterDashboard.tsx).

## Current state

The week selector is a row of ~12 buttons rendered like this:

  {weeklyData.filter(w => w.week_number >= CURRENT_WEEK - 1).slice(0, 12).map(w => (
    <button key={w.week_number} onClick={() => { setSelectedWeek(w.week_number); ... }}
  ))}

The 8-week heatmap below it is hardcoded to:
  weeklyData.filter(w => w.week_number >= CURRENT_WEEK).slice(0, 8)

## What to change

### 1. Week selector — replace with windowed navigation

Keep selectedWeek state. Add new state: windowStart (default: CURRENT_WEEK - 1).

Render:
- A ← arrow button: onClick decrements windowStart by 1 (min: 1). 
  Shift+click decrements by 4.
- 8 week buttons showing weeks from windowStart to windowStart+7
- A → arrow button: onClick increments windowStart by 1 (max: 52). 
  Shift+click increments by 4.
- A "Now" button (only visible when selectedWeek !== CURRENT_WEEK or 
  windowStart !== CURRENT_WEEK - 1): resets both to defaults

Each week button:
- Shows "W{n}" 
- If week_number === CURRENT_WEEK: show a small teal dot (●) before the number
- Selected week: teal border (2px solid var(--teal)), teal text
- Over capacity: red background rgba(239,68,68,0.15), red text
- Tight: amber background rgba(245,158,11,0.12), amber text
- onClick: setSelectedWeek(w.week_number), push to router with ?week=n, 
  AND if the clicked week is outside the current window, adjust windowStart 
  so the selected week stays visible

### 2. 8-week heatmap — make it follow selectedWeek

Change:
  weeklyData.filter(w => w.week_number >= CURRENT_WEEK).slice(0, 8)

To:
  weeklyData.filter(w => w.week_number >= selectedWeek).slice(0, 8)

Add left/right arrows to the heatmap section too (separate from the top nav):
- ← shifts the heatmap start back by 4 weeks (selectedWeek - 4, min 1)
- → shifts forward by 4 weeks  
- These arrows change selectedWeek, which automatically updates both 
  the top selector and the heatmap

Title the heatmap: "8-Week Risk Horizon — Week {selectedWeek} to {selectedWeek+7}"

### 3. Keyboard navigation

Add a useEffect with a keydown listener:
- ArrowLeft: if active element is not an input/textarea, call setSelectedWeek 
  (prev => Math.max(1, prev - 1)) and adjust windowStart if needed
- ArrowRight: same but +1, max 52
- Home: jump to CURRENT_WEEK
- Show a subtle hint below the week selector: 
  "← → arrow keys to navigate · Home to return to now"

### 4. Keep everything else working

- The URL sync (?week=X) already works — keep it
- The decision log, who's where grid, AI assistant — all driven by selectedWeek, 
  no changes needed there
- The KPI numbers at the top (total capacity, committed, balance, etc.) are 
  already driven by `curr = weeklyData.find(w => w.week_number === selectedWeek)` 
  — no change needed

## Style

Arrows: use ‹ and › characters (not < >), styled as:
  background: var(--card2), border: 1px solid var(--border), 
  borderRadius: 6, padding: '7px 12px', color: var(--dim), 
  cursor: pointer, fontSize: 16, fontWeight: 700

On hover: color: var(--text), background: rgba(255,255,255,0.04)

The "Now" button: 
  background: rgba(0,212,184,0.1), border: 1px solid rgba(0,212,184,0.3),
  color: var(--teal), borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700
```

---

## Suggested build order

1. **Command Center arrows** — 1–2 hours, zero new DB tables, immediately useful in Monday meetings
2. **Planned vs Actual systems** — 2–3 hours, reuses data you already fetch, answers the most common "why" question
3. **Project Gantt** — 3–5 hours, most complex, needs the modal for cell interaction, but delivers the 100-project overview you actually need

The Gantt is the highest-value feature of the three. Once you have it, you'll immediately see which projects are systematically under-resourced — that visibility doesn't exist anywhere else right now.
