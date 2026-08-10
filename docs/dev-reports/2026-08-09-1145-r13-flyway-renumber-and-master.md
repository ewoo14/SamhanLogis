# PR #1145 R13 — Flyway V97→V99 및 MASTER 오분류 정리

실행 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1144`  
검증 기준 HEAD: `2e805769b3973ac52ca2628e17c19956373b0a4f`  
작성일: 2026-08-09

## 1. Flyway 채번 변경

`services/auth-service/src/main/resources/db/migration/V97__align_accounting_slip_permissions.sql`을
`V99__align_accounting_slip_permissions.sql`로 파일명만 변경했다. 원본 blob SHA-1과 새 파일의
`git hash-object` 결과는 모두 `bab045b30d26ae77de7652c677dec61ebfe87232`다. SQL 본문은 한 글자도
변경하지 않았다.

V98은 체크아웃하지 않고 `git show 37b4289f93e2d1fd8f320b5f28bd834e8fc6c26d:`로 읽었다.
해당 커밋은 `[FIX] #1130 R6`의 V98이며, 본 변경의 accounting 대상과 겹치지 않는
`inbound.inspection` MANAGER 권한 migration이다. V99는 기존 `git` 이력과 현재 migration 디렉터리에
선행 충돌이 없음을 확인했다.

### V97 참조 전수 목록

migration을 가리키는 `V97`, `v97`, `version=97`, `version v97`, `migration-v97` 참조를 저장소에서
전수 검색했다. 갱신한 파일은 다음과 같다.

- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`
- `clients/desktop/src/renderer/api/mock.ts`
- `docs/dev-reports/2026-08-08-1144-p0b-pagecode-alignment.md`
- `docs/dev-reports/2026-08-09-1145-r1-adversarial.md`
- `docs/dev-reports/2026-08-09-1145-r2-fix.md`
- `docs/dev-reports/2026-08-09-1145-r3-adversarial.md`
- `docs/dev-reports/2026-08-09-1145-r4-mock-matrix-fix.md`
- `docs/dev-reports/2026-08-09-1145-r5-contract-hardening.md`
- `docs/dev-reports/2026-08-09-1145-r6-grant-permissions.md`
- `docs/dev-reports/2026-08-09-1145-r6-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1145-r7-mock-bit-parity.md`
- `docs/dev-reports/2026-08-09-1145-r7-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1145-r8-full-matrix-guard.md`
- `docs/dev-reports/2026-08-09-1145-r8-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1145-r9-divergence-freeze.md`
- `docs/dev-reports/2026-08-09-1145-r9-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1145-r10-projection-freshness.md`
- `docs/dev-reports/2026-08-09-1145-r11-projection-align.md`
- `docs/dev-reports/2026-08-09-1145-r11-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1145-r12-credential-and-live-qa.md`
- `docs/handoff/CURRENT-WORK.md`

현재 남은 `V97` 검색 결과는 새 V99 SQL 안의 원래 주석 및 `v97-accounting-slip-grant`,
`v97-inbound-manage-grant` 감사 식별자뿐이다. 파일 내용 불변 요구 때문에 이를 바꾸지 않았다.
package-lock의 base64 integrity 문자열과 legacy GAS/폰트 데이터의 우연한 문자열은 migration 참조가
아니므로 변경하지 않았다.

### 일회용 DB 원문

공유 DB가 아닌 일회용 PostgreSQL 컨테이너에서 현재 V1~V96, `git show`로 읽은 V98, 현재 V99를
적용했다. 공유 DB 및 `flyway_schema_history`에는 접근하지 않았다.

```text
Migrating schema "public" to version "96 - seed slip closed date admin permission"
Migrating schema "public" to version "98 - grant manager inbound inspection update"
Migrating schema "public" to version "99 - align accounting slip permissions"
Successfully applied 98 migrations to schema "public", now at version v99
Successfully validated 98 migrations (execution time 00:00.109s)

 version | description                              | success
---------+------------------------------------------+--------
 96      | seed slip closed date admin permission   | t
 98      | grant manager inbound inspection update  | t
 99      | align accounting slip permissions        | t
```

## 2. MASTER 스냅샷 및 mock 정리

### 파생 기준

기존 템플릿의 MASTER 행을 정본으로 사용하지 않고, `DynamicPermissionService`의 실제 bypass 규칙을
테스트 projection에도 적용했다. 즉 등록된 전체 page code 200개 각각에 대해
`view/create/update/delete/restore/download/print` 7개 action을 `1111111`로 파생한다.

- `accounting-slip-permission-snapshot.ts`: 비-MASTER 템플릿은 그대로 두고 exported MASTER만 런타임
  전권 projection으로 override
- `accounting-slip-permission-db-snapshot.ts`: MASTER DB projection을 전체 page code × `1111111`로 파생
- `mock.ts`: MASTER account permission 응답도 전체 `SP_D1_PAGES`에 7 action true를 반환
- `permission-mock-divergences.ts`: MASTER 110개 divergence 제거

### “MASTER가 이건 못 한다” 전수 조사

`services/auth-service/src/test`와 `clients/desktop/src`의 Java/TS/TSX/JS/JSX를 대상으로
MASTER와 `false/403/forbidden/denied/못 한다/불가/금지/차단` 조합을 검사했다.

- MASTER의 특정 page code/action을 false 또는 403으로 단정하는 테스트/화면 코드: **0건**
- 발견된 관련 코드는 비-MASTER의 403 guard, MASTER 전용 endpoint 설명, mock seed 누락 방지 주석,
  `MASTER 권한만`인 업무 endpoint 문서뿐이다. 이것들은 MASTER bypass 부정이 아니다.

따라서 mock을 동결하지 않고 런타임 정본에 맞췄다. MASTER 전용 화면
`system.permission-admin`도 0 mock이 아니라 전권 projection 대상이다. MASTER 외 역할의 동결 항목은
변경하지 않았다.

### 동결 수 변화

| 항목 | 변경 전 | 변경 후 |
|---|---:|---:|
| 전체 동결 divergence | 349 | 239 |
| MASTER divergence | 110 | 0 |
| MASTER 외 divergence | 239 | 239 |

## 3. 검사 결과 — GREEN

1. `./gradlew :services:auth-service:test --tests '*ProjectionFreshness*' --tests '*Permission*' --rerun-tasks` — **GREEN**, `BUILD SUCCESSFUL` (1m 38s)
2. `clients/desktop`의 `npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts` — **GREEN**, 1 file / 8 tests passed
3. V99 migration 원문 hash 대조 — **GREEN**, 원본·V99 모두 `bab045b30d26ae77de7652c677dec61ebfe87232`
4. 동결/MASTER projection 정적 guard — **GREEN**, 349→239, MASTER 110→0, 비-MASTER 239 유지
5. 일회용 PostgreSQL Flyway migrate + validate — **GREEN**, V96→V98→V99 tail 순서 및 v99 validate 통과

기존 R7 회계 exact, R8 전수 exact, R9 양방향/동결, R10 freshness, R12 랜덤 비밀번호 산출물은
이번 변경에서 MASTER 외 정본을 수정하지 않았으며 관련 Gradle 묶음과 계약 테스트가 GREEN임을 확인했다.

## 4. 신규/변경 경로

신규 파일:

- `services/auth-service/src/main/resources/db/migration/V99__align_accounting_slip_permissions.sql`
- `docs/dev-reports/2026-08-09-1145-r13-flyway-renumber-and-master.md`

주요 변경 파일:

- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/permission-mock-divergences.ts`

이 작업에서는 commit/push를 수행하지 않았다. 기존 untracked `clients/desktop/playwright/1145-r12-live-qa/`
디렉터리는 건드리지 않았다.
