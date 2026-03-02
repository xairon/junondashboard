FROM python:3.11.9-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir . \
    && addgroup --system app && adduser --system --ingroup app app

COPY app/ app/

USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
