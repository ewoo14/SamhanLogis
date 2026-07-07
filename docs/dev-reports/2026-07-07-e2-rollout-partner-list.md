# E2 롤아웃 — 거래처 관리 목록 실시간 동기화·soft-delete 취소선·복원

- PR #756 · 브랜치 `feat/e2-rollout-partner-list`
- 배차 파일럿(#699/#700)에서 확립한 **E2 목록 실시간 동기화 패턴**을 거래처 관리 목록으로 롤아웃.

## 구현
- **FE**(`clients/desktop/.../routes/admin/PartnersPage.tsx`): 목록 SSE(`useCollectionRealtime`, `/admin/partners/list-realtime`)로 멀티 워크스테이션 실시간 반영·soft-delete 행 **취소선 + "삭제:{이름}" 배지**(UUID 비노출)·**복원 버튼**(권한 게이트)·status 필터.
- **BE**(partner-service): `searchAdminIncludingDeleted`(삭제 메타 deleted_by_name)·`CollectionRealtimePublisher`(afterCommit DELETED/RESTORED/BULK_UPDATED 발화)·`restore()`·게이트웨이 SSE 라우트. auth V82(복원 권한 시드). partner V13(deleted_by_name).

## 듀얼리뷰 수렴 (데이터 무결성·계약·동시성·접근성 다수 포착)
- **R1 Opus 5-agent**: 🔴**CRITICAL** — `searchAdminIncludingDeleted`가 enum 을 native query 에 raw 바인딩 → status 필터 **영구 0건**. + HIGH(단건보장·IT isolation) → Opus fix(`.name()` String 변환·`ORDER BY is_deleted DESC LIMIT 1`·native delete isolation).
- **라이브 QA**(standalone jar + 실 partner_db): status 필터(ACTIVE 51/SUSPENDED 5)·2연결 목록 SSE(DELETED→RESTORED)·삭제 취소선 메타·복원 실증([[standalone-boot-real-qa]]).
- **R2 Opus 5-agent**: Design MED(복원 배너 대비 3.29:1 AA미달→`var(--color-danger-700)` 7.27:1)·FE MED(복원 onError `error.message` 영문만→`extractApiErrorResponseMessage` BE 한국어)·**BE HIGH**(`restore()` dual-row — 삭제행+동일코드 활성행 공존 시 복원하면 활성 unique 위반 500·E2 UI 도달가능 → 사전 CONFLICT 409 가드 + dual-row IT).
- **Codex STEP4 5-agent**: **status/type 실계약버그**(FE는 `status=` 전송·구 BE는 `type=`만 바인딩 → FE 상태필터 미동작 → status 정식 param+type fallback)·삭제행 dead affordance(DataTable `rowClickable` predicate 하위호환)·**unique race 500→409 매핑**·Ecount import 후 SSE BULK_UPDATED 누락·mock parity·IT FK cleanup.
- **R3(FE/BE)**: BE clean(664 tests 재실행)·FE 4핵심 정상(DataTable 전소비자 하위호환 검증). LOW/NIT(mock RESTORE 엣지·CSS 컨벤션·JSDoc·scaffolding·EcountTest never()갭)=후속.
→ 결함 궤적 급수렴: CRITICAL/HIGH → MED/HIGH → 계약/race → LOW/NIT.

## 검증
- 라이브(위) + real-PG IT(status 필터·dual-row 복원 409·delete/restore SSE 발화·권한 매트릭스) + CI(Playwright mock·JUnit partner+auth 664·Frontend).
- ⚠️ mobile-s2-drawer.spec.ts 사전존재 flaky(Track B 무관·타 브랜치 동일)로 Playwright 간헐 red → rerun.

## 후속(별도)
- Partner `@Version` optimistic lock(신규 마이그 필요·last-write-wins 잔존).
- LOW/NIT 정리(mock RESTORE already-active 200 parity·PartnersPage.css → *.module.css·adminApi JSDoc·typeFilter scaffolding 제거).
- 공용 `deletedRowDisplay.ts` 승격(Track C 머지 후 통합).

## 소급 재검 fix (#760) — 2026-07-07

Track B 머지(#756) 후 **full 5-agent + 실 GUI 라이브 QA 소급 재검**(축소 라운드 보완)이 잡은 결함 fix-forward:
- **🔴 CRITICAL**: `searchAdmin`/`findAll` 이 무조건 `searchAdminIncludingDeleted`(native, @SQLRestriction 우회) 위임 → 공유 `/admin/partners/search`·`/admin/partners` 가 삭제(취소선) 거래처를 자동완성 5소비처(견적/입금/세금계산서/전표/계좌매칭)에 노출 → **`includeDeleted`(기본 false=활성전용 JPQL)** 게이팅·PartnersPage listAdminPartners 만 true. 라이브 실증: 삭제 후 `search`(includeDeleted 미전송)=`items:[] total:0`, `?includeDeleted=true`=노출.
- HIGH: 복원버튼 `aria-disabled` 전파 제거·FE 삭제버튼 신설. Design HIGH: 실시간 인디케이터 대비.
- R1(소급) fix: 삭제배지 단일 inline-flex 래퍼(모바일 카드뷰 배지 우측벌어짐 해소)·status 필터 IT native경로 재커버(`includeDeleted=true` enum-CAST 가드)·컨트롤러 includeDeleted Javadoc·`restoreError`→`actionError`(삭제/복원 공용 명칭).
- 라이브 GUI 증적: `docs/qa/e2-partner-list-retro/*.png`(삭제버튼→취소선→복원·모바일 배지).

⚠️ **교훈**: 미커밋 편집 중인 worktree에 git 조작(cleanup)하는 백그라운드 QA 에이전트를 동시 실행하면 편집이 revert됨 — 중복 에이전트는 즉시 정리, QA는 커밋 후 실행.
