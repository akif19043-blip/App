/** An error that is safe to show to the user, with the HTTP status to use. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Nie znaleziono.") => new AppError("not_found", what, 404);
export const forbidden = (why = "Brak uprawnień.") => new AppError("forbidden", why, 403);
export const unauthorized = () => new AppError("unauthorized", "Zaloguj się, aby kontynuować.", 401);
