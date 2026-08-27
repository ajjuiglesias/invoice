import { useMemo, useState } from 'react';
import { INVOICING_RULES } from '../domain/company';
import {
  deadlineStatus,
  formatGBP,
  lineAmount,
  monthLabel,
  sortLines,
  subtotal,
} from '../domain/invoice';
import { rateItem, rateItemsByGroup, type RateItem } from '../domain/rate-card';
import type { InvoiceLine } from '../domain/types';
import { validateLine } from '../domain/validation';
import { Card, Field, LinkSet, Notice } from './components';

interface Props {
  invoiceNumber: number;
  issueDate: string;
  periodMonth: string;
  lines: InvoiceLine[];
  onMetaChange: (meta: { invoiceNumber?: number; issueDate?: string; periodMonth?: string }) => void;
  onLinesChange: (lines: InvoiceLine[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function BuilderScreen({
  invoiceNumber,
  issueDate,
  periodMonth,
  lines,
  onMetaChange,
  onLinesChange,
  onBack,
  onContinue,
}: Props) {
  const [search, setSearch] = useState('');

  const total = subtotal(lines);
  const ordered = useMemo(() => sortLines(lines), [lines]);
  const usedIds = useMemo(() => new Set(lines.map((l) => l.rateItemId)), [lines]);
  const deadline = deadlineStatus(periodMonth);

  const addLine = (item: RateItem) => {
    if (usedIds.has(item.id)) return;
    const line: InvoiceLine = {
      key: `${item.id}-${Date.now()}`,
      rateItemId: item.id,
      qty: 1,
      unitPrice: item.price,
      asanaLinks: [''],
      pageLinks: [''],
    };
    onLinesChange([...lines, line]);
  };

  const updateLine = (key: string, patch: Partial<InvoiceLine>) => {
    onLinesChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => onLinesChange(lines.filter((l) => l.key !== key));

  const lineErrors = ordered.flatMap((l) => validateLine(l).filter((i) => i.severity === 'error'));
  const blocked = lines.length === 0 || lineErrors.length > 0;

  return (
    <>
      <div className="screen-head">
        <h1>Build your invoice</h1>
        <p>
          Pick each task type you completed this month, set how many, and attach the Asana task and
          the published page for each one.
        </p>
      </div>

      {deadline.status === 'late' && (
        <Notice tone="error" title="This invoice is past the submission window. ">
          Invoices for {monthLabel(periodMonth)} were due by{' '}
          {deadline.deadline.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          — 5 working days before month end. Send it anyway, but flag it to your line manager.
        </Notice>
      )}
      {deadline.status === 'due-soon' && (
        <Notice tone="warning" title="Due very soon. ">
          {deadline.daysRemaining === 0
            ? 'Today is the last day to submit this invoice.'
            : `${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? '' : 's'} left to submit this invoice.`}
        </Notice>
      )}

      <Card title="Invoice details">
        <div className="grid">
          <Field label="Month being invoiced">
            <input
              type="month"
              value={periodMonth}
              onChange={(e) => e.target.value && onMetaChange({ periodMonth: e.target.value })}
            />
          </Field>
          <Field label="Invoice number" hint="Continues your own numbering">
            <input
              type="number"
              min={1}
              step={1}
              value={invoiceNumber}
              onChange={(e) => onMetaChange({ invoiceNumber: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label="Issue date">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => e.target.value && onMetaChange({ issueDate: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Add task types"
        subtitle="Each task type is one line. Use the quantity to invoice for several."
      >
        <div className="picker__search">
          <input
            type="text"
            placeholder="Search task types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search task types"
          />
        </div>
        <TaskPicker search={search} usedIds={usedIds} onAdd={addLine} />
      </Card>

      <Card
        title={`Your lines${lines.length ? ` (${lines.length})` : ''}`}
        subtitle="Every line needs an Asana task link and the published page URL"
      >
        {ordered.length === 0 ? (
          <p className="empty">Nothing added yet — pick a task type above to get started.</p>
        ) : (
          ordered.map((line) => (
            <LineEditor
              key={line.key}
              line={line}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => removeLine(line.key)}
            />
          ))
        )}

        <div className="totals">
          <span className="totals__label">Subtotal</span>
          <span className="totals__value">{formatGBP(total)}</span>
        </div>
      </Card>

      <Card title="Before you send" subtitle="From the template's How To sheet">
        <ul className="rules">
          {INVOICING_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Card>

      {blocked && (
        <Notice
          tone={lines.length === 0 ? 'info' : 'error'}
          title={
            lines.length === 0
              ? 'Nothing to invoice yet. '
              : `Fix ${lineErrors.length} thing${lineErrors.length === 1 ? '' : 's'} to continue. `
          }
        >
          {lines.length === 0 ? (
            'Pick a task type from the list above to add your first line.'
          ) : (
            <ul>
              {lineErrors.slice(0, 5).map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
              {lineErrors.length > 5 && <li>…and {lineErrors.length - 5} more.</li>}
            </ul>
          )}
        </Notice>
      )}

      <div className="actions actions--split">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Your details
        </button>
        <button type="button" className="btn btn--primary" disabled={blocked} onClick={onContinue}>
          Review &amp; send →
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function TaskPicker({
  search,
  usedIds,
  onAdd,
}: {
  search: string;
  usedIds: Set<string>;
  onAdd: (item: RateItem) => void;
}) {
  const query = search.trim().toLowerCase();

  const groups = rateItemsByGroup()
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !query ||
          item.short.toLowerCase().includes(query) ||
          item.label.toLowerCase().includes(query) ||
          group.group.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return <p className="empty">No task types match “{search}”.</p>;
  }

  return (
    <>
      {groups.map((group) => (
        <div className="picker__group" key={group.group}>
          <div className="picker__group-name">{group.group}</div>
          <div className="picker__list">
            {group.items.map((item) => {
              const added = usedIds.has(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  className="picker__item"
                  disabled={added}
                  onClick={() => onAdd(item)}
                >
                  <span>
                    <span className="picker__label">{item.short}</span>
                    {item.hint && <span className="picker__hint">{item.hint}</span>}
                  </span>
                  <span className={added ? 'picker__added' : 'picker__price'}>
                    {added ? 'Added' : item.customPrice ? 'Your price' : formatGBP(item.price)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: InvoiceLine;
  onChange: (patch: Partial<InvoiceLine>) => void;
  onRemove: () => void;
}) {
  const item = rateItem(line.rateItemId);
  const issues = validateLine(line);
  const hasError = issues.some((i) => i.severity === 'error');

  if (!item) return null;

  return (
    <div className={`line${hasError ? ' line--invalid' : ''}`}>
      <div className="line__head">
        <span className="line__title">
          {item.short}
          <span className="line__sub">Template row {item.row}</span>
        </span>

        <Field label="Qty">
          <input
            className="line__num"
            type="number"
            min={1}
            step={1}
            value={line.qty}
            aria-label={`Quantity for ${item.short}`}
            onChange={(e) => onChange({ qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
          />
        </Field>

        <Field label="Unit price">
          <input
            className="line__num"
            type="number"
            min={0}
            step={0.01}
            value={line.unitPrice}
            disabled={!item.customPrice}
            aria-label={`Unit price for ${item.short}`}
            onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })}
          />
        </Field>

        <span className="line__amount">{formatGBP(lineAmount(line))}</span>

        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={onRemove}
          aria-label={`Remove ${item.short}`}
        >
          Remove
        </button>
      </div>

      <div className="line__body">
        <LinkSet
          label="Asana task links"
          placeholder="https://app.asana.com/…"
          values={line.asanaLinks}
          invalid={hasError}
          onChange={(asanaLinks) => onChange({ asanaLinks })}
          hint="One per piece of work"
        />
        <LinkSet
          label="Published page links"
          placeholder="https://www.juliacharleseventmanagement.co.uk/…"
          values={line.pageLinks}
          invalid={hasError}
          onChange={(pageLinks) => onChange({ pageLinks })}
          hint="The live, signed-off page"
        />
      </div>

      {issues.length > 0 && (
        <div className="line__issues">
          {issues.map((issue, i) => (
            <div key={i} className={`line__issue line__issue--${issue.severity}`}>
              <span aria-hidden="true">•</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
