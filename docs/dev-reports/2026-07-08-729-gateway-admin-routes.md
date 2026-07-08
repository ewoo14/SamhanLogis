# #729 게이트웨이 admin 라우트 404 → accounting 목록 500 전수 해소 (dev-report)

- **PR**: #770 (`fix/729-gateway-admin-slip-route`)
- **연관 Issue**: #729
- **일자**: 2026-07-08
- **운영 모드**: 토큰 절약형 — 정찰·구현·5-agent 리뷰·라이브 QA·검증 = **Sonnet 5** 서브에이전트, PM 판단·**STEP4 독립 적대검증** = 상위모델(Opus). Codex Jul11 사용량 한도 → STEP4가 Codex 라운드 + 개발책임자 승인 대체.

## 1. 문제
데스크톱 회계 admin 화면(매출/매입 전표, 세금계산서 배치·수신, 전자서명)이 API 게이트웨이 미매칭 라우트로 **404**. 라이브 QA 과정에서 라우팅 해소 후 accounting-service 목록 API가 **500**(pre-existing)임이 추가로 드러남.

## 2. 근본원인 · fix (3층)
### (a) 게이트웨이 라우팅 404 — api-gateway
- `accounting-sales-purchase-slip-admin-noprefix`: `Path=/admin/sales-slips[,/**],/admin/purchase-slips[,/**]`
- `accounting-tax-invoice-admin-noprefix`: `Path=/admin/tax-invoices[,/**]`
- 둘 다 `lb://accounting-service`, **no-strip**(컨트롤러가 풀패스 `/admin/...` 보유 → StripPrefix 시 미매칭), `JwtAuthentication`. 기존 `accounting-admin-noprefix` 선례 동일.

### (b) 데스크톱 서명 공개경로 — signature.ts
- `/public/batches/...`·`/public/signatures/...` → `/api/public/...`(3건). 게이트웨이 `slip-service-public`(`Path=/api/public/**`, `StripPrefix=1`) 경유 정합. bare `/public/**` 미라우팅 404 해소. mobile-staff 관례 일치.

### (c) accounting 목록 500 — accounting-service (라이브 QA 발견, 개발책임자 결정으로 본 PR 포함)
- 근본원인: `@EntityGraph(attributePaths = {"lines","lines.allocations"})` 가 두 List(bag) 동시 fetch → Hibernate 6 query-plan 단계 **100% 실패**(데이터 무관). 결함군 **5회**.
- fix(소비자별 최소수정):
  - allocations 사용(list/월마감): `@EntityGraph({"lines"})` 단일 bag + `SalesAccountingSlipLine`/`PurchaseAccountingSlipLine` `allocations` 에 `@BatchSize(100)` → 같은 `@Transactional(readOnly=true)` tx 내 `IN(...)` 배치 로드. **OSIV off(`open-in-view:false`) 검증** — tx 경계가 load-bearing.
  - `findPostedUnlinkedForBatchCandidates`: 소비자(listCandidates)가 스칼라 합계만 읽음 → `@EntityGraph` 완전 제거(root-only).
  - `lines` List 순서·DISTINCT·ORDER BY·소프트삭제·RC4 CAST 불변.

## 3. 되살아난 화면 에러상태 3-state (개발책임자 승인)
라우팅만 고치면 accounting 500 이 조용히 "데이터 없음"으로 가려짐 → Sales/Purchase 페이지의 로딩(Spinner)/에러(`role="alert"`)/빈값 3-state 패턴을 세금계산서 2화면에 복제, `MobileRecipientPage`는 410/404→GoneView·그 외→OutageView(재시도) 분기. (라이브 QA에서 이 배너가 500을 정직하게 표시함을 확인 → accounting fix 후 클리어.)

## 4. 리뷰 (캐논)
- **1라운드(라우팅+FE)**: Sonnet 5 5-agent(FE/BE/Design/DevOps/QA). BE=NO FINDINGS. P1/P2 findings(라우트 계약 IT·에러상태·문서/테스트) → fix 라운드(커밋 6e1b10da) → Opus STEP4 **0수렴**.
- **2라운드(accounting 확장 스코프)**: Sonnet 5 5-agent 재리뷰. FE/Design/DevOps/QA=clean(DevOps가 OSIV=off 검증 bonus), BE=P1(candidates 그래프 낭비 제거)+P2(쿼리카운트 핀) → fix 라운드(커밋 7290677e에 반영) → Opus STEP4 **0수렴**.

## 5. 검증 (본 세션 genuine)
- desktop typecheck: 변경파일 신규 0(17 baseline 무관). vitest **667/667**.
- 게이트웨이 IT `ApiGatewayContextLoadIT`: **9/9**(신규 2 라우트 pinned, `--rerun-tasks --no-build-cache`).
- accounting `AccountingSlipMultipleBagFetchRegressionIT`: **7/7**(real Testcontainers Postgres, 2×2×2 시드, fail-before/pass-after 실증, @BatchSize 쿼리카운트 핀). 전체 accounting 스위트 **1170/1170**.
- **라이브 QA(실 게이트웨이·mock OFF·dev_master)**: 게이트웨이+accounting 재빌드 후 `/admin/sales-slips`·`/admin/purchase-slips`·`/admin/tax-invoices/batch-from-sales-slips/candidates`·`/admin/tax-invoices/inbound` 전부 **500→200**. 2026 실데이터(매출 2512행·매입 35행·배치 실그룹)로 예외 없이 조회. 실 GUI 스샷 `docs/qa/729-gateway-admin-slip-route/`.

## 6. 📌 개발책임자 결정 기록 (2026-07-08)
- **#729 = A(게이트웨이 라우트 추가)** — B(컨트롤러 이동) 대비 블라스트 최소·컨벤션 일치.
- 초기 "서명 `/public` fix 별도 PR" 결정 → **본 PR 통합**(supersede, 결함군 전수).
- pre-existing 에러상태 UX(세금계산서 2화면 P1+모바일 인수자 P2) **본 PR fix**.
- 라이브 QA 발견 accounting `MultipleBagFetchException` **본 PR fix**(무결성 도메인·결함군 전수).

## 7. ⚠️ 배포 노트
`application.yml`·컴파일 상수는 jar 에 baked → **`restart` 불가, 이미지 재빌드 필수**:
```
./gradlew :services:api-gateway:bootJar :services:accounting-service:bootJar
docker compose -f infrastructure/docker-compose.local-all.yml up -d --build api-gateway accounting-service
```
prod(ECR pull)은 게이트웨이·accounting 이미지 재빌드/푸시 수동(현 워크플로우 없음, Phase 11).

## 8. 백로그 (본 PR 범위 밖)
- `SalesAccountingSlipRepository.findByFilters`(및 Purchase) unbounded `List` 반환 — 광범위 date range 시 다수 배치. pre-existing, pagination 검토.
- FE page-code ↔ BE `@RequirePermission` 명칭 상이(pre-existing) — 라이브 QA는 MASTER 로 우회.
- `signature-c-smoke.spec.ts` page.route glob mock 은 실게이트웨이 미검증(latent).
- 데스크톱 typecheck 17 baseline(5파일 DataTable prop) vs CI green — false-green 조사.
