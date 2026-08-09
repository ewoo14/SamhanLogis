# PR #1145 R11 — projection을 V97 반영 상태로 정합

## 판정

V97을 변경하지 않고, 체크인 projection을 저장소의 전체 Flyway migration 적용 결과로
갱신했다. freshness IT, R7/R8 exact 검사, R9 양방향·동결 검사, desktop 계약 검사가
동시에 GREEN이다.

## ① 파생 기준과 갱신 계약

변경 전 `scripts/refresh-accounting-permission-db-snapshot.ps1`은 공유
`samhan-postgres/auth_db`에 `docker exec` SELECT를 실행했다. 공유 DB에는 V97이 아직
적용되지 않았으므로 이 결과는 migration 정본과 달랐다.

변경 후 스크립트는 다음 순서로 동작한다.

1. 일회성 PostgreSQL 16 컨테이너와 전용 Docker network를 만든다.
2. 저장소의 `services/auth-service/src/main/resources/db/migration` 전체를
   `flyway/flyway:10.10.0`으로 새 DB에 적용한다. 실행 결과는 97 migrations, v97이다.
3. 그 임시 DB에서 `role_page_permission_templates`를 SELECT-only로 읽어 projection을
   생성한다.
4. 컨테이너와 network를 `finally`에서 제거한다.

따라서 공유 `auth_db`에는 쓰지 않는다. 갱신 계약은 **개발책임자 또는 담당 구현자가
갱신 시점에(이번 갱신: 2026-08-09) 저장소의 모든 migration을 새 임시 DB에 적용한 뒤,
그 DB의 active template 7-bit 결과를 기준으로 projection을 갱신**하는 것이다. 공유 DB
스냅샷을 기준으로 갱신하거나, migration 일부만 적용하거나, 빈 결과에서 기존 파일을
재사용하지 않는다. 갱신 뒤에는 본 IT와 desktop 계약 테스트를 함께 실행한다.

## ② 동결 수: 354 → 349

동결 목록 `PERMISSION_MOCK_DIVERGENCES`는 실행 시 계산한 전체 차이와 `toEqual`로
정확히 대조된다. 목록은 354셀에서 349셀로 줄었다.

줄어든 5셀은 이전 projection에서 `0000000`이었고 mock은 V97 효과를 이미 갖고 있었다.
전체 5셀을 projection에 반영했기 때문에 이 5개가 divergence에서 제거됐다. 나머지
349셀은 mock을 수정하지 않고 그대로 동결했다. 최종 실측은 `DIVERGENCE_COUNT=349`다.

## ③ 변경된 5셀 전수 및 V97 대조

| 역할 | page code | 이전 비트 | 이후 비트 | V97 근거 |
|---|---|---:|---:|---|
| MANAGER | `accounting.tax-invoice.inbound.manage` | `0000000` | `1111000` | V97 §5, 139행 주석 및 template INSERT 159행. V14 MANAGER `accounting.tax-invoice.inbound`를 `.inbound.manage`로 계승 |
| MANAGER | `accounting.sales-slip.accounting` | `0000000` | `1111000` | V97 §2, 39행 주석, CASE 46행·source 54행. MANAGER `.list`를 `.accounting`으로 계승 |
| MANAGER | `accounting.purchase-slip.accounting` | `0000000` | `1111000` | V97 §2, 39행 주석, CASE 47행·source 54행. MANAGER `.list`를 `.accounting`으로 계승 |
| SALES | `accounting.sales-slip.accounting` | `0000000` | `1000000` | V97 §2, 39행 주석, CASE 46행·source 54행. SALES `.list`를 `.accounting`으로 계승 |
| SALES | `accounting.purchase-slip.accounting` | `0000000` | `1000000` | V97 §2, 39행 주석, CASE 47행·source 54행. SALES `.list`를 `.accounting`으로 계승 |

다섯 셀 모두 V97의 명시된 role/template 계승 또는 inbound.manage 이관과 일치한다.
V97과 무관한 셀은 없으므로 중단 조건은 발생하지 않았다.

## ④ 다섯 검사 동시 GREEN

### R7/R8/R9 desktop 계약·exact·양방향·동결

명령:

```text
cd clients/desktop
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
```

원문 결과:

```text
✓ src/renderer/test-utils/accounting-slip-permission-contract.test.ts (8 tests)
Test Files 1 passed (1)
Tests 8 passed (8)
```

이 8개 테스트 안에서 R7 회계 exact, R8 전수 exact, R9 catalog 양방향 및
`PERMISSION_MOCK_DIVERGENCES` 전체 exact 대조가 실행된다. 동결 실측은 349셀이다.

### R10 projection freshness

명령:

```text
./gradlew :services:auth-service:test --tests '*ProjectionFreshness*' --rerun-tasks
```

원문 결과:

```text
1 test completed, 0 failed
BUILD SUCCESSFUL
```

해당 테스트의 Flyway 로그는 `Successfully applied 97 migrations ... now at version v97`를
기록했고, 그 DB와 projection의 모든 catalog role×page 셀이 일치했다.

## ⑤ 뮤테이션 재확인

- R9 동결 mutation: `MASTER|partners.delete`의 frozen `snapshotBits`를
  `1111100 → 1111101`로 임시 변경. 결과 `R8 ... MASTER frozen mock divergence set`
  실패, 8개 중 7 passed / 1 failed. 원복 후 GREEN.
- R10 freshness mutation: projection의
  `MASTER|accounting.sales-slip.accounting`를 `1111000 → 1111001`로 임시 변경.
  결과 `auth_db ↔ projection 불일치: [MASTER|accounting.sales-slip.accounting db=1111000 projection=1111001]`,
  `1 test completed, 1 failed`. 원복 후 GREEN.

두 mutation 모두 정합 이후에도 감시 가드가 RED가 됨을 확인했다. mock bit와 V97은
변경하지 않았다.

## 변경·신규 파일

- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`
  — 전체 migration 적용 projection으로 5셀 추가
- `clients/desktop/src/renderer/test-utils/permission-mock-divergences.ts`
  — 354셀에서 V97과 정합된 5셀 제거, 349셀 exact 동결
- `scripts/refresh-accounting-permission-db-snapshot.ps1`
  — 공유 DB SELECT 방식에서 임시 DB + 전체 Flyway migration 방식으로 변경
- `docs/dev-reports/2026-08-09-1145-r11-projection-align.md`

`services/auth-service/src/main/resources/db/migration/V97__align_accounting_slip_permissions.sql`
와 desktop mock은 변경하지 않았다.
