import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();

await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`);

for (const name of ['0001_init.sql', '0002_integrity.sql', '0003_access_control.sql']) {
  const sql = (await readFile(resolve(here, '..', '..', 'supabase', 'migrations', name), 'utf8'))
    // Supabase ships pgcrypto. PGlite does not bundle its control file, while
    // modern Postgres still provides the gen_random_uuid() function we use.
    .replace('create extension if not exists "pgcrypto";', '');
  await db.exec(sql);
}

const freelancer = '00000000-0000-4000-8000-000000000001';
const manager = '00000000-0000-4000-8000-000000000002';
const admin = '00000000-0000-4000-8000-000000000003';
const invoice = '00000000-0000-4000-8000-000000000101';
await db.exec(`insert into auth.users values ('${admin}', 'admin@example.com')`);
await db.exec(`update profiles set role='admin', active=true where id='${admin}'`);
await db.exec(`set request.jwt.claim.sub = '${admin}'`);
await db.query(`select create_user_invite('worker@example.com','freelancer',false)`);
await db.query(`select create_user_invite('manager@example.com','manager',false)`);
await db.exec(`insert into auth.users values ('${freelancer}', 'worker@example.com'), ('${manager}', 'manager@example.com')`);

const { rows: [invited] } = await db.query(`select active,role::text from profiles where id='${freelancer}'`);
if (!invited.active || invited.role !== 'freelancer') throw new Error('Invited user was not activated.');

const outsider = '00000000-0000-4000-8000-000000000004';
await db.exec(`insert into auth.users values ('${outsider}', 'outsider@example.com')`);
const { rows: [blocked] } = await db.query(`select active from profiles where id='${outsider}'`);
if (blocked.active) throw new Error('Uninvited user received access.');

await db.exec(`set request.jwt.claim.sub = '${freelancer}'`);
const { rows: [{ next_invoice_number: first }] } = await db.query('select next_invoice_number()');
const { rows: [{ next_invoice_number: second }] } = await db.query('select next_invoice_number()');
if (first !== 1 || second !== 2) throw new Error('Invoice numbers were not reserved atomically.');

const payload = {
  id: invoice,
  number: first,
  period_month: '2026-09',
  issue_date: '2026-09-11',
  rate_card_version: '2026-08',
  profile: {
    fullName: 'Test Freelancer', businessName: '', email: 'worker@example.com',
    postalAddress: '1 Test Street', country: 'United Kingdom',
  },
  lines: [{
    item_key: 'test-item', template_row: 19, qty: 2, unit_price: 25,
    asana_links: ['https://app.asana.com/0/1/2'], page_links: ['https://example.com/live'],
  }],
};
await db.query('select save_invoice($1::jsonb)', [JSON.stringify(payload)]);
await db.query(`select transition_invoice('${invoice}', 'submitted')`);

await db.exec(`set request.jwt.claim.sub = '${manager}'`);
await db.query(`select transition_invoice('${invoice}', 'approved')`);
const { rows: [{ status, subtotal, snapshot_name }] } = await db.query(
  `select status, subtotal::text, profile_snapshot->>'fullName' snapshot_name from invoices where id=$1`,
  [invoice],
);
if (status !== 'approved' || subtotal !== '50.00' || snapshot_name !== 'Test Freelancer') {
  throw new Error('Invoice save or approval integrity check failed.');
}

await db.exec(`set request.jwt.claim.sub = '${admin}'`);
let protectedLastAdmin = false;
try { await db.query(`select set_member_role('${admin}','freelancer',false)`); }
catch (error) { protectedLastAdmin = /last active admin/i.test(String(error)); }
if (!protectedLastAdmin) throw new Error('Last administrator was not protected.');

console.log('Database migrations and secured invoice lifecycle: OK');
await db.close();
