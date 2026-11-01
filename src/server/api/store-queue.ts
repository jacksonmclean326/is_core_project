/**
 * Saving imported transactions to the database happens after the response is sent, so the page
 * does not wait for it. Saves for one user run one at a time, and anything that needs the saved
 * rows (like moving a transaction) can wait for them to finish.
 */
const chains = new Map<string, Promise<void>>();

export function enqueueStore(userId: string, task: () => Promise<void>): void {
  const previous = chains.get(userId) ?? Promise.resolve();
  const next: Promise<void> = previous
    .then(task, task)
    .catch(() => {
      /* each task reports its own errors */
    })
    .finally(() => {
      if (chains.get(userId) === next) chains.delete(userId);
    });
  chains.set(userId, next);
}

export async function settleStores(userId: string): Promise<void> {
  await chains.get(userId);
}
