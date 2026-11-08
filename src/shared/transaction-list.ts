import { shortDateLabel, weekdayOf } from "./months.js";

// Searching, sorting and grouping for the "All transactions" list. Pure functions, no page code,
// so they can be tested on their own.

export interface ListTransaction {
  id: string;
  name: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  /** category key (built-in id or custom key) */
  category: string;
  account: string;
  institution: string;
  manual?: boolean;
}

export type ListSort = "newest" | "oldest" | "largest" | "smallest";

export interface ListOptions {
  /** words to look for; every word must match somewhere in the row */
  query: string;
  /** a category key, or "" for all categories */
  category: string;
  sort: ListSort;
}

export const sortLabels: Record<ListSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  largest: "Largest first",
  smallest: "Smallest first",
};

/** Lowercase, no accents, no $ or thousands commas, so "Café", "cafe" and "$1,200" all compare fairly. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[$,]/g, "");
}

function searchableText(transaction: ListTransaction, categoryName: string): string {
  return fold(
    [
      transaction.name,
      transaction.account,
      transaction.institution,
      categoryName,
      transaction.manual ? "manual added by hand" : "bank",
      transaction.amount.toFixed(2),
      String(Math.round(transaction.amount)),
      transaction.date,
    ].join(" "),
  );
}

export function filterTransactions(
  transactions: ListTransaction[],
  options: Pick<ListOptions, "query" | "category">,
  categoryName: (key: string) => string,
): ListTransaction[] {
  const terms = fold(options.query).split(/\s+/).filter(Boolean);
  return transactions.filter((transaction) => {
    if (options.category && transaction.category !== options.category) return false;
    if (!terms.length) return true;
    const haystack = searchableText(transaction, categoryName(transaction.category));
    return terms.every((term) => haystack.includes(term));
  });
}

const byName = (first: ListTransaction, second: ListTransaction) =>
  first.name.localeCompare(second.name) || first.id.localeCompare(second.id);

/** A new array in the requested order. Ties are broken the same way every time, so rows never jump around. */
export function sortTransactions(transactions: ListTransaction[], sort: ListSort): ListTransaction[] {
  const copy = [...transactions];
  const newest = (a: ListTransaction, b: ListTransaction) => b.date.localeCompare(a.date) || b.amount - a.amount || byName(a, b);
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || byName(a, b));
    case "largest":
      return copy.sort((a, b) => b.amount - a.amount || newest(a, b));
    case "smallest":
      return copy.sort((a, b) => a.amount - b.amount || newest(a, b));
    default:
      return copy.sort(newest);
  }
}

/** Consecutive transactions on the same day, in the order given. */
export function groupByDate(transactions: ListTransaction[]): { date: string; items: ListTransaction[] }[] {
  const groups: { date: string; items: ListTransaction[] }[] = [];
  for (const transaction of transactions) {
    const last = groups.at(-1);
    if (last && last.date === transaction.date) last.items.push(transaction);
    else groups.push({ date: transaction.date, items: [transaction] });
  }
  return groups;
}

/** Number of transactions and their total, summed in whole cents so the total is exact. */
export function summarizeList(transactions: ListTransaction[]): { count: number; total: number } {
  const cents = transactions.reduce((sum, transaction) => sum + Math.round(transaction.amount * 100), 0);
  return { count: transactions.length, total: cents / 100 };
}

export interface RenderContext {
  categories: { id: string; name: string; color: string }[];
  /** formats a dollar amount for display */
  money: (amount: number) => string;
  /** makes text safe to put inside HTML */
  escape: (value: unknown) => string;
  /** id of the row that is expanded, if any */
  openId?: string | null;
  /** whether moving a bank transaction also moves every transaction from the same merchant */
  movesWholeMerchant?: boolean;
}

/**
 * One transaction. The category is shown by a thin bar down the row's left edge and a tinted initial,
 * with its name in the second line. Tapping the row opens it to change the category or edit it.
 */
function rowHtml(item: ListTransaction, context: RenderContext, showDate: boolean): string {
  const { escape } = context;
  const category = context.categories.find((entry) => entry.id === item.category);
  const color = category?.color ?? "#d9d5c7";
  const where = item.manual ? "Added by hand" : `${item.account}${item.institution ? ` \u00b7 ${item.institution}` : ""}`;
  const meta = [showDate ? shortDateLabel(item.date) : "", category?.name ?? "Other", where].filter(Boolean).join(" \u00b7 ");
  const initial = Array.from(item.name.trim())[0]?.toUpperCase() ?? "?";
  const open = context.openId === item.id;

  let details = "";
  if (open) {
    const chips = context.categories
      .map(
        (entry) =>
          `<button type="button" class="tx-cat-chip" style="--c:${escape(entry.color)}" data-move-tx="${escape(item.id)}" data-move-category="${escape(entry.id)}" data-merchant="${escape(item.name)}" aria-pressed="${entry.id === item.category}">${escape(entry.name)}</button>`,
      )
      .join("");
    const merchantOption = item.manual
      ? ""
      : `<label class="tx-merchant-opt"><input type="checkbox" class="apply-merchant-toggle"${context.movesWholeMerchant === false ? "" : " checked"}> Also apply to every ${escape(item.name)} transaction, including future ones</label>`;
    const actions = item.manual
      ? `<button type="button" class="row-action" data-edit-manual="${escape(item.id)}" aria-label="Edit ${escape(item.name)}">Edit</button><button type="button" class="row-action" data-delete-manual="${escape(item.id)}" aria-label="Delete ${escape(item.name)}">Delete</button>`
      : `<span class="tx-tag">From your bank</span>`;
    details = `<div class="tx-open"><div class="tx-chips" role="group" aria-label="Category for ${escape(item.name)}">${chips}</div>${merchantOption}<div class="tx-actions">${actions}</div></div>`;
  }

  return `<div class="tx-card-row${open ? " is-open" : ""}" style="--c:${escape(color)}"><button type="button" class="tx-line" data-tx-toggle="${escape(item.id)}" aria-expanded="${open}"><span class="tx-tile" aria-hidden="true">${escape(initial)}</span><span class="tx-main"><strong>${escape(item.name)}</strong><small>${escape(meta)}</small></span><span class="tx-amount">${context.money(item.amount)}</span></button>${details}</div>`;
}

/**
 * The rows for one page of the list. Newest/oldest are split into one card per day, with the day's count and
 * total in its header; the size sorts are a single card, since days would be scattered, so each row shows its date.
 */
export function renderRows(transactions: ListTransaction[], sort: ListSort, context: RenderContext): string {
  if (sort === "newest" || sort === "oldest") {
    return groupByDate(transactions)
      .map((group) => {
        const summary = summarizeList(group.items);
        const label = `${weekdayOf(group.date).slice(0, 3)}, ${shortDateLabel(group.date)}`;
        return `<section class="tx-day-card" aria-label="${context.escape(label)}"><header><strong>${context.escape(label)}</strong><span>${summary.count} \u00b7 ${context.money(summary.total)}</span></header>${group.items.map((item) => rowHtml(item, context, false)).join("")}</section>`;
      })
      .join("");
  }
  return `<section class="tx-day-card">${transactions.map((item) => rowHtml(item, context, true)).join("")}</section>`;
}