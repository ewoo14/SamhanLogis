# UX Flow — Slice A 시나리오 4

본 문서는 회계 서비스 MVP 의 핵심 시나리오 4건을 기술합니다.
QA 팀은 본 시나리오를 IT/E2E 테스트 케이스 작성 시 인용합니다.

---

## 시나리오 1 — ACCOUNTANT 신규 분개 입력 → DRAFT 저장 → 검토 → POST

**역할**: ACCOUNTANT (예: 회계 담당자 박지혜)
**목적**: 5월 사무실 임차료 500,000 원 지급 분개

### 단계

| # | 단계 | 화면 | 상호작용 / 검증 |
|---|---|---|---|
| 1 | 로그인 | Login | ACCOUNTANT 권한 사용자 |
| 2 | 사이드바 "회계 / 분개장" 클릭 | JournalListPage | URL `/accounting/journals` |
| 3 | 우상단 `[+ 신규 분개]` 클릭 | JournalFormPage | URL `/accounting/journals/new`, 빈 폼 |
| 4 | 일자 선택 (오늘 default) | (헤더) | `2026-05-04` |
| 5 | 출처 "수동" (default) | (헤더) | sourceType=MANUAL |
| 6 | 적요 입력 | (헤더) | "5월 임차료 지급" |
| 7 | 라인 1 — 계정 `<AccountCodeSelect>` 클릭 → "임차" 검색 → `805 임차료` 선택 | (라인 #1 계정) | popover 열림 → 검색 → 키보드 Enter |
| 8 | 라인 1 — 차변 `<MoneyInput>` `500000` 입력 | (라인 #1 차변) | `500,000` 표시, 대변 disabled 처리 |
| 9 | 라인 1 — 거래처 "강남빌딩" 입력 | (라인 #1 거래처) | partner free-text |
| 10 | 라인 1 — 메모 "5월분" 입력 | (라인 #1 메모) | optional |
| 11 | 마지막 행에 값 입력 → 라인 2 row 자동 생성 | (라인 #2) | empty row |
| 12 | 라인 2 — `102 보통예금` 선택, 대변 `500000`, 거래처 "국민은행" | (라인 #2) | 차변 disabled |
| 13 | 합계 행 검증 | (footer 합계) | 차변 500,000 = 대변 500,000 → ✓ 일치 (녹색) |
| 14 | `[저장 (DRAFT)]` 클릭 | 모달 confirm | "DRAFT 저장하시겠습니까? 확정 전까지 수정/삭제 가능합니다." |
| 15 | confirm 후 → JournalDetailPage 자동 이동 | JournalDetailPage | URL `/accounting/journals/{id}` (id 는 UUID 이지만 화면엔 journalNo `20260504-3` 표시), status badge "DRAFT" |
| 16 | 검토 후 `[확정 (POST)]` 클릭 | 모달 confirm | "확정 후엔 수정 불가합니다. 역분개로만 정정 가능합니다." |
| 17 | confirm | (성공 toast) | "분개 20260504-3 확정 완료" + status badge "POSTED" 로 변경 |

### 검증 포인트

- DRAFT 저장 시 합계 불일치도 OK (확정 전 임시 저장 가능)
- POST 시점 ⇒ 합계 일치 + 라인 ≥ 2 + 모든 라인 계정/금액 충족 검증
- POST 후 form 으로 돌아가도 모든 input disabled (read-only)
- AccountBalance 업데이트는 POST 시점 (BE 책임 — Layer 4 라이프사이클 표 §2)

### Edge cases

| 상황 | 동작 |
|---|---|
| 라인 1건만 (대차 미성립) | `[확정]` disabled, tooltip "라인 2개 이상 필요" |
| 차변/대변 양쪽 0 라인 | 해당 라인 빨강 outline + `[확정]` disabled |
| 합계 1원 차이 | `[확정]` disabled, 합계 행 빨강 ✕ + tooltip "차/대 합계가 1원 불일치" |
| 계정 미선택 라인 | 해당 셀 빨강 + `[확정]` disabled |
| 네트워크 실패 (POST) | 토스트 에러 + status badge 변경 X (낙관적 업데이트 X — 회계는 정확성 우선) |

---

## 시나리오 2 — ACCOUNTANT POSTED 분개 검토 → 잘못된 분개 → 역분개 (REVERSE)

**역할**: ACCOUNTANT
**목적**: 잘못 입력된 POSTED 분개 (`20260503-1`, 120,000 원) 정정

### 단계

| # | 단계 | 화면 | 상호작용 / 검증 |
|---|---|---|---|
| 1 | JournalListPage 에서 `20260503-1` 행 클릭 | JournalDetailPage | status "POSTED" |
| 2 | 헤더 안내 확인 | "확정된 분개입니다. 수정할 수 없습니다. 수정이 필요하면 역분개를 이용해주세요." | 회색 info banner |
| 3 | `[역분개 (REVERSE)]` 클릭 | 모달 confirm | "역분개를 생성하시겠습니까? 동일 일자에 차/대를 swap 한 분개가 자동 생성되며, 원분개는 REVERSED 처리됩니다." |
| 4 | confirm | (성공 toast) | "역분개 20260503-3 생성 완료" + 원분개 status "REVERSED" 로 변경 (line-through) |
| 5 | JournalListPage 로 돌아오기 | JournalListPage | 원분개 `20260503-1` REVERSED, 신규 `20260503-3` POSTED 표시 |
| 6 | (선택) `20260503-3` 진입 | JournalDetailPage | 차변/대변 swap 확인, 적요 "REVERSE: 20260503-1" 자동 prefix |

### 검증 포인트

- BE Layer 4 `Journal.reverse()` 라이프사이클 (DRAFT 진입 X, POSTED → REVERSED 만)
- 역분개의 원분개 (`reverseOfJournalId`) 메타 자동 기입 — JournalDetailPage 에서 "이 분개의 원분개: 20260503-1" 링크 표시
- AccountBalance 자동 재계산 (역분개 적용 시점)

### Edge cases

| 상황 | 동작 |
|---|---|
| 이미 REVERSED 분개의 `[역분개]` 버튼 | 미노출 |
| DRAFT 분개의 `[역분개]` 버튼 | 미노출 (DRAFT 는 직접 삭제/수정으로 대응) |
| 역분개 중 동시성 충돌 (@Version) | 토스트 에러 "다른 사용자가 이미 처리했습니다. 새로고침" |

---

## 시나리오 3 — ACCOUNTANT 시산표 조회 (월별) → 계정 잔액 검증

**역할**: ACCOUNTANT
**목적**: 5월 결산 전 시산표 점검

### 단계

| # | 단계 | 화면 | 상호작용 / 검증 |
|---|---|---|---|
| 1 | 사이드바 "회계 / 시산표" 클릭 | TrialBalancePage | URL `/accounting/balances?period=202605` (현재 월 default) |
| 2 | 기간 selector 확인 | "2026-05 ▼" | 과거 12개월 + 미래 1개월 |
| 3 | 7-그룹 트리 표시 확인 | (표) | 100/200/300/400/500/800/900 각 카테고리 dot + 그룹 합계 |
| 4 | "100 자산" 그룹 ▾ 펼침 | (자산 잎 계정 표시) | 101 현금, 102 보통예금, 110 외상매출금 ... |
| 5 | 차변/대변 컬럼 검증 | (각 행) | 차변 검정 / 대변 파랑 (`--accounting-debit/credit-color`) + tabular-nums |
| 6 | 잔액 컬럼 검증 | (각 행) | 자산/비용: 차변 - 대변 양수 / 부채/자본/매출: 음수 |
| 7 | 총합계 행 (footer) | 차변 합계 = 대변 합계 → "✓ 0" | 회계 항등식 검증 |
| 8 | 4월로 변경 | period=202604 | 데이터 재조회 |
| 9 | `[PDF 인쇄]` 클릭 | 인쇄 미리보기 | `print-spec.md` 시산표 양식 |
| 10 | `[엑셀]` 클릭 | CSV download | `시산표_2026-05.csv` |

### 검증 포인트

- TrialBalanceView 는 `accountBalances` 테이블 (또는 view) 의 `period=yyyyMM` 로 조회
- 잔액 = 차변 - 대변 (raw) — 부호는 화면 표시에서만 카테고리에 따라 양/음 처리 (BE 는 raw 만 반환)
- 합계 행 차변 = 대변 검증은 FE 에서 한 번 더 (BE 무결성 + FE UX 안전망)

### Edge cases

| 상황 | 동작 |
|---|---|
| 해당 월 분개 0건 | 빈 표 + 안내 "해당 기간 분개가 없습니다" |
| 차변 합계 ≠ 대변 합계 | 합계 행 빨강 + ✕ N 차이 표시 + 알람 (회계 시스템 무결성 위반 — 운영 알림) |
| period 미래 (3개월 이후) | 검색 결과 0 + "미래 기간은 조회할 수 없습니다" |

---

## 시나리오 4 — SALES role 분개 화면 접근 → 403 (권한 가드)

**역할**: SALES (예: 영업 담당자)
**목적**: 권한 가드 검증

### 단계

| # | 단계 | 화면 | 상호작용 / 검증 |
|---|---|---|---|
| 1 | SALES 권한 사용자 로그인 | Login | role = SALES |
| 2 | 사이드바 확인 | (사이드바) | "회계" 그룹 자체 미노출 (SidebarGroup 권한 필터링) |
| 3 | URL 직접 입력 `/accounting/journals` | (URL bar) | 직접 접근 시도 |
| 4 | RouteGuard 동작 | 403 페이지 | "회계 화면은 ACCOUNTANT/MASTER 권한 사용자만 접근 가능합니다." |
| 5 | API 직접 호출 (curl) `/api/accounting/journals` | 401/403 | Gateway + auth-service 권한 가드 검증 |

### 검증 포인트

- 사이드바 그룹 미노출 (FE 1차 방어)
- RouteGuard 403 페이지 (FE 2차 방어)
- API Gateway / accounting-service `@PreAuthorize` (BE 최종 방어)
- MANAGER role 도 접근 X (Q9 — ACCOUNTANT/MASTER 만)

### 권한 매트릭스 (참조)

| Role | 사이드바 "회계" | 회계 페이지 접근 | 분개 작성 | 분개 POST | 시산표 조회 |
|---|---|---|---|---|---|
| MASTER | ✓ | ✓ | ✓ | ✓ | ✓ |
| ACCOUNTANT | ✓ | ✓ | ✓ | ✓ | ✓ |
| MANAGER | ✕ | ✕ (403) | ✕ | ✕ | ✕ |
| SALES | ✕ | ✕ (403) | ✕ | ✕ | ✕ |
| WAREHOUSE | ✕ | ✕ (403) | ✕ | ✕ | ✕ |
| DRIVER | ✕ | ✕ (403) | ✕ | ✕ | ✕ |

---

## 공통 — UX 가이드라인

### 토스트 메시지 한국어 일관성

| 액션 | 성공 | 실패 |
|---|---|---|
| DRAFT 저장 | "분개 {journalNo} 임시저장 완료" | "저장 실패: {reason}" |
| POST | "분개 {journalNo} 확정 완료" | "확정 실패: {reason}" |
| REVERSE | "역분개 {newJournalNo} 생성 완료" | "역분개 실패: {reason}" |

### 로딩 상태

- 초기 로딩 — `<Spinner>` (기존)
- 액션 진행 — 버튼 내부 `<Spinner size="sm">` + 버튼 disabled
- 데이터 페이지네이션 — TanStack Query `isFetching` 표시

### 빈 상태

- JournalListPage 데이터 0건: "분개가 없습니다. [+ 신규 분개] 로 시작하세요."
- TrialBalancePage 데이터 0건: "해당 기간 분개가 없습니다. 기간을 변경해보세요."
- AccountTreePage 검색 결과 0건: "검색 결과가 없습니다."
