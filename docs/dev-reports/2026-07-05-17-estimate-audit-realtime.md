# 2026-07-05 — #17 견적 audit 500 + realtime 403 (PR #740)

> 견적 버전이력 500·실시간 협업 403 근본 해소 + 동종 sweep(전표 revision·견적 CRUD 인가).

## 근본원인
- **audit 500**: `EstimateRevision.snapshot`(@JdbcTypeCode JSON)이 리터럴 `'null'`/필드누락/**타입불일치**(estimateDate 등) 시 Hibernate 역직렬화 실패/null→`listWithSummary` `cur.lines()` NPE→500.
- **realtime 403**: `EstimateCollabController` 전 endpoint가 `@RequirePermission(estimates.list)` + `EstimatePermissionGuard.checkView/checkEdit` 수동 **이중 인가**(SSE/read도 UPDATE 요구). auth-service 왕복 2배→그중 1회 실패=403(신뢰성 결함).

## fix
- **audit**: snapshot을 `::text` raw JSONB로 읽어 app-level lenient parse(FAIL_ON_UNKNOWN false·enum null) try/catch→손상 revision 제외(직전 정상 유지)·restore는 명확 500. **null-shaped + 타입불일치 둘 다** 방어.
- **realtime**: EstimateCollabController 이중가드 제거→단일 `@RequirePermission`·read=VIEW/write=UPDATE. FE 경로 `/api/v1/slips/estimates` 표준화.
- **sweep([[feedback_defect_family_sweep_fix]])**: SlipRevisionService 동일 raw/parse+null 방어(전표 감사 500 예방)·EstimateController CRUD 6곳 동일 이중가드 제거→단일가드.

## 리뷰 (실행=게시 1:1·모든 라운드 표+라이브 스샷·0수렴 게시 후 머지)
Opus 5-agent R1(FE0·DevOps0·Design[LOW]·**QA 라이브 PASS**[VIEW read200/UPDATE write403/corrupt 제외200]·BE[MED×3])+fix(타입불일치·SlipRevisionService/EstimateController sweep) ↔ Codex 순차 라운드(**Docker 라이브**: 견적/전표 타입불일치 200·CRUD 403·realtime write 403) → **0수렴**.

## 검증
- slip-service 1177 test(EstimateCollabIT 19·EstimateRevisionRestoreIT 7·SlipRevisionRestore·EstimateControllerSecurityContract·타입불일치 회귀)·FE 605·typecheck0.
- **라이브 QA**: VIEW read 200·UPDATE write 403·corrupt(null/타입불일치) revision 제외 200·restore 명확 에러. 스샷(SHA-pinned+SendUserFile).

## 정직 disposition/후속
- realtime "before 403→after 200": 안정환경선 pre-fix도 200(이중호출 신뢰성 결함·IT `.thenReturn(true,false)`+`times(1)` 결정론 고정).
- 상태전이(send/accept/reject/convert) revision capture 갭·estimateApi/sales.ts 구경로·inventory WarehouseController 이중가드=별건 후속.
