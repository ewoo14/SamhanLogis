# SP-D3 매입/매출/배차 — Claude TM cycle 1

HEAD: `dad4744c`
PR: #243

## 결정

**APPROVE** — Claude/Codex 양쪽 CRITICAL 3건 + MAJOR 2건 모두 cycle 2 내 해소.

## Cycle 2 fix (12 file)

| # | blocker | fix |
|---|---|---|
| F-BE-01 | SlipController WRITE 8개 엔드포인트 checkEdit 미적용 | ✅ `checkEditPermissionBySlipType` 헬퍼 + create/editHeader/updateV20/addLine/removeLine/save/send/cancel 적용 |
| F-FE-01 / F-DevOps-01 / Codex blocker 2 | V7 seed SALES dispatch.board=TRUE (사용자 요구 ② 침해) | ✅ V9 신규 마이그레이션 — SALES dispatch.board FALSE + WAREHOUSE purchases.receipt-ocr TRUE + WAREHOUSE sales.slip.list FALSE 정합 |
| Codex blocker 1 | dispatch.board FE 라우트 slip-service 호출 vs BE 동적 가드 arologis | ✅ DispatchBoardAdminController + DispatchTaskAdminController (slip-service) 가드 추가 |
| F-BE-03 | DispatchSmsSaveHistoryController VIEW 가드 | ✅ 이미 적용됨 (확인) |
| F-FE-02 | Playwright testid AppLayout 불일치 | ✅ 정상 확인 |
| Codex blocker 3 | Playwright self-test false-red (정규식 자기 매칭) | ✅ self-test 범위 describe 이전 코드로 한정 |
| F-QA-01 | C5 RuntimeException assertion 약함 | ✅ canView=false stub + 403 명시 |
| F-QA-03 | domain-integrity §3 SALES dispatch.board 기대값 1 | ✅ V9 seed 정합 후 0 정정 |
| 3 dispatch IT 누락 | @MockBean DynamicPermissionClient 없어 Eureka 500 트랩 | ✅ DispatchBoardAdminControllerIT / DispatchTaskAdminControllerIT / DispatchModificationCancellationIT @BeforeEach lenient stub 추가 |

## 검증

- `./gradlew :services:slip-service:compileTestJava :services:auth-service:compileTestJava` **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) **PASS**
- 사용자 요구 ② SALES/WAREHOUSE/DISPATCH hidden 보장 (V9 seed 정합)

**TM 결정: APPROVE → CI green 도달 시 머지 가능.**

Claude 5-agent TM — 2026-05-18
