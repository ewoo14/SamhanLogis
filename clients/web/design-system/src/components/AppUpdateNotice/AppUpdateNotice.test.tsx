// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppUpdateNotice, AppUpdateNoticeStack } from './AppUpdateNotice'

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

    const stack = screen.getByTestId('app-update-notice').parentElement as HTMLElement
    expect(stack.dataset.appUpdateNoticeStack).toBeDefined()
    expect(stack.style.getPropertyValue('--app-update-notice-top')).toBe('16px')
    expect(screen.getByTestId('first-content')).toBeTruthy()
  })
})
