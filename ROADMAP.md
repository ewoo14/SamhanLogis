# SamhanLogis ROADMAP

(주)삼한공조시스템 자체 물류·회계·견적·주문 통합 플랫폼의 단계별 로드맵.
본 문서는 origin/main 머지 사실 기준이며, PR 진행 상황과 1:1 동기화된다.

> 갱신 기준 commit: 본 PR 머지 시점 (Phase 7 완료 PR #87 + Phase 8 완료 PR #88 / #89 / 본 PR)

---

## Phase 개요

| Phase | 기간 (목표) | 목표                                                                 | 상태       |
| ----- | ----------- | -------------------------------------------------------------------- | ---------- |
| 0     | -           | 저장소 / Gradle multi-project / 가드 정립                            | 완료       |
| 1     | 1 ~ 3 주차  | infrastructure + auth-service + eureka + api-gateway + logging       | 완료       |
| 2     | 4 ~ 8 주차  | user / product / inventory + Electron Desktop 첫 슬라이스            | 완료       |
| 3     | 9 ~ 13 주차 | slip-service (출고/입고 10단계 라이프사이클 + 모바일 전자서명)       | 완료       |
| 4     | 14 ~ 17 주차| accounting-service (한국 일반기업회계기준 65 row 시드 + 시산표)      | 완료       |
| 5     | 18 ~ 21 주차| Solapi SMS 알림 + signature-slice + sales-form polish                | 완료       |
| 6     | 22 ~ 27 주차| legacy 마이그레이션 본격 구현 (M1a / M2 / M3 / M4 / M5 + 5 client)   | 완료       |
| 7     | 28 ~ 31 주차| 호스팅 인프라 + e2e QA + 운영 가드 + UI 통합                         | 완료 (PR #87) |
| 8     | 32 주차 ~   | AWS 호환성 가드 (테스트 단계 유지) — 직접 cutover 보류              | **완료 (PR #88 / #89 / 본 PR)** |
| 9     | -           | 잔여 도메인 (partner-service / groupware / notification / dashboard) | **4차 진행 (W1 partner #91 + W2 groupware #92 + W3 notification #93 + W4 dashboard skeleton 본 PR)** |
| 10    | -           | arologis-service (배차 마이크로서비스) + 모바일 어플 driver tab + slip 통합 (renumber, D-P10-05) | **완료 — W10-1 PR #97 + W10-3 PR #98 + W10-4 PR #99 (slip-service 전자서명 LINK+APP source 통합, V10 Flyway, ApiResponse wrapper IT 의무화) — D-P10-11 / D-P10-12** |
| 10.5  | -           | **아로로지스 독립 분리** (monorepo 유지 + build/배포만 분리 + 자체 auth + 휴대번호 passwordless + arologis.samhan-air.com 도메인 + clients/arologis-desktop + clients/arologis-mobile + 별도 GitHub Actions workflow) + **Phase A 배차 메뉴 + 아로로지스 발송** (PR #188, D-DB-01~09) + **Phase C 배차 수정/취소 요청 흐름** (PR #189, D-DC-01~09) + **Phase F 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송** (TM 통합, D-DF-01~13) | Phase A/C **머지** + Phase F **TM 통합 완료 (QA sequential 진행 중)** + Phase B/D 인성데이타 API 링크 도착 대기 |
| 10.6  | -           | **이카운트 → Samhan Public 마이그레이션** (MIG-1~22 완료) + 운영 대시보드 + IDE workspace 정리 | **MIG-22 PROBLEMS 정리 완료 — 사용자 결정 대기** |
| 11    | -           | AWS 마이그레이션 + Migration Service + 운영 안정화 (AWS cutover 본격) — dry-run plan: `docs/migration/phase10/M-AWS-MIGRATION-DRY-RUN.md` | 대기 |
| 12    | -           | 실시간 협업 시리즈 (SSE infra + slip 코멘트 / audit overlay / 권한·수락 / 전 15 service 확장) — 총 ~13주 (사용자 결정 옵션 A) | **step-1 (PR #123) + step-2 (PR #124) + step-3 (PR #125) + step-4a (PR #126) 머지 + step-4b 진행 (PR-H4b BE 13 service 일괄 `shared/realtime-abstraction` 적용, 본 PR)** |

---

### 최신 진행 메모 (2026-07-27)

- **#851 이월 — CI 게이트 0 표면 2종(real-QA baseURL 부재 · arologis 가드 미배치) + R1 재설계**:
  `clients/desktop/playwright.real-qa.config.ts`(repo 공유 real-QA 배치 하네스)에 Playwright
  `projects`를 도입해 상대경로 `page.goto('/…')`에 의존하던 897·928·929-r4 3개 스펙이 더는
  `Cannot navigate to invalid URL`로 실패하지 않게 했다. 928(웹 order-app)은 데스크톱 렌더러와
  다른 Vite 앱이라 전역 baseURL 하나로는 둘 다 만족시킬 수 없다는 것이 R1 적대검증에서 드러나,
  928만 별도 오리진 프로젝트로 분리하고 override 환경변수 이름도 기존 148개 스펙이 이미 쓰던
  `AUDIT_BASE_URL`/`QA_BASE_URL`과 겹치지 않는 신규 이름으로 교체했다(두 이름 모두 저장소
  전체에서 미사용이었음을 확인, 172파일/548테스트 배치 목록 불변 실측 — projects 분할 후
  order-app 1 + renderer 547 = 548로 누락·중복 0). `scripts/check-notion-zero.sh`의 `SCAN_DIRS`에
  `clients/arologis-desktop/src`·`clients/arologis-mobile/src`·`shared`(Java, src/main/ 한정)를
  추가해 arologis 전용 `notion-zero-guard` 잡이 실제로 arologis 표면을 스캔하게 했다(RED-first —
  fix 전 arologis 트리거 경로에 주입한 Notion 토큰이 false PASS였고, fix 후 동일 주입이 RED로
  잡힘을 직접 확인). 상세: `docs/dev-reports/2026-07-27-851-gate-gaps.md`.

### 최신 진행 메모 (2026-07-26)

- **#851 슬1 CI 게이트 커버리지 — 게이트가 실제로 검사하게**: qa-e2e trigger 에 `services/accounting-service/**`·`services/slip-service/**` 를 추가해 BE 계약 변경도 Desktop Playwright mock 회귀 hard gate 를 발동시킨다(#823 의 BE-only 커밋 `728b98bc7` 이 34체크를 통과하는 동안 qa-e2e 4잡이 전원 부재 — FE 배분 차단을 CI 가 못 잡은 공백). 함께, 실행되면서 아무것도 검증하지 않던 `datagrid-interaction.spec.ts`(7 TC 전부 "셀 미발견"을 console.warn 으로 찍고 통과 — 해시라우터에 경로만 goto 해 대시보드로 낙착)를 해시 네비게이션 + hard expect 정확 수치 검증(단일 1셀·사각형 30셀·Ctrl+A 1,700셀·TSV 셀 값·열 필터 20행)으로 재작성했다. 뮤테이션 증명(해시 제거 시 7 failed)·trigger 확대 비용 실측(BE-only push 당 러너 +15.5분, wall-clock 6.2→11분, public repo 라 과금 0)을 포함한다. 상세: `docs/dev-reports/2026-07-26-851-ci-gate-coverage.md`.

### 최신 진행 메모 (2026-07-25)

- **#920 CODEF scope 동시 저장 보호**: `user_codef_import_scope`에 V66 `version`과 JPA `@Version`을 추가하고 PUT 요청의 조회 버전을 정확히 대조한다. 최초 저장 경쟁과 낡은 전체 교체 요청은 409로 거부하며 기존 선택을 바꾸지 않는다. 데스크톱은 서버 최신 선택을 재조회해 표시하고 자동 합집합 없이 사용자의 명시적 재선택 경로를 제공한다. RED-first BE/FE/mock 회귀와 accounting-service 전체 테스트를 완료했다. 상세: `docs/dev-reports/2026-07-25-920-codef-scope-optimistic-lock.md`.
- **#910 앱별 버전 정책 식별자 슬라이스 1**: dashboard-service `AppClientType`을 8개 사용자
  대면 앱 식별자로 확장하고 V7에서 `client_type` CHECK와 길이를 교체했다. 기존 `DESKTOP`
  릴리스는 삼한 데스크톱 정본으로 보존하며 구버전 `WEB`·`MOBILE` 조회값은 호환용으로 유지한다.
  삼한 모바일·직원 모바일·아로로지스 모바일은 각각 전용 식별자를 보내고, desktop 관리 화면과
  mock은 내부 enum 대신 한국어 앱 이름을 선택·표시한다. 웹/아로로지스 데스크톱 버전 체크 신설과
  OTA 활성화는 후속 범위다. 신규 릴리스 개발 버전은 `YYYY/MM/DD-{번호}`로 등록·판정하며
  패키지 semver는 빌드 식별자로만 사용한다. 상세 검증은
  `docs/dev-reports/2026-07-25-910-app-client-identity.md`.
- **#928 웹 3앱 버전 안내**: `order-app`·`estimate-app`·`mobile-public`이 각자
  `SAMHAN_ORDER_WEB`·`SAMHAN_ESTIMATE_WEB`·`SAMHAN_MOBILE_PUBLIC_WEB`로 기존
  `/app/version`을 조회한다. 안내만으로 자동 새로고침하지 않고, 작성 중 주문·견적·서명
  입력이 있으면 사용자의 추가 확인 전까지 보존한다. 404/네트워크 오류는 fail-open이며,
  무주입 개발 빌드와 릴리스 버전 주입 경계를 세 앱 모두 검증했다. 상세 검증은
  `docs/dev-reports/2026-07-26-928-web-version-check.md`.

### 최신 진행 메모 (2026-07-21)
---

### 최신 진행 메모 (2026-07-25)

- **#920 CODEF scope 동시 저장 보호**: `user_codef_import_scope`에 V66 `version`과 JPA `@Version`을 추가하고 PUT 요청의 조회 버전을 정확히 대조한다. 최초 저장 경쟁과 낡은 전체 교체 요청은 409로 거부하며 기존 선택을 바꾸지 않는다. 데스크톱은 서버 최신 선택을 재조회해 표시하고 자동 합집합 없이 사용자의 명시적 재선택 경로를 제공한다. RED-first BE/FE/mock 회귀와 accounting-service 전체 테스트를 완료했다. 상세: `docs/dev-reports/2026-07-25-920-codef-scope-optimistic-lock.md`.

### 최신 진행 메모 (2026-07-26)

- **#897 입출금·일마감 열 계층화**: 두 화면의 목록을 핵심 열 중심으로 재구성하고, `BANK_TRANSACTION_LIST_COLUMN_KEYS`·`DAILY_CLOSING_LIST_COLUMN_KEYS` 단일 기준점으로 후속 업무 확인에 따른 열 조정을 한 곳에서 가능하게 했다. 기존 탭별 `소스`·`매칭상태` 조건, 선택·벌크 입금보고서·역마감 조작과 기존 일마감 상세 경로를 보존했다. 1600px mock/live 실측은 두 화면 모두 `tableW=1276`, `wrapperW=1278`, `scrollW=1276`; 상세 값 대조·좁은 폭 회귀·검증 원문은 `docs/dev-reports/2026-07-26-897-column-hierarchy.md` 참조.

### 최신 진행 메모 (2026-07-21)

- **#824 품목행 공급가액·부가세 정합성 보강 (2026-07-22)**: 부가가치세법 제29조와 국세청 유권해석의 공급가액 10% 원칙을 확인하고, 법령이 HALF_UP을 강제한다고 추정하지 않은 채 기존 세금계산서 절사 정책을 공통 계산기로 수렴했다. 전표·견적·세금계산서의 신규 계산은 `shared:common:VatAmountCalculator`/desktop `vatRounding.ts`를 사용하며 발행 완료 자료는 재계산하지 않는다. 주문 코드 실측 결과 `PartnerOrderLine.subtotal`은 VAT 포함 T였으므로 V12에서 nullable `supply_amount`·`vat_amount`만 추가하고 기존 행 backfill을 금지했다. 신규 주문은 `PRICE/SUPPLY/VAT/TOTAL`과 `S+V=T`, DC 선적용 후 PRICE 재계산을 고정한다. 상세 결정은 `migration/decisions/DECISIONS.md`, 검증은 `docs/dev-reports/2026-07-22-824-item-line-supply-vat.md` 참조.
- **#825 슬6 메신저 수신자 칩 복수선택 (Issue #866 / PR #892)**: 데스크톱 `/messenger`를 신설해 `MultiSelectAutocomplete` 기반 수신자 칩 복수선택(최대 50명), 본문 발송, 읽기 전용 수신함을 연결했다. groupware-service에 단일 트랜잭션 `POST /admin/groupware/messages/bulk`(중복 제거·self 차단·미존재 수신자 전량 rollback·after-commit 알림)와 부서 제약 없는 `messenger.send` 전용 수신자 검색을 추가했고, user-service `activeOnly=true` 검색으로 퇴사자를 제외하되 기본값은 기존 동작을 보존한다. V14는 `messages.batch_id`만 추가하며 단건 발송 계약은 유지한다. RED-first R1~R16 테스트, Playwright mock 4건, Desktop 전체 Vitest/typecheck/lint, groupware·user Gradle 검증을 완료했다. 상세: `docs/dev-reports/2026-07-22-825-s6-messenger-chip-bulk.md`.

- **#825 슬5 null-semantics — R1 적대검증 fix**(PR #864): 일마감 거래처·안전재고 창고·CODEF 가져오기 범위 세 도메인에서 "빈 값=전체" 모호성을 명시적 `scopeMode(ALL/SELECTED)` 로 분리한 슬5 원안을, FABLE5 1차 적대검증이 찾은 BLOCKING 자기모순(ALL 저장 직후 가져오기가 400)·design-system `TagChip` 버블링(제거 X 가 즉시 재선택으로 새는 ARIA 미접근 결함)·안전재고 쓰기 폼 미완성(권한 게이팅·저장 피드백·제품 목록 순환 구조) 등을 fix 했다. 근본 원인은 spec 실측 오류 — CODEF 저장 selections 의 `refs=[]` 는 "전체"를 뜻하지 않으며(진짜 전체는 refs `null` 부재일 때만), 저장 당시 의도를 구별하려면 `user_codef_import_scope.scope_mode`(V64, 신규 컬럼) 가 필요해 "CODEF 마이그 0건" 전제를 개발책임자가 번복했다(기존 행은 소급 각인 없이 보수적 SELECTED backfill). `TagChip` 은 제거 버튼에 `stopPropagation` + role="button" 내부 wrapper 분리(ARIA 중첩 해소)+키보드(Enter/Space)+`aria-pressed`/`aria-describedby` 를 추가했다. 안전재고 설정 폼은 `inventory.safety-stock` UPDATE 권한 게이팅, 저장 성공/실패 피드백, 제품 선택을 `ProductAutocomplete`(product-service 실검색)로 교체해 알림 이력 없는 신규 제품도 최초 설정 가능하게 했다. 세 화면 범위 미선택 안내는 `role="status"`+AA 대비 확보 색(`--ink-secondary`) 로 통일했다.
- **#825 슬5 — CODEX LUNA R2 fix 진행**: 저장된 CODEF `defaultImportType`을 실행 payload에 반영해 `CARD+ALL`·`BANK+ALL`·`LOAN+ALL`·`ALL+ALL`이 각 범위만 열거하도록 고정한다. V64 `scope_mode`에는 `DEFAULT 'SELECTED'`를 둬 마이그레이션 적용 후 구버전 앱 롤백의 신규 INSERT 23502를 막고, 기존 빈-ref `SELECTED` 행은 FE에서 복원 실패·재선택 필요로 안내한다. 권한 없는 범위 칩은 focusable button semantics를 제거한다.
- **#825 슬5 — HIGH-1 도달성 결함 fix**: `CodefImportScopedService`가 저장된 `scopeMode=ALL`의 `defaultImportType`을 BE에서 재조회·강제해 요청 `type=ALL` 우회로 저장 범위를 확대하지 못하게 한다. `CodefImportScopeForm`의 유형 드롭다운도 `canUpdate=false`에서 잠그고, desktop mock은 동일한 저장 범위 축소 규칙을 따른다. 저장 `SELECTED`의 explicit refs 실행과 저장 scope가 없는 명시 ALL 실행은 기존 계약을 유지한다.

- **#823 매출·매입전표 배분 원천 거래처 검증**: 배분 시 원천 출고/입고전표 거래처=대상 헤더 거래처 검증·불일치(SAS_SOURCE_PARTNER_MISMATCH)/결손(SAS_SOURCE_PARTNER_MISSING) 422 차단. SlipLineSnapshot += partnerId(양 record·롤링 @JsonIgnoreProperties)·원천 identity 스냅샷 저장 권위·매출+매입 대칭·DB 마이그 0. 라이브QA가 pre-existing `getSlipLine`/`getSlipLines` LazyInit(OSIV off·IT @Transactional 마스킹) 포착→fetch-join fix. 배포=producer(slip)→consumer(accounting) 순서.
- **#845 DS-2 문서 레이아웃 템플릿**: groupware V10 `document_templates` JSONB aggregate(DRAFT/ACTIVE·docType별 active 1개)와 기존 `groupware.approval-templates` 권한 재사용 endpoint를 추가했다. desktop 결재 인쇄는 `ApprovalLine.documentType` 활성 레이아웃을 한 번 결정하고 오류/미존재/late 결과는 `GROUPWARE_DEFAULT`로 수렴한다. Testcontainers HTTP JSONB round-trip·backfill 경계·동시 활성화·desktop real `DocumentRenderer` 회귀를 포함한다.
- **#845 DS-3a 승인 당시 레이아웃 pin**: groupware V12 `document_template_revisions` append-only 이력과 `approval_lines.(document_template_id, document_template_revision)` 참조를 추가했다. 최종 승인과 pin을 동일 트랜잭션으로 묶고, 기존 승인 문서는 소급 pin하지 않으며 재인쇄 시 현재 양식 fallback과 운영자 안내 배너를 표시한다. desktop revision 조회·승인 후 양식 수정 회귀와 이력 UPDATE/DELETE 차단 IT를 포함한다.
- **#845 DS-3b 문서 양식 편집기 MVP**: schema v2 `FIELD`/`TEXT`와 geometry/style/binding을 FE parser·BE `DocumentPayload`·JSONB 왕복에 보존하고, v1 revision pin은 버전 dispatch + 메모리 upcast로 유지한다. desktop 3-pane 편집기, DRAFT/ACTIVE lifecycle, VIEW 권한 읽기 전용, 실 `DocumentRenderer` 미리보기와 mock/실 PostgreSQL 검증을 추가했다. Flyway 신규 변경 없음.
- **#845 DS-4 문서 양식 고도화**: schema v2에 allowlist `DETAIL`·`IMAGE`를 additive 확장하고, `EstimateLineResponse` 품목행 N행·로컬 로고·A4 print media fidelity를 기존 `DocumentRenderer → PrintLayout` 경로에 연결했다. 0/N행·7개 viewport 실제 기하/hit-test·2페이지 `page.pdf()` 행 경계와 반복 헤더를 확인했으며, 구현·인쇄 회귀 검증은 완료했다. 다만 `DETAIL`/`IMAGE` ACTIVE 배포는 updater와 `body.lineItems` 연결 선행조건이 충족될 때까지 활성화 게이트를 유지한다. 기존 schema v2와 DS-3b 인쇄 계약을 유지하며 Flyway 신규 변경은 없다. 상세 `docs/dev-reports/2026-07-23-869-ds4-document-template-advanced.md`.

- **#913 + #890 검증품질 보강 (2026-07-27)**: DS-4 실서버 QA의 run 격리 cleanup과 타임아웃·강제 종료·동시 실행 실측, IMAGE/BE ImageIO 회귀, 승인 pin trigger·mock parity·공개 승인 시그니처·실제 print media 검증을 추가했다. 상세 `docs/dev-reports/2026-07-27-913-890-verify-quality.md`.
- **#848 documentType 컬럼 40→70 확장**(PR #852): `documentTypeFor()`의 `GROUPWARE_${code}`(≤70=`GROUPWARE_`+code≤60)가 저장 컬럼 VARCHAR(40)을 초과(code 31자+ 시 500)하던 것을, `GROUPWARE_${code}`를 저장하는 3컬럼(groupware `approval_lines.document_type`·`document_templates.doc_type`·auth `approval_line_config.document_type`)을 70으로 확장해 해소했다(groupware V11·auth V89·shared `ApprovalLineBase`·`DocumentTemplate`·`ApprovalLineConfig`·FE `templateSchema`). ddl-validate가 length를 검사하지 않으므로 `information_schema.character_maximum_length=70` 단언 + 실 flush 경계 IT(41/70 성공·71 거부·정확값 round-trip)로 검증하고, DTO `@Size`도 40→70(R1 적대검증이 `@Valid` 게이트가 도메인 검증보다 먼저 41–70 저장을 400 차단함을 라이브로 포착). 협업 `document_type`(고정 `CollabDocumentType` enum)은 스코프 밖. 라이브QA로 3컬럼 실 write 경로(발의·문서양식·결재선)의 65자 저장·active GET 읽기를 실증했다.
- **전표 거래처 필수화 — 생명주기 전이 가드**(PR #853): OUTBOUND/INBOUND 전표가 committed 단계(SENT 이후)로 전이할 때 거래처(`partner_id`) 필수 불변식을 강제해, 거래처 없는 committed 전표(#823 배분 오귀속의 뿌리)를 원천 차단했다. `Slip.send()`(SAVED→SENT)·`restoreFromSnapshot()`(revision 복원·표준+협업)·forward 전이(accept~confirm/reject) 3중 도메인 가드 + 주문→전표 발행 partnerId fail-closed 해소(`SlipPublishService`)를 두되, DRAFT/SAVED(편집 단계)는 거래처 null을 허용해 컬럼 NOT NULL은 채택하지 않았다. FE `SlipDetailPage` 전송 preflight로 사용자 안내하고 BE 가드를 권위 backstop으로 둔다. 기존 위반 전표(실측 14건)는 동일 릴리스 cutover 보정(slip-service 보정 엔드포인트·partner_code→partner_id 멱등 해소·dry-run·검증쿼리 0)으로 정정한다. 라이브QA로 음성(무거래처 전송 400 차단)·양성(거래처 지정 후 SENT)·보정(14→0)을 실증했다.

- 협업 코-에디팅 S2b: slip 전표 저장 PUT 이후 기존 `slip_revisions` 버전 스냅샷을 기준으로 헤더 필드와 품목 셀의 이전값→새값 diff 를 계산해 `SlipRevisionResponse.fieldChanges`로 제공한다. 신규 테이블/Flyway 없이 기존 revision 흐름에 편입했고, 입고·출고 direct PUT 수정 경로가 실제 변경 시 EDIT revision 을 남긴다. desktop 버전 이력 패널은 displayName + `presenceColor` 단일색상으로 필드 변경 목록을 표시하며 UUID/connectedId 는 노출하지 않는다. 수정 카운트와 레드라인은 S2c/S2d 후속.
- 협업 코-에디팅 S2c: 사용자 노출 "전표수정내역"(`editHistoryCount`)을 상태의존으로 게이트한다. 판매전표(OUTBOUND)는 창고이관(`inspect()`→COMPLETED, 재고차감), 그 외(비-OUTBOUND)는 다음 결재선(`send()`→SENT) 後 편집만 카운트하고, 임계 前 드래프트 편집은 S2b 버전로그에 보존하되 카운트에 반영하지 않는다. `revisionCount`(audit revisionNo)는 불변 유지하고 신규 `revision_count_baseline`(V53, 임계 전이 시점 스냅샷)을 차감해 표시한다. 기존 임계통과 전표는 backfill `baseline=0` 으로 현 표시를 보존한다. INBOUND 는 BE·mock 구현하되 `PurchaseQueryPage` 컬럼 미노출(forward-compatible). 레드라인은 S2d 후속. (PR #676)
- 협업 코-에디팅 S2d-1: 임계 통과 전표 조회 시 **헤더 셀**에 anchor 後 누적 레드라인(track-changes)을 인라인 표시한다. 임계 전이 시점 `max(slip_revisions.revision_no)` 를 `redline_anchor_revision_no`(V54)로 고정하고, anchor 後 편집만 기존값 취소선 + 사용자색 수정값으로 재귀 스택 표시한다(`RedlineCell`, S2b 스타일 재사용). S2d-1 은 헤더 필드 한정 — 라인 셀(품목)은 행인덱스 누적·단가/합계 VAT 정합 이슈로 **S2d-1b 후속**, 라이브 Yjs 실시간 track-changes 는 **S2d-2**. (PR #677)
- 협업 코-에디팅 S2d-1b: 임계 통과 전표 조회 시 **라인 셀**에도 anchor 後 누적 레드라인을 표시한다. `SlipSnapshot.Line`을 VAT 포함 단가·부가세·공급가액 nullable 필드로 additive 확장하고, `productId + 등장순서` 안정키로 최신 행 인덱스 `lines[i].field`를 emit해 라인 삽입/재정렬 후 이력 혼입을 막는다. desktop 전표 상세는 품목명·모델명·규격·수량·단가(VAT포함)·합계(VAT포함)를 `RedlineCell`에 연결하고 숫자 layer는 천단위 포맷한다. legacy VAT-null snapshot은 VAT 제외값 그대로 fallback한다.
- 협업 코-에디팅 S2d-2: 임계 前 Yjs 라이브 편집 중 타 사용자의 방금 수정한 필드를 awareness `lastEdit:{fieldPath,ts}` 기반으로 사용자색 2.5초 펄스 하이라이트 + `{displayName} 수정` 배지로 표시한다. `CollaborativeSlipInput`과 메모 `CollaborativeTextField`에 송신/표시를 연결했고, BE/slip-service 변경 없이 기존 opaque base64 awareness relay를 그대로 사용한다. 저장 redline accept/reject 및 편집모드 live redline stack은 후속 후보로 남긴다.
- 협업 코-에디팅 S3-0: slip 전용 Yjs relay/provider를 도메인 무관 공용으로 승격했다. BE는 `shared:collab-core` `CollabCoeditService(documentId)`가 opaque base64 update/awareness relay를 담당하고, slip coedit 3 endpoint는 URL·DTO·권한·SSE event 계약을 유지한 채 delegate한다. FE는 `makeCoeditApi(basePath)`와 `createDocCoeditProvider({ documentId, basePath, headerTextFields })`로 공용화하고, slip은 첫 소비자로 `/slips/{id}`와 긴 헤더 텍스트 필드 집합을 주입한다. 타 문서 rollout은 S3-1+ 후속.

### 최신 진행 메모 (2026-06-24)

- 출고전표 배송일정(M상N하) 자동 — 구조화 태그 (PR #595): 배송태그(지방/야적)별 상차(M=출고일 잠금)/하차(N) 일정을 `DeliverySchedule` 규칙(N=M+1·일요일→월요일·야적토=일요일·지방당착)으로 자동 계산해 `Slip.unload_date`(V52) 구조화 필드 보유, 특이사항 앞 파생 라벨 `25상26하`/`당착`(메모 미저장). N 편집·당착·M 잠금. 컷오프 8지점에 applyDeliverySchedule 배선(태그변경/override 시만 재계산, override 보존). applyDeliveryTagAutoMemo 폐기. ci.yml `slip.it.schedule.*` 등재. 라이브 QA 9/9.
- 출고전표 컷오프(마감) 시간 설정 — 인사 메뉴 (PR #594): 배송태그별 마감 시각을 `slip_outbound_cutoff`(V51) 마스터로 동적 CRUD(지방 12:00·야적 14:00·경동 15:00 시드)하고, `OutboundCutoffGuard`(KST Clock)를 출고전표 생성 6경로 + 배송태그 확정(editHeader/v20) 2경로 = 8지점에 배선해 당일·마감 초과 시 409 차단한다. page-code `hr.slip-cutoff`(MASTER/MANAGER, auth V70 4-table), gateway `/admin/slip-cutoffs`. desktop 인사 설정 페이지 + 출력문서 배송태그 표시. ci.yml `slip.it.cutoff.*` 필터 등재로 신규 IT 실행 보장.
- 검수완료 → 배차발송 에픽 완결: 슬1은 검수완료 출고전표를 배차 발송 대기 진입점과 아로로지스 기존 발송 경로에 연결했고, 슬2는 `external_carrier` 외부기사/배송사 마스터 CRUD를 추가했다. 슬3는 `external_dispatch`/`external_dispatch_slip` V50 이력과 `POST /admin/external-dispatches` SMS 발송을 추가했다. 슬4는 `PRINT`/`BOTH` 채널과 `GET /admin/external-dispatches/{id}/print-data` 인쇄 데이터 조회, desktop A4 배차의뢰서(`/dispatch/external-dispatch/{id}/print`)를 완성했다. PRINT 는 SMS 호출 없이 SENT + `DISPATCHED`, BOTH 는 SMS 결과로 SENT/FAILED 를 기록하며 인쇄 데이터는 같은 발송 이력에서 제공한다. Flyway 신규와 권한 신규 시드 없이 `dispatch.board` 를 재사용하고, 화면에는 배송사명/연락처/전표번호/배송지/수령자/품목요약만 노출한다.

### 최신 진행 메모 (2026-06-11)

- §7 전역 협업 — presence(동시 접속자) 4문서 롤아웃 (PR #545): 슬립 presence MVP(PR #515) 후속으로 **회계전표·주문·견적·그룹웨어 결재 4문서**(FE collab 패널 보유)에 동시 접속자 presence 를 순수 additive 배선. 각 `{Doc}CollabController` 에 슬립 `SlipCollabController` 1:1 복제로 `POST /collab/presence/join`·`/leave`·`GET /collab/presence`(200) + presence DTO·helper·`@ExceptionHandler` 추가(`shared:realtime-abstraction` `PresenceService` 자동 빈 — 추가 설정 0), FE 4 패널에 문서별 `{Doc}PresenceClient` + `usePresence` + `<PresenceIndicator/>` 배선(client override 로 슬립 경로 교차오염 방지). **신규 권한 page-code·시드·Flyway = 0**(각 문서 기존 댓글 VIEW page-code 재사용). presence wire payload = `{sessionId, displayName, color}` 만(UUID 비공개, IT 박제). 각 서비스 presence IT(실 Postgres) + 라이브 Docker 실 QA 4/4(API + 2세션 UI `docs/qa/collab-presence-rollout/` "현재 보는 중" 상호 표시). 배차(FE 패널 미존재·comment-only)는 **PR2 별도 슬라이스**. dev-report `docs/dev-reports/2026-06-20-collab-presence-rollout.md`.
- 기초품목↔견적품목 분리 슬1 — 견적품목 관리 메뉴/화면 신설 (PR #496): 판매(견적/주문) 카탈로그의 카테고리별 SKU/단가/번들 복잡도를 물리 품목 마스터와 분리(개발책임자 D-IES-01~04, 판넬 데이터 실증: 같은 기능 판넬이 시스템별 다른 SKU·단가). 현 `ProductCatalogPage` → **기초품목 관리**(구 품목 관리, 등록 전용 슬림화 734줄) + **견적품목 관리**(신규 `/products/estimate-items`): 노출 M:N 칩·카테고리별 표시순서·드래그·순서저장 이관 + 기초품목 `ProductAutocomplete` 선택 추가(`PATCH /usage` append, 신규등록 불가·MATERIAL/비카탈로그/이미노출 필터·"이미 노출됨" 가드, D-IES-03). 세트 구성(bundle_component)도 견적품목 소관(D-IES-04, 슬2 이관). BE/데이터 모델 무변경(`PATCH /usage`·`PUT /display-orders`·`GET products?q` 재사용). #494(M:N 노출)·#495(구성품 정렬) 자산 견적품목 귀속(폐기 아님). Opus 3-agent(P1 contract sweep·reorder 단언 삭제)→Codex fix→Opus 수렴 재리뷰(미수렴 잔여)→Codex 교차 합치→fix2(real-QA testid 4스펙·마우스드래그 reorder 복원·chip scope·count) 수렴 + 실서버 QA(견적품목 add-from-master·노출/순서·메뉴 분화 캡처; M:N real-qa 는 2-카테고리 데이터 부재로 데이터-게이트). dev-report `docs/dev-reports/2026-06-17-estimate-items-menu-slice1.md`.
- 세트 구성품 정렬(드래그) + display-orders 부분요청 가드 재도입 (에픽 #18 슬2, PR #495): 세트(BUNDLE) 구성품을 종류순(실내기→실외기→판넬→리모컨→자재→ACCESSORY→FOOT) + 종류 내 '기본' 먼저로 **구조 고정**하고, 사용자는 **같은 종류 비-기본끼리만** dnd-kit 드래그 재정렬(per-SET, 종류경계·기본 위 이동 금지). BE `replaceComponents` 가 저장 전 `(kindRank→isDefault DESC→incoming index)` 안정정렬로 `display_order` 정규화 → 불변식 **서버 단일 진실원**(클라이언트 배열이 위반해도 교정), `ComponentKind.rank()`. FE `componentsModalModel`(BE 동일 정렬키·`canReorder` 종류내 비기본 제약·`arrayMove`) + `SortableComponentRow`(기본행 핸들 disabled·`canEdit=false` 숨김·Pointer+Keyboard 센서) — BE 와 이중 방어, 저장 후 react-query invalidate. **display-orders 부분요청 가드 재도입**(`2b69cf23` revert 분) — 가드 모수를 대상 카테고리 활성 노출 중 `usageScope IN (ESTIMATE/PARTNER_ORDER/BOTH)`(NONE 제외)로 두어 FE 전송 모수(`usageScope≠NONE`)와 **집합 동일** → 부분요청 400(D-PCE-09). IT 를 카테고리 전체세트 전송으로 교정 + NONE/PARTNER_ORDER 회귀(어제 false-green 차단 — CI product 잡 `--tests` 필터 없음 → IT 실Postgres 실행). mock display-orders 가드 동형화(부분 payload 회귀 적발). Opus 4-agent 리뷰(P1 가드 모수 비대칭 단독 적발)→Codex fix→Codex 5-agent 교차(수렴 OK)→Opus 수렴 재리뷰 + Docker 실서버 QA(`AC100CS6PHH1SY` 판넬 2→4 드래그·저장·재오픈 영속·기본 고정·가드 부분400/전체204 실HTTP). estimate-app/슬1 M:N 모델 무변경·slip usageScope=BOTH 회귀가드 보존. D-PCE-08/09. dev-report `docs/dev-reports/2026-06-17-product-set-component-reorder.md`.
- 품목 다중 카테고리 노출 M:N + 싱글중대형 라벨 (에픽 #18 슬1, PR #494): 견적 노출을 `products.estimate_category`(단일 컬럼) → **`product_estimate_exposure`(M:N, V18)** 단일 원천으로 전환 — 한 단일 품목(판넬/리모컨/유연호스 등)을 여러 견적 카테고리(홈멀티/싱글중대형/상업멀티/구형)에 **중복 노출** + 카테고리별 독립 표시순서. `findExposedCatalog`·`searchByUsageScope`(admin) **M:N JOIN**(SINGLE_PART 도 견적 카테고리 노출 가능), `PATCH /usage` `estimateCategories` replace, sync **additive upsert**(삭제 금지)+manual skip+명시 save(self-invocation flush), `PUT /display-orders` 카테고리별 1..N + 전체요청 가드(부분 붕괴 방지), soft-deleted product exposure 동반 정리, `ProductCatalogResponse.estimateCategories`(D-PCE-03~06). `products.estimate_category/display_order` deprecated 보존(dual-write 금지). estimate-app 무변경(카테고리별 별도 HTTP 자동 수용). desktop ToggleCell **다중 칩**(TagChip) + 카테고리별 드래그. **SINGLE_SET 사용자 라벨 "싱글중대형" 전역 통일**(세트 아닌 단일 품목도 포함 — enum 식별자·시트 탭 매처·수식 보존, 27파일/97 spot, D-LABEL-01). Opus 5-agent + Codex 교차 리뷰 수렴(reorder IT·orphan exposure·display-orders 가드) + 실서버 M:N 다중노출 실증(AJ060 홈멀티+싱글중대형)·데스크톱 다중칩 실QA. dev-report `docs/dev-reports/2026-06-16-product-multi-category-exposure.md`.
- 좌측 메뉴 5대분류 재편 + 접기/펼치기 (PR #462): 좌측 메뉴를 **상단 고정 2(홈·알림 내역) + 7 그룹**(판매/구매/회계/그룹웨어/인사 + 배차(arologis)·창고 운영)으로 재편 + '홈' 최상단 신규('대시보드' 리라벨). **IA 재배치(이동·그룹핑·라벨)만** — 라우트·page-code·권한 로직 무변경, 그룹 헤더 노출 = 기성 `dynamicCanAccess`(SP-D1~D4) 단일 소스(자식 권한 1개라도 있으면 표시, 전무 시 완전 미렌더; D-M5C-01). 하위 메뉴 **접기/펼치기**(`SidebarCategory` 헤더 토글 일반화 — 기본 접힘·활성 라우트 그룹 자동 펼침·`localStorage['samhan.sidebar.group.<label>']` 영속·`role=heading`/`aria-expanded`/`role=group` 접근성, D-M5C-02). **단톡방 매핑 그룹웨어 단일화**(AdminLayout 중복 제거, 라우트/가드 유지, D-M5C-03). 배차 그룹 라벨 코드명 `arologis`→'배차'. **주문서 승인 보안 게이트**(fail-open 차단) — FE 라우트 PermissionGuard + partner-auth-service `PartnerApprovalsController` @RequirePermission(`sales.partner-order.list`, FE 사이드바 게이트와 동일 page-code) + `:shared:security` 의존·lockout 방지 `DynamicPermissionClientConfig` bean·enforcement IT(grant→!403/deny→403+counter/MASTER bypass/PARTNER deny, 실 HTTP 회귀, D-M5C-04). AROLOGIS 완료 배차 내역뷰는 별도 슬라이스 분리(D-M5C-05). 4-라운드 다모델 리뷰(Opus 5확정 + Codex 7확정 + Fable5 14확정 — Fable5 가 CI-RED 2·보안 1 적발) + Docker 실서버 QA 13컷(`docs/qa/menu-5category/`). desktop mock 468 pass·partner-auth IT 13/13. dev-report `docs/dev-reports/2026-06-11-desktop-menu-5category.md`.
- 품목관리 고도화 (PR #461): 구글 시트를 **최초 시드 전용**으로 격하 — `ProductSheetSyncScheduler` cron + 부팅 sync 를 `samhan.product.sheet-sync.cron-enabled`(기본 false) 게이트로 비활성(표시순서 시트 재적재 소실 방지), 수동 비상 재적재 trigger 만 유지(D-PCE-04). 출처 컬럼·뱃지 제거. **세트 컬럼**(BUNDLE 뱃지 + componentCount, N+1 벌크 count) + **구성품 편집기**(GET·PUT `/products/{code}/components` replace-all — BUNDLE 아님 409·빈 배열/자기참조/미해소/세트-안-세트/중복 400, 해소 축 = modelCode-only expander 정합, soft-delete actor, PESSIMISTIC_WRITE 동시성, V15 `bundle_component.display_order`) + **표시 순서 직접 조정**(드래그 → PUT `/products/display-orders` 일괄, 견적/주문 노출 품목 한정·`estimateCategory` 검증 축 자동 재번호, D-PCE-02). **설정 실시간 SSE**(`ProductCatalogChangePublisher` afterCommit 통일 → `GET /products/catalog-realtime` 구독, usage/components/display-orders mutation 동시 시청자 실시간 갱신, D-PCE-05). **세트 재고 가드**(BUNDLE 라인 재고조회 제외 — SlipForm/주문상세, SlipDetail 은 전개 저장으로 불요; partner-order 상세 `#23` productType enrich = modelCode 일괄조회 fail-soft, D-PCE-06/07). api-gateway 라우트 3종 추가. 4-라운드 다모델 리뷰(사이클1 + Opus 16 + Fable5 + Codex 8) + Docker 실서버 QA 12컷. dev-report `docs/dev-reports/2026-06-11-product-catalog-enhance.md`.
- 품목 노출 수동 토글 + 품목관리 화면 (요구사항1 PR-B, PR #460): `usage_scope_manual` 플래그(V14)로 시트 sync 가 수동 토글을 보존(soft-delete 보호 포함)하고, 시트 복귀 시 rowHash 캐시 evict 로 재분류를 보장. catalog 경로(`/api/v1/products`)에 q 검색 + usageScope **IN-확장**(PARTNER_ORDER→+BOTH) + 결정 페이징(ORDER BY displayOrder) — 주문서 PARTNER_ORDER 분기 실효화. desktop '품목 관리' 화면 신설(견적/주문 노출 토글, 시트자동·수동 뱃지). 메뉴명 '공급자 설정' 라벨은 #459 에서 확정.
- 공급자·은행계좌·인감·로고 회계 설정 (PR #459 머지): 회계 > **공급자 설정**(`SupplierProfile`)을 TEL/FAX·입금계좌(`supplier_bank_accounts`, 계좌별 명세서 노출 토글)·인감/로고(BYTEA)로 확장하고, desktop 인쇄 20뷰의 `COMPANY` 하드코딩 상수와 `VITE_COMPANY_*` env 주입을 `useCompanyProfile()`(인쇄 전용 인증-only `print-profile` — 외부 파트너 403) 배선으로 전수 대체했다. 세금계산서 발행 공급자 블록도 primary 공급자 설정으로 일원화 (CompanyProperties fallback).
- 출고전표·거래명세서 원본 양식 1:1 (PR #458 머지): 결재란/정렬 정정 2회 반영 + 전자서명 배치 + 한 A4 자동 비율. 결재란 사원 서명 스탬프는 사원 서명 등록 슬라이스(후속) 대기.

### 이전 진행 메모 (2026-06-03)

- Phase INV-S 후속 "시리얼 재고 동시성·보상 강화" 완료:
  - S3 reserveBatch / S4 recallBatch 후보 조회를 `PESSIMISTIC_WRITE` row lock 으로 전환해 교차 전표 후보 경합을 직렬화했다.
  - S4 recall 역전이 보상(`unrecall-batch`)을 추가하고, `completeRecallInbound` 혼합전표 batch 실패 시 serial recall 보상을 역순 실행한다.
  - Flyway 변경 없음. 배포 순서: inventory(row lock + unrecall API) → slip(unrecall client + 보상 루프).
  - 검증: inventory `StockInstanceOutboundIT` 12 tests / 0 skipped, slip `SlipInboundInstanceIT` 10 tests / 0 skipped.

### Phase 10.5 최신 D-AX 진행 메모 (2026-05-16)

- D-AX-15: `clients/arologis-mobile` driver dashboard GPS 이식 완료, PR #194 merge.
- D-AX-16: signature / sign-and-send-copy 를 today 정차 target 기반으로 이식 완료. driver-facing 응답에서 `dispatchId` UUID 를 제거하고 정차 목록/서명 화면을 연결.
- D-AX-17: DELIVERY / INSPECTION 배송·검수 사진 이식 완료, PR #197 merge. 서버 내부 slip attachment bridge 로 저장하고 앱에는 내부 id/download URL 을 노출하지 않음.
- D-AX-18: 전표 상세 bridge 완료, PR #198 merge. today 정차 target 을 서버에서 slip 상세로 해석하고, 아로로지스 모바일은 읽기 전용 전표 상세/품목/합계 화면만 표시.
- D-AX-19: `clients/mobile-staff` 기사 모드 은퇴 완료, PR #199 merge. 기사 기능은 `clients/arologis-mobile` 전담, mobile-staff 는 estimate WebView 단일 진입으로 축소.
- D-AX-20: Admin 사진 감사/재업로드 후보 화면 완료, PR #200 merge. `GET /api/v1/slips/admin/photo-audit` 로 전표 첨부 사진을 조회하고, 화면에는 `YYYY/MM/DD-{순번}` 전표번호만 표시하며 UUID/원본 URL/raw 업로더 UUID 는 숨긴다.
- D-AX-21: 전표/배차 표시번호 `YYYY/MM/DD-{순번}` 업무번호 범위형 표준화 완료, PR #201 merge. 판매전표/구매전표/배차번호 등 서로 다른 서비스·메뉴의 업무번호는 같은 날짜 같은 순번을 가질 수 있으며, 각 도메인은 업무 타입 + 표시번호를 기준으로 구분한다.
- D-AX-22: driver-facing GPS/서명/사본/전표상세 계약의 UUID 비노출 hardening 완료, PR #202 merge. 내부 PK/저장키/원본 URL 은 서버 내부 처리에만 쓰고 화면/API 응답에는 업무번호, target sequence, 표시명만 노출한다.
- SP-01: Samhan Public 거래처 관리 메뉴 gap 정합화 완료, PR #203 merge. `판매 > 거래처 관리`와 `/admin/partners`, `/admin/partners/new`를 `SALES / MANAGER / MASTER` 공용 권한으로 정렬했다.
- SP-02: Samhan Public 회계 마감 메뉴 gap 정합화 완료, PR #204 merge. `매출 마감`은 `/sales/closing`, `월말 마감`은 `/accounting/period-close`로 고정하고 MANAGER 조회 전용 백엔드 계약 및 accounting-service Docker 무스킵 테스트(204 tests / 0 skipped)를 맞췄다.
- SP-03: Samhan Public 구매관리 검수 CTA + 관리형 메뉴명/표시번호 정리 완료, PR #205 merge. `/purchases` 통합 화면에서 `WAREHOUSE / MANAGER / MASTER`가 `SAVED / CONFIRMED` 구매전표를 같은 행의 **[검수]** 버튼으로 `InboundInspectionDialog`에 연결하고, 판매/구매/재고이동/창고/견적서/주문서 메뉴는 `…관리` 명칭으로 정렬했다. 재고이동 이동번호도 `T-`/`TR-` 없이 `YYYY/MM/DD-{순번}`으로 통일했다.
- SP-04: Samhan Public 전메뉴/권한/legacy GAS·노션 이식 감사 완료, PR #206 merge. `/tools/legacy-gas` 27개 GAS 카테고리와 PR #115/#117/#118/#119/#120/#163을 대조하고, 단톡방/발송금지/배차지역/DC CSV row count와 종합견적서/주문서 Google Sheet 원본 tab 계약을 재검증했다.
- SP-05: Samhan Public 실사용 CRUD 표면 재점검 완료, PR #207 merge. 판매관리/구매관리 목록에서 명시 `상세` 버튼으로 `/sales/:id`, `/purchases/:id`에 진입하도록 보정하고, 거래처 기본 UI와 구매 검수 CTA 문서 상태를 최신화했다.
- SP-06: legacy GAS/Notion DB 이관 정합성 완료, PR #208 merge. 단톡방/발송금지/배차지역/DC 원본 CSV는 cutover 시 각 service DB로 이관하고, 이후 모든 조회·수정·삭제는 Samhan Public DB CRUD 화면/API만 사용하도록 gateway/스크립트/문서 계약을 고정했다.
- SP-07: Google Sheets 견적/주문 E2E 진행. GAS UI/기능은 그대로 유지하고 Notion 통신만 DB/API로 치환한다. `종합 견적서` live spreadsheet 27개 tab을 재검증하고, `*_단가인상` 기본 단가와 base `인상 전 단가`를 product DB/PriceHistory로 고정하며 output/control form(`종합견적서`, `전표업로드목록`, credential-bearing `전표생성폼`)을 runtime 원본에서 분리한다.
- SP-08-2: DPS legacy GAS 저장내역 parity 완료, PR #211 merge. `DpsSaveHistory` 도메인을 `inventory-service`에 추가하고, DPS 비교/품목별 DPS 화면 모두 실행/저장내역 2탭 + latest 자동 복원 + 명시 저장/복원으로 정렬했다.
- SP-08-3-1: 배차 legacy GAS 저장/복원/preview/send parity 기반 잠금 진행. 6개 화면의 기존 endpoint와 SP-08-3-2~4 신규 history endpoint를 정적 계약으로 고정하고, UUID/Notion runtime/secret-like marker zero guard를 추가한다.
- SP-08-3-2: arologis 배차 4 화면 history 구현 진행. `dispatch_save_history` JSONB 저장내역과 `/admin/arologis/dispatches/history` 4 endpoint를 추가하고, 가배차/지방가배차/미배차/운송사 비교 화면에 공통 저장내역 탭을 연결한다.
- SP-08-3-3: slip 전표정리 저장내역 구현 완료, PR #214 merge. `slip_cleanup_save_history` JSONB 저장내역과 `/slips/cleanup/history` 4 endpoint를 추가하고, `/sales/slip-cleanup` 화면에 실행/저장내역 2탭과 latest 자동 복원/명시 저장을 연결했다.
- SP-08-3-4: notification 배차문자 미리보기/발송 감사 저장내역 구현 진행. `dispatch_sms_save_history` JSONB 저장내역과 `/admin/notifications/dispatch-sms/history` 4 endpoint를 추가하고, `/arologis/dispatch-sms` 화면에 실행/저장내역 2탭, `AUTO_LATEST`/`MANUAL_NAMED` 미리보기 저장, `SEND_AUDIT` 발송 감사 append를 연결한다.
- SP-08-4-2: partner-order 주문 수정 direct PUT 구현 진행. 본사 운영자(`SALES / MANAGER / MASTER`)는 `PUT /api/v1/partner-orders/{id}`로 즉시 수정하고, 거래처(`PARTNER`)는 기존 EditRequest 요청/승인 흐름을 유지한다.
- SP-08-4-3: partner-order 주문 soft delete + 견적 주문 변환 구현 진행. 본사 운영자(`SALES / MANAGER / MASTER`)는 `DELETE /api/v1/partner-orders/{id}`로 `DRAFT / CONFIRMING` 주문을 soft-delete하고, `POST /api/v1/partner-orders/from-estimate/{estimateId}`는 외부 estimate snapshot을 주문 row로 변환하며 `source_estimate_id` 중복을 409로 차단한다.
- SP-08-4 시리즈 완료: partner-order 주문 목록·상세, 수정, 삭제+견적 변환, 인쇄 양식 4개 PR이 main `d5c3d573`까지 머지됐다.
- SP-08-5-1 진행: 구매/매입 R1/R2를 `Slip(type=INBOUND)` 기준으로 잠근다. `type=INBOUND` alias, 최신 전표일자 정렬, `WAREHOUSE / MANAGER / MASTER` 권한, `INVENTORY` 제외, 상세 `inspectionStatus`를 IT/Playwright/QA PNG로 고정한다.
- SP-08-5-2 진행: 구매/매입 수정 direct PUT을 `slip-service` `PUT /api/v1/slips/{id}`로 잠근다. INBOUND 전용, `WAREHOUSE / MANAGER / MASTER` 권한, `updatedAt` 낙관적 잠금, 라인 422 검증, `SLIP_EDIT` audit revision, desktop 상세 수정 Modal과 409 최신 내용 불러오기 배너를 정적 계약/QA PNG로 고정한다.
- MIG-11 완료: 매출장/매입장 XLSX를 Apache POI로 파싱해 accounting-service staging 2표에 보존하고, `DailyClosing(closing_kind,total_amount)`과 일별 합계를 warning 방식으로 대조한다.
- MIG-12 follow-up 완료: V32로 `tax_invoice_lines(tax_invoice_id,line_no)` UNIQUE를 active row partial UNIQUE로 교체하고, Product/Partner LookupClient 내부 인증 실패를 `MIG12_INTERNAL_AUTH_MISS(503)`로 격상했다.
- MIG-13 minor cleanup 완료: V32 이후 문서/회고/테스트 주석과 footer 판별 dead branch를 정리했다.
- MIG-14 완료: Cash / Order / Ledger admin UI를 `clients/desktop`에 통합하고, 30+ IT의 deprecated `DynamicPermissionClient @MockBean`을 shared/security 통합 인터페이스 mock으로 청소했다. (이카운트 네이티브 편입 슬1: 잔액 스냅샷 silo 폐기(PR #518)로 AgingSnapshot 화면·page-code `ecount.mig14.aging-snapshot` 제거 → admin UI 4 → 3 화면, 거래처 잔액은 네이티브 `/accounting/reports/partner-aging` 보고서로 대체.)
- MIG-15 완료: POI 의존성을 `shared/common`에서 `shared:ecount-io`로 분리했다.
- MIG-16 완료: partner-service batch lookup, accounting admin partnerName batch, aging snapshot pagination, refresh toast, 권한 로딩 flash 방지를 정리했다. (aging snapshot pagination/refresh toast 는 슬1 PR #518에서 화면·API 와 함께 제거됨.)
- MIG-17 완료: Designer tokens.md와 7개 mock wireframe의 CashKind / CashReceiptKind / OrderProgressStatus 라벨을 화면 API enum 기준으로 동기화했다.
- MIG-18 완료: admin UI 2단계로 filter chip/reset, page size, "회계 관리자" 메뉴 그룹을 연결했다. (AgingSnapshot page size 항목은 슬1 PR #518에서 화면 제거와 함께 폐기.)
- MIG-19 진행 중: 운영자용 `docs/migration/ECOUNT-CUTOVER-GUIDE.md`를 신규 작성해 raw 다운로드, DB 백업, MIG-1~11 실행, admin UI 확인, rollback, DailyClosing 대조 절차를 묶는다.
- MIG-20 완료: `POST /admin/ecount/reimport/{slice}` MASTER 전용 endpoint와 `source_file_hash` 멱등 skip, 외부 cron/Task Scheduler 운영 절차를 추가했다.
- MIG-21 완료: Micrometer/Prometheus 지표, dashboard-service `/api/v1/dashboard/ecount-mig`, desktop 운영 대시보드, Grafana JSON을 추가했다.
- MIG-22 완료: IDE workspace stale classpath 문제를 Gradle Eclipse task + README 절차로 정리하고, TypeScript deprecation, unused import, VehicleTonnage deprecated 직접 사용을 정리했다. `DynamicPermissionClient` 잔존 25+ 파일은 MIG-23+ 점진 제거 백로그로 남긴다.
- 다음 후보: SP-08-5-3 매입 soft delete + InboundInspection 정합, SP-08 회계/vendor OCR/Aligo 후속 parity, 운영 데이터 실 import 검증.

## Phase 0 — 저장소·가드 정립

### 산출물
- Gradle multi-project (`shared/common` + `services/*` + `clients/*`)
- BaseEntity 7 audit 컬럼 + Soft-delete 전용 (`@SQLRestriction("is_deleted = false")`) 가드
- DB 컬럼 타입 가드 (`VARCHAR(N)` 만 허용, `CHAR(N)` 금지)
- gradlew 실행 권한 가드 (`git update-index --chmod=+x gradlew`)
- 한국어 commit / PR / Issue 의무

### 완료 조건
- 모든 후속 슬라이스가 위 가드 적용 (CI assemble PASS).

---

## Phase 1 — Infrastructure + Auth + Eureka + Logging

### 산출물
- `infrastructure/docker-compose.yml` — PostgreSQL 10 DB / Redis / RabbitMQ / Elasticsearch / MinIO / Prometheus / Grafana
- `services/eureka-server` (8761), `services/api-gateway` (8080, reactive)
- `services/auth-service` (8081, JWT HS256 + internal API)
- `services/logging-service` (8082, RabbitMQ consumer + Elasticsearch)
- gateway HeaderAuthenticationFilter 패턴 정립

### 머지 PR
- #2 auth + user-service 첫 슬라이스
- #3 team/auth (auth-service 정상화)
- #5 devops post-phase2-cleanup

### 완료 조건
- gateway 8080 → 각 서비스 routing OK, JWT 검증 OK, RabbitMQ → Elasticsearch 흐름 OK.

---

## Phase 2 — User + Product + Inventory + Electron 첫 슬라이스

### 산출물
- `services/user-service` (8083, 16명 시드 + AuthClient 패턴)
- `services/product-service` (8084, jsonb 태그 + GIN 인덱스 + Internal API)
- `services/inventory-service` (8085, FIFO + 4-tier 창고 + 22 endpoint, X-Internal-Token gateway 우회)
- `clients/desktop` Electron 첫 슬라이스 (electron-vite + React + 16 컴포넌트 디자인 시스템 적용)
- `clients/web/design-system` 16 + 1 (SignaturePad/Viewer 후속) 컴포넌트 + Storybook

### 머지 PR
- #7 product BE 도메인 + API
- #9 product FE 디자인 시스템 컴포넌트
- #11 product DevOps gateway routing
- #13 product QA 테스트 + 리포트
- #15 product hotfix (currency bpchar)
- #16 inventory 첫 슬라이스 (4-tier)
- #17 slip 첫 슬라이스 (Phase 3 진입)
- #18 desktop electron skeleton

### 완료 조건
- 4-tier 창고 + FIFO + 이동전표 22 endpoint 가 IT 통과, Electron desktop 4 화면 동작.

---

## Phase 3 — Slip Service (출고/입고 10단계 + 전자서명)

### 산출물
- `services/slip-service` (8086, 10단계 라이프사이클, dispatcher/inspector 자동 서명, 라인 specification, DeliveryBatch)
- 전자서명 (Canvas + SHA-256, 인수자/기사 양측 캡처, DispatchView 인쇄 통합)

### 머지 PR
- #19 sales output-format
- #20 sales form-polish
- #21 sales polish-2 (인쇄 양식)
- #22 notification-slice-B (Solapi SMS)
- #23 signature-slice-C (Canvas + SHA-256)
- #26 signature-mobile-ux

### 완료 조건
- slip-service 30 endpoint, 모바일 전자서명 2-step (기사 → 인수자) UX 통과.

---

## Phase 4 — Accounting Service

### 산출물
- `services/accounting-service` (8087, 한국 일반기업회계기준 65 row 시드, ChartOfAccount + Journal + JournalLine + 시산표, 7 endpoint, audit-safe reverse 분개)

### 머지 PR
- #28 accounting-slice-A

### 완료 조건
- 시드 65 row + 시산표 endpoint + reverse 분개 IT 통과.

---

## Phase 5 — SMS Aligo 마이그레이션

### 산출물
- Solapi → 알리고 SMS 게이트웨이 마이그레이션 + Mock 게이트웨이

### 머지 PR
- #30 sms-aligo-migration

### 완료 조건
- 발송번호 사전등록 + Mock 활성 (test/local 프로파일) 검증.

---

## Phase 6 — Legacy Migration 본격 구현

### 산출물 (backend 5 슬라이스)
- M1a — `services/product-service` 시드 + Google Sheets cron 동기화 + by-code endpoint (Phase 7 3차 추가)
- M2 — `services/partner-auth-service` (8091, 거래처 자체 인증 7 endpoint, password_history 5 FIFO)
- M3 — `services/dc-config-service` (8089, Partner master owner + DC 노출 5겹 가드)
- M4 — `services/partner-order-service` (confirm 흐름 + outbox + 16종 bootstrap)
- M5 — `services/slip-service` `/from-*` endpoint + idempotency 3중 격리

### 산출물 (client 5종)
- `clients/web/order-app` v4 — Vite + React + legacy `partner-order/index.html` 9427 라인 임베드 (PWA 보존)
- `clients/web/estimate-app` v2 — Node.js + Express + EJS + legacy estimate 18614 라인 1:1 변환 (B2 옵션)
- `clients/desktop` v4 — Electron + electron-vite + 16 + signature 라우트
- `clients/mobile` v4 — Expo + RN WebView + order-app v4 임베드 (dev URL `http://localhost:5185/`)
- `clients/mobile-staff` v3 — Expo + RN WebView + estimate-app v2 임베드 (dev URL `http://localhost:5183/`)

### 머지 PR
- #38 M1a product-service 시드
- #50 / #53 web order-app v4 (Vite SPA + PWA)
- #51 / #54 desktop v4
- #52 mobile v4 (RN WebView)
- #58 estimate-app v2 (Node.js + Express + EJS, B2 옵션)
- #61 mobile DC notice 삭제 (UUID 노출 회피)
- #67 / #70 legacy-v2 import + revert (별 프로젝트 분리)
- #68 / #75 product-service google sheets cron + 정정
- #69 RN client 통합 (Mobile v4 + mobile-staff v3)
- #71 (close) M3 단독 → #76 통합
- #72 M2 partner-auth-service
- #73 estimate-app google sheets 직접 연동
- #74 (close) M4 단독 → #76 통합
- #76 Phase 6 backend 통합 (M2 GG fix + M3 + M4 fix + M5)
- #77 DEVOPS — Cloudflare Pages deploy workflow (order-app 활성)
- #78 QA — Playwright + Detox 셋업 + CI workflow
- #79 client mock 일괄 제거 (`USE_MOCK_FALLBACK` 폐기)
- #80 Phase 6 마무리 (회고 + DECISIONS + dev URL 검증 + estimate-app 호스팅 + Phase 7 readiness)

### 완료 조건
- backend 5 슬라이스 + client 5종 모두 origin/main 머지, 회고 보고서 + DECISIONS 등록.

### 회고
- `docs/dev-reports/phase6-retrospective.md` 참조
- 통합 PR 패턴 정착 (PR #66 / #71 / #74 / #77 / #78 / #79 close 후 통합 재구성)
- GitGuardian 패턴 정리 (placeholder + fixture 키 이름 + Testcontainers default)

---

## Phase 7 — 호스팅 인프라 + e2e QA + 운영 가드 + UI 통합 (완료)

### 산출물 (1차 — PR #81)
- `infrastructure/cafe24/test-ssh-connection.sh` — SSH dry-run script (배포 X)
- `infrastructure/render/render.yaml` + `deploy-checklist.md` — Render Blueprint (estimate-app 활성, order-app autoDeploy false)
- `qa/playwright/tests/` — 60+ cell 시나리오 (5 project × 15 spec × happy/edge)

### 산출물 (2차 — PR #82)
- QA edge — `api-5xx-fallback` / `stock-reserve-deduct-race` / `dc-snapshot-strict`
- Designer — visual regression `dark-mode-toggle.visual.spec.ts`
- FE — schema/selector 정밀화
- DevOps — CSP script-src 보안, alert rotation, Slack 비동기
- Detox 6 시나리오 (mobile-staff 3 + mobile v4 3, iOS/Android)

### 산출물 (3차 — PR #83)
- BE — `services/product-service` `GET /api/products/by-code/{code}` (사용자 노출 식별자 modelCode → productId)
- QA — tautology / race delta / immutable 정정 (3 spec)
- FE — selector 정밀 + testMatch 직교 (2 항목)
- DevOps — render.yaml mirror 헤더 6 + order-app vitest 도입
- Designer — dark-mode body[data-theme] assertion 보강

### 산출물 (4차 — PR #84)
- design-system tokens.css 의 light/dark 정식 토큰 10종 + body 바인딩 + toggleTheme + visual baseline 6 spec
- WCAG AA 대비비 4.5:1 충족 (dark text-tertiary #888 → #9a9a9a)
- FOUC 방지 — `html[data-theme="dark"], body[data-theme="dark"]` selector

### 산출물 (5차 docs — PR #85)
- README.md 신규 + ROADMAP.md 신규
- 각 client / service README 갱신
- DECISIONS.md Phase 7 항목 (D-P7-01 ~ D-P7-05)

### 산출물 (4차 잔여 — PR #86)
- 통일 alias 토큰 (폰트 family/size/weight/line-height + spacing + radius + shadow)
- Pretendard web font (jsdelivr 1차)
- mobile / mobile-staff RN graceful 폰트 hook

### 산출물 (5/6차 — 본 PR)
- DevOps self-host font (jsdelivr SPOF 회피) — `scripts/download-pretendard-fonts.sh` + `public/fonts/` + `design-system/src/styles/fonts.css`
- DevOps helmet + CSP 정식 도입 (estimate-app v2)
- DevOps desktop CSP 갱신 (font-src / connect-src / img-src 보강)
- QA visual baseline `document.fonts.ready` 가드 5 spec 일관 적용
- Phase 7 회고 보고서 + Phase 8 진입 plan + DECISIONS Phase 7 마무리 + Phase 8 진입 항목

### 머지 PR
- #81 Phase 7 1차 (env 이름 정정 + OOM 가드 + autoDeploy 비활성 + action SHA pin)
- #82 Phase 7 2차 (CSP / getStock schema / Slack 비동기 / visual selector)
- #83 Phase 7 3차 (product by-code + QA tautology fix + FE selector + DevOps render+vitest + Designer dark-mode)
- #84 Phase 7 4차 (DS 토큰 + body 바인딩 + toggleTheme + visual baseline)
- #85 Phase 7 5차 docs (README + ROADMAP 신규 + DECISIONS Phase 7)
- #86 Phase 7 4차 잔여 (통일 토큰 + Pretendard + RN graceful 폰트 hook)
- 본 PR Phase 7 5/6차 (self-host font + helmet+CSP + desktop CSP + QA fonts.ready + 회고 + Phase 8 plan)

### 완료 조건
- Phase 7 4~6차 산출물 모두 머지, 60+ cell e2e 시나리오 staging stack 검증, UI 통합 (다크모드 + Pretendard 통일) 정착, Phase 8 진입 plan 정립.
- Render production cutover 자체는 D9 답변 후 Phase 8 위임.

---

## Phase 8 — AWS 호환성 가드 (테스트 단계 유지) (완료)

목표 = AWS (EC2 + RDS) 마이그레이션 가능성을 열어두는 호환성 가드 + 운영 가드 (현재 인프라 = 카페24 + Cloudflare + Render 그대로 유지). 직접 cutover 는 Phase 10 (모든 개발 완료 후).

상세 plan:
- `docs/migration/phase8/M-PHASE-8-readiness.md` (당초 8 작업 plan, 일부 항목 Phase 10 위임)
- `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` (12-factor / 환경변수 / standard SQL / AWS 서비스 매핑)
- `docs/migration/phase8/M-ENV-STANDARDIZATION.md` (환경변수 표준화)

### 산출물 (1차 — PR #88)
- AWS 호환성 가드 plan (12-factor 12/12 OK, RDS 호환 22 file 검증, AWS 서비스 매핑 표 17건)
- 환경변수 표준화 plan (12 service 환경변수 grep + secrets/config 분리 + AWS Secrets Manager 마이그레이션 plan)
- ROADMAP 재정의 (Phase 8 = 호환성 가드, Phase 10 = AWS cutover)
- DECISIONS D-P8-03 ~ D-P8-06 추가
- dev-report `phase8-step-1-aws-readiness.md`

### 산출물 (2차 — 본 PR)
- ServiceDiscoveryClient interface + Eureka wrapper + AWS Cloud Map placeholder (`shared:discovery-abstraction` 신규 모듈, 단위 테스트 13 case PASS)
- 환경변수 표준 적용 (`SAMHAN_INTERNAL_TOKEN` / `SAMHAN_JWT_SECRET` / `SAMHAN_<SERVICE>_SERVICE_URL`) — chained-default fallback 패턴 (legacy 호환 100%)
- 12 service `infrastructure/env-templates/<service>.env` 보유 (10 신규 + 2 갱신)
- AWS Secrets Manager rotation lambda spec (`docs/migration/phase8/M-SECRETS-ROTATION-spec.md`) — Phase 10 cutover 시점 활성
- DECISIONS D-P8-07 ~ D-P8-09 추가
- dev-report `phase8-step-2-discovery-secrets.md`

### 산출물 (3차 — 본 PR)
- AWS 마이그레이션 dry-run plan (`docs/migration/phase10/M-AWS-MIGRATION-DRY-RUN.md`, 14 section)
- Phase 8 회고 보고서 (`docs/dev-reports/phase8-retrospective.md`)
- Phase 9 진입 plan (`docs/migration/phase9/M-PHASE-9-readiness.md`, 4 service skeleton + 5주 roadmap)
- ROADMAP / DECISIONS Phase 8 마무리 + Phase 9 진입 항목
- DECISIONS D-P8-10 / D-P8-11 + D-P9-01 / D-P9-02 추가
- dev-report `phase8-step-3-completion-phase-9-readiness.md` + `phase8-retrospective.md`

### Phase 8 위임 (Phase 10) — Resilience4j prod / API Gateway production / monitoring alert 등은 Phase 10 dry-run 산출물 (section 5/6/11) 에 흡수 위임

### 진입 조건
- Phase 7 완료 (PR #87 머지) → 충족
- D9 답변 = X3 AWS 옵션 확정 (D-P8-03) → 충족 (Phase 10 cutover 시점)
- D6/D7/D8 = AWS 채택으로 카페24 SSH 활성 X (현재 테스트 단계만 유지)

### 보류 항목 (Phase 10 위임)
- 14 MSA production cutover (DNS + traffic 전환)
- RDS / EC2 / S3 / Route 53 리소스 생성
- Secrets Manager / Parameter Store 도입
- AWS WAF / Managed Prometheus / Managed Grafana

---

## Phase 9 — 잔여 도메인 (완료 + post-W5 cleanup, 5차 W5 회고 + Phase 10 plan + 잔존 backlog 1건 흡수 + post-W5 backlog cleanup 7건)

### 예정 산출물
- `services/partner-service` (8095, 거래처 마스터 + 신용한도 + 거래내역) — 8088 (partner-order-service) 충돌 회피 — **완료 (PR #91)**
- `services/groupware-service` (8092, 결재선 + 메신저 + 일정 + UserClient) — **완료 (PR #92)**
- `services/notification-service` (8093, 푸시/이메일/SMS 통합 라우터 + UserClient bulk verify) — **완료 (PR #93)**
- `services/dashboard-service` (8094, KPI / 실시간 재고 / 매출 + 4 client + materialized view) — **완료 (본 PR)**

**기존 14 service 포트 매핑 (Cross-check)**:
- 8080 api-gateway / 8081 auth / 8082 logging / 8083 user / 8084 product / 8085 inventory
- 8086 slip / 8087 accounting / 8088 partner-order / 8089 dc-config / 8091 partner-auth / 8761 eureka
- 신규 추가: 8092 groupware / 8093 notification / 8094 dashboard / **8095 partner**

### 산출물 (1차 — PR #91)
- `services/partner-service` (8095) skeleton — 2 entity (Partner / PartnerCreditHistory) + 2 enum (PartnerStatus / CreditEventType) + 2 repository + 2 service + 2 controller (Internal lookup / Admin CRUD) + 4 dto + 4 config + 1 exception handler
- Flyway V1 (`partners` + `partner_credit_history`, BaseEntity 7 audit + Soft Delete + partial unique index)
- IT 2 (`PartnerInternalControllerIT` + `PartnerAdminControllerIT`) + 단위 테스트 1 (`PartnerServiceTest` 8 case)
- M5 의존성 해소 endpoint = `GET /internal/partners/{partnerCode}` (X-Internal-Token, slip-service 측 client 구현은 W5 또는 Phase 10 위임)
- ServiceDiscoveryClient 도입 (`shared:discovery-abstraction` 의존성 + `samhan.discovery.provider=eureka` default)
- 환경변수 표준 (`SAMHAN_PARTNER_DB_*` chained-default + `SAMHAN_INTERNAL_TOKEN` + `SAMHAN_PARTNER_SERVICE_URL` + `SAMHAN_DISCOVERY_PROVIDER`)
- `infrastructure/env-templates/partner-service.env` 신규
- `services/partner-service/README.md` + `docs/dev-reports/phase9-step-1-partner-service.md` 신규
- DECISIONS D-P9-03 / D-P9-04 / D-P9-05 추가
- ROADMAP / DECISIONS / M-PHASE-9-readiness 갱신

### 산출물 (2차 — 본 PR)
- `services/groupware-service` (8092) skeleton — 5 entity (ApprovalLine / ApprovalStep / Message / Schedule / ScheduleParticipant) + 3 enum (ApprovalStatus / MessageStatus / ScheduleStatus) + ApprovalStepStatus enum + 3 repository + 3 service + 2 controller (Internal lookup / Admin) + 9 dto + 5 config + 1 client (UserClient) + 1 exception handler
- Flyway V1 (`approval_lines` + `approval_steps` + `messages` + `schedules` + `schedule_participants`, BaseEntity 7 audit + Soft Delete + partial unique index 2종)
- IT 2 (`GroupwareInternalControllerIT` 4 case + `GroupwareAdminControllerIT` 6 case, UserClient @MockBean) + 단위 테스트 3 (`ApprovalLineServiceTest` 8 case + `MessageServiceTest` 4 case + `ScheduleServiceTest` 4 case = 16 case)
- ServiceDiscoveryClient **두 번째 소비자** (W1 partner-service 첫 소비자) — `shared:discovery-abstraction` 의존성 + `samhan.discovery.provider=eureka` default
- UserClient — user-service `/internal/users/{userId}` lookup, fail-open 정책 (Phase 10 시점 fail-fast 강화)
- 환경변수 표준 (`SAMHAN_GROUPWARE_DB_*` chained-default + `SAMHAN_USER_SERVICE_URL` + `SAMHAN_INTERNAL_TOKEN` + `SAMHAN_GROUPWARE_SERVICE_URL` + `SAMHAN_DISCOVERY_PROVIDER`)
- `infrastructure/env-templates/groupware-service.env` 신규
- `services/groupware-service/README.md` + `docs/dev-reports/phase9-step-2-groupware-service.md` 신규
- DECISIONS D-P9-06 / D-P9-07 / D-P9-08 추가
- ROADMAP / DECISIONS / M-PHASE-9-readiness 갱신

### 산출물 (3차 — 본 PR)
- `services/notification-service` (8093) skeleton — 2 entity (NotificationRequest / NotificationLog) + 3 enum (NotificationChannel / NotificationStatus / RecipientType) + 3 channel adapter (PushAdapter+FcmPushAdapter+MockPushAdapter / EmailAdapter+SesEmailAdapter+MockEmailAdapter / SmsAdapter+AligoSmsAdapter+MockSmsAdapter) + 2 repository + 1 service + 2 controller (Internal send/status / Admin send-list-single-retry) + 3 dto + 9 config (InternalAuthProperties / InternalTokenFilter / InternalTokenGuard / SecurityConfig / WebClientConfig / AligoProperties / FcmProperties / NotificationGatewayConfig / UserCacheProperties + HeaderAuthenticationFilter) + 1 client (UserClient + bulk verify + Caffeine TTL 60s) + 1 exception handler
- Flyway V1 (`notification_requests` + `notification_logs`, BaseEntity 7 audit + Soft Delete + JSONB payload + partial unique index `request_id+attempt_no`)
- IT 2 (`NotificationInternalControllerIT` 4 case + `NotificationAdminControllerIT` 5 case, UserClient @MockBean) + 단위 테스트 3 (`NotificationGatewayTest` 3 + `NotificationServiceTest` 6 + `UserClientBulkVerifyTest` 3 = 12 case)
- ServiceDiscoveryClient **세 번째 소비자** (W1 partner / W2 groupware → W3 notification) — `shared:discovery-abstraction` 의존성 + `samhan.discovery.provider=eureka` default
- UserClient bulk verify (BE backlog #4 채택) — user-service 신규 endpoint `POST /internal/users/verify-bulk` + Caffeine cache TTL 60s + groupware ApprovalLineService bulk 1회 호출 전환 (영향 file 5)
- Aligo 흡수 — Phase 5 `slip-service.delivery.sms.AligoSmsGateway` 의 form-urlencoded 호출 모델 흡수 (key/user_id/sender/receiver/msg/testmode_yn)
- 환경변수 표준 (`SAMHAN_NOTIFICATION_DB_*` chained-default + `SAMHAN_INTERNAL_TOKEN` + `SAMHAN_USER_SERVICE_URL` + `SAMHAN_DISCOVERY_PROVIDER` + `SAMHAN_ALIGO_*` + `SAMHAN_FCM_*` + `SAMHAN_USER_CACHE_*`)
- `infrastructure/env-templates/notification-service.env` 신규
- `infrastructure/postgres/init/01-create-databases.sql` `notification_db` 추가
- `infrastructure/prometheus/prometheus.yml` `notification-service:8093` + `groupware-service:8092` scrape target 추가 (DevOps Follow-up #11/#12 흡수)
- `services/notification-service/README.md` + `docs/dev-reports/phase9-step-3-notification-service.md` 신규
- DECISIONS D-P9-09 / D-P9-10 / D-P9-11 추가
- ROADMAP / DECISIONS / M-PHASE-9-readiness 갱신

### 산출물 (4차 — 본 PR)
- `services/dashboard-service` (8094) skeleton — 3 entity (KpiSnapshot / RealTimeStock / SalesAggregate) + 2 enum (KpiCategory / AggregateInterval) + 4 client (InventoryClient / AccountingClient / PartnerOrderClient / PartnerClient) + 3 repository + 4 service (KpiService / RealTimeStockService / SalesAggregateService / MaterializedViewRefreshService) + 2 controller (Internal KPI / Admin KPI+Stock+Sales+Refresh) + 3 dto + 7 config (InternalAuthProperties / InternalTokenFilter / InternalTokenGuard / SecurityConfig / WebClientConfig / DashboardCacheProperties / CacheConfig / DashboardRefreshProperties / MaterializedViewRefreshConfig + HeaderAuthenticationFilter) + 1 exception handler
- Flyway V1 (`kpi_snapshots` + `realtime_stocks` + `sales_aggregates` + `mv_realtime_stock_summary` + `mv_sales_daily_summary`, BaseEntity 7 audit + Soft Delete + partial unique index 3종 + materialized view CONCURRENTLY refresh 의무 unique index 2종)
- IT 2 (`DashboardInternalControllerIT` 4 case + `DashboardAdminControllerIT` 5 case, 4 client @MockBean) + 단위 테스트 4 (`KpiServiceTest` 6 + `RealTimeStockServiceTest` 4 + `SalesAggregateServiceTest` 5 + `MaterializedViewRefreshTest` 2 = 17 case)
- ServiceDiscoveryClient **네 번째 소비자** (W1 partner / W2 groupware / W3 notification → W4 dashboard) — `shared:discovery-abstraction` 의존성 + `samhan.discovery.provider=eureka` default
- `shared/user-client-abstraction/` **신규 모듈** (W3 BE backlog #1 채택) — `UserVerifier` interface + `DefaultUserVerifier` impl + `UserVerifierProperties` + 6 case 단위 테스트. notification-service / groupware-service `UserClient` 가 본 abstraction 의 thin delegate 로 전환 (회귀 0)
- Caffeine cache (KPI 응답 60s TTL, max 5000 entries) — D-P9-12 (DevOps W3 backlog #4 채택, `samhan.cache.provider=caffeine\|redis` 토글)
- Materialized view CONCURRENTLY refresh — 5분 간격 scheduled (`MaterializedViewRefreshConfig`) + admin 수동 트리거 endpoint (D-P9-13)
- 환경변수 표준 (`SAMHAN_DASHBOARD_DB_*` chained-default + `SAMHAN_INTERNAL_TOKEN` + 4 외부 service URL + `SAMHAN_DISCOVERY_PROVIDER` + `SAMHAN_CACHE_PROVIDER` + `SAMHAN_DASHBOARD_KPI_CACHE_*` + `SAMHAN_DASHBOARD_REFRESH_INTERVAL`)
- `infrastructure/env-templates/dashboard-service.env` 신규
- `infrastructure/prometheus/prometheus.yml` `dashboard-service:8094` scrape target 추가
- `services/dashboard-service/README.md` + `docs/dev-reports/phase9-step-4-dashboard-service.md` 신규
- W3 backlog 5건 흡수 (BE-1 user-client-abstraction / Designer-1 channel badge tokens / Designer-2 W4+ baseline + PR template 신규 / DevOps-3 Caffeine vs Redis / FE-3 notification-slice-B → link-dispatch-slice rename 16 file)
- `clients/web/design-system/src/tokens/tokens.css` `b-channel-push/email/sms` 3종 토큰 신설 (Google Material — Blue/Red/Green)
- `docs/templates/PR-template-color-reference.md` 신규 — W4+ baseline = W3 Google Material method 컬러 1:1 표준 명시
- 3 client README (`clients/desktop/README.md` / `clients/web/design-system/README.md` / `clients/mobile/README.md`) — slice 명 정정 + 채널 토큰 안내
- DECISIONS D-P9-12 / D-P9-13 / D-P9-14 / D-P9-15 추가

### 산출물 (5차 — PR #95 W5)
- **Phase 9 회고 보고서** (`docs/dev-reports/phase9-retrospective.md`) 신규 — 10 섹션 (요약 / 통계 / 19 결정 / 25 backlog 채택 / 7 success + 6 학습 / 진입 준비 / Phase 10 요약 / 잔존 backlog / 참조 / 마무리)
- **Phase 10 진입 plan** (`docs/migration/phase10/M-PHASE-10-readiness.md`) 신규 — 6 섹션 (P10-1 Secrets+Cache / P10-2 Discovery+Resilience / P10-3 RDS+Cutover 슬라이스 분해)
- **잔존 backlog 1건 흡수 (D-P9-16, BE 의견 3 채택)** — partner-service `POST /internal/partners/find-by-codes` bulk endpoint + dashboard-service `PartnerCodeResolver.resolveAll(List<String>)` bulk 전환 (cache hit/miss 분리 + miss 만 1회 RPC)
- partner-service IT 4건 신규 (정상 / 빈 / 일부 미존재 / 토큰 누락) + dashboard-service 단위 4건 신규 (PartnerCodeResolverTest)
- W5 dev-report (`docs/dev-reports/phase9-step-5-retrospective.md`) 신규
- DECISIONS D-P9-16 / D-P9-17 / D-P9-18 / D-P9-19 / D-P9-20 추가

### 산출물 (post-W5 backlog cleanup — 본 PR, D-P9-21)
- **Phase 10 위임 backlog 중 즉시 처리 가능 7건 본 PR 채택** (사용자 가드 `feedback_integrated_pr_pattern.md` § fix 후속 PR/Phase 위임 금지 일관 적용)
- Fix 1 (D-W4-3 보강) — `docs/templates/PR-template-color-reference.md` § 5.2 mobile responsive table wrapper 추가 (W6+ 전 PR QA HTML 일관 적용 의무)
- Fix 2 (D-W5-2 채택) — `clients/web/design-system/src/tokens/tokens.css` slice accent 3색 토큰 신설 (`--color-slice-{success,pending,deferred}` Google Material Green/Yellow/Gray)
- Fix 3 (Q-W3-1) — `notification-service` retry max-attempts property + IT (samhan.notification.retry.max-attempts default 5, DEAD_LETTER 영구 FAILED)
- Fix 4 (Q-W3-2) — `NotificationSendRequest.payload` `@Size(max=4000)` + IT (Postgres TOAST 임계 회피)
- Fix 5 (Q-W3-3) — `UserVerifierProperties` FailMode enum (OPEN/STRICT) alias + IT 2건 (failFast 양방향 자동 동기화)
- Fix 6 (DevOps) — `NotificationGatewayMetrics` 신규 (3 channel × 2 result = 6 Micrometer counter) + service 통합
- Fix 7 (DevOps user-service) — `Employee.DEFAULT_HIRE_DATE` 의도 주석 (W4 slip-service 시간 의존 회귀 학습 적용)
- IT 추가 5건 — `requeueForRetry_exceedsMaxAttempts_marksFailedPermanent` / `send_payloadOver4000Bytes_returns400` / `verify_strictMode_failFast_returnsFalseOnGatewayError` / `verify_openMode_failSoft_returnsTrueOnGatewayError` / `NotificationGatewayMetricsTest` 2 case
- 회귀 검증 — `:shared:user-client-abstraction:test` + `:services:notification-service:test` + `:services:user-service:test` + `:services:groupware-service:test` + `:services:dashboard-service:test` 모두 PASS
- env-template 갱신 — `notification-service.env` (SAMHAN_NOTIFICATION_RETRY_MAX_ATTEMPTS / SAMHAN_USER_CLIENT_FAIL_MODE) + `groupware-service.env` (SAMHAN_USER_CLIENT_FAIL_MODE)
- DECISIONS D-P9-11 보강 (fail-mode 토글) + D-P9-21 신규 (post-W5 backlog cleanup, 7건 채택)

### 진입 조건
- Phase 8 호환성 가드 + 운영 가드 정착 (PR #88 / #89 / #90 머지 시 충족)

### 가드
- Phase 8 환경변수 표준 적용 (`SAMHAN_<SERVICE>_<KEY>` prefix, `<NAME>_SERVICE_URL` 패턴, `.env.example` 의무)
- 12-factor 준수 + standard SQL + AWS 호환성 가드 일관 적용
- 신규 service 모두 `shared:discovery-abstraction` 의존성 도입 (Phase 10 cutover 시점 활성 대비)

### plan 위치
- `docs/migration/phase9/M-PHASE-9-readiness.md` (4 service skeleton + 5주 roadmap)

---

## Phase 10 — arologis-service (배차 마이크로서비스) + 모바일 어플 driver tab — Phase 번호 renumber 적용 (D-P10-05, 사용자 결정 2026-05-07)

> **renumber 의도** — 기존 Phase 10 (AWS migration cutover) → Phase 11 으로 이동. 신규 Phase 10 = arologis-service (5 슬라이스 W10-1 ~ W10-5).

### 예정 산출물
- `services/arologis-service` (8097, DB `arologis_db`) — 배차 마이크로서비스
- KakaoDispatchParser (정규표현식 + heuristic, 사용자 카톡 예시 13 차량 80% 정확도 → W10-5 시점 90% 회귀)
- DriverMatcher 추상화 + Mock + InsungQuick (W10-2 시점 인성데이타 5만 프리랜서 풀 통합)
- 5 entity (Dispatch / Vehicle / VehicleStop / Driver / Signature) + DriverLocation GPS 추적 (NUMERIC(10,7))
- 4 외부 client (partner / user / slip / notification, skeleton-mode → W10-2 / W10-4 시점 활성)
- Driver-app endpoint (W10-3 RN Expo 어플 통합 시점 활성)
- **clients/mobile-staff 내부 driver tab (W10-3, 본 PR) — D-P10-07 / D-P10-08 / D-P10-09**
- ShedLock daily 30일 GPS cleanup scheduler

### 슬라이스 분해
- **W10-1** (PR #97 머지 `a98048e`) — arologis-service skeleton + parser + matcher + 4 client + 31 case + Phase 10/11 renumber
- **W10-3** (PR #98 머지 `4b2c077`) — mobile-staff 내부 driver tab (Dashboard / Tracking / Signature) + arologis API client + Pretendard self-host + 토큰 1:1 복제
- **W10-4** (본 PR #99) — slip-service 전자서명 LINK+APP source 통합 + V10 Flyway + InternalTokenFilter slip-service 신규 + arologis SlipClient 실 호출 분기 + SlipResolver + 양쪽 저장 패턴 + ApiResponse wrapper IT 의무화 (W10-3 F-3 채택, D-P10-12) + signature_source 컬럼 분리 (D-P10-11)
- **W10-2** (대기) — 인성데이타 vendor 통합 (InsungQuickDriverMatcher 실 구현 + callback 활성), 인성데이타 협약 정보 사용자 trigger 대기
- **W10-3** (PR #98 머지 `4b2c077`) — 모바일 어플 driver tab (`clients/mobile-staff` 내부) + arologis API client + GPS hook + 3 화면 + Pretendard self-host + 토큰 1:1 복제
- **W10-4** (본 PR #99) — slip-service 전자서명 통합 (SlipClient.registerSignature 실 호출, signature_source 컬럼 분리 LINK/APP, V10 Flyway, ApiResponse wrapper IT 의무화)
- **W10-5** — 회고 + 정확도 90% 회귀 + Phase 11 진입 가드 점검 + **Pretendard 9 weight 정식 운영 배치** (W10-3 종합 TM Designer-2 / FE-2 / B-DEVOPS-1 통합 + D-P10-10)
- **W10-step-8** (본 PR #114) — **매뉴얼 안내 미구현 UI 9 슬라이스 통합** (P0×4 + P1×2 + P2×3) — 비밀번호 재설정 + 세금계산서 + 인쇄 5건 + 관리자 UI + arologis 수동 배차 + 모바일 사진 + 견적서 + 매출 마감 + 재고 실사. accounting V3/V4 + inventory V3 신규 Flyway. 161 QA case (TM 정합 후 +1). TM 종합 fix — accounting V4 seed (150/919) + JournalService service-layer 마감 가드 + InventoryAuditRepository PostgreSQL `IS NULL` 타입 추론 우회 + testid 명명 정합 (실 FE 표준)
- **W10-step-9** (본 PR) — **시트 흐름 보강 + 노션 4 CSV 이식 + partner_code 매핑 정정** — Phase A (BE 5 슬라이스: 시트 동기화 / REGION / DC / CHAT / BLOCK) + Phase B (Desktop FE 5 admin UI) + Phase C TM (거래처코드 우선 매핑). arologis V3 + dc-config V2 + notification V2 + partner V4 신규 Flyway. 단위 57 case (REGION 11 / DC 8 / CHAT 13+4 / BLOCK 17+4) + Designer Storybook 3 + FE typecheck 5. 사용자 명시 정정: 단톡방/발송금지 import 가 거래처명이 아니라 **거래처코드** 컬럼 우선 매핑하도록 `PartnerLookupClient.verifyPartnerCode` + `PartnerService.findByCodeForLookup` 신규. **TM 종합 fix (5-team 리뷰 + CI fail 반영)**: NoopPartnerLookupClient `@Configuration`+`@Bean` → `@Component` (BeanDefinitionOverride 회귀 해소), RegionClassifier 광역 prefix 가중치 + 회귀 케이스 2 추가 (case 6/7 = 7 PASS), FE testid `admin-blocked-unblock-${partnerCode}` (UUID 비공개) + `admin-dcconfig-*` prefix 일관 + invalidate 위치 `onUpload` resolve, AdminLayout "DC 설정" entry 신규
- **PR-E 진입 전 선행 — R2 + BE-E 통합** (PR #116 머지 `2f9f747`) — **R2** arologis `vehicle_stops.parsed_partner_code` (Long, 카톡 슬립번호) 를 `parsed_kakao_seq` 로 rename + 신규 `parsed_partner_code` (String, partner-service partner_code) 컬럼 추가 (PR-E1 lookup 후 채움) → arologis V4 신규 Flyway, KakaoDispatchParser/ParsedStop record/VehicleStop entity/SlipResolver/DispatchManualService/ManualDispatchRequest/ManualDispatchPreviewResponse/DispatchDetailResponse/ParsedDispatchResponse 명칭 정합. **BE-E** notification `RestClientPartnerLookupClient` 신규 (NoopPartnerLookupClient placeholder 대체) — partner-service `GET /internal/partners/{partnerCode}` + `GET /internal/partners/by-name?name=` 호출, X-Internal-Token 인증, `samhan.notification.partner-lookup.enabled` toggle (default true), `@Profile("!test")` 격리 + `@ConditionalOnMissingBean` 으로 Noop 자동 비활성. 단위 테스트 PR (KakaoDispatchParser case3/8 정정 + RestClientPartnerLookupClient MockRestServiceServer 5 case = 200 추출 / 404 fail-soft / 409 다중 매칭 fail-soft / 사업자명 query encode / token 미설정 회피).
- **W10-step-10** (본 PR) — **GAS B 11건 이식 — 이카운트 엑셀 → 출고전표 자동 조회 (7건 PR-E1, 4건 PR-E2 위임)** — Phase A (BE 4 + Designer 1 = 5 commits): inventory DPS 비교 (BE-2) / notification 배차안내 SMS preview+send 2-step (BE-4) / arologis 가배차+미배차+지방가배차 3 endpoint (BE-3) / slip-service 5 query 확장 + next-day-image-data + cleanup (BE-1, V15 Flyway slips.partner_code+classified_region_group) / Designer NextDaySlipView 1차 mock. Phase B (Desktop FE 6 = 5 commits, FE-1 두 분할 흡수): DPS 입고 비교 + 가배차/SMS 통합 (사이드바+라우트 흡수, multi-agent race) / 미배차 + 수동배차 query 자동 채움 / 내일자 전표 이미지 + 인쇄 / 전표 정리. 단위 56 case 신규 + desktop typecheck PASS + 풀빌드 GREEN. **DPS 엑셀 업로드 패턴은 사용자 명시 보존** (창고 표준 운영 절차) — 외 모든 GAS B 도구는 출고전표 자동 조회 (이카운트 의존 0). PR #115 산출 활용 (REGION/CHAT/BLOCK/partner_code 매핑). UUID 비공개 / ROLE 풀네임 / partner_code snapshot 의무 가드 일관. 잔여 4건 (원장/거래명세서/계산서/일마감) = accounting-service 도메인 PR-E2 별도 슬라이스.
- **W10-step-11** (본 PR) — **GAS B accounting 4건 이식 — 원장/거래명세서/계산서/일마감 (PR-E2)** — PR #117 (PR-E1 7건) 머지 후 사용자 명시 GAS B 잔여 4건 (원장/거래명세서/계산서/일마감) accounting-service native 이식. Phase A (BE 1 통합 5 task + Designer 2 view = 2 commits): `AccountingReportController` 5 endpoint (BE-A8 매출 집계 + BE-A9 원장 + BE-A10 거래명세서 batch + BE-A11 홈택스 export + BE-A12 일별 마감 detail) + 외부 client 3종 (ProductClient + PartnerLookupClient + ChatRoomMappingClient, Feign + IT @MockBean 격리) + POI 5.2.5 (홈택스 100건 sheet 분할). Phase B (Desktop FE 4 = 3 commits, FE-8/FE-9 working tree 복구 commit 1 흡수): FE-7 거래처 원장 page + 인쇄 / FE-10 일마감 detail 보강 (모델/할인/세트 마스터 join) / FE-8+FE-9 거래명세서 batch + 홈택스 export 복구 통합. 단위 20 case 신규 (Sales 4 + Ledger 4 + Statement 3 + Hometax 5 + DailyClosing 4) + desktop typecheck PASS + 풀빌드 GREEN. 한국 일반기업회계기준 표준 코드 (110/255/401) 기반. 자체 분개 + 세금계산서 자동 조회 (이카운트 의존 0). **본 PR 머지로 GAS B 11건 native 이식 100% 완성** — 후속 PR-F (GAS C/D 6건) 진입 가능.
- **W10-step-12** (본 PR) — **GAS C/D 일부 이식 PR-F1 — 알리고 주소록 sync (mock) + 운송사 실배차 비교** — PR #117 (PR-E1) + #118 (PR-E2) 머지 후 GAS B 11건 100% 완성. PR-F1 = GAS C 9번 (알리고 자동 업로드) + GAS D 11번 (운송사 실배차 비교) 의 backend 이식 + Designer 2 page mock + FE 실 API 연결. Phase A (BE 2 + Designer 1 = 3 commits): BE-1 partner-service `PartnerAligoExportService` (UTF-8 BOM CSV export + BlockedPartner skip + 휴대폰 정규화) + notification-service `AligoAddressBookSyncService` (mock client + chunk 50 분할 + 429 backoff retry, 13 test PASS) / BE-2 arologis-service `VendorExcelParser` (POI 4 vendor 헤더 매처 + partial parse) + `DispatchReconcileService` (left join TRUE/FALSE_LEFT/FALSE_RIGHT + 다중 vendor + 인자 검증, 15 test PASS) / Designer `AligoAddressBookPage` + `ArologisDispatchReconcilePage` mock + AdminLayout entry + router. Phase B (FE 1 + QA 1 = 2 commits): FE 두 page mock → 실 API 연결 (typecheck PASS) / QA scenarios.md 14 case + 작동 캡처 2 PNG + Playwright 자동화 스크립트 (`tools/manual-capture/capture-pr-f1.js`). 풀빌드 + desktop typecheck GREEN. **알리고 mock 안내** — 실 알리고 API spec 입수 전 dryRun 응답, 실 spec 입수 후 RestClient 활성. 후속 PR-F2 = OCR vendor 2건 (10번 에어디자이너 + 14번 제이시스템), OCR 엔진 = Tesseract (사용자 결정).
- **W10-step-13** (본 PR) — **vendor 발주 OCR 이식 PR-F2 — 에어디자이너 + 제이시스템 (Tesseract)** — PR #119 (PR-F1) 머지로 GAS C/D 4건 native 이식 완성 후 마지막 OCR 의존 2건 (D 10번 에어디자이너 발주서 OCR + D 14번 제이시스템 발주서 OCR) 단일 통합 PR 이식. 흡수 위치 = 신규 `services/ocr-service` 분리 보류 + `partner-order-service` 흡수 (발주 도메인 일관성). Phase A (DevOps 1 + Designer 1 + BE 1 = 3 commits): DevOps Tesseract 4.x 설치 가이드 (5 환경 + `kor.traineddata` ~10MB + CI Linux runner step + .gitignore) / Designer 3-step wizard mock (Step 1 vendor 라디오 + drag-drop / Step 2 거래처 카드 + 라인 표 + suggestions / Step 3 확정 review) + AppLayout entry / BE `partner-order-service` `vendor.ocr` 패키지 28 files +2086 (OcrEngine 추상화 = MockOcrEngine + TesseractOcrEngine + `@ConditionalOnProperty` 503 graceful fallback + `kor+eng` 다중 언어 + AirDesignerOrderParser 라인 정규식 + JSystemOrderParser 표 형식 + VendorParserRegistry 자동 detect + VendorOrderService + 3 Client (PartnerLookup + ProductCatalog + Dc) + Controller `POST /api/v1/admin/partner-order/vendor/{upload,confirm}`, 단위 25 case + IT 5 case PASS). Phase B (FE 1 + QA 1 = 2 commits): FE `vendorOrderApi.ts` + 3-step page mock → 실 API 연결 (multipart + inline edit + Step 2→3 transition, typecheck PASS) / QA scenarios.md 15 case (에어디자이너 5 + 제이시스템 5 + OCR 비활성 1 + 권한/UX/정합 4) + 단위 30 case 매핑 + **작동 캡처 3 PNG** (Step 1 upload / Step 2 preview / Step 3 confirm, Playwright headless) + `tools/manual-capture/capture-pr-f2.js`. 풀빌드 + desktop typecheck GREEN. **PR-F1 회귀 가드 일관** — `*Bean` suffix + `ApplicationContextLoadIT` 신규 도입. **본 PR 머지로 GAS C/D 6건 중 4건 OCR 의존 0 + 2건 OCR 의존 native 이식 100% 완성** — 후속 PR-F3 (사용자 미분류 GAS C 잔여 2건). 본 PR 머지 후 PR-G1 (slip-service e-Count schema 보강 + API 제거) 진입.
- **W10-step-14** (PR #876) — **outbox 관측 공백 해소 + 주문목록 발행상태 UX (#863)** — partner-order-service outbox 의 알람 진실원을 이벤트/로그에서 상태 게이지 3종(`outbox_pending_depth` / `outbox_oldest_pending_age_seconds` / `outbox_scheduler_heartbeat_seconds`)으로 전환했다. production Micrometer CloudWatch export는 Spring Boot 3.x가 auto-config를 제공하지 않아 `CloudWatchMetricsConfig` 수동 빈 배선을 신규 추가했다(OPUS 4.8 R1 적대검증 BLOCKING-1 — 이 배선이 없으면 `management.metrics.export.cloudwatch.*` 설정이 완전한 무효값이라 prod custom metric이 0건이었다). FAILED(영구실패)는 게이지 설계상 전이 즉시 집합을 이탈해 구조적으로 놓치므로, 기존 로그 기반 alarm을 삭제 대신 보조로 유지한다(spec D-863-02, R1 BLOCKING-2). 데스크탑 주문목록에 발행실패 건수 배너 + 발행실패/재시도 전용 필터 + 배지 위치·대비 조정을 추가했다. **OPUS 4.8 R1 5-agent 적대검증**이 BLOCKING 2 · HIGH 6 · MED 9(prod 알람 배선 부재·임계값 산술이 실질 lead time 0·NaN 침묵·CloudWatch/Prometheus 통계 불일치·배너 대비/모집단 불일치·테스트 0건 등)를 지목했고 SONNET5가 근본 fix + 신규 단위/IT 테스트로 재수렴했다. 상세는 `docs/dev-reports/2026-07-21-863-outbox-observability.md` 참조.
- **MIG-3** (완료) — **이카운트 회계 전표 4종 마이그레이션** — MIG-1 PoC + MIG-2 5 importer + SAS 시리즈 5 패턴을 미러해 accounting-service에 V23 staging 4종, 4 importer/controller, partner-service name lookup, `staging.ecount_account_map` 역방향 계정 lookup, 회계전표분개 차/대 균형 POSTED/DRAFT 분기를 추가했다. auth-service V16은 MIG3 PageCode 4종과 MASTER/MANAGER edit seed를 포함한다.
- **MIG-4** (완료, PR #272) — **이카운트 영업·세무 raw 4종 마이그레이션** — 세금계산서용 판매전표 / 판매전표 / 매출매입내역 / 주문서 raw를 accounting-service V24 staging 4표로 멱등 적재한다. 세금계산서용 판매전표는 `TaxInvoice` OUTBOUND `MIGRATED`, 판매전표는 `SalesAccountingSlipLine` 보강으로 변환하고, 매출매입내역/주문서는 staging only + 검증 SQL로 처리한다. auth-service V17은 MIG4 PageCode 4종과 MASTER/MANAGER edit seed를 포함한다.
- **MIG-5** (완료, PR #273) — **이카운트 창고이동·지출결의서·입금보고서 raw 3종 마이그레이션** — inventory-service V13 창고이동 staging + `StockTransfer` 도메인 변환, accounting-service V25 지출결의서/입금보고서 staging only + Partner aging cross-check, auth-service V18 PageCode 3종, shared/common MIG5 ErrorCode 10종을 추가했다.
- **MIG-6** (완료, PR #274) — **이카운트 잔여 마스터 5종 마이그레이션** — accounting-service V26 통장계좌/고정자산유형 staging + 신규 domain, user-service V8 사원/인사카드/급여관리사원 staging + Employee `ecount_code` 보강 + EmployeeCard/PayrollEmployee 신규 domain, auth-service V19 PageCode 5종, shared/common MIG6 ErrorCode 8종과 `회사명 :` meta row 인식을 추가했다. 인사카드 주민등록번호는 staging 적재 시점부터 `resident_number_masked`만 저장한다.
- **MIG-11** (진행 중, 본 PR) — **매출장/매입장 XLSX staging + DailyClosing 대조** — shared/common `EcountXlsxSupport` Apache POI parser, accounting-service V31 staging 2표, auth-service V24 PageCode 2종, `MIG11_*` ErrorCode 5종, 매출장/매입장 importer/controller 2종을 추가했다. 실제 raw는 row 0 meta + row 1 header이며 매입장은 합계 컬럼이 없어 공급가액+부가세로 total을 산출한다.
- **MIG-15** (완료) — **POI shared/common → shared/ecount-io module 분리** — `shared:ecount-io` 신규 module을 추가하고 `EcountXlsxSupport` + `ExcelExporter` POI 구현을 이동했다. `shared/common`은 POI 비의존 DTO/exception 중심으로 되돌리고, accounting/partner는 direct POI 선언을 제거했다. arologis/slip/inventory는 자체 POI 사용(`VendorExcelParser` / `SlipExcelExportIT` / `DpsExcelParser`) 때문에 direct dependency를 유지한다.
- **MIG-17** (완료) — **Designer tokens.md + Mock 라벨 실 enum 동기화** — MIG-14 admin UI `tokens.md`의 CashKind / CashReceiptKind / OrderProgressStatus 라벨과 chip token을 정리하고, 7개 mock wireframe을 같은 라벨 계약으로 맞췄다.
- **MIG-18** (완료) — **Admin UI 2단계** — Cash / Order / Ledger 목록에 `FilterChipBar`를 적용하고, page size 50/100/200/500 및 "회계 관리자" collapse/expand 메뉴 그룹을 연결했다. (당시 AgingSnapshot 목록도 포함됐으나 슬1 PR #518에서 제거 — 네이티브 partner-aging 보고서로 대체.)
- **MIG-19** (진행 중, 본 PR) — **이카운트 cutover 운영 가이드** — 운영자가 raw 11종 다운로드, `pg_dump accounting_db`, `X-Internal-Token`, MIG-1~11 endpoint 실행, admin UI 확인, soft-delete 복구, staging `PENDING` 재실행, DailyClosing 대조를 한 문서에서 따라갈 수 있도록 `docs/migration/ECOUNT-CUTOVER-GUIDE.md`를 추가한다.
- **MIG-20** (완료) — **이카운트 raw 자동 재import 스케줄** — 외부 스케줄러가 `POST /admin/ecount/reimport/{slice}`를 호출하고, `source_file_hash` 기준으로 새 raw 파일만 기존 importer/transform 경로에 재투입한다.
- **MIG-21** (완료, 본 PR) — **마이그레이션 운영 대시보드** — accounting-service Micrometer 지표, dashboard-service `/api/v1/dashboard/ecount-mig`, desktop 6카드 화면, auth-service V27 PageCode, Grafana JSON을 추가한다.
- **MIG-7** (완료, PR #275) — **Cash 도메인 신규 + MIG-5 staging 변환** — accounting-service V27 `cash_disbursements` / `cash_receipts` 도메인, 지출결의서/입금보고서 staging transform endpoint 2종, auth-service V20 PageCode 2종, shared/common MIG7 ErrorCode 6종을 추가했다.
- **MIG-8** (본 PR) — **Order 도메인 신규 + MIG-4 주문서 staging 변환** — accounting-service V28 `orders` / `order_lines` 도메인, 주문서 staging transform endpoint 1종, auth-service V21 PageCode 1종, shared/common MIG8 ErrorCode 7종을 추가한다. 동일 `order_no` 다중 row는 1 Order + N OrderLine으로 grouping하고, 완료 주문은 SalesAccountingSlip cross-link를 시도한다. aging snapshot 갱신과 Journal 자동 생성은 MIG-9+로 이연한다.

### Pretendard 9 weight 정식 운영 배치 (W10-3 종합 TM 채택 — D-P10-10)

W10-3 시점 = 4 weight (`Regular / Medium / SemiBold / Bold`) 의무 + graceful guard 보호 (`useState(true)` 기본값).

**EAS Build 진입 시점 (W10-5 또는 운영 진입) 의무**:
- `clients/mobile-staff/assets/fonts/Pretendard-{Thin,ExtraLight,Light,Regular,Medium,SemiBold,Bold,ExtraBold,Black}.otf` 9 weight 정식 배치
- `app.json` `plugins.expo-font` 의 9 weight asset 등록
- `usePretendardFontGuarded` 정정 — `useState(false)` + `useFonts` complete 후 `setReady(true)` + splash screen guard 도입

근거 = `migration/decisions/DECISIONS.md` D-P10-10. 본 PR (W10-3) 시점 = 4 weight 자산 누락 시 graceful guard 가 RN UI 미차단. EAS Build 시점 = `useState(false)` 정정과 9 weight 자산 정식 배치 동시 처리.

### 진입 조건 (W10-3 정정)
- W10-3 = W10-1 완료 후 진입 가능 (W10-2 의존 X) — 본 어플 GPS only 활성, 인성 LBS 통합은 W10-2 시점

### 진입 plan 위치
- `docs/migration/phase10/M-PHASE-10-readiness.md` (W10-3 = 완료 (본 PR) 표기)

---

## Phase 11 — AWS 마이그레이션 + Migration Service + 운영 안정화 (renumber, 기존 Phase 10)

### 예정 산출물
- AWS 인프라 cutover — RDS PostgreSQL 16 + EC2/ECS Fargate + ElastiCache + AWS MQ + S3 + Route 53 + ACM
- Secrets Manager rotation lambda + Parameter Store
- `services/migration-service` (8096, ECount 일괄 데이터 이관) — partner-service (8095) / arologis-service (8097) 충돌 회피
- 장기미수 마이그레이션 일괄 처리
- 운영 안정화 (장애 복구 / 백업 / DR)
- 환경변수 통일 정정 (`INTERNAL_TOKEN` → `INTERNAL_AUTH_TOKEN`, `<NAME>_HOST` → `<NAME>_SERVICE_URL`)
- arologis_db RDS 추가 (Phase 10 신규 service 영향)

### 진입 조건
- Phase 10 (arologis) 완료 — 5 슬라이스 머지 + 회고
- AWS account 발급 + IAM baseline 정의

### dry-run plan 위치
- `docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md` (14 section + 5주 timeline, 본 PR phase10→phase11 이동)

### 진입 plan 위치
- `docs/migration/phase11/M-PHASE-11-readiness.md` (본 PR 이동 — 기존 phase10 readiness 의 P10-1/P10-2/P10-3 슬라이스 분해 → 향후 P11-1/P11-2/P11-3 으로 정정 예정)

---

## Phase 12 — 실시간 협업 시리즈 (사용자 결정 옵션 A, 2026-05-09)

> **시리즈 의도** — Samhan Public 핵심 가치 = "두 사람이 같은 전표 보고 한 명 코멘트 → 다른 사람에게 실시간 반영". 4 슬라이스 (PR-H1 ~ PR-H4) 단계 진입. **PR-H1 (PR #123) + PR-H2 (PR #124) + PR-H3 (PR #125) + PR-H4a (PR #126) + PR-H4b (PR #127) 머지 완료 + 본 PR-H4c 진행 (시리즈 4 분할 3/3 마지막 = FE 50+ page audit overlay + SSE 일괄 적용). PR-H4 시리즈 분할 = H4a (shared module) → H4b (BE 13 service 일괄) → H4c (FE 50+ page 통합 — Phase 12 시리즈 종결 마일스톤).**

### 시리즈 분해 (총 ~13주)

- **PR-H1 (1주, PR #123 머지 완료)** — SSE infra + slip 코멘트 smoke. Spring `SseEmitter` 표준 + `SlipRealtimeBroker` (in-memory `Map<UUID, CopyOnWriteArrayList<SseEmitter>>`, 30s heartbeat) + `slip_comments` Flyway V17 + 단위 9 + IT 5 + multi-context Playwright 작동 캡처 4 PNG. desktop `SlipRealtimeClient` (fetch+ReadableStream polyfill) + mobile-staff `react-native-sse` (RN EventSource polyfill) + Designer `userIdToColor` HSL hash util (PR-H2 audit overlay 의존 시드). DevOps gateway `httpclient.response-timeout: 600s` + nginx `proxy_buffering off` 운영 hint. **외부 SaaS (Pusher/Firebase/Ably) 의존 0** (D-P12-01).
- **PR-H2 (~3주, PR #124 머지 완료)** — slip audit overlay + 실시간 sync + TM 보완 3건. Flyway V18 (`slip_audit_logs` + `slips.revision_count`) + `SlipAuditLogService` (record / recordBatch / listBySlip / revertToRevision) + 신규 endpoint 3 (`GET /audit-logs` / `PATCH /audit/overlay` / `POST /audit/revert/{n}`) + `Slip.applyOverlayPatch/readOverlayField` 11 필드 시범 + `SlipService.editHeader` memo diff → SSE `slip:edit` broadcast. design-system `AuditOverlay` 컴포넌트 (취소선 + 색상 dot + 수정자명 + 시각) + Storybook 4 story + desktop `SlipDetailPage` 수정 횟수 chip + 복원 dropdown + mobile-staff `SlipDetailScreen` partnerName/status overlay (RN Text strikethrough + View dot). **TM 보완 3건 흡수**: (1) `SlipRealtimeBrokerConcurrencyIT` multi-emitter 3 case, (2) `SlipAuditPayloadCaptorTest` ArgumentCaptor SSE payload schema 3 case, (3) `RedisRealtimeBroker` + `RedisRealtimeConfigBean` + `RealtimePublishHook` config toggle. 단위 24 + IT 9 case + multi-context Playwright 작동 캡처 4 PNG (D-P12-02).
- **PR-H3 (~1.5주, 머지 완료)** — slip 수정/삭제 요청 워크플로우 + status 잠금 가드. Flyway V19 (`slip_edit_requests` + 인덱스 3) + `SlipEditRequest` entity + 3 enum (`SlipEditRequestType` EDIT/DELETE, `SlipEditRequestStatus` PENDING/APPROVED/REJECTED/EXPIRED, `SlipEditTargetRole` WAREHOUSE) + `SlipEditRequestService` 6 책임 (request / approve / reject / listPendingForRole / findActiveApproval / consumeApproval / `@Scheduled` expirePending fixedRate=1h) + `SlipService.applyOverlayPatch / softDelete` 잠금 가드 (사용자 명시 정책 — DRAFT/SAVED/SENT 자유 / **CONFIRMED+ACCEPTED+PROCESSING `LOCKED_REQUIRES_APPROVAL`** = APPROVED 1건 필요 + 1회 한정 소진 / **INSPECTING+SHIPPING+DELIVERED `FULLY_LOCKED`**). 4 신규 endpoint (`POST /edit-request` / `POST .../approve` / `POST .../reject` / `GET /edit-requests?status=PENDING`) + 슬립별 이력 조회. SSE `slip:edit-request:created` (요청 생성 → 창고 + 작성자) + `slip:edit-request:decided` (수락/거절 → 작성자 toast). `NotificationClient` (notification-service Internal Feign — SMS/PUSH graceful fallback, 실패 시 slip 비즈니스 진행). design-system `SlipEditRequestDialog` (사유 ≥ 10자 + 500자 카운터, EDIT/DELETE danger variant) + Storybook 3 story. desktop `SlipDetailPage` `slip-detail-edit-request-banner` (LOCKED_REQUIRES_APPROVAL 작성자 노출) + `slip-detail-locked-banner` (FULLY_LOCKED) + `decisionToast` + `SlipEditRequestsPage` 신규 (PENDING list + 수락 confirm + 거절 사유 dialog ≥ 5자 + 30s polling fallback) + sidebar NavLink. mobile-staff `SlipDetailScreen` 작성자 SALES 요청 + 창고 직원 WAREHOUSE PENDING 카드 분기 + `SlipEditRequestsScreen` 신규 (창고 직원 inbox + 수락/거절 + 30s polling) + SSE foreground Alert. DevOps `samhan.slip.edit-request.expires-hours=24` 환경변수 + production 알림 가이드. **단위 30+ + IT 3 case + Playwright 작동 캡처 4 PNG**. **QA Major (BE/FE 잠금 정책 불일치 — FE `isConfirmed` CONFIRMED 분기 vs BE `LOCKED_REQUIRES_APPROVAL`={ACCEPTED, PROCESSING}) 본 PR 안에서 fix 완료 — CONFIRMED 를 LOCKED_REQUIRES_APPROVAL 로 이동, FE `isApprovalRequired` 명명 정정, 사용자 명시 워크플로우 정합 일관** (D-P12-03).
- **PR-H4 (~7주, 3분할 H4a/H4b/H4c)** — 전 15 service + 50+ page audit + sync + 권한 일괄 확장. partner / inventory / accounting / arologis / dashboard 등 14 backend MSA 도메인 모두 SSE 채널 도입 + `shared/realtime-abstraction` module 추출 + Redis Pub/Sub 분기 (PR-H2 시드된 `RedisRealtimeBroker` 활성).
  - **PR-H4a (~1주, PR #126 머지 완료)** — `shared/realtime-abstraction` module 추출 (broker / audit / lock / editrequest base + AutoConfiguration + InMemory default + Redis 옵션 toggle) + slip-service 기존 구현 migration (호출자 0 변경, thin facade `SlipRealtimeBroker extends InMemoryRealtimeBroker`) + Designer 14 service 적용 패턴 가이드 + DevOps Redis production 가이드 + QA 61 case 시나리오. **단위 29 (shared) + 회귀 0 (slip 336 tests)** + 풀빌드 GREEN. FE 변경 0 → 작동 캡처 면제 (QA 5.5.2 multi-context 회귀 게이트만, D-P12-04a).
  - **PR-H4b (~3주, PR #127 머지 완료)** — BE 13 service 일괄 적용 (partner / inventory / accounting / arologis / product / dc-config / partner-order / user / notification / groupware / dashboard / logging) — PR-H4a 의 `shared/realtime-abstraction` 의존만 추가 + 도메인별 Flyway template 활용 (`audit_log_template.sql` / `edit_request_template.sql`) + 도메인별 specialization (9 service `<Domain>LockPolicy` + `<Domain>EditRequestService` + `<Domain>AuditLogService` + `<Domain>RealtimeController`, 2 service broker only — dashboard / notification, 1 service env 셋업 — logging). multi-service 동시 SSE 작동 캡처 4 PNG (D-P12-04b).
  - **PR-H4c (~3주, 본 PR — Phase 12 시리즈 종결 마일스톤)** — FE 50+ page UI 통합 — desktop 34 page (회계 12 + 영업/창고/arologis 11 + admin 10 + slip 1) + mobile-staff 12 화면 (DriverDashboard polling + DriverSignature audit + SalesEstimatePhoto stub + 기존 SlipDetailScreen / SlipEditRequestsScreen 보존) + admin 10 page (PartnersPage / UsersPage / RolesPage / WarehousesPage / DepartmentsPage / RegionsPage / ChatRoomsPage / BlockedPartnersPage / SheetSyncPage / SlipEditRequestsPage). **SlipDetailPage (PR-H1/H2/H3 시드) 패턴 1:1 적용** — entity 보유 page 는 useQuery + SSE + AuditOverlaySection / list/workflow/read-only page 는 30s polling + "실시간 자동 갱신 30초" indicator + read-only AuditInfoBanner. 4 신규 도메인 RealtimeClient (Accounting / PartnerOrder / DcConfig / Estimate) + 2 신규 (Inventory / Arologis) + 공유 `createRealtimeClient.ts` + `createAuditApi.ts` + `AuditOverlaySection.tsx`. 사용자 명시 "다른 모든 화면도 마찬가지" 충족 (50+ page 일괄). 매뉴얼 8 docs 일괄 갱신 ("수정 이력 보기" + "잠금/요청 워크플로우" section). QA sampling 120 case + Playwright snapshot 시각 회귀 가드 + **작동 캡처 5 PNG** (회계/영업/창고/arologis/admin 핵심 5 도메인 시각 증거). 풀빌드 + typecheck PASS (D-P12-04c).

### 산출물 (본 PR-H1)
- `services/slip-service` SSE infra — `realtime/SlipRealtimeBroker` + `realtime/SlipRealtimeController` + `comment/{domain,repository,service,web,dto}` 8 신규 file + V17 Flyway (`slip_comments` + 부분 인덱스, BaseEntity 7 audit) + 단위 9 case (Service 5 + Broker 4) + IT 5 case (SSE/POST/GET/broker/403) + `ApplicationContextLoadIT` 보강
- `clients/desktop` — `realtime/SlipRealtimeClient.ts` (fetch+ReadableStream polyfill, JWT header, 5s reconnect backoff) + `api/slipComment.ts` + `SlipDetailPage` 코멘트 Card (useQuery + useEffect SSE + optimistic add, data-testid 4종)
- `clients/mobile-staff` — `react-native-sse@^1.2.1` 의존 + `realtime/SlipRealtimeClient.ts` (heartbeat watchdog 60s) + `api/slipComment.ts` (ApiResponse wrapper assert) + `screens/SlipDetailScreen.tsx` 신규 + `DriverDashboardScreen` "전표 보기 / 코멘트" link + `DriverTabNavigator` minimal stack
- `clients/web/design-system` — `utils/userColorHash.ts` (HSL deterministic, PR-H2 audit overlay 의존 시드) + Storybook 1 story (5 userId swatch + Determinism 검증)
- `docs/uiux/phase12/H1-comment-smoke.md` 신규 — wireframe + 한국어 라벨
- `docs/devops/realtime-sse-production.md` 신규 — nginx config + AWS ALB / cafe24 운영 hint
- `infrastructure/env-templates/{api-gateway,slip-service}.env` — `SAMHAN_REALTIME_HEARTBEAT_SECONDS=30` + gateway response-timeout 600s
- `services/api-gateway/src/main/resources/application.yml` — `httpclient.response-timeout: 600s` (SSE keep-alive)
- `services/slip-service/src/main/resources/application.yml` — `samhan.realtime.heartbeat-seconds` property
- `docs/qa/phase-12-step-1-websocket-infra/scenarios.md` 신규 — 14 case (subscribe + broadcast 5 + 다중 client 5 + API contract 4) + 페르소나 5
- `docs/qa/phase-12-step-1-websocket-infra/working-{comment-context-a-input,comment-context-a-after-send,comment-context-b-receives,multi-context-split}.png` 신규 — multi-context Playwright 작동 캡처 4 PNG (browser.newContext 2회로 A/B 분리 + sharp 좌-우 합성)
- `tools/manual-capture/capture-pr-h1.js` 신규 — Playwright 자동화 (msedge → chromium fallback, mock comments seed 사전 주입)
- `clients/desktop/src/renderer/api/mock.ts` — POST/GET `/comments` mock 추가 (capture 자동화 의존)

### 진입 조건 (PR-H1)
- PR #122 (운영 검증 인프라) 머지 — 충족 (origin/main `841edde`)

### 산출물 (본 PR-H2)
- `services/slip-service` audit overlay infra — `audit/{domain/SlipAuditLog,repository/SlipAuditLogRepository,service/SlipAuditLogService,web/SlipAuditLogController,web/dto/{OverlayPatchRequest,SlipAuditLogResponse}}.java` 7 신규 file + `Slip.applyOverlayPatch/readOverlayField/incrementRevision` (11 필드 시범 — memo / shippingAddress / contactPhone / partnerName / discountRate 등) + `SlipService.editHeader` memo diff → `recordBatch` + SSE `slip:edit` broadcast
- `services/slip-service` Flyway V18 — `V18__add_slip_audit_logs.sql` (`slip_audit_logs` 신규 + `slips.revision_count BIGINT NOT NULL DEFAULT 0` + 부분 인덱스, BaseEntity 7 audit + Soft Delete)
- `services/slip-service` TM 보완 3건 (사용자 명시) — (1) `realtime/SlipRealtimeBrokerConcurrencyIT.java` (multi-emitter 3 case — 50 subscribe + cleanup race + 100 emitter/1000 publish), (2) `audit/service/SlipAuditPayloadCaptorTest.java` (ArgumentCaptor SSE payload schema 3 case — actorId/actorName/actorColor/changes[]/revisionNo 5 키 일치), (3) `realtime/{RedisRealtimeBroker,RedisRealtimeConfigBean,RealtimePublishHook}.java` (`SAMHAN_REALTIME_BROKER=in-memory|redis` config toggle, default in-memory, 미연결 startup 정상, `*Bean` suffix 가드 PR #119 회귀 가드 일관)
- `services/slip-service` 단위 24 + IT 9 — `SlipAuditLogServiceTest` (6 case) + `SlipAuditLogServiceRevertTest` (4 case) + `SlipAuditPayloadCaptorTest` (3 case) + `SlipServiceAuditDiffTest` (5 case memo diff) + `SlipRealtimeBrokerConcurrencyIT` (3 case) + `RedisRealtimeBrokerTest` (3 case mock) + `ApplicationContextLoadIT` `SlipAuditLogService` 단일 등록 가드 보강
- `clients/web/design-system` — `components/AuditOverlay/{AuditOverlay.tsx,AuditOverlay.module.css,AuditOverlay.stories.tsx,index.ts}` 4 신규 file (취소선 + 색상 dot + 수정자명 + 시각, Storybook 4 story — Single / Multiple / Empty / MultiUserShowcase) + barrel export 보강
- `clients/desktop` — `api/slipAudit.ts` 신규 (`listAuditLogs` + `revertToRevision`) + `routes/SlipDetailPage.tsx` 수정 횟수 chip (`slip-detail-revision-count`) + AuditOverlay 적용 (memo / shippingAddress) + 복원 dropdown (`slip-detail-revert-select`) + SSE `slip:edit` cache invalidate
- `clients/mobile-staff` — `utils/userColorHash.ts` 신규 (design-system 1:1 RN 호환 복제) + `components/AuditOverlay.tsx` 신규 (RN Text 취소선 + View dot) + `screens/SlipDetailScreen.tsx` 수정 횟수 헤더 + AuditOverlay 적용 (partnerName / status) + 복원 버튼 MASTER/MANAGER 만 + `realtime/SlipRealtimeClient.ts` `slip.edit` event type 추가
- `docs/uiux/phase12/H2-audit-overlay.md` 신규 — wireframe + 한국어 라벨 + Designer 매뉴얼
- `docs/manual/05-슬립공유-수정-처리.md` 신규 — 사용자 시나리오 (페르소나 5) + 권한 + 화면 캡처 stub
- `docs/devops/redis-realtime-broker.md` 신규 — in-memory vs Redis 가이드 + AWS ElastiCache cache.t3.micro ~₩30K/월 + cutover 절차 + Testcontainers Redis 권고
- `infrastructure/env-templates/slip-service.env` — `SAMHAN_REALTIME_BROKER=in-memory` (default) + `REDIS_HOST` / `REDIS_PORT` placeholder
- `services/slip-service/src/main/resources/application.yml` — `samhan.realtime.broker` config toggle + `spring.data.redis` host/port
- `docs/qa/phase-12-step-2-slip-audit-overlay/scenarios.md` 신규 — 27 case (audit_log 자동 기록 5 + AuditOverlay UI 5 + 수정 횟수 카운트 3 + 복원 4 + 실시간 sync 5 + 동시 수정 충돌 3 + Redis broker fallback 2) + 페르소나 5
- `docs/qa/phase-12-step-2-slip-audit-overlay/working-{audit-overlay-context-a-edit,audit-overlay-context-b-receives,audit-overlay-multi-revision,multi-context-edit-split}.png` 신규 — multi-context Playwright 작동 캡처 4 PNG (취소선 + 색상 + 수정자명 + 1초 sync 4 요소 시각 증거, 핵심 = `multi-context-edit-split.png` 좌-A 우-B 합성)
- `tools/manual-capture/capture-pr-h2.js` 신규 — Playwright multi-context 자동화 (browser.newContext 2회 분리 + sharp 좌-우 합성 + 한국어 라벨 + audit-logs / overlay PATCH / revert mock seed)
- `clients/desktop/src/renderer/api/mock.ts` — audit-logs / overlay PATCH / revert mock endpoint (capture 자동화 의존)

### 진입 조건 (PR-H2)
- PR #123 (PR-H1 SSE infra + slip 코멘트 smoke) 머지 — 충족
- PR-H1 시드 `userIdToColor` HSL hash util 재사용 (design-system `utils/userColorHash.ts` 동일 + RN 1:1 복제 `clients/mobile-staff/src/utils/userColorHash.ts`)

### 산출물 (본 PR-H3)
- `services/slip-service` 수정/삭제 요청 도메인 — `editrequest/{domain/{SlipEditRequest,SlipEditRequestType,SlipEditRequestStatus,SlipEditTargetRole},repository/SlipEditRequestRepository,service/SlipEditRequestService,web/SlipEditRequestController,web/dto/{ApproveRequest,CreateEditRequestRequest,RejectRequest,SlipEditRequestResponse}}.java` 12 신규 file (entity + 3 enum + repository + service 6 책임 + controller 4 endpoint + DTO 4) + `client/NotificationClient.java` 신규 (notification-service Internal Feign — SMS/PUSH graceful fallback) + `config/SlipEditRequestProperties.java` 신규 (`samhan.slip.edit-request.expires-hours` binding)
- `services/slip-service` Flyway V19 — `V19__add_slip_edit_requests.sql` (`slip_edit_requests` + 인덱스 3 — `idx_slip_edit_requests_slip_id`, `idx_slip_edit_requests_status_target`, `idx_slip_edit_requests_expires_at` + BaseEntity 7 audit + Soft Delete)
- `services/slip-service/SlipService.java` 보강 — `applyOverlayPatch` 잠금 가드 (`findActiveApproval` 호출 + mutation 후 `consumeApproval`) + `softDelete` 신규 (DELETE 요청 수락 후 1회 한정 소진)
- `services/slip-service` SSE event 2 신규 — `slip:edit-request:created` (요청 생성 → 창고 대시보드 + 작성자 banner) / `slip:edit-request:decided` (수락/거절/만료 → 작성자 toast)
- `services/slip-service` 단위 30+ + IT 3 — `SlipEditRequestServiceTest` (8→9 case 보강) + `SlipServiceLockGuardTest` (6→7 case 보강) + `SlipEditRequestControllerIT` (3 case)
- `clients/web/design-system` — `components/SlipEditRequestDialog/{SlipEditRequestDialog.tsx,.module.css,.stories.tsx,index.ts}` 4 신규 (사유 textarea ≥ 10자 + 500자 카운터, EDIT/DELETE danger variant 분기, Storybook 3 story — Edit / Delete / Submitting) + barrel export 보강
- `clients/desktop` — `api/slipEditRequest.ts` 신규 (`createSlipEditRequest` / `approveSlipEditRequest` / `rejectSlipEditRequest` / `listSlipEditRequests` + `SLIP_EDIT_REQUEST_REVIEWER_ROLES` + `SLIP_EDIT_REQUEST_AUTHOR_ROLES` + 라벨 매핑) + `routes/SlipDetailPage.tsx` 보강 (`editRequestDialogType` state + `latestEditRequest` state + SSE `slip:edit-request:decided`/`created` 핸들러 + `slip-detail-edit-request-banner` LOCKED_REQUIRES_APPROVAL 작성자 노출 + `slip-detail-locked-banner` FULLY_LOCKED + `decisionToast`) + `routes/admin/SlipEditRequestsPage.tsx` 신규 (PENDING list 표 + 수락 confirm + 거절 사유 dialog ≥ 5자 + 30s polling) + `components/AppLayout.tsx` 보강 (`sidebar-warehouse-slip-edit-requests` NavLink WAREHOUSE/MANAGER/MASTER 가시) + `routes/index.tsx` 라우트 등록
- `clients/mobile-staff` — `api/slipEditRequest.ts` 신규 (request / approve / reject / list / listPending) + `screens/SlipDetailScreen.tsx` 보강 (작성자 SALES 수정 요청 + 창고 직원 WAREHOUSE PENDING 카드 분기 + DRIVER 차단) + `screens/SlipEditRequestsScreen.tsx` 신규 (창고 직원 inbox + 수락/거절 + 30s polling) + `realtime/SlipRealtimeClient.ts` `slip.edit-request.{created,approved,rejected}` event type + foreground Alert 알림
- `docs/uiux/phase12/H3-edit-request-workflow.md` 신규 — flow chart + 잠금 정책 + 한국어 라벨 + Designer 매뉴얼
- `docs/manual/02-출고-처리.md` 보강 — "수정/삭제 요청" section (사용자 시나리오)
- `docs/manual/03-역할별-권한.md` 보강 — 잠금 정책 표 (status × ROLE 매트릭스)
- `docs/devops/slip-edit-request-notification.md` 신규 — Aligo SMS + Expo push 후속 production 가이드
- `services/slip-service/src/main/resources/application.yml` — `samhan.slip.edit-request.expires-hours=24` (default)
- `docs/qa/phase-12-step-3-slip-edit-permission/scenarios.md` 신규 — 24 case (status 잠금 6 + FULLY_LOCKED 4 + 요청→알림→수락/거절 5 + 수락 후 잠금 해제 + 1회 소진 4 + 만료 scheduler + UX 5) + 페르소나 5 + § 8 단위/IT 정합성
- `docs/qa/phase-12-step-3-slip-edit-permission/working-{edit-request-dialog,warehouse-pending-list,edit-request-approved-toast,locked-slip-banner}.png` 신규 — Playwright 작동 캡처 4 PNG (잠금 → 요청 → 알림 → 수락 → 해제 핵심 워크플로우 시각 증거)
- `tools/manual-capture/capture-pr-h3.js` 신규 — Playwright 자동화 (PR-H1/H2 패턴 일관)
- TM 후속 fix commit (`69779b8`) — BE/FE 잠금 정책 정합 (CONFIRMED → LOCKED_REQUIRES_APPROVAL 이동 + FE `isConfirmed` → `isApprovalRequired` 정정 + LockGuard 7 case + ServiceTest 9 case 회귀 가드 보강)

### 진입 조건 (PR-H3)
- PR #124 (PR-H2 audit overlay) 머지 — 충족 (origin/main `489a3cf`)
- PR-H1 시드 SSE infra + PR-H2 시드 audit + Redis broker config toggle 재사용

### 산출물 (본 PR-H4a)
- `shared/realtime-abstraction` 신규 module — `realtime/{RealtimeAutoConfiguration,broker/{RealtimeBroker,InMemoryRealtimeBroker,RedisRealtimeBroker,BrokerConfiguration,RealtimePublishHook},audit/{AuditLogRecorder,AuditLogEntry,AuditEventPayloadBuilder,ChangeEntry},lock/{EditLockGuard,DefaultEditLockGuard,EditLockPolicy,LockedException},editrequest/{EditRequestService,EditRequestRecord,EditRequestStatus,EditRequestType,EditTargetRole}}.java` 19 신규 file (broker 5 + audit 4 + lock 4 + editrequest 5 + autoconfig 1) + `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 신규 + `db/template/{audit_log_template.sql,edit_request_template.sql}` 2 신규 (PR-H4b 13 service 의존)
- `shared/realtime-abstraction` 단위 29 case — `InMemoryRealtimeBrokerTest` (subscribe / broadcast / cleanup) + `RedisRealtimeBrokerTest` (subscribe / publish / fallback) + `AuditEventPayloadBuilderTest` (5 키 schema) + `EditRequestRecordTest` (status transition + expire) + `DefaultEditLockGuardTest` (3 카테고리 분기) + `EditLockPolicyTest` (FREE/LOCKED/FULLY) + `RealtimeAutoConfigurationTest` (bean 단일 등록)
- `services/slip-service/build.gradle` — `implementation project(':shared:realtime-abstraction')` 의존 추가
- `services/slip-service/.../slip/realtime/SlipRealtimeBroker.java` — 259 → 109 line (thin facade `extends InMemoryRealtimeBroker`, 호출자 0 변경) + `RealtimePublishHook.java` / `RedisRealtimeConfigBean.java` / `RedisRealtimeBroker.java` / `RedisRealtimeBrokerTest.java` 4 file 삭제 (shared module 으로 이전)
- `services/slip-service` 회귀 — 336 tests / 0 fail (PR-H1 SSE infra 5 + PR-H2 audit overlay 9 + PR-H3 edit request 3 IT 모두 PASS) + 단위 30+ 회귀 0
- `settings.gradle` — `shared:realtime-abstraction` include 보강
- `docs/uiux/phase12/H4a-shared-realtime-pattern.md` 신규 — 14 service × audit overlay 적용 매트릭스 + SlipDetailPage 시드 패턴 1:1 복제 가이드 + 한국어 라벨 매핑 표 + UUID 비공개 가드 + PR-H4c 50+ page 적용 체크리스트
- `docs/devops/redis-realtime-broker.md` 보강 — shared module + AWS ElastiCache cache.t3.micro 가이드 + cutover 절차
- `docs/qa/phase-12-step-4a-shared-realtime-module/scenarios.md` 신규 — 61 case (shared module 단위 회귀 게이트 12 + slip-service 회귀 무손실 8 + cross-domain 색상 일관 5 + Redis broker fallback 4 + AutoConfig classpath 분기 4 + multi-context SSE 회귀 게이트 5 + Designer 시각 회귀 5 + 한국어 라벨 일관 5 + UUID 비공개 5 + PR-H4b/H4c 진입 게이트 8) + 페르소나 5

### 진입 조건 (PR-H4a)
- PR-H3 머지 — 충족
- PR-H2 시드 `RedisRealtimeBroker` / PR-H3 시드 `LOCKED_REQUIRES_APPROVAL` / `FULLY_LOCKED` 분류 / `EditRequestService` 6 책임 패턴 재사용

### 산출물 (본 PR-H4b)
- BE 13 service 일괄 `shared/realtime-abstraction` 적용 (165 files +11932). 신규 entity / specialization / Flyway / IT 모두 PR-H4a 시드 패턴 1:1 복제 — 호출자 변경 0
- **9 specialization domain (BE-A/B/C/D/E)** — `services/{accounting,partner}-service` BE-A (42 files +2795) + `services/{inventory,arologis}-service` BE-B (38 files +3117) + `services/{partner-order,product}-service` BE-C (41 files +2442) + `services/{user,dc-config,notification}-service` BE-D (26 files +1255) + `services/{logging,groupware,dashboard}-service` BE-E (10 files +386)
- **9 신규 Flyway migration** — `V5__add_partner_audit_logs_and_edit_requests.sql` (110 line) + `V6__add_inventory_audit_logs_and_edit_requests.sql` (131 line) + `V?__add_accounting_audit_logs_and_edit_requests.sql` (111 line) + `V?__add_arologis_audit_logs_and_edit_requests.sql` (128 line) + `V6__add_realtime_overlay.sql` product (125 line) + `V?__add_dc_config_audit_logs_and_edit_requests.sql` (113 line) + `V3__add_realtime_overlay.sql` partner-order (138 line) + `V4__add_user_audit_logs_and_edit_requests.sql` (111 line) + `V2__add_groupware_audit_logs.sql` (68 line) + `V3__add_groupware_edit_requests.sql` (83 line) + `V3__add_notification_audit_logs.sql` (71 line) — `db/template/{audit_log_template,edit_request_template}.sql` 1:1 복제 + `<domain>` prefix 교체
- **도메인별 Specialization 9개** — `<Domain>LockPolicy` (도메인 status enum × 3 카테고리 — partner DRAFT/ACTIVE/SUSPENDED-INACTIVE / inventory DRAFT/SUBMITTED/POSTED-VOIDED / accounting DRAFT/POSTED-CLOSED-VOIDED FULLY_LOCKED only / arologis PLANNED/DISPATCHED/IN_TRANSIT-DELIVERED-CANCELED / product DRAFT/ACTIVE/DISCONTINUED-INACTIVE / dc-config DRAFT/ACTIVE/EXPIRED-INACTIVE / partner-order DRAFT/SUBMITTED/CONFIRMED-FULFILLED-CANCELED / user ACTIVE free audit only/SUSPENDED-INACTIVE / groupware DRAFT-PUBLISHED audit only/ARCHIVED) + `<Domain>EditRequestService` + `<Domain>AuditLogService` + `<Domain>RealtimeController` (channel `samhan:<service>:<entity>:edit:{id}`)
- **2 broker only** — dashboard (read-only KPI 도메인) + notification (알림 발송 도메인 — edit-request 미적용)
- **1 env 셋업** — logging (`build.gradle` shared 의존 + `application.yml` realtime property 12 line — audit log domain 도입은 PR-H4c 후속)
- **단위 88+93+다수 PASS + 각 service IT (RealtimeIT + ApplicationContextLoadIT) PASS + slip-service 336 tests / 0 fail (회귀 100% 보존)** + 풀빌드 GREEN
- `docs/uiux/phase12/H4b-be-rollout-checklist.md` 신규 (343 line) — Designer 13 service 적용 매트릭스 + 도메인별 잠금 정책 일람 + Specialization 명명 규약 + audit overlay endpoint 패턴 + 한국어 라벨 매핑
- `docs/devops/phase12-redis-multi-service.md` 신규 (388 line) — 13 service 단일 ElastiCache 공유 환경 운영 가이드 + 단계적 cutover 절차 + channel naming 규약 + publishFailureCount metric + production hint
- `docs/qa/phase-12-step-4b-be-realtime-rollout/scenarios.md` 신규 (573+70 = 643 line) — 70 case (13 service × 5 + 회귀 가드 5) + 페르소나 5 + 우선순위 매트릭스 (Critical 46 / Major 8 / Minor 3 / Info 3)
- `docs/qa/phase-12-step-4b-be-realtime-rollout/working-multi-service-{tax-invoice-sync,partner-edit-sync,inventory-audit-sync,dispatch-sync}.png` 신규 4 PNG — multi-service 동시 SSE 작동 캡처 (Playwright multi-context A/B + sharp 좌-우 합성)
- `tools/manual-capture/capture-pr-h4b.js` 신규 (563 line) — Playwright 자동화 (PR-H1/H2/H3 패턴 일관, 4 도메인 mock seed)

### 진입 조건 (PR-H4b)
- PR #126 (PR-H4a `shared/realtime-abstraction` module + slip 시범 마이그) 머지 — 충족
- PR-H4a 시드 `db/template/audit_log_template.sql` + `edit_request_template.sql` + `EditLockPolicy` 3 카테고리 + AutoConfiguration imports 재사용

### 진입 plan
- 본 PR-H4b 머지 후 **PR-H4c (FE 50+ page UI 통합 ~2~3주)** 즉시 진입. desktop `<Domain>DetailPage` 일괄 audit overlay + edit-request banner + mobile-staff 적용. PR-H4b 시드 9 specialization 도메인 1차 진입 + dashboard/notification 후속.
- **logging / dashboard / dc-config / groupware `ApplicationContextLoadIT` 보강** — PR-H4c 진입 시 처리

### 5-team 리뷰 + CI + PM + 사용자 머지 워크플로우 (memory `feedback_pr_review_workflow`)

본 PR 머지 절차:
1. PR 발행 즉시 `gh pr checks --watch` 자동 시작 (memory `feedback_pr_ci_monitoring`)
2. 5-team 리뷰 (BE / FE / Designer / QA / DevOps) PR comment 토론 (memory `feedback_tm_led_agent_discussion`)
3. CI green + reviewer agent 토론 종료 후 TM 종합 추가 commit (필요 시)
4. PM 최종 승인 댓글 + 머지 요청 (memory `feedback_user_merge_authority`)
5. 사용자 머지

---

## 미결 결정 항목 (D-시리즈)

| ID  | 주제                                       | 상태       | 결정 시점          |
| --- | ------------------------------------------ | ---------- | ------------------ |
| D6  | 카페24 SSH 배포 대상 앱                    | 보류       | AWS cutover 시점에 무관 (현재 인프라 그대로) |
| D7  | 카페24 호스트 내 배포 디렉토리             | 보류       | D6 답변 후         |
| D8  | 카페24 pm2 process 명명 규약               | 보류       | D6 / D7 답변 후    |
| D9  | 14 backend MSA 운영 호스팅 옵션 (X1 ~ X4) | **확정 (X3 AWS, Phase 10 cutover)** | D-P8-03 |

---

## 머지 PR ↔ Phase 매트릭스

| PR | Phase | 설명                                              |
| -- | ----- | ------------------------------------------------- |
| #2 | 1     | auth + user-service 첫 슬라이스                   |
| #3 | 1     | team/auth                                         |
| #5 | 1     | devops post-phase2-cleanup                        |
| #7 | 2     | product BE 도메인 + API                           |
| #9 | 2     | product FE 디자인 시스템                          |
| #11| 2     | product DevOps gateway routing                    |
| #13| 2     | product QA                                        |
| #15| 2     | product hotfix (currency bpchar)                  |
| #16| 2     | inventory 첫 슬라이스                             |
| #17| 2/3   | slip 첫 슬라이스                                  |
| #18| 2     | desktop electron skeleton                         |
| #19| 3     | sales output-format                               |
| #20| 3     | sales form-polish                                 |
| #21| 3     | sales polish-2 (인쇄 양식)                        |
| #22| 3     | notification-slice-B (SMS)                        |
| #23| 3     | signature-slice-C                                 |
| #26| 3     | signature-mobile-ux                               |
| #28| 4     | accounting-slice-A                                |
| #30| 5     | sms-aligo-migration                               |
| #34| 2     | DS extension                                      |
| #36| 2     | CI frontend jobs                                  |
| #38| 6     | M1a product-service 시드                          |
| #50| 6     | order-app v4 (Vite SPA + PWA)                     |
| #51| 6     | desktop v4                                        |
| #52| 6     | mobile v4 (RN WebView)                            |
| #53| 6     | order-app v4 정정                                 |
| #54| 6     | desktop v4 정정                                   |
| #58| 6     | estimate-app v2 (Express + EJS)                   |
| #61| 6     | mobile DC notice 삭제                             |
| #67| 6     | legacy-v2 import (revert 됨)                     |
| #68| 6     | product google sheets cron 1차                   |
| #69| 6     | RN client 통합                                    |
| #70| 6     | #67 revert                                        |
| #72| 6     | M2 partner-auth-service                           |
| #73| 6     | estimate-app google sheets 직접                  |
| #75| 6     | #68 정정                                          |
| #76| 6     | Phase 6 backend 통합 (M2/M3/M4/M5)                |
| #77| 6     | DEVOPS Cloudflare Pages workflow                  |
| #78| 6     | QA Playwright + Detox 셋업                        |
| #79| 6     | client mock 일괄 제거                             |
| #80| 6     | Phase 6 마무리 + Phase 7 readiness                |
| #81| 7     | Phase 7 1차 (카페24 SSH + Render Blueprint + QA)  |
| #82| 7     | Phase 7 2차 (CSP + visual + Slack 비동기)         |
| #83| 7     | Phase 7 3차 (by-code + tautology + render mirror) |
| #84| 7     | Phase 7 4차 (DS 토큰 + body 바인딩 + visual baseline) |
| #85| 7     | Phase 7 5차 docs (README + ROADMAP + DECISIONS Phase 7) |
| #86| 7     | Phase 7 4차 잔여 (통일 토큰 + Pretendard + RN graceful) |
| #87| 7     | Phase 7 마무리 (self-host font + helmet+CSP + desktop CSP + QA fonts.ready + 회고 + Phase 8 plan) |
| #88| 8     | Phase 8 1차 (AWS 호환성 가드 + 12-factor 검증 + 환경변수 표준 + ROADMAP/DECISIONS 갱신) |
| #89| 8     | Phase 8 2차 (ServiceDiscoveryClient interface + Eureka wrapper + AWS placeholder + 환경변수 통일 chained-default + Secrets Manager spec) |
| #90| 8     | Phase 8 3차 (AWS 마이그레이션 dry-run + Phase 8 회고 + Phase 9 진입 plan + ROADMAP/DECISIONS 갱신) |
| #91 | 9 | Phase 9 1차 W1 (partner-service skeleton — port 8095, M5 partnerId lookup endpoint + 2 entity + Admin CRUD + ServiceDiscoveryClient 도입) |
| #92 | 9 | Phase 9 2차 W2 (groupware-service skeleton — port 8092, 결재선 chain + 메신저 + 일정 + UserClient + ServiceDiscoveryClient 두 번째 소비자) |
| #93 | 9 | Phase 9 3차 W3 (notification-service skeleton — port 8093, 2 entity + 3 channel adapter (FCM/SES/Aligo) + UserClient bulk verify + Caffeine TTL 60s + ServiceDiscoveryClient 세 번째 소비자 + DevOps #11/#12 흡수) |
| #94 | 9 | Phase 9 4차 W4 (dashboard-service skeleton — port 8094, 3 entity + 2 materialized view (CONCURRENTLY refresh) + 4 client (Inventory/Accounting/PartnerOrder/Partner) + Caffeine KPI cache + ServiceDiscoveryClient 네 번째 소비자 + shared:user-client-abstraction 신규 + W3 backlog 5건 + 사용자 가드 후속 fix 11건 본 PR 채택 + slip-service 시간 의존 회귀 정공법 fix) |
| 본 PR | 9 | Phase 9 5차 W5 (회고 보고서 + Phase 10 진입 plan + 잔존 backlog 1건 흡수 — partner-service POST /internal/partners/find-by-codes bulk endpoint + dashboard-service PartnerCodeResolver.resolveAll bulk 전환, D-P9-16 ~ D-P9-20 추가) |
| #123 | 12 | Phase 12 시리즈 1/4 — PR-H1 SSE infra + slip 코멘트 smoke (`SseEmitter` 표준 + 단일 노드 in-memory broker + `slip_comments` V17 + multi-context Playwright 4 PNG, D-P12-01) |
| #124 | 12 | Phase 12 시리즈 2/4 — PR-H2 slip audit overlay + 실시간 sync + TM 보완 3건 (Flyway V18 `slip_audit_logs` + `SlipAuditLogService` 4책임 + 신규 endpoint 3 + design-system `AuditOverlay` + desktop / mobile-staff 통합 + multi-emitter 동시성 IT + ArgumentCaptor SSE payload + `RedisRealtimeBroker` config toggle, D-P12-02) |
| #125 | 12 | Phase 12 시리즈 3/4 — PR-H3 slip 수정/삭제 요청 워크플로우 + status 잠금 가드 (Flyway V19 `slip_edit_requests` + `SlipEditRequestService` 6책임 + 신규 endpoint 4 + `NotificationClient` graceful fallback + SSE `slip:edit-request:{created,decided}` + `SlipEditRequestDialog` + desktop `SlipEditRequestsPage` + mobile-staff `SlipEditRequestsScreen` + LOCKED_REQUIRES_APPROVAL/FULLY_LOCKED 분류 + TM 후속 fix BE/FE 정합, D-P12-03) |
| #126 | 12 | Phase 12 시리즈 4 분할 1/3 — PR-H4a `shared/realtime-abstraction` module 추출 + slip-service 시범 마이그 (broker 5 + audit 4 + lock 4 + editrequest 5 + autoconfig 1 = 19 신규 file + AutoConfiguration imports + 단위 29 + slip-service 336 회귀 0 + thin facade `SlipRealtimeBroker extends InMemoryRealtimeBroker` 호출자 0 변경 + Designer 14 service 적용 가이드 + DevOps Redis production + QA 61 case, D-P12-04a) |
| #127 | 12 | Phase 12 시리즈 4 분할 2/3 — PR-H4b BE 13 service 일괄 `shared/realtime-abstraction` 적용 (165 files +11932 — 9 specialization 도메인 partner/inventory/accounting/arologis/product/dc-config/partner-order/user/groupware + 2 broker only dashboard/notification + 1 env logging + slip 시드 = 13 service + 9 신규 Flyway migration + 도메인별 `<Domain>LockPolicy` × 3 카테고리 + `<Domain>EditRequestService` + `<Domain>AuditLogService` + `<Domain>RealtimeController` + 단위 88+93+다수 PASS + slip-service 336 회귀 100% 보존 + multi-service 동시 SSE 작동 캡처 4 PNG, D-P12-04b) |
| 본 PR | 12 | Phase 12 시리즈 4 분할 3/3 마지막 (시리즈 종결 마일스톤) — PR-H4c FE 50+ page audit overlay + SSE 일괄 (desktop 34 page 회계 12 + 영업/창고/arologis 11 + admin 10 + slip 1 + mobile-staff 12 화면 + admin 10 page = 56 page; 4 신규 도메인 RealtimeClient Accounting/PartnerOrder/DcConfig/Estimate + 2 신규 Inventory/Arologis + 공유 `createRealtimeClient.ts` + `createAuditApi.ts` + `AuditOverlaySection.tsx`; SlipDetailPage 시드 패턴 1:1 entity 보유 page = useQuery+SSE+overlay / list/workflow/read-only = 30s polling + indicator + read-only AuditInfoBanner; 매뉴얼 8 docs 일괄 갱신 + QA sampling 120 case + Playwright snapshot 회귀 가드 + 작동 캡처 5 PNG; 풀빌드 + typecheck PASS, D-P12-04c) |

---

## 디렉토리 ↔ Phase 매트릭스

| 디렉토리                             | Phase 도입 | 현재 상태         |
| ------------------------------------ | ---------- | ----------------- |
| `services/eureka-server`             | 1          | 운영              |
| `services/api-gateway`               | 1          | 운영              |
| `services/auth-service`              | 1          | 운영              |
| `services/logging-service`           | 1          | 운영              |
| `services/user-service`              | 2          | 운영              |
| `services/product-service`           | 2 / 6      | by-code endpoint 추가 (Phase 7 3차) |
| `services/inventory-service`         | 2          | 운영              |
| `services/slip-service`              | 2 / 3 / 6  | M5 `/from-*` endpoint 추가 |
| `services/accounting-service`        | 4          | 운영              |
| `services/partner-auth-service`      | 6          | M2 운영           |
| `services/dc-config-service`         | 6          | M3 운영           |
| `services/partner-order-service`     | 6          | M4 운영           |
| `services/partner-service`           | 9          | W1 skeleton (8095, 거래처 마스터 + M5 partnerCode lookup endpoint, ServiceDiscoveryClient 도입) + W5 findByCodes bulk endpoint (D-P9-16) |
| `services/groupware-service`         | 9          | W2 skeleton (8092, 결재선 chain + 메신저 + 일정 + UserClient, ServiceDiscoveryClient 두 번째 소비자) |
| `services/notification-service`      | 9          | W3 skeleton (8093, 2 entity + 3 channel adapter (FCM/SES/Aligo) + UserClient bulk verify + Caffeine TTL 60s, ServiceDiscoveryClient 세 번째 소비자) |
| `services/dashboard-service`         | 9          | W4 skeleton (8094, 3 entity + 2 materialized view + 4 client + Caffeine KPI cache, ServiceDiscoveryClient 네 번째 소비자) + W5 PartnerCodeResolver.resolveAll bulk 전환 (D-P9-16) |
| `shared/user-client-abstraction`     | 9          | W4 신규 — UserVerifier interface + DefaultUserVerifier impl (Caffeine TTL 60s, W3 backlog #1 채택) |
| `clients/desktop`                    | 2 / 6      | v4                |
| `clients/web/design-system`          | 2          | 21 컴포넌트       |
| `clients/web/order-app`              | 6          | v4 (Vite + 임베드)|
| `clients/web/estimate-app`           | 6          | v2 (Express + EJS)|
| `clients/mobile`                     | 6          | v4 (WebView)      |
| `clients/mobile-staff`               | 6          | v3 (WebView)      |
| `qa/playwright`                      | 7          | 60+ cell          |
| `qa/detox`                           | 7          | 6 시나리오        |
| `infrastructure/cafe24`              | 7          | SSH 테스트만      |
| `infrastructure/render`              | 7          | Blueprint 정의 (1차 estimate-app, autoDeploy false) |
| `shared/discovery-abstraction`       | 8          | ServiceDiscoveryClient wrapper (Eureka default + AWS Cloud Map placeholder), Phase 10 활성 대기 |
| `infrastructure/env-templates`       | 8          | 12/12 service env-template 보유 (10 신규 + 2 갱신, chained-default fallback) |

---

## 참조 문서

- 2026-07-15 #809 / PR #820: 전표·견적 `(거래처+품목)` VAT 포함 최근단가 기억. R3 BE에서
  100품목 POST bulk 조회, `remembered_at` 최신성 guard, 최대 100라인 set-based upsert,
  fail-soft 전용 timeout/계측/Prometheus 경보를 보강했다. 주문은 범위 밖이다.
  세트 계보는 **`lineId` 왕복 계약**(`34f978ec9`)으로 보존하며, 계보 보유 문서의 PUT 에서 `lineId`
  미전송은 **400** 이다(D-R8-6 — 미전송 시 계보 전량 파괴를 라이브 실증). 세트 구성품의 **품목을
  교체하면 계보를 승계하지 않는다**(D-R8-8). `BUNDLE_SET` 기억은 **세트 선택 시점에만 정의**된다
  (D-R8-5). 가격기억은 **전용 DataSource pool** 로 격리해 4초 fail-soft 예산이 전표 저장 경로(전역
  30초)를 오염시키지 않는다(D-R8-2). 상세: `docs/specs/809-slip-estimate-recent-manual-price-spec.md`.

- 누적 결정: `migration/decisions/DECISIONS.md`
- Phase 6 회고: `docs/dev-reports/phase6-retrospective.md`
- Phase 7 진입 평가: `docs/migration/phase7/M-PHASE-7-readiness.md`
- Phase 7 회고: `docs/dev-reports/phase7-retrospective.md`
- estimate-app 호스팅 결정: `docs/migration/phase7/M-ESTIMATE-APP-hosting-decision.md`
- Phase 8 readiness plan: `docs/migration/phase8/M-PHASE-8-readiness.md`
- AWS 호환성 가드: `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md`
- 환경변수 표준: `docs/migration/phase8/M-ENV-STANDARDIZATION.md`
- Phase 8 1차 dev report: `docs/dev-reports/phase8-step-1-aws-readiness.md`
- Phase 8 2차 dev report: `docs/dev-reports/phase8-step-2-discovery-secrets.md`
- Phase 8 3차 dev report: `docs/dev-reports/phase8-step-3-completion-phase-9-readiness.md`
- Phase 8 회고: `docs/dev-reports/phase8-retrospective.md`
- Phase 9 진입 plan: `docs/migration/phase9/M-PHASE-9-readiness.md`
- Phase 9 1차 dev report: `docs/dev-reports/phase9-step-1-partner-service.md`
- Phase 9 2차 dev report: `docs/dev-reports/phase9-step-2-groupware-service.md`
- Phase 9 3차 dev report: `docs/dev-reports/phase9-step-3-notification-service.md`
- Phase 9 4차 dev report: `docs/dev-reports/phase9-step-4-dashboard-service.md`
- Phase 9 4차 PR template color reference: `docs/templates/PR-template-color-reference.md`
- Phase 9 5차 dev report: `docs/dev-reports/phase9-step-5-retrospective.md`
- Phase 9 회고 보고서: `docs/dev-reports/phase9-retrospective.md`
- MIG-14 admin UI 4 화면 dev report: `docs/dev-reports/mig-14-admin-ui-4-screens.md`
- MIG-17 Designer 동기화 dev report: `docs/dev-reports/mig-17-designer-tokens-sync.md`
- MIG-19 cutover 운영 가이드: `docs/migration/ECOUNT-CUTOVER-GUIDE.md`
- MIG-19 dev report: `docs/dev-reports/mig-19-cutover-guide.md`
- MIG-20 raw 자동 재import dev report: `docs/dev-reports/mig-20-scheduled-reimport.md`
- MIG-21 migration ops dashboard dev report: `docs/dev-reports/mig-21-migration-ops-dashboard.md`
- Phase 10 진입 plan: `docs/migration/phase10/M-PHASE-10-readiness.md`
- Phase 10 dry-run plan: `docs/migration/phase10/M-AWS-MIGRATION-DRY-RUN.md`
- 본 문서 갱신 보고: `docs/dev-reports/docs-roadmap-update.md`
