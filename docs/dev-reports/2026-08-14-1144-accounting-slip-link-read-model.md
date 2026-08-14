# #1144 공통 회계전표 연결 read model · eligibility

## 범위

원 판매/구매전표 한 건을 기존 allocation과 create-attempt 정본으로 읽어 다음을 한 응답에서 제공하는 기반을 추가했다.

- 생성 가능 여부와 차단 사유
- 원천/배분/잔여 수량·금액
- 연결 회계전표 번호·상태
- 세금계산서 연결 상태

생성·수정 orchestration, migration, 업무 데이터 변경은 포함하지 않았다.

## 계약 형태

`GET /accounting/slip-links/eligibility`가 opaque source token과 `OUTBOUND`/`INBOUND`를 받아 `AccountingSlipLinkEligibilityResponse`를 반환한다.

`AccountingSlipLinkReadModel`의 사용자 표시 값은 전표번호·상태·금액·수량뿐이며 UUID는 응답에 담지 않는다. `remainingAmount()`와 `remainingQuantity()`는 원천 합계에서 활성 allocation 합계를 차감한다. 세금계산서 상태는 연결된 회계전표의 `tax_invoice_id` 존재 여부로 `LINKED`/`NOT_LINKED`를 산출한다.

## RED 원문

생산 코드 변경 전 다음 테스트가 실패했다.

```text
AccountingSlipLinkEligibilityRedTest > UUID_only_원천행은_조용히_누락되지_않고_데이터무결성_차단으로_구분된다() FAILED
    java.lang.AssertionError at AccountingSlipLinkEligibilityRedTest.java:43

AccountingSlipLinkEligibilityRedTest > legacy_미연결_전표는_생성가능이_아닌_읽기전용으로_구분된다() FAILED
    java.lang.AssertionError at AccountingSlipLinkEligibilityRedTest.java:29

2 tests completed, 2 failed
```

원인은 legacy 상태를 별도로 판정하지 않았고 UUID-only를 일반 거래처 코드 누락으로만 반환했기 때문이다.

## GREEN 원문

최소 eligibility 보완 후:

```text
BUILD SUCCESSFUL
AccountingSlipLinkEligibilityRedTest: 2 tests completed, 0 failed
```

read model/eligibility/controller/N:M 관련 테스트 묶음도 모두 성공했다.

## 불변식별 근거

1. 공통 판정: controller가 단일 `AccountingSlipLinkReadModelService`와 `AccountingSlipEligibility`를 호출한다.
2. UUID 비공개: response/read model은 source/accounting slip 번호를 반환하고 UUID를 필드로 포함하지 않는다. controller 테스트가 opaque token의 내부 UUID 비노출을 확인한다.
3. legacy/UUID-only: `LEGACY_READ_ONLY`와 `SOURCE_DATA_INTEGRITY_BLOCKED`를 별도 eligibility reason 및 read model flag로 반환한다. 생성 가능은 false다.
4. 성능: allocation repository는 원천 전표별 1회 조회한다. 쿼리는 allocation→line→slip의 단일 연관만 fetch하며 컬렉션 복수 fetch를 하지 않는다. N:M 테스트에서 allocation 2행을 회계전표번호 1행으로 deduplicate하고 repository 호출 1회를 검증했다.
5. 권한: controller에 `accounting.sales-slip.accounting` VIEW permission guard를 추가했고, 내부 role 판정은 ACCOUNTANT/MANAGER/MASTER만 허용한다. 다만 구매 전용 page permission을 같은 generic endpoint에서 별도 판정하는 라이브 검증은 아직 관측하지 못했다.

## UUID-only 실측 범위

정찰 기준선의 실제 수치는 활성 `slips` 9건, 활성 `tax_invoices` 13건이다. 이번 테스트에서는 UUID가 있고 `partnerCode`가 빈 `INBOUND` snapshot을 실제 계약 서비스에 넣어 전표번호를 유지한 채 `dataIntegrityBlocked=true`와 `allowed=false`가 되는 것을 실측했다. 공유 DB의 9/13 전수 결과를 이번 실행에서 재조회할 psql/browser 관측면은 없었으므로 전수 DB 수치에 대한 새 실행 증거로 주장하지 않는다.

## legacy 19건 및 라이브 QA

정찰 기준선의 미연결 세금계산서 19건은 현재 스키마에서 원천 slip과 직접 연결하는 공통 키가 보이지 않는다. 따라서 source-centric endpoint가 그 19건 각각을 식별해 `LEGACY_READ_ONLY`로 매칭했는지는 관측 불가이며, 이번 구현은 명시적으로 legacy 상태를 전달받는 read model/eligibility 경로만 고정했다.

실행 중 local service port는 확인했지만 현재 세션에 사용 가능한 in-app browser가 없어 실제 회계 화면 Playwright QA와 실행 캡처를 수행하지 못했다. 캡처 PNG와 SHA-256 중복 검증은 생성하지 않았으며, 해당 항목은 통과로 세지 않는다.

## 검증 명령

- `./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.AccountingSlipLinkEligibilityRedTest --no-daemon` — RED 후 GREEN
- `./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.AccountingSlipLinkEligibilityTest --tests com.samhanair.logis.accounting.service.AccountingSlipLinkEligibilityRedTest --tests com.samhanair.logis.accounting.web.AccountingSlipLinkControllerTest --no-daemon` — 성공
- `./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.AccountingSlipLinkReadModelServiceTest --no-daemon` — 성공
- 전체 `:services:accounting-service:test --no-daemon` — 120초 제한으로 완료 결과 관측 불가
