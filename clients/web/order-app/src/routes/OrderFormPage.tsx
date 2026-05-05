/**
 * 메인 SPA 주문 작성 화면 (legacy `.wrap` line 658 1:1 모방).
 *
 * <p>구성:
 * - top bar: 4 카테고리 보기 버튼 + 임의 분기계산 + 견적/주문하기 + 발송내역 + 주문저장 + 저장내역 + timer
 * - mobile-gate: 진입 전 4 카테고리 큰 버튼 (no-active body)
 * - grid: 4 CategoryCard (홈멀티/싱글세트/상업멀티/구형) — body class 로 단일 카드만 표시
 *
 * <p>화면 토글은 body class (`home-active` / `single-active` / `comm-active` / `old-active` / `no-active`)
 * 로 동작. legacy CSS 그대로 사용.
 *
 * <p>인증 없으면 AuthGuard 가 `/auth/login` 으로 redirect — 본 컴포넌트는 인증 통과 가정.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryCard } from '../components/order/CategoryCard'
import { useOrderStore } from '../stores/order'
import { useSessionStore } from '../stores/session'
import type { EstimateCategory } from '../types'

type ActiveMode = 'no' | 'home' | 'single' | 'comm' | 'old'

function modeForCategory(cat: EstimateCategory | null): ActiveMode {
  if (cat === 'HOME_MULTI') return 'home'
  if (cat === 'SINGLE_SET') return 'single'
  if (cat === 'COMMERCIAL_MULTI') return 'comm'
  if (cat === 'LEGACY') return 'old'
  return 'no'
}

export function OrderFormPage() {
  const navigate = useNavigate()
  const auth = useSessionStore((s) => s.auth)
  const logout = useSessionStore((s) => s.logout)
  const activeCategory = useOrderStore((s) => s.activeCategory)
  const setActive = useOrderStore((s) => s.setActiveCategory)

  /**
   * dev-only — `?cat=home|single|comm|old` URL 파라미터로 초기 카테고리 설정.
   * QA 캡처 용도. 운영에서도 동작하나 Sub-team C 후속 PR 에서 유지/제거 결정.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cat = params.get('cat')
    if (!cat || activeCategory) return
    if (cat === 'home') setActive('HOME_MULTI')
    else if (cat === 'single') setActive('SINGLE_SET')
    else if (cat === 'comm') setActive('COMMERCIAL_MULTI')
    else if (cat === 'old') setActive('LEGACY')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const selectedCount = useOrderStore((s) => s.selectedCount())
  const grandTotal = useOrderStore((s) => s.grandTotal())

  const mode = modeForCategory(activeCategory)

  /**
   * legacy 의 body class 토글을 React effect 로 재현. 모달/카드 표시 CSS 가 body class 에
   * 의존하므로 mode 변경 시 직접 갱신.
   */
  useEffect(() => {
    const cls = ['no-active', 'home-active', 'single-active', 'comm-active', 'old-active']
    document.body.classList.remove(...cls)
    document.body.classList.add(`${mode}-active`)
    return () => {
      document.body.classList.remove(...cls)
    }
  }, [mode])

  const [autoLogoutSec, setAutoLogoutSec] = useState(30 * 60)
  useEffect(() => {
    const t = window.setInterval(() => setAutoLogoutSec((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(t)
  }, [])

  const accessLimitText = useMemo(() => {
    if (!auth?.accessLimit) return null
    const left = new Date(auth.accessLimit).getTime() - Date.now()
    if (left <= 0) return '만료'
    const min = Math.floor(left / 60000)
    return `${min}분 남음`
  }, [auth?.accessLimit])

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">
          주문서
          {selectedCount > 0 && <span className="badge">{selectedCount}</span>}
        </div>
        <div className="top-actions">
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

          <button id="btnOpenBranch" className="btn" disabled={mode !== 'comm'} onClick={() => navigate('/branch')}>
            임의 분기계산
          </button>
          <button id="btnPreview" className="btn" disabled={selectedCount === 0} onClick={() => navigate('/orders/preview')}>
            견적/주문하기
          </button>

          <div className="spec-history-group">
            <button id="btnHistory" className="btn" onClick={() => navigate('/orders')}>
              과거 발송내역 확인
            </button>
            <button id="btnSaveSnapshot" className="btn" style={{ background: '#059669', color: '#fff' }} onClick={() => navigate('/orders/snapshots')}>
              주문저장
            </button>
            <button id="btnLoadSnapshot" className="btn" style={{ background: '#78350f', color: '#fff' }} onClick={() => navigate('/orders/snapshots')}>
              저장내역
            </button>
          </div>

          <div id="timerContainer">
            {accessLimitText && (
              <div id="accessLimitTimer">
                <span style={{ fontSize: 12, color: 'var(--c-strong)', fontWeight: 'normal' }}>주문서 사용기한:</span>
                <br />
                <span id="accessLimitText">{accessLimitText}</span>
              </div>
            )}
            <div id="autoLogoutTimer">
              자동 로그아웃: {Math.floor(autoLogoutSec / 60)}분 {String(autoLogoutSec % 60).padStart(2, '0')}초
              <br />
              <button
                className="btn-mini"
                style={{ marginTop: 4, fontSize: 11 }}
                onClick={() => {
                  logout()
                  navigate('/auth/login', { replace: true })
                }}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mobile-gate" id="mobileGate">
        <button id="btnEnterHome" className="select-big select-home" onClick={() => setActive('HOME_MULTI')}>
          홈멀티
        </button>
        <button id="btnEnterSingle" className="select-big select-single" onClick={() => setActive('SINGLE_SET')}>
          싱글 세트
        </button>
        <button id="btnEnterComm" className="select-big select-comm" onClick={() => setActive('COMMERCIAL_MULTI')}>
          상업멀티
        </button>
        <button id="btnEnterOld" className="select-big select-old" onClick={() => setActive('LEGACY')}>
          구형
        </button>
      </div>

      <div className="grid">
        <CategoryCard id="cardHome" title="홈멀티" category="HOME_MULTI" />
        <CategoryCard id="cardSingle" title="싱글 세트" category="SINGLE_SET" />
        <CategoryCard id="cardComm" title="상업멀티" category="COMMERCIAL_MULTI" />
        <CategoryCard id="cardOld" title="구형" category="LEGACY" />
      </div>

      {selectedCount > 0 && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--c-line)', textAlign: 'right', fontWeight: 700 }}>
          전체 합계: {grandTotal.toLocaleString()} 원 ({selectedCount} 품목)
        </div>
      )}
    </div>
  )
}
