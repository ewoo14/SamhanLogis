# PR #1060 / 이슈 #1015 R16 — 주문·출고 활동 키 정합성 fix

- 대상: `feat/1015-order-app-access`, HEAD `ea88d1bbf`
- 수정 범위: partner-auth 활동 조회 키, partner-order/slip 활동 repository query, 회귀 테스트
- 제약: Git 조회만 수행, 공유 DB `SELECT`만 수행, Flyway/DDL/Docker image rebuild 없음

## 결론

auth가 downstream에 전달하는 값은 사용자 화면용 UUID가 아니라 canonical 사업자번호(`bizNo`, 하이픈 제거)다. 기존 downstream query는 이 값을 `partner_code`와 exact-match하여, 실제 주문의 `biz_code`와 출고의 `business_number`를 찾지 못했다.

이번 fix는 다음으로 정합성을 맞춘다.

- `PartnerAuthService`와 `PartnerApprovalService`는 활동 reader에 `getPartnerCode()`가 아닌 `getBizNo()`를 전달한다.
- 주문 활동은 `replace(partner_orders.biz_code, '-', '')`로 조회한다.
- 출고 활동은 `replace(slips.business_number, '-', '')`로 조회한다.
- 내부 응답에는 기존처럼 UUID·상세·개인정보를 포함하지 않는다.
- 조회 자체의 실패/응답 null은 기존 `PartnerActivity`의 incomplete 상태와 `deferred` 흐름을 그대로 유지한다.

정확히 30일은 `isBefore` 경계를 그대로 보존했다. 생산 코드의 세 경로와 보류 처리는 이 라운드에서 재설계하지 않았다.

## RED-first 증거

### `[DEV-SEED/단위 fixture]` 주문

fixture는 다음을 의도적으로 분리했다.

```text
partner_code = P-2026-0001
biz_code     = 211-87-12345
조회 입력    = 2118712345
```

수정 전 실행:

```text
PartnerOrderActivityRepositoryTest > activityLookupFindsConfirmedOrderByAuthBusinessNumberWhenPartnerCodeDiffers() FAILED
    org.opentest4j.AssertionFailedError at PartnerOrderActivityRepositoryTest.java:43

1 test completed, 1 failed
BUILD FAILED
```

### `[DEV-SEED/단위 fixture]` 출고

동일한 key 분리를 `partner_code`와 `business_number`에 적용했다.

수정 전 실행:

```text
SlipActivityRepositoryTest > activityLookupFindsOutboundSlipByAuthBusinessNumberWhenPartnerCodeDiffers() FAILED
    org.opentest4j.AssertionFailedError at SlipActivityRepositoryTest.java:48

1 test completed, 1 failed
BUILD FAILED
```

두 실패는 테스트 오류가 아니라 기존 exact-match가 활동 시각/일자를 찾지 못한 결과다.

## 구현 후 검증

```text
:services:partner-order-service:test --tests com.samhanair.logis.partnerorder.repository.PartnerOrderActivityRepositoryTest
BUILD SUCCESSFUL

:services:slip-service:test --tests com.samhanair.logis.slip.repository.SlipActivityRepositoryTest
BUILD SUCCESSFUL

:services:partner-auth-service:test --tests OrderAppAccessPreviewTest --tests PartnerAuthServiceAccessSetTest
BUILD SUCCESSFUL
```

추가한 fixture 테스트는 모두 GREEN이며, auth 테스트는 reader 입력을 `bizNo` 기준으로 정정했다. 기존 strict `<` 경계와 downstream 실패 보류 테스트는 변경하지 않았다.

## 도달성 측정 — fix 전/후

### `[실데이터/로컬 read-only]` 주문 원문

명령:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_order_db -c "BEGIN READ ONLY; SELECT COUNT(*) AS active_orders_total, COUNT(*) FILTER (WHERE partner_code = '2118712345') AS before_exact_key_rows, COUNT(*) FILTER (WHERE replace(biz_code, '-', '') = '2118712345') AS after_biz_key_rows, COUNT(*) FILTER (WHERE replace(biz_code, '-', '') = '2118712345' AND confirmed_at IS NOT NULL) AS after_biz_key_confirmed_rows, MAX(confirmed_at) FILTER (WHERE replace(biz_code, '-', '') = '2118712345') AS after_last_confirmed_at FROM partner_orders WHERE is_deleted = false; COMMIT;"
```

출력 원문:

```text
 active_orders_total | before_exact_key_rows | after_biz_key_rows | after_biz_key_confirmed_rows | after_last_confirmed_at
---------------------+-----------------------+--------------------+------------------------------+-------------------------
                2021 |                     0 |                  2 |                            1 | 2026-01-03 10:00:00
```

즉 `2118712345` 거래처는 기존 키로 0건, 수정 키로 2건(확정 시각 보유 1건)이다.

### `[실데이터/로컬 read-only]` 출고 원문

```text
 active_outbound_total | before_exact_key_rows | after_business_key_rows | after_last_outbound_date
-----------------------+-----------------------+-------------------------+--------------------------
                  2303 |                     0 |                       0 |
```

출고에는 이 사업자번호의 snapshot이 없어, 주문 결과를 출고 활동으로 대체하지 않았다.

### `[실데이터/로컬 read-only]` 잘못 차단되는 거래처 수

활동 키가 달라서 “활동 없음”으로 잘못 식별되는 auth 거래처는 **1곳**이다. 다만 현재 로컬 데이터에서 2026-08-08에 실제 차단 결과까지 달라지는 거래처는 **0곳**이다. 이유는 유일하게 매칭된 확정 주문의 시각이 `2026-01-03`이고, 정책의 baseline은 활동 시각과 auth 생성시각의 최댓값이기 때문이다.

```text
   biz_no   |       before_expires       |        after_expires       | before_would_block | after_would_block
------------+----------------------------+----------------------------+--------------------+-------------------
 2118712345 | 2026-08-08 07:25:53.085447 | 2026-08-08 07:25:53.085447 | f                  | f
```

이 수치는 “결함이 없다”는 의미가 아니라, 현재 로컬 snapshot에는 최근 활동이 있는 30일 초과 auth 행이 없다는 의미다. key 오판 자체는 1곳으로 재현·고정했다.

## 기존 오답 테스트 정정

파일: `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/OrderAppAccessPreviewTest.java`

- 기존 테스트는 `PartnerAuth.partnerCode`가 활동 reader 입력이라고 고정하고 있었다.
- `PartnerAuthServiceAccessSetTest.java:230`의 최근 활동 테스트도 `P007`을 입력으로 사용했다.
- 두 파일의 stubbing을 auth `bizNo`로 바꿔 production 호출 계약과 일치시켰다. 테스트의 활동 날짜/30일 경계 기대값은 바꾸지 않았다.

이번 fix 범위에서 `233건`·`77건`을 고정하는 테스트는 partner-auth test source에서 발견되지 않았다. 해당 수치는 이 워크트리의 기존 테스트 assertion이 아니라 이전 조사 문서/다른 슬라이스 수치로 확인했다.

## 신규 파일

- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/repository/PartnerOrderActivityRepositoryTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/repository/SlipActivityRepositoryTest.java`
- `docs/dev-reports/2026-08-03-1015-r16-activity-key-fix.md`
