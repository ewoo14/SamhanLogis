export interface ClaudeApiError {
  status: number
  message: string
}

interface ClaudeResponse {
  answer?: unknown
  data?: { answer?: unknown; virtualAgent?: unknown }
  message?: unknown
}

interface RequestOptions {
  request?: typeof fetch
  token?: string | null
  sessionCode?: string
}

export interface ClaudeSession {
  sessionCode: string
  title: string
  messageCount?: number
}

function baseUrl(): string {
  return String(import.meta.env.VITE_AUTH_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as { data?: T; answer?: unknown; message?: unknown }
  if (!response.ok) {
    throw { status: response.status, message: typeof payload.message === 'string' ? payload.message : '' } satisfies ClaudeApiError
  }
  return (payload.data ?? payload) as T
}

export async function askClaude(question: string, options: RequestOptions = {}): Promise<string> {
  const request = options.request ?? fetch
  const endpoint = options.sessionCode
    ? `${baseUrl()}/auth/claude/sessions/${encodeURIComponent(options.sessionCode)}/messages`
    : `${baseUrl()}/auth/claude/conversations`
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  const response = await request(endpoint, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(options.sessionCode ? { question, sessionCode: options.sessionCode } : { question }),
  })
  const payload = await response.json() as ClaudeResponse
  if (!response.ok) {
    const error: ClaudeApiError = {
      status: response.status,
      message: typeof payload.message === 'string' ? payload.message : '',
    }
    throw error
  }
  const data = payload.data ?? payload
  if (typeof data.answer !== 'string' || data.answer.length === 0) {
    throw { status: response.status, message: 'Claude 응답이 비어 있습니다.' } satisfies ClaudeApiError
  }
  return data.answer
}

export function claudeErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    if (status === 403) return 'Claude 사용 권한이 없습니다. 서버가 요청을 거부했습니다.'
    if (status === 503) return 'Claude 자격이 설정되지 않았습니다. 관리자에게 문의해주세요.'
  }
  return 'Claude 대화를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

export async function createClaudeSession(options: Pick<RequestOptions, 'request' | 'token'> = {}): Promise<ClaudeSession> {
  const request = options.request ?? fetch
  const response = await request(`${baseUrl()}/auth/claude/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    credentials: 'include',
    body: JSON.stringify({}),
  })
  return parseResponse<ClaudeSession>(response)
}

export async function listClaudeSessions(options: Pick<RequestOptions, 'request' | 'token'> = {}): Promise<ClaudeSession[]> {
  const request = options.request ?? fetch
  const response = await request(`${baseUrl()}/auth/claude/sessions`, {
    headers: { Accept: 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    credentials: 'include',
  })
  return parseResponse<ClaudeSession[]>(response)
}
