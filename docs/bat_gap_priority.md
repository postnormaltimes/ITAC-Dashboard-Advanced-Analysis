# BAT↔ARC Categorisation Layer

## Overview

This layer links BAT (Best Available Techniques) from EU BREF documents to ARC
(Assessment Recommendation Codes) used in the IAC database.  Two new dashboard
steps sit between **Step 5 (Cluster Comparison)** and **Step 6 (Selection)**:

| Step | Name              | Purpose |
|------|-------------------|---------|
| 5B   | BAT Alignment     | Show how each ARC maps to BATs; compute Improvement Index |
| 5C   | Priority Index    | Combine Criticality (Step 5) + Improvement into a single score |

## Data Pipeline

```
data/lookups/bref_bat_to_arc.csv          ← authoritative source (104 rows)
    ↓  scripts/normalize_bref_bat_to_arc.py
data/lookups/bref_bat_to_arc.json         ← normalised, validated
    ↓  backend/app/utils/bat_mapping.py
POST /advanced/step5b_bat_alignment       ← Improvement Index endpoint
POST /advanced/step5c_priority_index      ← Priority Index endpoint
```

## Mapping Schema (CSV)

| Column          | Type   | Description |
|-----------------|--------|-------------|
| naics           | str    | NAICS code for the industry |
| bref_id         | str    | BREF document identifier |
| bat_id          | str    | BAT identifier within the BREF |
| arc_key         | str    | Full ARC key incl. app suffix (e.g. `2.2437.1`) |
| match_role      | enum   | `primary` / `secondary` |
| match_type      | enum   | `direct` / `partial` / `proxy` |
| confidence      | float  | 0.0 – 1.0 |

### ARC Key Parsing

`arc_key = "2.2437.1"` → `arcCode = "2.2437"`, `arcAppCode = 1`

App codes 1–4 are stripped; the suffix is preserved as metadata.  Matching to
`AdvancedMeasure.arc` uses `arcCode` only (no app suffix).

## Improvement Index (0–100)

```
implRate  = (implemented + 1) / (recommended + 2)   # Laplace smoothing
implGap   = 1 − implRate
evidence  = min(1, recommended / N₀)                # N₀ = 30
avgConf   = mean(confidence of primary links)        # fallback: all links
index     = round(100 × implGap × evidence × avgConf)
```

Returns `null` when `recommended = 0` (insufficient data).

## Priority Index (0–100)

```
priorityIndex = round((wCrit × criticalityIndex + wImp × improvementIndex) / 100)
```

Defaults: `wCrit = 60`, `wImp = 40`.  When `improvementIndex` is null:
- **include_missing = false** → measure excluded from ranking
- **include_missing = true**  → treated as 0

## Frontend Components

- **Step5B_BatAlignment.tsx**: table with expandable BAT links, BREF filter dropdown, BAT-only toggle
- **Step5C_PriorityIndex.tsx**: weight slider, ranking mode toggle (Criticality vs Priority), ranked table
- **AdvancedDashboard.tsx**: updated STEPS array (9→11 steps), `currentRankingMode` state
