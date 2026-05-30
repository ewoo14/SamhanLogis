# FE 리뷰 — Phase 2.6a 부분전환 (cycle 2)

검토 범위: `git diff 20ebc7da..30b2c6d7` FE 파일 3개
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`
- `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
- `clients/desktop/src/renderer/components/sales/sales.module.css`

---

## 항목별 검토 결과

### 1. 전환버튼 화이트리스트 — CONVERTIBLE_STATUS + linkedSlipNo + canConvert

**PASS**

- `CONVERTIBLE_STATUS = new Set(['DRAFT', 'ON_HOLD'])` (line 49) — BE `requireConvertible()` (DRAFT || ON_HOLD 허용, 나머지 409) 와 정확히 일치.
- 버튼 노출 조건: `canConvert && query.data.linkedSlipNo == null && CONVERTIBLE_STATUS.has(query.data.status)` (lines 414-417).
- BE `PartnerOrderDetailResponse.linkedSlipNo` 는 `String linkedSlipNo` (nullable) — FE `linkedSlipNo: string | null` 정합.
- `canConvert` = `auth?.role` 가 `['SALES', 'MANAGER', 'MASTER']` 에 포함되면 true.
- 코드 주석(lines 43-48)에 BE `requireConvertible` 의 slipNo!=null 검사 결함 주석까지 명기되어 있어 FE 화이트리스트 방어 의도 명확.

### 2. fullyConverted 토스트 분기 / convertedQuantity null 가드 / 빈 items disabled

**PASS (경미한 관찰 1건 — 비차단)**

- `result.fullyConverted` 분기 (lines 194-196): 전량 전환 vs 잔여 메시지 정확히 분기됨.
- `convertedQuantity ?? 0` null 가드:
  - 모달 초기화 (line 428), 조회 라인 렌더 (line 562), 모달 라인 렌더 (lines 931, 947), 경고 배너 필터 (line 907) — 모두 `?? 0` 적용.
  - **예외**: line 874 (`line.quantity - line.convertedQuantity`) — `?? 0` 미적용.
    BE `PartnerOrderLine.convertedQuantity` 는 Java `int` primitive (기본값 0, null 불가) 이므로 런타임 결함 없음. TypeScript 타입도 `convertedQuantity: number` (non-nullable) 이므로 typecheck 0.
    단, 코드 일관성 측면에서 다른 4곳과 달리 방어적 패턴 미적용 — 향후 타입 변경 시 누락 가능성. P3(비차단) 관찰로 기록.
- 빈 items disabled: `Object.values(convertQtyMap).every((q) => q <= 0)` (line 868) — 전환수량 전부 0이면 버튼 비활성. 정확.

### 3. CONVERTED 별색 statusConverted — DS 토큰 실재, CONFIRMED 구분

**PASS**

- `statusConverted` CSS (lines 475-479): `background: #ede9fe; color: #5b21b6` — violet 계열 하드코딩 (DS에 `--state-violet` 토큰 부재, fallback 포함).
- `statusConfirmed` (lines 466-469): `var(--state-success-bg, #d1fae5) / var(--state-success, #065f46)` — 초록 계열.
- 두 상태 시각적으로 구분됨 (보라 vs 초록). DS 토큰 간접 참조 패턴은 기존 `statusAccessDenied` (line 873, `#ede9fe / #5b21b6`) 와 동일 방식으로 일관성 있음.
- `STATUS_CLASS` 매핑 (ListPage line 22-29): CONVERTED 키 포함되어 있음.

### 4. 모달 비가역 경고 + 발행요약(수량>0 카운트) role

**PASS**

- 비가역 경고 배너: `role="note"` (line 903). 경고 정보를 사용자가 무시할 수 없게 하는 의미로 적절.
  (`role="alert"` 는 즉각적 에러/오류용 — 여기서는 정보성 주의 안내이므로 `note` 가 더 적합.)
- 발행 예정 카운트: `selectedItems.length > 0` 일 때 `(${selectedItems.length}개 품목 전환 예정)` 동적 표시 (lines 909-914). 수량>0 선택 항목만 카운트, 정확.

### 5. 조회 라인 전환됨/잔여 컬럼 — convertedQuantity>0 배지

**PASS**

- `<th>전환됨</th>` / `<th>잔여</th>` 컬럼 추가 (lines 554-555).
- `converted > 0` 일 때 `<span className={styles['convertedQtyBadge']}>{converted}</span>` (lines 572-575) — violet 배지 (#ede9fe/#5b21b6). 0이면 '-'.
- 잔여 컬럼: `converted > 0` 일 때만 숫자 표시, 전환 미발생 라인은 '-' (lines 578-580) — 의도된 설계.

### 6. 인라인 style → CSS 모듈 전환 (numericTh / convertLineDisabled 등)

**PASS**

CSS 모듈 신규 클래스 추가 (lines 1035-1081):
- `.numericTh` — 숫자 th 우측 정렬 (`text-align: right !important`)
- `.convertQtyTh` — 최소 너비 100px
- `.convertLineDisabled` — opacity 0.45 + neutral-bg tint
- `.convertedLabel` — "전환완료" 보조 텍스트
- `.convertedQtyBadge` — violet 배지
- `.convertWarningBanner` — warning 계열 배너

TSX에서 `styles['numericTh']`, `styles['convertLineDisabled']` 등 CSS 모듈 참조 정확. 인라인 style 미사용. 완전 전환 확인.

### 7. pagecodes.json 에 sales.partner-order.convert 등록 + usePermission 동적 연동 (P1-3)

**결함 잔존 — P1 (비차단)**

- `pagecodes.json` (`clients/desktop/playwright/full-qa/pagecodes.json`) 에 `sales.partner-order.convert` 미등록. 현재 partner-order 관련 코드: `list / draft / edit / confirm / history / history.view / print / edit-requests / edit-requests.decide / tutorial` — `convert` 없음.
- `SalesPartnerOrderDetailPage.tsx` 에서 `usePermissions` hook 미사용. `canConvert` 는 `auth?.role` 기반 정적 ROLE 배열 (`CONVERT_ROLES`) 로만 판단 (line 83).
- cycle1 리뷰에서 P1-3 으로 기록된 결함이 이번 fix commit에서 해소되지 않음.

**영향 분석**: 정적 ROLE 체크(`SALES/MANAGER/MASTER`)가 동적 RBAC 매트릭스와 실질적으로 동일하게 작동하므로 프로덕션 런타임 오동작은 없음. 단, RBAC 관리화면에서 `sales.partner-order.convert` 권한을 조정해도 FE 반영이 되지 않는 아키텍처 불일치가 있음. pagecodes.json 미등록은 Playwright 정적 계약 테스트 미커버 의미.

### 8. testid Playwright 정합 + typecheck 0

**부분 PASS (관찰 1건)**

- `npx tsc --noEmit` 결과: `EXIT: 0` (typecheck 통과).
- convert 관련 testid 8종 정의됨: `partner-order-convert-open`, `partner-order-convert-error`, `partner-order-convert-toast`, `partner-order-convert-modal`, `partner-order-convert-submit`, `partner-order-convert-modal-body`, `partner-order-convert-modal-error`, `partner-order-convert-qty-{index}`.
- **관찰**: Phase 2.6a 전용 Playwright spec 파일이 없음. `sp-08-4-3-order-delete-and-estimate-convert.spec.ts` 는 estimate→주문 전환 (from-estimate) 만 다루며, `partner-order-convert-open` 등 신규 testid를 검증하지 않음. cycle1 FE 리뷰에서 "Playwright spec 추가 필요" 로 기록된 항목이 미해소.

---

## 결함 요약

| 번호 | 심각도 | 내용 | 비차단 여부 |
|---|---|---|---|
| D-FE-C2-01 | P1 | `pagecodes.json` 에 `sales.partner-order.convert` 미등록 + `usePermissions` 동적 연동 대신 정적 `CONVERT_ROLES` 사용 — cycle1 P1-3 잔존 | 비차단 (정적 role 동일 효과) |
| D-FE-C2-02 | P1 | Phase 2.6a 전용 Playwright spec 없음 — `partner-order-convert-open/submit/qty-{n}` testid 미검증 | 비차단 |
| D-FE-C2-03 | P3 | line 874 `line.convertedQuantity` null 가드 `?? 0` 미적용 (다른 4곳 일관성 불일치) — 타입 안전 런타임 결함 없음 | 비차단 |

---

## 종합 판정

**FE APPROVE (cycle2)**

P0 결함 없음. P1 2건은 이전 cycle1에서 이미 기록된 항목으로, 정적 ROLE 체크가 동적 RBAC와 동일 매트릭스를 사용하고 있어 프로덕션 동작에 차이 없음. typecheck 0 확인. 핵심 기능(전환버튼 화이트리스트 / fullyConverted 토스트 분기 / CONVERTED 별색 / 모달 경고 / 조회 라인 배지 / CSS 모듈화)은 모두 정확히 구현됨.

D-FE-C2-01, D-FE-C2-02 는 다음 슬라이스(Phase 2.7 또는 권한 재편 Phase 3) 에서 통합 처리 권장.

검토자: claude-fe  
검토일: 2026-05-30  
사이클: N=2
