from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    client_url: str = "http://localhost:3000"

    # 32-byte hex — generate: python -c "import secrets; print(secrets.token_hex(32))"
    master_key: str = "a" * 64

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""  # Settings > API > JWT Secret in Supabase dashboard

    # Market data
    polygon_api_key: str = ""
    finnhub_api_key: str = ""

    # AI
    gemini_api_key: str = ""
    # Rolling aliases, not dated snapshots — Google deprecates dated model IDs
    # (gemini-2.0-flash, etc.) without warning; override via env if these ever move.
    gemini_model: str = "gemini-flash-latest"
    gemini_model_lite: str = "gemini-flash-lite-latest"

    # News & comms
    newsapi_key: str = ""
    resend_api_key: str = ""
    resend_from_email: str = "alerts@tradrnotebook.app"
    sentry_dsn: str = ""


settings = Settings()
