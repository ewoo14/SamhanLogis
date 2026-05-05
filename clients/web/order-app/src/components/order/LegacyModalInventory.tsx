/**
 * 정정 #17 — legacy partner-order index.html 의 9 모달 inventory.
 *
 * <p>legacy index.html 의 `<dialog>` 정의 + `divSnapshotPage` 전체화면 + 추가 placeholder:
 *
 * <ol>
 *   <li><b>dlgSpec</b> (line 951) — 품목 스펙 표 (모델 click → 사양 표 popup). <em>핵심 React 구현 — 품목 detail 화면 link.</em></li>
 *   <li><b>dlgPreview</b> (line 962) — 주문 미리보기. <em>핵심 React: `OrderPreviewPage` 라우트.</em></li>
 *   <li><b>dlgOrderDetail</b> (line 999) — 발송 완료된 주문 상세. <em>핵심 React: `OrderDetailPage` 라우트.</em></li>
 *   <li><b>dlgFinal</b> (line 1092) — 최종 발송 확인. <em>핵심 React: `OrderInfoPage` 라우트 (배송 정보 입력 후 발송).</em></li>
 *   <li><b>dlgProgress</b> (line 1126) — 발송 진행중 progress 표시. <em>placeholder.</em></li>
 *   <li><b>divSnapshotPage</b> (line 1138) — 주문저장 목록 전체화면. <em>핵심 React: `OrderSnapshotPage` 라우트.</em></li>
 *   <li><b>dlgInventory</b> — 거래처 재고 조회 popup (legacy 후속 추가). <em>placeholder.</em></li>
 *   <li><b>dlgHistory</b> — 단일 모델의 과거 발송 이력. <em>placeholder.</em></li>
 *   <li><b>dlgSnapshot</b> — 임시 저장본 미리보기. <em>placeholder.</em></li>
 * </ol>
 *
 * <p>본 컴포넌트는 placeholder 5개를 비활성 `<dialog>` 로 mount —
 * 실제 트리거는 후속 PR (Phase 6 후속 슬라이스). 현재는 attribute id 만 존재해
 * legacy 와의 selector 호환성 유지 + 향후 React showModal 호출 가능.
 *
 * <p>핵심 4 (`dlgPreview` / `dlgOrderDetail` / `dlgFinal` / `divSnapshotPage`) 는
 * 이미 React route 로 구현됨 — 본 inventory 는 dialog 자체가 아니라 placeholder 만 mount.
 */
import { useEffect, useRef } from 'react'

/**
 * 9 모달 placeholder mount.
 *
 * <p>접근성 측면에서 빈 dialog 가 a11y tree 에 노출되지 않도록 `aria-hidden` + `display:none`.
 * id 만 보존 → 향후 `document.getElementById('dlgInventory')?.showModal()` 호출 시 mount 보장.
 */
export function LegacyModalInventory() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // legacy QA tooling 호환 — window 에 inventory 노출 (개발 디버깅 용)
    const w = window as unknown as { __SAMHAN_LEGACY_MODALS__?: string[] }
    w.__SAMHAN_LEGACY_MODALS__ = [
      'dlgSpec',
      'dlgPreview',
      'dlgOrderDetail',
      'dlgFinal',
      'dlgProgress',
      'divSnapshotPage',
      'dlgInventory',
      'dlgHistory',
      'dlgSnapshot',
    ]
    return () => {
      delete w.__SAMHAN_LEGACY_MODALS__
    }
  }, [])

  return (
    <div
      ref={ref}
      id="legacyModalInventoryRoot"
      data-testid="legacy-modal-inventory"
      aria-hidden="true"
      style={{ display: 'none' }}
    >
      {/* 5개 placeholder dialog — id 만 보존 (향후 후속 PR 에서 React 구현) */}
      <dialog id="dlgProgress" aria-label="발송 진행 (legacy placeholder)">
        <p>발송 진행 중... (placeholder — 후속 PR 에서 활성)</p>
      </dialog>
      <dialog id="dlgInventory" aria-label="거래처 재고 조회 (legacy placeholder)">
        <p>거래처 재고 조회 (placeholder — M5 inventory-service 통합 후 활성)</p>
      </dialog>
      <dialog id="dlgHistory" aria-label="모델 발송 이력 (legacy placeholder)">
        <p>모델 발송 이력 (placeholder — M4 partner-order-service 통합 후 활성)</p>
      </dialog>
      <dialog id="dlgSnapshot" aria-label="저장본 미리보기 (legacy placeholder)">
        <p>저장본 미리보기 (placeholder — 후속 PR 에서 활성)</p>
      </dialog>
      <dialog id="dlgSpecPlaceholder" aria-label="품목 스펙 (legacy placeholder)">
        <p>품목 스펙 (placeholder — M1a productSpecRow 통합 후 활성)</p>
      </dialog>
    </div>
  )
}
