# SP-D6-7 accounting-service 권한 마이그레이션 실행 계획

## 1. 테스트 기준

- `AccountingPermissionControllerIT` 를 `@WebMvcTest` 로 추가한다.
- `PermissionSecurityAutoConfiguration`, accounting `HeaderAuthenticationFilter`, `DynamicPermissionClient @MockBean`, `SimpleMeterRegistry` 를 사용한다.
- endpoint case 별로 grant 요청은 403 이 아니어야 하고, deny 요청은 `canView/canEdit=false` stub + `X-User-Role` 헤더로 403 및 deny metric 증가를 확인한다.
- 기존 accounting-service IT 에 DPC mock 이 필요한 경우 lenient `true` 기본 stub 을 추가한다.

## 2. BE migration

- SP-D5 보고서 패키지 10개 controller 는 제외한다.
- controller `@PreAuthorize` 를 `@RequirePermission(page = ..., action = "VIEW"|"EDIT")` 로 교체한다.
- `AccountingEditRequestController` 는 생성/이력은 `accounting.edit-requests`, 목록/승인/거절은 `accounting.edit-requests.decide` 로 분리한다.
- 기존 수동 DPC helper 는 이번 slice 에서 제거하지 않고, 컴파일/기존 행위 보존을 우선한다.
- accounting-service DPC bean 은 shared-security auto-config 로 이미 등록되므로 service-local config 는 추가하지 않는다.

## 3. Auth/seed/FE

- `PageCode.java` 에 V37 신규 PageCode 와 누락된 기존 `ecount.mig7.*`, `ecount.mig11.*` enum 을 추가한다.
- `V37__seed_sp_d6_7_accounting_page_codes.sql` 은 신규 PageCode 14개를 11-role matrix 로 seed 한다.
- V37 은 기존 `ecount.mig7.*`, `ecount.mig11.*` 의 누락 role row 도 `FALSE/FALSE` 로 보강한다.
- desktop `permissionsApi.ts` union 과 `PermissionMatrixPage.tsx` 회계/이카운트 그룹에 신규 코드를 추가한다.

## 4. 검증

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:accounting-service:test :services:auth-service:test :shared:security:test --no-daemon

cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## 5. 완료 조건

- accounting-service 사용자-facing controller 의 실제 `@PreAuthorize` annotation 이 제거된다.
- 신규 PageCode 는 BE enum, Flyway seed, FE union, permission matrix UI 에 모두 존재한다.
- deny case 는 `false` stub 과 `X-User-Role` 헤더가 함께 있는 IT 로 검증된다.
- 요청 검증 명령이 모두 통과하고 단일 커밋만 생성한다.
