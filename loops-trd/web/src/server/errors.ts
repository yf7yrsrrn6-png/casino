export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code?: string) => new HttpError(400, m, code);
export const unauthorized = (m = "Потрібен вхід") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "Недостатньо прав") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Не знайдено") => new HttpError(404, m, "not_found");
export const conflict = (m: string, code?: string) => new HttpError(409, m, code);
