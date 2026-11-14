import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../db/pool';
import { registerOrg } from '../auth/auth.service';
import { createWallet } from '../wallets/wallet.service';
import { postTransfer } from './ledger.service';

/**
 * Integration test — requires Postgres with migrations applied.
 *   docker compose up postgres -d && npm run migrate:up && npm run test:integration
 */

let tenantId: string;
let walletA: string;
let walletB: string;

before(async () => {
  const org = await registerOrg({
    email: `ledger_${Date.now()}@test.local`,
    password: 'supersecret123',
    orgName: 'LedgerCo',
  });
  tenantId = org.tenant_id;
  const a = await createWallet(tenantId, 'INR');
  const b = await createWallet(tenantId, 'INR');
  walletA = a.id;
  walletB = b.id;
  // fund A with 100000 via a transfer from a temporary funded wallet
  const funder = await createWallet(tenantId, 'INR');
  await pool.query('UPDATE wallets SET balance = 100000 WHERE id = $1', [funder.id]);
  await postTransfer(tenantId, { from_wallet_id: funder.id, to_wallet_id: walletA, amount: 100000 });
});

after(async () => {
  await pool.end();
});

test('a transfer is double-entry (entries sum to zero)', async () => {
  const tx = await postTransfer(tenantId, {
    from_wallet_id: walletA,
    to_wallet_id: walletB,
    amount: 10000,
  });
  const { rows } = await pool.query(
    `SELECT direction, amount FROM ledger_entries WHERE transaction_id = $1`,
    [tx.id],
  );
  const net = rows.reduce(
    (sum, r) => sum + (r.direction === 'credit' ? Number(r.amount) : -Number(r.amount)),
    0,
  );
  assert.equal(net, 0, 'debit and credit must cancel');
});

test('posting writes a transactional outbox event', async () => {
  const before = await pool.query(`SELECT count(*)::int AS c FROM outbox_events WHERE tenant_id = $1`, [tenantId]);
  await postTransfer(tenantId, { from_wallet_id: walletA, to_wallet_id: walletB, amount: 5000 });
  const after = await pool.query(`SELECT count(*)::int AS c FROM outbox_events WHERE tenant_id = $1`, [tenantId]);
  assert.equal(after.rows[0].c, before.rows[0].c + 1, 'one outbox event per posted transfer');
});

// A 409 conflict means "the wallet moved under you — retry", exactly like a
// real client would. Retrying on conflict makes the outcome deterministic:
// precisely the transfers the balance can fund succeed, the rest hit
// insufficient_funds. This proves the anti-oversell guarantee end-to-end.
async function transferWithRetry(input: Parameters<typeof postTransfer>[1]) {
  for (;;) {
    try {
      return await postTransfer(tenantId, input);
    } catch (err) {
      if ((err as { type?: string }).type === 'conflict') continue; // retry on 409
      throw err; // insufficient_funds etc. are terminal
    }
  }
}

test('optimistic locking prevents oversell under concurrency', async () => {
  // A funded with exactly 100000; fire 10 concurrent transfers of 20000
  // (total 200000 requested). At most 5 can be funded — never more.
  const a = await createWallet(tenantId, 'INR');
  const b = await createWallet(tenantId, 'INR');
  await pool.query('UPDATE wallets SET balance = 100000 WHERE id = $1', [a.id]);

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      transferWithRetry({ from_wallet_id: a.id, to_wallet_id: b.id, amount: 20000 }),
    ),
  );
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter(
    (r) => r.status === 'rejected',
  ) as PromiseRejectedResult[];

  const balA = Number((await pool.query('SELECT balance FROM wallets WHERE id = $1', [a.id])).rows[0].balance);
  const balB = Number((await pool.query('SELECT balance FROM wallets WHERE id = $1', [b.id])).rows[0].balance);

  // Safety invariants (these are the guarantee):
  assert.ok(balA >= 0, 'source balance must never go negative');
  assert.equal(balA + balB, 100000, 'money is conserved — nothing created or destroyed');
  assert.equal(balB, succeeded * 20000, 'destination equals exactly the funded transfers');
  // With client retry-on-conflict, the funded count is deterministic: 5.
  assert.equal(succeeded, 5, 'exactly 5 transfers can be funded from 100000');
  assert.equal(balA, 0, 'source drained to exactly 0');
  assert.ok(
    rejected.every((r) => (r.reason as { type?: string }).type === 'insufficient_funds'),
    'the other 5 fail only with insufficient_funds',
  );
});
