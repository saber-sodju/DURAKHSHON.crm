FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# apply migrations, seed demo data (skips if already seeded), start the API.
# --proxy-headers: the app sits behind nginx + Railway's edge, so real client IPs
# arrive in X-Forwarded-For; without this every user would share one rate-limit bucket.
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
