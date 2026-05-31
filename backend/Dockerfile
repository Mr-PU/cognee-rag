FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

RUN mkdir -p /app/uploads /app/.cognee_data /app/.cognee_system

ENV DATA_ROOT_DIRECTORY=/app/.cognee_data
ENV SYSTEM_ROOT_DIRECTORY=/app/.cognee_system
ENV COGNEE_SKIP_CONNECTION_TEST=true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
