# 모바일 슬12 — 원시 table 리스트 카드화 Implementation Plan

> **For agentic workers:** 본 계획은 프로젝트 canonical 워크플로우로 실행한다 — **Codex 구현**(danger-full-access·파일만 수정·git은 PM 대행, Opus 임의구현 금지) → Opus↔Codex 듀얼리뷰 0수렴 → 매 라운드 라이브 Docker QA(390px) → CI green(mock gate) → PM 자율머지. 단계는 체크박스로 추적.

**Goal:** 공용 DataTable 미사용 원시 `<table>` genuine 리스트 8종을 모바일 카드화하여 ≤768px 클립 해소.

**Architecture:** 표준 리스트성 화면은 design-system `DataTable`로 전환(슬3 자동 카드화 + mobilePriority 무료 획득). 비교/대조성(컬럼이 매트릭스적)은 `useIsMobile` + 카드 렌더 폴백(데스크탑 raw table 보존). 데스크탑(>768px) 렌더 동일 보존.

**Tech Stack:** React + TS, `@samhan/design-system` DataTable(`mobilePriority?: 'primary'|'secondary'|'hidden'`), `hooks/useIsMobile.ts`, global.css `.mobile-*`.

## Global Constraints (전 태스크 공통)

- **FE-only · Flyway 0 · BE 무변경.**
- **데스크탑 무회귀**: 변경은 `@media(max-width:768px)` 또는 `useIsMobile` 분기 한정. 데스크탑 컬럼/레이아웃 불변.
- **mobilePriority 의미**(슬5~11 박제): primary=DOM 첫 컬럼(a11y 시각=DOM, WCAG 1.3.2 — 데스크탑 컬럼 순서 변경 금지). 액션/버튼/체크박스/UUID성 컬럼=hidden(행탭 onRowClick 대체). 단 '선택이 핵심기능'인 컬럼(묶음발행 select·매칭 autocomplete)은 secondary 유지(hidden 시 기능 회귀).
- **UI 한국어**, UUID 사용자 비공개(비즈니스 식별자만).
- **검증 게이트**: 각 화면 라이브 390px 재캡처(카드 정상+가로오버플로 0) + 데스크탑 무회귀 + mock gate hard + CI green. 무시드 화면은 코드+패턴 검증 정직 보고.
- 참조 패턴: 기존 DataTable+mobilePriority 사용처(예: 거래처/전표 리스트, 슬5~11 적용분)를 grep해 동일 관용구 사용.

---

## 슬12a — 표준 리스트 4종 → DataTable 전환 (PR 1)

### Task 1: 주문서 관리 (SalesPartnerOrderListPage)

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`

**Approach:**
- 현재 raw `<table class=_listTable_*>`(라이브 390px서 515px 클립 확인). 컬럼: 선택·주문번호·거래처코드·거래처명·발송일·상태 등.
- 공용 `DataTable`로 전환. 컬럼 정의에 `mobilePriority` 부여: 주문번호=primary, 거래처명=primary 또는 secondary, 거래처코드=secondary, 발송일/상태=secondary, 선택 체크박스=secondary(주문 선택이 핵심기능이면 유지)·행 액션=hidden.
- onRowClick → 기존 상세 진입(SalesPartnerOrderDetailPage) 유지. 데스크탑 컬럼 순서/너비 보존.

**Steps:**
- [ ] 현재 table 구조·컬럼·행클릭·선택 로직 파악(Codex read)
- [ ] DataTable 컬럼 정의로 전환 + mobilePriority 지정 + onRowClick 보존
- [ ] desktop typecheck(`npm run typecheck`) 통과
- [ ] 라이브 390px: 카드 렌더·가로오버플로 0·행탭 상세 진입 확인 캡처
- [ ] commit(PM 대행)

### Task 2: 주문서 승인 (SalesOrderApprovalsPage)

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx`

**Approach:** Task 1과 동형. 승인 대기 주문 리스트 raw table → DataTable. 승인/반려 액션 버튼 컬럼=hidden(행탭/상세서 처리) 또는 카드 내 액션 영역 유지(승인이 핵심기능이면 secondary 액션 보존). mobilePriority: 주문번호/거래처=primary, 금액/일자=secondary.

**Steps:** Task 1과 동일 5단계(파악→전환→typecheck→라이브캡처→commit).

### Task 3: 알림 내역 (NotificationHistoryPage)

**Files:**
- Modify: `clients/desktop/src/renderer/routes/NotificationHistoryPage.tsx`

**Approach:** 알림 로그 raw table → DataTable. mobilePriority: 알림제목/메시지=primary, 일시=secondary, 유형/상태=secondary, 읽음여부 등=secondary. 행 액션 hidden. 페이징 보존.

**Steps:** Task 1과 동일 5단계.

### Task 4: 수동 배차 (ManualDispatchAdminPage)

**Files:**
- Modify: `clients/desktop/src/renderer/routes/ManualDispatchAdminPage.tsx`

**Approach:** 수동 배차 목록 raw table → DataTable. 단 매칭/배정 액션이 핵심이면 해당 컬럼 secondary 유지(hidden 금지 — 기능 회귀). mobilePriority: 전표/주문번호=primary, 거래처/주소=secondary, 기사/배차상태=secondary.

**Steps:** Task 1과 동일 5단계. ⚠️ 배차 액션(배정/매칭) 카드서 도달 가능 확인(기능 회귀 금지).

### Task 5: 슬12a 통합 검증

- [ ] 4화면 라이브 390px 카드 캡처(가로오버플로 0) + 데스크탑 무회귀 캡처
- [ ] `npm run typecheck` + 변경모듈 vitest 통과([[feedback_changed_module_full_test_before_push]])
- [ ] mock gate(playwright) 회귀 0 — 기존 spec(있으면) 갱신
- [ ] 듀얼리뷰 0수렴 → CI green → PM 자율머지

---

## 슬12b — 비교/커스텀 4종 → isMobile 카드 폴백 (PR 2)

비교/대조 매트릭스성이라 DataTable 단순전환이 부적합할 수 있음 → `useIsMobile`로 모바일 카드 렌더 분기(데스크탑 raw table 보존). Codex가 화면별로 DataTable 전환 가능 여부 판단, 불가 시 카드 폴백.

### Task 6: DPS 입고 비교 (InventoryDpsComparePage)
- Modify: `clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx`
- 시스템 vs 실사 비교 테이블. 모바일: 품목별 카드(시스템수량/실사수량/차이 라벨-값). useIsMobile 분기. ⚠️ 라이브 rows=1(시드 적음) → 코드+가용 데이터 캡처, 한계 보고.

### Task 7: 카카오톡 자동 매칭 (KakaoAutoDispatchPage)
- Modify: `clients/desktop/src/renderer/routes/KakaoAutoDispatchPage.tsx`
- 매칭 후보 테이블. 모바일: 매칭 카드(주문↔기사 후보). 매칭 액션 카드 내 유지.

### Task 8: 가배차 분류 (ArologisPreClassifyPage)
- Modify: `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx`
- 분류 대상 리스트. 모바일: DataTable 전환 우선 시도, 분류 액션 보존.

### Task 9: 운송사 실배차 비교 (ArologisDispatchReconcilePage)
- Modify: `clients/desktop/src/renderer/routes/ArologisDispatchReconcilePage.tsx`
- 우리배차 vs 운송사 실배차 대조. 모바일: 대조 카드(양측 라벨-값+차이 강조). useIsMobile 분기.

### Task 10: 슬12b 통합 검증
- [ ] 4화면 라이브 390px 캡처(가용 데이터) + 데스크탑 무회귀 + 무시드 한계 정직 보고
- [ ] typecheck + vitest + mock gate + 듀얼리뷰 0수렴 → CI green → PM 자율머지

---

## Self-Review

- **Spec coverage**: 슬12 spec의 8화면 전부 Task 1~9 매핑 ✅. 데스크탑 무회귀·mobilePriority 의미·라이브QA 게이트 = Global Constraints 반영 ✅.
- **Placeholder scan**: 각 Task에 파일경로·접근·검증 명시. 컬럼 세부는 Codex가 실파일 read 후 확정(원시 table 컬럼은 파일 의존이라 의도적 위임) ✅.
- **일관성**: DataTable/mobilePriority 관용구 = 슬5~11 동일. 비교성은 useIsMobile 폴백으로 분리 ✅.
- 후속(별도 plan): 슬13(폼 FormGrid)·슬14(overflow 보강)·슬15(mobilePriority 잔여).
