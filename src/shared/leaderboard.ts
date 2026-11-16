export type MonthlyChallengeId = "micro-savings" | "eating-out" | "round-up";
export type LeaderboardStatus = "completed" | "in-progress" | "on-track" | "cap-reached";
export const leaderboardVisibilityEvent = "money-man-leaderboard-visibility";

export interface MonthlyChallenge {
  id: MonthlyChallengeId;
  title: string;
  description: string;
  month: string;
  daysRemaining: number;
}

/** Only normalized, non-financial fields are returned by the leaderboard API. */
export interface LeaderboardEntry {
  id: string;
  name: string;
  isYou: boolean;
  score: number;
  status: LeaderboardStatus;
}

export interface LeaderboardResponse {
  challenge: MonthlyChallenge;
  entries: LeaderboardEntry[];
  visible: boolean;
  updatedAt: string;
}

export interface ChallengeTransaction {
  id: string;
  amount: number | null;
  date: string | null;
  category: string | null;
  name: string | null;
}

export interface ChallengeScore {
  score: number;
  status: LeaderboardStatus;
  /** Used only for server-side ordering; never include this in the API response. */
  completedAt: string | null;
}

export interface RankedLeaderboardEntry extends LeaderboardEntry {
  completedAt: string | null;
}

const challenges: readonly Omit<MonthlyChallenge, "month" | "daysRemaining">[] = [
  {
    id: "micro-savings",
    title: "Micro-Savings Sprint",
    description: "Save $250 this month. Progress is based on monthly income minus spending; finishers rank by who reached the target first.",
  },
  {
    id: "eating-out",
    title: "The Eating Out Challenge",
    description: "Stay within a $150 allowance for food-category restaurant and takeout purchases; your score shows the percentage of allowance left.",
  },
  {
    id: "round-up",
    title: "The Spare-Change Round-Up Race",
    description: "Round each purchase up to the next whole dollar and reach $35 in virtual round-ups. Exact-dollar purchases add $0.",
  },
];

export function currentMonthlyChallenge(now: Date = new Date()): MonthlyChallenge {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const challenge = challenges[monthIndex % challenges.length]!;
  return {
    ...challenge,
    month,
    daysRemaining: daysInMonth - now.getUTCDate() + 1,
  };
}

function transactionCents(transaction: ChallengeTransaction): number {
  const amount = transaction.amount;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : 0;
}

function isGroceryMerchant(name: string | null): boolean {
  return /\b(?:grocery|groceries|supermarket|whole foods|trader joe'?s|safeway|kroger|aldi|publix|food lion|wegmans|h[\s-]?e[\s-]?b|meijer|sprouts|winco|instacart|costco|walmart|sam'?s club|bj'?s wholesale|farmers market)\b/i.test(name ?? "");
}

function isEatingOut(transaction: ChallengeTransaction): boolean {
  return transaction.category === "food" && !isGroceryMerchant(transaction.name);
}

function percent(value: number, target: number): number {
  if (!Number.isFinite(value) || value <= 0 || target <= 0) return 0;
  return Math.min(100, value / target * 100);
}

export function scoreMonthlyChallenge(
  challenge: MonthlyChallenge,
  transactions: ChallengeTransaction[],
  monthlyIncome: number | null,
  monthlyBudget: number | null,
): ChallengeScore {
  if (challenge.id === "micro-savings") {
    const spentCents = transactions.reduce((total, transaction) => total + transactionCents(transaction), 0);
    const income = monthlyIncome && monthlyIncome > 0 ? monthlyIncome : monthlyBudget ?? 0;
    const hasSpending = transactions.some((transaction) => transactionCents(transaction) > 0);
    const savings = hasSpending ? Math.max(0, income - spentCents / 100) : 0;
    const score = percent(savings, 250);
    const completed = score >= 100;
    // The existing savings metric is monthly income minus spending, with no timestamped deposit events.
    // A completed balance therefore first meets the threshold at the start of the period.
    return {
      score,
      status: completed ? "completed" : "in-progress",
      completedAt: completed ? `${challenge.month}-01T00:00:00.000Z` : null,
    };
  }

  if (challenge.id === "eating-out") {
    const spentCents = transactions.reduce(
      (total, transaction) => total + (isEatingOut(transaction) ? transactionCents(transaction) : 0),
      0,
    );
    const health = Math.max(0, (15000 - spentCents) / 15000 * 100);
    const score = health;
    return {
      score,
      status: score > 0 ? "on-track" : "cap-reached",
      completedAt: null,
    };
  }

  let roundUpsMicros = 0;
  let completedAt: string | null = null;
  const chronological = [...transactions].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id),
  );
  for (const transaction of chronological) {
    const amount = transaction.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
    const amountMicros = Math.round(amount * 1_000_000);
    roundUpsMicros += Math.ceil(amount) * 1_000_000 - amountMicros;
    if (roundUpsMicros >= 35_000_000) {
      completedAt = transaction.date ? transaction.date.slice(0, 10) : `${challenge.month}-01`;
      break;
    }
  }
  const score = percent(roundUpsMicros / 1_000_000, 35);
  return {
    score,
    status: completedAt ? "completed" : "in-progress",
    completedAt: completedAt ? `${completedAt}T00:00:00.000Z` : null,
  };
}

export function rankChallengeEntries(
  entries: RankedLeaderboardEntry[],
  challengeId: MonthlyChallengeId,
): RankedLeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (challengeId !== "eating-out") {
      const aComplete = a.status === "completed";
      const bComplete = b.status === "completed";
      if (aComplete !== bComplete) return aComplete ? -1 : 1;
      if (aComplete && bComplete) {
        const byCompletion = (a.completedAt ?? "").localeCompare(b.completedAt ?? "");
        if (byCompletion) return byCompletion;
      }
    }
    return b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
