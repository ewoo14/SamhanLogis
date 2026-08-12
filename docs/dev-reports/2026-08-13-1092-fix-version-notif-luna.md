# #1092 보조 결함 소관 판정 — CODEX LUNA

- 실행일: 2026-08-13
- 브랜치: `feat/1092-estimate-menu-canon` (`440e95dec`)
- 판정: 두 결함 모두 `(b)` — `main`에서도 동일. 이 PR에서는 수정하지 않음.
- 공유 DB 쓰기: 0건

## 판정 원문

출처는 `docs/dev-reports/2026-08-13-1092-liveqa6-sol.md`와 현재 브랜치/`origin/main` 소스 대조다.

### ① `/app/version` 404 — `(b)`

라이브QA6 원문:

```text
GET /app/version?clientType=DESKTOP&currentVersion=2026%2F08%2F13-1092 | 404
```

현재 공유 스택의 읽기 전용 재현:

```text
gateway  HTTP 404
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: DESKTOP",...}
dashboard-service direct  HTTP 404
{"success":false,"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: DESKTOP",...}
```

deep-link에서만 발생하는 SPA fallback 문제로 판정되지 않는다. `/app/version`은 deep-link 여부와 무관한 별도 앱 버전 조회이며, 일반 gateway 호출도 동일한 404다. `origin/main`의 gateway 원문에도 다음 라우트가 그대로 있다.

```text
id: dashboard-app-version-public
uri: lb://dashboard-service
Path=/app/version
filters:
  - StripInboundIdentityHeaders
```

이 브랜치의 `origin/main...HEAD` 변경 목록에 `dashboard-service`, desktop version 모듈, 또는 해당 gateway route 변경은 0건이다. `main` 소스의 동일 라우트와 동일한 dashboard controller가 앱 릴리스가 없을 때 404를 반환한다. 따라서 이번 견적 opaque-token 축의 회귀가 아니다.

### ② `/api/notifications/my` UUID 2건 — `(b)`

라이브QA6 원문:

```text
GET /api/notifications/my | 200
UUID 정규식 검출: 2건
견적 목록·상세·comments·presence·edits·coedit·revision 응답 UUID: 0건
```

현재 브랜치의 `main` 대조 원문(`NotificationCenterResponse.java`):

```java
public record NotificationCenterResponse(
        UUID id,
        String channel,
        NotificationSeverity severity,
        String title,
        String body,
        String deeplink,
        LocalDateTime createdAt,
        LocalDateTime readAt,
        String refId
) {}

return new NotificationCenterResponse(
        n.getId(),
        n.getChannel(),
        n.getSeverity(),
        n.getTitle(),
        n.getBody(),
        n.getDeeplink(),
        n.getCreatedAt(),
        n.getReadAt(),
        n.getSourceRefId()
);
```

`git show origin/main:services/notification-service/.../NotificationCenterResponse.java`의 동일 원문도 `UUID id`와 `n.getId()`를 포함한다. 이 브랜치의 `origin/main...HEAD` 변경 목록에는 `notification-service`와 desktop notification API 변경이 0건이다. 따라서 알림 응답 UUID는 #1092가 만든 회귀가 아니며 수정하지 않았다.

## RED → GREEN

두 항목 모두 `(b)`이므로 불변식에 따른 RED-first 수정 테스트와 구현을 진행하지 않았다. 근거 없는 외부 서브시스템 수정은 하지 않았다.

## 검증

- `clients/desktop`: `npm run typecheck` — **GREEN** (tsc + real-QA scope 51 passed).
- backend 직전 실행 원문: `:services:slip-service:test --tests 'com.samhanair.logis.slip.estimate.*' --tests 'com.samhanair.logis.slip.estimate.web.*'` — 147개 실행, 13개 실패.
- 그 13건은 직전 보고서에서 다음 기존 환경/기존 계약 묶음으로 확인됐다.
  - `EstimateControllerIT`: 테스트 DB 무결성 오류
  - `EstimateRevisionRestoreIT`, `EstimateCollabIT`: legacy document-number 해석 오류
  - `EstimateControllerSecurityContractTest`: reflection signature 오류
- 이번 재실행은 테스트 시작 전 Gradle이 `services/slip-service/build/test-results/test/binary/output.bin`을 삭제하지 못해 중단됐다. 따라서 이 시도의 종료를 새 backend 테스트 결과로 주장하지 않는다.
- 변경 브랜치의 opaque-token 계약 테스트와 직전 라이브QA6의 견적 관련 네트워크 전수표는 이 보고서의 판정 대상이 아니며, 기존 결과를 덮어쓰지 않았다.

## 불변식 3 재확인

라이브QA6 원문 기준으로 다음은 유지된다.

```text
상세·협업·편집·인쇄 정상
목록 → 상세 진입 · deep-link 새로고침 정상
건수 64 · 45 · 4 · 4 · 11
견적 목록·상세·중첩 line UUID 0건
원본 문서번호 형식 표시
token 일관성 · token 화면 미노출
```

이번 작업에서는 두 `(b)` 결함에 대해 코드/DB 변경을 하지 않았으므로 위 견적 불변식을 훼손하지 않았다.

## 못 한 것

- `/api/notifications/my`의 실제 200 본문 재조회는 현재 인증 계정의 동적 권한 부족으로 403이 반환되어 새 본문을 만들지 못했다. UUID 2건은 liveqa6의 실제 200 원문과 `main`의 동일 DTO로 판정했다.
- backend 13건의 재실행은 Gradle 출력 파일 잠금으로 시작 전 중단됐다. 직전 실행의 147/13과 실패 클래스 분류만 인용했다.
- `(b)` 항목이므로 version fallback이나 notification UUID serializer 수정은 하지 않았다.

## 라운드 종료 점검

`git ls-files --deleted` 결과는 `(없음)`이다. `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태이며 실파일도 존재하고 42 bytes다. 포트 5175 listener는 `(없음)`이며 이 worktree에서 띄운 임시 renderer/Playwright 프로세스는 남아 있지 않다. main 워크트리의 기존 dirty 상태와 추적 파일 삭제는 건드리지 않았다.
