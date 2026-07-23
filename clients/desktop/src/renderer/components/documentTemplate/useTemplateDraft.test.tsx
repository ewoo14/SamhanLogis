// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test } from 'vitest'

import { useTemplateDraft, type TemplateDraftState } from './useTemplateDraft'
import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'

function DraftHarness({ template }: { template?: TemplateDraftState }) {
  const { draft, updateDraft, valid, dirty } = useTemplateDraft(template)

  return (
    <>
      <output data-testid="doc-type">{draft.docType}</output>
      <button type="button" onClick={() => updateDraft({ name: '사용자 양식' })}>양식명 입력</button>
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
})
