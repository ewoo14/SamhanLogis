# SP-D6-6 slip-service 권한 마이그레이션 실행 계획

## 1. 기반 추가

- slip-service 에 `DynamicPermissionClientConfig` 를 추가한다.
- `services/slip-service/application.yml`, `infrastructure/env-templates/slip-service.env`, `infrastructure/docker-compose.local-all.yml` 에 `SAMHAN_AUTH_SERVICE_URL` 연결을 추가한다.
- auth-service `PageCode` enum 과 V36 Flyway seed 를 추가한다.
- desktop `permissionsApi.ts`, `PermissionMatrixPage.tsx` 에 신규 PageCode 와 전표 그룹을 반영한다.

## 2. 컨트롤러 이전

- 내부/인증 전용 endpoint 를 제외한 `@PreAuthorize` 를 `@RequirePermission(page=..., action=VIEW|EDIT)` 로 치환한다.
- 기존 DPC 수동 가드가 slipType 별 세부 통제를 담당하는 구간은 유지한다.
- edit-request 처리 계열은 `slip.edit-requests.decide` 로 분리하고 `MANAGER`, `MASTER` seed 만 부여한다.
- publish 계열의 `INTEGRATION`, `PARTNER_ADMIN` 은 UI 11-role matrix 밖 레거시 호출자이므로 V36 말미에 보존 grant 로만 추가한다.

## 3. 테스트

- `SlipPermissionControllerIT` 를 `@WebMvcTest` 로 추가해 grant/deny 양쪽에서 AOP와 metric counter 를 확인한다.
- `AbstractPostgresIT` 에 DPC mock + lenient `true` 기본 stub 을 둔다.
- 기존 IT 의 403 기대 케이스는 요청 직전 `when(dynamicPermissionClient.canView/canEdit(...)).thenReturn(false)` 를 명시한다.

## 4. 검증

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:slip-service:test :services:auth-service:test :shared:security:test --no-daemon

cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## 5. 완료 조건

- slip-service 사용자-facing raw `@PreAuthorize` 가 `isAuthenticated()` 및 internal guard 만 남는다.
- V36 seed 가 신규 PageCode 전체를 idempotent 하게 추가한다.
- 권한 확대 회귀 없이 기존 역할 매트릭스를 재현한다.
- 요청 검증 명령이 모두 통과한다.
