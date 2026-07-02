# task5 배차 전표확인 = 판매전표 미리보기

- **PR**: #702 · **일자**: 2026-07-03 · **구현**: Codex(gpt-5.5) · **리뷰/fix**: 순차 듀얼리뷰(Opus 5-agent + Codex)

## 목표 (개발책임자 확정)
배차 "전표확인"을 (텍스트 요약) → **판매전표 문서/인쇄 양식 미리보기**로. 배차는 full-form 없어 E2/배차 편입 정상.

## 구현
- `SlipDetailModal`(배차보드 전표확인 모달, 2진입점[미배차 row·차량그룹 정차 row] 동일 수렴) 본문을 텍스트 요약 → **`DispatchDocument`(판매전표 문서, props-only 재사용·신규 컴포넌트 0)** 로 교체.
- `getSlip` + `listWarehouses`(→sourceWarehouseName) + `fetchApprovalLineStructure('SLIP_OUTBOUND')`(→roles) 병렬 조회 후 주입. 로드 실패 graceful(fallbackRoles·'-').
- 상단 compact **기사명/기사 연락처** 헤더 유지(배차 운영정보). 인쇄버튼 생략(모달 오버레이↔전역 print CSS 충돌 회피).

## 순차 듀얼리뷰 — Opus 라운드1 적발·fix (Opus 직접)
- **[HIGH·Design+FE]** A4 문서 폭 오버플로: Modal `size="lg"`(가용 ~680px) < zoom wrapper `minWidth:210mm`(~794px)·`.dispatch-page`(703px). `useFitOneA4`는 **높이만** 판정 → 짧은 전표(대다수) zoom=1 → 우측(결제예정일·수량 컬럼) 잘림. → **Modal `size="xl"` + wrapper minWidth 제거**.
- **[HIGH·Design]** 인쇄용 `useFitOneA4`(1페이지 fit)를 **스크롤 모달**에 재사용 → 12줄+ 전표 minZoom 0.5(~5.5pt) 강제 과축소(모달은 이미 overflow-y:auto). → **모달선 zoom 제거·1:1 렌더 + 세로 스크롤 위임**.
- **[MED·FE]** 창고/결재 쿼리 `enabled:!!slip`(slip 로드 후 순차) → cold-cache 깜빡임(CALL_COUNT=2). → **`enabled:!!slipId`**(getSlip 과 병렬, DispatchView 패턴 통일).
- **[LOW·Design]** 닫기버튼 dead token `--color-action-brand`→`--color-brand-500`. **[LOW·Design]** 헤더 "연락처:"→**"기사 연락처:"**(문서 본문 수요처 "연락처:"와 구분). **[NIT·FE]** 문서 스크롤 컨테이너 `tabIndex={0}`(키보드 스크롤).

## ✅ 개발책임자 결정 완료 (2026-07-03 → V79/#706 해소)
- ✅ **[해소 — auth V79/#706, 2026-07-03 개발책임자 결정=후속안 (a) 채택] DISPATCH 역할 `inventory.warehouse` VIEW 권한 갭**: `listWarehouses()`가 `@RequirePermission(inventory.warehouse, VIEW)` 가드 → V10 시드상 **DISPATCH 역할=FALSE** → 배차 핵심 페르소나(DISPATCH 계정)는 403 → 판매전표 "출고창고" 필드가 조용히 '-'(graceful, 크래시 없음). MASTER/MANAGER 정상(라이브 QA 실증: dev_master 에서 "본사창고" 표시). **권한 부여 여부 = 업무규칙 결정([[feedback_integrity_domain_policy_preconfirm]]) → 개발책임자 확인.** 후속안: (a) DISPATCH 에 inventory.warehouse VIEW 부여(auth V79 1행), (b) SlipDetailResponse 에 창고명 embed(권한 의존 제거).

## 검증
- typecheck(node+web) 통과 · vitest `SlipDetailModal.test.tsx`+`DispatchDocument.test.ts` **6/6** · dispatch-board 8파일/32 · print 5파일/39 회귀 없음.
- **라이브 GUI QA**(real-qa `task5-dispatch-preview-real-qa`, mock OFF·:8080·dev_master, 실 슬립 2026/03/09-1): 배차보드 미배차 전표 → 전표확인 → **판매전표 미리보기 모달** — 결재란(담당부서~결제예정일)+품목표(월일~수량) **우측 끝까지 무잘림**·1:1 판독 정상·본사창고 표시·기사 연락처 헤더. `docs/qa/task5-dispatch-slip-preview/`.

## Codex 라운드 + Opus 재검 (0수렴)
- **Codex 라운드**(`c1010d8bc`, 라이브 재캡처 `97568ba65`): 5차원 BLOCKING/HIGH 0. Codex 직접 fix — **[BE BLOCKING] getSlip(`GET /slips/{id}`)=`sales.slip.list` 가드→DISPATCH 역할 403(기존 요약모달도 배차담당자 미작동)** → 배차보드 전용 `GET /admin/dispatch-board/slips/{id}`(`dispatch.board VIEW`+OUTBOUND-only) 신규+FE 전환+IT(`DispatchBoardAdminControllerIT`, 실 Testcontainers 7 tests). **[Design HIGH]** Modal xl `min-width:min(980px,calc(100vw-space-8))`(소형뷰포트 graceful)·`.dispatch-page` 210mm border-box(A4 정합; @media print `width:100%` override라 **인쇄 불변**). **[DevOps BLOCKING]** real-qa `DEV_PASSWORD` 필수화. **[FE]** 닫기 design-system Button·useFitOneA4 test mock 정리.
- **Opus 재검**(`97568ba65`): FE/BE/Design/DevOps 4차원 전부 **BLOCKING/HIGH 0·새 fix 0** → **0수렴 확정**. **CI 32/32 green**(신규 IT `GET_dispatch_board_slip_detail_allows_dispatch_role` CI 로그로 실행 실증·allowlist `it.dispatch.*` 포함·false-green 아님). 신규 엔드포인트로 판매전표 미리보기 라이브 재검(slip-service 재빌드) 완료.

## 백로그 (비차단)
- ✅ **[해소]** BE `inventory.warehouse VIEW` 권한갭(DISPATCH 출고창고 '-') — **auth V79/#706 부여 완료**(2026-07-03). FE mock 카탈로그(`SP_D1_DEFAULT_VIEW.DISPATCH`)·sp-d4 T09 사이드바 테스트 동기화는 FE-소비 후속 PR(V78 선례).
- **[MED·후속]** 신규 엔드포인트 IT 보강 2케이스(비-OUTBOUND 403·무권한 403) — 로직은 SlipType enum 전수+형제 AOP 테스트(`GET_undispatched_slips_rejects_sales_role`)로 검증됨, happy-path IT PASS. 회귀망 보강용.
- **[LOW]** `getOne()`이 OUTBOUND 판정 전 전체 상세(user Feign 3콜) 조립 — INBOUND id 낭비호출(board 는 OUTBOUND만 노출이라 실경로 무해). **[NIT]** controller `@PathVariable` FQN import 정리.
- Desktop Playwright 모달 직접 미검증(pre-existing E2E 갭) · 인쇄버튼/전체화면 링크(plan 선택) · dead token 모듈 sweep(3파일 선행).
