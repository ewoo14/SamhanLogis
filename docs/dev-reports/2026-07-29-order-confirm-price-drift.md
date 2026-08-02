# 주문 확정 단가 드리프트 — 고정DC 가 서버에 도달하지 않는다

- 일자: 2026-07-29 (회사PC)
- 발견 경로: #874 정찰이 범위 밖으로 남긴 관찰 → 별도 트랙에서 실측
- 관련: #874 · `dc-config-service` · `partner-order-service`

## 1. 무엇이 틀렸나

**같은 서버가 같은 품목·거래처에 두 값을 냅니다.**

```text
FE 부트스트랩 표시 단가   15,979,260원   (= list 29,053,200 × (1 − 고정DC 0.45))
서버 확정 저장 단가       15,107,664원   (= list 29,053,200 × (1 − 전역DC 0.48))
차이                        871,596원
```

- 품목 `AM360AXVHHR1SY` · 거래처 `1068689215` · 주문 `2026/07/29-1`
- `POST /confirm` 200 + `partner_order_db` 저장까지 확인
- 옵션 all-false 누락 효과는 별도로 **70,000원** 확인

PM 이 직접 재현했습니다 — 부트스트랩 재호출 시 `price=15979260 · list=29053200 · 고정DC=45.0`, 시트 sync 후에도 동일.

## 2. 용어 정리 (2026-07-29 개발책임자 지적으로 확정)

이 저장소의 할인 3종입니다. **"약정DC" 는 이 저장소의 용어가 아닙니다.**

| 이름 | 저장 위치 | 무엇 |
|---|---|---|
| **고정DC** | `products.fixed_discount_rate` (품목별) | 품목에 박힌 할인율. `null` 이면 전역DC 영향 품목 |
| **전역DC** | `dc_configs` (거래처별 활성 1행) | `home_discount_rate`/`commercial_discount_rate` + 옵션 정액 6종 + 반올림 |
| **기본 할인율** | `partners` (`V6__add_partner_4tab.sql:27`) | 거래처 마스터의 단일 할인율. 위 둘과 별개 |

`약정`은 이 저장소에서 **`agreeTerm`(거래 약정 조건 — 전표의 자유 입력 텍스트, `V16__add_slip_ecount_schema.sql:23`)** 을 뜻하며 할인과 무관합니다.
⚠️ 코드에도 잘못된 용어가 남아 있습니다 — `DiscountRevalidator.java:52,123` 주석 2곳. 이 PR 에서 함께 정정합니다.

## 3. 📌 개발책임자 결정 (2026-07-29)

> **품목 고정DC 가 당연히 우선이다. 코드를 보면 알 수 있다.**

코드가 실제로 그렇습니다:

```js
clients/web/order-app/index.html:2728    const useRate = (fixedDc ?? rate);
clients/web/order-app/index.html:2851    const useRate = (fixedDc ?? globalRate);
```

**고정DC 가 있으면 그것, 없으면 전역DC.** 견적 앱도 같은 규칙입니다.

## 4. 원인 — 서버는 이 규칙을 표현할 수단이 없다

| 지점 | 내용 |
|---|---|
| `DcConfigClient.java:118-123` | dc-config 요청에 옵션 6종을 **리터럴 `false`** 로 넣음 (`is360` `is4Way` `is1Way` `isStand` `isDeluxe` `isFirstGrade`) |
| `PartnerOrderConfirmService.java:130-155` | `PriceLine` 에 싣는 것은 `lineId · modelCode · listPrice · category · quantity` 뿐 — **고정DC 가 아예 없음** |
| `dc-config-service` 전체 | **`고정DC`/`fixedDiscount` 개념이 존재하지 않음** (grep 0매치) |

⟹ 마지막 줄이 뿌리입니다. 서버는 고정DC 를 **받지도, 표현하지도** 못합니다. 그래서 항상 전역DC 만 적용되고, 고정DC 가 걸린 품목마다 표시값과 확정값이 갈립니다.

## 5. 불변식

1. **주문서 화면이 보여준 단가와 확정 후 저장된 단가가 같다**
2. **고정DC 가 있으면 고정DC 가 적용되고, 없으면 전역DC 가 적용된다** (`fixedDc ?? globalRate` 와 같은 결과)
3. 가격 계산에 필요한 입력(옵션 구분·고정DC)이 계산 서비스에 **실제 값으로** 도달한다 — 상수로 고정되지 않는다
4. 계산 실패·무응답 시의 기존 fail-soft 동작이 더 나쁜 쪽으로 바뀌지 않는다
5. 고정DC 가 없는 평범한 품목의 확정 단가가 이 변경으로 달라지지 않는다

## 6. 검증 계획

- **RED-first** — 고정DC 가 걸린 품목의 표시값 ≠ 확정값을 재현하는 실패 테스트 먼저
- **fixture 는 실 경로가 만들 수 있는 상태만** — 부트스트랩이 실제 반환하는 형태(고정DC 45.0 이 실린 품목)
- **라이브QA** — 실서버 확정 재현으로 표시값 == 확정값 확인
- **계열 sweep** — 고정DC 가 걸린 품목이 몇 건인지 세고, 표본이 아니라 전수로 확산 범위 확인

## 7. 이 문서가 다루지 않는 것

- 견적(estimate) 경로 — 주문 확정 경로만
- `dc_configs` 의 할인 정책 자체
- 이카운트 품목 임포트 (PR #984 별도 트랙)
