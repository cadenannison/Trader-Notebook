from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    client_url: str = "http://localhost:3000"
    # 32-byte hex key — generate with: python -c "import secrets; print(secrets.token_hex(32))"
    master_key: str = "a" * 64

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""

    polygon_api_key: str = ""
    newsapi_key: str = ""
    gemini_api_key: str = ""
    resend_api_key: str = ""


settings = Settings()
