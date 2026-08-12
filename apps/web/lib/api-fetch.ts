/**
 * Thrown by apiFetch for both non-2xx HTTP responses and network failures.
 * `status` is 0 for network failures (fetch itself rejected, no response was received).
 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = "ApiError"
    this.status = status
  }
}

class UnparseableBody {
  constructor(public text: string) {}
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return new UnparseableBody(text)
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown }
    if (typeof b.message === "string" && b.message) return b.message
    if (typeof b.error === "string" && b.error) return b.error
  }
  return `Request failed (${status})`
}

/**
 * Fetch wrapper for JSON APIs. Parses the response body once, throws ApiError
 * on non-2xx responses (using the server's { error } message when present)
 * or on network failure. Returns undefined for empty 2xx bodies (e.g. a
 * presigned-URL PUT with no JSON response).
 */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (cause) {
    throw new ApiError("Network error, check your connection and try again.", 0, { cause })
  }

  const body = await parseBody(res)

  if (res.ok && body instanceof UnparseableBody) {
    throw new ApiError("Unexpected response from the server.", res.status)
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(body, res.status), res.status)
  }

  return body as T
}
