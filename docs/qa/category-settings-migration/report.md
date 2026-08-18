# 카테고리별 설정을 견적품목으로 이전 — 구현·검증 보고서

## ① 저장 자리 선택과 근거

`bundle_component`는 세트 구성 관계·기본수량·문맥 납품가의 정본으로 유지하고, `quantity_sync_rule`은 이미 `estimate_category` 축을 갖고 있으므로 유지했다. `product_estimate_exposure`는 웹 카탈로그 membership를 의미하고 `/usage`도 노출 상태를 변경하므로 설정 저장소로 재사용하지 않았다.

따라서 새 저장소 `bundle_component_estimate_setting`을 선택했다. 이 테이블은 부모 구성품 행과 카테고리를 함께 보존하며 수량동기화·옵션·품목구분만 저장한다. `configuration_only=TRUE` CHECK와 주석으로 설정 행과 노출 행의 계약을 고정했다. 납품가는 이전하지 않는다.

## ② RED 원문

먼저 `clients/desktop/src/renderer/utils/categorySettingsMigration.test.ts`를 작성하고 구현 파일이 없는 상태에서 실행했다.

```text
Error: Failed to load url ./categorySettingsMigration (resolved id: ./categorySettingsMigration)
Does the file exist?
```

기능 구현 후 같은 테스트는 다음과 같이 통과했다.

```text
✓ src/renderer/utils/categorySettingsMigration.test.ts (2 tests)
Test Files  1 passed (1)
Tests       2 passed (2)
```

테스트는 초기 설정 투영이 원본 값을 바꾸지 않는 것과 설정 전용 행이 웹 노출 목록에서 제외되는 것을 검증한다.

## ③ 마이그레이션 번호·영향 행 수

번호 대조 결과:

| 위치 | 마지막 번호 |
|---|---:|
| 현재 브랜치 `feat/category-settings-migration` | V46 |
| `main` | V43 |
| 열린 PR #1268 `feat/option-naming-unify` | V46 |
| 본 변경 | **V47** |

V47 fresh PostgreSQL 적용은 V1~V47 **47개 migration 성공**으로 확인했다. fresh DB 자체에는 제품 데이터가 없어 Flyway 자동 backfill은 0행이었다. 공유 DB는 migration하지 않았고, 읽기 전용으로 관련 데이터만 격리 DB에 복제한 뒤 V47 INSERT를 재현했다.

재현 결과는 **1,584 설정행 / 343 부모 세트**다. soft-delete 부모 3개에 속한 14행은 카테고리를 결정할 수 없어 새 설정행을 만들지 않았다.

## ④ 수량 0/343 불변 검증

격리 DB에서 기존 `bundle_component`의 `qty_mode`, `default_qty`에 해당하는 구성 관계와 새 설정행의 수량·옵션·품목구분 값을 전수 대조했다.

```text
활성 부모 세트: 343
이전 설정행: 1,584
수량·설정 값이 달라진 세트: 0
성공 기준: 0/343
```

초기 복사는 정확 복사이며, 수량 계산 기준은 변경되지 않는다.

## ⑤ 노출쌍 354개와 계약

카테고리×구성품 SKU 기준 설정 후보 401쌍 중 기존 웹 exposure가 없는 쌍은 **354개**였다. 이 354쌍은 `bundle_component_estimate_setting`에만 존재하며 `product_estimate_exposure`에는 INSERT하지 않는다. `/usage` API도 호출하지 않았다.

격리 검증 결과:

```text
기존 exposure 활성행: 867
설정 전용 설정행: 1,584
웹 exposure 신규행: 0
설정 전용 행은 웹 노출 목록에서 제외: 계약 고정
```

코드·주석·테스트에 설정 전용 행은 catalog membership가 아니라는 계약을 남겼고, 견적품목 화면은 `component-settings` API만 호출한다.

## ⑥ 옵션 충돌 2쌍 — 선택하지 않음

| 카테고리 / 구성품 | 값 A | 값 B | 분포 |
|---|---|---|---:|
| `COMMERCIAL_MULTI / AM100AXVHHR1` | `variant=S6-1111-MANUAL`, 기본 | `variant=NULL`, 기본 | 1세트 / 4세트 |
| `SINGLE_SET / AWR-WE13N` | `variant=기본`, 기본 | `variant=유선`, 비기본 | 3세트 / 62세트 |

두 충돌 모두 수량방식과 품목구분은 같으므로, 이번 부모 세트 축 보존 이전에서는 어느 값도 고르지 않았다.

## ⑦ 미매핑 14행

soft-delete 부모 3개에 속한 14행은 임의 카테고리를 부여하지 않고 이전 대상 밖으로 남겼다. 이후 복구·재노출되어 카테고리가 확정될 때 별도 backfill 대상으로 삼는다.

## ⑧ 화면·검증

- 기초품목: 수량동기화·옵션·품목구분 편집 제어를 제거하고, 구성품 관계·기본수량·납품가 정본은 유지했다.
- 견적품목: BUNDLE 행에 카테고리별 3종 설정 모달과 저장 API를 추가했다.
- 납품가: `bundle_component`와 기존 기초품목 화면에 그대로 남겼다.
- 라이브 화면 캡처: **미생성**. 격리 fresh DB는 시드되지 않은 빈 DB였고, 공유 auth-service를 격리하지 말라는 조건 때문에 새 백엔드 화면의 인증 라이브 캡처를 수행하지 않았다. 따라서 이전·이후 옵션 개수와 실제 화면 캡처는 미검증으로 남긴다.

검증 결과:

```text
desktop categorySettingsMigration Vitest: 2/2 passed
product-service compileJava: SUCCESS
product-service bootJar: SUCCESS
변경 파일 ESLint: 오류 0, 기존 경고 8
git diff --check: SUCCESS
desktop 전체 typecheck: 기존 @samhan/design-system 링크 부재로 차단
```

## ⑨ 프로세스·컨테이너 회수

```text
격리 PostgreSQL category-settings-migration-pg: 제거 완료
격리 product-service 포트 18084 listener: 0
격리 product-service 프로세스: 회수 완료
공유 Samhan 컨테이너: 24개 실행 상태 유지, stop/restart 0
공유 DB migration/write: 0
git add/commit/push: 0/0/0
```

JAR는 bootJar 검증 후 제거했다. 본 작업은 커밋·푸시하지 않았으며 PM이 대행한다.
