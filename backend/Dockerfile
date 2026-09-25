# Pillow, built against Raqm.
#
# Raqm is what joins Arabic letters and puts the line in right-to-left order.
# No Pillow wheel on PyPI has it -- checked from 10.4 to 12.3, every Linux wheel
# carries harfbuzz for FreeType's hinting and no raqm or fribidi at all -- so a
# pip-installed Pillow draws the Arabic card in isolated letterforms, backwards.
# A Mac's Pillow does have Raqm, which is why this only shows up on the server.
# Building it here is what keeps the two drawing the same card.
#
# Pinned, because a source build is only worth its minute if it is cached, and
# an unpinned one rebuilds whenever PyPI moves. Keep it at or above the floor
# pyproject sets, and pip will leave this wheel alone when it installs the app.
FROM python:3.12-slim AS pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libraqm-dev libfreetype6-dev libjpeg62-turbo-dev zlib1g-dev \
    && pip wheel --no-cache-dir --no-binary=pillow --wheel-dir=/wheels "pillow==12.3.0"


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
# The libraries after the fonts are the runtime half of the Pillow built above.
# A wheel carries its own copies; one built from source links the system's, so
# they have to be here or importing PIL fails outright.
RUN apt-get update && apt-get install -y --no-install-recommends \
        fonts-dejavu-core fonts-noto-cjk fonts-tlwg-loma-ttf \
        libraqm0 libfreetype6 libjpeg62-turbo zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so a code-only change reuses this layer.
COPY pyproject.toml ./
COPY src ./src
COPY --from=pillow /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl \
    && pip install --no-cache-dir . \
    && rm -rf /wheels \
    && python -c "import PIL.features as f; assert f.check('raqm'), 'Pillow has no Raqm'"

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
