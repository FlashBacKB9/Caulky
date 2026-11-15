FROM python:3.12-slim

WORKDIR /app

# Tesseract: OCR de los tickets
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tesseract-ocr tesseract-ocr-spa && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Si se pidió volver a una copia de la base, espera a que db-backup acabe ANTES de las
# migraciones: así a una copia antigua se le aplican las que le falten.
CMD python -m app.services.db_backups wait; alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
