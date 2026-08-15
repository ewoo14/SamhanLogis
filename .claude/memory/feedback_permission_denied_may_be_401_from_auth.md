---
name: feedback-permission-denied-may-be-401-from-auth
description: "권한 없음" 이라는 deny 메시지가 실제로는 auth-service 가 401 을 준 것일 수 있다 — 권한 데이터부터 의심하면 시간을 버린다
metadata:
  type: feedback
---

2026-08-15 실측. **두 트랙(#1218 · #1219)이 각각 반나절씩 권한 데이터를 의심했는데 원인은 헤더였다.**

```text
화면 오류   [SP-PO-1] 동적 권한 deny — page=… action=VIEW
            subject=GROUP_BASED reason=account permission missing
```

## 실제로 벌어진 일

```text
DefaultDynamicPermissionClient   X-Internal-Token · X-User-* 만 보낸다
auth-service HeaderAuthenticationFilter   내부 endpoint 에도 gateway attestation 을 강제
⟹ GET /auth/internal/permissions/check → HTTP 401 · 응답 본문 없음
⟹ 클라이언트가 401 을 allowed=false 로 fallback
⟹ PermissionAspect 가 "account permission missing" 으로 표시
```

같은 요청에 attestation 을 붙이면:

```text
HTTP 200 {"success":true,"code":"OK","data":{"allowed":true}}
```

**Why:** deny 메시지가 "권한이 없다" 라고 말하지만 실제 의미는 **"권한을 물어봤는데 대답을 못 받았다"** 다.
두 문장은 전혀 다른데 화면에는 같게 보인다. 그래서 권한 테이블·그룹 배속·materialization 을 파게 된다.
실제로 #1218 은 V108 backfill 마이그레이션까지 만들었고(그건 별개로 필요했다),
#1219 는 권한 축을 두 라운드 팠다.

## How to apply

**deny 를 보면 데이터보다 호출을 먼저 의심하라.**

```text
① DB 를 읽어라 — account_page_permissions 에 행이 있는가
   있는데 deny 면 그 즉시 데이터 문제가 아니다
② 내부 permission check 호출을 직접 재현하라
   응답이 401 인지 200 allowed=false 인지 가른다
   🔑 401 이면 헤더 계약 문제다. 200 false 면 그때 데이터를 본다
③ 호출 클라이언트가 attestation 을 보내는지 확인하라
   4-인자 생성자는 attestation 없음 · 5-인자가 전달한다
```

**모순을 만나면 그게 실마리다.** "캐시에는 있는데 missing 이라 한다" 를 짚은 것이 이 진단의 시작이었다.

관련: [[feedback_stale_deployment_looks_like_defect]] · [[feedback_permission_contract_needs_exact_bits]] ·
[[feedback_enforcement_real_http_test]] · [[feedback_pm_verify_what_measurement_proves]]
