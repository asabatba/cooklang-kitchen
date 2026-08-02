FROM alpine:3.20 AS css-builder

RUN apk add --no-cache curl libstdc++ libgcc

WORKDIR /build
RUN curl -sLo tailwindcss https://github.com/tailwindlabs/tailwindcss/releases/download/v4.3.3/tailwindcss-linux-x64-musl \
    && chmod +x tailwindcss

COPY src ./src
RUN ./tailwindcss -i ./src/cooklang_kitchen/static/css/input.css -o ./src/cooklang_kitchen/static/css/app.css --minify

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY --from=css-builder /build/src/cooklang_kitchen/static/css/app.css ./src/cooklang_kitchen/static/css/app.css
RUN pip install --no-cache-dir .

RUN mkdir -p /app/data

EXPOSE 80

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-80} --workers 2 --threads 4 --timeout 120 cooklang_kitchen.wsgi:app"]
