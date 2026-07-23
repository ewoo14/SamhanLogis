// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test } from 'vitest'

import { useTemplateDraft, type TemplateDraftState } from './useTemplateDraft'
import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'

function DraftHarness({ template }: { template?: TemplateDraftState }) {
  const { draft, updateDraft, addElement, updateElement, valid, dirty, validationError } = useTemplateDraft(template)

  return (
    <>
      <output data-testid="doc-type">{draft.docType}</output>
      <output data-testid="validation-error">{validationError ?? ''}</output>
      <button type="button" onClick={() => updateDraft({ name: '사용자 양식' })}>양식명 입력</button>
      <button type="button" onClick={() => updateDraft({ name: '' })}>양식명 비우기</button>
      <button type="button" onClick={() => updateDraft({ docType: 'GROUPWARE_EXPENSE_REPORT' })}>유형 선택</button>
      <button type="button" onClick={() => addElement('TEXT')}>문구 추가</button>
      <button type="button" onClick={() => updateElement('text-1', { geometry: { x: -1, y: 0, w: 10, h: 10 } })}>위치 오류 만들기</button>
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

  test('R4 RED: 양식명이 비어 있으면 유형 선택 후에도 내부 용어가 아닌 양식명 입력 안내를 유지한다', () => {
    render(<DraftHarness />)

    fireEvent.click(screen.getByRole('button', { name: '양식명 비우기' }))
    expect(screen.getByTestId('validation-error').textContent).toBe('문서 유형을 선택해야 저장할 수 있습니다.')

    fireEvent.click(screen.getByRole('button', { name: '유형 선택' }))

    const message = screen.getByTestId('validation-error').textContent
    expect(message).toBe('양식명을 입력해야 저장할 수 있습니다.')
    expect(message).not.toMatch(/envelope|payload|schema|parse/i)
  })

  test('P-2 RED: 요소 검증 실패도 내부 geometry 용어 대신 사용자가 고칠 위치와 크기를 말한다', () => {
    render(<DraftHarness />)

    fireEvent.click(screen.getByRole('button', { name: '유형 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '문구 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '위치 오류 만들기' }))

    expect(screen.getByTestId('validation-error').textContent).toBe('요소의 위치와 크기를 확인하세요.')
    expect(screen.getByTestId('validation-error').textContent).not.toContain('geometry')
  })
})
