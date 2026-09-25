FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Fonts for the BGB briefing cards, which are drawn in fifteen languages. The
# slim image ships none at all, and the choices here are not interchangeable:
#   dejavu      Latin, and the only packaged face that both covers Arabic and
#               carries Latin, which a card needs for the player names.
#   noto-cjk    Korean, Japanese and both Chinese, in one collection.
#   tlwg-loma   Thai. Noto's Thai face holds Thai and nothing else -- not one
#               Latin letter -- so it cannot draw a card on its own.
RUN apt-get update && apt-get install -y --no-install-recommends \
        fonts-dejavu-core fonts-noto-cjk fonts-tlwg-loma-ttf \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so a code-only change reuses this layer.
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY migrations ./migrations

# Never run as root: the container needs no privileges beyond outbound HTTPS.
# USER must be NUMERIC — with runAsNonRoot, kubelet cannot verify a named
# user is non-root and refuses to start the container.
RUN useradd --create-home --uid 10001 dws && chown -R dws:dws /app
USER 10001

EXPOSE 8000

# Migrations run at start-up. Safe because the deployment is pinned to a single
# replica, so two pods can never race on the same Alembic upgrade.
CMD ["sh", "-c", "alembic upgrade head && python -m dwsbot.main"]
