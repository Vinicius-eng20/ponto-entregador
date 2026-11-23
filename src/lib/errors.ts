/** Erro de regra de negócio, com o status HTTP que a API deve devolver. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 = 400,
    readonly code: string = "invalid_data",
  ) {
    super(message);
  }
}
