## Codex 5-agent 사이클 1 통합 리뷰 (head `8c3ff6e4` 기준)

> TM 통합. input: codex-be / codex-fe / codex-designer / codex-qa / codex-devops 사이클 1 (raw) + tm-claude-cycle-1.md (비교 기준).
> Codex 5 agent 는 Claude 사이클 1 발견 12건 fix (`3374a0c9`) 의 cross-check 와 자체 신규 발견을 함께 수행함. 중복/수렴 결함은 1행 병합 + 출처 병기.

---

### 1. Claude 발견 평가 종합 표 (Codex cross-check)

| Claude 통합표 # | 내용 | Codex 평가 | `3374a0c9` fix 판정 | 잔여 |
|---|---|---|---|---|
| #1 (P0 DEF-1) | V47 materialize 누락 → MANAGER `products.sync` 403 | BE/QA/DevOps 일치: **valid** | **해소** — `account_page_permissions` 동기 INSERT + 시스템마스터 제외 + active 조건 정합. real QA dev_manager 200 증빙 수용 | IT 가드 exactness 약함 → **CQA-1** 로 승계 |
| #2 (P1) | 사이드바 ↔ 라우트 page-code 이원화 3건 | FE/Designer 일치: valid | **부분 해소** — arologis/SMS/매출마감은 page-code 단일 소스 수렴 완료 | 직접 링크 1:1 위반 잔존 → **FE-1/FE-2/FE-3+D-CX-002** 로 승계 |
| #3 (P2) | full-menu-contract stale 단언 | FE/QA 일치: valid, P2 격하 타당 | **부분 해소** — blocked-partners/aligo/reconcile 단언 갱신 완료 | `SLIP_CLEANUP_ROLES` stale 잔존 → **FE-4** 로 승계 |
| #4 (P2) | prometheus `authenticated()` 게이트 명시 | BE/QA/DevOps: valid | **해소** — InternalTokenFilter 실 게이트 주석 + 테스트 보강 | — |
| #5 (P2) | `canQuerySales` isSystemMaster 명시성 | BE/QA: valid (low) | **해소** — FE snapshot 한계 + MASTER builtin group 동기화 Javadoc | — |
| #6 (P2) | `showAdmin` dead 블록 | Designer/QA: valid | **해소** — 빈 블록 제거, 단톡방 MASTER 제외 분기만 잔류 (UUID 노출 0) | — |
| #7 (P3) | 마감 페이지 role 직접 판정 | FE/Designer/QA: valid | **부분 해소** — 버튼 판정은 `canAccess(pageCode, action)` 전환 완료 | 사용자 문구/Javadoc role 기준 잔존 → **D-CX-001** 로 승계 |
| #8 (P3) | V47 soft-delete 시나리오 주석 | DevOps/QA: valid | **해소** — V42 partial index 와 ON CONFLICT 정합 주석 | — |
| #9 (Nit) | AuthFlyway false action 단언 | BE/QA: valid but incomplete | **부분 해소** — 4 action FALSE 단언 추가 | materialize exact-set 미단언 → **CQA-1** 로 승계 |
| #10 (Nit) | Inventory IT `X-User-Role` 혼선 | BE/QA: valid | **해소** — 라벨/metrics 용도 주석 고정 | — |
| #11 (Nit) | EcountMig helper 중복 | BE/QA: valid but incomplete | **부분 해소** — 공통 helper 추출 완료 (모듈 경계상 user-service 별도 유지 적절) | `X-Is-System-Master`/role-only 케이스 공백 → **CQA-2** 로 승계 |
| #12 (Nit) | sp-d2 spec 제목 | QA: valid | **해소** — "PermissionGuard 단일 게이트" 갱신 | — |
| #13 (기록) | HeaderAuthenticationFilterTest 복제 | QA: **invalid as defect** — 서비스별 독립 테스트 허용, 15개 파일 `GROUP_` 보존 + `ROLE_MASTER` 부재 동시 단언으로 품질 충분 | (결함 아님 유지) | — |
| #14 (기록) | Prometheus scrape 무인증 | BE/QA/DevOps: valid non-blocking — 선재 운영 인프라 이슈, 본 PR 회귀 아님 | (예외 유지) | — |
| #15 (기록) | PageCode raw 표시 | QA: **invalid as defect** — UUID 아님, MASTER 전용 디버그 문자열 수용 | (결함 아님 유지) | — |

Claude 발견 12건 fix 중 **완전 해소 7건 / 부분 해소 5건** (잔여분은 전부 아래 Codex 신규 발견 표로 승계되어 추적 단절 없음). Codex 평가에서 Claude 발견이 invalid 로 뒤집힌 건 0건 (기록 2건의 "결함 아님" 재확인뿐).

---

### 2. Codex 자체 신규 발견 표 (중복 병합 후)

| # | 출처 | 우선순위 | 위치 | 내용 | 처리 |
|---|---|---|---|---|---|
| C-1 | FE-1 | **P1** | `AppLayout.tsx:222`, `routes/index.tsx:1338`, `AccountingEditRequestController.java:118` | `/admin/accounting-edit-requests` 라우트가 `accounting.edit-requests:VIEW` 요구하나 페이지 첫 API 는 `accounting.edit-requests.decide:VIEW` — ACCOUNTANT 는 FE 진입 후 BE 403 가능 | 사이클 1 Codex fix — 라우트/사이드바를 `accounting.edit-requests.decide:VIEW` 단일 기준으로 수렴 |
| C-2 | FE-2 | **P1** | `AppLayout.tsx:210`, `routes/index.tsx:1117`, `TaxInvoiceController.java:220` | `/accounting/tax-invoices` 사이드바 show 는 4 page-code OR, 라우트는 `emit-nts:VIEW`, BE 목록은 `list:VIEW` — MANAGER (list 만 보유) 가 메뉴는 보이고 라우트에서 차단 | 사이클 1 Codex fix — 목록 라우트/사이드바를 `accounting.tax-invoice.list:VIEW` 로 정렬, form/new/edit 는 `list` CREATE/UPDATE 계약으로 정리 |
| C-3 | CQA-1 | **P1** | `AuthFlywayV47SeedIT.java:73-100` | V47 materialize 가드 false-green 가능 (`materialized > 0 && <= managerAccounts`) — 부분 backfill 도 통과, 시스템마스터 제외 0건 미단언 | 사이클 1 Codex fix — expected set (활성 MANAGER 배속 − 시스템마스터 동시 배속) exact count/set 단언 + `dev_manager` 7 action 직접 단언 + 시스템마스터 row 0건 단언 |
| C-4 | FE-3 + D-CX-002 (병합) | P2 | `AppLayout.tsx:314-318/418/461-463/861-863/968`, `routes/index.tsx:506/1184/1204-1206/1303` | 직접 링크 show 조건이 라우트 page-code 보다 넓은 잔존 4건: `/admin/partners`(`showPartnersGroup` > `partners.list`), `/admin/blocked-partners`(`partners.block.bulk` OR > `partners.block`), `/admin/regions`(`arologis.region.manage` OR > `arologis.region`), `/inventory/stock-balance`(`inventory.warehouse \|\| inventory.stock-transfer`) — custom 그룹에서 FE-hides-BE-allows / FE-shows-route-deny 재발 | 사이클 1 Codex fix — 각 직접 링크 show 를 라우트 PermissionGuard page-code/action 과 1:1 축소. manage/bulk 권한은 페이지 내부 버튼 가시성에만 사용 |
| C-5 | FE-4 | P2 | `full-menu-contract.spec.ts:99` | 제거된 `SLIP_CLEANUP_ROLES` 를 여전히 단언 — testIgnore 격리 spec 이나 계약상 stale, 격리 해제 시 즉시 실패 | 사이클 1 Codex fix — `slip.cleanup` PermissionGuard/dynamicCanAccess 계약으로 갱신 |
| C-6 | D-CX-001 | P2 | `SalesClosingPage.tsx:425/442`, `MonthEndClosingPage.tsx:488/510`, `PeriodCloseListPage.tsx:330/347` | 마감 판정은 `canAccess` 전환됐으나 disabled title/거부 문구가 `ACCOUNTANT / MASTER`, `MASTER 권한자` 등 role 기준 잔존 — 권한그룹 custom grant 와 안내 불일치 | 사이클 1 Codex fix — "마감 실행 권한 필요" 등 page-code 권한 기반 문구 교체 + 상단 Javadoc `@RequirePermission` 기준 현행화 |
| C-7 | CQA-2 | P2 | `EcountMigPartialIdentitySupport.java:6-13` + Mig6~11 IT | partial identity 401 계약이 `X-User-Groups` 케이스만 검증 — `X-Is-System-Master` 분기와 `X-User-Role` 단독 무시 분기 공백 | 사이클 1 Codex fix — `missingUserId + X-Is-System-Master:true → 401`, `missingUserId + X-User-Role only → 403/anonymous` 케이스 추가 |
| C-8 | CQA-3 | P2 | `permission-groups-c5-followup.spec.ts:4, 27-94` | 신규 spec 이 source 문자열 검사만 수행 — dead code 잔존에도 통과, mock 권한 기준 메뉴/redirect 런타임 계약 미검증 | 사이클 1 Codex fix — mock 런타임 spec 추가 (MANAGER/custom grant 의 `/admin/sheet-sync` 허용·미grant redirect·`/sales/closing` view 표시), 최소한 source regex 를 `to=... show={...}` 연결까지 단언 |
| C-9 | DO-1 | P2 | `V47__seed_products_sync_group_permission.sql`, `real-qa-evidence.md:168-169` | `3374a0c9` 가 기적용 V47 을 변경 — 구 V47 적용 DB (본 PR QA DB 등) 는 현 head 기동 시 Flyway checksum mismatch, `repair` 만으론 backfill SQL 미실행 | 사이클 1 Codex fix — **PM 판단: V48 분리 불채택** (V47 은 미머지 PR 브랜치 전용이라 프로덕션/CI 신규 DB 무영향, 로컬 재적용 절차는 evidence 에 기존 기록). dev-report 운영 노트에 "구 V47 적용 DB 전용: V47 history 삭제 후 재적용 또는 수동 backfill + repair" 절차 보강으로 처리 |
| C-10 | CQA-4 | P3 | `claude-qa-cycle-1.md`, `real-qa-evidence.md` | `git diff --check` 실패 — QA 문서 trailing whitespace 10건 | 사이클 1 Codex fix — trailing whitespace 제거 (hard-break 의도면 명시 표현으로 교체) |

신규 BE 결함 0건 (Codex BE: APPROVE). DevOps CI matrix/qa-e2e 트리거/infra 변경 필요성 점검 전 항목 이상 없음 (DO-2~DO-5 조치 없음).

---

### 3. 각 agent 판정 종합

| Agent | 산출물 | 판정 | 신규 결함 | TM 조정 |
|---|---|---|---|---|
| BE | codex-be-cycle-1.md | **APPROVE** | 0건 — 14개 `ROLE_` 제거 안전성/V47 INSERT/401 rekeying/CORS 와이어 전 항목 통과 | 조정 없음 |
| FE | codex-fe-cycle-1.md | CHANGES REQUESTED | P1 2건 (FE-1/FE-2) + P2 2건 (FE-3/FE-4) | FE-3 은 Designer D-CX-002 와 동일 계열 → C-4 로 병합 |
| Designer | codex-designer-cycle-1.md | CHANGES REQUESTED | P2 2건 (D-CX-001/D-CX-002) — UUID 사용자 노출 0건 재확인 | D-CX-002 → C-4 병합 |
| QA | codex-qa-cycle-1.md | CHANGES REQUESTED | P1 1건 (CQA-1) + P2 2건 (CQA-2/CQA-3) + P3 1건 (CQA-4) | Claude #13/#15 invalid-as-defect 판정 수용 (TM 기록 분류와 일치) |
| DevOps | codex-devops-cycle-1.md | CHANGES REQUESTED | P2 1건 (DO-1) | V48 분리 권고는 PM 판단으로 불채택 — 운영 노트 보강으로 범위 확정 (C-9) |

---

### 4. TM 결정

**판정: 사이클 1 Codex fix 진입 필수 (현 상태 APPROVE 불가)**

1. **fix 대상 10건** (표 C-1~C-10) — 전건 본 PR 사이클 1 Codex fix 로 즉시 처리. 후속 PR/슬라이스 위임 금지 (feedback_integrated_pr_pattern fix 즉시 처리 의무).
2. **P1 3건 (C-1/C-2/C-3) 최우선** — C-1/C-2 는 FE↔BE page-code 계약 불일치로 실사용자 403/차단 직결, C-3 은 P0 DEF-1 회귀 가드의 false-green 차단.
3. **C-4 는 단일 원칙으로 일괄 해소** — Claude 사이클 1 TM 결정 3항 동일 원칙 적용: "사이드바/직접 링크 show = 라우트 PermissionGuard 와 동일 page-code/action 1:1". action-only 하위 page-code (manage/bulk/decide 등) 는 페이지 내부 버튼 가시성 전용.
4. **C-9 범위 확정** — V47 원본 유지 + V48 분리는 불채택 (PM 판단 첨부: 미머지 브랜치 전용 migration, 프로덕션/CI 무영향). dev-report 운영 노트 보강만 수행.
5. fix 완료 후 양쪽 reviewer cross-check 완료 기준 충족 → 사이클 1 종결 절차 진입 (feedback_dual_5agent_review — 사이클 1 회 완료, 사이클 4+ 진입 금지 규칙 내).

UUID 사용자 비공개 위반 0 / 디자인 시스템 영향 0 / CI matrix 전 모듈 커버 / infra 변경 필요 0 — 횡단 점검 이상 없음.
