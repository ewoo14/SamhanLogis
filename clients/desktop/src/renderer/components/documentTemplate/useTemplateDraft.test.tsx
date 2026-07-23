// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test } from 'vitest'

import { useTemplateDraft, type TemplateDraftState } from './useTemplateDraft'
import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'

function DraftHarness({ template }: { template?: TemplateDraftState }) {
  const { draft, updateDraft, valid, dirty, validationError } = useTemplateDraft(template)

  return (
    <>
      <output data-testid="doc-type">{draft.docType}</output>
      <output data-testid="validation-error">{validationError ?? ''}</output>
      <button type="button" onClick={() => updateDraft({ name: '사용자 양식' })}>양식명 입력</button>
      <button type="button" onClick={() => updateDraft({ docType: 'GROUPWARE_EXPENSE_REPORT' })}>유형 선택</button>
      <button type="button" disabled={!valid || !dirty}>저장</button>
    </>
  )
}

describe('useTemplateDraft', () => {
  afterEach(cleanup)

  test('신규 양식은 문서 유형을 선택하기 전 저장할 수 없다', () => {
    render(<DraftHarness />)

    expect(screen.getByTestId('doc-type').textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '양식명 입력' }))

    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('기존 양식은 서버의 문서 유형을 유지한다', () => {
    render(<DraftHarness template={{ ...GROUPWARE_DEFAULT, schemaVersion: 2, id: 'template-1', status: 'DRAFT', docType: 'GROUPWARE_EXPENSE' }} />)

    expect(screen.getByTestId('doc-type').textContent).toBe('GROUPWARE_EXPENSE')
  })

  // R2(#914) 발견2 — 저장이 막힌 이유는 사용자의 말(문서 유형을 선택하라)로 와야 한다. parser의 내부
  // envelope 검증 문구("문서 양식 envelope 필드가 유효하지 않습니다")를 화면에 그대로 노출하지 않는다(P-4).
  // 재현 경로: #/groupware/document-templates/new/edit → 양식명 먼저 입력(유형 미선택, 순서 강제 없음).
  test('R2: 신규 양식에서 유형 미선택 중 저장 안내는 "envelope" 같은 내부 용어가 아니라 유형을 선택하라고 말한다', () => {
    render(<DraftHarness />)

    fireEvent.click(screen.getByRole('button', { name: '양식명 입력' }))

    const message = screen.getByTestId('validation-error').textContent
    expect(message).not.toContain('envelope')
    expect(message).toContain('문서 유형')
  })

  test('R2 회귀: 유형을 선택하면 그 안내가 사라진다(항상 뜨는 문구로 잘못 고정되지 않았는지 확인)', () => {
    render(<DraftHarness />)

    fireEvent.click(screen.getByRole('button', { name: '양식명 입력' }))
    expect(screen.getByTestId('validation-error').textContent).not.toBe('')

    fireEvent.click(screen.getByRole('button', { name: '유형 선택' }))

    expect(screen.getByTestId('validation-error').textContent).toBe('')
  })
})
