import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Fill from load/setup.ts output (env vars).
const BASE = __ENV.BASE || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY;
const FROMS = (__ENV.FROM_WALLETS || '').split(',');
const TO = __ENV.TO_WALLET;

export const options = {
  scenarios: {
    transfers: { executor: 'ramping-vus', startVUs: 0,
      stages: [{ duration: '15s', target: 50 }, { duration: '30s', target: 50 }, { duration: '15s', target: 0 }] },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const from = FROMS[__VU % FROMS.length]; // spread contention across wallets
  const res = http.post(`${BASE}/v1/transactions`,
    JSON.stringify({ from_wallet_id: from, to_wallet_id: TO, amount: 1 }),
    { headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, 'Idempotency-Key': uuidv4() } });
  check(res, { 'posted 201': (r) => r.status === 201 });
}
