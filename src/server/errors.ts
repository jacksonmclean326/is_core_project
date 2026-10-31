export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function supabaseFailure(error: unknown, fallbackStatus = 502): HttpError {
  const errorStatus = isRecord(error) ? error.status : undefined;
  const status =
    typeof errorStatus === "number" &&
    Number.isInteger(errorStatus) &&
    errorStatus >= 400 &&
    errorStatus < 600
      ? errorStatus
      : fallbackStatus;
  return new HttpError(
    status,
    error instanceof Error ? error.message : "Supabase request failed.",
  );
}

export function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}
