const { init } = require('vwo-fme-node-sdk');
require('dotenv').config();

const SDK_KEYS = {
  development: process.env.VWO_SDK_KEY_DEV,
  staging: process.env.VWO_SDK_KEY_STAGING,
  production: process.env.VWO_SDK_KEY_PROD,
};

const ACCOUNT_ID = process.env.VWO_ACCOUNT_ID;

const clientCache = {};

async function getVWOClient(environment) {
  if (clientCache[environment]) return clientCache[environment];

  const sdkKey = SDK_KEYS[environment];
  if (!sdkKey) throw new Error(`Unknown environment: ${environment}`);
  if (!ACCOUNT_ID) throw new Error('VWO_ACCOUNT_ID is not set in .env');

  console.log(`[VWO] accountId: ${ACCOUNT_ID}, sdkKey: ${sdkKey.substring(0, 8)}...`);

  const vwoClient = await init({
    sdkKey,
    accountId: Number(ACCOUNT_ID), // ensure it's a number not string
    logger: { level: 'DEBUG' },
    pollInterval: 10000, // poll every 10 seconds during dev
  });

  clientCache[environment] = vwoClient;
  console.log(`[VWO] Client ready for environment: ${environment}`);
  return vwoClient;
}

module.exports = { getVWOClient };