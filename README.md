# ITAC Dashboard

A comprehensive data analytics dashboard for energy efficiency recommendations, built for the Industrial Assessment Center (IAC).

## 🚀 Features
- **Search & Filtering**: Deep filtering capabilities across ARC, NAICS, State, and financial metrics.
- **Visual Analytics**: Interactive charts for savings potential, payback periods, and geographic distribution.
- **Cost Curves**: Supply-demand curves (Cost of Conserved Energy) with sensitivity analysis.
- **Waterfall Analytics**: Hierarchical drill-down of implementation rates.
- **Sensitivity Lab**: Scenario modeling for energy prices and discount rates.
- **Segment Comparison**: A/B testing of different data segments.

## 🛠 Tech Stack
- **Backend**: Python, FastAPI, DuckDB, Pandas
- **Frontend**: TypeScript, React, Vite, Material UI, Recharts, Plotly
- **Data**: Excel/CSV ingestion pipeline

## 🏁 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+

### 1. Backend Setup
Navigate to the `backend` directory:
```bash
cd backend
```

Create a virtual environment and install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Run the server:
```bash
uvicorn app.main:app --reload --port 8000
```
The API will be available at [http://localhost:8000](http://localhost:8000).
API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs).

### 2. Frontend Setup
Navigate to the `frontend` directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Run the development server:
```bash
npm run dev
```
Access the dashboard at [http://localhost:5173](http://localhost:5173).

## 📂 Project Structure
- `backend/app`: FastAPI application code.
- `backend/data`: Data storage (Excel, DuckDB).
- `frontend/src/components`: React UI components.
- `frontend/src/api`: API client configuration.
- `scripts`: Utility scripts for data ingestion and dummy data generation.

## 📝 Scripts
- **Imgest Data**: `python scripts/ingest_excel.py` - Loads Excel data into DuckDB.
- **Generate Dummy Data**: `python scripts/generate_dummy_excel.py` - Creates test data if needed.
