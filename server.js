const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getVWOClient } = require('./vwoClient');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// HELPER: build VWO user context from request params
// ---------------------------------------------------------------------------
function buildUserContext(userId, userType) {
  return {
    id: userId,
    customVariables: {
      user_type: userType,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/features
// Query params: user_type, environment, user_id
// Returns evaluated flag variables for nova_dashboard + loan_eligibility_algo
// ---------------------------------------------------------------------------
app.get('/api/features', async (req, res) => {
  const { user_type = 'standard', environment = 'staging', user_id = 'demo_user_001' } = req.query;

  console.log(`[/api/features] user_type=${user_type}, env=${environment}, user_id=${user_id}`);

  try {
    const vwoClient = await getVWOClient(environment);
    const userContext = buildUserContext(user_id, user_type);

    // --- Evaluate nova_dashboard flag ---
    const dashboardFlag = await vwoClient.getFlag('nova_dashboard', userContext);
    console.log('dashboard flag object:', JSON.stringify(dashboardFlag));
    console.log('dashboard isEnabled:', dashboardFlag.isEnabled());
    console.log('dashboard variables:', dashboardFlag.getVariables());
    const dashboardEnabled = dashboardFlag.isEnabled();

    const dashboard = {
      enabled: dashboardEnabled,
      widget_order: dashboardEnabled
        ? (dashboardFlag.getVariable('widget_order', 'balance,transactions,loans') || 'balance,transactions,loans').split(',')
        : ['balance', 'transactions', 'loans'],
      widget_style: dashboardEnabled ? dashboardFlag.getVariable('widget_style', 'list') : 'list',
      hero_copy: dashboardEnabled ? dashboardFlag.getVariable('hero_copy', 'Welcome back') : 'Welcome back',
      show_promo_banner: dashboardEnabled ? dashboardFlag.getVariable('show_promo_banner', false) : false,
      promo_copy: dashboardEnabled ? dashboardFlag.getVariable('promo_copy', '') : '',
    };

    // --- Evaluate loan_eligibility_algo flag ---
    const loanFlag = await vwoClient.getFlag('loan_eligibility_algo', userContext);
    console.log('loan flag object:', JSON.stringify(loanFlag));
    console.log('loan isEnabled:', loanFlag.isEnabled());
    console.log('loan variables:', loanFlag.getVariables());    
    const loanEnabled = loanFlag.isEnabled();

    const maxLoanAmount = loanEnabled ? loanFlag.getVariable('max_loan_amount', 5000) : 5000;

    const loan = {
      enabled: loanEnabled,
      algo_variant: loanEnabled ? loanFlag.getVariable('algo_variant', 'conservative') : 'conservative',
      max_loan_amount: maxLoanAmount,
      rate_label: loanEnabled ? loanFlag.getVariable('rate_label', 'Introductory Rate') : 'Introductory Rate',
      risk_tier: loanEnabled ? loanFlag.getVariable('risk_tier', 'low') : 'low',
    };

    // --- Auto-track eligibility threshold metric (server-side business metric) ---
    if (loanEnabled && maxLoanAmount >= 20000) {
      try {
        await vwoClient.trackEvent('eligibility_threshold_met', userContext);
        console.log(`[VWO Track] eligibility_threshold_met for user=${user_id}, amount=${maxLoanAmount}`);
      } catch (trackErr) {
        console.error('[VWO Track] Failed to track eligibility_threshold_met:', trackErr.message);
      }
    }

    return res.json({ dashboard, loan, meta: { user_id, user_type, environment } });

  } catch (err) {
    console.error('[/api/features] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/track
// Body: { event_key, user_id, user_type, environment }
// Tracks a named event in VWO server-side
// ---------------------------------------------------------------------------
app.post('/api/track', async (req, res) => {
  const { event_key, user_id = 'demo_user_001', user_type = 'standard', environment = 'staging' } = req.body;

  const VALID_EVENTS = [
    'promo_clicked',
    'loan_widget_interacted',
    'loan_application_started',
    'loan_application_completed',
    'eligibility_threshold_met',
  ];

  if (!event_key || !VALID_EVENTS.includes(event_key)) {
    return res.status(400).json({ error: `Invalid event_key. Valid keys: ${VALID_EVENTS.join(', ')}` });
  }

  console.log(`[/api/track] event=${event_key}, user_type=${user_type}, env=${environment}, user_id=${user_id}`);

  try {
    const vwoClient = await getVWOClient(environment);
    const userContext = buildUserContext(user_id, user_type);

    await vwoClient.trackEvent(event_key, userContext);

    return res.json({ success: true, event: event_key, user_id, environment });

  } catch (err) {
    console.error('[/api/track] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/simulate
// Body: { environment, scenario }
// Fires synthetic events for demo purposes — populates VWO metrics dashboard
// ---------------------------------------------------------------------------
app.post('/api/simulate', async (req, res) => {
  const { environment = 'staging', scenario = 'high_engagement' } = req.body;

  console.log(`[/api/simulate] scenario=${scenario}, env=${environment}`);

  const segments = ['new', 'standard', 'premium'];

  // Define what events each scenario fires per user
  const scenarios = {
    high_engagement: {
      new: ['loan_widget_interacted', 'loan_application_started'],
      standard: ['loan_widget_interacted', 'promo_clicked', 'loan_application_started'],
      premium: ['promo_clicked', 'loan_widget_interacted', 'loan_application_started', 'loan_application_completed'],
    },
    low_engagement: {
      new: [],
      standard: ['loan_widget_interacted'],
      premium: ['promo_clicked'],
    },
  };

  const eventMap = scenarios[scenario] || scenarios.high_engagement;

  try {
    const vwoClient = await getVWOClient(environment);
    const results = [];
    const runId = Date.now();

    // Simulate 20 users — distribute across segments
    for (let i = 1; i <= 20; i++) {
      const segmentIndex = (i - 1) % 3;
      const userType = segments[segmentIndex];
      const userId = `sim_user_${runId}_${String(i).padStart(3, '0')}`;
      const userContext = buildUserContext(userId, userType);
      const events = eventMap[userType] || [];

      // MUST bucket the user first before tracking events
      await vwoClient.getFlag('nova_dashboard', userContext);
      await vwoClient.getFlag('loan_eligibility_algo', userContext);
       
      for (const eventKey of events) {
        try {
          await vwoClient.trackEvent(eventKey, userContext);
          results.push({ userId, userType, eventKey, status: 'ok' });
          console.log(`[Simulate] Tracked ${eventKey} for ${userId} (${userType})`);
        } catch (e) {
          results.push({ userId, userType, eventKey, status: 'error', error: e.message });
        }
      }
    }

    return res.json({
      success: true,
      scenario,
      environment,
      total_users: 20,
      total_events: results.filter(r => r.status === 'ok').length,
      results,
    });

  } catch (err) {
    console.error('[/api/simulate] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/health
// Simple health check — confirms server + VWO connectivity
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environments: ['development', 'staging', 'production'],
  });
});

// ----------------
// cache refresh - POST http://localhost:3001/api/reset-cache
// ---------------------
app.post('/api/reset-cache', (req, res) => {
  Object.keys(clientCache).forEach(k => delete clientCache[k]);
  res.json({ success: true, message: 'VWO client cache cleared' });
});

app.listen(PORT, () => {
  console.log(`\n🏦 Nova Bank Backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Features API: http://localhost:${PORT}/api/features?user_type=premium&environment=staging\n`);
});
