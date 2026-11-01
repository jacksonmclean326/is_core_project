import type { Transaction } from "plaid";
import { isRecord } from "../errors.js";
import { applyOverrides, categorizeTransaction, type CategoryId, type CategoryOverrides } from "../categorize.js";

export interface PublicTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: CategoryId;
  account: string;
  institution: string;
  /** typed in by the user rather than imported from a bank */
  manual?: boolean;
}

export interface StoredTransaction extends PublicTransaction {
  accountId: string;
}

export function plaidErrorCode(error: unknown): string | undefined {
  const response = isRecord(error) && isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : null;
  return data && typeof data.error_code === "string" ? data.error_code : undefined;
}

/** Sorts Plaid's transactions into categories, dropping everything that is not spending. */
export function toStoredTransactions(
  plaidTransactions: Transaction[],
  accounts: { account_id: string; name: string }[],
  institution: string,
  overrides?: CategoryOverrides,
): StoredTransaction[] {
  const accountNames = new Map(accounts.map((account) => [account.account_id, account.name]));
  const result: StoredTransaction[] = [];
  for (const transaction of plaidTransactions) {
    const category = categorizeTransaction({
      name: transaction.name,
      merchantName: transaction.merchant_name,
      amount: transaction.amount,
      primaryCategory: transaction.personal_finance_category?.primary,
      detailedCategory: transaction.personal_finance_category?.detailed,
    });
    if (!category) continue;
    const name = transaction.merchant_name || transaction.name;
    result.push({
      id: transaction.transaction_id,
      name,
      amount: transaction.amount,
      date: transaction.date,
      category: applyOverrides(category, { id: transaction.transaction_id, name }, overrides),
      account: accountNames.get(transaction.account_id) ?? "Linked account",
      institution,
      accountId: transaction.account_id,
    });
  }
  return result;
}
