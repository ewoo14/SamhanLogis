# 트랙 개설 — `#826` '주문서 관리(이관)' 메뉴 제거

> 2026-08-10 개설. **개발책임자 지시로 차단 판정을 뒤집었습니다.**

## 📌 개발책임자 결정 (2026-08-10)

> *"주문서 메뉴가 2개인데 뒤에 (이관)이라고 되어있는 부분이 걸려서 그래. 가급적 해당 메뉴는 삭제하기를 원해."*

## 🚨 차단 판정을 왜 뒤집었나 — PM 재측정

2026-07-24 정찰이 *"Step A 미수행 ⟹ 착수 불가"* 로 적었고 제가 그대로 옮겼습니다. **"미수행" 과 "할 것이 없음" 은 다릅니다.**

```text
2026-08-10 재측정
  accounting_db.orders              0행     ← 이관 대상 자체가 없다
  partner_order_db.partner_orders   2,025 (활성 4)
```

차단 근거는 런북 `:26` 의 *"Step A 전량 이식·검증 완료 전 절대 금지 — **미편입분 사용자 접근 손실**"* 입니다.
⟹ **미편입분이 0행이면 잃을 접근이 없습니다.**

## 제거 대상 경로 (PM 실측)

```text
메뉴    주문서 관리 (이관)                AppLayout.tsx:749-755
라우트  /accounting/admin/orders          routes/index.tsx:1210
        /accounting/admin/orders/:orderNo routes/index.tsx:1218
권한    pageCode "ecount.mig14.order-list"
화면    OrderListPage · OrderDetailPage
API     AccountingAdminQueryController:43 GET /orders
        AccountingAdminQueryController:57 GET /orders/{orderNo}
DB      accounting_db.orders = 0행
```

## 정찰이 확정할 것

1. 🚨 **`accounting_db.orders` 가 정말 0행인지 재확인**하고 SQL 원문을 남기십시오. 착수 시점에 데이터가 생겼으면 판정이 달라집니다.
2. `OrderListPage` · `OrderDetailPage` 를 **다른 라우트도 쓰는가**. 쓰면 컴포넌트는 남겨야 합니다.
3. `pageCode "ecount.mig14.order-list"` 를 **권한 매트릭스에서 제거할 것인가 남길 것인가**. 🚨 권한 축은 계약테스트가 exact 로 단정하는 곳이라(`feedback_permission_contract_needs_exact_bits`) 제거하면 그 테스트도 함께 봐야 합니다.
4. 🚨 **이식 메커니즘은 남길 것인가** — `Mig8OrderImportService` · `AccountingMig8OrderInternalController` · `EcountOrderImportController` 는 PR #522 가 만든 이식 수단입니다. 메뉴를 지워도 **메커니즘까지 지울지는 별개 판단**입니다.
5. 네이티브 `주문서 관리`(`/sales/partner-orders`)가 **정상 동작하는지** 확인 — 지우는 쪽이 아니라 남는 쪽을 먼저 봐야 합니다.

## 🚨 잃으면 안 되는 것

```text
네이티브 주문서 관리(/sales/partner-orders) 가 그대로 동작한다
권한 계약 테스트가 깨지지 않는다
이식 메커니즘을 지운다면 그 결정이 기록된다
```

연관 Issue: #826
