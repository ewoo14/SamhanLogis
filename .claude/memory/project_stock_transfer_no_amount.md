---
name: project-stock-transfer-no-amount
description: 재고이동은 금액 개념이 없다 — 수량만 변동하고 재고수불부에만 반영된다 (2026-08-13 개발책임자)
metadata:
  type: project
---

2026-08-13 개발책임자:

> "재고이동은 굳이 금액이 있을 필요가 없는데... 어짜피 창고 간 재고이동이라서 재고만 서로 변동되고, 해당 내용이 재고수불부에만 반영이 되면 되거든."

## 업무 규칙

```
재고이동(StockTransfer) = 창고 간 이동
  · 금액·단가 개념 없음
  · 수량만 출발 창고 −, 도착 창고 +
  · 반영 대상은 재고수불부 하나
```

🔑 매출·매입 전표와 다르다. 전표는 금액이 회계로 흐르지만 **이동은 회계 이벤트가 아니다** — 회사 전체의 재고 총액이 변하지 않기 때문이다. 이동에 금액을 붙이면 없는 손익이 생긴다.

## 현재 구현은 이 규칙과 일치한다 (2026-08-13 PM 실측)

```java
// StockTransferLine.java — 금액 필드 없음
private UUID productId;
private int requestedQuantity;
private int shippedQuantity;
private int receivedQuantity;
private UUID sourceLotId;
private UUID destinationLotId;
```
```
// TransferFormPage.tsx:7
"이동전표는 단가/금액 개념이 없으므로 모델명 + 품목명 + 수량만 입력."
```
`StockTransfer` 본체에도 금액 컬럼이 없다. 화면에도 금액 열이 없다(재고이동 목록 = 이동번호·출발창고·도착창고·사유·상태·상세).

⚠️ 혼동 주의 — **재고실사(InventoryAudit)에는 `차이금액` 열이 있다.** 실사는 장부와 실물의 차이를 금액으로 평가하는 것이라 성격이 다르다. 화면이 인접해 있어(둘 다 구매 메뉴 아래) 스크린샷만 보면 헷갈리기 쉽다.

## 미확인 — 다음 세션에서 볼 것

**이동이 재고수불부에 실제로 반영되는가**는 확인하지 않았다. 화면상 `입출고 내역·분석` 메뉴가 존재하지만, 이동 확정 시 그곳에 행이 생기는지 실측이 없다.

```
확인 방법 = 재고이동 1건을 실 경로로 생성·확정한 뒤
           입출고 내역에 출발창고 출고행 + 도착창고 입고행이 함께 생기는지 본다
           (한쪽만 생기면 총 재고가 안 맞는다)
```

🚨 이 확인은 **표본 0 주의** — 확정 상태(`요청됨` 이후)까지 간 이동이 있어야 발화한다. [[feedback_home_office_seed_data_differs]]

## How to apply

재고이동 관련 기획·리뷰에서 **금액을 요구하는 요구사항이 나오면 그 자체가 신호**다. 반영해야 할 곳은 재고수불부 하나이고, 회계 분개를 만들면 안 된다.

[[feedback_business_meaning_needs_confirmation_not_inference]] — 이 규칙은 코드에서 추론한 것이 아니라 개발책임자가 직접 말한 것이라 권위가 있다.
