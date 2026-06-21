# Hiking Club Application — container image
FROM python:3.12-slim

# Don't buffer stdout/stderr (so logs show up immediately) and don't write .pyc.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source.
COPY . .

# Seed the database at build time so the container is usable immediately.
# (Remove this line if you prefer to seed at runtime / mount a volume.)
RUN python seed.py

EXPOSE 5000

# app.py binds to 0.0.0.0:5000 and seeds the DB on first run if it's missing.
CMD ["python", "app.py"]
