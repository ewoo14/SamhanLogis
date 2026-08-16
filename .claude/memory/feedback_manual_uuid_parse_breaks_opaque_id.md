---
name: feedback-manual-uuid-parse-breaks-opaque-id
description: 서비스 간 응답의 opaque id 를 UUID.fromString 으로 직접 파싱하면 500 이 난다 — Jackson 기본 UUIDDeserializer 는 그걸 이미 지원한다
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-15T22:05:04.281Z
---

2026-08-16 실측. **주문서웹 가격 미리보기가 500 이었고 원인은 파싱 방식 차이였다.**

```text
POST /api/v1/partner-orders/price-preview → 500 "product-service 호출 실패"
로그   ProductClient lookupByModelCodes failed:
       Invalid UUID string: wxgSs8TIQU-twN7k0kBODw
```

`product-service` 는 `ProductSummaryResponse.id` · `categoryId` 를 **opaque token**
(22자 URL-safe Base64)으로 직렬화한다. 소비자가 그걸 어떻게 읽느냐가 갈랐다.

```java
// slip-service — 정상
RestClient → Map → objectMapper.convertValue(item, ProductSummary.class)

// partner-order-service — 500
UUID.fromString((String) m.get("id"))
```

## 🔑 핵심 — Jackson 이 이미 지원한다

Jackson 2.17.2 의 **기본** `UUIDDeserializer` 가 22자 URL-safe Base64 를 푼다.
설치된 JAR bytecode 원문:

```text
43: bipush 22
45: if_icmpne 69
50: invokespecial convertToUrlSafe
54: getstatic Base64Variants.MODIFIED_FOR_URL
58: invokevirtual Base64Variant.decode
```

⟹ **전역 커스텀 모듈도, `@JsonDeserialize` 도 필요 없다.** ObjectMapper 를 태우기만 하면 된다.

**Why:** "opaque id 를 쓰는데 UUID 로 파싱한다" 는 코드만 봐서는 반드시 터질 것 같지만,
ObjectMapper 를 타는 소비자는 멀쩡하다. 그래서 **한 서비스만 터지고 다른 서비스는 정상**인
비대칭이 생기고, 원인을 엉뚱한 데서 찾게 된다.

🚩 실제로 PM 이 "slip 도 깨졌을 것" 이라 추론했다가 **전표가 실제로 생성된 반대 증거**로
뒤집혔다. 조건이 갖춰진 것과 실제로 터지는 것은 다르다.

## How to apply

- 서비스 간 응답을 읽을 때 **`UUID.fromString` 을 직접 부르지 마라.** ObjectMapper 를 태워라
- `Invalid UUID string: <22자 Base64처럼 생긴 값>` 로그를 보면 즉시 이 계열이다
- 한쪽만 터지면 **파싱 방식이 다른지** 부터 봐라 — 배포본·데이터가 아니라
- 🚨 **mock 으로는 안 잡힌다.** 실 HTTP 경계 테스트가 있어야 걸린다.
  그게 이 결함이 오래 살아남은 이유다
- 소비자를 고칠 때 **응답 계약(product-service)을 바꾸지 마라** — 다른 소비자가 깨진다

관련: [[feedback_restclient_contract_test_false_green]] · [[feedback_uuid_no_user_visibility]] ·
[[feedback_ungated_surface_and_mock_covering_defect]]
