# E2 롤아웃 — 견적 목록 실시간 동기화·soft-delete 취소선·복원

- PR #759 · 브랜치 `feat/e2-rollout-estimate-list`
- 배차·거래처(#756/#760)·주문(#757)·판매전표(#758)에서 확립한 **E2 목록 실시간 동기화 + 취소선 soft-delete/복원 패턴**을 견적 목록으로 롤아웃. 5-PR 파이프라인 마지막(auth 마이그 머지순 C(V83)→D(V84)→**E(V85)**).

## 구현
- **FE**(`clients/desktop/.../routes/EstimateListPage.tsx`): 목록 SSE(`EstimateListRealtimeClient`) 실시간 반영·soft-delete 행 **전 데이터열 취소선(`DELETED_ROW_TEXT_STYLE`) + "삭제: {이름}" 배지**(UUID 비노출)·삭제행 status 배지 중립(Badge neutral)·**복원 버튼**(RESTORE 권한 게이트·삭제행만)·삭제행 클릭차단(`rowClickable`+`onRowClick` isDeleted 가드).
- **BE**(slip-service `estimate/`): `EstimateService.delete()`=헤더만 `markDeletedWithName`(soft-delete tombstone·`converted_slip_id`/원장 무관)·`restore()`=헤더만 `markRestoredWithNameCleared`. 견적 라인은 `orphanRemoval=true`(편집 시 hard delete)·**라인 soft-delete 진입점 없음**. auth **V85**(복원권한 MASTER/MANAGER/SALES 3역할·narrow ON CONFLICT)·slip **V57**(deleted_by_name).

## 듀얼리뷰 수렴 (적대검증 다층 포착)
- **R1 Opus 5-agent** + fix(`dd4dc885a`): HIGH-1 V85 복원권한 MASTER만→3역할(V83/V84 정합)·LOW-1 upsert 좁힘·Design MED×4(배너 danger-700·rowClassName 틴트·헤더 토큰·deleteEstimate dead code). 📌HIGH-2 CONVERTED 삭제=허용 유지(개발책임자 결정).
- **STEP4 Opus 독립 적대검증(Codex Jul11 한도 대체·개발책임자 승인)** 4-agent가 **R1·BE·DevOps가 놓친 2 HIGH 포착** → Opus fix(`82e7da7e6`):
  - Design HIGH: 삭제행 취소선이 견적번호 1열에만(5열 정상렌더·totalAmount strong 강조) → 전 데이터열 적용(주문 C 미러).
  - FE HIGH: mock `MOCK_ACTION_ONLY_PAGES` estimates.list RESTORE 누락 → mock 모드 MANAGER/SALES 복원버튼 미렌더(BE V85 3역할 mock 검증불가) → 등록 + mock.test 2케이스 + `mockActionMatrixFromRole` parity(`509707e8c`).
- **D-family 구조 안전 실증**(BE 적대): `EstimateLine` soft-delete 진입점 0 → 슬립(D) over-restore·레거시 빈껍데기·주문(C) 시각매칭 결함군 **구조적 불가**. `EstimateLine` vestigial 필드 footgun Javadoc 추가(향후 라인 soft-delete 시 Slip 단일시각/시각매칭/fail-loud 준용 경고).

## 검증
- **slip-service Estimate 82 tests**(Testcontainers·`--rerun-tasks`·신규 CONVERTED delete→restore 회귀 IT 포함)·auth **V85SeedIT 3/3**·auth 366/580 tests 0 fail.
- desktop typecheck 0·**vitest 664/664**(신규 mock 3역할 2케이스)·mock.test 49.
- **라이브 GUI QA**(mock 모드·역할전환·실 렌더): 삭제행 6열 취소선·MANAGER/SALES 복원버튼+복원 round-trip. 증적 `docs/qa/e2-rollout-estimate-list/step4-*.png`.
- CI green(headSha 일치·genuine).

## 개발책임자 결정
- **CONVERTED(주문 전환 완료) 견적 삭제 = 허용 유지**: 견적은 주문과 달리 전환 후에도 soft-delete 삭제·복원 가능(tombstone·원장 무관). R1의 "주문 준용 차단" 미채택.

## 후속/백로그
- Design 배지텍스트 '삭제됨' 통일(C=텍스트보존[F-1] vs D/E='삭제됨' → 에픽 3화면 통일 결정 필요)·다크모드 헤더(`.salesScope --c-bg:#fff` 하드코딩 6화면 공유 pre-existing)·`deletedRowDisplay` 4중 중복 SSOT·`.error-banner --color-semantic-danger` 미정의(90+파일 sweep).
- BE M1(견적 read-path X-Is-Partner 명시가드·EstimateClient 실HTTP 이식 시)·partial-match 등 D 백로그 계열은 견적 무관(orphanRemoval).
- Codex 복구(Jul11) 후: STEP4 소급 Codex 재검(선택).
