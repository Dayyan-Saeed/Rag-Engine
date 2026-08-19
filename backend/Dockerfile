FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade "pip>=26.1.2" "setuptools>=83"
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

RUN useradd -m -u 1000 raguser
USER raguser

EXPOSE 8000

CMD ["sh", "-c", "if [ \"$DEBUG\" = \"true\" ]; then exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload; else exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}; fi"]