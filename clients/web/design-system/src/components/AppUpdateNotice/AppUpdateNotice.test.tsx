// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AppUpdateNotice, AppUpdateNoticeStack } from './AppUpdateNotice'

const vitestGlobal = globalThis as typeof globalThis & { process: { cwd: () => string } }
const cssSource = readFileSync(join(vitestGlobal.process.cwd(), 'src/components/AppUpdateNotice/AppUpdateNotice.module.css'), 'utf8')

describe('AppUpdateNotice', () => {
  it('본문 흐름을 밀지 않는 고정 오버레이로 표시한다', () => {
    render(
      <>
        <AppUpdateNotice
          severity="network"
          title="업데이트 서버에 연결하지 못했습니다"
          description="잠시 후 다시 확인해 주세요."
          testId="layout-notice"
        />
        <main data-testid="first-content">본문 첫 요소</main>
      </>,
    )

    const notice = screen.getByTestId('layout-notice')
    expect(notice.getAttribute('data-layout')).toBe('overlay')
    expect(screen.getByTestId('first-content')).toBeTruthy()
  })

  it('원인·상황·다음 행동을 심각도와 함께 보여준다', () => {
    render(
      <AppUpdateNotice
        severity="trust"
        title="업데이트 파일의 인증서를 신뢰할 수 없습니다"
        description="사내 IT 지원팀에 인증서 배포를 요청해 주세요. 그동안 앱은 그대로 사용할 수 있습니다."
        actions={<button type="button">다시 확인</button>}
      />,
    )

    expect(screen.getByRole('status').textContent).toContain('인증서를 신뢰할 수 없습니다')
    expect(screen.getByRole('status').textContent).toContain('그동안 앱은 그대로 사용할 수 있습니다')
    expect(screen.getByText('TRUST')).toBeTruthy()
  })

  it('업무 화면을 덮지 않는 일반 흐름 카드로 렌더링한다', () => {
    render(<AppUpdateNotice severity="network" title="업데이트 서버에 연결하지 못했습니다" description="잠시 후 다시 확인해 주세요." />)

    const notice = screen.getByRole('status')
    expect(notice.getAttribute('data-severity')).toBe('network')
    expect((notice as HTMLElement).style.position).not.toBe('fixed')
    expect((notice as HTMLElement).style.zIndex).not.toBe('10000')
  })

  it('재시도 동작을 앱 게이트에 전달한다', () => {
    const onRetry = vi.fn()
    render(<AppUpdateNotice severity="integrity" title="업데이트 파일을 확인하지 못했습니다" description="다시 확인해 주세요." onRetry={onRetry} />)

    screen.getByRole('button', { name: '다시 확인' }).click()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('stack 위치는 현재 본문 조작 요소의 실제 끝에서 계산하고 본문 흐름을 밀지 않는다', () => {
    render(
      <>
        <AppUpdateNoticeStack>
          <AppUpdateNotice severity="network" title="업데이트" description="확인해 주세요." />
        </AppUpdateNoticeStack>
        <main data-testid="first-content">본문 첫 요소</main>
      </>,
    )

    const stack = screen.getAllByTestId('app-update-notice')[0]!.parentElement as HTMLElement
    expect(stack.dataset.appUpdateNoticeStack).toBeDefined()
    expect(stack.style.getPropertyValue('--app-update-notice-top')).toBe('16px')
    expect(screen.getByTestId('first-content')).toBeTruthy()
  })

  it('stack 자체를 키보드로 스크롤할 수 있는 독립 영역으로 노출한다', () => {
    render(
      <AppUpdateNoticeStack>
        <AppUpdateNotice severity="network" title="첫 번째" description="확인해 주세요." />
        <AppUpdateNotice severity="trust" title="두 번째" description="확인해 주세요." />
        <AppUpdateNotice severity="disabled" title="세 번째" description="확인해 주세요." />
      </AppUpdateNoticeStack>,
    )

    const stack = screen.getAllByTestId('app-update-notice')[0]!.parentElement as HTMLElement
    expect(stack.getAttribute('role')).toBe('region')
    expect(stack.getAttribute('aria-label')).toBe('업데이트 알림')
    expect(stack.tabIndex).toBe(0)
    expect(stack.dataset.scrollable).toBe('true')
  })

  it('stack의 빈 영역은 아래 날짜·저장 조작으로 hit-test를 통과시킨다', () => {
    const stackRule = cssSource.slice(cssSource.indexOf('.stack {'), cssSource.indexOf('.stack .notice'))
    expect(stackRule).toContain('pointer-events: none')
  })

  it('확대 배율에서도 스택 하단에 버튼 전체가 들어갈 내부 여유를 예약한다', () => {
    const stackRule = cssSource.slice(cssSource.indexOf('.stack {'), cssSource.indexOf('.stack .notice'))
    expect(stackRule).toContain('padding-block: 1px 1px')
  })

  it('스택 경계에서 본문 스크롤러를 찾지 못해도 MAIN으로 휠을 위임한다', () => {
    render(
      <>
        <AppUpdateNoticeStack>
          <AppUpdateNotice severity="network" title="첫 번째" description="확인해 주세요." />
          <AppUpdateNotice severity="trust" title="두 번째" description="확인해 주세요." />
        </AppUpdateNoticeStack>
        <main data-testid="scroll-main">본문</main>
      </>,
    )

    const stack = screen.getAllByTestId('app-update-notice')[0]!.parentElement as HTMLElement
    const main = screen.getByTestId('scroll-main') as HTMLElement
    Object.defineProperties(stack, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    })
    Object.defineProperties(main, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    })
    vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 300, top: 0, bottom: 100, width: 300, height: 100, x: 0, y: 0, toJSON: () => ({}) })
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => document.body) })

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, clientX: 100, clientY: 50, bubbles: true, cancelable: true }))

    expect(main.scrollTop).toBeGreaterThan(100)
  })

  it('확대된 좁은 화면에서 우측 스크롤바 띠와 겹친 배너 버튼도 마우스 클릭을 받는다', () => {
    const onClick = vi.fn()
    render(
      <AppUpdateNoticeStack>
        <AppUpdateNotice
          severity="network"
          title="업데이트"
          description="확인해 주세요."
          actions={<button type="button" onClick={onClick}>CSV 다운로드</button>}
        />
        <AppUpdateNotice severity="trust" title="두 번째" description="확인해 주세요." />
      </AppUpdateNoticeStack>,
    )

    const stack = screen.getByRole('region') as HTMLElement
    const button = screen.getByRole('button', { name: 'CSV 다운로드' })
    Object.defineProperties(stack, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 220 },
    })
    vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100,
      x: 0, y: 0, toJSON: () => ({}),
    })
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 84, right: 100, top: 40, bottom: 72, width: 16, height: 32,
      x: 84, y: 40, toJSON: () => ({}),
    })

    button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 95,
      clientY: 56,
    }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
