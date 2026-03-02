from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_host: str = "dib-2019006065"
    db_port: int = 49502
    db_name: str = "postgres"
    db_user: str = "postgres"
    db_password: str = ""
    redis_url: str = "redis://redis:6379/0"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
