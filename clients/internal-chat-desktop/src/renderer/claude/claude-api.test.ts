import { describe, expect, it, vi } from 'vitest'
import { askClaude, claudeErrorMessage } from './claude-api'

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
})
