export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

export class NotFoundError extends PlatformError {
  constructor(message = "The requested resource was not found.") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends PlatformError {
  constructor(currentRevision: number) {
    super(
      "REVISION_CONFLICT",
      "This project was updated by another request. Reload before saving again.",
      409,
      { currentRevision },
    );
  }
}

export class ValidationError extends PlatformError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 400, details);
  }
}

