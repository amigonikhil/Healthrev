"""Demo-only endpoints: a clickable web walkthrough and a token minter.

ENABLED ONLY when DEMO_MODE is set. This is an intentional auth shortcut so the
hosted demo can be clicked through without a Supabase project; it must never be
enabled in production. When DEMO_MODE is off, every route here returns 404.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse

from app.config import Settings, get_settings

router = APIRouter(tags=["demo"])


def _require_demo(settings: Settings) -> None:
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


@router.post("/demo/token")
async def demo_token(settings: Settings = Depends(get_settings)) -> dict:
    """Mint a short-lived JWT for a fresh demo user (DEMO_MODE only)."""
    _require_demo(settings)
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET is not configured",
        )
    user_id = f"demo-{uuid.uuid4().hex[:12]}"
    token = jwt.encode(
        {
            "sub": user_id,
            "email": f"{user_id}@demo.local",
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=2),
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"access_token": token, "user_id": user_id}


@router.get("/demo", response_class=HTMLResponse)
async def demo_page(settings: Settings = Depends(get_settings)) -> HTMLResponse:
    _require_demo(settings)
    return HTMLResponse(_PAGE)


_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Chronic Health Tracker — API demo</title>
<style>
  :root { --blue:#1f6feb; --bg:#0d1117; --card:#161b22; --line:#30363d; --txt:#e6edf3; --muted:#8b949e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:var(--bg); color:var(--txt); line-height:1.5; }
  .wrap { max-width:760px; margin:0 auto; padding:24px 18px 60px; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.sub { color:var(--muted); margin:0 0 20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin:12px 0; }
  .step { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  h2 { font-size:16px; margin:4px 0 10px; }
  button { background:var(--blue); color:#fff; border:0; border-radius:8px; padding:10px 14px;
           font-size:14px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  button.secondary { background:#21262d; border:1px solid var(--line); }
  select, input { background:#0d1117; color:var(--txt); border:1px solid var(--line);
                  border-radius:8px; padding:9px; font-size:14px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  pre { background:#0d1117; border:1px solid var(--line); border-radius:8px; padding:10px;
        overflow:auto; font-size:12.5px; margin:10px 0 0; white-space:pre-wrap; word-break:break-word; }
  table { width:100%; border-collapse:collapse; margin-top:10px; font-size:14px; }
  th,td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; }
  .pill { display:inline-block; font-size:12px; padding:2px 8px; border-radius:999px; }
  .ok { background:#10331c; color:#3fb950; } .no { background:#3d1418; color:#f85149; }
  .note { font-size:12.5px; color:var(--muted); }
  code { background:#0d1117; padding:1px 5px; border-radius:5px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Chronic Health Tracker — live API demo</h1>
  <p class="sub">A clickable walkthrough of the consent-gated wearable pipe (M0 + M1).
  This drives the real backend; the native mobile app isn't shown here.</p>

  <div class="card">
    <div class="step">Step 1 — Identify</div>
    <h2>Start a demo session</h2>
    <p class="note">Mints a short-lived JWT for a throwaway demo user (the real app
    gets this from Supabase email-OTP login).</p>
    <div class="row">
      <button id="btnToken" onclick="getToken()">Start demo session</button>
      <span id="who" class="note"></span>
    </div>
  </div>

  <div class="card">
    <div class="step">Step 2 — Try without consent</div>
    <h2>Read samples (expect 403)</h2>
    <p class="note">Every health-data read requires valid consent — this should be denied.</p>
    <button class="secondary" onclick="listSamples('noconsent')" id="btnNoConsent" disabled>GET /wearables/samples</button>
    <pre id="out-noconsent">—</pre>
  </div>

  <div class="card">
    <div class="step">Step 3 — Consent (DPDPA)</div>
    <h2>Grant wearable_sync consent</h2>
    <button onclick="grantConsent()" id="btnConsent" disabled>POST /consents</button>
    <span id="consentState"></span>
    <pre id="out-consent">—</pre>
  </div>

  <div class="card">
    <div class="step">Step 4 — Push on-device data</div>
    <h2>Send a HealthKit-style sample</h2>
    <div class="row">
      <select id="metric">
        <option value="steps">steps</option>
        <option value="resting_heart_rate">resting_heart_rate</option>
        <option value="hrv">hrv</option>
        <option value="sleep_duration">sleep_duration</option>
        <option value="respiratory_rate">respiratory_rate</option>
      </select>
      <input id="value" type="number" value="8421" style="width:120px" />
      <button onclick="pushSample()" id="btnPush" disabled>POST device samples</button>
    </div>
    <pre id="out-push">—</pre>
  </div>

  <div class="card">
    <div class="step">Step 5 — View</div>
    <h2>Samples &amp; audit trail</h2>
    <div class="row">
      <button onclick="listSamples('samples')" id="btnSamples" disabled>GET /wearables/samples</button>
      <button class="secondary" onclick="getAudit()" id="btnAudit" disabled>GET /audit</button>
    </div>
    <div id="samplesTable"></div>
    <p class="note" style="margin-top:14px">Audit trail (note: counts only — <b>no health values</b> are ever logged):</p>
    <pre id="out-audit">—</pre>
  </div>

  <p class="note">⚠️ Hosted serverless: data lives in memory and resets between cold starts.
  Persistent storage (Supabase) is wired in a later module.</p>
</div>

<script>
let TOKEN = null;
const $ = (id) => document.getElementById(id);
const H = () => ({ "Content-Type": "application/json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}) });

async function call(method, path, body) {
  const res = await fetch(path, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
function show(id, r) { $("out-" + id).textContent = r.status + "  " + JSON.stringify(r.data, null, 2); }

async function getToken() {
  const r = await call("POST", "/demo/token");
  if (r.status === 200) {
    TOKEN = r.data.access_token;
    $("who").textContent = "✓ signed in as " + r.data.user_id;
    ["btnNoConsent","btnConsent","btnPush","btnSamples","btnAudit"].forEach(id => $(id).disabled = false);
  } else { $("who").textContent = "demo mode is off (status " + r.status + ")"; }
}
async function grantConsent() {
  const r = await call("POST", "/consents", { purpose: "wearable_sync", policy_version: "v1" });
  show("consent", r);
  $("consentState").innerHTML = r.status === 201
    ? ' <span class="pill ok">consent granted</span>' : ' <span class="pill no">failed</span>';
}
async function pushSample() {
  const now = new Date();
  const start = new Date(now.getTime() - 3600_000);
  const body = { samples: [{ metric: $("metric").value, value: Number($("value").value),
    start_time: start.toISOString(), end_time: now.toISOString() }] };
  show("push", await call("POST", "/wearables/device/apple_health/samples", body));
}
async function listSamples(target) {
  const r = await call("GET", "/wearables/samples");
  if (target === "noconsent") { show("noconsent", r); return; }
  if (r.status !== 200) { $("samplesTable").innerHTML = '<pre>' + r.status + '  ' + JSON.stringify(r.data) + '</pre>'; return; }
  const rows = r.data.map(s => `<tr><td>${s.metric}</td><td>${s.value} ${s.unit}</td><td>${new Date(s.start_time).toLocaleString()}</td></tr>`).join("");
  $("samplesTable").innerHTML = r.data.length
    ? `<table><tr><th>Metric</th><th>Value</th><th>When</th></tr>${rows}</table>`
    : '<p class="note">No samples yet — push one in step 4.</p>';
}
async function getAudit() { show("audit", await call("GET", "/audit")); }
</script>
</body>
</html>
"""
