# #782 part1 — 상업/단품 SET 구성품 defaultQty 주문정합 (표시+제출 수량 결손)

- **일자**: 2026-07-12
- **PR**: #796 · **연관 Issue**: #782(part1) · #780(#779 P1) 라이브 QA 발견
- **워크플로우**: 정찰(submit 영향 확인) → Codex 구현 → Opus 5-agent(BE/FE/Design/DevOps/QA 라이브) → fix → Codex 적대 → 0수렴 → CI → 머지.

## 결함 (HIGH 주문 정합)
`BootstrapService.componentRows()`가 소스 `defaultQty`를 bootstrap payload에 미매핑 → order-app `COMM_PARTS/SINGLE_PARTS`의 `p.qty` undefined:
- 표시(`buildCommSetIndex`/`renderCommSetParts` data-part-qty): `parseInt(p.qty)||1` → "×1"(기대 "×N")
- **제출(`explodeCommSets_`·`explodeSetParts`): 동일 폭파식 → 주문 라인 수량이 setQty×1** → 구성품 default_qty=2여도 1개만 주문(정합 오류).
product-service `EstimateCatalogInternalController`는 `defaultQty`를 이미 응답에 포함(BE 미전달만 문제·product 재배포 불요).

## 변경
- **BE** `componentRows()`: `out.put("qty", defaultComponentQty(row))` — 소스 defaultQty(BigDecimal, 결측 1)를 FE `qty` 키로. single/commercial 공유라 양쪽 교정.
- **FE** order-app `explodeSetParts()`: `qty: qty` → `qty: qty*(parseInt(p.qty,10)||1)` (**단품 SET p.qty 미곱 추가 버그**도 수정). 상업 경로는 이미 p.qty 소비 → BE fix로 자동 정합.
- **테스트**: BootstrapServiceTest(single qty=2·comm qty=3·결측 1)·EstimateCatalogClientTest(defaultQty key 보존·wire-format 2.00 Double)·priceChangeSchedule.test.ts(제출 3×2=6 상업/단품 회귀 가드).

## 리뷰 disposition
- **BE(PASS)**: 소스 키 "defaultQty" 확정(Jackson record native·snake_case override 없음)·single/commercial 커버·계약테스트 genuine·CI green(exact SHA). P3(소수 defaultQty parseInt truncate=기존 패턴·소수 미사용) 후속.
- **FE(PASS)**: explodeSetParts fix 정확·전 소비처(표시=제출) 일관·dist gitignore(index.html만)·typecheck+10 tests. LOW(소수 truncate 동일).
- **QA(GREEN)**: BE 58 suites 0-fail(`--rerun-tasks` 2회)·FE 10/10 + **라이브 실증**(실 Docker+실 브라우저·실 product 카탈로그 seed QA782-SET-01[part default_qty=2/1]) → 표시 "3×2"/"3×1"·소계 528,000=88,000×6·**제출 payload `{"model":"QA782-PART-01","qty":6}`**(=3×2) 캡처·회귀 part qty=3·스샷 7장(docs/qa/e782-defaultqty/)·seed 완전 정리.
- **Design/DevOps(PASS)**: 시각 무변경(part1)·"×N" 명확화·order-app tsc+vitest 이중 실행·partner-order test 필터없이 자동.

## 후속 (별도)
- **#782 part2**(`.set-part` CSS 시각폴리시)·**part3**(discoverability) — 후속 PR.
- 소수 defaultQty truncate(parseInt·기존 패턴) — 계량형 구성품 도입 시 검토.
- ⚠️ **QA 인프라 교훈**: 병렬 에이전트 **checkout 경합**(다른 에이전트 git checkout이 브랜치 전환→jar 오빌드) — gradle 경합보다 심각. 격리 worktree 필요. 로컬 product_db SINGLE/COMMERCIAL SET 카탈로그 seed 부재(정비 필요).
