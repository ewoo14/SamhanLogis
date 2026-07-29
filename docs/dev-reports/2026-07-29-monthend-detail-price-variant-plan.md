# 일마감 상세 표시 단가를 설정 기준으로 — 기획 (조기 PR)

> 관련: #773 (CLOSED — 재계산 토글 보류 확정) · #977 (금액 계열 GAS 재대조에서 발견)

## 발견 경위

#977 금액 계열 GAS 재대조에서 `일마감 프로그램` 의 단가인상 기준일이 `20260401` → `20260701` 로 바뀐 것을 확인하고 제품 대응을 대조하다 나왔다.

**PM 이 처음엔 "기준일 정렬 문제" 로 잘못 규정**했고, 개발책임자가 두 번 정정했다.

1. *"일마감은 기준일이 아니라 원래 GAS 는 기본 시트와 `_단가인상` 붙은 시트로 나뉘어서 해당 것을 기준으로 진행했음. 기준일로 단가인상이 바뀌게 하는 것은 주문서 웹을 말하는 것임."*
2. *"아니면 이슈 확인바람. 아직 구현이 안되었을수도 있음."*

②가 정확했다. **#773 이 이미 문서화**하고 있었다.

## #773 이 이미 말한 것 (착수 전 반드시 읽을 것)

> - 현대 일마감 화면에는 단가변동 토글이 없고, **가격 재계산도 하지 않음** — 이미 stamp 된 합계를 집계·lock 할 뿐(`DailyClosingService.close()`)
> - `DailyClosing` 은 **카테고리 축 자체가 없음**
> - 현대 시스템은 단가변동이 이미 **상류(견적/전표 생성 시)에 stamp** → 일마감 재계산은 **근본 아키텍처 변경**
>
> **구조 과제** ① 재계산 referent 부재 ② 전역 vs 카테고리별 불일치 (레거시=전역 1토글, S4 `default_pre_change`=카테고리별)

⟹ **재계산 토글은 이 트랙의 범위가 아니다.** 보류가 확정된 별건이다.

## 이 트랙이 다루는 좁은 표면

#773 정찰은 `DailyClosingService`(집계·lock)를 봤다. **`MonthEndCloseService` 는 다르다.**

```java
// MonthEndCloseService:238, 282, 316
List<DailyProductLine> products = revalidateProductLines(byModel, date);
// :357-398 → loadApplicablePrices(matchedProductIds, asOf)
//            계약: effectiveDate <= asOf 인 최신 price_history
```

`DailyProductLine` 은 `DailyClosingDetailResponse` 의 일부 — **일마감 상세 화면의 품목별 라인**이다. 합계는 stamp 값을 쓰지만 **상세의 품목 단가는 `asOf` 로 재조회해 표시**한다.

`ProductSheetSyncService:89` 가 그 `price_history` 를 **하드코딩 `2026-04-01`** 로 적재하므로:

| | 4~6월 전표 |
|---|---|
| 주문서가 실제로 쓴 단가 | **인상 전** (`price_change_schedule` = 2026-07-01) |
| 일마감 상세가 표시하는 단가 | **인상 후** (`price_history` = 2026-04-01) |

실 DB 실측: `price_history` 는 `2000-01-01` 1,082행 · `2026-04-01` 1,121행. `price_change_schedule` 은 4 카테고리 전부 `2026-07-01`.

## 📌 개발책임자 결정 (2026-07-29)

1. **조회 대상 = 카테고리별 기존 설정** `price_change_schedule.default_pre_change`. 신규 스키마·화면 없음
2. **별도 트랙으로 지금 착수**. #984 #985 뒤 직렬화

## 불변식

1. **일마감 상세가 표시하는 품목 단가는, 그 전표가 실제로 사용한 단가와 같아야 한다.**
2. 기본/`_단가인상` 선택 근거는 **날짜 상수가 아니라 설정 조회**여야 한다.
3. 합계(stamp 값)는 건드리지 않는다 — 재계산은 이 트랙 범위 밖이다.

## 선행 과제

`revalidateProductLines` 는 **모델 단위**인데 설정은 **카테고리 단위**다. #773 이 지적한 *"`DailyClosing` 에 카테고리 축 부재"* 가 여기에도 걸린다. 모델 → 카테고리 매핑이 선행돼야 하며, 매핑 실패 시 거동을 정해야 한다.

## 격리 조건

`services/accounting-service` · `services/product-service` 를 건드리므로 **Docker 스택·DB 를 공유**한다. #984 #985 가 끝난 뒤 **직렬로만** 실행한다 — 동시에 돌리면 이미지가 서로 덮이고 상대 검증이 무효가 된다(2026-07-29 실측).
