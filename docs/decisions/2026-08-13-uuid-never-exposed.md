# UUID 는 무엇이든 비공개 — 오직 서버 PK 로만 (개발책임자 결정)

> 2026-08-13 · *"UUID는 무엇이든 비공개 대상. 오직 서버에서 PK로 사용."*

## 정본

**어떤 UUID 도 사용자에게 나가지 않는다.** 화면·URL·API 요청·API 응답 전부 포함.
UUID 는 **서버 내부에서 PK/조인 키로만** 쓴다.

⟹ 판별 기준이 *"이게 DB 식별자인가"* 가 아니라 **"UUID 형태가 사용자 경계를 넘는가"** 다.

## 🔴 이 결정이 뒤집는 PM 판단 2건

| PM 판단 | 정정 |
|---|---|
| collab `presence` 의 `sessionId` 는 **클라이언트가 생성한 상관키라 비대상** | ❌ **대상이다.** 클라이언트 생성이든 서버 생성이든 UUID 형태면 가린다 |
| 거래처·제품 id UUID 는 선재 결함이라 **별도 트랙으로 분리** | 분리 자체는 유효(작업 단위 문제)하나 **"대상이 아니다" 가 아니라 "아직 안 했다"** 로 다뤄야 한다 |

🔑 PM 은 *"DB 식별자가 아니므로 비공개 원칙 대상이 아니다"* 로 두 번 판단했고 **둘 다 틀렸다.**
업무 의미를 데이터 성격에서 추론한 것이고, 그러면 안 된다([[feedback_business_meaning_needs_confirmation_not_inference]]).

## 적용 대상 — 2026-08-13 라이브QA 실측으로 확인된 잔여 노출

```
GET  /slips/price-memory?partnerId=<UUID>&productId=<UUID>
GET  /admin/partners/search        응답 data.items[].partnerId
GET  /slips/lookup-product         응답 data.id
POST /slips/price-memory/bulk      요청 partnerId · productIds[]
POST /slips/estimates              요청 partnerId · lines[].productId
collab/presence · presence/join · presence/leave   요청·응답 sessionId
```

## 🚨 구현 시 반드시 지킬 것 — 오늘 실측한 함정

**응답만 opaque 로 바꾸면 정상 경로가 막힌다.** `#1189` 에서 창고 id 를 응답만 바꿨더니 소비 경계가 `UUID` 로 남아 **정상 동작 8종이 HTTP 400**이 됐다(신규 생성 4/4 포함). 되돌리고 응답·요청을 같은 라운드에서 함께 바꿔 해결했다.

```
① 응답과 소비 경계(요청 DTO · @RequestParam · @PathVariable · 클라이언트 비교)를 **같은 라운드에서 함께**
② decoder 는 raw UUID 도 먼저 받는다 — 기존 링크·저장값이 계속 동작해야 한다
③ 클라이언트가 두 값을 비교·매칭하는 곳은 양쪽이 같은 형태여야 한다
   (안전재고 필터가 opaque 선택값과 raw 응답을 비교해 결과가 잘못 0건이 된 실측이 있다)
④ sweep 축은 파일명이 아니라 **"그 id 를 요청에 싣거나 응답에서 읽어 비교하는 곳 전부"**
   ([[feedback_sweep_by_assertion_not_filename]])
⑤ sessionId 처럼 **클라이언트가 생성해 보내는 값**은 서버가 발급하는 구조로 바꾸거나
   클라이언트도 같은 opaque 를 쓰도록 함께 바꿔야 한다 — 응답만 바꾸면 자기 세션을 못 알아본다
```

## 이미 있는 정본 (재사용 · 새 방식 발명 금지)

```
services/slip-service/.../web/dto/OpaqueUuidSerializer.java · OpaqueUuidDeserializer.java
services/slip-service/.../config/SlipOpaqueUuidPathConverter.java
services/inventory-service/.../config/InventoryOpaqueUuidPathConverter.java   (2026-08-13 신설)
services/product-service/.../web/dto/OpaqueUuidSerializer.java
services/notification-service/.../web/dto/OpaqueUuidCodec.java
services/slip-service/src/test/.../it/OpaqueUuidTestDecoder.java              (테스트용 디코더)
```
