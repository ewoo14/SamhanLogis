# #1068 S1 판매전표 헤더 거래처 자동채움

작성일: 2026-08-11  
범위: `feat/1068-slip-header-autofill` / `origin/main da09abcec`

## 결론

판매전표에서 거래처를 선택하면 전화번호·주소·대표이사·거래처 특이사항·담당자가 채워진다. 전잔은 `partners.outstanding_balance`가 아니라 accounting 원장 read model에서 조회한다. 저장 전에는 후잔을 계산하지 않고 `저장 후 산출`로 표시하며, 저장 대상 전표의 `slipNo`를 accounting 조회에 명시해 저장 후 후잔을 산출한다.

## 정본과 산식 근거

`partners.outstanding_balance`는 이 화면에서 읽거나 쓰지 않았다. `Partner.java:29,80-84`는 해당 필드를 `creditLimit`과 함께 신용 거래 정보로 정의하고, `Partner.java:298-326`의 신용한도·입금/미수금 도메인 축과 연결한다. 전표 발행 흐름이 이 값을 원장과 동기화하지 않으므로 S1 전잔 정본으로 채택하지 않았다.

전잔 정본은 accounting의 거래처 원장 계약이다.

- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java:14-16` — canonical 판매 상태 집합.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:403-430` — 채권 계정의 accounting journal, 전기 판매전표, 수금에서 기초 잔액을 계산한다. partner master의 outstanding 값을 읽지 않는다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:191-198` — `GET /accounting/journals/sales-slip-ledger` 계약과 선택적 `slipNo` 전달.

후잔 산식은 `전잔 + 판매 + 조정 - 수금`이다. `PartnerLedgerContract.java:99-120`이 `delta = sales + adjustments - payments`, `closing = opening + delta`를 구현한다. 판매전표는 `PartnerLedgerContract.java:55-64`에서 VAT 포함 금액으로 원장에 투영한다. 따라서 S1의 전표 반영분은 공급가가 아니라 VAT 포함 전표 금액이다.

저장 대상 `slipNo`는 `SlipInternalController.java:433-450`의 활성 OUTBOUND projection 계약으로 조회한다. 기간 원장에 이미 들어온 전표는 `PartnerLedgerReadModelService.java:497-517`에서 `slipNo`로 중복 제거하고, DRAFT/SAVED라 기간 집계에서 빠진 전표만 한 번 추가한다. 이 경계를 명시하지 않으면 원장이 이미 반영한 경우 이중 계상, 아직 반영하지 않은 경우 누락이 발생하기 때문이다. 대상 거래처 코드는 신규 전표 응답에서 비어 있을 수 있으므로 선택 거래처 UUID가 대상 UUID와 일치하는 경우도 같은 거래처로 검증한다.

## 화면 동작 결정

- 자동채움 대상인 전화번호·주소·대표이사는 사용자가 한 번 수정하면 dirty로 기록하고 거래처를 바꿔도 덮어쓰지 않는다. 수정하지 않은 필드만 새 거래처 값으로 갱신한다. 이는 사용자의 전표별 스냅샷을 보존하기 위한 결정이다 (`SlipFormPage.tsx:733-733,1752-1759,1781-1855`).
- 거래처 변경 시 read-only master metadata인 특이사항·담당자는 새 거래처 값으로 바꾼다. 거래처를 해제하면 자동채움 값 중 사용자가 수정하지 않은 값만 비우고, 수정값은 보존한다.
- 특이사항·담당자는 현재 `CreateSlipRequest`/Slip에 저장 필드가 없으므로 화면에서 수정 가능한 것처럼 만들지 않고 read-only로 표시한다 (`SlipFormPage.tsx:2264-2271`).
- accounting 조회는 `retry: false`인 독립 query다 (`SlipFormPage.tsx:807-814`). 실패하면 `조회 실패`와 안내문을 표시하고 전표 저장 가능 여부와 연결하지 않는다 (`SlipFormPage.tsx:2284-2297`). 따라서 accounting 장애가 전표 작성을 막지 않는다.
- 전잔 조회 실패·미완료·전표 저장 실패를 0원으로 대체하지 않는다. 저장 실패 시 mutation error만 표시하고 입력 화면에 남으며, 후잔은 계속 `저장 후 산출`이다. 성공 저장 후에만 상세 화면에서 `slipNo`를 포함한 원장 결과를 표시한다.
- 거래처가 없는 전표는 accounting query를 실행하지 않고 `거래처 없음`을 표시한다. 기존 출고 창고·배송주소·감리주소·입금예정일·인수자 및 채번·자동 빈행·instanceKey 흐름은 유지했다.

## RED-A / 테스트

`clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`에 다음 실패 경계를 먼저 고정한 뒤 구현했다.

1. 거래처 선택 → 다섯 헤더 항목 및 accounting 전잔.
2. 거래처 변경 → 사용자가 수정한 전화번호 보존, 미수정 자동채움 갱신.
3. accounting 실패 → `조회 실패`, 저장 mutation은 계속 가능, 후잔은 `저장 후 산출`.
4. 저장 실패 → 폼 유지, 후잔을 0으로 바꾸지 않음.

추가 계약 테스트:

- `partnerLedgerApi.test.ts`: `slipNo` query 전송 및 누락 잔액의 undefined 보존.
- `salesSlipLedger.test.ts`: opening/closing 누락을 0으로 표시하지 않음.
- `PartnerLedgerReadModelServiceTest.java`: 기간 원장에 없는 DRAFT 대상 전표가 정확히 한 번만 추가됨.

## 검증 결과

- `clients/desktop`: `npm run build` 통과.
- `clients/desktop`: `npx tsc -p tsconfig.web.json --noEmit` 통과.
- `clients/desktop`: `npx vitest run` — Test Files 251 passed, Tests 2211 passed, 2 skipped.
- `services/accounting-service`: `PartnerLedgerReadModelServiceTest` 통과.
- `services/slip-service`: `compileJava` 통과.
- Playwright 직접 Chromium(headless), 해시 라우터, 별도 포트 `5184`:
  - 스펙: `clients/desktop/playwright/2026-08-11-1068-real-qa/2026-08-11-1068-real-qa.spec.ts`
  - 결과: 3 passed — 성공 자동채움/전잔, accounting 장애/조회 실패, 거래처 미지정.
  - [partner-header-real-qa.png](/C:/dev/Samhan-Public/.claude/worktrees/w1068/docs/qa/2026-08-11-1068-real-qa/partner-header-real-qa.png)
  - [accounting-failure-real-qa.png](/C:/dev/Samhan-Public/.claude/worktrees/w1068/docs/qa/2026-08-11-1068-real-qa/accounting-failure-real-qa.png)
  - [partnerless-real-qa.png](/C:/dev/Samhan-Public/.claude/worktrees/w1068/docs/qa/2026-08-11-1068-real-qa/partnerless-real-qa.png)

## 격리 환경 실 왕복

`codex-1068-pg`(host `55432`, DB `partner_db/slip_db/accounting_db/product_db`)와 partner/product/slip/accounting 로컬 서비스를 사용했다. 모든 서비스 로그에서 `jdbc:postgresql://localhost:55432/...`를 확인했다.

실제 왕복:

1. slip-service `POST /slips` → `2026/08/11-1`, DRAFT, VAT 포함 라인 금액 `1,100,000`.
2. slip-service `POST /slips/{id}/save` → SAVED.
3. accounting `GET /accounting/journals/sales-slip-ledger?partnerCode=P-2026-0019&from=2026-08-11&to=2026-08-11&slipNo=2026%2F08%2F11-1` → 전잔 `47,975,400`, 판매 `1,100,000`, 후잔 `49,075,400`, 대상 documents 1건.

즉 실제 저장 대상 `slipNo`를 포함한 왕복에서 `47,975,400 + 1,100,000 = 49,075,400`을 확인했고, 대상 전표가 한 번만 반영됐다. 검증 종료 후 로컬 서비스와 `codex-1068-pg`를 중지·제거했다.

## 공유 DB QA 규약 위반 보고

초기 라이브 왕복 준비 과정에서 제가 DB 포트 환경변수를 누락해 Java 서비스 일부를 `localhost:5432`로 기동했다. 이는 공유 DB write 금지 규약 위반이다. 즉시 해당 포트의 제가 띄운 프로세스를 모두 중지했고, 공유 DB에는 삭제·정정 작업을 하지 않았다.

read-only로 확인한 결과, 공유 DB에 현재 세션 시각(2026-08-11 23:20 이후) 생성된 partner/product/slip 행은 없었다. 다만 초기 로그에는 seeder의 `created` 메시지가 남아 있어 과거 고정 seed 데이터와 이번 실행의 귀속을 로그만으로 완전히 분리할 수 없다. 따라서 초기 실행 결과는 격리 QA 근거로 사용하지 않고, 위의 `55432` 재실행 결과만 정본 QA 근거로 삼았다. 이후 모든 왕복은 datasource URL을 명시했다.
