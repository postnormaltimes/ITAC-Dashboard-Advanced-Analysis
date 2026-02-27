
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router
from app.api.cost_curves import router as cost_curves_router
from app.api.waterfall import router as waterfall_router
from app.api.analytics import router as analytics_router
from app.api.sensitivity import router as sensitivity_router
from app.api.shadow.step0 import router as step0_router
from app.api.shadow.step1 import router as step1_router
from app.api.shadow.step2 import router as step2_router
from app.api.shadow.step3 import router as step3_router
from app.api.advanced_analytics import router as advanced_router
from app.api.lookups_api import router as lookups_router

app = FastAPI(title="ITAC Dashboard API", version="1.0.0")

# Input: CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(cost_curves_router, prefix="/api/cost_curves", tags=["Cost Curves"])
app.include_router(waterfall_router, prefix="/api/waterfall", tags=["Waterfall Analytics"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["Visual Analytics"])
app.include_router(sensitivity_router, prefix="/api/sensitivity", tags=["Sensitivity Lab"])
app.include_router(step0_router, prefix="/api/shadow", tags=["Shadow Dashboard Step 0"])
app.include_router(step1_router, prefix="/api/shadow", tags=["Shadow Dashboard Step 1"])
app.include_router(step2_router, prefix="/api/shadow", tags=["Shadow Dashboard Step 2"])
app.include_router(step3_router, prefix="/api/shadow", tags=["Shadow Dashboard Step 3"])
app.include_router(advanced_router, prefix="/api/advanced", tags=["Advanced Dashboard"])
app.include_router(lookups_router, prefix="/api/lookups", tags=["Lookups"])

@app.get("/")
def health_check():
    return {"status": "ok", "message": "ITAC Dashboard Backend is running"}
