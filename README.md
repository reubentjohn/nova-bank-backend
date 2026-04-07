# Nova Bank Backend

Node/Express backend that evaluates VWO Feature Experimentation flags server-side and tracks business metrics.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Then open `.env` and replace `YOUR_ACCOUNT_ID_HERE` with your VWO Account ID.
(Find it in your VWO dashboard URL: `app.vwo.com/a/ACCOUNT_ID/...`)

### 3. Start the server
```bash
node server.js
```

Server runs on `http://localhost:3001`

---

## API Endpoints

### `GET /api/health`
Confirms the server is running.

### `GET /api/features`
Evaluates both VWO flags for a given user context.

**Query params:**
- `user_type` — `new` | `standard` | `premium` (default: `standard`)
- `environment` — `development` | `staging` | `production` (default: `staging`)
- `user_id` — any string (default: `demo_user_001`)

**Example:**
```
GET /api/features?user_type=premium&environment=staging&user_id=user_001
```

**Response:**
```json
{
  "dashboard": {
    "enabled": true,
    "widget_order": ["promo", "balance", "loans", "transactions"],
    "widget_style": "card",
    "hero_copy": "Your financial snapshot",
    "show_promo_banner": true,
    "promo_copy": "You qualify for our premium loan rate"
  },
  "loan": {
    "enabled": true,
    "algo_variant": "aggressive",
    "max_loan_amount": 40000,
    "rate_label": "Premium Rate",
    "risk_tier": "high"
  },
  "meta": {
    "user_id": "user_001",
    "user_type": "premium",
    "environment": "staging"
  }
}
```

### `POST /api/track`
Tracks a named business event in VWO server-side.

**Body:**
```json
{
  "event_key": "loan_application_started",
  "user_id": "user_001",
  "user_type": "premium",
  "environment": "staging"
}
```

**Valid event keys:**
- `promo_clicked`
- `loan_widget_interacted`
- `loan_application_started`
- `loan_application_completed`
- `eligibility_threshold_met`

### `POST /api/simulate`
Fires synthetic events across 20 simulated users to populate VWO metrics for demo purposes.

**Body:**
```json
{
  "environment": "staging",
  "scenario": "high_engagement"
}
```

**Scenarios:** `high_engagement` | `low_engagement`

---

## Connecting to the Lovable Frontend

In the Lovable frontend, replace all hardcoded flag logic with:

```js
const res = await fetch(
  `http://localhost:3001/api/features?user_type=${userType}&environment=${environment}&user_id=demo_user_001`
);
const { dashboard, loan } = await res.json();
// Use dashboard and loan variables to render the UI
```

And replace all inline event tracking with:
```js
await fetch('http://localhost:3001/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event_key: 'loan_application_started', user_type, environment, user_id: 'demo_user_001' })
});
```

When deploying, replace `http://localhost:3001` with your deployed backend URL (Railway, Render, etc).
