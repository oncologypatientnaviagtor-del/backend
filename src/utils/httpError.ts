export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const ASSISTANT_UNAVAILABLE =
  "We're having trouble connecting to the assistant. Please try again.";

export const DATABASE_UNAVAILABLE =
  "We couldn't reach the database. Please try again.";
