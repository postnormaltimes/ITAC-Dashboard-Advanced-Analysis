from fastapi import APIRouter
from app.lookups.resource_codes import get_all_resource_codes
from app.lookups.arc_codes import get_all_arc_codes, get_all_app_codes

router = APIRouter()

@router.get("/resource_codes")
def get_resource_codes():
    return get_all_resource_codes()

@router.get("/arc_codes")
def get_arc_codes():
    return get_all_arc_codes()

@router.get("/arc_application_codes")
def get_arc_application_codes():
    return get_all_app_codes()
