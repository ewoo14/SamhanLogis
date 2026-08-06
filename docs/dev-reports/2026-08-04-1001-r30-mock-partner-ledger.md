# R30 mock partner-ledger 회귀 보고서

## 작업 시작

- 대상 HEAD: `15238732f` (detached HEAD)
- 작업 범위: desktop mock의 `GET /accounting/journals/partner-ledger` 응답 계약 보완 및 Playwright 계약 단언 정정
- 금지 사항: git 명령, Docker 이미지 재빌드·서비스 재배포, 커밋된 스크린샷 변경, 전체 Playwright mock 스위트 실행
- 시작 시점: 2026-08-04

### 진행 기록

#### 단계 0 — 보고서 생성

작업 시작 전에 본 보고서를 생성했습니다. 이후 각 단계가 끝날 때마다 이 파일에 즉시 append합니다.

#### 단계 1 — 응답 계약 조사 및 원인 확정

- `AccountingReportController.partnerLedger()`는 `GET /accounting/journals/partner-ledger`에서 `ApiResponse<PartnerLedgerResponse>`를 반환합니다.
- `PartnerLedgerResponse`의 top-level 필드는 `partnerCode`, `partnerName`, `partnerBusinessNo`, `periodFrom`, `periodTo`, `documents`입니다.
- 각 `documents[]` 원소는 `type`, `documentNo`, `date`, `partnerCode`, `partnerName`, `deliveryAddress`, `amount`, `lines`를 가지며, 각 `lines[]` 원소는 `productName`, `modelName`, `quantity`, `unitPriceWithVat`, `lineAmount`를 가집니다.
- `PartnerLedgerReadService`는 출고 판매전표(`SALE`)와 확정 입금보고서(`CASH_RECEIPT`)를 합쳐 위 응답을 생성합니다. 거래처별 원장 화면은 `getLedgerData()`에서 이 응답의 `documents`를 화면 line으로 펼칩니다.
- `mock.ts`에는 기존 `GET /accounting/journals/ledger-data` handler만 있고 `GET /accounting/journals/partner-ledger` 전용 handler는 없습니다. 따라서 새 FE 호출은 전용 `PartnerLedgerResponse`가 아니라 앞쪽 범용 journal handler에 잘못 매칭됩니다.
- `sp-08-6-5-accounting-daily-ledger.spec.ts:180`은 `partnerLedgerApi.ts`의 실제 호출 경로와 달리 legacy `ledger-data` 문자열을 단언하고 있습니다.

**Root cause hypothesis: 확정.** 이 라운드의 실패는 백엔드 endpoint 부재가 아니라, 새 VIEW read-model endpoint에 대응하는 desktop mock handler 누락과 FE 정적 계약 단언의 legacy 경로 잔존이 함께 발생한 계약 불일치입니다.

#### 단계 2 — 가설 재현 및 mock 경로 충돌 확인

- 새 handler 없이 추가한 Vitest 회귀 테스트를 실행했습니다.
- `partner-ledger` 요청은 `null`이 아니라 앞쪽의 범용 `GET /accounting/journals/{id}` handler에 먼저 매칭되어 기존 `MOCK_JOURNALS[0]`을 반환했습니다.
- 기존 `ledger-data` handler 자체는 살아 있었지만 현재 fixture의 `lines`는 2건이므로, 보존 테스트는 실제 현재 응답을 기준으로 2건을 검증하도록 했습니다.
- 이 결과로 새 handler의 위치가 계약의 일부라는 점까지 확인했습니다. 범용 journal item/page handler보다 앞에 있어야 합니다.

검증 명령: `npm exec vitest run src/renderer/api/mock.test.ts -t "partner-ledger"`

검증 결과: 새 경로 계약 테스트와 기존 fixture 건수 기대가 실패했습니다. 전체 원문은 최종 검증 기록에 그대로 첨부합니다.

#### 단계 3 — 구현

- `mock.ts`의 범용 `/accounting/journals/{id}` handler보다 앞에 `GET /accounting/journals/partner-ledger` handler를 추가했습니다.
- 응답은 백엔드 `PartnerLedgerResponse`와 동일한 top-level/document/line shape이며, `SALE`과 `CASH_RECEIPT` 문서를 포함합니다. 요청의 `partnerCode`, `from`, `to`를 응답 기간과 거래처 식별자에 반영합니다.
- 기존 `GET /accounting/journals/ledger-data` handler는 삭제·변경하지 않았습니다.
- Playwright T4 FE 단언은 `/accounting/journals/partner-ledger`로 교정했고, T2의 백엔드 `ledger-data` 단언은 그대로 유지했습니다.
- mock 단위 회귀 테스트를 추가해 새 응답 shape와 legacy handler 보존을 함께 검증합니다.

#### 단계 4 — mock Vitest 검증

명령: `npm exec vitest run src/renderer/api/mock.test.ts`

출력 원문:

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop

 ✓ src/renderer/api/mock.test.ts (130 tests) 193ms

 Test Files  1 passed (1)
      Tests  130 passed (130)
   Start at  10:58:05
   Duration  2.08s (transform 758ms, setup 0ms, collect 979ms, tests 193ms, environment 0ms, prepare 97ms)
```

결과: 통과.

#### 단계 5 — 지정 Playwright 스펙 검증

명령: `npx playwright test playwright/sp-08-6-5-accounting-daily-ledger --reporter=line`

출력 원문:

```text
Running 5 tests using 1 worker

[1/5] [chromium] › playwright\\sp-08-6-5-accounting-daily-ledger\\sp-08-6-5-accounting-daily-ledger.spec.ts:24:3 › SP-08-6-5 일마감 + 원장 정적 계약 › T1 BE 일마감 계약: AccountingReportController + Flyway V15
[2/5] [chromium] › playwright\\sp-08-6-5-accounting-daily-ledger\\sp-08-6-5-accounting-daily-ledger.spec.ts:76:3 › SP-08-6-5 일마감 + 원장 정적 계약 › T2 BE 원장 계약: LedgerController + 거래처 필터 + UUID 비공개
[3/5] [chromium] › playwright\\sp-08-6-5-accounting-daily-ledger\\sp-08-6-5-accounting-daily-ledger.spec.ts:119:3 › SP-08-6-5 일마감 + 원장 정적 계약 › T3 FE 일마감 화면: 라우트 + 날짜 + 거래처 + 처리 버튼
[4/5] [chromium] › playwright\\sp-08-6-5-accounting-daily-ledger\\sp-08-6-5-accounting-daily-ledger.spec.ts:158:3 › SP-08-6-5 일마감 + 원장 정적 계약 › T4 FE 원장 화면: 기간 + 거래처 + 라인 + 출력
[5/5] [chromium] › playwright\\sp-08-6-5-accounting-daily-ledger\\sp-08-6-5-accounting-daily-ledger.spec.ts:199:3 › SP-08-6-5 일마감 + 원장 정적 계약 › T5 권한 가드: ACCOUNTANT/MANAGER/MASTER 접근 + MASTER 역마감 독점
  5 passed (5.7s)
```

결과: 통과. Chromium이 이미 준비되어 있어 별도 설치는 필요하지 않았습니다.

#### 단계 6 — 최종 보고서 마감

상태: `DONE`

변경 파일:

- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/api/mock.test.ts`
- `clients/desktop/playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts`
- `docs/dev-reports/2026-08-04-1001-r30-mock-partner-ledger.md`

신규 생성 파일:

- `docs/dev-reports/2026-08-04-1001-r30-mock-partner-ledger.md`

### 이 라운드가 보지 않은 것

- 백엔드 endpoint의 추가·제거·재배포는 보지 않았고 변경하지 않았습니다. `ledger-data` 소비자 전체 목록과 `929-r6-*` 스펙의 실행도 이번 라운드 범위 밖입니다.
- 실 서비스 DB 데이터, accounting-service 통합 테스트, Docker 상태, 서비스 재배포, 라이브 QA는 보지 않았습니다.
- 전체 Playwright mock 스위트와 커밋된 QA 스크린샷은 보지 않았고 변경하지 않았습니다.
