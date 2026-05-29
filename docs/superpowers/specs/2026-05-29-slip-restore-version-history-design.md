# 설계 — slip(전표) RESTORE 버전이력 + point-in-time 복원 (Phase 2.1)

> 권한 재편 Phase 2 의 첫 RESTORE 슬라이스. D-PO-06(RESTORE = Phase 2 도메인별 spec) 이행.
> 브레인스토밍 확정: 2026-05-29. 접근법 = full-snapshot + point-in-time 복원(Approach B).

## 1. 목적 / 배경

사용자 요구 = "복원 = 이전 기록 조회 후 롤백, 전표 단위(`YYYY/MM/DD-{전표번호}`)". Phase 1 은 `can_restore` bit + 기존 2 endpoint(inventory.warehouse.admin, slip.audit-revert) 가드만 정의(D-PO-06).

현재 slip 의 RESTORE 관련 구현:
- `slip.audit-revert`: 협업 overlay 헤더 3필드(memo/shippingAddress/partnerName)의 **단일 revision undo**(`SlipAuditLogService.revertToRevision` — 해당 revision oldValue 재적용). 라인·기타 헤더 미커버.
- `slip_audit_logs`(V18): 필드 diff(old/new) + revision_no, 실시간 협업 SSE 용.

본 슬라이스는 **전표 전체(헤더+라인)의 버전이력을 보관하고 특정 시점(revision)으로 통째 복원**하는 기능을 신규 구현한다.

### 확정 결정 (브레인스토밍)
- **Q1 RESTORE 의미** = 필드 버전 롤백(확장) — un-delete 아님.
- **Q2 첫 도메인** = slip(전표).
- **Q3 범위** = 헤더 + 라인(품목/수량/단가) 전표 전체.
- **접근법** = full-snapshot 테이블 + point-in-time 복원(라인 add/remove 자연 처리, "통째 되돌리기" 시맨틱 정확). field-diff replay(A)는 라인 구조변경에 취약하여 기각.
- **시맨틱 구분**: 기존 audit-revert = "특정 revision **undo**". 본 기능 = "특정 시점 상태로 **point-in-time 복원**". 후자가 사용자 의도.

## 2. 데이터 모델

신규 테이블 **`slip_revisions`** (slip-service, Flyway `V{next}__add_slip_revisions.sql`):

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | |
| `slip_id` | UUID | 대상 전표. **FK 미강제**(soft-delete 후 이력 보존, 회계 감사 일관) |
| `revision_no` | INT | slip별 누적 1씩 증가(버전 번호) |
| `snapshot` | JSONB | 전표 헤더 전 필드 + 라인 배열 전체 직렬화(스냅샷 DTO) |
| `revision_type` | TEXT | `CREATE` / `EDIT` / `RESTORE` |
| `source_revision_no` | INT NULL | `RESTORE` 시 복원 출처 revision |
| `slip_no` | TEXT | `YYYY/MM/DD-{seqNo}` 식별자 스냅샷(표시용) |
| `slip_date` | DATE | |
| `actor_id` / `actor_name` / `actor_color` | UUID / TEXT / TEXT | 변경 주체(UUID 비공개 — 화면은 actor_name) |
| `created_at` | TIMESTAMP | |

- partial unique `(slip_id, revision_no) WHERE is_deleted = FALSE` (BaseEntity 적용).
- **단일 버전이력 원칙**: `slip_revisions` 가 전표 버전이력 + 롤백의 단일 source-of-truth.
- 기존 `slip_audit_logs`(실시간 협업 overlay/SSE)는 **그대로 공존** — 필드 단위 live 협업 채널. (overlay-revert 와 revision-restore 향후 통합은 후속 검토, 본 슬라이스 범위 외.)

스냅샷 직렬화는 **전용 snapshot DTO**(`SlipSnapshot` = 헤더 값 + `List<SlipLineSnapshot>`)로 수행 — JPA 프록시/lazy 연관 직렬화 회피, Jackson 사용.

## 3. 캡처 흐름

전표 내용이 커밋되는 모든 경로에서 `SlipRevisionService.capture(slip, revisionType, actor)` 호출:
1. 전표 생성(`CREATE`) — 최초 revision 1.
2. 메인 전표 수정(`EDIT`) — 헤더/라인 변경 후.
3. overlay 협업 patch(`EDIT`) — 기존 `slip_audit_logs` 기록과 더불어 스냅샷도 캡처(버전이력 일관성).
4. 복원(`RESTORE`) — §4 참조.

캡처 = 현 slip 의 헤더+라인을 `SlipSnapshot` 으로 직렬화 → `revision_no = max(slip_revisions.revision_no for slip)+1` → row insert. **편집과 동일 트랜잭션**(스냅샷은 편집의 일부, 부분실패 시 롤백). actor 는 `X-User-Id`/`X-User-Name`/color 헤더.

> 빈도 우려: 협업 overlay 가 잦으면 스냅샷 다수 생성될 수 있으나, 전형 전표 스냅샷 크기가 작아 Phase 2.1 에서는 mutation 당 1 스냅샷 허용(coalesce/debounce 는 YAGNI, 후속 최적화 후보).

## 4. 롤백(RESTORE) 흐름

신규 endpoint: `POST /slips/{slipId}/revisions/{revisionNo}/restore`
- `@RequirePermission(page = "slip.audit-revert", action = PermissionAction.RESTORE)` — 기존 RESTORE 페이지 재사용(매트릭스/seed churn 회피, 동일 "복원" 의미군).
- 흐름(단일 tx):
  1. 대상 `revisionNo` 의 `slip_revisions` 스냅샷 로드(없으면 404).
  2. **가드**: 마감(daily-closing)/기간마감 lock 시 차단(기존 audit-revert 동일 — 마감 후 복원 불가, 409/422), 전표 상태 가드 보존.
  3. 스냅샷 역직렬화 → 전표 헤더 덮어쓰기 + **라인 전량 교체**(현 라인 삭제 후 스냅샷 라인 삽입).
  4. 복원을 신규 revision(`type=RESTORE`, `source_revision_no=revisionNo`)으로 캡처.
  5. SSE `slip:restored` broadcast(기존 협업 채널 일관).
  6. 갱신 전표 반환(`SlipDetailResponse`).
- 동시성: revision_no 기반(최신 대비 stale 복원 방지 — 복원 시점 최신 revision 확인).

## 5. 권한 / 가드 (행동보존)

- RESTORE action gate — `slip.audit-revert` page 의 기존 grant role 보존(widening 0).
- 마감 lock 보존(behavior-preserving).
- PARTNER deny — slip 버전이력/복원은 내부 admin 기능, partner self-service carve-out 없음.
- MASTER bypass(aspect short-circuit).

## 6. API + FE

**API**
- `GET /slips/{slipId}/revisions` — 버전 타임라인. 각 항목: `revisionNo`, `revisionType`, `slipNo`(YYYY/MM/DD-{seqNo}), `createdAt`, `actorName`(displayName), `changeSummary`(인접 스냅샷 diff 요약 — 변경 헤더 필드 + 라인 추가/삭제/수정 건수). 최신 우선.
- `POST /slips/{slipId}/revisions/{revisionNo}/restore` — §4.

**FE (clients/desktop)**
- 전표 상세 화면에 **"버전 이력" 패널** 추가:
  - revision 목록: `YYYY/MM/DD-{전표번호}` + 시각 + actor displayName + 변경요약(예: "헤더 2필드 · 라인 +1/-0/~2").
  - 각 항목 "이 시점으로 복원" 버튼 → confirm modal(영향 명시) → restore API → 성공 시 전표 화면 invalidate/갱신 + 토스트.
  - `RESTORE` revision 은 "복원됨(rev N에서)" 배지.
- 기존 audit timeline UI 컴포넌트/패턴 최대 재사용. **UUID 비공개**(actor displayName/role 만, UUID 는 key/param).
- React Query: restore 성공 시 `['slip', id]` + revisions 쿼리 invalidate.

## 7. 테스트

**BE IT** (Testcontainers Postgres, `AbstractPostgresIT`):
- 전표 생성/수정 시 `slip_revisions` 캡처(revision_no 증가, snapshot 정합).
- 과거 revision 복원: 헤더 + 라인 복원, **라인 추가/삭제/수정** 케이스 각각 복원 정확.
- 복원이 신규 RESTORE revision 기록(source_revision_no).
- 마감 lock 시 복원 차단(deny).
- RESTORE 권한 deny(비-grant role 403) + MASTER bypass.
- `GET /revisions` 타임라인 + changeSummary.
- `@MockBean DynamicPermissionClient` 7-action stub + `X-User-Id` 헤더(see-saw 회피, [[feedback_enforcement_real_http_test]] 정합).

**FE**: typecheck + Playwright(버전이력 패널 렌더 + 복원 confirm 흐름, /revisions·restore mock).

## 8. 범위

- **IN**: slip 전표 full-snapshot 버전이력 + point-in-time 복원(헤더+라인).
- **OUT (후속 슬라이스)**:
  - 타 도메인(inventory stock/transfer/detail, accounting, partners, sales) RESTORE — slip 패턴 검증 후 `shared:realtime-abstraction` 일반화 검토(Phase 2.2+).
  - un-delete(소프트삭제 복구) — Q1 = 값 롤백 선택, 본 슬라이스 제외.
  - overlay-revert(slip.audit-revert 기존) 와 revision-restore 통합 — 후속.
  - 스냅샷 coalesce/retention 정책 — 후속 최적화.

## 9. 분해 (Phase 2 RESTORE 로드맵)

- **2.1 (본 슬라이스)**: slip 전표 — reference 구현.
- 2.2+: 도메인별 동일 패턴 적용. slip 검증 후 공통 부분(snapshot 캡처/복원/타임라인 API)을 `shared` 로 추출 검토.
