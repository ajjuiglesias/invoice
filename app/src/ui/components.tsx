import type { ReactNode } from 'react';
import type { Issue } from '../domain/validation';

export function Card({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {aside}
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  wide,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && (
        <span className="field__hint" style={invalid ? { color: 'var(--red)' } : undefined}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
}) {
  const icon = tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i';
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="notice__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

/** Groups issues into a single error / warning notice pair. */
export function IssueSummary({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <>
      {errors.length > 0 && (
        <Notice tone="error" title={`${errors.length} thing${errors.length === 1 ? '' : 's'} to fix`}>
          <ul>
            {errors.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      )}
      {warnings.length > 0 && (
        <Notice
          tone="warning"
          title={`${warnings.length} thing${warnings.length === 1 ? '' : 's'} worth checking`}
        >
          <ul>
            {warnings.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      )}
    </>
  );
}

/** A growable list of URL inputs. */
export function LinkSet({
  label,
  hint,
  placeholder,
  values,
  onChange,
  invalid,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const rows = values.length > 0 ? values : [''];

  const update = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : ['']);
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div>
        {rows.map((value, index) => (
          <div className="linkset__row" key={index}>
            <span className="linkset__index">{index + 1}</span>
            <input
              type="url"
              inputMode="url"
              spellCheck={false}
              value={value}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
              aria-invalid={invalid && !value.trim() ? true : undefined}
              onChange={(e) => update(index, e.target.value)}
            />
            <button
              type="button"
              className="linkset__remove"
              onClick={() => remove(index)}
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              disabled={rows.length === 1 && !value.trim()}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...rows, ''])}
      >
        + Add another
      </button>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}
