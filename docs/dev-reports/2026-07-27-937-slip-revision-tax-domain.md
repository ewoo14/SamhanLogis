# 전표 버전이력 세금 도메인 정합 + 금액 편집 캡처 (PR #937 · 연관 이슈 #926)

> 2026-07-27 개발책임자 결정:
> - **A안 — "이력 합계도 VAT 포함으로"**: 버전이력의 "단가"·"합계"가 전표 라인 표의 "단가(VAT포함)"·"합계(VAT포함)"와 같은 도메인을 말한다.
> - **흡수 — 캡처 게이트 fix**: 금액을 바꾸는 라인 편집(공급가액·부가세·VAT포함합계 중 하나라도)은 모두 버전 이력에 기록한다.

전표 상세의 상단 라인 표와 하단 버전 이력이 **같은 화면에서 같은 단어로 다른 값**을 말하던 문제(R7-1)와, 부가세만 편집하면 저장은 되나 revision 이 캡처되지 않아 **감사 이력이 편집을 누락**하던 문제(캡처 게이트)를 함께 해소한다.

## 설계 결정

- **저장 스냅샷(JSONB, 불변)은 그대로** — `SlipRevisionService` 의 **파생 표시값만** VAT 포함 도메인으로 정규화한다. 감사 데이터 위조가 아니라 렌더 정규화다.
- **표시값 단일 진실원** — 버전이력 "합계"가 레드라인과 동일한 `lineTotalDisplayValue`(= supply + vat)를 쓴다. 종전에 저장 컬럼 `lineTotal`(공급가액, VAT 제외)을 직접 읽던 유일한 예외를 제거.
- **FE/BE 미러 정렬(R7-2)** — 금액 3값이 없는 구 스냅샷의 총액을 화면(`SlipDetailPage.slipLineAmounts` = `lineTotal + 10%`)에 맞춘다. FE `vatFromSupply(trunc)` 와 BE `fromSupply(DOWN)` 는 정수 원 0..2,000,000 전수 0 불일치.
- **감사 캡처 정책** — 변경 감지 요약이 금액 필드를 포함해, 부가세/공급가/합계 단독 편집도 revision 을 캡처한다. `normalize(stripTrailingZeros)` 로 **무편집 재저장은 여전히 idempotent**(revision 미증가).
- **표기 granularity(수용)** — 버전이력 diff 는 `단가·합계` 를 itemize 하고 `공급가액·부가세` 는 개별 행으로 표시하지 않는다(pre-existing). 부가세 단독 편집은 그 귀결인 "합계" 변경으로 표시되며 스냅샷 데이터는 완전하다. 개발책임자 수용(오류/데이터손실 아님).

## BE (slip-service)

| 항목 | 내용 |
|---|---|
| `SlipRevisionService` | `LINE_FIELDS` "합계" = `lineTotalDisplayValue`(S+V) · `lineDiffers` 가 단가·합계를 표시값으로 비교(요약과 목록 판정 일치) · `lineTotalDisplayValue` 레거시 분기 = `lineTotal+10%`(FE 미러) |
| `SalesSlipUpdateService`·`SlipUpdateService`(매입) | `summarizeLines` 변경 게이트에 `supplyAmount·vatAmount·lineTotal` 추가 — 부가세만 편집해도 capture 발동. 계열 sweep 으로 매출·매입 양 경로 수정 |
| 표시 불변 | 삭제 audit·협업 복원 경로는 무조건 캡처/명시 변경목록이라 비대상. EstimateRevision 은 완전 분리 |
| 테스트 | slip-service 전체 **1,506 / 0 fail**. 신규: `versionHistoryLineTotalUsesScreenTaxDomain`·`...LegacySnapshotWithoutAmountsMirrorsScreen`·`versionSummaryAgreesWithFieldChangesOnDisplayedAmounts` · VAT-only 캡처 RED/GREEN + 무변경 회귀 |

## FE (desktop)

| 항목 | 내용 |
|---|---|
| `SlipDetailPage.lineIdContract.test.tsx` | 레거시 라인 미러 못(`totalIncl===110000`, `unitWithVat===110000`) 고정 — BE 표시 도메인 역행 방지 |
| 버전이력 패널 | BE 표시값을 가공 없이 렌더(이중과세 없음) — 변경 없음(계약테스트만 추가) |

## 검증 (재수렴 8·9차)

| 라운드 | 결과 |
|---|---|
| RED-first (A안) | pre-fix 4 RED(SlipRevisionServiceTest 660/696/725/589) → A안 GREEN → 뮤테이션 RED |
| 1차 OPUS (BE+FE) | 도달가능 **0** — 316 라인 전수 `단가×수량=합계` 위반 0 · BE·FE 표시값 전수 일치 · 소비처(API·레드라인·RESTORE·매칭·estimate·null/0) 안전 |
| 2차 CODEX SOL 라이브QA | R7-1 닫힘(표 합계 240,000 = 이력 240,000, 단가×2=합계) · R7-2 닫힘(유닛+parity) · RESTORE PASS · **부가세만 편집 revision 미캡처** 결함 발견 |
| RED-first (캡처 fix) | VAT-only 미캡처 재현 RED(WantedButNotInvoked) → fix GREEN → 뮤테이션 RED |
| 9차 SOL 재검증 | VAT-only 캡처 닫힘(판매·매입 revision 3 생성) · 무편집 재저장 idempotent(over-capture 0) · legacy null 백필 1회 |
| 수렴비 | 8차 OPUS c=0/2 · 8차 SOL 도달가능 1(pre-existing) r=0 · 9차 캡처 fix 로 닫힘, 신규 over-capture 0 |

라이브QA 스크린샷은 개발책임자께 전달(SendUserFile) + 본 문서 `docs/qa/937-slip-revision-tax-domain/` SHA 고정.

## 소급 규모 (참고)

A안은 저장 스냅샷을 바꾸지 않고 표시값만 정규화하므로 "소급 변경"은 렌더 숫자다(감사 데이터 불변). 회사 PC 로컬 `slip_db` = 149 리비전 / 316 라인(신규 315·레거시 1). 집PC 측정치(2,510/751)는 로컬 데이터셋 상이로 회사 PC 재현 불가.
