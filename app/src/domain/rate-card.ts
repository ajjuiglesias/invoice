/**
 * JCEM freelancer rate card.
 *
 * SINGLE SOURCE OF TRUTH. Every entry is pinned to the row it occupies in the
 * company's Excel template (public/template.xlsx, sheet "Invoice"). The
 * template's subtotal is SUM(J19:J47), so `row` must stay within 19..47 and
 * must stay unique.
 *
 * To change a price, edit `price` here and redeploy — nothing else references
 * these numbers. RATE_CARD_VERSION is stamped onto every saved invoice so old
 * invoices keep the prices they were raised at.
 */

export const RATE_CARD_VERSION = '2026-08';

/** Which description column the label sits in on the template: A, B or C. */
export type Indent = 0 | 1 | 2;

export interface RateItem {
  /** Stable id — safe to persist. Never reuse or renumber. */
  id: string;
  /** Row in the template's Invoice sheet. Unique, 19..47. */
  row: number;
  /** Label exactly as it reads in the template. */
  label: string;
  /** Label for the picker, without the leading number. */
  short: string;
  indent: Indent;
  /** Default unit price in GBP. */
  price: number;
  /** Adhoc lines let the freelancer type their own price. */
  customPrice?: boolean;
  /** Grouping for the picker UI. */
  group: Group;
  /** Shown under the label in the picker. */
  hint?: string;
}

export const GROUPS = [
  'Act End Pages',
  'Blogs',
  'Social Posts',
  'Video',
  'Event & Service Pages',
  'Other',
] as const;

export type Group = (typeof GROUPS)[number];

export const RATE_CARD: RateItem[] = [
  // ---- Act End Pages -------------------------------------------------------
  {
    id: 'act-end-new',
    row: 19,
    label: '1) New Act End Page',
    short: 'New Act End Page',
    indent: 0,
    price: 35,
    group: 'Act End Pages',
  },
  {
    id: 'act-end-additional-section',
    row: 20,
    label: 'Additional Section',
    short: 'Additional Section',
    indent: 1,
    price: 5,
    group: 'Act End Pages',
    hint: 'Add-on — one per extra section, on top of a new act end page',
  },
  {
    id: 'act-end-refresh',
    row: 21,
    label: '2) Act End Page Updates (Complete Refresh)',
    short: 'Act End Page Updates (Complete Refresh)',
    indent: 0,
    price: 35,
    group: 'Act End Pages',
  },

  // ---- Blogs ---------------------------------------------------------------
  {
    id: 'blog-new',
    row: 26,
    label: '4) New Blog',
    short: 'New Blog',
    indent: 0,
    price: 80,
    group: 'Blogs',
  },
  {
    id: 'blog-refresh',
    row: 27,
    label: '5) Blog Update (Full Refresh)',
    short: 'Blog Update (Full Refresh)',
    indent: 0,
    price: 40,
    group: 'Blogs',
  },
  {
    id: 'blog-edit',
    row: 28,
    label: '6) Blog Edit',
    short: 'Blog Edit',
    indent: 0,
    price: 25,
    group: 'Blogs',
  },

  // ---- Social Posts --------------------------------------------------------
  {
    id: 'carousel-multi-image',
    row: 29,
    label: '7) Multi-Image Post (Carousel)',
    short: 'Multi-Image Post (Carousel)',
    indent: 0,
    price: 10,
    group: 'Social Posts',
  },
  {
    id: 'carousel-text-image',
    row: 30,
    label: '8) Text & Image Carousel',
    short: 'Text & Image Carousel',
    indent: 0,
    price: 15,
    group: 'Social Posts',
  },
  {
    id: 'carousel-pdf-collage',
    row: 31,
    label: '9) PDF / Collage Carousel',
    short: 'PDF / Collage Carousel',
    indent: 0,
    price: 20,
    group: 'Social Posts',
  },
  {
    id: 'carousel-expanded',
    row: 32,
    label: '10) Expanded Carousel',
    short: 'Expanded Carousel',
    indent: 0,
    price: 28,
    group: 'Social Posts',
  },
  {
    id: 'artist-job-callouts',
    row: 33,
    label: '11) Artist / Job Call outs',
    short: 'Artist / Job Call outs',
    indent: 0,
    price: 15,
    group: 'Social Posts',
  },
  {
    id: 'article-posts',
    row: 34,
    label: '12) Article Posts',
    short: 'Article Posts',
    indent: 0,
    price: 15,
    group: 'Social Posts',
  },
  {
    id: 'concept-of-3',
    row: 35,
    label: '13) Concept of 3 (Instagram)',
    short: 'Concept of 3 (Instagram)',
    indent: 0,
    price: 40,
    group: 'Social Posts',
  },

  // ---- Video ---------------------------------------------------------------
  {
    id: 'video-basic-social',
    row: 36,
    label: '14) Basic Video (socials)',
    short: 'Basic Video (socials)',
    indent: 0,
    price: 20,
    group: 'Video',
  },
  {
    id: 'video-intermediate-social',
    row: 37,
    label: '15) Intermediate Video (Socials)',
    short: 'Intermediate Video (Socials)',
    indent: 0,
    price: 30,
    group: 'Video',
  },
  {
    id: 'bts-clips-1',
    row: 38,
    label: '16) BTS / Moment Clips',
    short: 'BTS / Moment Clips — 1 clip',
    indent: 0,
    price: 10,
    group: 'Video',
  },
  {
    id: 'bts-clips-3-5',
    row: 39,
    label: '3-5 clips',
    short: 'BTS / Moment Clips — 3-5 clips',
    indent: 2,
    price: 25,
    group: 'Video',
  },
  {
    id: 'video-grid-gif',
    row: 40,
    label: '17) Grid / GIF Style Video',
    short: 'Grid / GIF Style Video',
    indent: 0,
    price: 20,
    group: 'Video',
  },
  {
    id: 'video-intermediate-yt',
    row: 41,
    label: '18) Intermediate Video (YouTube/Website)',
    short: 'Intermediate Video (YouTube/Website)',
    indent: 0,
    price: 50,
    group: 'Video',
  },
  {
    id: 'video-advanced-yt',
    row: 42,
    label: '19) Advanced Video (YouTube/Website)',
    short: 'Advanced Video (YouTube/Website)',
    indent: 0,
    price: 80,
    group: 'Video',
  },

  // ---- Event & Service Pages ----------------------------------------------
  {
    id: 'event-page-new',
    row: 43,
    label: '20) New Event / Service Page',
    short: 'New Event / Service Page',
    indent: 0,
    price: 80,
    group: 'Event & Service Pages',
  },
  {
    id: 'event-page-update',
    row: 44,
    label: '21) Update Event / Service Page',
    short: 'Update Event / Service Page',
    indent: 0,
    price: 40,
    group: 'Event & Service Pages',
  },
  {
    id: 'event-page-edit',
    row: 45,
    label: '22) Edit Event / Service Page',
    short: 'Edit Event / Service Page',
    indent: 0,
    price: 25,
    group: 'Event & Service Pages',
  },

  // ---- Other ---------------------------------------------------------------
  {
    id: 'quick-edits',
    row: 22,
    label: '3) Quick Edits',
    short: 'Quick Edits',
    indent: 0,
    price: 35,
    group: 'Other',
    hint: 'Parent line — normally invoice one of the banded tiers below instead',
  },
  {
    id: 'quick-edits-3-5',
    row: 23,
    label: '3-5 edits',
    short: 'Quick Edits — 3-5 edits',
    indent: 2,
    price: 15,
    group: 'Other',
  },
  {
    id: 'quick-edits-6-8',
    row: 24,
    label: '6-8 edits',
    short: 'Quick Edits — 6-8 edits',
    indent: 2,
    price: 25,
    group: 'Other',
  },
  {
    id: 'quick-edits-8-10',
    row: 25,
    label: '8-10 edits',
    short: 'Quick Edits — 8-10 edits',
    indent: 2,
    price: 30,
    group: 'Other',
  },
  {
    id: 'pinterest-5-pins',
    row: 46,
    label: '23) Pinterest 5 Pins',
    short: 'Pinterest 5 Pins',
    indent: 0,
    price: 15,
    group: 'Other',
  },
  {
    id: 'adhoc',
    row: 47,
    label: '24) Adhoc (CHANGE PRICE IN UNIT PRICE/DUPLICATE ROW TO ADD MORE THAN 1)',
    short: 'Adhoc',
    indent: 0,
    price: 15,
    customPrice: true,
    group: 'Other',
    hint: 'Set your own unit price — agree it with your line manager first',
  },
];

/** First and last template rows the line items may occupy. */
export const FIRST_ITEM_ROW = 19;
export const LAST_ITEM_ROW = 47;

const byId = new Map(RATE_CARD.map((r) => [r.id, r]));

export function rateItem(id: string): RateItem | undefined {
  return byId.get(id);
}

export function rateItemsByGroup(): Array<{ group: Group; items: RateItem[] }> {
  return GROUPS.map((group) => ({
    group,
    items: RATE_CARD.filter((r) => r.group === group),
  })).filter((g) => g.items.length > 0);
}
