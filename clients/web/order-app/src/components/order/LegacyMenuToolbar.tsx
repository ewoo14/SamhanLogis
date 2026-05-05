/**
 * 정정 #17 — legacy partner-order index.html 의 메인 SPA 메뉴 toolbar 1:1.
 *
 * <p>legacy `<div class="top-actions">` (line 663-679) 의 모든 버튼:
 * <ul>
 *   <li>4 카테고리 보기 버튼 (홈멀티/싱글세트/상업멀티/구형) — `setActive` 호출</li>
 *   <li>임의 분기계산 (`btnOpenBranch`) — 상업멀티 활성 시만 enabled</li>
 *   <li>견적/주문하기 (`btnPreview`) — 라인 1+ 시 enabled</li>
 *   <li>과거 발송내역 확인 (`btnHistory`) — `/orders` navigate</li>
 *   <li>주문저장 (`btnSaveDraft`) — 현재 lines+info 30일 보관</li>
 *   <li>저장내역 (`btnDraftList`) — `/orders/snapshots` navigate</li>
 * </ul>
 *
 * <p>외부 의존:
 * - `useOrderStore` — activeCategory / setActiveCategory / lines / info / selectedCount
 * - `useDraftStore` — saveDraft 호출
 * - `useSessionStore` — auth (bizno/partnerName)
 *
 * <p>v3 분리 이유: OrderFormPage 가 길어져 가독성 보강 + 향후 모바일 toolbar 별도 분기 가능.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderStore } from '../../stores/order'
import { useSessionStore } from '../../stores/session'
import { useDraftStore } from '../../stores/draftStore'
import type { EstimateCategory } from '../../types'

type ActiveMode = 'no' | 'home' | 'single' | 'comm' | 'old'

function modeForCategory(cat: EstimateCategory | null): ActiveMode {
  if (cat === 'HOME_MULTI') return 'home'
  if (cat === 'SINGLE_SET') return 'single'
  if (cat === 'COMMERCIAL_MULTI') return 'comm'
  if (cat === 'LEGACY') return 'old'
  return 'no'
}

export function LegacyMenuToolbar() {
  const navigate = useNavigate()
  const auth = useSessionStore((s) => s.auth)
  const activeCategory = useOrderStore((s) => s.activeCategory)
  const setActive = useOrderStore((s) => s.setActiveCategory)
  const selectedCount = useOrderStore((s) => s.selectedCount())
  const lines = useOrderStore((s) => s.lines)
  const info = useOrderStore((s) => s.info)
  const grandTotal = useOrderStore((s) => s.grandTotal())
  const saveDraft = useDraftStore((s) => s.saveDraft)
  const mode = modeForCategory(activeCategory)

  const [savedToast, setSavedToast] = useState('')

  function handleSaveDraft() {
    if (lines.length === 0) {
      setSavedToast('저장할 라인이 없습니다.')
      window.setTimeout(() => setSavedToast(''), 2500)
      return
    }
    const d = saveDraft({
      title: `${auth?.partnerName ?? '미상'} 주문서`,
      bizno: auth?.bizno ?? '',
      partnerName: auth?.partnerName ?? '',
      lines,
      info,
      totalAmount: grandTotal,
    })
    setSavedToast(`저장됨 (${new Date(d.savedAt).toLocaleString('ko-KR')}, 30일 보관)`)
    window.setTimeout(() => setSavedToast(''), 3500)
  }

  return (
    <div id="legacyMenuToolbar" className="top-actions" data-testid="legacy-menu-toolbar">
      <div className="view-group">
        <button
          className={`btn-mini ${mode === 'home' ? 'is-active' : ''}`}
          id="btnGoHome"
          onClick={() => setActive('HOME_MULTI')}
        >
          홈멀티 보기
        </button>
        <button
          className={`btn-mini ${mode === 'single' ? 'is-active' : ''}`}
          id="btnGoSingle"
          onClick={() => setActive('SINGLE_SET')}
        >
          싱글세트 보기
        </button>
        <button
          className={`btn-mini ${mode === 'comm' ? 'is-active' : ''}`}
          id="btnGoComm"
          onClick={() => setActive('COMMERCIAL_MULTI')}
        >
          상업멀티 보기
        </button>
        <button
          className={`btn-mini ${mode === 'old' ? 'is-active' : ''}`}
          id="btnGoOld"
          onClick={() => setActive('LEGACY')}
        >
          구형 보기
        </button>
      </div>

      <button
        id="btnOpenBranch"
        className="btn"
        disabled={mode !== 'comm'}
        onClick={() => navigate('/branch')}
        title="상업멀티 활성 시에만 사용 가능"
      >
        임의 분기계산
      </button>
      <button
        id="btnPreview"
        className="btn"
        disabled={selectedCount === 0}
        onClick={() => navigate('/orders/preview')}
      >
        견적/주문하기
      </button>

      <div className="spec-history-group">
        <button id="btnHistory" className="btn" onClick={() => navigate('/orders')}>
          과거 발송내역 확인
        </button>
        <button
          id="btnSaveDraft"
          className="btn"
          style={{ background: '#059669', color: '#fff' }}
          onClick={handleSaveDraft}
          title="현재 작성중인 주문서를 30일간 보관"
        >
          주문저장
        </button>
        <button
          id="btnDraftList"
          className="btn"
          style={{ background: '#78350f', color: '#fff' }}
          onClick={() => navigate('/orders/snapshots')}
        >
          저장내역
        </button>
      </div>

      {savedToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            padding: '10px 14px',
            background: '#0f172a',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            zIndex: 9999,
            maxWidth: 360,
          }}
        >
          {savedToast}
        </div>
      )}
    </div>
  )
}
