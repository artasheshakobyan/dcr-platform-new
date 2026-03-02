# DCR Platform — Scale & Efficiency Audit

100 active projects means roughly: 100 project rows, ~5,200 operator_assignment rows per year (100 projects × 52 weeks), ~5,200 project_progress rows per year, and an operator list that could reach 50–80 people. This audit goes page by page through exactly what breaks and how to fix it.

---

## The two root problems

Before going page by page, two patterns cause most of the scale problems:

**1. Every page fetches full tables, then filters in JavaScript.**
`supabase.from('project_progress').select('*').eq('year', CURRENT_YEAR)` returns every progress row for every project for the whole year — potentially 5,200 rows — and then the client filters by `project_id`. At 100 projects this is slow on first load and will hit Supabase's default 1,000-row response limit, silently truncating data.

**2. No search on the projects list.**
With 100 projects in a scrollable list, there's no way to type a name and jump to it. You scroll and scan. That's unusable.

---

## Page-by-page: what breaks, what to do

---

### Projects page

**Problems at scale:**
- The list renders all filtered projects as full `<Card>` components in one pass. 100 expanded cards is a lot of DOM. No virtualization, no pagination.
- No text search — only status and region filters. To find "Amsterdam" you scroll.
- The health score is computed in the render function (`healthScore(p)`) inside the `.map()` — called on every re-render for every project.
- Comments are fetched per-project on demand (good), but each project shows a comments section inline in the card. If 10 projects have comments visible at once, that's 10 extra DOM trees.
- `select('*')` fetches all columns including `notes` (potentially long text) for all projects upfront.

**Fixes:**

Add a text search input. This alone solves the usability problem:
```
Add a search input above the project list in src/app/projects/page.tsx.
State: const [search, setSearch] = useState('')

Filter logic (add to the existing `filtered` useMemo):
  .filter(p => search === '' || p.name.toLowerCase().includes(search.toLowerCase()) 
    || p.city_state?.toLowerCase().includes(search.toLowerCase())
    || p.pm?.toLowerCase().includes(search.toLowerCase())
    || p.region.toLowerCase().includes(search.toLowerCase()))

Style: Input component, placeholder="Search projects, city, PM, region…", 
width: 280px, placed left of the status/region filter dropdowns.

The search should be case-insensitive and match against name, city_state, pm, and region.
```

Add collapse-by-default for project cards:
```
In src/app/projects/page.tsx, change the project list so each Card is 
collapsed by default — showing only: project name, region pill, status pill, 
PM, % complete (if available), health score dot.

Add state: const [expandedId, setExpandedId] = useState<string|null>(null)

Only the expanded card shows: comments section, share button, quick-status 
buttons, notes, full detail grid. This keeps the DOM lean with 100 projects.

Add a small chevron ▸ / ▾ icon on the right of each collapsed row. 
Clicking the row expands it (only one open at a time — clicking another 
collapses the previous). The highlightId from URL params should auto-expand 
that project on load.
```

---

### Progress page

**Problems at scale:**
- Fetches ALL `project_progress` rows for the current year: `select('*').eq('year', CURRENT_YEAR)`. At 100 projects × 52 weeks = 5,200 rows. This will silently hit Supabase's 1,000-row default limit and return incomplete data with no error.
- The `PaceIndicator` component filters `allProgress` for each project inside the `.map()`. That's O(n²) — 100 projects × 5,200 rows filtered 100 times.
- The left-panel project list renders all `shownProjects` cards. With 100 projects this is heavy even collapsed.

**The 1,000-row limit is the most serious bug.** If you have more than 1,000 progress rows the page will silently show wrong data.

**Fixes:**

Fix the 1,000-row limit immediately:
```
In src/app/progress/page.tsx, change the project_progress fetch to:
  supabase.from('project_progress').select('*')
    .eq('year', CURRENT_YEAR)
    .order('week_number', { ascending: false })

Then add: .limit(2000)

Better: only fetch the latest entry per project (you only need latest for 
the card summary). Change to a Supabase RPC or use:
  supabase.from('project_progress')
    .select('project_id, week_number, cumulative_images, notes, logged_by')
    .eq('year', CURRENT_YEAR)
    .order('week_number', { ascending: false })
    
Then in JS, build a map of latest entry per project:
  const latestProgressMap = new Map<string, ProjectProgress>()
  allProgress.forEach(p => {
    if (!latestProgressMap.has(p.project_id)) latestProgressMap.set(p.project_id, p)
  })

This makes the project cards fast. Only fetch the full history when a 
project is selected (in the detail panel on the right), not upfront for all.

Change the detail panel fetch to:
  supabase.from('project_progress')
    .select('*')
    .eq('project_id', selectedProject)
    .eq('year', CURRENT_YEAR)
    .order('week_number')

Trigger this in a useEffect that runs when selectedProject changes.
```

Fix the O(n²) PaceIndicator:
```
In src/app/progress/page.tsx, move PaceIndicator's data preparation 
outside the component into a useMemo in ProgressContent:

const progressByProject = useMemo(() => {
  const map = new Map<string, ProjectProgress[]>()
  allProgress.forEach(p => {
    if (!map.has(p.project_id)) map.set(p.project_id, [])
    map.get(p.project_id)!.push(p)
  })
  map.forEach((entries, _) => entries.sort((a,b) => a.week_number - b.week_number))
  return map
}, [allProgress])

Pass progressByProject.get(p.id) || [] to PaceIndicator instead of allProgress.
This changes the total work from O(100 × 5200) to O(5200) once.
```

---

### Alerts page

**Problems at scale:**
- Fetches 6 full tables at once, including all project_progress for the year (same 1,000-row limit risk as Progress).
- The alert generation loop (`committedProjects.forEach` then inner `.filter` on progress rows) is O(n²) — same pattern as Progress.
- Alert generation runs inside the `load()` function, blocking the UI while it completes.
- With 100 projects × multiple alert types you could get 200–300 alert cards rendered at once.

**Fixes:**

```
In src/app/alerts/page.tsx:

1. Add .limit(2000) to the project_progress fetch to prevent silent truncation.

2. Before the alert generation loop, build a Map for O(1) lookup:
   const progressByProject = new Map<string, any[]>()
   progress.data?.forEach(p => {
     if (!progressByProject.has(p.project_id)) progressByProject.set(p.project_id, [])
     progressByProject.get(p.project_id)!.push(p)
   })
   Then replace all inner .filter(pr => pr.project_id === p.id) calls 
   with progressByProject.get(p.id) || []

3. Move alert generation into a useMemo that depends on the fetched data, 
   not inline in the load() function. This lets the page render the 
   loading skeleton immediately while alerts compute in the background.

4. Add a count indicator: "Showing {filtered.length} of {alerts.length} alerts"
   and a "Clear All Snoozed" button.

5. Add pagination: only render the first 50 alert cards. Add a 
   "Show {alerts.length - 50} more" button at the bottom.
```

---

### Command Center

**Problems at scale:**
- Fetches ALL operator_assignments for the year: `.eq('year', CURRENT_YEAR)` — up to 5,200 rows — but only uses the ones matching `selectedWeek`. At 100 projects this means pulling the entire year's assignment table to filter client-side for one week.
- The `weeklyData` useMemo runs `computeWeeklySummary` for all 52 weeks on every render cycle that has new data — 52 × (iterating all assignments) per render.
- The "Who's Where" grid renders all assignments for the selected week without a height limit. If 100 operators are all assigned, that's 100 rows visible.

**Fixes:**

```
In src/app/command-center/CommandCenterDashboard.tsx:

1. Narrow the assignments fetch to a date window around the selected week 
   instead of the whole year. For the Command Center, you only need 
   current-4 through current+12 weeks:
   
   const weekMin = Math.max(1, CURRENT_WEEK - 4)
   const weekMax = Math.min(52, CURRENT_WEEK + 12)
   
   supabase.from('operator_assignments')
     .select('*, operator:operators(name,region)')
     .eq('year', CURRENT_YEAR)
     .gte('week_number', weekMin)
     .lte('week_number', weekMax)

2. For weeklyData, only compute summaries for the 17 weeks in the window, 
   not all 52. The week selector only ever shows weeks in this range:
   
   const weeklyData = useMemo(() =>
     capacities
       .filter(cap => cap.week_number >= weekMin && cap.week_number <= weekMax)
       .map(cap => computeWeeklySummary(...))
   , [capacities, projects, assignments, weekMin, weekMax])

3. Add maxHeight + overflowY: 'auto' to the "Who's Where" grid section:
   style={{ maxHeight: 320, overflowY: 'auto' }}
   This prevents the page from growing to 1000px when every operator is assigned.
```

---

### Operators page (Gantt)

**Problems at scale:**
- Fetches ALL operator_assignments for the year, then the Gantt only shows the visible weeks. At 100 projects × 50 operators × 52 weeks, this is a very large table.
- The visible week range is stored as `[CURRENT_WEEK, CURRENT_WEEK+12]` — 13 columns × 50 operators = 650 cells rendered, each with a click handler. This is borderline.
- The project dropdown in the assignment modal loads ALL projects into a `<select>` — 100 `<option>` tags. Fine for HTML but hard to use.

**Fixes:**

```
In src/app/operators/page.tsx:

1. Narrow the assignments fetch to only the visible week window 
   (same pattern as Command Center):
   supabase.from('operator_assignments').select('*')
     .eq('year', CURRENT_YEAR)
     .gte('week_number', visibleWeeks[0])
     .lte('week_number', visibleWeeks[1])
   
   Re-fetch when visibleWeeks changes (add visibleWeeks to the useEffect 
   dependency array).

2. Replace the project <select> in the assignment modal with a 
   searchable combobox. Use a text input that filters the projects list:
   
   Add state: const [projectSearch, setProjectSearch] = useState('')
   
   Show: an Input for projectSearch, then a scrollable div (maxHeight: 200px, 
   overflowY: 'auto') listing matching projects as clickable rows. 
   On click, set assignForm.project_id.
   
   Filter: projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
   
   This replaces the 100-item <select> with a usable search-to-select.

3. Add a "Copy to next N weeks" feature on save (from the previous ideas doc):
   After saving, show: "Copy to: 4 wks | 8 wks | 12 wks | custom"
   Bulk-insert assignments for the same operator + project across N weeks, 
   skipping weeks that already have an assignment.
```

---

### Plan page

**Problems at scale:**
- Fetches all projects (no status filter), all assignments for the year, all capacity, all decisions. Heavy on first load.
- The 52-week button strip is rendered in full every time — 52 buttons. Fine for now but could use virtualization if it gets more complex.
- The "active projects this week" section filters `assignments` in the render, not in a `useMemo`.

**Fixes:**

```
In src/app/plan/page.tsx:

1. Narrow assignments fetch to ±8 weeks from selectedWeek instead of 
   the entire year. Add week range params:
   .gte('week_number', Math.max(1, selectedWeek - 2))
   .lte('week_number', Math.min(52, selectedWeek + 8))
   
   Re-fetch when selectedWeek changes by more than 4 weeks (debounced).

2. Wrap the weekAssignments and activeProjects computations in useMemo:
   const weekAssignments = useMemo(() => 
     assignments.filter(a => a.week_number === selectedWeek && a.year === CURRENT_YEAR && a.status === 'assigned')
   , [assignments, selectedWeek])

3. Select only needed columns from projects:
   .select('id,name,region,status,category,desired_systems_per_week,start_date,end_date')
   instead of select('*') — avoids fetching notes, lat, lng, etc.
```

---

### Forecast page

**Problems at scale:**
- `forecastProject()` is called inside a `useMemo` for every active project every time the memo re-computes. If there are 80 active projects and each forecast generates 52 week objects, that's 4,160 objects created per render cycle.
- The project selection list on the left renders all projects without search. At 100 projects you scroll to find one.

**Fixes:**

```
In src/app/forecast/page.tsx:

1. The portfolioData useMemo is already correct (it runs once on data change).
   Add a guard to only include projects with start_date and total_km set — 
   projects without these will produce NaN in the forecast:
   
   activeProjects.filter(p => p.start_date && p.total_km > 0 && p.desired_systems_per_week > 0)

2. Add a search input above the project list in the project drill-down view:
   const [projectSearch, setProjectSearch] = useState('')
   Filter: projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))

3. Select only needed columns from operator_assignments:
   .select('project_id, week_number, year, status')
   — the forecast page doesn't need operator name or notes.
```

---

## The SQL to add — missing indexes

Run this in Supabase SQL Editor. These are the most-queried columns that don't currently have indexes:

```sql
-- project_progress: you query by project_id constantly; by year on every page load
-- Both indexes exist but add a composite for the most common query pattern:
CREATE INDEX IF NOT EXISTS idx_progress_project_year 
  ON project_progress(project_id, year, week_number DESC);

-- operator_assignments: add composite index for the year+week query 
-- (used by Command Center, Plan, Operators Gantt)
CREATE INDEX IF NOT EXISTS idx_assignments_year_week 
  ON operator_assignments(year, week_number);

-- projects: add index on updated_at for "recently modified" queries
CREATE INDEX IF NOT EXISTS idx_projects_updated 
  ON projects(updated_at DESC);

-- project_progress: index on logged_at for "last logged" queries
CREATE INDEX IF NOT EXISTS idx_progress_logged 
  ON project_progress(logged_at DESC);
```

---

## The Supabase 1,000-row limit — this is a real bug right now

Supabase's PostgREST layer returns **maximum 1,000 rows by default** unless you add `.limit(n)` or configure `db-max-rows`. Any page that does `select('*')` on a growing table without a limit will silently return truncated data.

Pages affected:
- Progress page: `project_progress` — will break above 1,000 rows (~19 projects × 52 weeks)
- Alerts page: `project_progress` — same
- Command Center: `operator_assignments` — will break above 1,000 rows (~20 operators × 52 weeks)
- Plan page: `operator_assignments` — same
- Operators Gantt: `operator_assignments` — same

**Immediate fix:** Add `.limit(5000)` to any fetch that could grow large. But the real fix is to narrow the query with `.gte()` / `.lte()` on week_number so you only fetch what you display.

---

## Codex prompt — the single most impactful change

This one prompt addresses the 1,000-row limit, the O(n²) patterns, and adds search everywhere:

```
I'm working on a Next.js + Supabase app called DCR Platform.
The platform is growing to 100+ active projects and needs scale fixes 
across multiple pages. Make these changes:

## 1. Progress page (src/app/progress/page.tsx)

Change the project_progress fetch from:
  supabase.from('project_progress').select('*').eq('year', CURRENT_YEAR).order('week_number')

To a two-phase load:
  Phase 1 (on mount): fetch only the latest progress entry per project:
    supabase.from('project_progress')
      .select('project_id, week_number, cumulative_images, logged_at, logged_by')
      .eq('year', CURRENT_YEAR)
      .order('week_number', { ascending: false })
      .limit(500)
  
  Build a Map<projectId, latestEntry> from this. Use it for the project cards 
  (pace indicator, % complete, last logged date).

  Phase 2 (when selectedProject changes): fetch full history for that project:
    supabase.from('project_progress')
      .select('*')
      .eq('project_id', selectedProject)
      .eq('year', CURRENT_YEAR)
      .order('week_number')
  
  Store in a separate useState: const [selectedProgress, setSelectedProgress]
  Use this for the detail chart on the right panel.

Remove allProgress from the PaceIndicator props — it now receives 
latestEntry directly (the single latest ProjectProgress for this project).
Adjust PaceIndicator to work with the latestEntry Map value.

## 2. Alerts page (src/app/alerts/page.tsx)

Add .limit(3000) to the project_progress fetch.

Before the alert generation loop, build a lookup Map:
  const progressByProjectId = new Map<string, any[]>()
  progressRows.forEach(p => {
    if (!progressByProjectId.has(p.project_id)) progressByProjectId.set(p.project_id, [])
    progressByProjectId.get(p.project_id)!.push(p)
  })

Replace every instance of:
  (progress.data || []).filter((pr: any) => pr.project_id === p.id)
with:
  progressByProjectId.get(p.id) || []

## 3. Projects page (src/app/projects/page.tsx)

Add a text search input above the filter row:
  const [search, setSearch] = useState('')

Update the filtered useMemo to include:
  && (search === '' || 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.city_state || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.pm || '').toLowerCase().includes(search.toLowerCase()))

Add the Input above the status/region dropdowns:
  placeholder="Search by name, city, PM…"
  value={search}
  onChange={e => setSearch(e.target.value)}
  style={{ width: 260 }}

Make each project Card collapsed by default. Add:
  const [expandedId, setExpandedId] = useState<string|null>(highlightId || null)
  
  Collapsed state shows: project name, region pill, status pill, PM name, 
  health score dot, and a ▸ chevron.
  Expanded state shows everything currently visible.
  
  Clicking the collapsed row sets expandedId to that project's id. 
  Clicking again (or clicking another row) collapses it.

## 4. Command Center (src/app/command-center/CommandCenterDashboard.tsx)

Narrow the operator_assignments fetch to the relevant week window:
  const weekMin = Math.max(1, CURRENT_WEEK - 2)
  const weekMax = Math.min(52, CURRENT_WEEK + 14)
  
  supabase.from('operator_assignments')
    .select('*, operator:operators(name,region)')
    .eq('year', CURRENT_YEAR)
    .gte('week_number', weekMin)
    .lte('week_number', weekMax)

Update weeklyData useMemo to only compute for weeks in [weekMin, weekMax].

Add maxHeight: 300px and overflowY: 'auto' to the "Who's Where This Week" 
container div.

## 5. Operators Gantt (src/app/operators/page.tsx)

Add a searchable project selector in the assignment modal.
Replace the existing <Select> for project_id with:

  const [projectSearch, setProjectSearch] = useState('')
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projectSearch.toLowerCase()))

  Render: 
  - An Input with placeholder="Type to search projects…" 
    value={projectSearch} onChange={e => setProjectSearch(e.target.value)}
  - A div with maxHeight:180px, overflowY:auto, border, borderRadius:6 below it
  - Inside: filteredProjects.map(p => a clickable row showing project name + 
    region pill, onClick sets assignForm.project_id = p.id and clears search)
  - Show the currently selected project name above the search if one is selected.

Also narrow the assignments fetch:
  .gte('week_number', visibleWeeks[0])
  .lte('week_number', visibleWeeks[1])
And re-fetch when visibleWeeks changes (add to useEffect deps).

## Style

Keep all existing styles and component patterns. Don't change any visual design.
Don't break any existing functionality.
```

---

## Summary priority

| Fix | Pages | Risk if ignored | Effort |
|---|---|---|---|
| Supabase 1,000-row limit | Progress, Alerts, Command Center, Plan, Operators | Silent data loss — **production bug** | 30 min |
| O(n²) progress loops | Progress, Alerts | Slow render, will freeze at 100 projects | 1h |
| Narrow assignments fetch | Command Center, Plan, Operators | Slow load, will hit row limit | 1h |
| Search on Projects | Projects | Unusable with 100 projects | 30 min |
| Collapse-by-default cards | Projects, Progress | Heavy DOM, slow scroll | 1h |
| Searchable project selector | Operators Gantt | Unusable dropdown at 100 projects | 30 min |
| SQL indexes | All | Slow queries as data grows | 15 min |

The 1,000-row limit is the only one that causes silent wrong data — fix that first.
