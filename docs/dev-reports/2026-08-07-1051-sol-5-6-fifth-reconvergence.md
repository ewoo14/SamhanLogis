# PR #1082 · 이슈 #1051 — CODEX SOL 5.6 5차 재수렴

- 검증 HEAD: `0f0086452cb8a32b8f97318d0d9bf4ad80a8ec86`
- 검증 시각: 2026-08-07 KST
- 판정 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 판정: **없음 — 도달 결함 0건, 증거 무결성 위반 0건**
- 조건: `partner-order-service`의 V16을 예약한 PR #1097이 이 PR보다 먼저 머지되어야 한다.

라이브 컨테이너에는 어떤 PUT/POST/DELETE도 보내지 않았고 DB에는 읽기 전용 transaction의
SELECT만 실행했다. 컨테이너 재빌드·재시작과 다른 서비스 테스트도 실행하지 않았다.

## 1. 첫 각도 — 차단되면 안 되는 것 / 통과하면 안 되는 것

### 1.1 V17 적용 대상 실측

공유 `partner_order_db`의 적용 최고 migration은 V14이고 아직 `amount_authority` 컬럼은 없다.
V17 적용 전 행을 읽기 전용으로 센 원문은 다음과 같다.

```text
total_all | active | deleted | sv_both_null_all | sv_both_null_active | sv_partial_active | sv_both_present_active
----------+--------+---------+------------------+---------------------+-------------------+-----------------------
2060      | 2052   | 8       | 2052             | 2049                | 0                 | 3

no_sv_price_total_match | no_sv_price_total_mismatch | no_sv_null_core
------------------------+-----------------------------+----------------
2049                    | 0                           | 0
```

따라서 PM이 보지 않았던 활성 S/V-null 2,049행은 **전부**
`subtotal = price_vat × quantity`이다. PRICE backfill로 합계가 바뀌는 행은 0건이다.
삭제행까지 포함하면 V17은 2,060행 모두에 `PRICE`를 심으며, 기존 필수 금액·수량 null 때문에
NOT NULL 전환이 막힐 행도 0건이다.

V17은 컬럼을 추가할 때 `DEFAULT 'PRICE'`를 설정하고 그 default를 제거하지 않는다. 따라서
V17 이후에도 컬럼을 생략하는 구 native insert는 DB default로 PRICE를 받아 NOT NULL에
막히지 않는다. JPA 신규 저장 경로는 모두 `PartnerOrderLine.create(...)` 또는
`createFromAuthoritativeAmounts(...)`로 수렴하고 두 경로 모두 non-null authority를 설정한다.

**실 데이터 차단 건수: 0 / 잘못 통과해 금액이 바뀌는 건수: 0.**

### 1.2 PM의 S/V 3행 실측 정정 여부

정정 없음. 활성 S/V-present 3행 모두 PRICE 파생 S/V와 일치했고 partial S/V는 0행이다.
`splitVatInclusive`의 DOWN 결과를 적용했을 때 1,800,000원의 공급가액은 1,636,363원이며
저장값과 같다.

## 2. 권위별 GET→편집→PUT 왕복

실 화면은 GET의 `supplyAmount`·`vatAmount`·`lineTotal`·`authority`를 편집 상태에 보존하고
PUT에 그대로 돌려보낸다. 서버는 기존 라인의 authority 변경을 거부하고, authority가 생략되면
영속된 기존 authority를 사용한다.

요청한 네 권위 × 세 편집 축을 모두 대입한 결과는 다음과 같다.

| 권위 | memo-only | 수량 변경 | 납품가 변경 |
|---|---|---|---|
| PRICE | 성공, 전 금액·권위 보존 | 성공, 새 `수량×납품가`로 S/V/T 재계산 | 성공, 새 납품가로 S/V/T 재계산 |
| SUPPLY | 성공, 전 금액·권위 보존 | 성공, S 고정·V/T 및 파생 단가 유지/재산출 | 파생 단가만 바꾸는 요청이므로 422, 주문 불변 |
| VAT | 성공, 전 금액·권위 보존 | 성공, S/V/T 고정·파생 단가 재산출 | 파생 단가만 바꾸는 요청이므로 422, 주문 불변 |
| TOTAL | 성공, 전 금액·권위 보존 | 성공, T 고정·S/V 및 파생 단가 재산출 | 파생 단가만 바꾸는 요청이므로 422, 주문 불변 |

V17 직후 실 데이터의 권위 분포는 활성 2,052행 전부 PRICE다. 따라서 현재 실 사용자가
화면의 납품가 편집을 시도해 비-PRICE 가드에 막히는 주문 라인은 **0행**이다.
SUPPLY/VAT/TOTAL은 현재 운영 성공 경로에서 생성되지 않는다. 이후 실제 estimate adapter가
연결되어 비-PRICE 주문이 생성되는 시점의 화면 정책은 이번 판정 대상이 아니다.

반대 방향도 닫혀 있다.

- 기존 authority를 다른 값으로 바꾼 PUT은 422이고 교체 저장 전에 차단된다.
- authority 없이 기존 S/V/T를 바꾼 PUT은 422이고 주문은 불변이다.
- authority 없이 `lineTotal`만 공격값으로 바꾸면 기존 PRICE가 선택되어 공격값이 저장 합계를
  결정하지 못한다.

## 3. revision 복원

현재 revision 2,012건의 스냅샷 라인 2,017개를 읽기 전용으로 전수 계산했다.

```text
snapshot_lines | sv_absent | sv_present | sv_partial | price_total_match | price_total_mismatch | split_match | split_mismatch
---------------+-----------+------------+------------+-------------------+----------------------+-------------+---------------
2017           | 2006      | 11         | 0          | 2017              | 0                    | 11          | 0

authority 필드를 가진 과거 revision: 0건
```

legacy snapshot은 authority가 없으므로 PRICE로 복원되지만, 전 라인이 이미 PRICE 계산과
일치한다. 복원으로 T가 바뀌는 라인 0개, S/V가 바뀌는 라인 0개다.

새 snapshot은 `LineSnapshot.from`이 영속 authority를 함께 캡처하고 `restoreLine`이 같은
authority와 S/V/T를 생성기에 되돌린다. 따라서 새 revision은 복원 전후 권위와 계산 결과가
같고, legacy revision도 실 데이터에서는 결과가 같다.

## 4. 생성·확정·GET·전표 전환

### 견적→주문 생성

`PartnerOrderFromEstimateService`는 금액 snapshot이 없으면 PRICE를, 있으면 snapshot의
PRICE/SUPPLY/VAT/TOTAL을 그대로 심고 GET은 영속된 값을 그대로 반환한다.

다만 현재 운영 bean인 `FixtureEstimateClient.findById`는 항상 `Optional.empty()`를 반환한다.
따라서 `/from-estimate/{estimateId}`에는 현재 성공하는 실 사용자 경로가 없고, 이 경로 때문에
새로 차단되거나 잘못 통과하는 실 데이터 건수는 0건이다.

### 확정

`PartnerOrderConfirmService`는 DC 최종 VAT 포함 단가로 `PartnerOrderLine.create(...)`를
호출하므로 PRICE를 심는다. `PartnerOrderDetailResponse`는
`line.getAmountAuthority().name()`을 반환하므로 확정→GET은 PRICE 그대로다.

### 전표 전환

`PartnerOrderConvertService`는 authority 컬럼을 분기 조건으로 사용하지 않는다. 기존과 같이
라인의 `priceVat`을 `unitPriceVat`으로 보내고, 성공 후 `convertedQuantity`만 누적한다.
V17은 기존 전환 가능 행의 productId·수량·잔여수량·단가를 바꾸지 않으므로 authority 추가로
전환이 차단되거나 추가 통과하는 실 행은 0건이다.

## 5. R2·R3 폐쇄 표면 회귀

- **D3-1:** S/V 저장 주문의 memo-only 왕복은 authority가 GET에 포함되고 PUT에서 보존되어
  422가 아니다. 활성 S/V 3행도 V17 후 PRICE로 왕복한다.
- **D3-2:** 품목 신원이 같은 기존 라인은 저장된 productId를 먼저 보존하고 catalog lookup은
  fail-soft다. product-service 장애가 기존 라인의 memo 저장을 막지 않는다.
- **lineTotal-only:** authority 없는 임의 lineTotal은 PRICE 계산의 입력이 아니므로 저장 합계를
  바꾸지 못한다.

## 6. migration 번호

전제는 맞다.

```text
현재 브랜치 partner-order migration: V1 ... V15, V17
공유 DB 적용 최고: V14
PR #1097: OPEN / CLEAN / MERGEABLE
PR #1097 파일: services/partner-order-service/src/main/resources/db/migration/
               V16__soft_delete_test_seed_orders.sql
```

그러므로 **#1097을 먼저 머지한 뒤 #1082를 머지해야 한다.** 순서를 뒤집으면 나중에 추가되는
V16이 이미 적용된 V17보다 낮아져 기본 Flyway 순차 적용 전제를 어긴다. 번호 자체를 바꿔야
한다는 증거는 없으며, 제시된 선행 머지 조건 아래 V17이 옳다.

## 7. 증거 무결성

PM의 `501 tests / 0 failures`를 캐시 없이 재실행했다.

```text
.\gradlew.bat :services:partner-order-service:test --rerun-tasks --no-daemon --console=plain
BUILD SUCCESSFUL in 2m 39s
15 actionable tasks: 15 executed

JUnit XML 합산:
xml_files=78 tests=501 failures=0 errors=0 skipped=0
```

PM이 제시한 테스트 수와 실패 수는 재현됐다. PM이 제시한 현재 S/V 3행의 DOWN 계산도
재현됐다. 원문/실측으로 제시된 수치의 불일치는 찾지 못했다.

## 8. fix 지시서 — 불변식만

이번 라운드에는 도달 결함이 없어 추가 fix를 지시하지 않는다. 재수렴을 유지해야 하는 불변식은
다음과 같다.

1. 모든 영속 주문 라인은 생성·GET·편집·PUT·revision 복원 전 과정에서 정확히 하나의 금액
   권위를 가지며 그 권위가 조용히 바뀌지 않아야 한다.
2. 기존 행의 migration은 저장 S/V/T와 주문 합계를 바꾸지 않아야 하고 정상 생성·수정·전환을
   차단하지 않아야 한다.
3. memo-only 왕복은 수량·납품가·S/V/T·권위·품목 신원을 모두 보존해야 한다.
4. 권위 없는 금액 변경과 기존 권위 변조는 주문 전체를 불변으로 남겨야 한다.
5. revision 복원 후의 권위와 권위별 계산 결과는 snapshot 시점과 같아야 한다.
6. #1097의 V16이 적용되기 전에 이 PR의 V17이 적용되어서는 안 된다.

## 9. 양방향 RED

### 정상 방향 RED

1. 기존 PRICE 라인 GET→memo-only PUT→GET: 200, 권위·수량·납품가·S/V/T 불변.
2. 기존 PRICE 라인 수량 또는 납품가 변경: 200, PRICE 항등식으로 재계산.
3. SUPPLY/VAT/TOTAL 라인 memo-only와 수량 변경: 200, 각 권위값과 권위 불변.
4. 새 revision 캡처→복원→GET: 캡처 전후 authority와 S/V/T 동일.
5. 확정→GET: PRICE가 저장·반환되고 전표 전환 가능성 불변.

### 공격 방향 RED

1. 기존 라인의 authority만 다른 값으로 변조: 422, 주문 전체 불변.
2. authority 없이 S/V/T 중 하나를 변조: 422, 주문 전체 불변.
3. authority 없이 lineTotal만 공격값으로 변조: 공격값이 저장 합계를 바꾸지 못함.
4. SUPPLY/VAT/TOTAL에서 권위값은 그대로 둔 채 파생 납품가만 변조: 422, 주문 전체 불변.
5. null/미지원 authority로 신규 저장을 시도: 영속 null authority가 생기지 않음.

## 10. 이번 라운드가 보지 않은 것

- 다른 서비스의 테스트와 동작
- 라이브 컨테이너에 대한 모든 쓰기 재현 — 명시적 금지에 따라 수행하지 않음
- 컨테이너 재빌드·재시작 및 V17의 공유 DB 실제 적용 — 현재 공유 DB는 V14
- 향후 실제 `EstimateClient` HTTP adapter가 연결된 뒤의 비-PRICE 화면 UX
- 동시성·성능·보안 등 amount authority 도달성과 무관한 표면
- 테스트 강도, mock 품질, 문서 과장, 가드 완전성 등 이번 게이트에서 명시적으로 제외된 검증 품질
