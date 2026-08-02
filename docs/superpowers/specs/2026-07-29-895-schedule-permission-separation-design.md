# 일정 권한 메신저 분리 설계

## 목표

일정 endpoint의 권한을 메신저 page-code에서 분리하고, 내부 사용자는 메신저 발송 권한 없이도 일정을 등록할 수 있게 한다. 일정 수정·삭제는 동적 권한 보유 여부와 무관하게 등록자 본인만 수행한다.

## 확정 동작

- 신규 page-code는 `groupware.schedules`다.
- 일정 POST/GET/PUT/DELETE는 모두 `@RequirePermission(page = "groupware.schedules", ...)`를 사용한다.
- 내부 10역할에는 `groupware.schedules`의 VIEW/EDIT 권한을 부여한다. `PARTNER`는 내부 사용자가 아니므로 seed하지 않는다.
- POST는 호출자 `X-User-Id`를 owner로 사용한다.
- PUT/DELETE는 일정의 `ownerId`와 호출자 UUID가 같을 때만 허용한다. MASTER/MANAGER를 포함한 타인은 거부한다.
- GET은 기존 `ScheduleRepository.findVisibleInRange`를 그대로 사용해 소유자 또는 활성 참여자만 노출한다.
- 기존 `messenger.send` 사용자는 새 page-code seed로 계속 일정 기능을 사용할 수 있고, 나머지 내부 역할도 일정 등록이 가능하다.

## 변경 경계

- `services/groupware-service`: 일정 controller/service 및 기존 일정 권한/흐름 테스트만 변경한다.
- `services/auth-service`: PageCode enum 등재, 새 Flyway V90 seed, 해당 registry/seed 테스트만 변경한다.
- V30 또는 기존 적용 migration은 수정하지 않는다.

## 검증

- RED-first: MANAGER(메신저 관리자) 비소유자의 일정 삭제 403, messenger.send=false 상태의 내부 사용자 일정 등록 201.
- `:services:groupware-service:test --rerun-tasks --no-build-cache`
- `:services:auth-service:test --rerun-tasks --no-build-cache`
- 일정 IT는 Testcontainers PostgreSQL로 실행되며 ubuntu-latest에서도 동일한 owner/permission 계약을 검증한다. Docker가 없는 Windows에서는 IT skip 여부를 원문으로 보고한다.
