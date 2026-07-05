# #25 X-Is-System-Master 회귀 fix — 재고예약/해제·주문확정 서비스간 인가 (fix/25-x-is-system-master)

> #720 BE sweep 적발. C5-4(#415·2b62a6f07) 회귀로 재고예약/해제·주문확정 핵심 플로우 서비스간 호출이 이론상 403. @MockBean로 IT 은폐. **P0급 — 라이브 실증 동반.**

## 근본원인 (확정·정적 고신뢰)
- **C5-4(#415)**: `PermissionAspect.isMasterBypass`(PermissionAspect:164,306-310)를 **`X-Is-System-Master=="true"` 단독 판정**으로 전환(role==MASTER 폴백 제거·C5-4 주석 명시).
- **같은 커밋**이 3 client에서 `X-User-Role:MASTER` 제거하며 **`X-Is-System-Master:true` 미추가**(주석/코드 불일치 — partner-order InventoryClient 주석은 "X-Is-System-Master 단독 수행"이라나 헤더 없음):
  - `services/slip-service/.../client/InventoryClient.java`(reserve/release/deduct/inbound/instances·전표 accept/complete/reject/cancel 재고반영)
  - `services/partner-order-service/.../client/InventoryClient.java`(reserve/release)
  - `services/partner-order-service/.../client/SlipServiceClient.java`(from-partner-order/from-orders-merge)
- 대상 수신 endpoint(StockController reserve/release·SlipPublishController)는 `/internal/` 아님·`@RequirePermission` → PermissionAspect **account 모드**→X-User-Id=sentinel(00000000-...)→`DynamicPermissionClient.check` 정확매칭 grant 없음(auth 시드 grep 0건) → **이론상 항상 403**.
- **은폐**: 수신측 IT `AbstractPostgresIT`가 `@MockBean DynamicPermissionClient.check(any)→true` 전역 lenient stub → 모든 inventory IT 실 판정 우회(#720과 동일 결함계열·과거 P0 이력 0299191b6).
- **올바른 선례**: `inventory-service SlipClient:87` `.header("X-Is-System-Master","true")` 전송.

## 결정
- **D1**: 3 client에 `.header("X-Is-System-Master","true")` 추가(inventory SlipClient:85-87 패턴 정확 미러·X-User-Id INTERNAL_CALLER_ID 유지). role bypass 복원. C5-4 주석과 코드 일치화.

## 요구
1. **3 client 헤더 추가**: slip InventoryClient·partner-order InventoryClient·partner-order SlipServiceClient의 모든 write 호출부(.header 체인)에 `X-Is-System-Master:true`. 상수 정의(SYSTEM_MASTER_HEADER)·주석 정정.
2. **실-HTTP 계약 테스트**: 각 client가 X-Is-System-Master:true 헤더 전송하는지 **MockRestServiceServer**로 단언(@MockBean 우회 금지·[[feedback_restclient_contract_test_false_green]] 4체크). 기존 client 테스트 있으면 보강.
3. **라이브 QA(P0 실증)**: Docker·게이트웨이 :8080·dev_master → **전표 accept/complete(재고 예약/해제)·주문 확정** 실호출 → fix 前 **403 실증**(가능 시 pre-fix probe)·fix 後 **200/성공**. 재고 수량 실 반영·주문 상태전이 확인.

## 함정
- PermissionAspect C5-4 **단독 판정**(role 폴백 없음) — 헤더 미전송=403.
- 수신측 IT `@MockBean DynamicPermissionClient` lenient→실 판정 은폐(계약 테스트=발신측 헤더 shape만·수신 실판정은 라이브 QA로).
- inventory SlipClient=올바른 선례(정확 미러).
- 동종 계열 전수 sweep: 다른 서비스간 client도 X-Is-System-Master 필요한데 미전송 없는지 grep([[feedback_defect_family_sweep_fix]]).

## 검증
- BE: slip+partner-order+inventory 모듈 test·실-HTTP 계약(RED→GREEN).
- 라이브 QA: 재고예약(전표)·주문확정 실 플로우 성공(fix 前 403·後 200 실증)·스샷 2곳(SendUserFile+PR SHA-pinned).
