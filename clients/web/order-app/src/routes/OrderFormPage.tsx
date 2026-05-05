/**
 * 메인 SPA 주문 작성 화면 (legacy `.wrap` line 658 1:1 + v2 + v3 정정 #17/#18).
 *
 * <p>v2 → v3 변경:
 * <ul>
 *   <li>정정 #17 — legacy 메뉴 toolbar 를 {@link LegacyMenuToolbar} 로 분리,
 *       주문저장 (`btnSaveDraft`) 과 저장내역 (`btnDraftList`) 를 명확히 분리.
 *       주문저장은 PartnerOrderDraft 30일 보관 (sessionStorage fallback).</li>
 *   <li>정정 #17 — 9 모달 inventory placeholder mount ({@link LegacyModalInventory}).</li>
 *   <li>정정 #18 — 라인 1건 이상 추가 시에만 `cardOrderInfo` ({@link InlineOrderInfoCard}) 자동 표시 +
 *       첫 input(배송지) focus. 라인 0건 시에는 4 카테고리 카드 grid 만 노출.</li>
 * </ul>
 *
 * <p>화면 토글은 body class (`home-active` / `single-active` / `comm-active` / `old-active` / `no-active`)
 * 로 동작. legacy CSS 그대로 사용.
 *
 * <p>인증 없으면 AuthGuard 가 `/auth/login` 으로 redirect — 본 컴포넌트는 인증 통과 가정.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryCard } from '../components/order/CategoryCard'
import { LegacyMenuToolbar } from '../components/order/LegacyMenuToolbar'
import { LegacyModalInventory } from '../components/order/LegacyModalInventory'
import { InlineOrderInfoCard } from '../components/order/InlineOrderInfoCard'
import { useOrderStore } from '../stores/order'
import { useSessionStore } from '../stores/session'
import { useDcConfigStore } from '../stores/dcConfigStore'
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
  const lines = useOrderStore((s) => s.lines)
  const dcConfig = useDcConfigStore((s) => s.config)

  /**
   * dev-only — `?cat=home|single|comm|old` URL 파라미터로 초기 카테고리 설정 +
   * `window.__SAMHAN_QA_SEED__.lines` 주입 (dev-qa-seed.html 에서 시드 후 navigate).
   * QA 캡처 용도. 운영에서도 동작하나 후속 PR 에서 유지/제거 결정.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cat = params.get('cat')
    if (!activeCategory) {
      if (cat === 'home') setActive('HOME_MULTI')
      else if (cat === 'single') setActive('SINGLE_SET')
      else if (cat === 'comm') setActive('COMMERCIAL_MULTI')
      else if (cat === 'old') setActive('LEGACY')
    }
    // dev-qa-seed.html 에서 주입된 라인 시드 (sessionStorage 경유)
    try {
      const raw = window.sessionStorage.getItem('samhan.qa.seed.lines')
      if (raw) {
        const seedLines = JSON.parse(raw) as unknown[]
        const existing = useOrderStore.getState().lines
        if (existing.length === 0 && Array.isArray(seedLines)) {
          useOrderStore.setState({ lines: seedLines as never })
        }
        window.sessionStorage.removeItem('samhan.qa.seed.lines')
      }
    } catch {
      /* ignore */
    }
    // dev-qa-drag.html 에서 drag-demo 활성 — 첫 라인에 시각 효과 주입
    try {
      const raw = window.sessionStorage.getItem('samhan.qa.dragdemo')
      if (raw) {
        const cfg = JSON.parse(raw) as { enable?: boolean }
        if (cfg.enable) {
          // body class — CSS 가 첫 sortable row 에 시각 효과 적용
          document.body.classList.add('qa-dragdemo-active')
        }
        window.sessionStorage.removeItem('samhan.qa.dragdemo')
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const selectedCount = useOrderStore((s) => s.selectedCount())

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

  /** 정정 #18 — 라인 1건 이상 시에만 cardOrderInfo 표시. */
  const showOrderInfoCard = lines.length > 0 && mode !== 'no'

  return (
    <div className="wrap">
      {/* 정정 #12 — DC 적용 거래처 정보 상단 표시 */}
      {dcConfig && (
        <div
          className="dc-banner"
          role="status"
          aria-label="거래처 DC 적용 안내"
          style={{
            margin: '8px 0',
            padding: '10px 14px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            fontSize: 13,
            color: '#1e3a8a',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <strong>{dcConfig.partnerName}</strong>
          <span aria-label="DC 율">
            {dcConfig.homeMultiDc !== null && (
              <>
                홈멀티 DC <strong>{Math.round(dcConfig.homeMultiDc * 100)}%</strong>
                {' · '}
              </>
            )}
            {dcConfig.commercialMultiDc !== null && (
              <>
                상업멀티 DC <strong>{Math.round(dcConfig.commercialMultiDc * 100)}%</strong>
                {' · '}
              </>
            )}
            {dcConfig.option4way !== null && (
              <>
                옵션 4way{' '}
                <strong>
                  {dcConfig.option4way > 0 ? '+' : ''}
                  {dcConfig.option4way.toLocaleString()}
                </strong>{' '}
                ·{' '}
              </>
            )}
            {dcConfig.option360 !== null && (
              <>
                360{' '}
                <strong>
                  {dcConfig.option360 > 0 ? '+' : ''}
                  {dcConfig.option360.toLocaleString()}
                </strong>
              </>
            )}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
            출고가 × (1 - DC율) + 옵션 가산 자동 적용
          </span>
        </div>
      )}

      <div className="top">
        <div className="title">
          주문서
          {selectedCount > 0 && <span className="badge">{selectedCount}</span>}
        </div>

        {/* 정정 #17 — legacy 메뉴 toolbar 분리 */}
        <LegacyMenuToolbar />

        <div id="timerContainer">
          {accessLimitText && (
            <div id="accessLimitTimer">
              <span style={{ fontSize: 12, color: 'var(--c-strong)', fontWeight: 'normal' }}>
                주문서 사용기한:
              </span>
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

      {/*
        정정 #18 — 라인 1건 이상 시 cardOrderInfo 자동 표시.
        라인 0건 시 ({selectedCount}=0) 또는 카테고리 진입 전 (mode='no') 에는 숨김.
      */}
      {showOrderInfoCard && (
        <InlineOrderInfoCard
          onProceed={() => navigate('/orders/preview')}
          disabled={selectedCount === 0}
        />
      )}

      {/* 정정 #17 — 9 모달 inventory placeholder mount */}
      <LegacyModalInventory />
    </div>
  )
}
