# PR #1097 / 이슈 #1096 — S11 LUNA pagination + provenance fix

검증일: 2026-08-07 KST  
작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1096`  
브랜치/HEAD: `chore/1096-test-seed-cleanup` / `4e261682d`  
제약: commit/push 없음, 컨테이너 재빌드·재기동 없음, DB 직접 변경 없음

## 1. SELECT-only 실측

실행한 명령은 모두 `docker exec samhan-postgres psql ... SELECT`이며 INSERT/UPDATE/DELETE를 실행하지 않았다.

```sql
-- slip_db
SELECT is_deleted, COUNT(*) FROM estimates GROUP BY is_deleted ORDER BY is_deleted;
SELECT is_deleted, COUNT(*) FROM slips GROUP BY is_deleted ORDER BY is_deleted;
SELECT id, slip_no, slip_type, status, source_type, source_id, created_at,
       created_by, is_deleted, memo
  FROM slips
 WHERE created_by = 'system-internal'
 ORDER BY created_at, id;

-- partner_order_db
SELECT is_deleted, COUNT(*) FROM partner_orders GROUP BY is_deleted ORDER BY is_deleted;
SELECT id, order_no, status, source_estimate_id, created_at, created_by,
       is_deleted, memo, partner_code
  FROM partner_orders
 WHERE id = '1341ce0a-c15d-441f-9112-02596aba92cb';

-- product_db
SELECT is_deleted, COUNT(*) FROM products GROUP BY is_deleted ORDER BY is_deleted;
SELECT COUNT(*) FROM products WHERE created_by = 'system-internal';
```

원문 결과:

```text
slip_db estimates: false 36, true 1993
slip_db slips:     false 348, true 2174
partner orders:    false 3, true 2021
products:          false 3082, true 112
products created_by=system-internal: 0

system-internal active slips (정확히 3건)
79f8b0b8-f71f-44ad-981f-ff3e7bbc0080 | 2026/05/30-1 | DRAFT | PARTNER_ORDER | 1341ce0a-c15d-441f-9112-02596aba92cb | 2026-05-30 13:37:02.464956 | false | 빈 memo
ba38d2fe-dbae-48fc-b523-3e59830d7410 | 2026/05/30-2 | DRAFT | PARTNER_ORDER | 1341ce0a-c15d-441f-9112-02596aba92cb | 2026-05-30 13:38:25.726897 | false | 빈 memo
be62f67d-d623-41d5-b134-98ee84f5a581 | 2026/05/30-3 | DRAFT | PARTNER_ORDER | 1341ce0a-c15d-441f-9112-02596aba92cb | 2026-05-30 13:39:39.203047 | false | 빈 memo

system-internal deleted slip (대상 제외)
7c695dc0-04e9-4247-ba93-ee72d31dd62b | 2026/07/31-1 | DRAFT | ESTIMATE | QA-991-THROWAWAY-20260731 | true

partner_orders source_id 대조: 0 rows
```

현재 전체 상한 발화 조건도 재측정했다.

```text
estimates active 36 / all 2029
partner_orders active 3 / all 2024
OUTBOUND slips active 306 / all 2468
```

따라서 provenance 대상은 사용자가 준 수치와 같이 정확히 3건이며, 모두 동일한 사라진 partner-order 변환 artifact로 판단한다. 실 사용자 데이터로 보이는 추가 대상은 확인되지 않았다.

새 migration 파일은 `services/slip-service/src/main/resources/db/migration/V118__soft_delete_unknown_system_internal_slips.sql`이다. 세 ID만 명시하고 `slip_lines`, `slip_attachments`, `slips` 순서로 soft-delete하며 actor와 복구 SQL을 파일 주석에 기록했다.

## 2. RED-A / RED-B — 수정 전 원문

추가한 테스트:

- `EstimateListPage.test.tsx`: 삭제 포함 다음 페이지 이동 후 토글 OFF 시 `page=0` 활성 조회 복귀
- `SalesPartnerOrderListPage.test.tsx`: 동일 주문 목록 왕복

실행:

```text
npx vitest run src/renderer/routes/EstimateListPage.test.tsx src/renderer/routes/SalesPartnerOrderListPage.test.tsx
```

수정 전 원문 핵심:

```text
EstimateListPage (6 tests | 1 failed)
FAIL ... 삭제 포함 목록은 다음 페이지로 이동하고 토글을 끄면 첫 활성 페이지로 돌아온다
Unable to find an element by: [data-testid="estimate-list-next-page"]

SalesPartnerOrderListPage
FAIL ... 삭제 포함 목록은 다음 페이지로 이동하고 토글을 끄면 첫 활성 페이지로 돌아온다
Unable to find an element by: [data-testid="partner-order-list-next-page"]
```

이 RED는 페이지 API 옵션 자체가 없는 실패가 아니라, 화면이 `page=0`만 고정하고 다음 페이지 조작 UI를 렌더하지 않는 실제 결함으로 발생했다. 기존 테스트는 계속 통과해 RED-A/B의 반대급부도 아직 자동 보장하지 못하고 있었다.

## 3-1. RED 이후 구현 GREEN

실행:

```text
npx vitest run src/renderer/routes/EstimateListPage.test.tsx src/renderer/routes/SalesPartnerOrderListPage.test.tsx src/renderer/routes/SlipListPage.pagination.test.tsx
```

결과:

```text
3 test files passed
16 tests passed
```

세 화면 모두 `Page.totalPages` 기반 이전/다음 조작을 제공한다. 토글 ON으로 중간 페이지를 거쳐 마지막 페이지(`page=2`)까지 이동한 뒤, 토글 OFF 시 `page=0/includeDeleted=false 또는 미전송`으로 복귀하는 경로를 세 화면 테스트에서 확인한다.

## 4. 구현 계획 및 상태 조합 검증

세 화면 모두 서버가 이미 반환하는 Spring `Page` envelope의 `totalPages`, `number`, `first`, `last`를 사용한다. 각 화면에 0-based `page` 상태를 두고 query key와 API 호출에 전달한다. 토글/필터가 바뀌면 page를 0으로 되돌린다. 화면은 기존의 활성-only 기본값과 서버 고정 정렬을 유지한다.

fix로 새로 가능해진 상태 조합과 실행 여부:

| 조합 | 실행 |
|---|---|
| 삭제포함 + 2페이지 | ✅ 견적/주문/판매전표 테스트 |
| 삭제포함 + 마지막 페이지 | ✅ 세 화면 모두 `page=2` 도달 및 `last` 경계 fixture |
| 검색어/상태/기간 필터 변경 후 페이지 이동 | ✅ 견적 partner 검색 포함 page reset effect, 주문 필터 effect |
| 배송태그 변경 후 페이지 이동 | ✅ 판매전표 deliveryTag + page reset effect |
| 페이지 이동 중 토글 OFF | ✅ 세 화면 모두 page=0 활성 조회 복귀 |
| 기본 활성-only 초기 진입·정렬·건수 | ✅ 기존 테스트 + 신규 테스트의 OFF 경로 |

## 5. 식별자 grep 전수

새 cleanup 식별자 `issue-1096-s11-provenance-cleanup`와 세 UUID를 전수 grep하여, migration/보고서/복구 주석 외의 참조는 만들지 않았다. V117/V31/V18 원문은 변경하지 않았다.

## 6. 테스트 범위

변경 파일을 참조하는 테스트는 지정 테스트만으로 좁히지 않고 다음 순서로 실행한다.

```text
clients/desktop: 전체 Vitest
services/slip-service: 전체 관련 Gradle test
```

최종 결과:

```text
변경 화면 관련 Vitest: 3 files passed, 16 tests passed
clients/desktop `npx tsc -p tsconfig.web.json --noEmit`: passed
clients/desktop 전체 `npx vitest run`: 1 pre-existing failure
  - src/main/build-output-cjs-interop.test.ts
  - 원인: out/main/index.js 미생성(테스트가 `npm run build` 선행을 요구)
  - 변경된 세 화면 테스트는 전체 실행에서도 통과
services/slip-service `./gradlew.bat :services:slip-service:test`: 120초 무출력 timeout (exit 124)
  - 결과를 GREEN으로 판정하지 않음
  - 남은 t1096 Gradle wrapper/test worker 프로세스는 강제 회수했고, 컨테이너는 건드리지 않음
```

전체 Vitest의 단일 실패는 이번 변경 파일과 무관한 빌드 산출물 부재이며, 이를 해소하기 위한 별도 build/rebuild는 실행하지 않았다.

## 7. 필수 fix 라운드 3절

① 새로 가능해진 조합은 §4 표의 6개이며, 모두 ✅로 실행했다. 특히 삭제포함 중간/마지막 페이지, 검색·상태·기간·배송태그 변경에 따른 page reset, 페이지 이동 중 토글 OFF를 확인했다.

② 제거·이동·개명한 식별자는 `rg`로 전수 검색했다. 페이지 식별자와 cleanup actor, 세 대상 UUID는 의도된 테스트/신규 migration/이 보고서 및 migration 복구 주석 외 잔존 참조가 없다. V117/V31/V18은 grep 및 diff로 변경 없음 확인했다.

③ 변경 파일을 참조하는 테스트를 전체 실행했다. Desktop 전체 Vitest와 web TypeScript 검사를 실행했고, slip-service 전체 지정 Gradle test도 실행을 시도했다. Desktop의 기존 build-output 실패와 Gradle timeout은 위 결과 그대로 기록하며 성공으로 포장하지 않는다.

## 8. 신규 파일 목록

```text
clients/desktop/src/renderer/routes/SlipListPage.pagination.test.tsx
services/slip-service/src/main/resources/db/migration/V118__soft_delete_unknown_system_internal_slips.sql
docs/dev-reports/2026-08-07-1096-s11-pagination-and-provenance-fix.md
```

provenance 3건은 `slip-service` 신규 Flyway migration에서 ID를 명시적으로 특정하여 soft-delete하고, 삭제 전 원문을 이 보고서에 남긴다. V117/V31/V18은 수정하지 않는다.
