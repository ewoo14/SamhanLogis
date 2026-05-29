# 권한 enforcement 계약 변경 시 실 HTTP 회귀 테스트 의무 (false-green 방지)

> 2026-05-29, PR #316(권한 재편 Phase 1) 사이클 N=2~3 회고.

## 교훈

권한/enforcement IT 가 `@MockBean DynamicPermissionClient`(또는 권한 client)로 권한 경로를 mock 하면, **권한 조회 HTTP endpoint 의 계약 변경(파라미터/경로/양식)이 CI green 으로 위장된다(false-green)**.

### 실제 사고 (PR #316)
- `/auth/internal/permissions/check` 를 account-form(`accountId`+`action` 필수) 전용으로 교체.
- 그러나 `DefaultDynamicPermissionClient.canView/canEdit` 의 role-form 호출(`roleCode`+`type`, accountId 없음)은 그대로 → 운영에서 **400 → false → deny**.
- 영향: arologis role-mode(AROLOGIS_MANAGER/DRIVER) + EmployeePermissionGuard 등 **모든 role-form 소비자(programmatic guard) 운영 lockout**.
- **CI 28/28 green 인데 운영 파손** — 전 권한 IT 가 client 를 mock 해 실 HTTP round-trip 미검증. Claude/Codex 1차 리뷰·CI 전부 통과, **사이클 N=2 BE cross-check 단독 적발**.

## 적용 규칙

1. 권한 조회 **endpoint 계약(경로/파라미터/응답)** 을 바꾸면, 그 endpoint 와 client 를 잇는 **실 HTTP 회귀 테스트** 필수:
   - client 단위: `MockRestServiceServer` 로 실제 URI/query/header 를 정확 일치 검증.
   - endpoint 단위: Testcontainers + 실 DB seed 로 양식별 allow/deny + 가드(INTERNAL token) 검증.
2. 권한 IT 의 client mock 은 **enforcement 로직(allow/deny 판정)** 검증용일 뿐, **endpoint 계약 검증을 대체하지 못함**. mock-only 권한 테스트는 계약 파손에 맹점.
3. 권한 client 가 **다중 양식(account-form / role-form)** 을 동시 지원하면, 각 양식의 실 HTTP 경로를 별도 회귀 테스트로 고정.
4. 리뷰 시 "CI green ≠ 운영 권한 정합" — 권한 변경 PR 은 dual cross-check 에서 **mock 으로 가려진 실 경로**를 의심하라.

관련: [[cycle-n2-mandatory]](BE cross-check 가 차단), [[qa-docker-real-test]](실 Testcontainers 의무), [[it-mockbean-external-clients]](외부 client mock 격리는 별개 — 권한 경로는 실 HTTP 필요).
