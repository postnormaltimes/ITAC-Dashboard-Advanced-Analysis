# Shadow Dashboard Migration Plan

This document outlines the strategy to replace the existing ITAC Dashboard with the new **Shadow Dashboard** (Market Outlook Engine).

## 1. Architectural Shift

| Feature | Old Dashboard | New Shadow Dashboard |
| :--- | :--- | :--- |
| **Primary Flow** | Exploration (Filter -> Table -> Charts) | **Funnel** (Macro -> Bipartite -> Micro-Segment -> CCE Engine) |
| **Key Insight** | Descriptive Statistics | **Market Frictions & Cross-Elasticities** |
| **Granularity** | Assessment/Recommendation List | **Aggregated Market Segments** |
| **Economics** | Static Payback/ROI | **Dynamic CCE Supply Curves** + Sensitivity |

## 2. Component Migration Inventory

### Backend (`backend/app/`)

| File | Status | Action |
| :--- | :--- | :--- |
| `main.py` | **Keep** | Register new routers for Steps 0-3. |
| `db/connection.py` | **Keep** | No changes. |
| `models/schemas.py` | **Refactor** | Add `Step0Response`, `Step1Response`, `SegmentDef`. |
| `api/endpoints.py` | **Legacy** | Deprecate `/search` for main view. Keep for specific lookups. |
| `api/analytics.py` | **Refactor** | Split into `api/shadow/step0.py`, `step1.py`, etc. |
| `api/cost_curves.py` | **Refactor** | Integrate into `Step3_CCE.py` with dynamic demand overlay. |
| `api/sensitivity.py` | **Refactor** | Integrate into `Step3_Sensitivity.py`. |
| `api/waterfall.py` | **Retire** | Replaced by Step 1 Bipartite Pivot. |

### Frontend (`frontend/src/`)

| Component | Status | Action |
| :--- | :--- | :--- |
| `App.tsx` | **Refactor** | Implement Funnel State Machine (Steps 0-3). Remove old tabs. |
| `FilterSidebar.tsx` | **Retire** | Replaced by Context-Aware Step Controls. |
| `ResultsTable.tsx` | **Demote** | Move to "Export/Drill-down" modal. Not a main view. |
| `VisualAnalytics.tsx` | **Retire** | Replaced by `Step0_MacroTriage.tsx`. |
| `CostCurves.tsx` | **Refactor** | Rename `Step3_CCE.tsx`. Integrate Ghost Curves. |
| `SensitivityLab.tsx` | **Refactor** | Rename `Step3_Sensitivity.tsx` (Sub-module). |
| `WaterfallAnalysis.tsx`| **Retire** | Superseded by Step 1. |

## 3. Data Contracts & Route Map

### Route Structure
User flow is linear. State is persisted in `ShadowStore` (Zustand or Context).

1.  **Step 0: Macro Triage** (`/shadow/step0`)
    *   **Inputs**: Metric Toggle (Count vs Energy).
    *   **Outputs**: Top NAICS (Table), Top ARC (Table), Sankey Flows.
2.  **Step 1: Bipartite Pivot** (`/shadow/step1?pivot=NAICS&id=311`)
    *   **Inputs**: Selection from Step 0.
    *   **Outputs**: Ranked complements (e.g. Top ARC for NAICS 311), Scatter Plot (Payback vs Propensity).
3.  **Step 2: Firm-Size Gate** (`/shadow/step2`)
    *   **Inputs**: Segment Context (NAICS + ARC).
    *   **Outputs**: 4 Quadrants (Micro/Small/Med/Large) with stats.
    *   **Action**: Select ONE bucket.
4.  **Step 3: Economic Engine** (`/shadow/step3`)
    *   **Inputs**: Fully defined segment.
    *   **Outputs**: CCE Curve, Benchmarks, Sensitivity Controls.

### Shared Metrics Logic (Backend)

All endpoints must use these standard definitions:
*   **Assessment Propensity**: `Count(Assessments) / Total Universe` (Future/External Data) -> Current: `Count(Assessments)`
*   **Implementation Propensity**: `Count(Implemented) / Count(Status Known)`
*   **Market Yield**: `Sum(Implemented Energy)`
*   **Winsorization**: 1st/99th percentile capping for CCE/Payback to remove outliers.

## 4. Implementation Stages (M0-M10)

See `task.md` for the detailed checklist.
