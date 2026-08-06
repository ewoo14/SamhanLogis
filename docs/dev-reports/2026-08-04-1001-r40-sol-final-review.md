# PR #1061 R40 SOL 5.6 최종 적대검증 보고서

- 검증 일자: 2026-08-04 (Asia/Seoul)
- 작업 트리: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 검토 HEAD: `8622f3b16105b0d72a1bea6e50a53cb0a5f56c0c`
- 검증 범위: 도달 결함 및 증거 무결성. 검증 품질은 판정 대상에서 제외한다.
- 금지사항 준수: 코드 수정, 컨테이너 조작, DB 직접 쓰기, git add/commit/push를 하지 않는다.

## 0. 시작 상태

- `git -C . rev-parse --show-toplevel`: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- `git branch --show-current`: `feat/1001-ledger-spec-rest`
- `git rev-parse HEAD`: `8622f3b16105b0d72a1bea6e50a53cb0a5f56c0c`
- 시작 시 기존 untracked QA 산출물 4경로가 있었으며 본 검토는 이를 변경하지 않는다.
- Docker 배포본, API 실측, 코드·snapshot·legacy 분석 결과는 아래 절에 순차 append한다.

## 1. 측정 환경과 배포본

- 측정 PC: 현재 작업 디렉터리가 있는 Windows PC, Docker Desktop의 `samhan-*` 컨테이너.
- Gateway: `http://127.0.0.1:8080`.
- 실측 계정: `dev_manager`, 산식 전수 재검산은 `dev_accountant`로도 수행했다.
- `docker inspect samhan-accounting-service`: 생성시각 `2026-08-04T14:14:35.791581819Z`, image `sha256:ea5f0cbe40187abb0d832eaed86f66af361cb99c4764c44cf75d5b8534faf13e`.
- `docker inspect samhan-slip-service`: 생성시각 `2026-08-04T14:14:35.791595371Z`, image `sha256:29acb10280eaeb62435c04089f82865bd1cb8fbc865c6afbcb8d6e62f313ba87`.
- 두 컨테이너의 compose working directory는 모두 현재 `t1001b`이고 R14가 기록한 배포시각과 정확히 일치한다. 컨테이너를 중지·재빌드·재시작하지 않았다.
- Gateway 컨테이너는 `2026-07-31T15:15:50.070347996Z` 생성본이며, API 호출은 이 Gateway를 경유해 위 accounting 배포본에 도달했다.

## 2. 무필터 51건 → 48건 규명

### 2.1 결론

가설 A도 가설 B도 아니다. **R13과 R14의 조회 종료일이 달랐다.**

- R13: `2026-01-01~2026-08-03` → 51건.
- R14: `2026-01-01~2026-03-31` → 48건.
- 현재 동일 R39 배포본에서 두 API를 다시 호출해 각각 51건과 48건을 재현했다.
- 현재 기간의 canonical 판매전표 32건과 accounting journal의 `source_ref_id`를 대조한 결과 일치 journal은 0건이다. 따라서 이 DB에서는 slip+journal 동일 사실 합치기(가설 A)가 3건 감소를 만들 수 없다.
- 종료일만 바꿨을 때 추가되는 거래처가 정확히 아래 3건이다. 같은 `01-01~08-03` 조건에서는 R39가 셋 모두 반환하므로 정상 거래처를 떨어뜨린 가설 B도 아니다.

| 거래처 | 3월 이후 원천 | R39 분류/응답 | 판정 |
|---|---|---|---|
| `2148720659` / (주)삼한공조시스템 | `2026/08/03-6`, 2026-08-03 판매전표, VAT 포함 `1,739,100`원 | `SALE`, sales/closing `1,739,100`원 | 정상 판매전표이나 R14 기간 밖. A/B 모두 아님 |
| `P-2026-0011` / 고양냉난방주식회사 | `2026/04/10-1`, `MANUAL/SYSTEM_SEED`, 101 차변·201 대변 각 `2,750,000`원 | `Effect.NONE`; 공개 문서는 0건, 합계 0원인 row는 남음 | 정상 업무거래가 아니라 seed-only row. A/B 모두 아님 |
| `P0-6-C001` / (주)한국냉동물류 | 2026-07-27 QA 잔재: 원분개 110 차변 `299,999`원 및 역분개 110 대변 `299,999`원 | `SALE_SUMMARY 299,999` + `JOURNAL_ONLY/PAYMENT 299,999`, closing 0원 | QA/역분개 쌍이며 R14 기간 밖. A/B 모두 아님 |

즉 “사라진 3건”은 R39가 없앤 동일 기간 row가 아니라, R14가 조회하지 않은 4·7·8월 row다. R14 보고서의 48 대 R13의 51 비교는 측정 조건이 달라 수치 비교 증거로 사용할 수 없다.

### 2.2 새 결함 — `Effect.NONE` seed-only row가 cohort에 남음

`PartnerLedgerReadModelService`는 journal aggregate를 본 즉시 거래처 group을 만든 뒤, 문서 분류 결과가 `NONE/0원`이라 공개 문서에서 제거돼도 group 자체는 제거하지 않는다. 그 결과 `P-2026-0011`은 `01-01~08-03` 무필터에 매출 0/수금 0/채권 0인 row로 도달한다.

이는 정상 거래처를 떨어뜨린 결함은 아니지만, R39의 `NONE` 분류가 seed-only 거래처를 무필터 업무 cohort에서 제거하지 못한 도달 결함이다. R13의 “정상 거래처 51건” 중 최소 1건은 정상 업무금액 row가 아니었다.

## 3. R14 미판정 두 항목

### 3.1 literal `SALE_SUMMARY`

- 실 API 응답에는 나타난다. 예: `P-2026-0028`, `2026-01-01~03-31`의 orphan `29,700,000`원 문서는 `type=SALE_SUMMARY`다.
- 화면에는 literal이 나타나지 않는다. `PartnerLedgerPage.tsx`는 `CASH_RECEIPT→수금`, `JOURNAL_ONLY→분개`, 나머지(`SALE`, `SALE_SUMMARY`)를 모두 `매출`로 표시한다.
- 따라서 “응답 literal”은 YES, “화면 literal”은 NO다. 다만 사용자용 한국어 라벨 `매출`과 적요 `판매전표 없음 / 전표 미이관`으로 문서 의미는 표시된다.

### 3.2 채권 산식 API 전수 검산

실 API의 aggregate와 partner-ledger를 거래처별로 호출해 다음 네 값과 교차 검산했다.

```text
상세 closingBalance = openingBalance + salesTotal - paymentTotal
집계 receivableBalance = 상세 closingBalance
집계 salesTotal/paymentTotal = 상세 salesTotal/paymentTotal
```

| 기간 | 집계 row | 불일치 | 비영 기초 row | 비영 수금 row |
|---|---:|---:|---:|---:|
| 2026-01-01~03-31 | 48 | 0 | 0 | 0 |
| 2026-03-01~08-03 | 44 | 0 | 36 | 10 |
| 2026-01-01~08-03 | 51 | 0 | 0 | 10 |

비영 기초·수금 동시 사례 `P-2026-0005`(`03-01~08-03`)는 `28,600,000 + 0 - 277,000 = 28,323,000`원으로 성립했다. 따라서 R14 화면만으로 미판정이었던 산식은 **실 API 응답에서는 전수 PASS**다.

## 4. R39 collection/effect 새 표면

### 4.1 `Effect.NONE` 문서와 금액의 행방

`01-01~08-03` partner journal을 문서 단위로 분류하면 `NONE`은 5개이며 모두 `MANUAL/SYSTEM_SEED`다.

- 110 차변 seed 3건: `P-2026-0001 2,200,000`, `P-2026-0002 3,520,000`, `P-2026-0003 1,980,000`원, 합계 `7,700,000`원.
- 매입/미지급 seed 2건: `P-2026-0011 2,750,000`, `P-2026-0012 1,320,000`원.
- 계약의 `none()`은 `amount=revenue`, `debit=0`, `credit=0`을 반환한다. 위 5문서는 401 revenue가 모두 0이라 공개 document filter에서 사라지고, sales/payment/closing fold에도 들어가지 않는다.
- 금액은 거래처 원장 업무금액에서는 제외되지만 원본 accounting journal에는 그대로 남고, 원장 외 aging/report repository는 R39 분류 계약을 거치지 않는다.

금액 제외 자체는 의도와 일치한다. 그러나 앞 절처럼 seed-only `P-2026-0011`의 0원 aggregate row가 남는 부작용은 도달한다.

### 4.2 도달 결함 — 내부 UUID가 공개 `documentNo`로 노출

계약 Javadoc은 `sourceKey`를 public 응답에 노출하지 않는다고 명시하지만, `PartnerLedgerReadModelService`는 분류 결과의 `document.sourceKey()`를 그대로 `Document.documentNo`에 넣는다. 실 API 전수 결과:

- UUID 형식 `documentNo`: **40문서 / 37거래처**.
- 구성: `SALE_SUMMARY`와 `JOURNAL_ONLY` journal 문서.
- 예: `P-2026-0028` orphan 문서번호 `f21b2f0f-a733-45ea-8f09-25c7f2e04f5f`.

이 값은 API뿐 아니라 화면의 “분개번호”와 인쇄 line으로 전달된다. 내부 UUID 비공개 계약과 R39 자체 Javadoc을 동시에 위반하는 도달 결함이다.

### 4.3 시드·QA 잔재가 업무금액에 섞이는지

- `MANUAL / SYSTEM_SEED`: 19 journal/44 line/차대변 각 `65,590,000`원이 존재한다. partner-linked는 5 journal/13 line이며 위 `NONE` 분류로 거래처 원장 금액에서는 제외된다.
- `SLIP / created_by=system`: 29 journal(POSTED 26, REVERSED 3), 29거래처, 401 순매출 `457,000,000`원, 110 채권 `502,700,000`원이 존재한다. 활성 canonical slip 32건과 `source_ref_id` 일치가 0건이므로 dedup되지 않는다.
- R39는 이 29건을 `SALE_SUMMARY/Effect.SALE`로 분류하여 **VAT 포함 110 차변 `502,700,000`원 전액을 업무 sales/closing에 포함**한다. `P-2026-0028 +29,700,000`, `P-2026-0018 +7,700,000`도 이 cohort다.

과거 R5~R12 보고서는 이 29건을 QA 제외 대상으로 반복 기록했고, 이번 지시도 이를 “시드·QA 잔재”로 지정했다. 따라서 R14가 예측값과 일치했다는 사실과 별개로, QA 잔재가 업무금액에 도달하는 결함은 남아 있다.

## 5. 구형 snapshot 역직렬화

실 API `GET /accounting/journals/ledger-history/LED-20260804-000001/restore`를 호출했다.

- HTTP 200.
- 저장값: `P-2026-0028`, `2026-01-01~08-03`, `salesTotal=30,567,900`, `paymentTotal=0`, `closingBalance=30,567,900`, SALE 문서 1건/line 3건.
- R39 현재 재조회 값 `60,267,900`으로 바뀌지 않았다. 저장 payload를 새 원장으로 재계산하지 않고 원문 복원한다.

따라서 구형 snapshot은 새 계약 역직렬화로 값이 달라지지 않는다. 이는 snapshot 시점 보존 계약과 일치한다.

## 6. legacy 호환 경로

### 6.1 null read-model fallback

`SalesAggregateService.aggregate()`의 90행 이후와 `PartnerLedgerReadService.read()`의 62행 이후 fallback은 코드상 실행 가능하지만, 운영 Spring 생성자는 `PartnerLedgerReadModelService`를 필수 주입하므로 정상 애플리케이션에서는 도달하지 않는다. 별도 legacy 생성자는 남아 있지 않고, `SalesAggregateServiceTest`의 Mockito `@InjectMocks`가 누락 mock을 null로 넣어 이 fallback을 테스트 경로에서만 실행한다.

즉 운영 생성자 경로에서 두 계산 답이 갈리는 상태는 아니지만, 테스트가 실제 운영 경로와 다른 옛 계산기를 계속 검증하는 잔여는 살아 있다.

### 6.2 도달 가능한 구형 raw endpoint

`GET /accounting/journals/ledger-data`는 controller route와 `LedgerImageService`가 그대로 살아 있고 `dev_manager` PRINT 권한으로 HTTP 200 도달한다. 동일 `P-2026-0028`, `01-01~03-31` 실측:

- 신규 `/partner-ledger`: SALE `30,567,900` + SALE_SUMMARY `29,700,000`, closing `60,267,900`.
- 구형 `/ledger-data`: 2026/03/23 journal의 110/401/220 세 line만 반환하며 line running balance가 `29,700,000 → 2,700,000 → 0`으로 끝난다. canonical SALE `30,567,900`은 없다.

같은 “거래처 원장” 이름과 같은 기간·거래처에 서로 다른 답을 내는 도달 가능한 호환 API가 남아 있다. 현재 Desktop 거래처 원장 화면은 신규 endpoint를 쓰지만, raw endpoint는 인증된 외부 호출자에게 계속 공개돼 있다.

## 7. 도달 결함 재수렴 결과

도달 결함은 0이 아니다. 확인된 결함은 4계열이다.

1. R39 collection `sourceKey`가 공개 `documentNo`로 전달되어 UUID가 40문서/37거래처의 API·화면·인쇄에 노출된다.
2. 현재 PC의 QA 잔재 `SLIP/created_by=system` 29 journal이 `SALE_SUMMARY/SALE`로 분류되어 VAT 포함 `502,700,000`원이 업무 매출·채권에 섞인다.
3. `Effect.NONE`으로 금액·문서가 제거된 seed-only 거래처 group이 제거되지 않아 `P-2026-0011` 0원 row가 무필터 cohort에 남는다.
4. 도달 가능한 구형 `/ledger-data`가 신규 `/partner-ledger`와 동일 거래처·기간에 다른 원장 답을 반환한다.

반대로 다음 항목은 결함 없음으로 확정했다.

- 51→48은 정상 거래처 3건 차단이 아니라 서로 다른 종료일 비교다.
- 채권 산식은 세 기간의 실 API 전수에서 불일치 0건이다.
- `LED-20260804-000001` 구형 snapshot은 저장값을 그대로 복원한다.
- `MANUAL/SYSTEM_SEED` partner 금액은 ledger fold에서 제외된다.

## 8. HEAD `8622f3b16` CI 상태

최종 재확인 시 PR #1061 head OID는 `8622f3b16105b0d72a1bea6e50a53cb0a5f56c0c`로 로컬과 일치하지만 **CI는 green이 아니다**. 고유 실패 job은 다음 3개다.

- `빌드 + 테스트 (slip-units)`: `PartnerLedgerSalesResponseTest:71`, JSON에 `slipId`가 없어야 한다는 계약 실패(795 tests 중 1 fail).
- `빌드 + 테스트 (slip-it-core)`: `SlipPartnerLedgerInternalControllerIT:91`, internal 원장 응답에 `slipId`가 없어야 한다는 계약 실패(674 tests 중 1 fail).
- `Frontend Desktop (typecheck + lint + build)`: Vitest document-number guard가 `partnerLedgerApi.test.ts`의 `documentNo=P-2026-0004`를 위반으로 검출(1774 tests 중 1 fail).

slip 두 실패는 R39가 중복제거용 `slipId`를 serialized response record에 추가한 변경과 직접 연결된다. 이는 내부 호출 경로이므로 위 사용자 도달 결함 4계열과 별도로 CI 계약 불일치로 기록한다.

## 9. 신규 파일과 작업 트리

- 이번 라운드 신규 파일: `docs/dev-reports/2026-08-04-1001-r40-sol-final-review.md` 1개.
- 시작 전부터 존재한 untracked QA 산출물 4경로는 변경하지 않았다.
- `git add`, commit, push를 하지 않았다.
- 코드, 컨테이너, DB를 변경하지 않았다.

## 이 라운드가 보지 않은 것

- 현재 PC의 배포본과 개발/QA DB만 측정했다. 운영 PC·운영 배포본·운영 DB의 건수나 금액으로 일반화하지 않는다.
- 거래처 원장 외 회계 화면, 거래명세서 일괄, CSV 다운로드, OS 인쇄 대화상자, 실제 프린터 출력은 재검증하지 않았다.
- `/ledger-data`의 저장소 밖 소비자와 외부 연동 호출 이력은 확인하지 않았다. 다만 route 자체와 인증된 API 도달 및 응답 차이는 실측했다.
- snapshot copy는 POST write이므로 실행하지 않았다. restore GET만 검증했다.
- CI 실패를 수정하거나 재실행하지 않았다.

## 최종 머지 권고

**머지 비권고.** 근거는 (1) 도달 결함이 4계열로 0이 아니고, 특히 공개 UUID 노출과 QA 잔재의 업무금액 혼입이 실 API에 도달하며, (2) 동일 HEAD의 CI가 3개 고유 job에서 red이기 때문이다. R14의 세 경로 금액 일치와 이번 API 채권 산식 전수 PASS는 유지되지만 두 머지 게이트를 충족시키지 못한다.
