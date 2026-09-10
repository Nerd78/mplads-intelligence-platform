# UI design system

What the interface is built from, and why each rule exists. Every rule here
came from a defect that was visible on screen - the reasoning is recorded so
the same problem isn't reintroduced later.

Source of truth: [`mplads-ai-pulse-main/src/styles.css`](../mplads-ai-pulse-main/src/styles.css).

## 1. Solid colors only

**Rule:** every color token is fully opaque. No `/50` opacity utilities, no
alpha channels, anywhere in application code.

**Why:** the previous palette faded severity colors into their backgrounds
(`bg-risk-low/15`, `border-border/80`, `bg-card/80`). A translucent fill takes
on whatever sits behind it, so the same "Medium" badge rendered as three
different colors depending on whether it sat on a card, a striped table row,
or a sunken panel. Colors looked mismatched because they literally were.

**How to apply:** if a surface needs to look lighter, give it a named token
(`--surface-sunken`, `--sev-medium-surface`), don't fade an existing one.

## 2. The surface ladder

Three solid steps carry depth, so borders can stay light:

| Token | Light | Role |
|---|---|---|
| `--canvas` | `#F4F7FC` | page background (snow-blue) |
| `--surface` | `#FFFFFF` | cards, panels, popovers |
| `--surface-sunken` | `#EDF2FA` | table headers, filter bars, insets |
| `--surface-inset` | `#E4ECF7` | chart grid lines, progress tracks |

Cards are pure white on a snow-blue page. That contrast is what makes card
edges read - not heavy borders.

## 3. Blue means magnitude, severity means state

Two color jobs, never mixed:

- **Sequential blue ramp** (`--chart-seq-1..5`, light → dark) encodes
  *magnitude*: counts, average scores, choropleth shading.
- **Severity ramp** (`--sev-low/medium/high/critical`) encodes *state* and
  nothing else. It is never used as a generic accent.

**Why:** "Highest-risk states" previously drew green bars on a traffic-light
scale, so a risk chart read mostly green, and the map painted India green
under a heading that said risk. Worse, a threshold palette implies a severity
bucket that a state *average* doesn't carry.

### Severity palette validation

Run through the palette validator rather than eyeballed:

| Check | Result |
|---|---|
| Contrast vs surface | **PASS** - all four ≥ 3:1 |
| Normal-vision separation | **PASS** - worst adjacent pair ΔE 17.0 |
| CVD separation | **WARN** - worst pair ΔE 7.6 (deutan) |

The CVD warning is accepted deliberately. Amber and red are close for
deuteranopes - that is intrinsic to any warm ordered ramp, and several
alternatives were measured before settling. It is legal only because severity
always ships with a **text label** (`SeverityBadge` renders a dot *and* the
word), and lightness falls monotonically as severity rises, so the ordering
survives without hue. **If you ever render a severity color without its
label, this guarantee breaks.**

## 4. Choropleth uses quantile bins, not linear ones

State risk averages cluster tightly (most between 20 and 36 on a 0–100
scale). Slicing `0..max` into five equal bands dropped nearly every state into
the lightest step and produced a flat, uninformative map. The map ranks the
values and cuts at quintiles instead, so roughly a fifth of states land in
each shade. The tooltip always shows the raw number, so relative shading never
hides the absolute value.

## 5. Component primitives

`src/components/mplads/Panel.tsx` is the single surface primitive.

Before it existed, every page hand-rolled `<Card className="border-border/80
shadow-none">`, so padding, border weight and header spacing drifted page to
page. Use `Panel` + `PanelHeader` + `PanelBody`; use `PageHeader` for the
route title block.

**All routes are converted.** `@/components/ui/card` is no longer imported by
any route - if you find yourself reaching for it, use `Panel` instead.

### Who owns the filters

`WorksTable` ships its own toolbar (search, anomaly type, severity, category)
so any page can drop the table in and get filtering for free. Pages that keep
their filters in the **URL** - `/works` - pass `searchable={false}` and render
their own `FilterBar` instead. Otherwise the page shows two competing sets of
the same controls, which is exactly what happened when the table's toolbar was
first added.

Rule of thumb: URL-backed filters when a filtered view should be shareable
(`/works`); the table's built-in toolbar when the filter is a transient
narrowing inside an already-scoped view (works within one state).

## 6. Number formatting

- **Currency** is Indian-unit: `₹12,639 Cr`, `₹4.81 L`. `Intl`'s compact
  notation renders ₹1.26e11 as **"₹13KCr"** (thousand-crore), which nobody
  reads as money.
- **All figures** carry `.tnum` (tabular numerals) so columns align.
- **Anomaly codes** are mapped to readable names -
  `SANCTION_DELAY_EXCEEDS_90_DAYS` → "Sanction delay > 90 days". The raw codes
  are 30+ characters and wrapped onto three lines as chart axis labels.

## 7. Fixed row rhythm in KPI cards

`KpiCard` uses fixed row heights (`h-7` label / `h-8` value / `h-4` footnote)
rather than `justify-between`. With `justify-between`, a card without a
footnote pushed its number to the bottom and the row of KPI values no longer
shared a baseline. The footnote row renders even when empty to hold the edge.

## 8. Known display decisions

- **Fabricated districts.** All 3,958 synthetic benchmark works carry
  placeholder district names (`District_5`); no real work does. They are
  excluded from geographic rankings and render as `-` in tables. They are not
  places, and beside real districts they read as real administrative units.
  Synthetic rows still count everywhere else (severity totals, model
  evaluation) - only *geography* excludes them.
- **Lok Sabha vs Rajya Sabha are never pooled.** Lok Sabha: 544 MPs,
  110,343 works, avg risk 23.8. Rajya Sabha: 232 MPs, 1,182 works, avg risk
  **44.0**. A national average is dominated by Lok Sabha volume and hides that
  gap, so the two are always shown side by side.
- **Focus rings are suppressed on chart and map marks only.** Recharts and
  react-simple-maps put `tabIndex` on sectors and paths, so clicking a pie
  slice drew a black rectangle over the chart. Those marks aren't keyboard
  stops; the surrounding buttons and rows are, and they keep their rings.

## 9. Accessibility floor

- Severity is never color-alone - always a labeled badge.
- Charts with 2+ series carry a legend (`ChartCard`'s `legend` prop).
- Interactive controls have `aria-label`s; the search input is a real
  `<input type="search">`.
- Tables scroll inside `overflow-x-auto`; the page body never scrolls
  sideways. Verified at 390 / 768 / 1440px.
