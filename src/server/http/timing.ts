/** Collects how long each step of a request takes and reports it in a Server-Timing header. */
export function createTimer() {
  const entries: [string, number][] = [];
  return {
    async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await action();
      } finally {
        entries.push([name, performance.now() - start]);
      }
    },
    header(): string {
      return entries.map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(", ");
    },
  };
}

export type Timer = ReturnType<typeof createTimer>;
