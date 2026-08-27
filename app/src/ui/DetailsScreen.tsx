import { useState } from 'react';
import type { FreelancerProfile } from '../domain/types';
import { validateProfile } from '../domain/validation';
import { Card, Field, IssueSummary, Notice } from './components';

interface Props {
  profile: FreelancerProfile;
  onChange: (profile: FreelancerProfile) => void;
  onContinue: () => void;
  storagePersists: boolean;
}

export function DetailsScreen({ profile, onChange, onContinue, storagePersists }: Props) {
  // Nobody wants a wall of red on a form they have not filled in yet. A field
  // only turns red once it has been touched, or once Continue has been pressed.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const issues = validateProfile(profile);
  const blocked = issues.some((i) => i.severity === 'error');

  const touch = (field: string) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const set = <K extends keyof FreelancerProfile>(key: K, value: FreelancerProfile[K]) =>
    onChange({ ...profile, [key]: value });

  const setBank = <K extends keyof FreelancerProfile['bank']>(
    key: K,
    value: FreelancerProfile['bank'][K],
  ) => onChange({ ...profile, bank: { ...profile.bank, [key]: value } });

  const shows = (field: string) => submitted || touched.has(field);

  const invalidField = (field: string) =>
    shows(field) && issues.some((i) => i.field === field && i.severity === 'error');

  /** Only surface issues for fields the user has actually engaged with. */
  const visibleIssues = submitted
    ? issues
    : issues.filter((i) => !i.field || touched.has(i.field));

  const attemptContinue = () => {
    if (blocked) {
      setSubmitted(true);
      return;
    }
    onContinue();
  };

  return (
    <>
      <div className="screen-head">
        <h1>Your details</h1>
        <p>
          Entered once and remembered on this device, so every future invoice starts filled in.
          These details go straight into the company's Excel template.
        </p>
      </div>

      {!storagePersists && (
        <Notice tone="warning" title="This browser will not remember your details. ">
          Private browsing or blocked storage means you will need to type them again next time. The
          invoice itself will still generate normally.
        </Notice>
      )}

      <Notice tone="info" title="Your details stay on this computer. ">
        Nothing is uploaded anywhere — there is no server. Your bank details are only ever written
        into the invoice file you download.
      </Notice>

      <Card title="Freelancer details" subtitle="Matches the left-hand block on the template">
        <div className="grid">
          <Field label="Full name" invalid={invalidField('fullName')}>
            <input
              type="text"
              value={profile.fullName}
              autoComplete="name"
              aria-invalid={invalidField('fullName') || undefined}
              onBlur={() => touch('fullName')}
              onChange={(e) => set('fullName', e.target.value)}
            />
          </Field>

          <Field label="Business name" hint="Optional — used to name the invoice file">
            <input
              type="text"
              value={profile.businessName}
              autoComplete="organization"
              onChange={(e) => set('businessName', e.target.value)}
            />
          </Field>

          <Field label="Email address" invalid={invalidField('email')}>
            <input
              type="email"
              value={profile.email}
              autoComplete="email"
              spellCheck={false}
              aria-invalid={invalidField('email') || undefined}
              onBlur={() => touch('email')}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>

          <Field label="Country" invalid={invalidField('country')}>
            <input
              type="text"
              value={profile.country}
              autoComplete="country-name"
              aria-invalid={invalidField('country') || undefined}
              onBlur={() => touch('country')}
              onChange={(e) => set('country', e.target.value)}
            />
          </Field>

          <Field label="Postal address" wide invalid={invalidField('postalAddress')}>
            <textarea
              value={profile.postalAddress}
              autoComplete="street-address"
              rows={2}
              aria-invalid={invalidField('postalAddress') || undefined}
              onBlur={() => touch('postalAddress')}
              onChange={(e) => set('postalAddress', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card title="Bank details" subtitle="All freelancers">
        <div className="grid">
          <Field label="Account name" invalid={invalidField('bank.accountName')}>
            <input
              type="text"
              value={profile.bank.accountName}
              aria-invalid={invalidField('bank.accountName') || undefined}
              onBlur={() => touch('bank.accountName')}
              onChange={(e) => setBank('accountName', e.target.value)}
            />
          </Field>

          <Field label="Bank name" invalid={invalidField('bank.bankName')}>
            <input
              type="text"
              value={profile.bank.bankName}
              aria-invalid={invalidField('bank.bankName') || undefined}
              onBlur={() => touch('bank.bankName')}
              onChange={(e) => setBank('bankName', e.target.value)}
            />
          </Field>

          <Field label="Sort code" hint="e.g. 12-34-56">
            <input
              type="text"
              value={profile.bank.sortCode}
              spellCheck={false}
              onBlur={() => touch('bank.sortCode')}
              onChange={(e) => setBank('sortCode', e.target.value)}
            />
          </Field>

          <Field label="Account number" hint="Leading zeros are preserved">
            <input
              type="text"
              inputMode="numeric"
              value={profile.bank.accountNumber}
              spellCheck={false}
              onChange={(e) => setBank('accountNumber', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card title="Additional (overseas)" subtitle="Only needed if you are paid outside the UK">
        <div className="grid">
          <Field label="IBAN">
            <input
              type="text"
              value={profile.bank.iban}
              spellCheck={false}
              onBlur={() => touch('bank.iban')}
              onChange={(e) => setBank('iban', e.target.value)}
            />
          </Field>

          <Field label="BIC / SWIFT">
            <input
              type="text"
              value={profile.bank.bicSwift}
              spellCheck={false}
              onChange={(e) => setBank('bicSwift', e.target.value)}
            />
          </Field>

          <Field label="Currency" hint="e.g. GBP, INR, EUR">
            <input
              type="text"
              value={profile.bank.currency}
              spellCheck={false}
              onChange={(e) => setBank('currency', e.target.value.toUpperCase())}
            />
          </Field>
        </div>
      </Card>

      <IssueSummary issues={visibleIssues} />

      <div className="actions actions--end">
        <button type="button" className="btn btn--primary" onClick={attemptContinue}>
          Continue to the invoice →
        </button>
      </div>
    </>
  );
}
