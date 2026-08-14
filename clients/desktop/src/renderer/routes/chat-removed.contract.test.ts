import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routesSource = readFileSync(resolve(process.cwd(), 'src/renderer/routes/index.tsx'), 'utf8')
const layoutSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/AppLayout.tsx'), 'utf8')

describe('본체 채팅 잔재 제거 계약', () => {
  it('라우트 레지스트리에 본체 채팅 경로가 없다', () => {
    expect(routesSource).not.toMatch(/path:\s*["']\/chat(?:\/:roomCode)?["']/)
  })

  it('AppLayout 사이드바에 본체 채팅 링크가 없다', () => {
    expect(layoutSource).not.toMatch(/to=["']\/chat["']/)
  })
})
