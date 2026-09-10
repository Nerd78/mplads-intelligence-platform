# MPLADS Scraper - SIH 2026 (PS 26102)

Track A of the MPLADS AI Anomaly Detection project: scrapes the public,
unauthenticated JSON REST endpoints behind the MPLADS eSAKSHI dashboard
(mplads.mospi.gov.in/digigov/dashboard.html).

## Setup

    pip install -r requirements.txt

## Usage

    python mplads_scraper.py --test            # connectivity smoke test
    python mplads_scraper.py --states          # all states/UTs
    python mplads_scraper.py --tenures         # Lok Sabha tenure list
    python mplads_scraper.py --tiles           # 6 headline summary numbers
    python mplads_scraper.py --pie             # pie-chart labels + graph data
    python mplads_scraper.py --constituencies  # every state's constituencies
    python mplads_scraper.py --report "Works Completed"          # one tile drill-down
    python mplads_scraper.py --report "Works Recommended" --state 12   # one state
    python mplads_scraper.py --report "Works Recommended" --state 12 --mp 3018989
    python mplads_scraper.py --report "Works Sanctioned" --by-state    # merge all states
    python mplads_scraper.py --recommendations  # = Works Recommended, by-state
    python mplads_scraper.py --all             # everything except huge reports

Output JSON is written to `data/`.

## MPLADS fund lifecycle - which tile is which

| stage | tile key | per-row amount field | "who" |
| --- | --- | --- | --- |
| entitlement (₹5 cr/yr) | `Allocated Limit for Hon'ble MPs` | `ALLOCATED_AMT` | one row per MP |
| **MP allocates fund to works** | **`Works Recommended`** | **`RECOMMENDED_AMOUNT`** (+ `SANCTION_AMOUNT`) | one row per work, has `MP_NAME` |
| district sanctions | `Works Sanctioned` | `SANCTION_AMOUNT` | per work |
| work finished | `Works Completed` | `ACTUAL_AMOUNT` | per work |
| money paid out | `Expenditure on Completed and On-going Works as on Date` | - | aggregate |

"Funds a given MP allocated" = sum of `RECOMMENDED_AMOUNT` over that MP's
`Works Recommended` rows. Divide by their `ALLOCATED_AMT` for utilisation.
Each `Works Recommended` row also carries `RECOMMENDATION_DATE`,
`SANCTION_DATE`, `WORK_STAGE`, `WORK_CATEGORY`, `ACTIVITY_NAME`,
`WORK_DESCRIPTION`, `IDA_NAME` (implementing district authority),
`CONSTITUENCY`, `FLAG`, and `WORK_RECOMMENDATION_DTL_ID` (work id → evidence
endpoints). The API appends a trailing summary row `{"Total_Amt": ...}`; the
`--by-state` path strips it.

### Filtering with `combo`

`getTilesReportData` takes `combo = "<stateId>,<constId>,<mpId>,<house>"`
(unset = `0`, house `2` = Lok Sabha). The unfiltered `Works Recommended`
blob (~108k rows) times the backend out; per-state combos return in 1–3 s
(Goa `12,0,0,2` → 249 rows). `--by-state` loops all 36 states, merges and
de-dups on `WORK_RECOMMENDATION_DTL_ID`.

### Per-MP summary + validation

`python analyze_mp_funds.py` joins the by-state recommendations against the
entitlement report and writes `data/mp_fund_allocation_summary.csv` (one row
per MP: works_recommended, recommended_amt, sanctioned_amt, entitlement_amt,
utilisation_pct).

Verified 2026-09-09: `--recommendations` merged **107,567** work rows
(headline tile says 107,571) totalling **₹5,767 Cr recommended** vs
**₹8,334 Cr entitlement** (69.2% utilisation) - both totals match the
dashboard's own headline tile numbers (₹5,766.82 Cr / ₹8,333.67 Cr), so the
per-MP breakdown is sound. 538 of 543 MPs have recommended at least one work.

## Test status - VERIFIED LIVE 2026-09-09

Run end-to-end against the live site from this machine:

- `--test` smoke test: **PASSED** (session cookies, getStateData=36,
  getTenureData=2, getTilesData=7, getPieChartLabels=4).
- `--states --tenures --tiles --pie`: all saved OK.
- `--report "Allocated Limit for Hon'ble MPs"`: 544 MP rows, ~214 KB.
- `--report "Works Completed"`: **34,906 work-level rows in a single call**,
  ~27 MB, ~14 s, no connection reset. Row fields include `WORK_ID`,
  `ACTUAL_AMOUNT`, `ACTUAL_END_DATE`, `WORK_CATEGORY`, `MP_NAME`,
  `STATE_NAME`, `CONSTITUENCY`, `FLAG`, `AVERAGE_RATING` - this is the
  work-level detail the ML layer needs.

### What was wrong before

The earlier version pointed at `…/digigov/rest/PreLoginDashboardData/*`.
That path is session-gated and 302-redirects anything it doesn't recognise
to `/digigov/Login.zul`, so every call looked "blocked". The real base path
the dashboard's own JS uses is `…/rest/PreLoginDashboardData/*` (no
`/digigov`), and you must load the dashboard HTML once first to pick up the
`JSESSIONID`/`ROUTEID` cookies. Both are now handled.

## Endpoint reference (observed 2026-09-09)

Base: `https://mplads.mospi.gov.in/rest/PreLoginDashboardData/` - all POST.
`combo` = `<stateId>,<constId>,<mpId>,<house>`, unset field = `0`,
house `2` = Lok Sabha, `1` = Rajya Sabha. Dashboard default = `0,0,0,2`.

| endpoint | body |
| --- | --- |
| `getStateData` | `{}` |
| `getTenureData` | `{"uname": "0,0,0,2"}` |
| `getTilesData` | `{"uname": "0,0,0,2"}` - its keys are the tile keys |
| `getConstituencyData` | `{"id": <STATE_ID>}` |
| `getMpNamesData` | `{"state_combo": "<stId>,<house>,<tenure>"}` |
| `getMpAndConstCombo` | `{"const_combo": "<coId>,<house>,<tenure>"}` |
| `getPieChartLabels` | `""` (literal empty body) |
| `getgraphdata` | `"0,0,0,2"` (raw string body, not JSON) |
| `getTilesReportData` | `{"combo": "0,0,0,2", "key": "<tileKey>"}` - value is a **JSON-encoded string**, decode twice (the script does this) |

Individual work evidence (photos / sanction-order docs) lives under a
second namespace, not yet wired into the CLI:

- `/rest/PreLoginCitizenWorkRcmdRest/getAttachmentById` - `{"id": <attId>}`
- `/rest/PreLoginCitizenWorkRcmdRest/getReviewDetailsByWork` - `{"json": <workId>}`
- `/rest/PreLoginDashboardData/getAttachIdsbyFlag` - `{"json": ...}`

## Known caveats

- The big work-level tiles ("Works Recommended" ~108k, "Works Sanctioned"
  ~80k, "Works Completed" ~35k) return as one large JSON blob. It worked in
  a single shot here, but the backend has reset connections under rapid
  repeated polling before - the script uses a 120 s timeout plus
  retry/backoff; still, don't poll these in a tight loop. Server-side
  DataTables paging (`draw`/`start`/`length`) was NOT needed and is not
  implemented.
- Re-verify endpoint behaviour and robots.txt/terms close to build time -
  this was reverse-engineered on one date and government portals change
  without notice.

