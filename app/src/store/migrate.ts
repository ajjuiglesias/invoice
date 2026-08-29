import type { StorageAdapter } from './adapter';
import { LocalStorageAdapter } from './local';

const DONE_KEY = 'jcem.migrated.v1';

export interface MigrationResult {
  migrated: boolean;
  profile: boolean;
  invoices: number;
}

/**
 * Carry a freelancer's Phase A work up to the team backend the first time they
 * sign in, so nobody loses their history by logging in.
 *
 * Deliberately conservative: it never overwrites something already in the
 * cloud, and it runs at most once per browser.
 */
export async function migrateLocalData(cloud: StorageAdapter): Promise<MigrationResult> {
  const nothing: MigrationResult = { migrated: false, profile: false, invoices: 0 };

  try {
    if (localStorage.getItem(DONE_KEY)) return nothing;
  } catch {
    return nothing; // storage blocked — there is nothing local to migrate
  }

  const local = new LocalStorageAdapter();
  const [localProfile, localInvoices] = await Promise.all([
    local.loadProfile(),
    local.listInvoices(),
  ]);

  if (!localProfile && localInvoices.length === 0) {
    markDone();
    return nothing;
  }

  const result: MigrationResult = { migrated: false, profile: false, invoices: 0 };

  // Only fill in a profile that is still blank up there.
  const cloudProfile = await cloud.loadProfile();
  if (localProfile && !cloudProfile?.fullName?.trim()) {
    await cloud.saveProfile(localProfile);
    result.profile = true;
  }

  const existing = await cloud.listInvoices();
  const takenNumbers = new Set(existing.map((i) => i.invoiceNumber));

  for (const invoice of localInvoices) {
    if (takenNumbers.has(invoice.invoiceNumber)) continue;
    try {
      await cloud.saveInvoice({ ...invoice, id: crypto.randomUUID() });
      takenNumbers.add(invoice.invoiceNumber);
      result.invoices += 1;
    } catch {
      // One bad row should not abort the whole migration; the local copy is
      // still there and untouched.
    }
  }

  result.migrated = result.profile || result.invoices > 0;
  markDone();
  return result;
}

function markDone(): void {
  try {
    localStorage.setItem(DONE_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}
