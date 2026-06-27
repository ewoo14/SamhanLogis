// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PushPermissionDeniedToast } from './PushPermissionDeniedToast'

describe('PushPermissionDeniedToast', () => {
  afterEach(() => {
    cleanup()
  })

  it('푸시 권한 거부 이벤트를 받으면 인앱 안내를 한 번 표시한다', () => {
    render(<PushPermissionDeniedToast />)

    act(() => {
      window.dispatchEvent(new CustomEvent('samhan:push-permission-denied'))
    })

    expect(screen.getByRole('alert').textContent).toContain(
      '푸시 알림 권한이 거부되었습니다. 기기 설정에서 허용해 주세요.',
    )
  })
})
