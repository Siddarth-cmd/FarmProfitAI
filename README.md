# FarmProfit AI

FarmProfit AI helps farmers decide **where** and **when** to sell produce by comparing market prices, transportation costs, and other selling costs, then recommending the option with the highest expected net return.

This repository currently contains the project foundation only: folder layout, a FastAPI health check, and a minimal React + Vite + Tailwind frontend. Business logic, market integrations, and UI are not implemented yet.

## Architecture

```
Farmer Input
    → Market Data Layer
    → Data Validation
    → Profit Calculation Engine
    → Recommendation Engine
    → Explanation + Confidence
    → Farmer
```

Layers stay separate on purpose:

| Layer | Location | Role |
| --- | --- | --- |
| API | `backend/api/` | HTTP endpoints for farmer input and results |
| Core | `backend/core/` | Shared config and validation |
| Models | `backend/models/` | Domain and data shapes |
| Services | `backend/services/` | Market data, costs, profit calculation |
| Recommendation | `backend/recommendation/` | Explainable ranking of selling options |
| ML | `backend/ml/` | Optional forecasting; not required for MVP recommendations |
| Data | `backend/data/` and `data/` | Validated market data and fallbacks |

### Design principles

1. Recommendations must stay **explainable**.
2. Market data and API responses are never invented.
3. Market data, profit calculation, recommendation logic, and ML stay in separate modules.
4. ML/forecasting is **optional**. The basic engine must work without it.
5. If an external market-data source fails, the system should fall back to the latest validated data.
6. Keep the MVP small. Docker and extra services come later.

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Python, FastAPI
- **Database:** PostgreSQL (not wired up yet)
- **AI/ML (later):** Pandas, NumPy, scikit-learn
- **Version control:** Git

## Project structure

```
FarmProfitAI/
├── frontend/          # React + Vite + Tailwind
├── backend/           # FastAPI application
│   ├── api/
│   ├── core/
│   ├── models/
│   ├── services/
│   ├── recommendation/
│   ├── ml/
│   └── data/
├── data/              # Shared/validated data (no mock market feeds)
├── docs/
├── .gitignore
└── README.md
```

## Run the backend

From the repository root:

```bash
cd backend
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

macOS / Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite app is a placeholder so the toolchain can start. There is no farmer UI yet.
