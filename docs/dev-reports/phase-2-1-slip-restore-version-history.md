# Phase 2.1 — 전표 버전이력 + 복원 (slip restore / version history)

> 작성 2026-05-29 · 브랜치 `feat/phase-2-1-slip-restore-version-history`
> 관련 결정: D-RST-01 ~ D-RST-03 (`migration/decisions/DECISIONS.md`), 선행 D-PO-06
> spec: `docs/superpowers/specs/2026-05-29-slip-restore-version-history-design.md`
> plan: `docs/superpowers/plans/2026-05-29-slip-restore-version-history.md`

## 1. 목적

D-PO-06(권한 재편 Phase 1)에서 `can_restore` bit 정의 + 가드만 두고 **RESTORE 메커니즘 구현은 Phase 2 도메인별 spec으로 분리**하기로 결정했다. 본 슬라이스는 그 첫 도메인으로 **전표(slip)**를 택해(D-RST-02), 전표의 모든 변경 시점을 보존하고 임의 시점으로 되돌리는 **버전이력 + 복원**을 구현한다.

- 전표는 다중 작성자(영업/창고/관리자) 충돌 빈도가 가장 높고, 잘못된 수정의 사후 복구 요구가 큰 도메인이다.
- 기존 `slip.audit-revert` page + `AuditOverlay`(field 단위 diff 표시) 인프라가 이미 있어 재사용 효율이 최대다(D-RST-03).

audit-log(field 단위 before/after **표시**)와 본 기능(시점 단위 **복원**)은 역할이 다르며, FE에서 공존 배치한다.

## 2. 데이터 모델 — `slip_revisions` (V27, JSONB 스냅샷)

`services/slip-service/.../db/migration/V27__add_slip_revisions.sql`

각 revision 한 행이 **그 시점의 전표 헤더+라인 완전 스냅샷**을 보관한다(full-snapshot 접근법, D-RST-01).

| 컬럼 | 설명 |
|---|---|
| `slip_id` | 대상 전표 FK (UUID) |
| `revision_no` | 전표별 1,2,3,… 단조 증가 (`maxRevisionNo+1` 채번) |
| `revision_type` | `CREATE` / `EDIT` / `RESTORE` (`SlipRevisionType`) |
| `source_revision_no` | RESTORE일 때 복원 원본 revision (그 외 null) |
| `slip_no` / `slip_date` | 표시용 비즈니스 식별자 스냅샷 |
| `snapshot` | **JSONB** — `Slip.toSnapshot()` 결과(헤더 필드 + 라인 배열) 통째 |
| BaseEntity 7 audit | created_by/at, updated_by/at, version, is_deleted, deleted_at |

> **field-diff replay 기각 사유**(D-RST-01): mutation 경로가 7개(아래 §3)라 diff 누락 시 replay 결과가 silently 어긋나고, 복원이 O(N revisions) 재생이 되어 비용·정합성 리스크가 크다. 스냅샷은 저장 비용(전표당 수~수십 KB)을 감수하고 복원 **정확성·단순성**을 택한 결정이다.

## 3. 캡처 흐름 — content-mutation 7 경로

`SlipRevisionService.capture(slip, type, sourceRevisionNo, …)`를 각 mutation 성공 **직후 같은 트랜잭션**에서 호출한다(스냅샷 일관성). `Slip.toSnapshot()`이 헤더+라인을 직렬화한다.

| 경로 (`SlipService` 등) | type | 비고 |
|---|---|---|
| create (신규 전표) | `CREATE` | rev1 시작점 |
| editHeader (헤더 필드 수정) | `EDIT` | |
| updateSlip (매출/매입 direct PUT) | `EDIT` | |
| applyOverlayPatch (AuditOverlay 단일 필드) | `EDIT` | audit-log와 동시 기록 |
| addLine (라인 추가) | `EDIT` | |
| removeLine (라인 삭제) | `EDIT` | |
| reject-with-reason / restore | `EDIT` / `RESTORE` | 복원 자체도 새 revision 발급 |

> **캡처 완전성**이 복원 정확성의 전제다(D-RST-03). 한 경로라도 capture 훅을 빠뜨리면 그 변경이 스냅샷에 안 남아 복원이 옛 상태로 회귀한다. 본 슬라이스 Task 2~5에서 라인 경로(addLine/removeLine) + editHeader 등 잔여 경로를 보강했다(커밋 `62cd558d`, `6b577e41`).

## 4. 복원 흐름

`SlipRevisionService.restore(slip, targetRevisionNo, …)`:

1. 대상 revision 스냅샷 조회.
2. `Slip.restoreFromSnapshot(snapshot)` — 헤더+라인 통째 복원(현재 행 in-place 갱신).
3. `capture(slip, RESTORE, targetRevisionNo, …)` — 복원 결과를 **새 RESTORE revision**으로 발급(`source_revision_no = targetRevisionNo`). 이력 단절 없음.
4. **마감(period close) lock 가드는 도메인이 책임** — 마감된 전표 복원 시 `BusinessException(CONFLICT, 409)`.
5. 성공 시 SSE `slip:restored` 발행 → FE 버전이력 + 전표 본체 cache invalidate.

## 5. API

`SlipRevisionController` — `@RequestMapping("/slips/{slipId}")`, gateway가 `/api/v1` prefix 부여.

| Method · Path | 권한 (`@RequirePermission`) | 응답 |
|---|---|---|
| `GET /api/v1/slips/{slipId}/revisions` | `slip.audit-revert` · `VIEW` | `SlipRevisionResponse[]` (최신 우선) |
| `POST /api/v1/slips/{slipId}/revisions/{revisionNo}/restore` | `slip.audit-revert` · `RESTORE` | `SlipDetailResponse` (복원된 전표) + 409 마감 lock |

`SlipRevisionResponse` 필드: `revisionNo`, `revisionType`, `sourceRevisionNo`, `slipNo`, `slipDate`, `actorName`, `createdAt`, `changeSummary{headerChanged, lineAdded, lineRemoved, lineModified}`.
`changeSummary`는 `SlipRevisionService.summarize(prev, cur)`가 직전 revision 스냅샷과 대비해 계산한다.

> **UUID 비공개 가드**: 응답에 actorId(UUID) 미포함. 화면 표시는 `actorName`(풀네임) / `slipNo`만 사용([[uuid-no-user-visibility]]).

## 6. FE

- `clients/desktop/src/renderer/api/slipRevision.ts` — `listRevisions(slipId)` / `restoreRevision(slipId, revisionNo)`. ApiResponse envelope `res.data.data` 추출(slipAudit 패턴 동일).
- `clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx` — react-query `['slipRevisions', slipId]` 백필. 행별 배지(CREATE 생성/EDIT 수정/RESTORE 복원) + 변경요약 1줄("헤더 N · 라인 +a/-b/~c"). 최신 revision은 현재 상태이므로 복원 버튼 미노출. "이 시점으로 복원" → DS `Modal` confirm → `restoreRevision` mutation → 성공 시 `['slip', slipId]` + `['slipRevisions', slipId]` invalidate + toast.
- `SlipDetailPage.tsx` — 헤더 정보 카드(AuditOverlay) **옆에** `<SlipVersionHistoryPanel slipId={id} />` 공존 배치(D-RST-03). SSE `slip:restored`/`slip:reverted`/`slip:edit` 수신 시 버전이력 cache invalidate.

## 7. 권한 · 마감 가드

- 권한: 신규 page code 없이 기존 `slip.audit-revert` 재사용(D-RST-03, D-PO-04 평탄 매트릭스 행 증가 억제). 조회=`VIEW`, 복원=`RESTORE` action.
- 마감: 복원 시에도 period close lock 동일 적용 → 409. 일반 가드와 동일 경로.
- MASTER bypass / PARTNER deny는 shared `PermissionAspect` 정책 그대로(D-PO-05/07).

## 8. 검증

### IT (Testcontainers, 커밋 `bbd500e7`)
- 버전이력 목록 / 복원 / changeSummary 계산 / 마감 lock 409 / 권한 가드 — slip-service IT.

### Playwright E2E (Task 7, 본 보고서)
`clients/desktop/playwright/slip-version-history/slip-version-history.spec.ts` (1 spec):
- 전표 상세(`/sales/slip-001`) 진입 → 버전이력 패널 + 목록 렌더.
- 2건(rev2 EDIT 라인 +1, rev1 CREATE) — 배지 + 변경요약 확인.
- 최신(rev2) 복원 버튼 미노출(count 0), 과거(rev1) "이 시점으로 복원" 클릭 → confirm modal → "복원" 확정 → 성공 toast("rev 1") 확인.

**mock 전략**: 데스크톱은 `VITE_MOCK_MODE=1` 시 axios interceptor가 `getMockResponse()` fixture로 백엔드 호출을 가로채므로(실 HTTP 미발생) `page.route`가 발동하지 않는다. 따라서 `mock.ts`에 `GET .../revisions`(2건 결정적 fixture) + `POST .../revisions/{n}/restore`(SlipDetail) mock을 추가하고, spec은 fixture 기반으로 검증한다(다른 desktop spec과 일관). revisions URL이 기존 `/slips` 목록 fallback에 잡히지 않도록 audit-logs 매칭 직후·overlay 매칭 직전에 등록했고, restore(POST)를 revisions(GET)보다 먼저(더 구체적 path) 배치했다.

**실행 결과 (PASS)**:
```
cd clients/desktop
set VITE_MOCK_MODE=1 && npx vite src/renderer --port 5174   # 별도 터미널
set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174 \
  && npx playwright test playwright/slip-version-history --reporter=line
# → 1 passed (2.7s)
```
`npm run typecheck` 통과(에러 0), `eslint src/renderer/api/mock.ts` 통과.

## 9. 범위 (spec 미러)

- 본 슬라이스 = 전표(slip) 도메인 한정(D-RST-02). inventory.warehouse.admin 등 잔여 RESTORE 도메인은 후속 슬라이스에서 본 패턴 차용·조정(일괄 프레임워크 강제 X).
- 복원은 헤더+라인 범위. 첨부/서명/audit-log 자체는 복원 대상 외(표시·증빙은 별도 보존).
- 함수 단위 3-layer 문서화([[feedback_function_documentation]]): (1) 한국어 Javadoc(엔티티/서비스/컨트롤러/FE 컴포넌트), (2) springdoc-openapi(`@Operation`/`@ApiResponse`), (3) 본 dev-report 누적.
