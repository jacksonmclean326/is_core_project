import { Products } from "plaid";
import { createPlaidClient } from "../src/server/plaid/client.ts";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
import { toStoredTransactions } from "../src/server/api/transactions.ts";

const plaid = createPlaidClient();
const pt = await plaid.sandboxPublicTokenCreate({
  institution_id: "ins_109508",
  initial_products: [Products.Transactions],
  options: { override_username: "user_transactions_dynamic" },
});
const ex = await plaid.itemPublicTokenExchange({ public_token: pt.data.public_token });
const token = ex.data.access_token;
const end = new Date(), start = new Date(end.getTime() - 30 * 864e5);
const d = (x: Date) => x.toISOString().slice(0, 10);
let res;
for (let i = 0; i < 12; i++) {
  try {
    res = await plaid.transactionsGet({ access_token: token, start_date: d(start), end_date: d(end), options: { count: 500, include_personal_finance_category: true } });
    break;
  } catch (e: any) {
    console.log("waiting:", e.response?.data?.error_code);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
if (!res) throw new Error("no transactions");
console.log("plaid returned", res.data.transactions.length, "of", res.data.total_transactions);
const stored = toStoredTransactions(res.data.transactions, res.data.accounts, "First Platypus Bank");
console.log("kept as spending:", stored.length);
const totals: Record<string, number> = {};
for (const t of stored) totals[t.category] = (totals[t.category] ?? 0) + t.amount;
console.log(totals);
const raw = new Map(res.data.transactions.map((t) => [t.transaction_id, t]));
for (const t of stored.slice(0, 25)) console.log(t.category.padEnd(10), t.name.slice(0, 32).padEnd(33), String(t.amount).padStart(8), raw.get(t.id)?.personal_finance_category?.detailed);
const others = new Map<string, number>(); for (const t of stored) if (t.category === "other") { const k = raw.get(t.id)?.personal_finance_category?.detailed + " :: " + t.name; others.set(k, (others.get(k) ?? 0) + t.amount); } console.log([...others].sort((a, b) => b[1] - a[1]).slice(0, 20));
await plaid.itemRemove({ access_token: token });
