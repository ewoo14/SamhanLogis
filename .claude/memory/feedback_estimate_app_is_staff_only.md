---
name: feedback-estimate-app-is-staff-only
description: 종합견적서는 직원 전용 화면이다 — 거래처는 직접 쓸 수 없다 (주문서웹이 거래처용)
metadata: 
  node_type: memory
  type: project
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-16T06:26:22.686Z
---

개발책임자 확정 (2026-08-16): *"종합견적서는 거래처가 직접 쓸 수 없어. 직원용이야."*

```text
종합견적서 (clients/web/estimate-app)   삼한 직원 전용
주문서웹   (clients/web/order-app)      거래처가 직접 로그인해서 쓰는 포털
```

## 코드로 확인되는 인증 경계

```text
종합견적서
  접속 게이트  checkUserAuth(email) → GET /internal/users/by-email (X-Internal-Token)
               "사용자 마스터에 이메일이 존재 = 승인"       lib/code.js:2722-2734
  응답 필드    departmentName · ecountCode · fullName · id · loginId · role
  🔑 사업자번호(bizNo/partnerCode)가 응답에 아예 없다

주문서웹
  tryLogin(bizNo, pw) → POST /api/v1/auth/partner-login      src/samhanApi.ts:51
  거래처가 사업자번호 + 비밀번호(숫자 4자리 PIN)로 로그인
```

## 그래서 따라오는 것

```text
🔑 종합견적서에서 거래처 데이터를 조회할 때
   조회 키를 로그인 계정에서 뽑을 수 없다 — 직원 계정에는 사업자번호가 없다
   ⟹ 화면에서 선택한 거래처의 bizno 를 써야 한다

🚨 권한이 두 갈래다
   직원 경로     sales.partner-order.history VIEW 등 권한 기반 인가
   거래처 경로   X-Partner-Code + 자기 사업자번호만 (self-scope)
🚨 두 경로가 서로를 넓히면 안 된다
   실측 결함 — 직원 토큰 + X-Is-Partner:true 로 self-scope 경로에 진입해
   403 이어야 할 요청이 200 이 됐다 (partnerSelfService 가 동적 권한 검사를 우회)
```

## How to apply

```text
🚨 "이 화면은 누가 쓰는가" 를 인증 경로로 확인하라
   by-email(user-service) = 직원 · partner-login(partner-auth) = 거래처
🚨 직원 화면에서 거래처별 데이터를 다룰 때 "로그인 계정 = 그 거래처" 로 가정하지 마라
🚨 거래처 self-scope 를 직원 편의를 위해 느슨하게 만들지 마라 — 그게 더 큰 결함이다
```

관련: [[feedback_permission_contract_needs_exact_bits]] · [[feedback_uuid_no_user_visibility]] ·
[[feedback_business_meaning_needs_confirmation_not_inference]]
