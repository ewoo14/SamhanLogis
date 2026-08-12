# #1092 머지 충돌 및 Estimate IT 수정 보고 — CODEX LUNA

## 결과

`origin/main` 머지는 충돌 4개에서 멈춘 상태이며, 충돌 마커는 모두 제거했다. `git add/commit`은 사용자 지시대로 실행하지 않았다. PM이 최종 stage/commit을 수행해야 한다.

## 충돌 4개 해소 근거

1. `EstimateDetailPage.tsx`
   - `main`의 `useLocation`, `getReturnTo`, `returnEntryKey`, 목록 뒤로가기(`history back` 우선, fallback replace)를 보존했다.
   - 브랜치의 `toOrderPathId(e.id)` 기반 opaque token 인쇄 URL과 opaque token 편집 URL을 보존했다. 화면에는 `estimateNo`만 표시한다.

2. `EstimateListPage.tsx`
   - `main`의 query state, `saveScrollAnchor`/`restoreScrollAnchorWhenReady`, `returnTo`/`returnEntryKey`, 문서번호 표시 하이퍼링크를 보존했다.
   - 단, URL은 문서번호가 아니라 API `row.id` opaque token을 `encodeURIComponent`하여 생성하도록 합쳤다. 따라서 문서번호 하이퍼링크의 사용자 표시 계약과 opaque 식별자 계약을 동시에 만족한다.
   - 행 클릭도 동일한 token URL과 return state를 사용한다. `toOrderPathId`로 token을 정규화해 훼손하지 않도록 했다.

3. `EstimateListPage.test.tsx`
   - `main`의 문서번호 표시 하이퍼링크 검증과 브랜치의 slash/token 경로 검증을 모두 남겼다.
   - 기대 URL은 화면 문서번호가 아닌 opaque `id`이며, navigate 호출의 return state도 검증한다.

4. `S27SlipRouteContractTest.java`
   - 브랜치의 `slip-service-estimate-snapshots-v1` full controller path 계약을 보존했다.
   - `main`의 partner-auth `ForwardedClientIp` 및 `StripInboundIdentityHeaders` 순서 계약도 별도 테스트로 보존했다.

## Estimate 13건 판정표

`main` 별도 실행은 수행하지 못했다. 사용자가 금지한 `checkout`/추가 worktree 생성 없이 현재 worktree에서 두 revision을 실제 Gradle로 동시에 실행할 수 없기 때문이다. 대신 `git diff origin/main...HEAD -- services/slip-service`로 변경 경계와 실패 원문을 대조했다. 13건 모두 opaque 응답/경로 축과 직접 일치하여 (a)로 판정했다.

| 테스트 | main 결과 | 판정 |
|---|---|---|
| `EstimateControllerIT > deleteAndRestore_convertedEstimate_preservesStatusAndSlipTableUntouched` | 미실행; main에는 opaque `convertedSlipId` 변경 없음 | (a) |
| `EstimateRevisionRestoreIT > 권한: RESTORE deny 이어도 MASTER 역할 → aspect bypass 200` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 복원: 타입불일치 snapshot revision 은 명확한 내부오류로 거부한다` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 타임라인: 생성(CREATE rev1) + 라인 추가 수정(EDIT rev2)` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 타임라인: JSONB null/필수키 누락 snapshot` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 복원: 라인 제거(2→1) 후 rev1 복원` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 타임라인: 타입불일치 snapshot row` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 복원 차단: QUOTE_ACCEPTED` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 권한: RESTORE deny + 비-MASTER` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateRevisionRestoreIT > 복원: rev1(1라인) 시점으로 복원` | 미실행; main은 UUID 응답 계약 | (a) |
| `EstimateCollabIT > comment_roundtrip_add_list_resolve_softDelete` | 미실행; main은 UUID comment id 응답 계약 | (a) |
| `EstimateCollabIT > commitEdit_onAcceptedEstimate_appliesMemoValidUntilAndLineNoteAndRecordsHistory` | 미실행; main은 UUID edit id 응답 계약 | (a) |
| `EstimateControllerSecurityContractTest > writeEndpointsUseSingleRequirePermissionGuardWithoutManualSystemMasterGuard` | 미실행; main reflection은 UUID path parameter | (a) |

## RED → GREEN 원문

초기 RED:

```text
148 tests completed, 13 failed
EstimateControllerIT ... DataIntegrityViolationException
EstimateRevisionRestoreIT ... 9건 IllegalArgumentException at EstimateRevisionRestoreIT.java:378
EstimateCollabIT ... 2건 IllegalArgumentException at EstimateCollabIT.java:138/197
EstimateControllerSecurityContractTest ... NoSuchMethodException at line 47
```

원인 확인 후 수정:

- public opaque token을 `OpaqueUuidCodec.decode`로 내부 UUID에 복원하도록 IT helper/SQL 검증을 수정했다.
- security reflection의 path variable 타입을 `UUID`에서 `String`으로 맞췄다.
- 목록 read DTO에서 제거된 `convertedSlipId` 검증을 제거했다.
- opaque URL에서 문서번호 정규화 helper 사용을 제거했다.

최종 GREEN:

```text
BUILD SUCCESSFUL in 1m 24s
148 tests completed, 0 failed
```

## 불변식 3 재확인

기존 `2026-08-13-1092-liveqa6-sol.md`의 증거를 기준으로 재확인했다. 상세·협업·편집·인쇄, deep-link 새로고침, token 일관성, 화면 token 비노출, UUID 0건(견적 목록/상세/중첩 line), 원본 문서번호 표시 및 건수 `64 · 45 · 4 · 4 · 11`은 병합에서 삭제하지 않았다. 목록은 표시 문서번호와 opaque token URL을 분리해 보존했다.

## FE/기타 검증

- `npm run typecheck`: GREEN.
- 병합 영향 FE: `EstimateDetailPage.test.tsx` 4 tests, `EstimateListPage.test.tsx` 12 tests — 16 passed.
- 전체 `npx vitest run`: 기존 환경 결함 1건으로 실패. `build-output-cjs-interop.test.ts`의 Electron 설치 오류이며 이번 변경과 무관하다. 나머지 실행 테스트는 통과했다.
- 전체 `npm test -- --run`: real-QA scope/pretest 포함으로 120초 timeout. 전체 공식 수치 주장은 하지 않는다.

## 종료 점검

- `git ls-files --deleted`는 점검 시 `tools/.s24-build-only/build/deep/tracked-writer.mjs`를 보고했으나, `HEAD` 내용(`const OUT = 'docs/qa/.s24-build-only.png'`)으로 복원했다. 최종 삭제 추적 파일은 없어야 한다.
- 제가 띄운 renderer/Playwright 프로세스와 5175 listener는 없다. 8080은 기존 gateway PID 28452가 listen 중이라 종료하지 않았다.
- 임시 컨테이너는 이 라운드에서 생성하지 않았다.
- 현재 워킹트리는 PM이 `git add`할 수 있도록 merge-conflict index 상태(`UU` 4개)를 의도적으로 유지한다.
