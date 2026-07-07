# E2 롤아웃 — 주문 관리 목록 실시간 동기화·soft-delete 취소선·복원

- PR #757 · 브랜치 `feat/e2-rollout-order-list`
- 배차 파일럿(#699/#700) + 거래처 목록(#756/#760)에서 확립한 **E2 목록 실시간 동기화 + 취소선 soft-delete/복원 패턴**을 주문 관리 목록으로 롤아웃. 5-PR 파이프라인(거래처→주문→판매전표→견적) 중 2번째, auth 마이그 머지순 **C(V83)→D(V84)→E(V85)**.

## 구현
- **FE**(`clients/desktop/.../routes/SalesPartnerOrderListPage.tsx`): 30초 폴링 제거 → 목록 SSE(`useCollectionRealtime`, `PartnerOrderBoardRealtimeClient`, `partner-orders` 키) 멀티 워크스테이션 실시간 반영. soft-delete 행 **취소선(`DELETED_ROW_TEXT_STYLE` neutral-600) + "삭제:{이름}" 배지**(UUID 비노출)·삭제행 status 배지 **중립화**(원 의미색 드롭)·**복원 버튼**(RESTORE 권한 게이트·컬럼 자체 조건부)·삭제행 클릭/병합선택 차단(`rowClickable`). `includeDeleted=true` 는 **내부 관리자 목록 전용 opt-in**.
- **BE**(partner-order-service): `list(filter,pageable,callerPartnerCode,includeDeleted)` — `listActiveOnly`(JPA Spec·`@SQLRestriction` 활성전용) / `listIncludingDeleted`(native·삭제행 포함) 분기. **파트너(`X-Is-Partner`) 호출은 파라미터 무관 활성전용(fail-closed)**. 인라인 `restoreDeleted`(cascade 라인 재활성+totalAmount 보존)·`PartnerOrderSummaryResponse` 삭제메타(deleted_by_name·UUID 정규식 마스킹). auth **V83**(복원 권한 MASTER/MANAGER/SALES 시드)·partner-order **V10**(deleted_by_name).

## 듀얼리뷰 수렴
- **R1 Opus 5-agent(FE/BE/Design/DevOps)** + fix(`23ea3c141`): 정적계약 spec drift·기본 findings.
- **R2 Opus 5-agent + 라이브 QA**: 🔴**HIGH(FE가 BE 놓친 것 포착)** — `list()`가 내부직원 + 파트너 PWA 셀프서비스 양 audience 공유인데 R1 코드가 무조건 `listIncludingDeleted`(is_deleted 술어 없는 native) → **파트너 호출 시 삭제 주문 + 내부직원 실명(deletedByName) 외부 누출**. BE는 "단일소비처=내부전용" 판정했으나 FE 반증 채택(독단기각 금지·재수렴). fix(`1f9162411`, Opus 직접): `includeDeleted` 내부전용 게이트(파트너=활성전용, 거래처 목록 opt-in 패턴 준용)·삭제행 배지 중립화·restore 라인 IT. + MEDIUM(인라인 restore totalAmount IT)·LOW.
- **STEP4 Opus 독립 적대검증(Codex Jul11 한도 대체·개발책임자 승인)** 4-agent(FE/BE/Design/DevOps) 전원 "0 BLOCKING·배포 가능": 파트너 누출차단 fix가 코드 폐루프 추적 + **실 게이트웨이 캡처**(파트너 includeDeleted=true opt-in도 활성전용·삭제상세 404) + **BE 352 genuine 테스트**(0 skip/fail·`--rerun-tasks --no-build-cache`)로 확증. 신뢰경계(게이트웨이 `X-Is-Partner`/`X-Partner-Code` JWT claim remove-then-set 강제)까지 반증 실패(견고, 기존 인프라). 잔여 MED/LOW → Opus 직접 fix(`726685ad7`): rowKey 폴백 disambiguator·복원 컬럼 권한 omit·restoreError dismiss·dead CSS 제거·BE 불변식 주석·mock parity vitest 3케이스. 수렴 재검(FE 적대) 회귀 0(3-role 라이브 실증).

## 검증
- **BE 352 tests**(partner-order-service·Testcontainers·0 skip/fail) — R2 회귀 `partner_scope_excludes_soft_deleted_rows_even_when_include_deleted_requested`·인라인 restore 라인생존/미복원 IT·`AuthFlywayV83SeedIT` 3.
- **FE typecheck PASS · vitest 653**(mock soft-delete parity 신규 3 포함) · eslint clean.
- **라이브 GUI QA**(fixed 렌더러 `726685ad7`·실 게이트웨이 :8080·dev_master/dev_accountant·mock OFF): 삭제행 중립배지+취소선+복원(a)·활성 CONFIRMED 초록배지 computed bg=success 토큰(b)·restoreError 배너+dismiss+필터소거 실계약 409(c)·ACCOUNTANT 복원컬럼 부재 vs MASTER 대조(d). DB 정합 원복(is_deleted 0건). 증적 `docs/qa/e2-rollout-order-list/step4-*.png` + 신규 real-qa 스펙 4종.
- **CI green**(headSha 726685ad7 일치·genuine).

## 후속/백로그
- **DevOps(로컬 환경 위생·머지 무관)**: 집PC/회사PC 공유 dev 스택 stale(auth_db V83 R1-라벨 체크섬 → `DELETE FROM flyway_schema_history WHERE version='83'` 후 재기동·partner-order/partner-auth 재빌드).
- **인프라 슬라이스**: C→D→E 마이그 버전 연속성 CI 가드(현재 PM 프로세스 강제만)·신규 IT skipped=0 hard gate 홀리스틱 sweep.
- **잔여 소형**: `searchIncludingDeleted` rename·개별행 deletedAt 기반 restore 확장·`includeDeleted=true` 인가경계 세분화(백로그 계열)·design-system danger/success SSOT sweep(다크모드).
- **Codex 복구(Jul11) 후**: STEP4 소급 Codex 재검(선택).
