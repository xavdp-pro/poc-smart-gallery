# Running Smart Gallery with Docker or Podman

The app runs as a single container: one Node process serves both the API and the built frontend (SPA).

## Prerequisites

- **Docker**: [Docker Engine](https://docs.docker.com/engine/install/) and Docker Compose
- **Podman**: [Podman](https://podman.io/) (use `podman-compose` or `podman run` with the same image)

## Quick start

1. **Create a `.env` file** (optional; defaults work for local try-out):

   ```env
   JWT_SECRET=your-secret-at-least-32-chars
   APP_URL=http://localhost:8888
   # Optional: OPENAI_API_KEY=... OPENROUTER_API_KEY=... etc.
   ```

2. **Build and run with Docker Compose**:

   ```bash
   docker compose up -d --build
   ```

   With **Podman**:

   ```bash
   podman-compose up -d --build
   # or: podman build -t smart-gallery . && podman run -d -p 8888:8888 -e JWT_SECRET=xxx smart-gallery
   ```

3. **Open the app**: http://localhost:9998 (same port as local prod frontend)

4. **Create admin user** (first run):

   ```bash
   docker compose exec app node create-admin.js
   # Podman: podman exec -it <container_id> node create-admin.js
   ```

   Default credentials: `admin@admin.com` / `admin123` (change in production).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (prod) | Secret for JWT (min 32 chars). |
| `APP_URL` | No | Public URL of the app (e.g. for emails). Default: `http://localhost:9998` |
| `DATABASE_PATH` | No | Set by Compose to `/app/data/database.db`. |
| `OPENAI_API_KEY` | No | OpenAI API key for GPT-4o. |
| `OPENROUTER_API_KEY` | No | OpenRouter key (Gemini, Qwen, etc.). |
| `GROK_API_KEY` | No | xAI Grok key. |
| `OLLAMA_URL` | No | Ollama URL (e.g. `http://host.containers.internal:11434`). |
| `MAILJET_*`, `EMAIL_FROM` | No | Email for password reset. |

## Volumes

- **gallery-data**: SQLite DB and app data (`/app/data`).
- **gallery-uploads**: Uploaded photos (`/app/uploads`).

Data persists across container restarts.

## Commands

```bash
# Build and start
docker compose up -d --build

# Logs
docker compose logs -f app

# Stop
docker compose down

# Stop and remove volumes (deletes DB and uploads)
docker compose down -v
```

## Single run with Podman

```bash
podman build -t smart-gallery .
podman run -d --name smart-gallery \
  -p 9998:8888 \
  -e JWT_SECRET=your-secret \
  -e SERVE_APP=1 \
  -e DATABASE_PATH=/app/data/database.db \
  -v smart-gallery-data:/app/data \
  -v smart-gallery-uploads:/app/uploads \
  smart-gallery
```

## Port

The app listens on **8888** inside the container. It is mapped to **9998** on the host (same as local prod). To use 8888 on the host, set `"8888:8888"` in `docker-compose.yml`.
