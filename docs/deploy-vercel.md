# Deploying the backend + demo to Vercel

Vercel hosts the **FastAPI backend** as a Python serverless function, including a
clickable web demo at `/demo`. The native mobile app does **not** run on Vercel
(it needs HealthKit / Health Connect). See the caveats at the bottom.

> You run the deploy (this repo's CI environment can't authenticate to your
> Vercel account). It takes ~1 minute and the config is already in the repo.

## What's already wired

- `backend/api/index.py` — Vercel ASGI entrypoint (exports the FastAPI `app`).
- `backend/vercel.json` — routes every request to the function.
- `backend/requirements.txt` — runtime deps Vercel installs.
- A demo UI at `/demo` + `/demo/token`, active only when `DEMO_MODE=true`.

## Option A — Vercel dashboard (no CLI)

1. Push this branch to GitHub (already done).
2. In Vercel: **Add New… → Project → Import** this repo.
3. Set **Root Directory = `backend`** (important — the function lives there).
4. Add **Environment Variables**:
   | Name | Value |
   | --- | --- |
   | `SUPABASE_JWT_SECRET` | any random string (the demo token is signed with it) |
   | `TOKEN_ENCRYPTION_KEY` | a Fernet key — generate with the command below |
   | `DEMO_MODE` | `true` |
   | `ALLOWED_ORIGINS` | `*` (demo only) |
5. **Deploy**. Your link is `https://<project>.vercel.app/demo`.

```bash
# Generate a Fernet key for TOKEN_ENCRYPTION_KEY:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Option B — Vercel CLI

```bash
npm i -g vercel
cd backend
vercel            # first run links/creates the project; set root to current dir
vercel env add SUPABASE_JWT_SECRET     # paste a random string
vercel env add TOKEN_ENCRYPTION_KEY    # paste a Fernet key (command above)
vercel env add DEMO_MODE               # true
vercel --prod
```

## Using the link

- Open `https://<project>.vercel.app/demo` and click through:
  1. **Start demo session** (mints a JWT for a throwaway user)
  2. read samples **without** consent → `403` (the gate)
  3. **grant consent** → push a sample → view samples + the audit trail
- `GET /health` and the Swagger UI at `/docs` are also live.

## Caveats (important)

- **Serverless = ephemeral.** The backend currently uses an in-memory store, so
  data resets between cold starts. Fine for a demo; persistent storage (Supabase)
  is a later module. For a stateful deployment, prefer Render/Railway/Fly (the
  targets named in `CLAUDE.md`).
- **`DEMO_MODE` is an auth shortcut.** It exposes a token minter with no real
  login. Never enable it on a production deployment that holds real data.
- **Whoop OAuth** needs real `WHOOP_CLIENT_ID/SECRET` and a redirect URI matching
  the deployed domain; the `/demo` flow exercises the on-device push path instead,
  which needs no third party.
