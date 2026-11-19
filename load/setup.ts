/**
 * Load-test fixture (dev/staging ONLY). Creates a tenant + API key + funded
 * source wallets and one destination, then prints JSON for k6 to consume:
 *   npx tsx load/setup.ts > load/fixture.json
 *   API_KEY=... FROM_WALLETS=... TO_WALLET=... k6 run load/transfer.js
 * Funding is done by direct DB write because there is no external funding
 * endpoint — this is a test fixture, not a product path.
 */
import { pool } from '../src/db/pool';
import { registerOrg } from '../src/modules/auth/auth.service';
import { createApiKey } from '../src/modules/auth/apikey.service';
import { createWallet } from '../src/modules/wallets/wallet.service';
import { permissionsForRole } from '../src/modules/auth/rbac';

async function main() {
  const org = await registerOrg({
    email: `load_${Date.now()}@test.local`,
    password: 'supersecret123',
    orgName: 'LoadCo',
  });
  // The org's owner is the creator, so the key may carry any owner permission.
  const key = await createApiKey(org.tenant_id, 'load', ['transaction:write', 'wallet:read'], permissionsForRole('owner'));

  const froms: string[] = [];
  for (let i = 0; i < 10; i++) {
    const w = await createWallet(org.tenant_id, 'INR');
    await pool.query('UPDATE wallets SET balance = 1000000000 WHERE id = $1', [w.id]);
    froms.push(w.id);
  }
  const to = await createWallet(org.tenant_id, 'INR');

  console.log(JSON.stringify({ apiKey: key.api_key, fromWallets: froms, toWallet: to.id }, null, 2));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
