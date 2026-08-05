from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter()

_mock_maintenance_mode = False


def _get_sb():
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


class SetMaintenanceModeRequest(BaseModel):
    enabled: bool


@router.get("/admin/maintenance")
async def get_maintenance_mode(user_id: str = Depends(get_current_user)):
    sb = _get_sb()
    if sb:
        result = (
            sb.table("system_config")
            .select("value")
            .eq("key", "maintenance_mode")
            .single()
            .execute()
        )
        enabled = bool(result.data) and result.data["value"] == "true"
        return {"enabled": enabled}
    return {"enabled": _mock_maintenance_mode}


@router.put("/admin/maintenance")
async def set_maintenance_mode(
    body: SetMaintenanceModeRequest,
    user_id: str = Depends(get_current_user),
):
    global _mock_maintenance_mode
    sb = _get_sb()
    if sb:
        sb.table("system_config").upsert(
            {"key": "maintenance_mode", "value": "true" if body.enabled else "false"}
        ).execute()
        return {"enabled": body.enabled}

    _mock_maintenance_mode = body.enabled
    return {"enabled": _mock_maintenance_mode}
