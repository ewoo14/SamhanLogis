export interface ClaudeApiError {
  status: number
  message: string
}

interface ClaudeResponse {
  answer?: unknown
  message?: unknown
}

interface RequestOptions {
  request?: typeof fetch
  token?: string | null
}

export async function askClaude(question: string, options: RequestOptions = {}): Promise<string> {
  const request = options.request ?? fetch
  const baseUrl = String(import.meta.env.VITE_AUTH_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  const response = await request(`${baseUrl}/auth/claude/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question }),
  })
  const payload = await response.json() as ClaudeResponse
  if (!response.ok) {
    const error: ClaudeApiError = {
      status: response.status,
      message: typeof payload.message === 'string' ? payload.message : '',
    }
    throw error
  }
  if (typeof payload.answer !== 'string' || payload.answer.length === 0) {
    throw { status: response.status, message: 'Claude 응답이 비어 있습니다.' } satisfies ClaudeApiError
  }
  return payload.answer
}

export function claudeErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    if (status === 403) return 'Claude 사용 권한이 없습니다. 서버가 요청을 거부했습니다.'
    if (status === 503) return 'Claude 자격이 설정되지 않았습니다. 관리자에게 문의해주세요.'
  }
  return 'Claude 대화를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
}
