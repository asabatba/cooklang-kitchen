FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

RUN mkdir -p /app/data

EXPOSE 80

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-80} --workers 2 --threads 4 --timeout 120 cooklang_kitchen.wsgi:app"]
