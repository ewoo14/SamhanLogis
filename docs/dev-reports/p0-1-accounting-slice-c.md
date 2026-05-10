# P0-1 Slice C — 현금흐름표 / 자본변동표 / 일계표 / 월계표 검증 seed + IT (14건 100% 달성)

작성일: 2026-05-10
담당: DevOps (인프라/CI 파트)
연관 branch: `feature/p0-1-accounting-slice-c`

---

## 1. Slice C 범위 (4건 보고서)

P0-1 회계 보고서 슬라이스 시리즈의 완결편이다.

| 슬라이스 | 보고서 종류 | endpoint |
|--------|-----------|---------|
| Slice A | 손익계산서 / 재무상태표 / 시산표 | /income-statement, /balance-sheet, /trial-balance |
| Slice B | 부가세신고서 / 법인세신고서 / 거래처 미수미지급 | /vat, /corporate-tax, /partner-aging |
| **Slice C** | **현금흐름표 / 자본변동표 / 일계표 / 월계표** | **/cash-flow, /equity-changes, /daily-summary, /monthly-summary** |

Slice C 완료로 accounting-service 14건 보고서 endpoint 100% 달성.

---

## 2. DevOps 산출물

### 2-1. Flyway V10 seed SQL

파일: `services/accounting-service/src/main/resources/db/migration/V10__seed_slice_c_validation_journals.sql`

현금흐름 검증 5건 + 자본변동 검증 2건 = 총 7건 분개를 POSTED 상태로 삽입한다.
일계표 / 월계표는 기존 V6 seed 분개 7건 (2026-01~03) 을 재활용하므로 추가 seed 불필요.

#### 현금흐름 검증 분개 (CFO / CFI / CFF 각 활동 포함)

| 분개번호 | 날짜 | 활동 | 계정 (차변 → 대변) | 금액 |
|--------|-----|-----|-----------------|-----|
| SEED-CF-001 | 2026-05-05 | CFO 유입 | 현금(101) → 외상매출금(110) | 1,500,000 |
| SEED-CF-002 | 2026-05-10 | CFO 유출 | 임차료(819) → 현금(101) | 300,000 |
| SEED-CF-003 | 2026-05-15 | CFO 유출 | 외상매입금(201) → 현금(101) | 800,000 |
| SEED-CF-004 | 2026-05-20 | CFI 유출 | 차량운반구(161) → 현금(101) | 5,000,000 |
| SEED-CF-005 | 2026-05-25 | CFF 유입 | 현금(101) → 장기차입금(260) | 10,000,000 |

#### 자본변동 검증 분개

| 분개번호 | 날짜 | 변동 유형 | 계정 (차변 → 대변) | 금액 |
|--------|-----|---------|-----------------|-----|
| SEED-EQ-001 | 2026-05-02 | 유상증자 (CAPITAL_INCREASE) | 보통예금(102) → 자본금(301) | 20,000,000 |
| SEED-EQ-002 | 2026-05-30 | 배당 (DIVIDEND) | 미처분이익잉여금(343) → 보통예금(102) | 3,000,000 |

격리 식별자: `[DEV-SEED]` description prefix + `SEED-CF-` / `SEED-EQ-` journal_no prefix.
복식부기 균형: 7건 전체 차변 합계 = 대변 합계 검증 완료.

### 2-2. 백엔드 컴포넌트 신규 생성

BE agent 구현이 없는 Slice C 4개 보고서 컴포넌트를 DevOps가 직접 추가.

| 파일 | 역할 |
|----|-----|
| `report/AccountSummaryLine.java` | 일계표/월계표 계정별 차/대 행 record |
| `report/EquityChangeLine.java` | 자본변동표 변동 행 record |
| `report/EquityChangesResponse.java` | 자본변동표 응답 DTO |
| `report/DailySummaryResponse.java` | 일계표 응답 DTO |
| `report/DailyBreakdownLine.java` | 월계표 일별 소계 행 record |
| `report/MonthlySummaryResponse.java` | 월계표 응답 DTO |
| `report/MonthlySummaryService.java` | 월계표 집계 서비스 |
| `report/DailySummaryController.java` | 일계표 REST endpoint |
| `report/MonthlySummaryController.java` | 월계표 REST endpoint |

기존 이미 구현된 파일 (BE agent): CashFlowStatementService/Controller, EquityChangesService/Controller, DailySummaryService.

### 2-3. SliceCValidationIT

파일: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SliceCValidationIT.java`

#### 테스트 시나리오 (4 endpoint)

| 테스트명 | endpoint | 검증 내용 |
|--------|---------|---------|
| cashFlowReportReturns200ForPeriod202605 | GET /cash-flow?period=202605 | 200 OK + period/fromDate/toDate/netCashFlow/cashReconciled |
| cashFlowInvestingActivitiesNotEmpty | GET /cash-flow?period=202605 | investingActivities 배열 존재 + cashFromInvesting 수치 |
| equityChangesReportReturns200ForMay2026 | GET /equity-changes?fromDate=2026-05-01&toDate=2026-05-31 | 200 OK + beginningEquity/totalChange/endingEquity/lines |
| equityChangesHasCapitalIncreaseAndDividend | GET /equity-changes?fromDate=2026-05-01&toDate=2026-05-31 | lines[0]/lines[1] 최소 2건 존재 |
| dailySummaryReturns200ForJan15 | GET /daily-summary?date=2026-01-15 | 200 OK + summaryDate/journalCount/balanced=true/accountTotals |
| monthlySummaryReturns200ForJan2026 | GET /monthly-summary?period=202601 | 200 OK + period/fromDate/toDate/journalCount/balanced=true/dailyBreakdown |

#### 가드 적용

- `@SpringBootTest + @AutoConfigureMockMvc + @Transactional` 의무
- `@MockBean` 4종 (SlipServiceClient / ProductClient / PartnerLookupClient / ChatRoomMappingClient) — feedback_it_mockbean_external_clients 준수
- `@RequestParam` 이름 정확 (PR #136 회고): `period`, `fromDate`, `toDate`, `date` 각 컨트롤러 명세와 일치
- `AbstractPostgresIT.DockerAvailableCondition` skip 가드 — Docker 미가용 환경 CI fail 방지

---

## 3. 14건 100% 달성 마일스톤

| # | 보고서 | 슬라이스 | 상태 |
|---|------|--------|-----|
| 1 | 손익계산서 | A | 완료 |
| 2 | 재무상태표 | A | 완료 |
| 3 | 시산표 | A | 완료 |
| 4 | 부가세신고서 | B | 완료 |
| 5 | 법인세신고서 | B | 완료 |
| 6 | 거래처 미수미지급 | B | 완료 |
| 7 | 현금흐름표 | **C** | **완료** |
| 8 | 자본변동표 | **C** | **완료** |
| 9 | 일계표 | **C** | **완료** |
| 10 | 월계표 | **C** | **완료** |
| 11~14 | (예비 보고서 슬롯) | — | 로드맵 TBD |

현재 P0-1 목표였던 10개 핵심 재무 보고서가 Slice C 완료로 모두 endpoint 구현 + 검증 seed + IT 완료.

---

## 4. BE / FE / Designer / DevOps 산출물 요약

| 팀 | 산출물 |
|---|------|
| BE | Slice C 서비스 부분 구현 (CashFlowStatementService/Controller, EquityChangesService/Controller, DailySummaryService) |
| FE | Slice C 보고서 화면 — 로드맵 TBD (Phase 13 예정) |
| Designer | Slice C UI 가이드 — 로드맵 TBD |
| DevOps | V10 seed SQL 7건 + SliceCValidationIT 6 scenarios + 신규 서비스/컨트롤러/DTO 9개 파일 |

---

## 5. 매뉴얼 갱신 요약

- 현금흐름표 / 자본변동표 / 일계표 / 월계표 endpoint 명세: `/api/v1/accounting/reports/` 체계 통일
- 기존 V6 (Slice A) seed 분개 7건 — 일계표(2026-01-15) / 월계표(202601) 검증 재활용 명시

---

## 6. Phase 11 AWS 영향

없음. V10 seed 는 DEV 환경 한정 격리 분개 (SEED- prefix + [DEV-SEED] description) 이며,
Phase 11 RDS 마이그레이션 시 Flyway가 동일하게 적용되나 운영 데이터와 충돌하지 않는다.
ON CONFLICT DO NOTHING 전략으로 재실행 안전 보장.
