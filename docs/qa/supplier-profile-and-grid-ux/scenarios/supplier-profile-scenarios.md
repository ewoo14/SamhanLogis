# QA 시나리오 — 사업자 양식 CRUD (TC-SP)

슬라이스: `supplier-profile-and-grid-ux`
작성일: 2026-05-11
QA 담당: QA agent
연관 Playwright spec: `clients/desktop/playwright/supplier-profile/supplier-profile.spec.ts`

---

## 시나리오 개요

| TC ID | 제목 | 우선순위 | 상태 |
|-------|------|---------|------|
| TC-SP-1 | seed 7 필드 표시 | P0 | 자동화 완료 |
| TC-SP-2 | 수정 → businessAddress 갱신 → 저장 | P0 | 자동화 완료 |
| TC-SP-3 | 신규 추가 → list size 2 | P1 | 자동화 완료 |
| TC-SP-4 | 기본 사업자 전환 → primary swap | P1 | 자동화 완료 |
| TC-SP-5 | primary 삭제 시도 → BusinessException toast | P0 | 자동화 완료 |
| TC-SP-6 | ACCOUNTANT 수정 버튼 disabled | P1 | 자동화 완료 |
| TC-SP-7 | 사이드바 "사업자 양식" NavLink visible | P1 | 자동화 완료 |

---

## TC-SP-1: seed 7 필드 표시

**목적**: 초기 진입 시 seed 사업자 데이터가 화면에 올바르게 표시되는지 검증한다.

**사전 조건**:
- seed 데이터: businessNumber=2148720659, companyName=（주）삼한공조시스템
- mockRole=MASTER 로 진입
- VITE_MOCK_MODE=1 dev server 기동 상태

**실행 절차**:
1. `/accounting/supplier-profiles?mockRole=MASTER` 접근
2. 페이지 로드 완료 대기 (networkidle)
3. 화면 내 사업자 정보 7 필드 확인

**기대 결과**:
- 사업자등록번호 `2148720659` 표시
- 상호 `（주）삼한공조시스템` (또는 `삼한공조` 포함) 표시
- 필드 레이블 7개 중 5개 이상 노출: 사업자등록번호, 상호, 대표자, 사업장주소, 업태, 종목, 이메일
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-1-supplier-profile-seed-display.png`

---

## TC-SP-2: 수정 → businessAddress 갱신 → 저장

**목적**: 사업자 정보 수정 흐름이 정상 동작하며, 저장 후 화면이 갱신되는지 검증한다.

**사전 조건**:
- TC-SP-1 통과 (seed 데이터 표시 확인)
- mockRole=MASTER (수정 권한 보유)

**실행 절차**:
1. `/accounting/supplier-profiles?mockRole=MASTER` 접근
2. "수정" 버튼 클릭 → 편집 폼 진입
3. `businessAddress` 필드에 `서울특별시 강남구 테헤란로 QA-테스트동 100호` 입력
4. "저장" 버튼 클릭
5. 저장 완료 후 화면 확인

**기대 결과**:
- 저장 성공 toast 또는 갱신된 주소 `서울특별시 강남구 테헤란로 QA-테스트동 100호` 화면 표시
- 편집 폼 닫힘 (목록 또는 상세 화면으로 복귀)
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-2-supplier-profile-edit-save.png`

---

## TC-SP-3: 신규 추가 → list size 2

**목적**: 두 번째 사업자를 추가하면 목록에 2개의 사업자가 표시되는지 검증한다.

**사전 조건**:
- mockRole=MASTER
- 초기 상태: primary 사업자 1개 존재

**실행 절차**:
1. `/accounting/supplier-profiles?mockRole=MASTER` 접근
2. "신규 추가" 버튼 클릭 → 추가 폼 표시
3. businessNumber=`1234567890`, companyName=`QA테스트사업자` 입력
4. "저장" 버튼 클릭
5. 목록 사업자 수 확인

**기대 결과**:
- 목록에 2개 사업자 표시 (`QA테스트사업자` 포함)
- 기존 primary 사업자 유지
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-3-supplier-profile-add-second.png`

---

## TC-SP-4: 기본 사업자 전환 → primary swap

**목적**: 비primary 사업자를 기본 사업자로 전환하면 primary 마크가 swap 되는지 검증한다.

**사전 조건**:
- mockRole=MASTER
- TC-SP-3 이후 상태: 사업자 2개 존재 (1개 primary, 1개 비primary)

**실행 절차**:
1. 두 번째 사업자(비primary)의 "기본 사업자 전환" 버튼 클릭
2. 전환 확인 (확인 다이얼로그 있을 경우 확인 클릭)
3. primary 마크 변경 확인

**기대 결과**:
- 두 번째 사업자에 primary 마크 적용
- 기존 primary 사업자의 마크 해제
- 전체 primary 사업자 수 = 1 유지
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-4-supplier-profile-primary-swap.png`

---

## TC-SP-5: primary 사업자 "삭제" 시도 → BusinessException toast

**목적**: primary(기본) 사업자는 삭제 불가 제약이 있으며, 시도 시 적절한 오류 메시지가 표시되는지 검증한다.

**사전 조건**:
- mockRole=MASTER
- primary 사업자 1개 존재

**실행 절차**:
1. primary 사업자의 "삭제" 버튼 클릭
2. 확인 다이얼로그 있을 경우 "삭제" 클릭
3. 오류 메시지 확인

**기대 결과**:
- `기본 사업자는 삭제할 수 없습니다` 또는 유사 메시지 toast/alert 노출
- 레코드 삭제 X (primary 사업자 목록에 여전히 존재)
- pageerror 없음

**도메인 검증 연계**: DI-1 (primary 단일성), DI-4 (soft delete 일관성)

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-5-supplier-profile-delete-primary-exception.png`

---

## TC-SP-6: ACCOUNTANT → 수정 버튼 disabled (PR #160 패턴)

**목적**: ACCOUNTANT 권한은 사업자 양식 수정 권한이 없으며, PR #160 disabled UX 패턴이 적용되는지 검증한다.

**사전 조건**:
- mockRole=ACCOUNTANT
- PR #160 disabled UX 구현 완료 (사이드바 회색 disabled 패턴)

**실행 절차**:
1. `/accounting/supplier-profiles?mockRole=ACCOUNTANT` 접근
2. "수정" 버튼의 disabled 상태 확인
3. 강제 클릭 시도 → 편집 폼 미진입 확인

**기대 결과**:
- "수정" 버튼이 `aria-disabled="true"` 또는 disabled 클래스 적용 (회색, cursor:not-allowed)
- 클릭해도 편집 폼 미진입
- 또는 버튼 자체 숨김 처리
- pageerror 없음

**PR 연관**: PR #160 (sidebar disabled UX 패턴 의무 적용)

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-6-accountant-edit-disabled.png`

---

## TC-SP-7: 사이드바 "사업자 양식" NavLink visible

**목적**: 사이드바 회계 카테고리에 "사업자 양식" NavLink 가 올바르게 표시되는지 검증한다.

**사전 조건**:
- mockRole=MASTER
- 사이드바 회계 카테고리 구현 완료

**실행 절차**:
1. `/?mockRole=MASTER` 접근 (루트 페이지 — 사이드바 표시)
2. 사이드바 회계 카테고리 확인
3. "사업자 양식" NavLink 존재 확인
4. 필요 시 회계 카테고리 펼침 클릭

**기대 결과**:
- 사이드바에 "사업자 양식" 텍스트 또는 `/accounting/supplier-profiles` 링크 노출
- 클릭 시 `/accounting/supplier-profiles` 페이지 이동 (선택적 검증)
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-SP-7-sidebar-supplier-profile-navlink.png`

---

## 회귀 영향 분석

| 기존 기능 | 회귀 위험도 | 검증 방법 |
|----------|------------|----------|
| TaxInvoiceBatch 공급자 정보 | 높음 | SP-FE-3 IT + DI-3 SQL |
| 사이드바 disabled UX (PR #160) | 중간 | TC-SP-6 + sidebar-disabled.spec.ts |
| 전표 CRUD 권한 | 낮음 | JournalControllerIT 기존 커버 |
