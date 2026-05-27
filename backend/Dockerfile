FROM python:3.12-slim

WORKDIR /app

# Install Node.js (required for Claude Code CLI)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates \
        libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender1 && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g @anthropic-ai/claude-code && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models so the container doesn't need internet at runtime
RUN python -c "import easyocr; easyocr.Reader(['es', 'en'], gpu=False)"

COPY . .

# Install the spendly-query/write helpers so Claude can call them by name
RUN install -m 755 scripts/spendly_query.py /usr/local/bin/spendly-query && \
    install -m 755 scripts/spendly_write.py /usr/local/bin/spendly-write

EXPOSE 8000

CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
