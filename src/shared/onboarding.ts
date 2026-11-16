export const onboardingReasons = [
  "save_money",
  "learn_budgeting",
  "organize_finances",
  "other",
] as const;

export type OnboardingReason = (typeof onboardingReasons)[number];
