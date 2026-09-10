# Phase 4.5: location-sharing REST API. Plain python:slim + uvicorn rather
# than a heavier base image — this service is four small endpoints over one
# Postgres table, no reason for anything bigger.
FROM python:3.13-slim

WORKDIR /app
COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/main.py .

EXPOSE 8090
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090"]
