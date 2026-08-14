import { describe, expect, it, vi } from 'vitest'
import { askClaude, claudeErrorMessage, createClaudeSession, listClaudeSessions } from './claude-api'

describe('Claude conversation API boundary', () => {
  it('preserves the server 403 denial instead of fabricating a response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Claude 사용 권한이 없습니다.' }), { status: 403 }),
    )

    await expect(askClaude('오늘 배차 현황을 알려줘', { request })).rejects.toMatchObject({ status: 403 })
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/auth/claude/conversations'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows missing credentials as a blocking error, not a mock answer', () => {
    expect(claudeErrorMessage({ status: 503 })).toContain('자격')
  })

  it('creates and lists server-backed Claude sessions without exposing UUIDs', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { sessionCode: 'CLD-20260814-000001', title: '새 대화' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ sessionCode: 'CLD-20260814-000001', title: '새 대화', messageCount: 0 }] }), { status: 200 }))

    await expect(createClaudeSession({ request })).resolves.toMatchObject({ sessionCode: 'CLD-20260814-000001' })
    await expect(listClaudeSessions({ request })).resolves.toHaveLength(1)
    expect(request.mock.calls[0]?.[0]).toContain('/auth/claude/sessions')
    expect(JSON.stringify(request.mock.calls)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i)
  })

  it('sends each question with its server session code so conversations stay separated', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ answer: '답변' }), { status: 200 }),
    )

    await askClaude('두 번째 질문', { request, sessionCode: 'CLD-20260814-000002' })

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/auth/claude/sessions/CLD-20260814-000002/messages'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reads the standard response envelope and preserves the virtual-agent marker', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { answer: '[가상 에이전트] 실제 Claude 모델 응답이 아닙니다.', virtualAgent: true },
    }), { status: 200 }))

    await expect(askClaude('라이브 QA', { request })).resolves.toContain('[가상 에이전트]')
  })
})
