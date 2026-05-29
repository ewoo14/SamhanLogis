# Claude FE 리뷰 — PR #316 권한 재편 Phase 1 (cycle 1)

> 리뷰어: Claude (FE)
> 대상: `feat/phase-1-permission-overhaul-framework` / `gh pr diff 316 -- clients/desktop`
> 범위: permissionsApi.ts / usePermissions.ts / PermissionGuard.tsx / PermissionMatrixPage.tsx / PermissionMatrixBulkPage.tsx / AppLayout.tsx / routes/index.tsx / mock.ts / playwright 3종
> 검증: `clients/desktop npm run typecheck` PASS (exit 0). BE 대조: PermissionAdminController / AccountPermissionService 계약 확인.

## 종합 판정

**APPROVE (조건부 — P0 없음).** 계정×page×7-action 전환의 FE 구현은 BE 계약과 타입/경계 변환이 정합하며, fail-closed·UUID 비공개 두 핵심 위험 모두 충족한다. 발견은 P1 1건(매트릭스 컬럼 일괄 토글의 dirty 기준 정합), P2 3건, Minor 4건으로 모두 회귀 위험 없는 개선/완결성 항목.

## 핵심 위험 검증 결과 (요청 항목)

| 위험 | 결과 | 근거 |
|---|---|---|
| UUID 사용자 노출 | **PASS** | 계정 UUID 는 `<option value>` / `data-testid` / route param 에만 사용. 화면 텍스트는 `accountOptionLabel`(displayName + role 라벨)·`account.displayName`·`ROLE_LABEL` 만 렌더. bulk 미리보기 테이블도 displayName/role 만. ([[uuid-no-user-visibility]] 준수) |
| fail-closed (미로드/미부여) | **PASS** | `usePermissions.canAccess`: `if (!query.data) return false`. 동기 `canAccess`: `if (_permissionsCache === null) return false`. AppLayout `showPermissionAdmin = role==='MASTER' && dynamicCanAccess(...)` — 캐시 전엔 false → 메뉴 flash 0. applayout.spec.ts 가 gate-promise 로 "응답 전 메뉴 미노출" 실증. |
| edit→update shim 의미 | **PASS** | `normalizePermissionAction(edit→update)`. V39 가 `can_edit→create+update+delete` 로 전개하므로 잔존 3 callsite(`action="edit"`)가 `update` 검사로 매핑돼도 마이그레이션 계정은 update=true 보유 → 행동보존. (상세 P2-1) |
| React Query invalidate / dirty / 저장 동기화 | **PASS** | 저장/템플릿/복사/bulk 모두 `['admin','permission-account-matrix', id]` + `['permissions','my']` invalidate. dirty = serverState vs currentState diff(`accountDirtyKeys`), 저장 성공 시 `setEditState(null)` + `matrixQuery.dataUpdatedAt` effect 로 재동기화. |
| 타입 일관성 (BE 대문자 ↔ FE 소문자) | **PASS** | `/my` BE 응답 = `Map<String,List<String>>` 대문자 → `actionsFromRaw` 가 `toLowerCase()` + `edit→update` 정규화 + union 필터. account matrix BE = `ActionMatrix` object → `actionMatrixFromRaw` 가 7-key 기본값 머지. bulk payload string UUID → BE `List<UUID>` Jackson 역직렬화 OK. |
| 대량 행(169) 렌더 성능 | **수용 가능** | 169 page × 9 col 단일 `<table>` 가상화 없음. `setPageActions` 가 매 토글마다 전체 state 객체 복제(O(page)). 일반 admin 도구 빈도 기준 허용. (Minor-4) |

---

## P0 — 0건

없음.

## P1

### P1-1 컬럼 일괄 토글이 "현재 표시된 페이지" 기준이라 검색 필터 상태에 따라 의도와 다른 일괄 결과 가능
- `PermissionMatrixPage.tsx:768-775` `toggleColumn` + `:984` 헤더 라벨 `페이지 ({visiblePages.length})`.
- 컬럼 헤더 클릭 시 `visiblePages`(검색 필터 적용 후 가시 page 집합) 에만 적용한다. 검색어가 걸린 상태에서 "VIEW 컬럼 전체"를 누르면 필터링되지 않은 page 는 제외된다 — confirm 모달이 `${pages.length}개 페이지` 로 개수를 고지하므로 데이터 손상은 아니나, spec §7-2 "컬럼 헤더 클릭 = 해당 action 의 **전 page** 일괄 toggle" 의 문구와 어긋난다(검색 비활성 시는 일치). 또한 `전체ON/전체OFF`(`:896,:903`) 도 동일하게 `visiblePages` 기준이라 검색 중 "전체ON"이 표시 행에만 적용된다.
- 권고: 의도(필터-스코프 토글)면 confirm 문구를 "표시된 N개" 로 유지하되 spec 문구를 정정. 의도가 전 page 면 `PAGES_ORDER` 기준으로 변경. 둘 중 하나로 명시 정렬(현재는 코드/spec 불일치). dirty 추적·저장 자체는 정상이라 회귀는 아님 → P1.

## P2

### P2-1 edit→update shim 은 update 만 검사 — 잔존 callsite 가 "삭제 권한"까지 의도했다면 narrowing 가능
- `permissionsApi.ts:380-382` + 잔존 callsite `routes/index.tsx:1089,1109`(sales/purchase-slip `action="edit"`), `accounting/admin/PartnerAgingSnapshotPage.tsx:31`(`'edit'`).
- 레거시 2-action `edit`=create+update+delete 통합 권한이었다. shim 은 `update` 단일 bit 만 본다. 마이그레이션 계정은 세 bit 동시 부여라 현 상황 무해하나, MASTER 가 매트릭스에서 한 계정의 `update` 만 끄고 `delete` 는 켠 경우 — 레거시 게이트는 통과시켜야 했을 화면을 막는다(narrowing). 반대 케이스(update on, delete off)는 widening.
- 권고: dev-report §7 의 "action=edit → 명시 7-action prop 정리(Phase 2)" 후속을 유지하되, 잔존 3 callsite 의 의도를 본 PR 주석으로 1줄 명기(특히 slip refresh = update 의도임). 회귀 0(마이그레이션 동등) 이므로 P2.

### P2-2 매트릭스 컬럼/도메인 일괄 toggle 에 적용 후 결과 토스트/되돌리기 안내 없음 + 컬럼 confirm 만 있고 도메인 전체ON/OFF 는 confirm 없음
- `PermissionMatrixPage.tsx:768-775`(컬럼=confirm 있음) vs `:1017`/`AccountMatrixDomainRows onDomainSet`(도메인 전체ON/OFF=confirm 없음), `:896,:903`(전역 전체ON/OFF=confirm 없음).
- 컬럼 토글만 모달 확인을 받고 도메인/전역 일괄은 즉시 대량 변경한다. 169행 도메인(예: 회계 60행) "전체ON"이 클릭 한 번에 dirty 다수 생성 → 실수 위험. 일관성 부재.
- 권고: 도메인/전역 일괄에도 confirm(또는 컬럼 confirm 제거로 통일). dirty 패널 `취소`(`:1055`)가 되돌리기를 제공하므로 데이터 영구손상은 아님 → P2.

### P2-3 템플릿 적용 selector 가 MASTER/PARTNER 역할도 노출 — 무의미/위험 템플릿 선택 가능
- `PermissionMatrixPage.tsx:879`(`Object.keys(ROLE_LABEL)` 전체) + Bulk `:444`.
- `ROLE_LABEL` 은 PARTNER·MASTER 포함 11개 전부를 템플릿 후보로 노출한다. PARTNER 는 내부 enforcement 대상 아님(spec §6-3), MASTER 템플릿은 `role_page_permission_templates` 에 존재하지 않을 수 있어 `applyTemplate` 가 0건 반환(무해하나 사용자 혼란). 미리보기 없이 즉시 적용(`applySelectedTemplate` confirm 만, spec §7-2 "미리보기→확정" 미구현).
- 권고: 템플릿/필터 selector 에서 PARTNER 제외(+ MASTER 제외 검토). spec §7-2 "템플릿 적용 미리보기" 는 본 PR 미구현 — Playwright(matrix.spec) 도 템플릿 경로 미검증이라 사이클 내 의도 확인 필요.

## Minor

- **M-1 BE PageCode 3종 매트릭스 UI 누락**: `ecount.mig2.product` / `ecount.mig2.warehouse` / `ecount.mig5.stock-transfer` 가 BE enum 에만 존재하고 FE `PAGE_GROUPS` 에 없어 per-account 매트릭스에서 편집 불가. 단 셋 모두 `@RequirePermission` / 상수 참조 0건(orphan, spec §5 "dead 코드 정리" 대상)이라 실 enforcement 영향 없음 → Minor. (그 외 169개 활성 코드는 FE 매트릭스 100% 커버, 역방향 stale 행 0건 확인.)
- **M-2 Playwright 가 BE 실제 대문자/object 응답 미검증**: matrix/bulk/applayout spec 의 `/my` mock 은 소문자 `['view','update']`, account matrix mock 은 소문자-key object 를 반환한다. 실 BE 는 `/my` 대문자(`["VIEW",...]`), matrix = `ActionMatrix`. FE `actionsFromRaw` 의 `toLowerCase()`·`edit→update` 정규화 경로가 테스트로 실증되지 않음(typecheck/IT 로는 안전). 권고: mock 1건이라도 대문자 응답으로 변경해 정규화 회귀 가드.
- **M-3 PermissionGuard 로딩 중 children 통과 — AppLayout fail-closed 와 정책 상이**: `PermissionGuard.tsx:42-44` 는 `isLoading` 시 children 렌더(깜박임 방지). admin-matrix route 는 외곽 `RoleGuard allow=['MASTER']` 가 비-MASTER 를 먼저 차단하므로 권한 누설 없음(defense-in-depth OK). 단 일반 page 가드에서는 "미로드 중 잠깐 보호 화면 노출 후 redirect" 가능 — 메뉴는 fail-closed 인데 라우트는 fail-open(로딩 한정). 의도된 트레이드오프면 유지, 아니면 spinner 로 통일 권고.
- **M-4 169×9 단일 테이블 비가상화**: 토글마다 `setPageActions` 전체 state 복제 + 전 행 리렌더. admin 저빈도 도구라 수용. 검색 입력에 debounce 없음(`:936`) — `filteredPageGroups` 가 매 키 입력마다 169행 재계산(메모는 search 의존). 체감 무난하나 대규모화 시 debounce 고려.

## 정합성 추가 확인 (이상 없음)

- `fetchAccountMatrix` 가 BE 전 173 PageCode object 응답을 cell 로 평탄화 → `accountMatrixToState` 가 `PAGES_ORDER` 초기화 후 덮어쓰기. UI 미정의 page 는 무시(안전).
- bulk `payload` useMemo 의존성에 `mode/selectedAccountIds/selectedActionList/selectedPage/templateRole` 포함 — grants 모드 0-action 시 `null` 반환으로 미리보기 차단(`canPreview`). 정상.
- 저장 시 dirty page 단위로 7-action 전체 매트릭스를 PUT(`saveChanges:784`) → BE `updateAccountMatrix` upsert 와 정합(부분 action PUT 아님, 전체 행 덮어쓰기 의도 일치).
- `data-testid` 네이밍: `perm-matrix-cell-{pageNorm}-{action}`(dot→dash), `perm-matrix-col-all-{action}`, `perm-matrix-domain-all-{id}[-off]`, `perm-matrix-row-all-{pageNorm}`, `perm-bulk-*` — Playwright spec 셀렉터와 1:1 일치 확인.
