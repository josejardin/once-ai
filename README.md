# ONCE AI - Oversight Network for Clean Elections (prototype)

AI-assisted voter-registration **oversight and screening** prototype. It helps election officers spot suspicious
registration patterns - especially residents of one barangay declaring another to register there - **before voter rolls
are finalized**. It is an additional preventive screening and investigation-support layer; it does **not** replace AFIS,
existing COMELEC verification, or the authority of the Election Registration Board (ERB).

> **All data is synthetic.** The LGU ("Santa Demo, Nueva Demo"), barangays, people, addresses and documents are fictitious.
> Nothing here is COMELEC data, and there is no connection to COMELEC systems or AFIS.

## Quick Start

### 1. One-Click Launcher (Windows)
Double-click `start_all.bat` to launch both the FastAPI Biometric Engine (`http://127.0.0.1:8000`) and the Vite Frontend (`http://localhost:5174/`).

### 2. Manual Setup

**Frontend (Node.js 18+):**
```bash
npm install
npm run dev -- --port 5174 --host
```
Open `http://localhost:5174/` in your browser.

**Biometric Backend (Python 3.10+ with DeepFace):**
```bash
cd biometric-service
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Run Self-Tests:**
```bash
npm test
```

No database, API keys or `.env` file are needed. The map uses OpenStreetMap tiles, so the basemap needs internet access;
all overlays and every other feature work offline.

## The five core capabilities and where they live

| Capability | Where in the app | Status |
|---|---|---|
| 1. Address standardization & normalization | Registration Intake (live preview); `src/lib/address.js` | **Implemented** (rule-based, demo gazetteer). Geocoding is an **offline simulation**. |
| 2. Spatial Anomaly Radar | Geospatial Intelligence; `src/lib/dbscan.js`, `pipeline.js` | **Implemented**: real DBSCAN, barangay baselines, known-building context, Leaflet + OSM. |
| 3. Batch Forgery Detector | AI Screening -> Handwriting similarity; `src/lib/handwriting.js` | **Simulated.** No OCR, no trained Siamese network. Synthetic embeddings + cosine similarity. |
| 4. ERB Triage Dashboard | Dashboard, AI Screening, Investigation Cases | **Implemented**: five explainable indicators, configurable *provisional* weights, human-only dispositions. |
| 5. Secure Audit Dossier | Investigation Cases / dossier drawer, Audit Logs & System | **Implemented (prototype)**: notes, history, JSON/HTML export, hash-chained demo log. Not production-secure. |

The seven pages share one data pipeline (`src/lib/pipeline.js`). Dashboard numbers, charts, clusters, case lists and
reports are all derived from the same application records; nothing is hard-coded.

## UI notes

- PLDT-inspired palette and Montserrat typography (bundled locally); Lucide line icons (`lucide-react`).
- Each page opens with a red gradient header; the Dashboard header carries the headline numbers.
- The full synthetic-data notice appears on the Dashboard and Audit Logs pages; other pages show a slim strip (hover for the full text).
- Geospatial Intelligence shows cluster details in a slide-in panel over the map; clusters needing review pulse.
- Animations respect the OS "reduce motion" setting. The map shows a loading skeleton until tiles load (or 2.5 s offline).

## Safeguards built in

- No application is ever automatically approved, rejected or disqualified. Resolving a case requires a human
  disposition **and** a written rationale.
- Labels (Low / Moderate / High) mean *review priority*, not guilt. The score is not a probability of fraud.
- A **High** label requires at least two independent indicators; geographic density alone can never reach High.
- Clusters inside known dormitories/apartments are marked "plausibly explained by context"; where context data is
  missing the cluster says so ("LIMITATION: ...").
- Handwriting similarity is labeled **Simulated** everywhere and carries a "not proof of forgery" notice.
- Weights and thresholds are labeled **provisional demonstration settings**.

## Try these demo scenarios

1. **Dashboard -> Priority queue -> APP-0090 area**: Sitio Riverside, Brgy. Sampaguita (cluster `CL-0089`): 16 forms from
   three third-party batch drop-offs, many with supporting documents from another barangay, some with similar handwriting.
2. **Geospatial Intelligence**: the Dalisay Student Residences cluster is gray ("plausibly explained by context"); the
   Kalayaan cluster has **no context data**, so the limitation is stated.
3. **Registration Intake**: click the example chips (colloquial "tapat ng simbahan", misspelled "Sampagita", landmark-only
   "malapit sa palengke" which is correctly left unresolved).
4. **AI Screening -> Provisional settings** (switch role to *Administrator*): change DBSCAN eps/minPts or weights and watch
   every page recompute.
5. **Investigation Cases**: open a case, add notes, change status, record a disposition; see it in Audit Logs.

## Demo roles (not real authentication)

The role switcher (sidebar) disables controls in the UI: *Viewer* is read-only, *ERB Reviewer* can intake and work cases,
*Administrator* can also change settings and reset data. There is **no login or server-side enforcement**.

## Project structure

```
src/
  lib/        address.js  dbscan.js  handwriting.js  pipeline.js  gazetteer.js  geo.js  export.js  rng.js
  data/       seed.js              synthetic applications (129) with scripted scenarios
  components/ MapView.jsx  Dossier.jsx  Handwriting.jsx  ui.jsx
  pages/      Dashboard  Intake  Screening  Geo  Cases  Analytics  System
  store.jsx   shared state (React context + localStorage persistence) and audit log
scripts/selftest.mjs               logic tests
```

## Known limitations

- **Design:** this is a new build (the deployed site could not be accessed), themed with a PLDT-inspired palette (signal red, deep crimson, white and gray; light theme default, dark theme available). Colors and typography (Montserrat, bundled locally via @fontsource) are inspired by the PLDT Home website; no PLDT logo or trademarks are included. Layout/branding of the original site is not pixel-matched.
- **OCR is not integrated.** Uploaded images are only previewed; the address is entered manually. For uploads, the
  handwriting comparison is simulated from the file name/size, not from the real image.
- **No trained handwriting model.** The comparator is a stand-in for a Siamese Neural Network.
- **Geocoding is simulated** from a small fictitious gazetteer; real Philippine address resolution would need a real
  geocoder and PSGC/barangay boundary data.
- **Storage is browser localStorage**: not secure, not tamper-proof; the audit hash chain is a demonstration only.
- **No backend or PostgreSQL.** The data layer is modular so a Node/Express + PostgreSQL API can replace it.
  Target deployment (ePLDT Sovereign Cloud) is planned, not done.
- Priority weights/thresholds are illustrative and unvalidated; building capacities and barangay baselines are synthetic.
- Tested in headless Chrome (desktop and 390 px mobile widths). Not tested in Safari/Firefox.
