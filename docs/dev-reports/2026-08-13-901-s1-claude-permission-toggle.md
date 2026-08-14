# #901 S1 Claude 사용 권한 토글 구현 보고서

작성일: 2026-08-13  
범위: 축 0만 구현. 대화 UI·모델 호출·도구 호출·감사 로그는 포함하지 않음.

## 1. 기존 권한 체계 실측

기존 체계는 새 저장소를 만들지 않고 다음 세 층을 그대로 사용한다.

| 축 | 실측 위치 | 역할 |
|---|---|---|
| 개인별 enforcement | `services/auth-service/src/main/java/com/samhanair/logis/auth/service/AccountPermissionService.java:49-68` | `account_page_permissions`의 계정×page×7-action을 최종 판정한다. MASTER system-group bypass도 이 기존 메서드에 남아 있다. |
| 그룹별 원천 | `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/GroupPagePermission.java:24-105` | `group_page_permissions`의 7비트 원천이다. |
| 개인별 메뉴 | `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:105-398` | 계정별 page-code × `view/create/update/delete/restore/download/print` 매트릭스다. |
| 그룹별 메뉴 | `clients/desktop/src/renderer/routes/PermissionGroupMatrixPage.tsx:127-211` | 동일한 7비트 그룹 매트릭스와 기존 저장 API를 사용한다. |

`PageCode`는 `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java:326-338`에 `system.claude`를 등록했다. FE의 동일 page-code는 `PermissionMatrixPage.tsx:272-278, 476-481`, `permissionsApi.ts:165-168`에 등록했다.

## 2. RED 원문 — 양방향

### RED-A: 새 축 0이 실제 서버에서 강제되는가

새 `ClaudeConversationPermissionIT`를 먼저 작성하고 production endpoint/migration 없이 실행했다.

```text
ClaudeConversationPermissionIT
3 tests completed, 2 failures
축 0 off 계정: expected 403, endpoint 부재로 실패
축 0 view 계정: expected 501, endpoint 부재로 실패
```

세 번째 테스트는 PostgreSQL boolean 배열을 JDBC scalar로 읽던 테스트 오류였고, 배열 조회를 7개 컬럼 직접 조회로 고친 뒤 RED를 다시 확인했다.

### RED-B: 기존 체계의 7비트 회귀

동일 테스트에서 Claude row의 정확한 비트를 단언했다.

```text
expected: [true, false, false, false, false, false, false]
```

구현 전에는 `system.claude` row가 없어 이 계약을 충족하지 못했다. 기존 page-code의 다른 권한을 변경하는 테스트나 별도 저장소는 만들지 않았다.

## 3. 선택한 수단과 이유

선택한 수단은 다음과 같다.

1. `system.claude`를 기존 `PageCode` enum에 추가한다.
2. V103 migration에서 기존 `role_page_permissions`, `role_page_permission_templates`, `group_page_permissions`, `account_page_permissions`를 함께 seed한다.
3. 기존 권한설정 UI의 시스템 관리 그룹에 row를 추가한다. 기존 개인별·그룹별 저장 API와 7비트 checkbox를 재사용한다.
4. auth-service에 `POST /auth/claude/conversations` 정문만 추가한다. 업무 데이터는 읽거나 쓰지 않는다.
5. 정문은 `X-User-Id`를 UUID로 파싱한 뒤 기존 `AccountPermissionService.check(accountId, "system.claude", VIEW)`만 호출한다. 허용 시 S1 상태인 501, 거부 시 403이다.

이 수단은 축 0의 권한 저장·판정 체계를 새로 만들지 않으면서, 대화 기능이 아직 없어도 축 0 off 계정의 서버 거부를 실 HTTP로 증명할 수 있다.

Migration 번호는 현재 auth-service 최고 번호 V102를 확인했고, 열린 PR `#1198 #1201 #1202 #1203 #1162 #1188 #1180`의 파일 목록에 auth-service migration이 없음을 확인해 V103을 선택했다. 다른 서비스의 V103은 서비스별 migration namespace이므로 충돌 대상이 아니다.

## 4. GREEN 원문

축 0 전용 IT 재실행 결과:

```text
:services:auth-service:test --tests com.samhanair.logis.auth.it.ClaudeConversationPermissionIT
BUILD SUCCESSFUL
3 tests completed, 0 failures
```

auth-service 전량 재실행 결과:

```text
:services:auth-service:test --no-daemon
BUILD SUCCESSFUL in 1m 18s
75 test result XML/classes, failures 0, errors 0
```

Flyway Testcontainers는 V103까지 실제 적용되었고, 10개 빌트인 그룹의 `system.claude` 7비트를 실 DB에서 조회했다.

## 5. 불변식별 보증

| 불변식 | 보증 방법 |
|---|---|
| ① 개인별·그룹별 토글 | FE 두 매트릭스에 `system.claude` row를 등록하고 기존 update 경로가 해당 page-code를 처리한다. V103은 두 저장 원천과 enforcement 캐시를 함께 seed한다. |
| ② off 계정 서버 403 | `POST /auth/claude/conversations`가 화면 상태가 아니라 실제 `AccountPermissionService.check()` 결과를 보고 `AccessDeniedException`을 발생시킨다. 실 HTTP IT에서 off=403, on=501을 단언한다. |
| ③ 기존 체계 재사용 | 새 테이블·새 토글 저장소·새 권한 판정기가 없다. `account_page_permissions`, `group_page_permissions`, `AccountPermissionService.check()`를 그대로 사용한다. |
| ④ 기존 권한 무변화 | 새 page-code만 추가하고 기존 page/action seed와 서비스 로직은 수정하지 않았다. auth-service 전량 테스트 0 failure와 기존 7-action 모델을 함께 검증했다. |
| ⑤ UUID 비노출 | 정문 응답은 `ApiResponse<Void>`의 501 껍데기이며 UUID를 응답·메시지에 넣지 않는다. IT가 응답 본문에 테스트 계정 UUID가 없음을 단언한다. |

## 6. 권한 매트릭스 전수 결과

V103은 역할 11종(`MASTER`, `MANAGER`, `ACCOUNTANT`, `SALES`, `WAREHOUSE`, `DISPATCH`, `INVENTORY`, `DEVELOPER`, `PARTNER`, `STAFF`, `DRIVER`)의 role/template row를 모두 만들고, 빌트인 그룹 10종의 group row를 모두 만든다.

그룹 10종 전수 실측 결과:

```text
group_page_permissions WHERE page_code='system.claude' AND is_deleted=false: 10 rows
...000100 (MASTER): [true, false, false, false, false, false, false]
...000101 ~ ...000109: [false, false, false, false, false, false, false]
```

MASTER의 기존 system-master bypass는 기존 체계 불변식이므로 변경하지 않았다. 비-MASTER 계정은 개인별 `account_page_permissions` row가 7비트를 최종적으로 결정한다.

## 7. 테스트·판단 필요·못 한 것

### 완료

- auth-service 전용 IT: 통과
- auth-service 전량 테스트: `BUILD SUCCESSFUL`, 0 failure/error
- V103 Flyway/Testcontainers migration: 통과
- 실 HTTP off/on 경계: 403/501 통과
- 빌트인 그룹 10종 7비트 전수: 통과
- FE BE page-code union/catalog source 정합: 코드 연결 완료

### 실행하지 못한 것

desktop 대상 Vitest는 실행 환경의 의존성 부재로 실행하지 못했다.

```text
clients/desktop/node_modules/@typescript-eslint/parser: 없음
vitest: 없음
```

일반 `npm test`는 pretest actor-display boundary에서 parser 부재로 중단되었고, `npx vitest`도 `vitest/config`를 찾지 못했다. 의존성 설치나 lockfile 변경은 하지 않았다.

### 다음 슬라이스로 남긴 것

대화 UI, 모델 호출, 기존 업무 endpoint를 통한 도구 호출, 축 1 업무 권한 교차, 축 2 확인 절차, 감사 로그는 S1에서 의도적으로 구현하지 않았다. S1 정문은 권한 통과 후에도 501만 반환한다.
