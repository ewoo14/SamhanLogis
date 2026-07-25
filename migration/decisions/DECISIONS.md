# SamhanLogis Migration Decisions

본 문서는 legacy → SamhanLogis MSA 마이그레이션 과정에서 내려진 누적 결정 (decision log) 을 시간순으로 기록한다. 각 항목은 결정의 사실, 근거, 영향 범위만 기재한다.

---

## 좌측 메뉴 5대분류 + 접기/펼치기 (2026-06-11, PR #462)

**배경**: 개발책임자 지시 ([[project_item_exposure_and_menu_5cat]] §2 + 2-보강, 2026-06-10) — 좌측 메뉴를 5대분류 + 배차/창고운영 별도(실질 7그룹)로 재편, 홈 최상단 신규, 권한 있는 메뉴만 노출(기성 보존). 추가 요구로 하위 메뉴 접기/펼치기 도입. spec `docs/superpowers/specs/2026-06-11-desktop-menu-5category-spec.md`. dev-report `docs/dev-reports/2026-06-11-desktop-menu-5category.md`.

| 결정 코드 | 내용 |
|---|---|
| D-M5C-01 | 좌측 메뉴 IA = **상단 고정 2(홈·알림 내역) + 7 그룹**(① 판매 ② 구매 ③ 회계 ④ 그룹웨어 ⑤ 인사 ⑥ 배차(arologis) ⑦ 창고 운영). top-level 이동(창고관리→⑦, 판매관리→①, 구매관리/영수증OCR/재고이동→②, 링크발송→④, 배차→⑥) + 매출 마감 회계 단일화 + 품목 관리/시트 동기화 → ① 판매. **본 슬라이스 = IA 재배치(컴포넌트 이동·그룹핑·라벨)만** — 라우트·page-code·권한 로직 무변경. 그룹 헤더 노출은 기성 `dynamicCanAccess`(SP-D1~D4 동적 RBAC) 단일 소스 기반(그룹 자식 권한 1개라도 true면 헤더+자식 노출, 전무 시 완전 미렌더). '홈' 라벨은 기존 '대시보드' 리라벨, 배차 그룹 라벨은 코드명 `arologis`→업무 라벨 '배차'. |
| D-M5C-02 | 하위 메뉴 **접기/펼치기 기본 = 접힘**(과도 메뉴 최소화). `SidebarCategory` 헤더를 토글 버튼으로 일반화하고, 활성 라우트가 속한 그룹만 `useEffect(activeByRoute)` 로 자동 펼침, 사용자 토글 상태는 `localStorage['samhan.sidebar.group.<label>']` 영속(접근 차단 환경 try/catch 세션 내 폴백). 접근성 = `role=heading`/`aria-level=2` + `aria-expanded`/`aria-controls` + `role=group`/`aria-labelledby`. 회계 관리자 중첩 토글은 유지. |
| D-M5C-03 | **단톡방 매핑 = 그룹웨어 단일 노출로 통일**. 기존 인사 셸(AdminLayout, MASTER 전용 `admin-nav-chat-rooms`)과 AppLayout 그룹웨어 양쪽 중복을 제거하고 그룹웨어 단일 경로로 확정한다(`show={showChatRoomAdmin}`, MASTER 포함). 라우트(`/admin/chat-rooms`)·권한 가드(`messenger.admin`)는 그대로 유지(인사 사이드바 7→6 entry). |
| D-M5C-04 | **주문서 승인(`/sales/order-approvals`) 권한 게이트 = page-code `sales.partner-order.list`** 로 FE·BE 일원화. 가드 전에는 controller 에 `@RequirePermission` 전무(fail-open) → 해당 권한 없는 인증 직원(WAREHOUSE/DISPATCH/INVENTORY 등)이 URL 직접 진입으로 거래처 승인변경·비밀번호 강제초기화가 가능했다. ① FE 라우트 `PermissionGuard(sales.partner-order.list, view)`(사이드바 노출 `showPartnerOrderList` 와 동일 page-code). ② BE `PartnerApprovalsController` 3 endpoint `@RequirePermission`(목록 VIEW / 상태변경 PATCH·비번초기화 POST UPDATE, `partnerSelfService` 미지정 → 거래처 본인 deny). partner-auth-service 에 `:shared:security` 의존 신설 + `DynamicPermissionClientConfig` 명시 bean(본 서비스에 `loadBalancedRestClientBuilder` bean 부재 → autoconfig @ConditionalOnBean 비활성 → bean 부재 시 aspect fail-secure 로 **정상 영업직원 lockout** — base URL 기반 bean 등록으로 차단) + `samhan.auth-service.url`/`app.security.internal.token` config. enforcement IT(`@WebMvcTest`, grant→!403·deny→403+counter·MASTER bypass·PARTNER deny, [[feedback_enforcement_real_http_test]] 실 HTTP 회귀, `DynamicPermissionClient` @MockBean 격리). |
| D-M5C-05 | **AROLOGIS = 완료 배차 내역뷰는 별도 슬라이스로 분리**한다. 본 슬라이스의 desktop ⑥ 배차 그룹은 Samhan Public 배차담당자용 배차 메뉴(`/dispatch-board`)·수동 배차·ops·SMS 등 기존 화면의 IA 재배치만 포함하며, arologis 운영 단위의 완료 배차 내역(read-only 뷰어)은 본 PR 범위 밖(후속 슬라이스). |
| D-M5C-06 | **view-only 계정 변경 액션 차단 = FE canAccess 게이트 전수 적용**(결함-계열 폴드인, 2026-06-11 사이클3). #6 주문서 승인(`SalesOrderApprovalsPage`)이 추가한 패턴과 동형으로, route=VIEW 가드인데 변경 액션이 BE `@RequirePermission(UPDATE/CREATE/DELETE)` 인 6 FE 화면(SlipEditRequests·AccountingEditRequests·DispatchBoard·ChatRooms·AligoAddressBook·DispatchSms)에 `canAccess(<BE page-code>,<action>)` 변경 게이트(버튼 disabled + 핸들러 early-return)를 추가한다. BE 가 서버단 403 으로 이미 enforce(보안홀 아님) — FE 방어심층 UX 정합(시드는 view+update 동반이라 현재 view-only 미발생, 권한 매트릭스 UI 의 명시 view-only 부여 시에만 노출). page-code·action 은 BE grep 실측 1:1(테마틱 금지), mock 신규 seed 0(`?mockPerms=` override 테스트), 신규 박제 12 케이스. cross-check 가 게이트 revert→테스트 FAIL 로 non-vacuous 실증. [[feedback_defect_family_sweep_fix]] 전수 sweep. |
| D-M5C-07 | **partner-auth-service = shared:security InternalTokenFilter 명시 배선 표준 채택**(사이클2 재리뷰). 13 service 표준대로 `SecurityConfig` 에 `InternalTokenFilter`(addFilterBefore) + `HeaderAuthenticationFilter`(addFilterAfter) 2단 체인 명시 배선(전수 14/14 정합). internal-token dev 기본값을 `dev-internal-token-change-me`(auth-service default·`InternalTokenGuard.DEV_DEFAULT`·docker-compose 3중 정합)로 통일 — 구 값 `dev-only-token-replace` 는 ① env 미주입 로컬부팅 권한조회 401, ② prod 부팅 차단가드 무력화(DEV_DEFAULT 불일치)의 결함이었다. |

영향: clients/desktop `AppLayout.tsx`(7그룹 IA + SidebarCategory 토글화)·`AdminLayout.tsx`(단톡방 단일화)·`routes/index.tsx`(주문서 승인 가드), partner-auth-service `PartnerApprovalsController`/`DynamicPermissionClientConfig`(신규)/`build.gradle`(:shared:security)/`application.yml` + 신규 enforcement IT. 라우트·page-code·권한 시드 무변경. 4-라운드 다모델 리뷰(Opus 5확정 + Codex 7확정 + Fable5 14확정 — Fable5 가 CI-RED 2·보안 1 적발) + Docker 실서버 QA 13컷(`docs/qa/menu-5category/`). desktop mock 468 pass·partner-auth IT 13/13.

---

## 품목관리 고도화 결정 (2026-06-11, PR #461)

**배경**: 개발책임자 지시 — 구글 시트를 "최초 시드 데이터고 추후 조회하지 않는다"로 격하하고, 세트(BUNDLE) 가시화 + 구성품 직접 편집 + 표시 순서 직접 조정 + 품목 설정 실시간 동기화 + 세트 재고 표시 금지를 요구. spec `docs/superpowers/specs/2026-06-11-product-catalog-enhance-spec.md`.

| 결정 코드 | 내용 |
|---|---|
| D-PCE-01 | 구성품/표시순서 서비스의 모든 비즈니스 오류는 `BusinessException(ErrorCode)` 로 통일한다(`ResponseStatusException` 금지). `GlobalExceptionHandler` 가 `ErrorCode.httpStatus` 를 그대로 반환하므로 BUNDLE 아님=409 / 검증 실패=400 매핑이 보장된다. 실 QA 가 ResponseStatusException 의 상태 불일치를 적발하여 확정. |
| D-PCE-02 | 표시 순서 일괄 갱신(`PUT /api/v1/products/display-orders`)의 카테고리 동일 검증 축은 **`estimateCategory`** 로 둔다(FE 카탈로그 카테고리 선택과 동일 축). null 군은 null끼리 허용, null+non-null 혼합 및 서로 다른 non-null 혼합은 400. 자동 재번호 범위 = 동일 카테고리 품목군(전역 재번호 금지). display_order 충돌은 `findExposedCatalog` 의 `modelCode ASC` 타이브레이커로 결정적 해소. ※ `findExposedCatalog` 의 실 정렬/WHERE 축은 `ProductCategory`(별개 enum)이라 '동일 차원'은 아니며, 시트 적재분은 productCategory↔estimateCategory 1:1 이나 `markUsageManual` override 시 desync 가능(허위 '동일 차원' 문구 제거 — G fix). |
| D-PCE-03 | 구성품 명칭 read 해소(`listComponents`)는 1차 `model_code` IN → 미매칭분 `model_name` IN 2차 fallback 으로 표시 명칭을 채운다(레거시 `model_code=NULL` 행 표시 해소용). 단 구성품 **저장**(replaceComponents) 검증 축은 `model_code`-only(`findByModelCodeAndIsDeletedFalse`)로 두어 전개(expander) 해소 기준과 정렬한다 — model_name fallback 으로 저장하면 전표/견적 전개에서 단가 0·productId null 로 silent 방출되어 금액 오류가 발생하므로 write-path 와 expander 해소 축을 일치시킨다(A fix). |
| D-PCE-04 | 구글 시트 자동 sync 를 **시드 전용**으로 격하한다. `ProductSheetSyncScheduler` 의 cron + 부팅 sync 모두 `samhan.product.sheet-sync.cron-enabled`(기본 **false**) 게이트로 비활성한다(재시작·주기 sync 로 사용자 표시순서가 시트 기준 재적재되어 소실되는 것 방지). 시드 재적재는 비상 수단인 수동 trigger(`POST /api/v1/products/admin/sync`)만 사용하며 게이트와 무관하게 항시 유효하다. 따라서 sync displayOrder 보존 가드는 불요(비상 재적재 시 시트 기준 재시드가 의도 동작). |
| D-PCE-05 | 품목 설정 실시간 동기화는 전표 SSE 패턴을 재사용한다. 기성 `ProductRealtimeBroker`(shared realtime, SP-D7) + 신규 단일 게이트웨이 `ProductCatalogChangePublisher` 로 usage PATCH/DELETE·components PUT·display-orders PUT 의 publish 를 **`afterCommit` 으로 통일**(활성 트랜잭션 없으면 즉시 fallback)하여 롤백 시 헛이벤트를 제거한다. 채널 = well-known 내부 UUID `…0001`(카탈로그 목록 전체 invalidate), 이벤트 = `product:catalog:changed`. FE `ProductRealtimeClient` 가 `GET /api/v1/products/catalog-realtime`(products.list VIEW) 구독 → react-query invalidate. '모든 설정 화면' 전사 일반화는 본 슬라이스에서 패턴 확립 후 별도 슬라이스로 수평 전개(후속). |
| D-PCE-06 | 세트(BUNDLE)는 재고 수치를 표시하지 않는다 — 재고는 구성품(시리얼) 단위에만 존재. ① 품목관리 화면에는 재고 컬럼 자체 부재. ② SlipFormPage·SalesPartnerOrderDetailPage 재고조회 모달은 BUNDLE 라인을 제외 후 전달(전부 세트면 "세트 품목 — 재고는 구성품 단위" 안내, 혼합 선택이면 "세트 N건 제외" 캡션). ③ SlipDetailPage 는 신규 전표가 `addSlipLinesExpanded` 로 BUNDLE 을 구성품 라인으로 전개 저장하여 BUNDLE 부모 라인이 남지 않으므로 가드 불필요(가짜 가드 금지 — 5d3bb017 판정). |
| D-PCE-07 | 주문 상세의 라인 productType(SINGLE/BUNDLE) enrich(#23 세트 재고 가드 데이터원)는 신규 DB 컬럼 없이 조회 시점에 부착한다. direct PUT 라인이 synthetic stableProductId 를 저장할 수 있어 productId 가 아니라 라인 modelCode snapshot 으로 조회한다 — partner-order `ProductClient.lookupByModelCodes` → product-service `POST /products/internal/lookup-by-model-codes`. product-service 조회 실패 시 **fail-soft**(전 라인 productType=null, 상세 조회 가용성 우선, productClient 회로 차단기 정책과 일관). FE 수정 PUT 후에는 GET 재조회(invalidate)로 enrich 필드를 보정한다. |

영향: product-service V15(`bundle_component.display_order` + 부분 인덱스, `ix_bc_bundle` DROP), 신규 endpoint 6종(GET·PUT `/products/{code}/components`, PUT `/products/display-orders`, GET `/products/catalog-realtime`, POST `/products/internal/lookup-by-model-codes`, GET `/products` 응답 확장), api-gateway 라우트 3종(`product-components-v1`/`product-display-orders-v1`/`product-catalog-realtime-v1`), partner-order `ProductSummary` 필드 확장 + 상세 enrich, slip `SlipLineResponse` setHead/parentSetModel 노출, desktop ProductCatalogPage 전면 개편 + 세트 재고 가드 3화면. 4-라운드 다모델 리뷰(사이클1 통합 + Opus 16 + Fable5 + Codex 8) + Docker 실서버 QA 12컷.

---

## Phase 2.6a 주문→출고전표 부분전환 인프라 결정 (2026-05-30)

**배경**: 거래처 주문서를 출고전표로 전환하는 기존 경로(confirm 자동 1:1 발행)가 부분 전환을 지원하지 않았다. 품목별 부분전환 + 라인 단위 잔여수량 추적 신규 구현.

| 결정 코드 | 내용 |
|---|---|
| D-2.6a-01 | 전환 대상 = `status ∈ {DRAFT, ON_HOLD}` 화이트리스트로 한정. CONFIRMED(PENDING_RETRY 포함)/CONVERTED/CONFIRMING/CANCELED 는 전환 불가(이중 출고전표 방지). |
| D-2.6a-02 | `partner_order_lines.converted_quantity INT NOT NULL DEFAULT 0` V8 migration. `CHECK (0 ≤ converted_quantity ≤ quantity)` DB 레벨 안전망 추가. |
| D-2.6a-03 | `slip_lines.source_order_line_id UUID` nullable 컬럼 V29 migration(slip-service). 비 부분전환 경로는 null 유지 — 레거시 호환. |
| D-2.6a-04 | idempotencyKey 에 `convertedBefore` 스냅샷 포함(`PO-CONV-{orderId}-{SHA-256[:16]}`). 같은 라인 같은 수량 2회 요청 시 다른 키 생성 → 정상 2회 부분전환 허용. 동일 트랜잭션 재시도 시 동일 키 → 409-dup → 안전. |
| D-2.6a-05 | 트랜잭션 경계: 사전검증 → slip 발행(외부 REST) → **발행 성공 후에만** `convert()` 호출 → saveAndFlush. 발행 후 saveAndFlush 실패 시 slip 발행됐으나 converted_quantity 롤백되는 드문 상황은 2.6c outbox 통합 전까지 수동 복구 대상(운영 경고). |
| D-2.6a-06 | 배포 순서 필수: auth(V41) → slip(V29) → partner-order(V8). 역순 시 권한 403 또는 slip 500 발생. |
| D-2.6a-07 | inventory 미차감 = 2.6c 범위로 분리. 본 슬라이스의 부분전환 출고전표는 재고 차감 없음 — 과다출고 위험 있으므로 운영 시 수동 출고 처리 필요. |
| D-2.6a-08 | confirm 자동 1:1 발행 경로(outbox 패턴) 는 변경하지 않음. 병합 + confirm 폐지는 2.6b 범위. |

영향: partner-order-service V8, slip-service V29, auth-service V41, CONVERTED status 신규 enum.

---

## SP-08-5 매입 CRUD + 입고 검수 CTA parity 결정 (2026-05-17)

**배경**: SP-08-4 주문 CRUD parity가 PR #216~#219로 완료된 뒤, legacy GAS 구매/매입 시트의 CRUD 및 입고 검수 CTA 흐름을 `slip-service`와 `inventory-service`에 잠그기 위해 SP-08-5를 시작한다. SP-03에서 복구한 구매관리 검수 CTA 권한/표시 정책은 회귀 금지 대상이다.

| 결정 | 내용 |
|---|---|
| SP-08-5-01 | 매입/구매전표는 별도 `PurchaseSlip` entity를 만들지 않고 `slip-service` `Slip(type=INBOUND)`를 사용한다. |
| SP-08-5-02 | R1 매입 목록은 gateway 기준 `GET /api/v1/slips?type=INBOUND&from=&to=&page=&size=`로 잠근다. service 내부 path는 `/slips`이며 기존 `slipType=INBOUND`와 legacy alias `type=INBOUND`를 모두 수용한다. |
| SP-08-5-03 | R1 목록 기본 정렬은 `slipDate DESC, seqNo DESC`로 둔다. legacy 문서의 `receivedAt DESC` 의미는 현재 전표 도메인에서는 전표일자 최신순으로 해석한다. |
| SP-08-5-04 | R1/R2 매입 조회 권한은 SP-03 검수 CTA와 동일하게 `WAREHOUSE / MANAGER / MASTER`만 허용한다. `INVENTORY`는 구매관리 검수 CTA 표면에서 제외하므로 매입 R1/R2에서도 403으로 잠근다. |
| SP-08-5-05 | R2 매입 상세는 `GET /api/v1/slips/{id}` 기존 상세 응답을 사용하되 INBOUND 전표에 `inspectionStatus`를 포함한다. `SAVED / CONFIRMED`는 `READY`, 그 외는 `NOT_READY`다. |
| SP-08-5-06 | SP-08-5 모든 슬라이스는 SP-03 `PurchaseQueryPage` 검수 CTA, UUID 비공개, 한국어 운영 문구, `@MockBean` 외부 client 격리, N=3 + 5회차 review/fix 워크플로우를 적용한다. |

## SP-08-4 주문 CRUD parity 결정 (2026-05-17)

### D-SP084-04. 주문 인쇄 양식은 BE HTML 직접 응답으로 고정

- `GET /api/v1/partner-orders/{id}/print`는 `text/html;charset=UTF-8`을 직접 반환한다.
- HTML은 A4(`210mm x 297mm`)와 `@media print`, Pretendard 우선 폰트, 거래처/주문/품목/합계/날인란을 포함한다.
- desktop 상세 화면은 별도 렌더 route 대신 새 탭으로 BE HTML을 연다.
- `PARTNER`는 `X-Partner-Code`와 주문 `partnerCode`가 일치할 때만 인쇄 가능하며, 타 거래처 주문은 403이다.

근거: P1 주문 인쇄는 FE snapshot route보다 BE template을 두는 편이 legacy GAS 출력 tab 대체와 브라우저 인쇄 진입이 단순하다.

영향: 후속 SP-08-4-5 통합 PR에서는 Edge/사용자 캡처 기반 print 디자인 iteration만 이어가면 된다.

---

## Phase 6 마무리 결정 (2026-05-05)

### D-P6-01. Phase 6 backend 4 슬라이스 + product-service google sheets sync 완료

- M2 partner-auth-service (PR #72 + GG fix `97ca8da` 합류)
- M3 dc-config-service (PR #71 close → 통합 PR #76 합류)
- M4 partner-order-service (PR #74 close + CI fail fix → 통합 PR #76 합류)
- M5 slip-service `/from-*` endpoint (통합 PR #76 첫 발행)
- product-service google sheets sync (PR #68 + #75 정정)

영향: backend 슬라이스 4건 + product-service 동기화가 origin/main 에 반영. 14 backend MSA 중 5개 슬라이스가 실제 코드 단계 진입.

### D-P6-02. client mock fallback 일괄 제거 (PR #79)

- `USE_MOCK_FALLBACK` 환경변수 폐기 (estimate-app v2)
- `samhanApi.ts` / `code.js` / `slip-bridge.js` 의 silent fallback 분기 제거
- 영구 보존 항목: dev-only `desktop/src/renderer/api/mock.ts` (`VITE_MOCK_MODE=1` 빌드 시점 분기), audit logger silent `.catch`, jest 테스트 stub

근거: silent fallback 은 endpoint 회귀 시점을 가려 잘못된 데이터로 흐름이 진행되는 위험이 있음. A 옵션 (완전 폐기) 채택.

영향: client → 실 backend 호출 전환. backend 미가동 환경에서는 RPC 5xx/네트워크 오류로 명확하게 실패.

### D-P6-03. PR 발행 정책 — 통합 발행 채택

- 단편 PR 발행 회피 (PR #66 close 후속 결정)
- 단독 발행 회피 (PR #71 / #74 / #77 / #78 / #79 의 단독 발행 후 통합 재구성 발생)
- 통합 PR 의 historic commit 도 GitGuardian 검사 대상 → `git merge --squash` x N (sub 별 단일 commit) 권장 (PR #76 1차 발행 후속 결정)

영향: 후속 슬라이스부터 단일 통합 PR 으로 발행. 단독 발행 시 close + 통합 재구성.

### D-P6-04. 카페24 SSH 배포 보류 (Phase 6 범위에서 제외)

- `.github/workflows/deploy-cafe24-ssh.yml.template` 활성 X (PR #77)
- D6/D7/D8 (배포 대상 / 디렉토리 / pm2 명명) 답변 Phase 7 위임

영향: Phase 6 동안 카페24 환경은 테스트만 진행, 실 배포는 Phase 7 호스팅 결정 후 활성.

### D-P6-05. estimate-app v2 호스팅 결정 Phase 7 위임

- estimate-app v2 (Express SSR + EJS) 는 Cloudflare Pages 정적 호스팅 기술적 불가
- 3안 비교 (A Cloudflare Workers / B Render.com / C 카페24 SSH) → `docs/migration/phase7/M-ESTIMATE-APP-hosting-decision.md` 에 정리
- Phase 7 진입 전 호스팅 옵션 1건 확정 필요

영향: Phase 6 종료 시점 estimate-app v2 production URL (`estimate.samhan-air.com`) 미가동.

### D-P6-06. legacy-v2 (이카운트/노션 살린 버전) 분리

- PR #67 머지 후 PR #70 revert
- legacy-v2 변종은 SamhanLogis 범위에서 제외, 별도 프로젝트로 이전

영향: SamhanLogis 의 client 5개 (order-app v4 / Desktop v4 / Mobile v4 / mobile-staff v3 / estimate-app v2) 는 모두 SamhanLogis 자체 stack (Vite + React 또는 Express + EJS) 으로 통일.

---

## Phase 7 진행 결정 (2026-05-06)

### D-P7-01. PR 발행 가드 — 통합 PR 의무

- TM 종합 dev report + reviewer 5 토론 (BE / FE / Designer / QA / DevOps) + TM/PM 승인 의무
- 단편 PR 발행 회피 (Phase 6 PR #66 / #71 / #74 / #77 / #78 / #79 close 회고 후속)
- 단독 PR 발행 회피 — TM 자체 1 통합 PR 으로 발행
- 통합 PR 의 historic commit 도 GitGuardian 검사 대상 → `git merge --squash` x N (sub 별 단일 commit) 권장

영향: Phase 7 1차 ~ 3차 모두 단일 통합 PR 으로 발행 (PR #81 / #82 / #83). 본 docs 통합 PR 도 동일 패턴.

### D-P7-02. legacy-v2 폐기 확정

- D-P6-06 (legacy-v2 분리) 의 보강
- legacy-v2 (이카운트 / 노션 살린 변종) 는 SamhanLogis 범위에서 영구 제외
- 별 프로젝트로 이전, SamhanLogis 저장소 / docs 에서 후속 언급 X

영향: legacy-v2 관련 코드 / 문서 / branch 가 SamhanLogis 에 잔존하지 않는다.

### D-P7-03. 카페24 SSH 배포 보류 — 테스트만 진행

- `infrastructure/cafe24/test-ssh-connection.sh` (SSH 인증 + 자원 + 도구 dry-run) 만 사용
- `.github/workflows/deploy-cafe24-ssh.yml.template` 의 `.template` suffix 보존 (workflow 비활성)
- D6 (배포 대상) / D7 (디렉토리) / D8 (pm2 명명) 답변 + 활성화 결정 후 활성

영향: Phase 7 동안 카페24 환경은 SSH 연결 검증만 수행, 실 배포는 D6/D7/D8 답변 후속에 위임.

### D-P7-04. estimate-app v2 호스팅 = Render Starter

- `docs/migration/phase7/M-ESTIMATE-APP-hosting-decision.md` 의 3안 비교 (A Cloudflare Workers / B Render / C 카페24 SSH) → **B 옵션 채택**
- Render Starter $7/mo (always-on, 512MB RAM)
- Blueprint: `infrastructure/render/render.yaml` (estimate-app 활성, order-app autoDeploy false 미러)
- 절차: `infrastructure/render/deploy-checklist.md`
- DNS: 카페24 또는 Cloudflare DNS → CNAME `quote.samhan-air.com` → `samhan-estimate-app.onrender.com`

영향: estimate-app v2 production cutover 가 Render dashboard "Manual Deploy" 또는 GitHub Actions workflow_dispatch 로 진행 가능. 1차 estimate-app 만 활성, order-app 은 Cloudflare Pages 가 owner.

### D-P7-05. 14 backend MSA Phase 8 별도 호스팅 결정 위임

- `docs/migration/phase7/M-PHASE-7-readiness.md` § 4 의 X1 ~ X4 옵션 (D9 미결)
- Phase 7 동안 backend 는 staging stack (로컬 Docker Compose) 만 가동
- production cutover 는 Phase 8 진입 + D9 답변 후 진행
- Render 의 `SAMHAN_API_BASE_URL` 실 값은 D9 답변 후 확정

영향: Phase 7 6차 (Render production cutover) 시점에는 estimate-app 이 정적 + Google Sheets 직접 연동만 동작. backend 호출 endpoint 는 D9 답변 후 추가.

---

## Phase 7 완료 + Phase 8 진입 결정 (2026-05-05)

### D-P7-06. Phase 7 6차 production cutover 보류

- estimate-app v2 의 Render production cutover 는 D9 (14 backend MSA 호스팅 옵션) 답변에 의존
- D9 답변 X 시 estimate-app 만 단독 cutover 시 backend 호출 endpoint 가 미가동 → 정적 + Google Sheets 직접 연동만 동작
- Phase 8 진입 후 D9 답변과 함께 일관 cutover

영향: Phase 7 6차 production cutover = Phase 8 4주차 (DNS cutover) 작업으로 위임.

### D-P7-07. 후속 PR 4건 본 PR 통합 발행

- DevOps 후속 3건 (self-host font + helmet+CSP + desktop CSP) + QA 후속 1건 (visual baseline `document.fonts.ready` 가드)
- 단편 PR 4건 발행 회피 (D-P7-01 가드 일관 적용)
- 본 PR = Phase 7 회고 + Phase 8 진입 plan + DECISIONS Phase 7 마무리 + Phase 8 진입 항목까지 통합

영향: Phase 7 마무리 작업 = 1 통합 PR 으로 일관. Phase 8 진입 plan 도 동일 PR 에 첨부.

### D-P8-01. Phase 8 진입 조건

- 필수 — D9 답변 (14 backend MSA 호스팅 옵션 X1 ~ X4 중 1택)
- (X1 옵션 시) 추가 — D6/D7/D8 답변 (카페24 SSH 활성)
- 선택 — 카페24 plan 업그레이드 X 가정 시 X2 (Hetzner) / X3 (AWS) / X4 (하이브리드) 중 1택으로 진행 가능

영향: D9 답변만으로 Phase 8 진입 가능. D6/D7/D8 은 X1 옵션 채택 시에 한해 필수.

### D-P8-02. Phase 8 plan 위치

- `docs/migration/phase8/M-PHASE-8-readiness.md`
- W1 ~ W5 5주 plan + 8 작업 분해 + 호스팅 옵션 비교 + DNS cutover 8 서브도메인 매핑

영향: Phase 8 작업 시작 시 본 plan 을 reference 로 사용. 8 작업 모두 Phase 8 슬라이스의 input.

---

## Phase 8 진입 결정 (2026-05-05)

### D-P8-03. 호스팅 = AWS (EC2 + RDS) 향후 예정 (Phase 10 cutover 시점)

- 14 backend MSA 운영 호스팅 = AWS (EC2 + RDS) 채택
- D9 미결 항목 (X1 카페24 / X2 Hetzner / X3 AWS / X4 하이브리드) 중 X3 AWS 옵션 확정
- cutover 시점 = Phase 10 (모든 개발 완료 후)
- 현재 시점 = AWS 리소스 생성 X, account 발급 X, terraform 코드 생성 X

영향: Phase 8 ~ 9 동안 AWS 호환성 유지가 의무. Phase 10 진입 시 RDS / EC2 / S3 / Route 53 일괄 cutover 진행.

### D-P8-04. 현재 = 테스트 단계, 카페24 + Cloudflare + Render 그대로 유지

- 모든 개발 진행 동안 (Phase 8 ~ 9) 현재 인프라 그대로
- 카페24 SSH (D6/D7/D8 답변 후 활성), Cloudflare Pages (order-app), Render (estimate-app) 보존
- production cutover X = AWS 마이그레이션 시점에 일괄 진행

영향: 현재 단계의 호스팅 결정 (Phase 7 D-P7-04 Render 채택 등) 그대로 유지. AWS 마이그레이션은 코드 변경 X, infra 변경만으로 진행.

### D-P8-05. AWS 마이그레이션 가능성을 열어두는 호환성 가드 검증 의무

- 12-factor app 준수 (모든 service)
- 환경변수 추상화 (`${ENV:default}` 패턴 의무)
- PostgreSQL standard SQL (RDS PostgreSQL 16 호환, RDS 미지원 extension 부재)
- AWS 서비스 매핑 표 보유 (`docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md`)
- vendor lock-in 회피 (Cloudflare Workers / Render-specific feature 의존 X, S3 SDK 사용 시 endpoint override 패턴)

영향: 모든 후속 슬라이스 (Phase 8 2차 ~ Phase 9) 에서 본 가드 일관 적용. 위반 시 PR 단계 reviewer 가드.

### D-P8-06. Phase 8 1차 = AWS 호환성 가드 plan + 검증 (본 PR)

- 산출물 5건 = AWS 호환성 가드 plan + 환경변수 표준 + ROADMAP 갱신 + DECISIONS 갱신 + dev-report
- 코드 변경 0 file (docs only)
- 12-factor 검증 결과 = 12/12 OK (IX 만 Phase 10 개선 항목 1건 = `server.shutdown=graceful`)
- standard SQL 검증 결과 = 22 file Flyway migration 모두 RDS 호환
- 환경변수 추상화 검증 결과 = 12 service 모두 OK, 통일 권장 3건 (`INTERNAL_TOKEN` / `<NAME>_HOST` / `.env.example`) 은 Phase 9 위임

영향: Phase 8 1차 머지 후 2차 (Eureka cluster prod) 진입 가능. AWS 마이그레이션 dry-run plan 은 Phase 8 3차 또는 Phase 10 진입 시점에 작성.

---

## Phase 8 2차 결정 (2026-05-06)

### D-P8-07. ServiceDiscoveryClient interface 도입 (Eureka default + AWS Cloud Map placeholder)

- 신규 모듈 `shared:discovery-abstraction` (Java library, Spring Boot 미적용)
- 인터페이스 = `ServiceDiscoveryClient` (4 operation: register / deregister / lookup / healthcheck)
- impl = `EurekaServiceDiscoveryClient` (현재 운영 Eureka, `EurekaClient` wrapper) + `AwsCloudMapServiceDiscoveryClient` (placeholder, `UnsupportedOperationException("Phase 10 cutover 시점 구현")`)
- impl 토글 = `@ConditionalOnProperty(name = "samhan.discovery.provider", havingValue = "eureka", matchIfMissing = true)`
- Eureka bean = `@ConditionalOnClass(EurekaClient)` 로 소비자가 명시 의존성 추가 시점에만 활성
- 14 service 의존성 추가는 Phase 10 cutover 시점 위임 (본 PR = wrapper 신규 + 단위 테스트만)

근거: Phase 8 1차 doc 의 "Eureka 자체 EC2 운영 권장 → wrapper 불필요" 결정과 별개로,
호환성 가드 차원에서 vendor 추상화 layer 를 미리 보유. 14 service 의존성 추가 시점은
Phase 10 cutover 결정에 따름.

영향: 신규 모듈 1개 (`shared:discovery-abstraction`), settings.gradle / build.gradle
leafProjects 에 등록. 기존 14 service 의 build.gradle / yml / Java 코드 모두 변경 X
(Phase 10 cutover 시점에 service 별 의존성 추가 + provider 토글로 활성).

### D-P8-08. 환경변수 표준 `SAMHAN_<SERVICE>_<KEY>` 적용 (chained-default fallback 패턴 = legacy 호환 100%)

- Phase 8 1차 doc 검출 불일치 3건 처리 — `INTERNAL_AUTH_TOKEN` (6) vs `INTERNAL_TOKEN` (1) / `<NAME>_HOST` vs `<NAME>_URL` / `.env.example` 부재
- 표준 = `SAMHAN_INTERNAL_TOKEN` / `SAMHAN_JWT_SECRET` / `SAMHAN_<SERVICE>_SERVICE_URL` (full URL)
- yml 패턴 = chained-default `${SAMHAN_NEW:${LEGACY:default}}` — 신규 표준 우선, legacy fallback 보존
- 영향 yml = 10 file (10/12 service. eureka-server / logging-service 는 적용 대상 변수 부재)
- Java 코드 변경 X — yml level 표준화만, `@ConfigurationProperties` 바인딩 / `InternalTokenGuard` / `InternalAuthProperties` 모두 그대로
- `infrastructure/env-templates/<service>.env` 12/12 service 보유 의무 적용 (10 신규 + 2 갱신)

근거: Phase 8 1차 doc 의 "Phase 9 또는 별도 슬라이스 위임" 표지를 본 슬라이스에서 처리.
chained-default 패턴 = 기존 배포 환경 (`INTERNAL_AUTH_TOKEN` 등 설정된 .env) 호환 100%
보존하면서 신규 표준 도입.

영향: Phase 9 신규 service (partner / groupware / notification / dashboard) 부터 본 표준
의무 적용. Phase 10 cutover 시점에 `spring.config.import: aws-secretsmanager:samhan/<env>/...`
추가로 Secrets Manager 자동 fetch 활성. legacy fallback 폐기 = Phase 11 시점.

### D-P8-09. Secrets Manager rotation = Phase 10 cutover 시점 활성 (본 PR = spec only)

- 신규 doc `docs/migration/phase8/M-SECRETS-ROTATION-spec.md`
- 대상 secrets 7건 (`SAMHAN_DB_PASSWORD` 30일 / `SAMHAN_INTERNAL_TOKEN` 90일 / `SAMHAN_JWT_SECRET` 90일 / `SAMHAN_GOOGLE_SERVICE_ACCOUNT_KEY` manual / `ALIGO_API_KEY` manual / `SAMHAN_SLACK_WEBHOOK_URL` manual / `RABBIT_PASSWORD` 90일)
- lambda 구조 = Python 3.12, IAM `secretsmanager:RotateSecret` + `rds:ModifyDBInstance` + `mq:UpdateUser`
- 4 단계 (createSecret / setSecret / testSecret / finishSecret) Python sample 코드 포함
- service 측 fetch 패턴 = `spring-cloud-aws-starter-secrets-manager` (Phase 10 적용)
- monitoring + alert = CloudWatch alarm (`RotationFailed` / `Errors` / `Throttles` / `Duration`) + Slack webhook
- Phase 10 cutover 6 단계 절차 명시

근거: Phase 8 1차 doc 의 "AWS Secrets Manager 마이그레이션 가능성 (Phase 10)" 표지를
본 슬라이스에서 spec 으로 정착. 실 lambda 코드 + AWS 리소스 생성은 Phase 10 위임.

영향: Phase 10 진입 시 본 spec 따라 lambda 발행 → Secrets Manager rotation 활성. 본
PR 시점은 D-P8-08 의 환경변수 표준 (SAMHAN_*) 만 보유, lambda 코드 X, AWS 리소스 X.

---

## Phase 8 3차 결정 (2026-05-05)

### D-P8-10. Phase 8 3차 = AWS 마이그레이션 dry-run + 회고 + Phase 9 진입 plan (본 PR)

- 산출물 4건 = AWS 마이그레이션 dry-run plan + Phase 8 회고 + Phase 9 진입 plan + dev-report
- 코드 변경 0 file (docs only)
- ROADMAP 갱신 = Phase 8 "진입 준비" → "완료" / Phase 9 "대기" → "진입 준비 완료" / Phase 10 dry-run plan 위치 명시
- DECISIONS 갱신 = D-P8-10 / D-P8-11 + D-P9-01 / D-P9-02

영향: Phase 8 3차 머지 후 Phase 9 진입 가능. Phase 9 1차 (partner-service skeleton) 시점부터
4 신규 service 슬라이스 진행. Phase 10 cutover 는 Phase 9 완료 + AWS account 발급 후.

### D-P8-11. AWS 마이그레이션 dry-run 위치 = `docs/migration/phase10/M-AWS-MIGRATION-DRY-RUN.md`

- phase10/ 디렉토리 신규 생성 (Phase 10 cutover 산출물 위치)
- 14 section 구성 = 개요 / RDS Postgres / S3 endpoint override / Eureka cluster / ALB+WAF / CloudWatch alert / Route 53 / Secrets rotation / ServiceDiscoveryClient 활성 / 부트스트랩 순서 / 점진 cutover / roll-back / dry-run 시나리오 / timeline
- Section 4 = Eureka 자체 EC2 운영 (multi-AZ 2 노드) → AWS Cloud Map wrapper 활성 보류 (Phase 8 2차 결정 보강)
- Section 11 = canary 10% → 50% → 100% 점진 cutover + DNS TTL 60s 사전 단축
- Section 12 = roll-back 트리거 = 5xx > 5% (10분) 또는 p99 > 1s

영향: Phase 10 진입 시 본 dry-run plan 을 reference 로 사용. 14 section 모두 staging
dry-run → canary 10% → full cutover 3단계로 진행. 신규 결정 (예: AWS Cloud Map 활성 시점)
은 Phase 11 또는 운영 부담 임계 도달 시점 결정.

---

## Phase 9 진입 결정 (2026-05-05)

### D-P9-01. Phase 9 4 신규 service 포트 확정 (partner=8095 / groupware=8092 / notification=8093 / dashboard=8094)

- partner-service = 8095 (8088 partner-order-service 와 충돌 회피)
- groupware-service = 8092 (결재선 + 메신저 + 일정)
- notification-service = 8093 (push/email/sms 통합 라우터, Phase 5 SMS Aligo 흡수)
- dashboard-service = 8094 (KPI + 실시간 재고 + 매출 + materialized view)

기존 14 service 포트 cross-check:
- 8080 api-gateway / 8081 auth / 8082 logging / 8083 user / 8084 product / 8085 inventory
- 8086 slip / 8087 accounting / 8088 partner-order / 8089 dc-config / 8091 partner-auth / 8761 eureka

Phase 10 신규: 8096 migration-service (ECount 일괄 이관)

영향: Phase 9 W1 ~ W4 슬라이스 진행 시 본 포트 매핑 일관 적용. 환경변수 표준 = `SAMHAN_PARTNER_SERVICE_URL` / `SAMHAN_GROUPWARE_SERVICE_URL` / `SAMHAN_NOTIFICATION_SERVICE_URL` / `SAMHAN_DASHBOARD_SERVICE_URL`.

### D-P9-02. Phase 9 진입 = Phase 8 완료 + 호환성 가드 검증

- 진입 조건 = Phase 8 (PR #88 / #89 / 본 PR) 머지 + 호환성 가드 12-factor 12/12 OK + 14 service 환경변수 통일
- 진입 plan = `docs/migration/phase9/M-PHASE-9-readiness.md`
- 5주 roadmap = W1 partner / W2 groupware / W3 notification / W4 dashboard / W5 회고 + Phase 10 진입 plan
- 각 service 신규 시 가드 = BaseEntity 7 audit + Soft Delete + IT mockbean 외부 client 격리 + 환경변수 표준 + ServiceDiscoveryClient 도입 (Phase 10 활성 대비) + 한국어 commit + Javadoc + dev-reports

후속 결정 가능 항목 (D-P9 시리즈 추가 가능):
- 4 service 도메인 모델 확정 (W1 ~ W4 진행 시점)
- materialized view 구조 (W4 dashboard-service)
- notification adapter 추상화 (W3)

영향: Phase 9 1차 (partner-service skeleton) 부터 본 가드 일관 적용. Phase 10 cutover 시점에 14 + 4 = 18 service 모두 AWS 마이그 대상.

---

## Phase 9 1차 결정 (2026-05-06)

### D-P9-03. Phase 9 1차 = W1 partner-service skeleton (본 PR)

- 신규 service `services/partner-service` (port 8095, DB `partner_db`) 추가
- 2 entity = `Partner` (거래처 마스터, partnerCode UK + bizNo UK + 신용한도 + 미수금) + `PartnerCreditHistory` (append-only 이력)
- 2 enum = `PartnerStatus` (ACTIVE / SUSPENDED / TERMINATED) + `CreditEventType` (SLIP_ISSUED / PAYMENT / CREDIT_LIMIT_CHANGE)
- 2 controller = `PartnerInternalController` (X-Internal-Token, M5 lookup) + `PartnerAdminController` (X-User-* + @PreAuthorize, CRUD + history)
- 2 service = `PartnerService` (마스터 라이프사이클) + `PartnerCreditService` (한도/잔액 갱신 + history append, 동일 transaction)
- Flyway V1 = `partners` + `partner_credit_history` (BaseEntity 7 audit + Soft Delete + partial unique index `WHERE is_deleted=false`)
- 단위 테스트 1 (`PartnerServiceTest` 8 case) + IT 2 (`PartnerInternalControllerIT` 4 case + `PartnerAdminControllerIT` 5 case)
- self-contained = 외부 client 의존 없음 (M-PHASE-9-readiness §6 의존성 매트릭스 일관)
- 환경변수 표준 = `SAMHAN_PARTNER_DB_*` chained-default (LEGACY_DB_* fallback) + `SAMHAN_INTERNAL_TOKEN` + `SAMHAN_PARTNER_SERVICE_URL` + `SAMHAN_DISCOVERY_PROVIDER`
- `infrastructure/env-templates/partner-service.env` 신규 (CHANGE_ME_LOCAL_ONLY placeholder)
- `services/partner-service/README.md` + `docs/dev-reports/phase9-step-1-partner-service.md` 신규

근거: M-PHASE-9-readiness §3-1 (W1 partner-service) 일정 일관 진행. partner-service 가 self-contained 이므로 외부 service 의존성 가드 (IT @MockBean) 불요 — 신규 service 중 가장 단순한 진입점.

영향: 본 PR 머지 후 Phase 9 W2 (groupware-service) 진입 가능. 14 + 1 = 15 service. settings.gradle / build.gradle leafProjects 양쪽 갱신.

### D-P9-04. M5 slip-service partnerCode → partnerId lookup client 구현 = Phase 9 W5 또는 Phase 10 cutover 시점

- 본 PR scope = partner-service `/internal/partners/{partnerCode}` endpoint 신규만
- slip-service 측 `PartnerClient` 구현 (service URL = `SAMHAN_PARTNER_SERVICE_URL`, X-Internal-Token 헤더 자동 첨부) 은 별도 PR
- slip-service `/from-*` endpoint 의 partnerCode → partnerId 정규화 흐름 통합도 별도 PR
- 시점 = (1) Phase 9 W5 마무리 + 회고 시점 또는 (2) Phase 10 cutover 사전 정합 시점

근거: 본 PR scope 를 partner-service 신규 서비스 한정으로 제한 (단편 PR 회피). slip-service 측 변경은 IT M5 idempotency 3중 격리 회귀 테스트 동반 의무 — 별도 충분한 시간 확보 필요.

영향: 본 PR 머지 직후 시점 = slip-service 의 partnerId 처리는 Phase 6 M5 상태 그대로. partner-service 의 internal endpoint 는 운영 활성이지만 호출자 0. 호출자 활성 = W5 또는 Phase 10 시점.

### D-P9-05. ServiceDiscoveryClient `samhan.discovery.provider=eureka` default — Phase 10 cutover 시점 aws-cloud-map 토글

- 본 PR partner-service 의 application.yml 에 `samhan.discovery.provider: ${SAMHAN_DISCOVERY_PROVIDER:eureka}` 추가
- partner-service 의 build.gradle 에 `implementation project(':shared:discovery-abstraction')` 의존성 추가
- 본 시점 = `EurekaServiceDiscoveryClient` 자동 활성 (Eureka 자체 EC2 운영 결정 D-P8-11 일관). `AwsCloudMapServiceDiscoveryClient` 는 placeholder 유지
- Phase 10 cutover 시점에 `SAMHAN_DISCOVERY_PROVIDER=aws-cloud-map` 으로 환경변수 토글하면 코드 변경 없이 vendor 전환 (build.gradle 의존성은 그대로)

근거: D-P8-07 (ServiceDiscoveryClient interface 도입) 일관. Phase 9 신규 service 부터 본 의존성 표준 적용 — 14 기존 service 의 build.gradle 의존성 추가 부담을 Phase 10 cutover 일괄 시점으로 미루지만, 신규 service 는 최초 작성 시점부터 도입.

영향: 본 PR 머지 후 시점 = partner-service 가 첫 번째 ServiceDiscoveryClient 소비자. provider=eureka default 동작은 기존 `@EnableDiscoveryClient` Eureka client 와 동일 (functional 동일성 보장). Phase 10 cutover 시 partner-service 가 가장 먼저 aws-cloud-map 으로 전환 가능한 service.

---

## Phase 9 2차 결정 (2026-05-06)

### D-P9-06. Phase 9 2차 = W2 groupware-service skeleton (본 PR)

- 신규 service `services/groupware-service` (port 8092, DB `groupware_db`) 추가
- 5 entity = `ApprovalLine` (결재선 종합 + chain) + `ApprovalStep` (chain 단일 단계, sequence ASC) + `Message` (1:1 메신저) + `Schedule` (일정) + `ScheduleParticipant` (참여자 1:N)
- 4 enum = `ApprovalStatus` (5상태) + `ApprovalStepStatus` (3상태) + `MessageStatus` (UNREAD/READ) + `ScheduleStatus` (DRAFT/CONFIRMED/CANCELLED)
- 2 controller = `GroupwareInternalController` (X-Internal-Token, 결재 lookup + 미열람 카운트) + `GroupwareAdminController` (결재 3 + 메신저 2 + 일정 4 endpoint)
- 3 service = `ApprovalLineService` + `MessageService` + `ScheduleService`
- 1 client = `UserClient` (user-service `/internal/users/{userId}` lookup) — fail-open 정책 (Phase 10 시점 fail-fast 강화)
- Flyway V1 = 5 테이블 + BaseEntity 7 audit + Soft Delete + partial unique index 2종 (`schedule_participants` schedule+participant / `approval_steps` line+sequence)
- 단위 테스트 16 case (ApprovalLineServiceTest 8 + MessageServiceTest 4 + ScheduleServiceTest 4) + IT 10 case (Internal 4 + Admin 6, UserClient @MockBean)
- M-PHASE-9-readiness §6 의존성 매트릭스 일관 — user-service (직원 정보) 단일 외부 의존
- 환경변수 표준 = `SAMHAN_GROUPWARE_DB_*` chained-default + `SAMHAN_USER_SERVICE_URL` + `SAMHAN_INTERNAL_TOKEN` + `SAMHAN_GROUPWARE_SERVICE_URL` + `SAMHAN_DISCOVERY_PROVIDER`
- `infrastructure/env-templates/groupware-service.env` 신규 (CHANGE_ME_LOCAL_ONLY placeholder)
- `services/groupware-service/README.md` + `docs/dev-reports/phase9-step-2-groupware-service.md` 신규

근거: M-PHASE-9-readiness §3-2 (W2 groupware-service) 일정 일관 진행. 결재선 + 메신저 + 일정 3 도메인은 사용 흐름이 인접하므로 단일 service 보유 결정.

영향: 본 PR 머지 후 Phase 9 W3 (notification-service) 진입 가능. 14 + 2 = 16 service. settings.gradle / build.gradle leafProjects 양쪽 갱신.

### D-P9-07. 결재선 chain 모델 = ApprovalLine + ApprovalStep 분리, ApprovalStatus 5상태

- 결재선 chain 은 별도 entity (`ApprovalStep`) 로 분리, `@OneToMany` + `@OrderBy("sequence ASC")` 보관 (1 line : N step)
- chain 단계는 0-base sequence 자동 할당, partial unique index `(approval_line_id, sequence)` 활성 행 한정으로 중복 방지
- `ApprovalStatus` 5상태 = `PENDING` / `IN_PROGRESS` / `APPROVED` / `REJECTED` / `WITHDRAWN`
  - PENDING = 발의 직후 (1번째 결재자 처리 대기)
  - IN_PROGRESS = chain 일부 승인 + 후속 대기
  - APPROVED = 모든 step 승인 완료
  - REJECTED = chain 중 1명이라도 반려 (즉시 종료)
  - WITHDRAWN = 요청자 본인 회수
- 종료 상태 (APPROVED/REJECTED/WITHDRAWN) 는 추가 승인/반려 호출 거부 (`ensureMutable` 가드)
- chain 순서 강제 — `currentStep()` PENDING 중 sequence 최소 step 만 처리 가능, 다른 결재자 호출 거부
- 본인 결재자 차단 — `appendStep` 가드로 요청자 ≠ approver 강제

근거: 결재선의 비즈니스 흐름은 chain (sequence) 이 본질이므로 별도 entity 분리가 자연스럽다. 5상태 enum 은 `WITHDRAWN` 까지 포함하여 회수 흐름을 status 로 표현 (별도 boolean 컬럼 회피, 종료 상태 단일 가드 일관). 본인 결재자 차단 / chain 순서 강제는 도메인 단위 가드로 service / controller 우회 불가.

영향: chain 의 sequence ASC orderly approval 흐름이 도메인 invariant. 결재 도메인 후속 확장 시 (예: 병렬 결재 / 전결 / 위임) 본 가드를 어떻게 완화할지 별도 결정 필요 (W5 회고 시점 검토).

### D-P9-08. ServiceDiscoveryClient 두 번째 소비자 = groupware-service

- W1 partner-service 가 첫 소비자 (D-P9-05). 본 PR groupware-service = 두 번째 소비자
- `build.gradle`: `implementation project(':shared:discovery-abstraction')` 의존성 추가 (W1 패턴 1:1 복제)
- `application.yml`: `samhan.discovery.provider: ${SAMHAN_DISCOVERY_PROVIDER:eureka}` (W1 패턴 1:1 복제)
- 본 PR 시점 = `EurekaServiceDiscoveryClient` 자동 활성. UserClient 가 본 wrapper 를 보유 (현재 미사용, Phase 10 활성 시 경로별 호출 라우팅에 사용 예정)
- W3 notification-service / W4 dashboard-service 도 동일 패턴 적용 의무 (Phase 9 신규 service 표준)

근거: D-P9-05 (W1 도입) 일관. 신규 service 가 최초 작성 시점부터 의존성 도입하여 14 기존 service 의 의존성 추가 부담을 Phase 10 cutover 일괄 시점으로 미룬다. groupware-service 는 UserClient 보유 service 로서 향후 service-to-service 호출 라우팅의 첫 비-self-contained 소비자.

영향: Phase 10 cutover 시점에 `SAMHAN_DISCOVERY_PROVIDER=aws-cloud-map` 토글로 partner-service + groupware-service 2개 신규 service 가 동시 vendor 전환 가능. UserClient 의 `getDiscoveryClient()` 는 현재 unused — Phase 10 시점에 base URL 대신 service-name 기반 lookup 으로 전환 (별도 PR scope).

---

## Phase 9 3차 결정 (2026-05-07)

### D-P9-09. Phase 9 3차 = W3 notification-service skeleton (본 PR)

- 신규 service `services/notification-service` (port 8093, DB `notification_db`) 추가
- 2 entity = `NotificationRequest` (발송 요청 종합 + payload JSONB) + `NotificationLog` (발송 이력 1 request : N attempt)
- 3 enum = `NotificationChannel` (PUSH/EMAIL/SMS) + `NotificationStatus` (PENDING/SENT/FAILED/RETRYING) + `RecipientType` (USER/PARTNER/EXTERNAL_PHONE)
- 2 controller = `NotificationInternalController` (X-Internal-Token, send + status) + `NotificationAdminController` (send / list / single / retry, MASTER+MANAGER)
- 1 service = `NotificationService` (생성 / 게이트웨이 호출 / 재시도 / 페이지)
- 3 channel adapter (인터페이스 + 운영 + mock) = PushAdapter (`FcmPushAdapter` + `MockPushAdapter`) / EmailAdapter (`SesEmailAdapter` + `MockEmailAdapter`) / SmsAdapter (`AligoSmsAdapter` + `MockSmsAdapter`)
- 1 client = `UserClient` (user-service `/internal/users/{userId}` 단건 + `/internal/users/verify-bulk` bulk)
- Flyway V1 = 2 테이블 + BaseEntity 7 audit + Soft Delete + JSONB payload + partial unique index (`notification_logs.request_id+attempt_no` 활성 행 한정)
- 단위 테스트 12 case (NotificationGatewayTest 3 + NotificationServiceTest 6 + UserClientBulkVerifyTest 3) + IT 9 case (Internal 4 + Admin 5, UserClient @MockBean)
- 환경변수 표준 = `SAMHAN_NOTIFICATION_DB_*` chained-default + `SAMHAN_INTERNAL_TOKEN` + `SAMHAN_USER_SERVICE_URL` + `SAMHAN_DISCOVERY_PROVIDER` + `SAMHAN_ALIGO_*` + `SAMHAN_FCM_*` + `SAMHAN_USER_CACHE_*`
- `infrastructure/env-templates/notification-service.env` 신규 (CHANGE_ME_LOCAL_ONLY placeholder)
- `infrastructure/postgres/init/01-create-databases.sql` `notification_db` 추가
- `infrastructure/prometheus/prometheus.yml` `notification-service:8093` + `groupware-service:8092` scrape target 추가 (DevOps Follow-up #11/#12 W3 시점 흡수)
- `services/notification-service/README.md` + `docs/dev-reports/phase9-step-3-notification-service.md` 신규

근거: M-PHASE-9-readiness §3-3 (W3 notification-service) 일정 일관 진행. 푸시/이메일/SMS 라우터는 단일 service 가 모든 channel 어댑터를 strategy pattern 으로 보유하는 것이 운영 / 추적 / 재시도 흐름 단순화에 유리.

영향: 본 PR 머지 후 Phase 9 W4 (dashboard-service) 진입 가능. 14 + 3 = 17 service. settings.gradle / build.gradle leafProjects 양쪽 갱신.

### D-P9-10. 3 channel adapter strategy + Phase 5 Aligo 흡수

- `NotificationGateway` 공통 인터페이스 + `NotificationGatewayConfig` 가 Spring 발견 bean 을 channel enum 키 EnumMap 으로 라우팅
- service 레이어 (`NotificationService`) 는 channel → adapter 1회 lookup → send 호출 → result 적재 (재시도 정책 분리)
- `MockPushAdapter` / `MockEmailAdapter` / `MockSmsAdapter` 는 단위 테스트 전용 (Spring bean 미등록)
- `FcmPushAdapter` — credentials placeholder 인 경우 stub-success (외부 호출 X). Phase 10 cutover 시 FCM Admin SDK 통합
- `SesEmailAdapter` — placeholder, Phase 10 cutover 시 AWS SES SDK 통합
- `AligoSmsAdapter` — Phase 5 `slip-service.delivery.sms.AligoSmsGateway` 의 form-urlencoded 호출 모델 흡수 (key/user_id/sender/receiver/msg/testmode_yn). 응답 `result_code == 1` 만 success
- credentials placeholder (CHANGE_ME_LOCAL_ONLY) 시 외부 호출 skip + stub-success — local dev / dev-default 호환

근거: 채널별 어댑터 분리는 mock injection / test 격리 / Phase 10 SDK 통합 시점 분리 측면 모두 유리. EnumMap 라우팅은 channel 추가 시 어댑터 bean 등록만으로 자동 통합 (config 코드 수정 불요). Aligo 는 단순 form 인증으로 Solapi (HMAC-SHA256) 대비 통합 비용 낮음 + Phase 5 시점 검증 완료된 호출 모델이라 흡수가 안전.

영향: Phase 5 의 `services/slip-service/.../sms/AligoSmsGateway.java` 는 본 PR 시점에 그대로 보존 (W3 운영 단편화 회피). Phase 10 cutover 또는 후속 정리 슬라이스 시점에 slip-service 가 notification-service `/internal/notifications/send` 호출로 전환 + 본인 SMS 모듈 제거.

### D-P9-11. UserClient bulk verify + Caffeine TTL 60s — BE backlog #4 채택

- PR #92 BE Reviewer 후속 backlog #4 (groupware ApprovalLine N 결재자 fan-out 직렬 RPC 비용) 를 W3 시점에 통합 채택
- `UserClient.verifyBulk(List<UUID>)` — 한 번의 RPC 로 N user 검증 + Caffeine cache (TTL 60s, max 10000 entries)
- user-service 신규 endpoint `POST /internal/users/verify-bulk` (Repository.findAllByIdIn 활용, 1 query)
- groupware-service `ApprovalLineService.create` 도 직렬 N+1 → bulk 1회 호출로 전환 (본 PR 통합 적용)
- 영향 file 5 = notification-service UserClient + UserCacheProperties + groupware UserClient + groupware ApprovalLineService + user-service InternalUserController + 2 dto + IT mock setup
- user-service 측 InternalTokenFilter / SecurityConfig 갱신 (Phase 9 W3 신규 — Phase 9 W1/W2 의 UserClient 가 호출하는 단건 lookup endpoint 의 실 보호 추가)

근거: W3 시점에 적용해 두면 W4 dashboard-service / W5 시점에 다중 client (InventoryClient / AccountingClient / PartnerClient / UserClient) 통합 패턴이 일관 정착. 별도 PR 분리 시 W4 까지 fan-out 부하 누적 + 후속 PR 의존성 발생. 통합 PR 1건 시 5 file 추가 변경으로 후속 슬라이스 정착 비용 0.

영향: groupware-service IT 의 mock setup 확장 (`verifyBulk(anyList())` lenient 추가). dashboard-service / 후속 service 의 UserClient 신규 작성 시 본 패턴 (verifyBulk + Caffeine) 의무 표준화.

---

## Phase 9 4차 결정 (2026-05-07)

### D-P9-12. Caffeine 일관 유지 + Redis 토글 약속 (W3 DevOps backlog #4 채택)

- W3 reviewer 토론에서 DevOps 가 제기한 "Caffeine in-process vs Redis 공유 캐시" 트레이드오프를 W4 통합 PR 에서 정식 결정
- 단계별:
  - W3 (notification) — Caffeine in-process (UserClient TTL 60s)
  - W4 (dashboard, 본 PR) — Caffeine 일관 유지 (KPI 응답 60s TTL, max 5000 entries)
  - Phase 10 — multi-instance scaling 시점에 Redis 전환 검토
- 토글 = `samhan.cache.provider=caffeine|redis` 환경변수 표준 — 코드 변경 없이 전환 가능하도록 `DashboardCacheProperties` + `CacheConfig` 보유
- 본 PR 시점 = Caffeine impl 만 활성. Redis impl 은 Phase 10 별도 PR scope

근거: W4 dashboard-service single-instance 가동 + 5분 간격 materialized view REFRESH 가 데이터 일관성의 1차 갱신 메커니즘. 60초 KPI cache TTL 은 REFRESH 주기보다 짧아 stale 위험 없음. multi-instance 전환 시점 (Phase 10) 에 Redis 공유 캐시 + ttl 길이 재검토.

영향: W4 시점 추가 의존성 0 (Redis 미도입). Phase 10 cutover 시점에 Redis driver + Lettuce client + connection pool 추가 후 `samhan.cache.provider=redis` 토글로 전환 — 본 결정으로 후속 PR scope 분리.

### D-P9-13. Materialized view CONCURRENTLY refresh + 5분 간격 scheduled

- `mv_realtime_stock_summary` (창고별 SKU 수 + 총수량) + `mv_sales_daily_summary` (일별 거래처 수 + 총금액 + 총항목수) 2 view 도입
- CONCURRENTLY 모드 — unique index 의무 (V1 SQL 보유)
- `samhan.dashboard.refresh.interval-minutes` (default 5) 주기로 scheduled REFRESH (`MaterializedViewRefreshConfig`)
- `POST /admin/dashboard/refresh` 수동 트리거 endpoint + KPI cache invalidate 동시 호출
- fail-soft — REFRESH 실패 시 silent skip + warn log (다음 주기 재시도, 예외 미전파)

근거: 창고별 / 일별 집계 query 가 dashboard 의 핵심 read 패턴. row level 데이터를 매 호출마다 GROUP BY 하면 N row 부하 누적. materialized view 를 CONCURRENTLY refresh 하면 read 부하를 view scan 으로 일정화 + 5분 stale 허용 (운영 dashboard 특성상 분 단위 stale 충분).

영향: H2 PG MODE (test local 프로파일) 는 MATERIALIZED VIEW 미지원 → IT 는 Postgres Testcontainer 기반 + local 프로파일은 flyway 비활성. CI Linux runner 에서 실 Postgres 16 + view CONCURRENTLY refresh 검증.

### D-P9-14. 4 외부 client + ServiceDiscoveryClient 네 번째 소비자

- W1 partner / W2 groupware / W3 notification 에 이은 ServiceDiscoveryClient 네 번째 소비자
- 4 외부 client = `InventoryClient` (8085) + `AccountingClient` (8087) + `PartnerOrderClient` (8088) + `PartnerClient` (8095, W1)
- 본 슬라이스 = skeleton fail-soft 정책 (네트워크 실패 / 404 시 empty/ZERO/0). Phase 10 cutover 시점에 endpoint 정착 후 응답 파싱 + DTO 매핑
- `PartnerClient` 만 W1 의 `/internal/partners/{partnerCode}` endpoint 활용 (운영 가능 상태)
- IT 4 client 모두 `@MockBean` 격리 의무 (memory feedback_it_mockbean_external_clients) + lenient setup

근거: dashboard-service 는 데이터 집계 책임상 4 service 의존이 본질. 본 PR 시점에 client + fail-soft 정책 + IT mock pattern 일관 정착하여 Phase 10 cutover 시점 추가 비용을 endpoint 응답 파싱 한 가지로 한정.

영향: ServiceDiscoveryClient 의 4 service 동시 진입 패턴 표준화. Phase 10 시점 `aws-cloud-map` 토글로 4 service 동시 vendor 전환 가능. 향후 신규 service 도입 시 본 패턴 (skeleton fail-soft + ServiceDiscoveryClient 의존성) 일관 적용.

### D-P9-15. shared:user-client-abstraction 통합 (W3 BE backlog #1 채택)

- W3 reviewer 토론에서 BE 가 제기한 "notification / groupware UserClient 중복 구현 + groupware Caffeine 누락" 통합
- 신규 모듈 `shared/user-client-abstraction/` = `UserVerifier` interface + `DefaultUserVerifier` impl + `UserVerifierProperties` + 6 case 단위 테스트
- 표준 = RestClient + Caffeine TTL 60s + max 10000 entries + fail-soft / fail-fast 토글 (`failFast` boolean)
- notification-service / groupware-service 의 기존 `UserClient` 클래스를 본 abstraction 의 thin delegate 로 변환 (회귀 0 — `@MockBean UserClient` 패턴 유지)
- dashboard-service 도 본 모듈 의존성 등록 (실 사용은 후속 — Phase 10 시점 user lookup 통합)

근거: 동일 책임 (user verify) 의 2 service 중복 코드 + groupware 의 Caffeine 누락은 abstraction 부재의 명백한 비용. W4 시점에 abstraction 으로 통합하면 Phase 10 시점 fail-fast 토글 활성 (BE backlog #2) + Phase 11 시점 잠재적 GraphQL 통합 등 후속 변경의 단일 진입점 확보.

영향: 회귀 검증 — notification 12 + groupware 16 단위 + 각 IT 9 + 11 = 21 case 모두 PASS 유지. 향후 신규 service 의 user lookup 도입 시 본 abstraction 1 줄 의존성 추가 + UserVerifier 주입만으로 정착.

---

## Phase 9 W5 결정 (2026-05-07)

### D-P9-16. partner-service `POST /internal/partners/find-by-codes` bulk endpoint + dashboard PartnerCodeResolver bulk 전환 (W4 BE 의견 3 채택)

- partner-service 신규 `POST /internal/partners/find-by-codes` — partnerCode N건 동시 조회 batch endpoint (X-Internal-Token + ROLE_MASTER)
- `PartnerService.findByCodes(Collection<String>)` — distinct 정규화 + 빈 입력 short-circuit + IN 절 1회 query
- `PartnerRepository.findAllByPartnerCodeIn(Collection<String>)` — Spring Data JPA 자동 query (Soft Delete `@SQLRestriction` 가드 자동 적용)
- IT 4건 신규 (정상 / 빈 / 일부 미존재 누락 / 토큰 누락 403)
- dashboard-service 측 `PartnerClient.findByCodes(List<String>)` — partner-service POST 호출 + skeleton-mode 토글 일관 + fail-soft 빈 리스트 반환
- `PartnerCodeResolver.resolveAll(List<String>)` — cache hit/miss 분리 + miss 만 1회 bulk RPC + cache 적재 (단건 resolve 와 cache name `dashboard-partner-resolve` 공유)
- `PartnerCodeResolverTest` 단위 4건 신규 (빈 / 전체 miss / hit+miss 분리 / 일부 미존재)

근거: PR #94 dev-report § Phase 10 cutover 약속 (BE 의견 3) — `DashboardAdminController.salesAggregate` 의 partner 정보 lookup fan-out 시 N 회 직렬 RPC 회피용 backing endpoint. W4 시점 사용자 가드 (`feedback_integrated_pr_pattern.md` § fix 후속 PR/Phase 위임 금지) 명시 후 11건은 본 PR 채택, 1건 (BE 의견 3) 만 W5 위임 → 본 W5 PR 채택으로 잔존 backlog 0 으로 정리.

영향: 향후 매출 집계 / KPI 화면이 partnerCode N건 동시 노출 시 fan-out 직렬 RPC → 1회 batch 호출. partner-service 자체 IT 4 + dashboard-service 단위 4 추가 (회귀 0 — 기존 12 + 16 + 17 단위 + 9 IT 모두 PASS 유지).

### D-P9-17. slip-service 시간 의존 design fix (LocalDate.now()) — main 도 영향 받았을 회귀 사전 예방

- PR #94 후속 fix `cde6db9` — slip-service 24 case IT/단위 fail
- 원인 — 6 file × `LocalDate.of(2026, 5, 5)` 하드코딩 + DeliveryBatch 토큰 만료 비교 (`tokenExpiresAt = 2026-05-06 23:59:59`) 가 2026-05-07 시점 만료 영향으로 fail
- fix — 6 file 모두 `LocalDate.now()` 동적 값으로 정정 (DeliveryBatchTest / DeliveryBatchServiceTest / SlipServiceSignatureTest / PublicSignatureControllerIT / PublicSlipControllerIT / SlipSignatureAdminIT)

근거: 본 PR 변경 영향이 아닌 시간 흐름 (날짜 변경) 회귀이지만, main 도 동일 영향 받았을 패턴이며 사용자 가드 적용 (Phase 10/W5 위임 X 정공법 fix). W5 시점 grep 가드로 다른 service 의 단순 fixture 데이터 (`LocalDate.of(2026,1,1)` user 입사일 등) 는 회귀 영향 없음 추가 검증.

영향: CI 7/7 PASS 회복. 회귀 0 — dashboard / notification / groupware / partner / user 모두 PASS 유지.

### D-P9-18. 사용자 가드 적용 — `feedback_integrated_pr_pattern.md` § "fix 후속 PR/Phase 위임 금지"

- W4 PR #94 시점 사용자 명시 — reviewer 식별 fix 12건 매트릭스 중 11건 본 PR 채택 + 1건 (BE 의견 3) W5 위임
- W5 본 PR 시점 잔존 1건도 채택 — backlog 누적 0 으로 종료

근거: 단편 fix 후속 PR / Phase 위임 시 backlog 누적 → 후속 슬라이스 부담 + 가드 위반 (단편 PR 회피). 본 가드 적용 후 W4 + W5 모두 reviewer 식별 fix 본 PR 일괄 채택 패턴 정착. memory `feedback_integrated_pr_pattern.md` 갱신 후속 진행.

영향: Phase 9 W4 → W5 backlog 위임 패턴 1건 (BE 의견 3) 만 잔존 → 본 PR 채택. Phase 10 진입 시점 backlog 누적 0.

### D-P9-19. Phase 10 진입 준비 완료 — AWS migration cutover plan 채택

- `docs/migration/phase10/M-PHASE-10-readiness.md` 신규 — 6 섹션 (진입 조건 / 작업 분해 / 가드 / 일정 / roll-back / 참조)
- 작업 분해 — P10-1 (Secrets + Cache) / P10-2 (Discovery + Resilience) / P10-3 (RDS + Cutover) 3 슬라이스
- Phase 10 dry-run plan (`M-AWS-MIGRATION-DRY-RUN.md`, Phase 8 도입) 14 section 과 짝
- AWS 4 큰 변화 (Secrets Manager / aws-cloud-map / Redis / Aurora PostgreSQL) 모두 Phase 8/9 추상화로 사전 흡수 (코드 변경 1줄 ~ 1 모듈 수준)

근거: Phase 9 회고 (`phase9-retrospective.md` § 6) 기준 — 14 service skeleton + 4 추상화 모듈 + 12-factor + chained-default + ShedLock 가드 모두 OK. AWS account + IAM + Aurora + ALB + Route 53 인프라 준비 시점에 P10-1 진입 가능.

영향: Phase 10 cutover 회귀 위험 최소화 + roll-back 단위 명확. 사용자 결정 (`AWS account 발급 시점` + `cutover 슬라이스 분할 합의`) 후 P10-1 진입.

### D-P9-20. Phase 9 회고 종합 + Phase 10 시점 결정

- `docs/dev-reports/phase9-retrospective.md` 신규 (10 섹션) — Phase 9 5 슬라이스 (W1~W5) 종합
- 산출 통계 매트릭스 — 4 service + 1 shared module + 2 materialized view + 4 외부 client + 19 결정 + 25 backlog 채택
- 핵심 회고 7 success + 6 학습 — 사용자 가드 정착 / shared abstraction 통합 / slip-service 시간 의존 사전 예방 / W2 Lazy fix / W3 raw URL pin / W4 backlog 누적 → W5 압박 / 임시 브랜치 회피
- 누적 backlog 채택 결과 — Phase 10 위임 N건 (W3 BE backlog #2/#3, W3 DevOps #6/#7/#10, W3 QA #11/#12/#13)

근거: Phase 9 = "잔여 도메인" phase 의 마무리. 14 service skeleton 완료 + Phase 10 진입 준비 완료 시점 명시.

영향: Phase 10 진입 시점 = 본 PR 머지 직후. AWS account 준비 시점에 P10-1 슬라이스 시작.

---

## post-W5 backlog cleanup 결정 (2026-05-07)

### D-P9-11 보강. UserVerifierProperties fail-mode (OPEN/STRICT) alias 토글 (Q-W3-3 채택)

- 본 보강은 D-P9-11 의 `failFast` 부울 토글에 대한 의미 명시 alias 도입이며, 동작 변경 없음 (회귀 안전)
- `UserVerifierProperties.FailMode` enum 신설 — `OPEN` (fail-soft, default) / `STRICT` (fail-fast, Phase 10 cutover 시점 활성)
- `setFailMode` / `setFailFast` 양방향 alias setter — 한 쪽 변경 시 다른 쪽 자동 동기화 (legacy `failFast` 호출자 / 신규 `failMode` 호출자 모두 호환)
- 환경변수 `SAMHAN_USER_CLIENT_FAIL_MODE=OPEN` 표준 — `notification-service.env` + `groupware-service.env` 신규 추가
- Phase 10 cutover 시점 = `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT` 전환 약속 명시 (P10-1 슬라이스 산출물)
- 회귀 검증 — `DefaultUserVerifierTest` 8 case (기존 6 + IT 2 신규 OPEN/STRICT alias) 모두 PASS

근거: Phase 10 cutover 시점에 fail-mode 의미 명시 토글 필요. 부울 `failFast` 만 보유한 상태에서는 환경변수 명/문서/코드 일관성이 약화 (`fail-fast=true` vs `fail-mode=STRICT` 의미 동일하지만 리뷰어 인지 비용). post-W5 backlog cleanup 시점에 의미 명시 alias 추가하여 향후 Phase 10 P10-1 슬라이스 진입 시 환경변수 단일 표준 (`SAMHAN_USER_CLIENT_FAIL_MODE=OPEN|STRICT`) 만 보유.

영향: 기존 `failFast` 호출자 (4 service `UserClient` + IT) 변경 없이 호환. 신규 `failMode` setter 호출자 (Phase 10 P10-1 시점 cutover) 만 신설.

---

### D-P9-21. post-W5 backlog cleanup — Phase 10 위임 backlog 중 즉시 처리 가능 7건 본 PR 채택

- 사용자 가드 (`feedback_integrated_pr_pattern.md` § "fix 후속 PR/Phase 위임 금지") 일관 적용 — Phase 10 위임 backlog 중 환경 의존성이 없는 7건 본 PR 채택
- 채택 매트릭스:
  | # | 영역 | 출처 | 산출 |
  |---|---|---|---|
  | 1 | design-system PR template | Designer D-W4-3 보강 | QA HTML mobile responsive table wrapper (`.qa-table-wrapper` + `@media max-width 768px`) |
  | 2 | design-system tokens | Designer D-W5-2 채택 | slice accent 3색 토큰 (`--color-slice-{success,pending,deferred}` Google Material Green/Yellow/Gray) + utility class |
  | 3 | notification-service | QA Q-W3-1 채택 | retry max-attempts property (`samhan.notification.retry.max-attempts` default 5) + `requeueForRetry_exceedsMaxAttempts_marksFailedPermanent` IT |
  | 4 | notification-service | QA Q-W3-2 채택 | `NotificationSendRequest.payload` `@Size(max=4000)` (Postgres TOAST 임계 회피) + `send_payloadOver4000Bytes_returns400` IT |
  | 5 | shared:user-client-abstraction | QA Q-W3-3 채택 | `UserVerifierProperties.FailMode` enum (OPEN/STRICT) alias + 양방향 자동 동기화 + IT 2건 |
  | 6 | notification-service | DevOps backlog 채택 | `NotificationGatewayMetrics` 신규 (3 channel × 2 result = 6 Micrometer counter) — `notification_gateway_send_total{channel,result}` actuator/prometheus 노출 + IT 2건 |
  | 7 | user-service | DevOps backlog 채택 | `Employee.DEFAULT_HIRE_DATE = 2026-01-01` 의도 주석 + 한국어 Javadoc — W4 slip-service 시간 의존 회귀 학습 적용 (코드 동작 변경 0) |
- IT 신규 5건 합계 — `requeueForRetry_exceedsMaxAttempts_marksFailedPermanent` (NotificationServiceTest) + `send_payloadOver4000Bytes_returns400` (NotificationAdminControllerIT) + `verify_strictMode_failFast_returnsFalseOnGatewayError` + `verify_openMode_failSoft_returnsTrueOnGatewayError` (DefaultUserVerifierTest) + `NotificationGatewayMetricsTest` 2 case
- 회귀 검증 5 영역 — `:shared:user-client-abstraction:test` + `:services:notification-service:test` + `:services:user-service:test` + `:services:groupware-service:test` + `:services:dashboard-service:test` 모두 PASS
- 잔존 Phase 10 위임 backlog (환경 의존 항목만) — Designer #1 ChannelBadge 일관성 (Phase 10 W1) / QA Q-P10-1 skeleton-mode IT sweep / DevOps `partner_client_fail_total` Micrometer counter (Phase 10 W2 Resilience4j 통합 시점) / Phase 10 P10-1 ~ P10-3 슬라이스 본격 작업

근거: Phase 9 W5 머지 직후 (PR #95) 시점에 Phase 10 위임 backlog 매트릭스 재검토 결과, 7건은 환경 의존 (AWS account / Redis / Aurora) 없이 main 직접 작업 가능. 단편 PR 분리 시 backlog 누적 + 가드 위반 (사용자 명시 가드). 통합 PR 1건 시 9+ docs 영역 동기화 + QA 캡처 3종 + CI 7/7 검증 패턴으로 Phase 10 진입 시점 backlog 0 보장.

영향: Phase 9 = 완료 + post-W5 cleanup 완료 상태로 종료. Phase 10 진입 시점 = 본 PR 머지 직후. notification-service 의 retry max-attempts / payload @Size / Micrometer counter 3건은 production 진입 직전 보강 (운영 안정성 향상). user-client-abstraction 의 fail-mode alias 는 Phase 10 P10-1 slice cutover 진입 시점 단일 환경변수 표준 (`SAMHAN_USER_CLIENT_FAIL_MODE`) 활용 가능. design-system slice accent + PR template mobile wrapper 는 W6+ 전 PR 일관 적용 의무.

종합 TM fix 8건 (사용자 가드 일관 적용, 5 reviewer 토론 종합):
- **FE-1** slice-accent CSS variable 일관 (`--badge-radius` / `--badge-channel-font-size` `b-channel-*` 와 동등 token)
- **FE-2** `--qa-table-min-width-{sm,md,lg}` 3단계 변수 + PR-template-color-reference.md § 5.2 컬럼 수별 가이드 (4 이하 sm 600px / 5~6 md 800px / 7 이상 lg 1000px)
- **BE-1** `NotificationSendRequest.payload` `@AssertTrue` byte 검증 (UTF-8 byte length ≤ 4000 — multi-byte 문자 정합)
- **BE-2** `NotificationService.retry()` DEAD_LETTER 분기 `gatewayMetrics.recordFailure()` 호출 (Grafana dead-letter 가시성)
- **BE-3** `OrgChartSeeder.DEFAULT_HIRE_DATE` 중복 상수 제거 + `Employee.DEFAULT_HIRE_DATE` 인용 (DRY 정합)
- **QA-1** IT 4001 byte oversize fixture 1줄 압축 (`"a".repeat(4001)` — ASCII 1 byte/char)
- **QA-2** `UserVerifierProperties.connectTimeoutMs` / `readTimeoutMs` 추가 + `DefaultUserVerifier.buildClient()` 적용 + 테스트 100ms/200ms 명시 (가용 X 포트 호출 시 OS 기본 timeout 회귀 회피, WireMock 의존 추가 대안보다 가벼움)
- **QA-3** 문서 정합 — slip-service "만료 비교 패턴 부재" → "fixture 회귀 패턴 0 + 도메인 의도 비교 {`Slip.java:713` + `DeliveryBatch.java:195`} 2건 정상" 정정 (production 만료 검증 + 동적 테스트 fixture 패턴 명시)

---

## Phase 10 결정 (arologis-service 배차 마이크로서비스, 2026-05-07 ~)

### D-P10-01. arologis-service 도입 결정 (배차 마이크로서비스 신규)

- 신규 service `services/arologis-service/` (port 8097, DB `arologis_db`) — 카톡 메시지 파싱 → 차량/정차/기사 매칭 → 전자서명 → GPS 추적 통합
- 5 entity (Dispatch / Vehicle / VehicleStop / Driver / Signature) + DriverLocation GPS 추적
- 7 enum (DispatchType / VehicleTonnage / VehicleStatus / StopStatus / DriverSource / MatchSource / SignatureSource)
- W10-1 (본 PR) = skeleton (parser + matcher 추상화 + 4 client + 3 controller + 31 case)
- W10-2 ~ W10-5 = vendor 통합 / 모바일 / slip 통합 / 회고

근거: 기존 14 service 와 별도 도메인 (배차 = 외부 vendor + 모바일 어플 + GPS) — 단일 service-per-DB 격리 + 향후 외부 vendor 교체 가능 (DriverMatcher 추상화) 의도. 사용자 결정 2026-05-07.

영향: 14 service → 15 service. Phase 11 cutover 시점 RDS arologis_db 추가 + Prometheus scrape target 1건 추가.

### D-P10-02. port 8097 + arologis_db 표준 채택

- 포트 = 8097 (기존 14 service 8081~8095 + 8096 migration 예약 다음)
- DB = `arologis_db` (service-per-DB 표준 일관)
- 환경변수 = `SAMHAN_AROLOGIS_*` (chained-default 패턴 D-P8-08 일관)

근거: 기존 service 포트 인벤토리 일관 + service-per-DB 격리 + 환경변수 표준.

영향: `infrastructure/postgres/init/01-create-databases.sql` `arologis_db` 추가. `infrastructure/prometheus/prometheus.yml` `arologis-service:8097` scrape 추가.

### D-P10-03. DriverMatcher 추상화 + Mock + Insung Quick 토글

- `DriverMatcher` interface + `DriverMatchResult` record
- W10-1 default = `MockDriverMatcher` (`samhan.arologis.matcher.provider=mock`) — MOCK-001 / 010-0000-0000 driver 매칭 (DB 자동 upsert)
- W10-2 prod = `InsungQuickDriverMatcher` (`provider=insung-quick`) — 본 PR 은 placeholder (UnsupportedOperationException), W10-2 시점 실 vendor API 통합
- 외부 vendor 5만 프리랜서 풀 (인성데이타 퀵프로그램, 사용자 결정 2026-05-07)
- 향후 SMS / Kakao 추가 vendor 시 `MatchSource` enum 확장만으로 통합 가능

근거: vendor lock-in 회피 + vendor 교체 가능 design + dev/test 환경 mock 일관. Phase 8 ServiceDiscoveryClient 추상화 패턴 일관.

영향: W10-2 인성데이타 통합 시점에 InsungQuickDriverMatcher 만 변경 — DispatchService / Controller 등 호출 코드 영향 0.

### D-P10-04. 모바일 어플 stack = RN Expo (`clients/mobile-staff` 패턴 일관)

- W10-3 시점 RN Expo 어플 도입 — 기존 `clients/mobile-staff` 패턴 일관 (`clients/mobile-staff` 내부 driver tab 추가 vs 신규 `clients/mobile-driver` — W10-3 진입 시점 결정)
- Driver-app endpoint = `/driver-app/arologis/**` (인증 = X-User-Id + X-User-Role=DRIVER)
- 본 어플 사용 driver = INTERNAL Driver (`source=INTERNAL`, `appUserId=user-service userId`, `appInstalled=true`)
- 외부 vendor 매칭 driver = LINK 기반 카톡/SMS 서명 (어플 미설치, `source=EXTERNAL_*`)

근거: 사용자 결정 2026-05-07 — 신규 native stack 도입보다 기존 RN Expo 일관성 + cross-platform 운영 부담 최소화.

영향: W10-3 시점 `clients/mobile-staff` 또는 `clients/mobile-driver` 신규 폴더 + RN Expo 패키지 (사용자 결정 시점).

### D-P10-05. Phase 10/11 renumber — arologis = Phase 10 / AWS migration cutover = Phase 11

- 사용자 결정 2026-05-07 — 기존 Phase 10 (AWS migration cutover) → **Phase 11 으로 이동**
- 신규 **Phase 10 = arologis-service** (배차 마이크로서비스, 5 슬라이스 W10-1 ~ W10-5)
- docs 동기화:
  - `docs/migration/phase10/M-PHASE-10-readiness.md` **재작성** (arologis 5 슬라이스 plan)
  - `docs/migration/phase11/M-PHASE-11-readiness.md` **신규** — 기존 phase10 readiness 의 AWS migration cutover plan 이동
  - `docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md` 이동 (기존 phase10 → phase11)
  - 루트 `README.md` + `ROADMAP.md` Phase 매트릭스 갱신
  - 모든 service `README.md` 의 "Phase 10 cutover" 인용 → "Phase 11 cutover" 정정
- DECISIONS 의 "Phase 10 cutover" 인용은 향후 D-P11-* 신규 결정 시점에 정정 (본 결정만 phase10/11 boundary 명시)

근거: 사용자 우선순위 변경 — arologis 가 즉시 사업 가치 (실 카톡 배차 자동화 + 5만 프리랜서 매칭 + 어플 GPS 추적) 산출. AWS migration 은 Phase 11 으로 미뤄 안정성 검증 후 cutover.

영향: 기존 Phase 10 인용 (DECISIONS 본문 / service README / env-template 코멘트) 은 향후 PR 시점에 점진 정정. 본 PR 은 readiness / ROADMAP / README 핵심 docs 만 정정 (모든 코드 코멘트 즉시 정정 시 본 PR 부담 과다 — 사용자 가드 일관 후속 PR 미루지 않고 본 PR 채택 가능 영역만 일괄).

### D-P10-06. 알림 분담 정책 (2026-05-07)

- 배차 단계 알림 = **인성 알림톡** (W10-2 시점 인성 vendor 직접 호출, notification-service 우회)
- 본 시스템 알림 (어플 설치 invite / 일반 사용자 push) = **notification-service Aligo**
- W10-1 시점: notification-service skeleton-mode 토글 (`samhan.arologis.client.skeleton-mode=true`) 로 호출 차단
- W10-2 진입 시점: 인성 알림톡 직접 호출 + notification-service 호출 = 어플 설치 invite 만 (분리 정책)

근거: 사용자 결정 2026-05-07 — vendor 가 자체 알림톡 채널 보유, notification-service 의존 회피로 vendor 통합 시점에 통신 단순화. 본 시스템 알림은 자체 운영 통제 일관 (Aligo, D-W3 표준).

영향: W10-2 진입 시점 InsungQuickDriverMatcher 가 매칭 직후 인성 알림톡 직접 호출 (notification-service 호출 X). 본 PR (W10-1) 은 docs 명시만.

### D-P10-07. 모바일 어플 driver tab = mobile-staff 내부 채택 + GPS 권한 정책 (2026-05-07)

- 모바일 어플 옵션 = **`clients/mobile-staff` 내부 driver tab** 채택 (별도 `mobile-driver` 신규 X)
- 진입 흐름 = `AppRootNavigator` 의 `mode='estimate' | 'driver'` 분기 — 기존 v2/v3 EstimateWebViewScreen 100% 보존
- GPS 권한 정책:
  - foreground 권한 = **의무** (배송 도중 위치 추적)
  - background 권한 = 선택 (운영 시점 결정)
  - 거부 fallback = **어플 사용 불가** (`GpsBlockedScreen` 노출, driver tab 차단)
- W10-3 진입 조건 = W10-1 완료 (W10-2 의존 X) — 본 어플 GPS only 활성, 인성 LBS 통합은 W10-2 시점
- W10-3 GPS source = `APP_GPS_ACTIVE` (foreground 권한 O), `APP_GPS_BACKGROUND` (선택, 운영 시점 활성)

근거: 사용자 결정 2026-05-07 — FE-1 + Designer-2 채택. 별도 mobile-driver client 신규 시 5 client 통합 부담 + 영업직원/배송기사 같은 사람 가능성 (사용자 명시) → 동일 어플 안 mode 분기로 단순화.

영향: 본 PR (W10-3) `clients/mobile-staff/src/screens/driver/` 5 화면 (Dashboard / LocationTracking / Signature / GpsBlocked / TabNavigator) + `AppRootNavigator` 신규. 기존 EstimateWebViewScreen 변경 0.

### D-P10-08. Pretendard self-host 정식 도입 (2026-05-07)

- mobile-staff Pretendard 폰트 = **self-host 정식** (jsdelivr CDN 회피, Phase 7 4차 통일 폰트 패턴 일관)
- `clients/mobile-staff/assets/fonts/Pretendard-*.otf` 4~9 weight 배치 (본 PR 진입 시점 = graceful guard, 후속 fix 정식 배치)
- `app.json` `plugins.expo-font` 정식 등록 — `Regular / Medium / SemiBold / Bold` 4 weight
- `usePretendardFontGuarded()` = useFonts hook 정식 활성 + try/catch graceful (asset 미배치 환경 RN UI 미차단)

근거: 사용자 결정 2026-05-07 — Designer-2 채택. jsdelivr CDN 의존성 회피 (오프라인 환경 / 한국 망 latency / vendor 차단 위험) + Phase 7 4차 통일 폰트 패턴 일관 (5 client 동등).

영향: 본 PR (W10-3) `clients/mobile-staff/src/theme/usePretendardFontGuarded.ts` 정식 활성. driver tab RN native UI 의 `fontFamily.sans = 'Pretendard'` 적용. WebView 안 legacy estimate 는 자체 web font (변경 0).

### D-P10-09. mobile theme 토큰 = web/design-system 1:1 복제 (2026-05-07)

- `clients/mobile-staff/src/theme/tokens.ts` 신규 — `clients/web/design-system/src/tokens/tokens.css` 의 RGB 값을 1:1 복제
- 복제 대상 (W3+W4+W5+post-W5+W10-1):
  - post-W5 sales-form-polish-slice — surface / ink / line / action / state
  - W3 dashboard — Google Material method (GET/POST/PUT/DELETE) + status badge (ok/warn/info/new)
  - W4 notification — 3 channel badge (push/email/sms)
  - post-W5 D-W5-2 — slice accent (success/pending/deferred)
  - W10-1 — unparsed peach (b-unparsed)
- `badgeStyle(kind)` 헬퍼 = RN inline style 객체 반환 (CSS class `b-channel-push` / `slice-accent-success` 1:1 매핑)
- spacing (4-base) / radii (badge 4 / card 8 / button 4 / modal 8) / typography (Pretendard family + 8 size + 4 weight + 3 line-height) 동등 export

근거: 사용자 결정 2026-05-07 — Designer-2 채택. 5 client (estimate / order / desktop / mobile / mobile-staff) 디자인 통일성 + 신규 driver tab UI 가 web/design-system 과 동등 시각 인상 의무.

영향: 본 PR (W10-3) `theme/tokens.ts` + 5 화면 (Dashboard / LocationTracking / Signature / GpsBlocked / TabNavigator) 모두 본 토큰 인용. web `tokens.css` 변경 시 본 파일도 동기화 의무 (후속 슬라이스 가드 추가 권장).

### D-P10-10. Pretendard 9 weight 운영 배치 약속 (2026-05-07)

본 PR (W10-3) 시점 = 4 weight (Regular / Medium / SemiBold / Bold) 의무 + graceful guard 보호 (`usePretendardFontGuarded` `useState(true)` 기본값).

EAS Build 진입 시점 (W10-5 또는 운영 진입) 의무:

- `clients/mobile-staff/assets/fonts/Pretendard-{Thin,ExtraLight,Light,Regular,Medium,SemiBold,Bold,ExtraBold,Black}.otf` 9 weight 정식 배치
- `app.json` `plugins.expo-font` 의 9 weight asset 등록
- `usePretendardFontGuarded` 기본값 정정 — `useState(false)` + `useFonts` complete 후 `setReady(true)` 패턴
- splash screen guard 도입 — OTF load 완료 전 RN UI 렌더 차단 회피

근거: 사용자 가드 (`feedback_integrated_pr_pattern.md` § "fix 후속 PR/Phase 위임 금지") 일관 적용. W10-3 종합 TM 5 reviewer 채택 fix 7건 중 Designer-2 / FE-2 / B-DEVOPS-1 통합 — Pretendard OTF 4 weight 본 PR 의무 + 9 weight 운영 진입 시점 의무 + `useState(false)` 정정은 OTF 정식 배치 시점 동시 처리.

영향: 본 PR (W10-3) 시점 = 4 weight 자산 누락 시 graceful guard 가 RN UI 미차단. EAS Build 진입 시점 = 본 결정에 따라 9 weight 배치 + `useState(false)` 정정 + splash guard 도입 의무. ROADMAP `W10-5` 또는 `Phase 10 운영 진입` task 로 추적.

### D-P10-11. signature_source 컬럼 추가 + LINK/APP 통합 (2026-05-07)

slip-service Phase 10 W10-4 (PR #99) 시점에 `signatures` 관련 컬럼군에 `signature_source` 컬럼 3개 추가:
- `slips.signature_source` VARCHAR(20) NOT NULL DEFAULT 'LINK' (인수자 서명)
- `slips.driver_signature_source` VARCHAR(20) NOT NULL DEFAULT 'LINK' (기사 서명)
- `slip_signature_audit.signature_source` VARCHAR(20) NULL (audit 행, INVALIDATE 시 NULL)

근거:
- arologis-service 의 driver-app 직접 캡처 (source=APP) 가 W10-3 부터 활성, slip-service 에 전파 시 source 식별 의무
- 기존 SMS/Aligo 공개 모바일 endpoint 발급 (LINK) 데이터는 backfill DEFAULT 'LINK' 로 호환 보존
- 전자서명법 시행령 §17 무결성 입증 — audit 테이블에도 source 보존 의무
- `SignatureSource` enum (LINK/APP) 은 기존 `SignatureChannel` enum (MOBILE_CANVAS/PAPER_SCAN) 과 직교 (입력 매체 vs 발급 경로)

영향:
- 기존 `Slip.recordSignature` / `recordDriverSignature` 4-arg / 3-arg 시그니처 보존 + source overload 추가 (LINK 자동 위임)
- `SlipSignatureAudit.record` / `recordDriver` 도 source overload — RECORD/RECORD_DRIVER 행에 LINK/APP 보존
- 기존 데이터 / 호출자 영향 0 (DEFAULT 'LINK' backfill + 시그니처 호환)
- 본 PR 신규 endpoint `POST /internal/slips/{slipId}/signatures` 는 APP source 만 허용 (LINK 는 기존 공개 모바일 endpoint 전용 — 400 가드)
- Phase 11 cutover 시점 — APP source 슬립의 imageRef 가 S3 placeholder 에서 실 S3 업로드로 전환 (현 PR 은 placeholder bytes + hash 보존)

### D-P10-12. ApiResponse wrapper IT 의무화 (W10-3 F-3 채택, 2026-05-07)

W10-3 PR #98 backlog F-3 (ApiResponse wrapper IT 검증) 을 W10-4 (PR #99) 시점에 정식 채택.

근거:
- W10-3 회고에서 mobile-staff 가 `response.data.data.*` 처럼 wrapper 안 안 데이터를 직접 접근하는 패턴이 정착
- BE 측 IT 가 wrapper schema 를 명시적으로 검증하지 않으면, controller 응답 형식 회귀 (예: 직접 `Map` 반환) 시 mobile-staff 가 런타임 깨짐
- W10-4 신규 endpoint 2종 (slip-service `/internal/slips/{slipId}/signatures` + `/internal/slips/by-partner/{partnerId}/recent`) + arologis sign 응답 schema 확장 모두 mobile-staff 호출 경로 → IT schema 검증 의무
- PR #92 raw URL 회고 가드 일관 — schema mismatch fail-fast 패턴

영향:
- `SlipInternalControllerIT` (slip-service 신규 9 case) — 모든 200 OK 응답에 `success`/`data.*` schema 검증 의무
- `SignatureIntegrationIT` (arologis 신규 3 case) — 동일 schema 검증 의무
- 향후 모든 신규 IT 도 ApiResponse wrapper schema 검증 의무 (Phase 11 cutover 진입 시 운영 가드 일관 보존)
- 기존 IT 는 점진 보강 (회귀 영향 없는 변경)


### D-P10-13. SlipResolver 실 활성 + slip-service /internal/slips/by-partner-code/{code}/recent endpoint (2026-05-07)

W10-4 (PR #99) 5 reviewer 토론 종합 시점에 BE-1 채택. SlipResolver.resolveByPartnerCode 가 항상 empty 반환하던 fallback 을 실 활성으로 전환 — slipBridged=true 운영 0건 갭 해소.

근거:
- W10-4 초기 구현은 partnerCode → partnerId UUID 매핑 부재로 SlipClient 호출 자체가 막힘 (slipBridged 항상 false)
- 운영 시점에 양쪽 저장 패턴이 동작하지 않으면 W10-4 통합 의미 상실 (driver-app 캡처가 slip 인수자/기사 서명에 반영 X)
- partner-service 의 기존 `GET /internal/partners/{partnerCode}` 응답 (PartnerInternalResponse) 이 partnerId UUID 를 포함 — 추가 API 변경 0
- slip-service 가 자체 PartnerInternalClient 로 partnerCode → partnerId resolve 후 slips 테이블 lookup → graceful 200 + data=null 패턴 (404 미반환)

영향:
- slip-service 신규 `PartnerInternalClient` (timeout DV-1 일관 적용)
- slip-service `SlipInternalController` 신규 `GET /internal/slips/by-partner-code/{partnerCode}/recent` endpoint
- slip-service `SlipSignatureService.findRecentByPartnerCode(String)` Optional 반환 메서드
- arologis `SlipResolver.resolveByPartnerCode` 실 호출로 전환 (PartnerClient 의존 제거 — slip-service 가 흡수)
- arologis `SlipClient.findRecentSlipIdByPartnerCode(String)` 신규
- IT 보강: SlipInternalControllerIT 3 case 신규 (BE-1 검증) + SignatureIntegrationIT happy-path case 1 신규 (QA-2 검증)


### D-P10-14. SlipClient connect/read timeout 설정 (2026-05-07)

W10-4 (PR #99) 5 reviewer 토론 종합 시점에 DV-1 채택. arologis SlipClient + slip-service PartnerInternalClient 모두 connect 2s / read 3s timeout 명시.

근거:
- driver-app sign endpoint 가 동기 호출 — slip-service hang 시 driver UX 차단 (앱 응답 없음)
- 양쪽 저장 패턴은 graceful fallback 보장 의무 (자체 INSERT 보존, slip 호출 실패 시 false 반환)
- Spring Boot 3.4 표준 `ClientHttpRequestFactories` + `ClientHttpRequestFactorySettings` 사용
- Phase 11 운영 진입 시 RDS Aurora SLA 정합 — read timeout 3s 가 SLA 95% (요청당 1.5s) 의 2배 안전 마진

영향:
- arologis `SlipClient.buildClient()` helper — connect 2s / read 3s 적용
- slip-service `PartnerInternalClient` 생성자 — 동일 timeout 적용 (cross-service 일관)
- 운영 모니터링 backlog 추가 — Grafana 에서 SlipClient timeout 빈도 추적 (Phase 11 cutover 시점)

### D-P10-16. step-8 9 슬라이스 통합 PR — Flyway V 번호 sequence + 단일 PR 채택 + inventory 차이 분개 코드 (2026-05-09)

PR #114 (`feature/integrated-phase-10-step-8-ui-9-slice`) — 매뉴얼 안내 미구현 UI 9 슬라이스 통합. 5-team (BE/FE/Designer/QA/DevOps) 병렬 + TM 종합 fix.

근거:
- 9 슬라이스 = 모두 Phase 10 step 8 범위 — 9 개 PR 분리 시 cross-slice 회귀 검증 비용 폭증, 단일 통합 PR 채택 (`feedback_integrated_pr_pattern.md`)
- accounting Flyway V 번호 sequence — V1 (init+seed) + V2 (tax_invoice) + V3 (accounting_period) + V4 (재고감모 seed) — V4 = inventory AccountingClient 호환 시드 (150 재고자산 / 919 재고감모손실, 한국 일반기업회계기준)
- inventory 차이 자동 분개 — 차이 (+) 차변 150 / 대변 919, 차이 (-) 차변 919 / 대변 150 (한국 일반기업회계기준 표준 대로 영업외비용 919 환입)
- service-layer 마감 가드 — `JournalService.create` 안에서 `MonthEndCloseService.findClosedPeriodCovering` 호출 (interceptor `AccountingPeriodGuard` + filter `CachedBodyFilter` 의 MockMvc 비호환 회피, IT 안전성 우선)
- inventory `findByFilters` 쿼리 — PostgreSQL JDBC 의 `(? IS NULL OR ...)` 패턴은 SQLState 42P18 → boolean flag + non-null sentinel 패턴으로 우회

영향:
- `services/accounting-service/src/main/resources/db/migration/V4__seed_inventory_audit_accounts.sql` 신규
- `services/accounting-service/src/main/java/.../service/JournalService.java` — MonthEndCloseService 의존 추가 + `create` 가드 호출
- `services/inventory-service/src/main/java/.../repository/InventoryAuditRepository.java` — boolean flag 시그너처 변경
- `services/inventory-service/src/main/java/.../service/InventoryAuditService.java` — sentinel 부여 + boolean flag 전달
- `services/accounting-service/src/test/java/.../service/JournalServiceTest.java` — MonthEndCloseService mock 추가 + 기본 stub
- `docs/qa/integration-pr-9-slice/scenarios.md` — testid 명명 정합 (실 FE 표준), 1.2.6 본인 변경 case 신규 (총 161 case)
- `tools/manual-capture/data-testid-required.md` — slice 1/4/6 정정 + slice 10 (매출 마감) + slice 11 (재고 실사) 신규 명세
- `ROADMAP.md` — Phase 10 W10-step-8 row 추가
- `docs/dev-reports/integration-phase-10-step-8-ui-9-slice.md` 신규

### D-P10-17. step-9 시트 흐름 보강 + 노션 4 CSV 이식 + partner_code 매핑 정정 (2026-05-10)

PR (`feature/integrated-phase-10-step-9-sheet-notion-import`) — PR #114 머지 후 사용자 우려 (시트 비동기 회귀) + 노션 운영 4 CSV (REGION/DC/CHAT/BLOCK) 의 Samhan Public native 이식.

근거:
- 시트 흐름 보강 (Part 1) — `partner-order-service` + `product-service` 가 Phase 10 W10-step-8 머지 후 시트 동기화 누락 회귀 — 본 슬라이스 PR-D Part A (사용자 옵션 C 의도 완성) 으로 5분 cron 재활성
- 노션 4 CSV 이식 (Part 2) — REGION (가배차 지역별 분류) / DC (거래처 할인 정보) / CHAT (단톡방리스트) / BLOCK (발송금지리스트) — Notion DB export → arologis V3 / dc-config V2 / notification V2 / partner V4 Flyway + 서비스 레이어 import 로 native 이식 (Notion 의존성 제거)
- **partner_code 매핑 정정 (TM Part 3)** — 사용자 명시 (2026-05-10): "단톡방리스트와 발송금지리스트의 경우 추후 거래처명이 아니라 거래처코드로 매핑할 수 있도록". import 시 모호한 LIKE 매칭 회피 + source-of-truth 일관성 확보:
  - `PartnerLookupClient.verifyPartnerCode(String)` 신규 (notification-service)
  - `PartnerService.findByCodeForLookup(String)` 신규 (partner-service)
  - `ChatRoomImportService` + `PartnerBlockImportService` 양쪽에서 거래처코드 컬럼 (`거래처코드` 또는 `partner_code`) 우선, 없으면 사업자명 fallback
  - 사업자명 미공급 시 snapshot 은 `[partnerCode]` placeholder (entity invariant 보호 + admin UI 후속 보완 경로)
- **R2 backlog 보존** — KakaoDispatchParser 의 "-214" 카톡 식별자 vs partner-service 의 partner_code (예: "P-2026-0001") 명칭 충돌은 본 PR 범위 외 (별도 PR 위임 — 사용자 명시 격리)
- ManualDispatchRequest 의 `Long partnerCode` (= 카톡 슬립번호) 는 본 PR 미변경 — R2 별도 PR 시 String partner_code 분리 + entity 마이그레이션 동시 진행

영향:
- `services/notification-service/src/main/java/.../client/PartnerLookupClient.java` — `verifyPartnerCode` 메서드 추가
- `services/notification-service/src/main/java/.../client/NoopPartnerLookupClient.java` — Lambda → Anonymous class 변환 (2 메서드 구현)
- `services/notification-service/src/main/java/.../service/ChatRoomImportService.java` — 거래처코드 컬럼 우선 매핑 분기 추가
- `services/partner-service/src/main/java/.../service/PartnerService.java` — `findByCodeForLookup` Optional 형 추가
- `services/partner-service/src/main/java/.../service/PartnerBlockImportService.java` — 거래처코드 컬럼 우선 매핑 분기 추가
- `services/notification-service/src/test/java/.../service/ChatRoomImportServiceTest.java` — 코드 우선 / fallback / placeholder / 영문 헤더 4 case 추가
- `services/partner-service/src/test/java/.../service/PartnerBlockImportServiceTest.java` — 코드 우선 / fallback / placeholder / 모두 miss 4 case 추가
- `services/notification-service/src/test/java/.../it/ChatRoomMappingAdminControllerIT.java` — `verifyPartnerCode` lenient mock 추가
- `services/notification-service/build.gradle` — OpenCSV + commons-io 의존성 추가 (BE-D commit 누락 보강)
- `.gitignore` — `tools/legacy-gas/` + `.tmp-*` 추가
- `ROADMAP.md` — Phase 10 W10-step-9 row 추가
- `docs/dev-reports/integration-phase-10-step-9-sheet-notion-import.md` 신규

후속 (별도 PR 위임):
- R2 — KakaoDispatchParser 의 카톡 슬립번호 vs partner-service partner_code 명칭 충돌 정리 (entity 컬럼 rename + 마이그레이션 동시 진행)
- BE-E — partner-service 의 실 RestClient `PartnerLookupClient` 구현체 등록 (현재 NoopPartnerLookupClient placeholder)

#### TM 종합 fix — PR #115 5-team 리뷰 + CI fail (2026-05-10)

5-team 리뷰 결과 — Designer ✅ / DevOps ✅ / FE ✅(3 minor) / QA ✅(2 권고) / BE Critical (CI fail 1건). TM 단일 commit 종합 fix:

1. **BE Critical** — notification-service IT 15건 `BeanDefinitionOverrideException` 회귀. `NoopPartnerLookupClient` 의 `@Configuration` + `@Bean` + `@ConditionalOnMissingBean` 가 `@MockBean` 보다 늦게 평가되어 noop bean + mock bean 동시 등록 시도. `@Component` + `PartnerLookupClient` 직접 구현 + class-level `@ConditionalOnMissingBean(PartnerLookupClient.class)` 로 재설계 — component scan 단계에서 안정적 평가. (memory `feedback_it_mockbean_external_clients` 일관)
2. **FE C/F/I minor** — `BlockedPartnersPage` testid `${b.id}` → `${b.partnerCode}` (UUID 비공개), invalidate 위치 `onClose` → `onUpload` resolve (타 3 admin CSV 페이지 패턴 일관). `SalesPartnerDcConfigPage` testid prefix `dc-config-*` → `admin-dcconfig-*` (admin 페이지 일관성).
3. **QA 권고** — `RegionClassifier` 광역 prefix 가중치 알고리즘 추가 ("중구" 4 그룹 모호 키워드 회귀 회피). 1차 광역 prefix 매칭 → 2차 sort_order keywords → 3차 group_name fallback. 회귀 테스트 case 6/7 추가 (7 PASS).
4. **AdminLayout DC 설정 entry** — `/sales/partner-dc-config` link, MASTER 가드 (sales 라우트지만 CSV 일괄 업로드 MASTER 전용 → admin 사이드바에도 진입 편의 노출).

검증:
- `./gradlew :services:notification-service:assemble` → BUILD SUCCESSFUL
- `./gradlew :services:arologis-service:test --tests "*RegionClassifierTest"` → 7 PASS
- `./gradlew assemble -x test` → BUILD SUCCESSFUL (95 actionable)
- `clients/desktop` typecheck → 무에러
- notification IT 15건 — Windows 로컬 Docker 미가용 → Testcontainers skip (정상). CI Linux runner 에서 BeanDefinition 충돌 해소 후 실 IT 동작 확인 (CI 재실행 자동).

### D-P10-18. PR-E 진입 전 선행 — R2 parsedPartnerCode rename + BE-E PartnerLookupClient 실 구현 (2026-05-10)

PR (`feature/integrated-pre-rename-partnerlookup`) — D-P10-17 후속 backlog 2건 (R2 + BE-E) 을 PR-E1 (slip+arologis+inventory 7건) 진입 전 선행 단일 PR 로 정리. Critical Path = arologis 의 partnerCode 명칭 충돌 해소 + notification 의 partner-service 실 호출 활성.

근거:
- **R2** — KakaoDispatchParser 의 `parsed_partner_code` (Long, 카톡 슬립번호 "(에스엠하나공조-214)" 의 214) 와 partner-service 의 `partner_code` (String, "P-2026-0001" 비즈니스 식별자) 가 동일 명칭으로 PR-E1 의 RegionClassifier + PartnerLookupClient 통합 시점에 의미 혼동 위험. PR-E1 진입 전 entity / DTO / service 명칭을 분리해야 lookup 결과 컬럼 신설 시 충돌 0.
- **BE-E** — D-P10-17 시점 NoopPartnerLookupClient (placeholder) 가 production 에서 활성되어 ChatRoom/BlockedPartner CSV import 가 noop empty 반환 → 모든 row reject 회귀. PR-E1 의 import 운영 활성 전에 partner-service 실 호출 RestClient 구현체 등록 의무.
- **단일 PR 통합** — 두 작업 모두 PR-E1 의 선행 의존성이며, 동일 도메인 (arologis ↔ notification ↔ partner-service) 의 partner_code 명칭 정합 작업이라 통합 PR 회귀 비용이 분리 PR 보다 낮음.

영향:
- `services/arologis-service/src/main/resources/db/migration/V4__rename_parsed_partner_code.sql` 신규 — `parsed_partner_code` (BIGINT) → `parsed_kakao_seq` rename + 신규 `parsed_partner_code` (VARCHAR(50)) 컬럼 + 인덱스 rename + 신규 partial index
- `services/arologis-service/src/main/java/.../domain/VehicleStop.java` — `parsedKakaoSeq` (Long) + `parsedPartnerCode` (String) 분리, 9-인자 factory 추가, `updateParsedPartnerCode` setter (PR-E1 lookup 후속 갱신용)
- `services/arologis-service/src/main/java/.../parser/ParsedDispatch.java` (record) — `parsedPartnerCode` → `parsedKakaoSeq` (Long) rename, 7-인자 호환 생성자 보존
- `services/arologis-service/src/main/java/.../parser/KakaoDispatchParser.java` — `parsePartnerCode` → `parseKakaoSeq` 메서드 rename + Javadoc 정정
- `services/arologis-service/src/main/java/.../service/SlipResolver.java` — `resolveByPartnerCode(Long)` → `resolveByKakaoSeq(Long)` rename (의미 동일, naming 만)
- `services/arologis-service/src/main/java/.../controller/ArologisDriverAppController.java` — SlipResolver 호출 이름 정합
- `services/arologis-service/src/main/java/.../dto/{ManualDispatchRequest, ManualDispatchPreviewResponse, DispatchDetailResponse, ParsedDispatchResponse}.java` — Long 카톡 식별자 필드 `partnerCode`/`parsedPartnerCode` → `kakaoSeq`/`parsedKakaoSeq` rename. DispatchDetailResponse.StopDetail 은 `parsedPartnerCode` (String) 추가 (PR-E1 lookup 결과 응답)
- `services/arologis-service/src/main/java/.../service/{DispatchService, DispatchManualService}.java` — VehicleStop 저장 시 `kakaoSeq` 전달
- `services/arologis-service/src/test/java/.../parser/KakaoDispatchParserTest.java` — case 3/8 정정 (`parsedKakaoSeq()`)
- `services/arologis-service/src/test/java/.../it/SignatureIntegrationIT.java` — 코멘트 정정 (`resolveByKakaoSeq`)
- `services/notification-service/src/main/java/.../client/RestClientPartnerLookupClient.java` 신규 — partner-service `GET /internal/partners/{partnerCode}` + `GET /internal/partners/by-name?name=` 호출, X-Internal-Token 인증, 404/409/5xx fail-soft
- `services/notification-service/src/main/resources/application.yml` — `samhan.partner-service.url` (default `http://localhost:8095`) + `samhan.notification.partner-lookup.enabled` (default true) 토글 신규
- `services/notification-service/src/test/java/.../client/RestClientPartnerLookupClientTest.java` 신규 — MockRestServiceServer 5 case (200 정상 / 404 / 409 / 한글 query encode / token 미설정)
- `ROADMAP.md` — Phase 10 PR-E 진입 전 선행 row 추가
- `docs/dev-reports/integration-pre-pr-rename-partnerlookup.md` 신규

후속 (PR-E1):
- arologis V4 의 신규 String 컬럼 `parsed_partner_code` 를 RegionClassifier + PartnerLookupClient 결과로 채우는 batch / parser 통합
- slip-service 의 `/internal/slips/by-partner-code/{code}/recent` endpoint 의 path variable 명칭 정합 (kakaoSeq vs partnerCode 의미 분리) — 본 PR scope 외, slip 측 PR 별도 진행

### D-P10-19. step-10 (PR-E1) GAS B 11건 이식 — 이카운트 엑셀 → 출고전표 자동 조회 + DPS 엑셀 업로드 보존 + REGION 활용 + SMS 2-step (2026-05-10)

PR (`feature/integrated-phase-10-step-10-gas-b-ecount-auto`) — Samhan Public 운영 GAS 11 도구 (사용자 분류 B) 중 7건 (DPS비교 / 가배차 / 미배차 / 지방가배차 / 내일자전표 / 전표정리 / 배차안내 SMS) 을 단일 통합 PR 로 native 이식. 잔여 4건 (원장 / 거래명세서 / 계산서 / 일마감) = accounting-service 도메인 PR-E2 위임.

근거:
- **출고전표 자동 조회 (이카운트 의존 0)** — slip-service `slips` 테이블이 PR #99 (W10-4 전자서명 통합) + PR #115 (W10-step-9 시트 흐름 보강) 시점 partner_code / driver_phone / region 컬럼 구비. PR #116 (R2 + BE-E) 시점 명칭 정합 + PartnerLookupClient 실 호출 활성. step-10 PR-E1 시점 = GAS 의 이카운트 엑셀 업로드 가공 패턴을 자체 자동 조회로 전면 격상 가능.
- **DPS 입고 비교 만 사용자 명시 보존** — 창고 측 표준 운영 절차 (DPS 시스템에서 받은 엑셀 → 자체 슬립 비교) 가 이미 정착되어 있어 자동 조회 격상보다 엑셀 업로드 + 매칭 알고리즘 native 이식이 적합. `DpsExcelParser` + `DpsCompareService` (SLIP/ITEM 단위 매칭) + `RowMismatch` 분류 (QUANTITY=주황 / PARTNER=빨강 / NOT_FOUND=회색).
- **REGION / CHAT / BLOCK 활용 (PR #115 산출)** — 가배차 = `RegionClassifier` 광역 prefix 17 시도 + 권역 그룹핑. 내일자 전표 이미지 = 단톡방별 섹션 + 발송금지 자동 제외 (5 way join: slips × chat × block × region × partner). 배차안내 SMS = 단톡방 매핑 + blocked 가드.
- **SMS preview/send 2-step** — 배차안내는 운영 사고 영향 큼 (잘못 발송 시 거래처 다수 동시 영향). preview 단계에서 단톡방 그룹핑 + 발송금지 가드 검증 후 send 단계 별 도 trigger. dryRun 패턴으로 single-call 사고 회피.
- **Phase B FE 6 ↔ Phase A BE 4 + Designer 1 1:1 매핑** — 11 commits (실 10 + FE-1 두 분할 1) 단일 PR 로 통합. 다중 FE agent race 결과 d163caa commit 메시지가 "FE-1 DPS" 표기이지만 실제 변경 = FE-1+2+6 통합 (사이드바/라우트/가배차/SMS) — rebase 정정 회피, PR body 명시 보완 (`feedback_integrated_pr_pattern` 의 fix 후속 PR 금지 일관).

영향:
- `services/slip-service/src/main/resources/db/migration/V15__add_slip_partner_code_region.sql` 신규 — slips.partner_code (VARCHAR(50)) + classified_region_group (VARCHAR(50)) + 인덱스 3종 (partner_code/region/driver_phone × slip_date partial active)
- `services/slip-service` — `Slip` entity 2 필드 추가 + `SlipRepository extends JpaSpecificationExecutor` + `SlipService.list` 7-arg overload + `SlipController` 5 query param + `NextDaySlipImageService` (5 way join) + `SlipCleanupService` (정합성 flag 4종) + `NotificationChatRoomClient` + `PartnerBlockClient` (Feign + graceful fallback)
- `services/inventory-service` — `DpsCompareController` (multipart + template) + `DpsCompareService` (매칭 알고리즘) + `DpsExcelParser` + `SlipServiceClient` (Feign) + `DpsCompareResponse` / `RowMismatch` DTO
- `services/notification-service` — `DispatchBatchAdminController` (preview + send) + `DispatchBatchPreview/Send/MessageTemplateService` + `SlipServiceClient` / `BlockedPartnerLookupClient` interface + Noop placeholder + 4 DTO (Preview/Send Request/Response)
- `services/arologis-service` — `ArologisAdminController` 3 endpoint (`/dispatches/pre-classify`, `/unassigned`, `/regional`) + `PreClassify/Regional/UnassignedService` + `SlipServiceClient` (skeleton-mode 토글) + `VehicleStopRepository` 활성 dispatch 조회 + 3 DTO + IT 4 파일 SlipServiceClient `@MockBean` 격리 추가
- `clients/desktop` Phase B 6 page — `arologisDispatchApi` / `dispatchSmsApi` / `dpsCompareApi` / `nextDaySlipApi` / `slipCleanupApi` + `ArologisPreClassifyPage` / `ArologisUnassignedPage` / `DispatchSmsPage` / `InventoryDpsComparePage` / `NextDaySlipPage` / `SlipCleanupPage` + `AppLayout` 사이드바 entry 6건 + `routes/index.tsx` 라우트 + `ArologisManualDispatchPage` query 자동 채움
- `clients/desktop/src/renderer/print/NextDaySlipView.tsx` (+CSS Module) Designer 1차 mock — 단톡방별 섹션 + 거래처/슬립 표 + @media print A4 세로 + page-break-after 옵션 (Malgun Gothic, 사용자 Edge 캡처 검토 후 2~5차 iteration)
- 단위 테스트 56 case 신규 (slip 16 + inventory 14 + notification 12 + arologis 14)
- `ROADMAP.md` Phase 10 step-10 row 추가
- `docs/dev-reports/integration-phase-10-step-10-gas-b-ecount-auto.md` 신규

후속 (PR-E2):
- accounting-service 4 도메인 (ledger / statement / tax invoice / daily close) = GAS B 8~11번 native 이식
- NextDaySlipView 인쇄 양식 2~5차 iteration (사용자 Edge 캡처 → CSS-only 미세 조정, `feedback_print_design_iteration`)

### D-P10-20. step-11 (PR-E2) GAS B accounting 4건 이식 — 원장/거래명세서/계산서/일마감 + 자체 분개/세금계산서 자동 조회 (2026-05-10)

PR (`feature/integrated-phase-10-step-11-gas-b-accounting`) — PR #117 (PR-E1, GAS B 11건 중 7건) 머지 후 사용자 명시 GAS B 잔여 4건 (원장 / 거래명세서 / 계산서 / 일마감) 을 accounting-service native 이식. 본 PR 머지 시점 GAS B 11건 매핑 100% 완성, 후속 PR-F (GAS C/D 6건) 진입 가능.

근거:
- **자체 분개 + 세금계산서 자동 조회 (이카운트 의존 0)** — accounting-service `journal_entries / journal_lines / tax_invoices` 테이블이 Phase 4 (PR #28 accounting-slice-A) + Phase 6 (M2/M3/M4/M5 backend 통합 PR #76) + Phase 9 (W4 dashboard 보강) + W10-step-8 (V3/V4 seed 150/919 추가) 시점 한국 일반기업회계기준 65 row 시드 + 401/110/255 코드 + ISSUED 상태 머신 구비. step-11 시점 = GAS 의 이카운트 매출/세금계산서 export 패턴을 자체 자동 조회로 전면 격상 가능.
- **외부 client 3종 도입 (ProductClient + PartnerLookupClient + ChatRoomMappingClient)** — Ledger/StatementBatch 응답에 partner snapshot (사업자번호/대표/주소) + 단톡방 매핑 (운영자 가시성) + product 명칭 (라인 snapshot) 동반. accounting-service 자체 보유 0 → product-service / partner-service / notification-service Feign 호출 의무. 모두 fail-soft (404/5xx 시 응답 partial null) + IT @MockBean 격리 (memory `feedback_it_mockbean_external_clients`).
- **POI 5.2.5 도입 (Apache License 2.0)** — 홈택스 일괄 양식 xlsx 100건 sheet 분할 표준 라이브러리. 내장 Java SXSSF (streaming) 회피 — 100건 단위 sheet 분할은 일반 XSSFWorkbook 의 명시적 batch 분할 패턴이 사용자 운영자 (회계사) 검토 흐름과 정합. memory `project_korean_accounting` 의 한국 일반기업회계기준 표준 정합.
- **단일 통합 PR (5+1 = 6 commits)** — Phase A (BE 1 통합 5 task + Designer 2 view) + Phase B (FE 4) + multi-agent collision 복구 1 = 6 commits 단일 통합 PR. 별도 docs PR 회피 (memory `feedback_continuous_docs_sync` + `feedback_integrated_pr_pattern` 일관).
- **multi-agent collision 복구 패턴** — FE-10 의 `git reset --soft` 가 FE-8 (commit `eb473b4`) + FE-9 (commits `6cf9646` / `8f62b57`) 를 destroy → working tree unstaged 산출 단일 복구 commit `55ebad5` 으로 일괄 stage + commit, destroy 된 SHA 3건 commit body 명시. PR-E1 의 d163caa (FE-1+2+6 통합) 와 동일 패턴 — rebase 정정 회피 + PR body 명시 보완 (`feedback_integrated_pr_pattern` 의 fix 후속 PR 금지 일관). 후속 PR-F 진입 시점 sequential commit 강제 또는 task 별 worktree 분리 검토.

영향:
- `services/accounting-service/build.gradle` — Apache POI 5.2.5 (`poi` + `poi-ooxml`) 의존성 추가
- `services/accounting-service/src/main/java/.../web/AccountingReportController.java` 신규 — 5 endpoint 통합 (`/accounting/sales/aggregate` BE-A8, `/accounting/journals/ledger-data` BE-A9, `/accounting/statements/batch-data` BE-A10, `/accounting/tax-invoice/hometax-export` BE-A11 binary xlsx, `/accounting/closings/daily` BE-A12), 모두 `ACCOUNTANT/MASTER` `@PreAuthorize` 가드, ApiResponse 래핑 (xlsx 제외)
- `services/accounting-service/src/main/java/.../service/SalesAggregateService.java` 신규 — 401 (제품매출) + 110 (외상매출금) 코드 합계 (기간 + partnerCode 옵션)
- `services/accounting-service/src/main/java/.../service/LedgerImageService.java` 신규 — 거래처 snapshot + 단톡방 매핑 + 분개 line 시간순 + 누적 잔액
- `services/accounting-service/src/main/java/.../service/StatementBatchService.java` 신규 — 기간 ISSUED 세금계산서 → 거래처별 그룹핑 + 라인 snapshot
- `services/accounting-service/src/main/java/.../service/HometaxExportService.java` 신규 — POI 100건 sheet 분할 + 한국어 파일명 + 표준 컬럼 (구분/공급자사업자번호/공급가액/세액 등)
- `services/accounting-service/src/main/java/.../service/MonthEndCloseService.java` — `getDailyDetail` 신규 메서드 (read-only, 마감 OPEN/CLOSED 무관)
- `services/accounting-service/src/main/java/.../client/ProductClient.java` + `ProductSummary.java` 신규 — product-service `/internal/products/by-id` Feign + X-Internal-Token + fail-soft
- `services/accounting-service/src/main/java/.../client/PartnerLookupClient.java` + `PartnerSummary.java` 신규 — partner-service `/internal/partners/{partnerCode}` Feign + X-Internal-Token + fail-soft
- `services/accounting-service/src/main/java/.../client/ChatRoomMappingClient.java` 신규 — notification-service `/internal/chat-rooms/by-partner-code` Feign + X-Internal-Token + fail-soft
- `services/accounting-service/src/main/java/.../repository/JournalLineRepository.java` 신규 — Specification 기반 read-only
- `services/accounting-service/src/main/java/.../repository/TaxInvoiceRepository.java` 신규 — 기간 ISSUED 조회
- `services/accounting-service/src/main/java/.../web/dto/{LedgerImageResponse, StatementBatchRow, SalesAggregateRow, DailyClosingDetailResponse}.java` 신규 — 4 DTO, 모두 partnerCode + partnerName + slipNo / taxInvoiceNo / journalNo 만 노출 (UUID 비공개)
- `services/accounting-service/src/test/java/.../service/{SalesAggregateServiceTest, LedgerImageServiceTest, StatementBatchServiceTest, HometaxExportServiceTest, DailyClosingDetailServiceTest}.java` 신규 — 단위 20 case 신규 (4+4+3+5+4) 전부 PASS
- `clients/desktop/src/renderer/api/{partnerLedgerApi, statementBatchApi, hometaxExportApi, closingApi}.ts` 신규 — 4 API client (`getDailyClosingDetail` 신규 포함)
- `clients/desktop/src/renderer/routes/{PartnerLedgerPage, StatementBatchPage, HometaxExportPage}.tsx` 신규 + `MonthEndClosingPage.tsx` 일별 detail 보강 (productName/discount/supply/vat/total + 일별 CSV)
- `clients/desktop/src/renderer/print/{PartnerLedgerView, StatementBatchView}.tsx` (+CSS Module) 신규 — Designer 1차 mock (사용자 Edge 캡처 후 2~5차 iteration `feedback_print_design_iteration`)
- `clients/desktop/src/renderer/components/AppLayout.tsx` 회계 그룹 entry 4건 신규 ("거래처 원장" / "거래명세서 일괄" / "홈택스 일괄 양식" / 일마감 detail) + `clients/desktop/src/renderer/routes/index.tsx` 라우트 5종 (`/accounting/partner-ledger`, `/accounting/statement-batch`, `/accounting/hometax-export`, `/print/partner-ledger`, `/print/statement-batch`)
- `ROADMAP.md` Phase 10 step-11 row 추가
- `docs/dev-reports/integration-phase-10-step-11-gas-b-accounting.md` 신규

GAS B 11건 매핑 (PR-E1 + PR-E2 = 100% 완성):
- PR-E1 (#117) 7건 — DPS비교 (inventory) / 가배차 / 미배차 / 지방가배차 (arologis) / 내일자전표 / 전표정리 (slip) / 배차안내 SMS (notification)
- PR-E2 (본 PR) 4건 — 원장 / 거래명세서 / 계산서 (홈택스 xlsx) / 일마감 (모두 accounting-service)

후속 (PR-F 이후):
- **PR-F** — GAS C/D 6건 진입 (사용자 분류 C/D 도구) 별도 슬라이스
- **인쇄 양식 iteration** — PartnerLedgerView + StatementBatchView 2~5차 (`feedback_print_design_iteration`)
- **POI 5.2.5 운영 진입** — Hometax v2026 표준 회귀 테스트 1건 추가 권장
- **외부 client cache** — Ledger/StatementBatch 의 PartnerLookup/ChatRoom 호출 운영 부하 진입 시점 short-TTL Caffeine cache 검토
- **CI fail 시뮬레이션** — 후속 별도 슬라이스 (사용자 명시)

### D-P10-21. step-12 (PR-F1) GAS C/D 일부 이식 — 알리고 sync (mock) + 운송사 reconcile + Tesseract OCR 결정 (PR-F2 의존, 2026-05-10)

PR (`feature/integrated-phase-10-step-12-gas-cd-vendor`) — PR #117 (PR-E1) + #118 (PR-E2) 머지로 GAS B 11건 native 이식 100% 완성 후, 사용자 분류 GAS C/D 6건 중 vendor 외부 의존 0 인 2건 (C 9번 알리고 자동 업로드 + D 11번 운송사 실배차 비교) 을 단일 통합 PR 로 native 이식. OCR 엔진 의존 2건 (D 10번 에어디자이너 운송장 OCR + D 14번 제이시스템 운송장 OCR) 은 PR-F2 별도 슬라이스 위임 (Tesseract 채택).

근거:
- **알리고 주소록 자동 동기화 (mock 안내)** — 실 알리고 API spec 사용자 입수 전 단계. 본 PR 시점 = `MockAligoAddressBookClient` (dryRun 응답: `added=N, http=200`) 활성, 실 RestClient 구현체 `RestClientAligoAddressBookClient` (TODO comment + skeleton 만) 선등록. 사용자 spec 입수 시점 `samhan.notification.aligo.address-book.dry-run=false` 토글 + RestClient 본문 채우면 즉시 운영 활성. CSV export 양식 (UTF-8 BOM + 헤더 4컬럼 + 비고 `[partnerCode]`) 은 알리고 콘솔 직접 import 호환 표준이라 mock 무관 검증 가능.
- **차단 거래처 자동 제외 + 휴대폰 정규화** — `BlockedPartner` 매칭 row skip + 휴대폰 prefix `010|011|016|017|018|019` 검증 + `+82-10-...` / `00821012345678` 등 8 변형 정규화. 알리고 발송 실패 (잘못된 prefix) + 차단 거래처 실수 발송 양쪽 회귀 차단. 사용자 명시 신용정보 / 전자소송 / 폐업의심 strikethrough filter 는 본 PR 시점 미적용 (status=ACTIVE 만 적용) — 향후 filter 추가 PR 시 BE-1 #5 test (`exportAligoCsv_userNotedStrikethroughFilters_areNotApplied`) 폐기 의무.
- **chunk 50 분할 + 429 backoff retry** — `AligoAddressBookSyncService` 가 chunk 50 (알리고 권장 상한) 으로 분할 + 429 응답 시 backoff 재시도 (`BACKOFF_MAX_RETRIES`) + 소진 시 failed 누적 (운영자 인지). partial fail (첫 chunk success + 둘째 chunk 500) 시 다른 chunk 결과 보장.
- **운송사 실배차 비교 (POI 다중 vendor 양식 매처)** — `VendorExcelParser` 가 4 vendor 양식 헤더 매처 (CJ대한통운 `접수일자/접수시간/업체명` + 롯데 `예약번호/발송일자/발송시간` + 한진 `송장번호/출고일/거래처명` + 2층 헤더 row0 그룹/row1 컬럼 패턴 GAS 11번 호환). 영문 양식 등 미인식 vendor 는 빈 list 반환 (예외 X) 으로 partial parse 보장 — 1개 vendor 양식 미지원이어도 다른 vendor 결과 노출 (전체 fail 회귀 차단).
- **left join TRUE / FALSE_LEFT / FALSE_RIGHT 분류** — `DispatchReconcileService` 가 우리 dispatch ↔ vendor 엑셀 양방향 mismatch 분류. FALSE_LEFT = vendor 누락 (영업 매출 손실 차단) + FALSE_RIGHT = 자체 dispatch 누락 (회계 자동 매출 분개 차단). status filter UI + CSV 다운로드 → 회계 외주 (ACCOUNTANT) 매출 마감 정합 검증 가능.
- **Tesseract OCR 채택 (PR-F2 의존)** — 사용자 결정. 에어디자이너 / 제이시스템 운송장 PDF/이미지 → 운송장번호 / 거래처명 / 일자 OCR 추출. 후보 비교: (1) Tesseract (Apache 2.0, 한국어 학습 모델 `kor.traineddata` 무료, 자체 호스팅, OCR 정확도 80~90%) — 채택, (2) Naver CLOVA OCR (월 ₩100 / 호출, vendor lock-in) — 보류, (3) Google Vision OCR (해외 cloud, 가격 변동) — 보류. PR-F2 시점 = `arologis-service` 또는 신규 `ocr-service` (8098, 미정) Tesseract 4.x JNI binding (`tess4j`) + 한국어 traineddata 동봉 (~10MB) + 후처리 정규화 (운송장번호 12자 hyphen 표준).
- **단일 통합 PR (5 commits) — 별도 docs PR 회피** — Phase A (Designer 1 + BE 2 = 3 commits) + Phase B (FE 1 + QA 1 = 2 commits) 단일 통합 PR. ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴.

영향:
- `services/partner-service/src/main/java/.../partner/service/PartnerAligoExportService.java` 신규 — UTF-8 BOM CSV export + BlockedPartner skip + 휴대폰 정규화 (8 변형 + prefix 검증) + group1 fallback ("기본") + RFC 4180 escape, 단위 7 case PASS
- `services/partner-service/src/main/java/.../partner/controller/PartnerAdminController.java` 신규 — `GET /api/v1/partners/admin/aligo/csv` (MASTER 가드)
- `services/notification-service/src/main/java/.../notification/service/AligoAddressBookSyncService.java` 신규 — chunk 50 분할 + 429 backoff retry + partial fail 누적, 단위 6 case PASS
- `services/notification-service/src/main/java/.../notification/client/{AligoAddressBookClient,MockAligoAddressBookClient,AligoCsvSourceClient,NoopAligoCsvSourceClient,RestClientAligoCsvSourceClient}.java` 신규 — 알리고 client interface + mock dryRun + CsvSource interface (Noop / RestClient 분기)
- `services/notification-service/src/main/java/.../notification/controller/AligoAddressBookController.java` + `dto/AligoAddressBookSyncResponse.java` 신규 — `POST /api/v1/notify/aligo/address-book/sync` (MASTER 가드)
- `services/arologis-service/src/main/java/.../arologis/parser/{VendorExcelParser,VendorExcelRow}.java` 신규 — POI 4 vendor 헤더 매처 + 2층 헤더 패턴 + 영문 양식 빈 list partial parse, 단위 6 case PASS
- `services/arologis-service/src/main/java/.../arologis/service/DispatchReconcileService.java` 신규 — left join TRUE/FALSE_LEFT/FALSE_RIGHT + 다중 vendor + 인자 검증, 단위 9 case PASS
- `services/arologis-service/src/main/java/.../arologis/controller/DispatchReconcileController.java` + `dto/{DispatchReconcileResponse,MismatchedRow}.java` 신규 — `POST /api/v1/arologis/dispatch/reconcile` (DISPATCH/MANAGER/MASTER + multipart)
- `services/arologis-service/src/main/java/.../arologis/repository/DispatchRepository.java` 신규 — 기간 + status (`COMPLETED`) 조회
- `services/arologis-service/build.gradle` — POI 5.2.5 의존성 추가
- `clients/desktop/src/renderer/api/{aligoAddressBookApi,dispatchReconcileApi}.ts` 신규 — 2 API client (multipart 업로드 + binary CSV 다운로드)
- `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.tsx` 신규 — `/admin/aligo-address-book` (AdminLayout MASTER 가드, 거래처 미리보기 + 그룹 dropdown + "동기화 실행" + 결과 chip 4종)
- `clients/desktop/src/renderer/routes/ArologisDispatchReconcilePage.tsx` 신규 — `/arologis/dispatch-reconcile` (DISPATCH/MANAGER/MASTER, drag-drop 다중 업로드 + 시작/종료일 + 비교 실행 + status filter + CSV 다운로드)
- `clients/desktop/src/renderer/components/AdminLayout.tsx` "관리자 (MASTER 전용)" 그룹 entry 1건 신규 ("알리고 주소록 sync") + `routes/index.tsx` 라우트 2건
- `clients/desktop/src/renderer/api/mock.ts` `_resolveMockRole()` 신규 — `?mockRole=MASTER` dev-only override (capture 자동화용)
- `tools/manual-capture/capture-pr-f1.js` 신규 — Playwright headless 캡처 자동화 스크립트 (msedge channel → chromium fallback)
- `docs/qa/phase-10-step-12-gas-cd-vendor/scenarios.md` 신규 — 14 case (1.x 5 + 2.x 6 + 3.x 3 권한/UUID) + 단위 28 case 매핑 + 페르소나 5 + 회귀 위험 7건 + 후속 6건
- `docs/qa/phase-10-step-12-gas-cd-vendor/working-aligo-address-book.png` + `working-dispatch-reconcile.png` 신규 — Playwright 작동 캡처 (한국어 100% + UUID 비공개 통과)
- `ROADMAP.md` Phase 10 step-12 row 추가
- `docs/dev-reports/integration-phase-10-step-12-gas-cd-vendor.md` 신규

후속 (PR-F2 이후):
- **PR-F2** — GAS D 운송장 OCR 2건 (10번 에어디자이너 + 14번 제이시스템) — Tesseract 4.x + tess4j JNI + `kor.traineddata` 동반 + 운송장번호 / 거래처명 / 일자 추출 + 정규화 후처리. 신규 `services/ocr-service` (8098) 또는 `arologis-service` 흡수 미정 (PR-F2 진입 시점 결정).
- **알리고 실 RestClient 활성** — 사용자 알리고 API spec 입수 시점 `RestClientAligoAddressBookClient` 본문 채움 + `samhan.notification.aligo.address-book.dry-run=false` 토글 + 운영 진입 (X-API-Key + 단톡방 token).
- **운송사 vendor sample 다양화** — 본 PR 시점 = CJ대한통운 / 롯데 / 한진 / 2층 헤더 4 vendor 매처. 운영 진입 시점 추가 vendor (한진 / 우체국 / 로젠 등) 헤더 sample 입수 시 매처 keyword 확장.
- **인쇄 양식 iteration** — 운송사 reconcile 결과 CSV 외 PDF / 인쇄 양식 도입 권고 (사용자 Edge 캡처 → CSS-only 미세 조정 `feedback_print_design_iteration`).
- **동일 vendor 다중 파일 합산 정책** — `CJ_2026-05.xlsx` + `CJ_2026-06.xlsx` 동시 업로드 시 vendor 식별자 합산 vs 분리 정책 미정의 — 운영 도입 시 결정 후 case 추가.

### D-P10-22. step-13 (PR-F2) vendor 발주 OCR 이식 — 에어디자이너 + 제이시스템 (Tesseract) + 종합견적서 시트 단가 일원화 (2026-05-10)

PR (`feature/integrated-phase-10-step-13-vendor-ocr`) — PR #119 (PR-F1) 머지로 GAS C/D 6건 중 4건 native 이식 완성 후, 사용자 분류 잔여 OCR 의존 2건 (D 10번 에어디자이너 발주서 OCR + D 14번 제이시스템 발주서 OCR) 단일 통합 PR 이식. OCR 엔진 = Tesseract 4.x + tess4j 5.13 (D-P10-21 결정 재확인 + 본 PR 시점 production setup 완성). 흡수 위치 = `partner-order-service` (발주 도메인 일관성) — 신규 `services/ocr-service` 분리 보류.

근거:
- **Tesseract 흡수 위치 = `partner-order-service`** — D-P10-21 시점 미결 (`arologis-service` 또는 신규 `services/ocr-service` 8098). 본 PR-F2 진입 시점 결정 = `partner-order-service` 흡수. 사유: (1) vendor 발주서 OCR 결과는 즉시 `PartnerOrder` draft 등록으로 이어짐 — 발주 도메인 entity / repository / Controller / 권한 가드 (`SALES/MANAGER/MASTER`) 모두 동일 service 내부 호출 가능, (2) 별도 service 분리 시 OCR 결과 → PartnerOrder draft 의 transactional consistency 가 RestClient + 분산 트랜잭션 회피 패턴 (Saga / Outbox) 필요 → 운영 진입 비용 큼, (3) Tesseract 호출량 = 일 평균 vendor 발주서 ~10건 (현 사용량 기준) 으로 별도 service scaling 불요. 운영 호출량 폭증 시점 (일 100건 이상) 별도 service 분리 + 비동기 큐 도입 검토 (PR-F3 이후 backlog).
- **OcrEngine 추상화 + `@ConditionalOnProperty` 양분기** — `MockOcrEngine` (preset key 매처, dev/test/CI fallback, `samhan.ocr.engine=mock` default) ↔ `TesseractOcrEngine` (tess4j JNI binding, `samhan.ocr.engine=tesseract` 운영). Tesseract native 라이브러리 미설치 환경 (Windows dev / macOS dev / 한글 경로 JDK 17) 에서 ApplicationContext 부팅 실패 회귀 차단 의무 — `@ConditionalOnProperty(name="samhan.ocr.engine", havingValue="tesseract")` 가 미설치 시 자동 비활성 + 운영자 503 graceful 안내. PR-F1 회귀 가드 `*Bean` suffix 일관 (`mockOcrEngineBean` / `tesseractOcrEngineBean`).
- **vendor parser 분리 패턴 + 자동 detect** — `VendorOrderParser` interface + `AirDesignerOrderParser` (keyword "에어디자이너" + 라인 정규식 `^\d+\.\s*(.+)\s*\[(.+)\]\s*(\d+)개\s*([\d,]+)원`) + `JSystemOrderParser` (keyword "제이시스템" + 표 형식 row 매처). `VendorParserRegistry` 가 자동 detect (첫 5줄 keyword score) + `vendorHint` 명시 시 우회. 신규 vendor 양식 추가 시 `VendorOrderParser` interface + `register()` 만 구현하면 자동 detect 진입 — vendor 양식 다양화 운영 진입 비용 최소화.
- **단가 lookup 우선순위 = CATALOG (시트) > OCR > MANUAL** — `VendorOrderService` 가 OCR parser 결과 라인 → `ProductCatalogLookupClient` (모델 코드 lookup) → 시트 단가 (`source="CATALOG"`) → 시트 미존재 시 OCR 단가 (`source="OCR"`) → FE inline edit 시 (`source="MANUAL"`). DC 적용 = `DcConfigClient.findHomeDiscount(partnerCode)` (PR #115 산출 활용). 합계 불일치 (OCR 합계 vs 라인 합산) 시 `suggestions` 메시지 노출 — 운영자 인지 동선 확보.
- **종합견적서 시트 단가 일원화** — 본 PR 시점 `ProductCatalogLookupClient` 가 호출하는 시트 단가 source 가 운영상 다중 시트 (가정용 / 업소용 / 종합견적서) 분산 → **종합견적서 시트 단가로 일원화** 결정. 사유: 사용자 운영 표준 = 거래처 견적 / 계산서 / 발주 모두 종합견적서 단가 기준. PR-F2 시점 = client 인터페이스만 정착, 실제 시트 source 통합은 PR-G2 (예정) 또는 product-service `ProductCatalogClient` 의 시트 ID 환경변수 (`samhan.product.catalog-sheet-id`) 정정 시점 동시 진입.
- **단일 통합 PR (5 commits) — 별도 docs PR 회피** — Phase A (DevOps 1 + Designer 1 + BE 1 = 3 commits) + Phase B (FE 1 + QA 1 = 2 commits). ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴.

영향:
- `services/partner-order-service/src/main/java/.../partnerorder/vendor/ocr/{OcrEngine,MockOcrEngine,TesseractOcrEngine,OcrEngineConfig,OcrProperties,OcrException}.java` 신규 — OCR engine 추상화 + Tesseract 4.x JNI binding (tess4j 5.13) + 503 graceful fallback
- `services/partner-order-service/src/main/java/.../partnerorder/vendor/parser/{VendorOrderParser,AirDesignerOrderParser,JSystemOrderParser,ParsedVendorOrder,VendorParserRegistry}.java` 신규 — vendor parser interface + 2 구현체 + 자동 detect registry
- `services/partner-order-service/src/main/java/.../partnerorder/vendor/service/VendorOrderService.java` 신규 — multipart → OCR → parser → catalog lookup → DC 적용 → response, 단위 7 case PASS
- `services/partner-order-service/src/main/java/.../partnerorder/vendor/client/{PartnerLookupClient,PartnerSummary,ProductCatalogLookupClient}.java` 신규 — RestClient + X-Internal-Token + fail-soft empty Map
- `services/partner-order-service/src/main/java/.../partnerorder/vendor/web/VendorOrderController.java` + `dto/{VendorOrderUploadResponse,VendorOrderConfirmRequest,VendorOrderConfirmResponse}.java` 신규 — `POST /api/v1/admin/partner-order/vendor/{upload,confirm}` (SALES/MANAGER/MASTER + multipart)
- `services/partner-order-service/build.gradle` — tess4j 5.13.0 의존성 추가
- `services/partner-order-service/src/main/resources/application.yml` — Tesseract 설정 4종 (`samhan.ocr.{engine,tessdata-path,languages,timeout-ms}`)
- `services/partner-order-service/src/test/java/.../it/{ApplicationContextLoadIT,VendorOrderControllerIT}.java` 신규 — Spring context 부팅 검증 + 외부 client `@MockBean` 격리 (PR-F1 회귀 가드 일관)
- `clients/desktop/src/renderer/api/vendorOrderApi.ts` 신규 — multipart 업로드 + 확정 등록 2 endpoint client
- `clients/desktop/src/renderer/routes/SalesVendorOrderUploadPage.tsx` + `.module.css` 신규 — 3-step wizard (`/sales/vendor-order/upload`, SALES/MANAGER/MASTER)
- `clients/desktop/src/renderer/components/AppLayout.tsx` "영업 (SALES)" 그룹 entry "발주서 OCR 업로드" 신규 + `routes/index.tsx` 라우트 1건
- `clients/desktop/src/renderer/api/mock.ts` vendor OCR fixture 4 preset 추가 (capture 자동화 의존)
- `tools/manual-capture/capture-pr-f2.js` 신규 — Playwright headless 캡처 자동화 (msedge → chromium fallback)
- `docs/qa/phase-10-step-13-vendor-ocr/scenarios.md` 신규 — 15 case (1.x 5 + 2.x 5 + 3.x 1 + 4.x 4) + 단위 30 case 매핑 + 페르소나 5 + 회귀 위험 + 후속 backlog
- `docs/qa/phase-10-step-13-vendor-ocr/working-vendor-order-step{1-upload,2-preview,3-confirm}.png` 신규 — Playwright 작동 캡처 3 PNG (한국어 100% + UUID 비공개 통과)
- `.github/workflows/ci.yml` — Linux runner Tesseract 설치 step 추가 (CI IT 가능)
- `docs/dev-environment/tesseract-setup.md` 신규 — Windows / macOS / Ubuntu / Docker / EC2 m5.xlarge 5 환경 설치 절차 + `kor.traineddata` 다운로드
- `.gitignore` — traineddata 대용량 binary 7건 무시
- `README.md` — Tesseract 설치 안내 link 추가
- `ROADMAP.md` Phase 10 step-13 row 추가
- `docs/dev-reports/integration-phase-10-step-13-vendor-ocr.md` 신규

후속 (PR-G1 이후):
- **PR-G1 — slip-service e-Count schema 보강 + API 제거** — 본 PR 머지 후 즉시 진입 (사용자 명시). 자체 분개 + 출고전표 자동 조회 + accounting-service native 이식 (PR #117 + #118) 완성 후 schema 정리 단계.
- **종합견적서 시트 단가 일원화 — `samhan.product.catalog-sheet-id` 환경변수 정정** — PR-G2 (예정) 또는 product-service `ProductCatalogClient` 정정 시점. 본 PR 시점 = client 인터페이스만 정착, 실제 시트 source 통합은 후속 PR 진입.
- **OCR 후처리 정규화 보강** — 운송장번호 12자 hyphen 표준 / 모델코드 대소문자 / 단가 천단위 콤마 정규화. 운영 진입 시 OCR fail rate 측정 후 보강.
- **신규 vendor 양식 추가 시 parser 등록 패턴 정착** — `VendorOrderParser` interface + `VendorParserRegistry.register()` 만 구현하면 자동 detect 진입 (등록 절차 dev-report § 4 명시).
- **`services/ocr-service` 분리 검토** — 운영 호출량 폭증 시점 (일 100건 이상) 별도 service (8098, 미정) 분리 + 비동기 큐 도입 검토.
- **인쇄 양식 — 발주서 확정 후 vendor 회신용 PDF / 인쇄 양식** — 사용자 Edge 캡처 → CSS-only 미세 조정 (`feedback_print_design_iteration`) iteration.

### D-P10-15. 사용자 강화 가드 (2026-05-08) — Phase 11 위임 0건 + 본 PR 잔존 backlog 모두 채택

W10-4 (PR #99) 종합 TM 시점 잔존 4 fix (DV-3 / DV-2 흡수 / Grafana JSON / 운영 진입 검증 plan) 모두 본 PR 채택 — Phase 11 위임 0건.

근거:
- 기존 사용자 가드 (`feedback_integrated_pr_pattern.md` § "fix 후속 PR/Phase 위임 금지", 2026-05-07) 강화 — 통합 PR 의 backlog 흩뿌리기 패턴 차단
- `shared/security` module 추출 (DV-3) 은 13 service 회귀 위험 큼 — 본 PR 의 InternalTokenFilter 신규 (slip-service) 와 동시 진입이 follow-up 분리보다 회귀 검증 비용 누적 측면 유리
- Flyway V11 CONCURRENTLY (DV-2) — V10 + V11 한 PR 동시 채택이 production cutover 시점 `executeInTransaction = false` 운영 가드 학습 비용 최소화
- Grafana JSON dashboard — Phase 11 진입 시점 즉시 사용 가능

영향:
- DV-3 — `shared/security` 신규 module + 13 service refactor (auth/user/product/inventory/slip/accounting/partner/partner-order/dc-config/dashboard/groupware/notification/arologis)
- DV-2 흡수 — `services/slip-service/src/main/resources/db/migration/V11__concurrently_signature_indexes.sql` 신규 (`-- ${flyway:executeInTransaction:false}` 명시)
- Grafana — `infrastructure/grafana/dashboards/arologis-slip-bridge.json` 신규 (4 panel + alert 1)
- dev-report § 11 — 운영 진입 검증 plan 5 case 명시 (signature_source 분류 / Grafana / Flyway lock 시뮬레이션 / SlipClient SLA / shared/security 회귀)

---

## Phase 12 결정 (실시간 협업 시리즈, 2026-05-09 ~)

### D-P12-01. 실시간 통신 = SSE (Spring `SseEmitter`) 표준 채택 + 단일 노드 in-memory broker + JWT 헤더 + `slip_comments` 신규 + Flyway V17 (PR-H1, 2026-05-10)

PR (`feature/integrated-phase-12-step-1-websocket-infra`) — PR #122 (운영 검증 인프라) 머지 후 사용자 결정 옵션 A (Phase 12 실시간 협업 시리즈, 총 ~13주) 진입. 시리즈 1/4 = SSE infra + slip 코멘트 smoke. **Samhan Public 핵심 가치 = "두 사람이 같은 전표 보고 한 명 코멘트 → 다른 사람에게 실시간 반영"** 의 최소 검증 단계.

근거:
- **실시간 통신 = SSE (Spring `SseEmitter`) 표준 채택** — 후보 비교: (A) WebSocket / STOMP, (B) SSE / `SseEmitter`, (C) 외부 SaaS (Pusher / Firebase Realtime / Ably). **B 채택**. 사유: (1) Samhan Public 통신 흐름 = 단방향 server → client push 가 99% (코멘트 broadcast / audit overlay / slip 라이프사이클 변경 / 권한 수락 알림 모두 server → client). 양방향이 필요한 시나리오 (PR-H3 권한 수락) 도 client → server 는 일반 REST POST 로 처리 가능 → WebSocket / STOMP 의 양방향 양식 비용 불요. (2) HTTP/1.1 keep-alive + 재연결 = 기존 nginx / AWS ALB / Cloudflare 인프라 그대로 사용 가능 (WebSocket upgrade 별도 라우팅 가드 불요). (3) Spring `SseEmitter` 표준 = JDK 표준 + Spring Web MVC 내장, 외부 라이브러리 의존 0. (4) 외부 SaaS 의존 0 (사용자 핵심 가치 = self-host 100%, 외부 SaaS 비용 / 데이터 주권 / 장애 의존도 회피). (5) 회귀 가드 단순 — `MockMvc` async dispatch + `SseEmitter` IT case 만으로 검증 가능 (WebSocket session manager mock 비용 회피).
- **단일 노드 in-memory `Map<UUID, CopyOnWriteArrayList<SseEmitter>>` broker** — `SlipRealtimeBroker` = `ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>>` 기반. 단일 노드 운영 가정 (현 시점 cafe24 단일 + Phase 11 AWS 단일 환경 = `project_phase11_aws.md` Seoul `m5.xlarge` 단일). 다중 노드 진입 시 PR-H4 시점 Redis Pub/Sub 분기 추가 (slip-service → Redis publish → 모든 노드 subscribe → 각 노드의 in-memory broker → SseEmitter 노드별 broadcast). 본 PR-H1 시점 = 단일 노드 in-memory 만 + 30s heartbeat (idle 연결 cleanup) + IOException / IllegalStateException 자동 cleanup.
- **JWT 헤더 인증 (`Authorization: Bearer <token>`)** — SSE 연결 시 EventSource 표준은 헤더 주입 불가 → 후보 비교: (A) 쿼리 파라미터 `?token=...`, (B) fetch+ReadableStream polyfill 로 헤더 주입, (C) 쿠키 기반 세션. **B 채택**. 사유: (1) 쿠키 세션은 JWT stateless 패턴 회귀, (2) 쿼리 파라미터는 access log / 캐시 / 브라우저 history 노출 위험. desktop = `fetch + ReadableStream polyfill` 로 헤더 주입, mobile-staff = `react-native-sse@^1.2.1` 가 헤더 주입 표준 지원. gateway `HeaderAuthenticationFilter` 패턴 일관 (SSE 라우트도 동일 인증 흐름).
- **`slip_comments` 신규 entity + Flyway V17** — slip 라이프사이클 10단계와 분리된 자유 코멘트 도메인. BaseEntity 7 audit 의무 + Soft Delete (`is_deleted = false` `@SQLRestriction`) + `slip_id` FK + `author_user_id` FK + `body TEXT` + 부분 인덱스 (`WHERE is_deleted = false ORDER BY created_at DESC`). 단위 9 case (Service 5 + Broker 4) + IT 5 case (SSE subscribe / POST 201 / GET 200 / broker cleanup / 403 권한 거부) PASS.
- **gateway `httpclient.response-timeout: 600s` (SSE keep-alive)** — Spring Cloud Gateway default 60s 가 SSE 장기 연결을 끊음. 600s (10분) 로 확장 + slip-service `samhan.realtime.heartbeat-seconds=30` (default) 로 30초마다 heartbeat event 발송 → 연결 keep + idle cleanup. nginx production 시점 = `proxy_read_timeout 600s` + `proxy_buffering off` + `gzip off` (운영 hint `docs/devops/realtime-sse-production.md` 명시).
- **Designer `userIdToColor` HSL deterministic hash util 시드** — PR-H2 (slip audit overlay + 실시간 sync) 진입 시 사용자별 색상 표시 의존. `clients/web/design-system/src/utils/userColorHash.ts` 신규 + Storybook 1 story (5 userId 색상 swatch + Determinism 검증). 본 PR-H1 시점 = util 만 시드, 실제 audit overlay UI = PR-H2 진입.
- **multi-context Playwright 작동 캡처 4 PNG (사용자 핵심 가치 시각 증거)** — `tools/manual-capture/capture-pr-h1.js` = `browser.newContext` 2회로 사용자 A / B 분리 + `addInitScript` 으로 mock comments seed 사전 주입 + `sharp` 로 좌-우 합성 (1280+1280=2560) + 한국어 라벨 헤더 60px. 4 PNG = (1) `working-comment-context-a-input.png` (사용자 A MASTER 영업 코멘트 입력 직전), (2) `working-comment-context-a-after-send.png` (사용자 A 전송 직후 optimistic 표시), (3) `working-comment-context-b-receives.png` (사용자 B SALES 창고 SSE 시뮬레이션 수신), (4) `working-multi-context-split.png` (좌-A 우-B 한 화면 합성). PR body inline raw URL + commit-pinned + HEAD 200 검증 의무 (memory `feedback_pr_qa_screenshots`).
- **단일 통합 PR (6 commits) — 별도 docs PR 회피** — Phase A (DevOps 1 + BE 1 + FE-1 desktop + FE-2 mobile-staff + Designer = 5 commits) + Phase B (QA 1 = 1 commit). ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴.

영향:
- `services/slip-service/src/main/java/.../slip/realtime/{SlipRealtimeBroker,SlipRealtimeController}.java` 신규 — `SseEmitter` 표준 + in-memory broker + 30s heartbeat + IOException/IllegalStateException cleanup
- `services/slip-service/src/main/java/.../slip/comment/{domain/SlipComment,repository/SlipCommentRepository,service/SlipCommentService,web/SlipCommentController,web/dto/{AddSlipCommentRequest,SlipCommentResponse}}.java` 신규 — slip_comments 도메인 (BaseEntity 7 audit + Soft Delete + ROLE 가드 + ApiResponse wrapper)
- `services/slip-service/src/main/resources/db/migration/V17__add_slip_comments.sql` 신규 — `slip_comments` 신규 + 부분 인덱스 + BaseEntity 7 audit
- `services/slip-service/src/main/resources/application.yml` — `samhan.realtime.heartbeat-seconds` property + `@EnableScheduling` 활성
- `services/slip-service/src/test/java/.../slip/{comment/it/SlipRealtimeControllerIT,comment/service/SlipCommentServiceTest,realtime/SlipRealtimeBrokerTest,it/ApplicationContextLoadIT}.java` 신규 / 보강 — 단위 9 + IT 5 case PASS
- `services/api-gateway/src/main/resources/application.yml` — `httpclient.response-timeout: 600s` (SSE keep-alive)
- `infrastructure/env-templates/{api-gateway,slip-service}.env` — `SAMHAN_REALTIME_HEARTBEAT_SECONDS=30` + gateway response-timeout 600s
- `clients/desktop/src/renderer/realtime/SlipRealtimeClient.ts` 신규 — fetch+ReadableStream polyfill (JWT header + 5s reconnect backoff)
- `clients/desktop/src/renderer/api/slipComment.ts` 신규 — list + add 2 endpoint client
- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` 보강 — 코멘트 Card (useQuery + useEffect SSE + optimistic add, data-testid 4종)
- `clients/desktop/src/renderer/api/mock.ts` 보강 — POST/GET `/comments` mock (`globalThis.__SAMHAN_MOCK_COMMENTS_SEED` 으로 capture 시점 seed 주입)
- `clients/mobile-staff/package.json` — `react-native-sse@^1.2.1` 의존 추가 (RN EventSource polyfill)
- `clients/mobile-staff/src/realtime/SlipRealtimeClient.ts` 신규 — `subscribeToSlip` + heartbeat watchdog 60s
- `clients/mobile-staff/src/api/slipComment.ts` 신규 — list/create/delete + ApiResponse wrapper assert
- `clients/mobile-staff/src/screens/SlipDetailScreen.tsx` 신규 — slip 정보 + 코멘트 list/입력/전송 + SSE invalidate
- `clients/mobile-staff/src/screens/driver/{DriverDashboardScreen,DriverTabNavigator}.tsx` 보강 — slip card 에서 "전표 보기 / 코멘트" 진입 link + minimal stack push
- `clients/web/design-system/src/utils/{userColorHash.ts,userColorHash.stories.tsx}` 신규 — HSL deterministic hash util + Storybook 1 story (PR-H2 audit overlay 의존 시드)
- `clients/web/design-system/src/{index.ts,utils/index.ts}` — barrel export 보강
- `docs/devops/realtime-sse-production.md` 신규 — nginx config + AWS ALB / cafe24 운영 hint
- `docs/uiux/phase12/H1-comment-smoke.md` 신규 — wireframe + 한국어 라벨
- `docs/qa/phase-12-step-1-websocket-infra/scenarios.md` 신규 — 14 case (subscribe + broadcast 5 + 다중 client 5 + API contract 4) + 페르소나 5
- `docs/qa/phase-12-step-1-websocket-infra/working-{comment-context-a-input,comment-context-a-after-send,comment-context-b-receives,multi-context-split}.png` 신규 — multi-context Playwright 작동 캡처 4 PNG
- `tools/manual-capture/capture-pr-h1.js` 신규 — Playwright headless 자동화 (msedge → chromium fallback, browser.newContext 2회 분리, sharp 좌-우 합성)
- `ROADMAP.md` Phase 12 row + Phase 12 section 신규
- `docs/dev-reports/integration-phase-12-step-1-websocket-infra.md` 신규

후속 (PR-H1 머지 후):
- **PR-H2 (~3주) — slip audit overlay + 실시간 sync** — slip 라이프사이클 10단계 변경 시 모든 접속 client 에게 SSE broadcast (DRAFT→SAVED→DISPATCHED→...→COMPLETED) + 사용자별 색상 audit overlay (userColorHash 활용) + 변경 이력 timeline UI. 본 PR-H1 머지 후 즉시 진입.
- **PR-H3 (~1.5주) — 권한 / 수락 / 거절 워크플로우** — 영업 → 창고 → 기사 인계 시점 명시적 수락 + SSE 양방향 push.
- **PR-H4 (~7주) — 전 15 service 확장** — partner / inventory / accounting / arologis / dashboard 등 14 backend MSA 도메인 모두 SSE 채널 도입 + `shared/realtime` module 추출 + Redis Pub/Sub 분기 (다중 노드 진입 시 활성).

---

### D-P12-02. slip audit overlay (Flyway V18) + 실시간 sync (`slip:edit` SSE event) + TM 보완 3건 흡수 (multi-emitter 동시성 IT + ArgumentCaptor SSE payload + `RedisRealtimeBroker` config toggle) (PR-H2, 2026-05-10)

PR (`feature/integrated-phase-12-step-2-slip-audit-overlay`) — PR #123 (PR-H1 SSE infra + slip 코멘트 smoke) 머지 후 Phase 12 시리즈 2/4 진입. **사용자 핵심 요구 = "두 사람이 같은 전표 보면서 한 명이 메모를 수정하면 다른 사람 화면에 1초 안에 취소선 + 수정자 색상 + 수정자 이름 + 수정 시각 으로 audit overlay 가 표시"** 의 4 요소 시각 검증 단계. PR-H1 시드 `userIdToColor` HSL hash util 활용 + audit overlay 컴포넌트 도입 + TM 보완 3건 흡수 (사용자 명시 = "multi-emitter 동시성 / ArgumentCaptor SSE payload / Redis broker config toggle").

근거:
- **Flyway V18 (`slip_audit_logs` + `slips.revision_count`) 신규** — slip 본문 필드 변경 (memo / shippingAddress / contactPhone / partnerName / discountRate 등 11 필드 시범) 마다 1 row 누적 + revisionNo 그룹핑. BaseEntity 7 audit (id / created_at / created_by_user_id / updated_at / updated_by_user_id / is_deleted / version) + Soft Delete (`@SQLRestriction("is_deleted = false")`) + 부분 인덱스 (`WHERE is_deleted = false ORDER BY revision_no DESC`). `slips.revision_count BIGINT NOT NULL DEFAULT 0` 누적 카운터 → desktop / mobile-staff 수정 횟수 chip / 헤더 표시 의존.
- **`SlipAuditLogService` 4 책임 (record / recordBatch / listBySlip / revertToRevision)** — `recordOverlayPatch(slipId, fieldName, oldValue, newValue, actor)` 단일 필드 + `recordBatch(slipId, changes[], actor)` 다중 필드 (1 revision = N field rows) + `listBySlip(slipId, limit)` 최신순 + `revertToRevision(slipId, revisionNo, actor)` 신규 revision 으로 audit 영원 보존 (덮어쓰기 금지). actor = `{actorId, actorName, actorColor (userIdToColor hash)}` snapshot (UUID 비공개 가드 — 화면 노출은 actorName + actorColor 만).
- **`Slip.applyOverlayPatch/readOverlayField/incrementRevision` 11 필드 시범** — 도메인 entity 에 자체 reflection-free `switch` 패턴 (memo / shippingAddress / contactPhone / partnerName / discountRate 등). `applyOverlayPatch(name, value)` 마감 lock 가드 (`SlipService.applyOverlayPatch` wrapper) + `readOverlayField(name)` audit oldValue snapshot. 11 필드 시범 → PR-H3 / PR-H4 시점 전 60+ 필드 확장 plan.
- **신규 endpoint 3 (`GET /audit-logs` / `PATCH /audit/overlay` / `POST /audit/revert/{n}`)** — (1) `GET /slips/{id}/audit-logs` 인증 사용자 전체 (도메인 권한 0, 이력 조회 자유), (2) `PATCH /slips/{id}/audit/overlay` SALES / WAREHOUSE / MANAGER / MASTER (DRIVER 차단), (3) `POST /slips/{id}/audit/revert/{revisionNo}` MANAGER / MASTER 만 (영업 / 창고 / 기사 차단). ApiResponse wrapper 의무 (PR #98 D-P10-12 일관) + ROLE 풀네임 가드 (memory `feedback_role_naming_full`).
- **`SlipService.editHeader` memo diff → `SlipAuditLogService.recordBatch` + SSE `slip:edit` broadcast** — 기존 editHeader 호출 시 memo 변경 감지 → audit row 1 (혹은 다중) + `SlipRealtimeBroker.publish(slipId, "slip:edit", {revisionNo, actorId, actorName, actorColor, changes[]})` payload 5 키 일치 (ArgumentCaptor 검증 의무). 사용자 핵심 요구 "1초 안 sync" 측정 — multi-context Playwright `working-multi-context-edit-split.png` 시각 증거 1 PNG.
- **design-system `AuditOverlay` 컴포넌트 (취소선 + 색상 dot + 수정자명 + 시각) + Storybook 4 story** — `clients/web/design-system/src/components/AuditOverlay/AuditOverlay.tsx` 신규. props = `{currentValue, history[]}` history 항목 = `{revisionNo, oldValue, newValue, actorName, actorColor, occurredAt}`. CSS `text-decoration: line-through` (oldValue) + `<span class="dot" style="background:${actorColor}">` (사용자 색상) + 수정자명 (actorName) + 시각 (relative). Storybook 4 story = Single / Multiple / Empty / MultiUserShowcase. desktop = 직접 import, mobile-staff = RN 1:1 복제 (`clients/mobile-staff/src/components/AuditOverlay.tsx`, RN Text strikethrough + View dot).
- **TM 보완 #1 — `SlipRealtimeBrokerConcurrencyIT` (multi-emitter 동시성 3 case, 사용자 명시)** — broker `Map<UUID, CopyOnWriteArrayList<SseEmitter>>` race condition 회귀 가드: (1) 50 emitter 동시 subscribe → broker subscriber count = 50 정확, (2) cleanup race — 동시 publish + emitter close → no exception + count 정정, (3) 100 emitter / 1000 publish → 전체 emitter 1000 receive (lost 0). `CountDownLatch` + `Executors.newFixedThreadPool(N)` 패턴.
- **TM 보완 #2 — `SlipAuditPayloadCaptorTest` (ArgumentCaptor SSE payload schema 3 case, 사용자 명시)** — `SlipRealtimeBroker.publish` 호출 시 payload 구조 정합 검증: (1) `slip:edit` event = `{revisionNo, actorId, actorName, actorColor, changes[]}` 5 키 일치, (2) `slip:reverted` event = revert 시 신규 revision payload 동일 구조, (3) `changes[]` 다중 필드 = `[{fieldName, oldValue, newValue}, ...]` schema. Mockito `ArgumentCaptor<Map<String, Object>>` + JSON schema assert.
- **TM 보완 #3 — `RedisRealtimeBroker` + `RedisRealtimeConfigBean` + `RealtimePublishHook` (config toggle, 사용자 명시)** — `SAMHAN_REALTIME_BROKER` 환경변수 / `samhan.realtime.broker` property = `in-memory|redis` toggle. **default = `in-memory`** (단일 노드 cafe24 / Phase 11 AWS 단일 환경 일관) + `redis` 옵션 시 `RedisRealtimeBroker` 활성 (Lettuce Pub/Sub publisher / subscriber + 노드별 in-memory broker 로 fanout). `RedisRealtimeConfigBean` (`*Bean` suffix 가드 PR #119 회귀 가드 일관) — Redis 미연결 시 startup 정상 (graceful fallback). PR-H4 시점 다중 노드 진입 시 toggle 만으로 활성 (D-P12-01 시점 plan 한 분기 시드).
- **단위 24 + IT 9 case + multi-context Playwright 작동 캡처 4 PNG** — 단위 = `SlipAuditLogServiceTest` 6 + `SlipAuditLogServiceRevertTest` 4 + `SlipAuditPayloadCaptorTest` 3 + `SlipServiceAuditDiffTest` 5 + `RedisRealtimeBrokerTest` 3 + `Slip` overlay patch 단위 3. IT = `SlipRealtimeBrokerConcurrencyIT` 3 + `SlipAuditPayloadCaptorTest` SSE schema 3 (단위/IT 양쪽 카운트) + `ApplicationContextLoadIT` `SlipAuditLogService` 단일 등록 가드 + 기존 PR-H1 IT 5 회귀 PASS. 작동 캡처 = `working-audit-overlay-context-a-edit.png` (97KB) / `working-audit-overlay-context-b-receives.png` (90KB) / `working-audit-overlay-multi-revision.png` (102KB) / `working-multi-context-edit-split.png` (120KB, 핵심 시각 증거 = 좌-A 우-B 합성). PR body inline raw URL + commit-pinned + HEAD 200 검증 의무 (memory `feedback_pr_qa_screenshots`).
- **단일 통합 PR (5 commits) — 별도 docs PR 회피** — Phase A (DevOps 1 + BE 1 + FE-1 desktop+design-system 1 + FE-2 mobile-staff 1 = 4 commits) + Phase B (QA 1 = 1 commit). ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴 일관.

영향:
- `services/slip-service/src/main/java/.../slip/audit/{domain/SlipAuditLog,repository/SlipAuditLogRepository,service/SlipAuditLogService,web/SlipAuditLogController,web/dto/{OverlayPatchRequest,SlipAuditLogResponse}}.java` 신규 — audit overlay 도메인 (BaseEntity 7 audit + Soft Delete + ApiResponse wrapper + ROLE 풀네임 가드)
- `services/slip-service/src/main/java/.../slip/domain/Slip.java` — `applyOverlayPatch` / `readOverlayField` / `incrementRevision` 11 필드 시범 (memo / shippingAddress / contactPhone / partnerName / discountRate 등)
- `services/slip-service/src/main/java/.../slip/service/SlipService.java` — `applyOverlayPatch` wrapper (마감 lock 가드) + `editHeader` memo diff → `recordBatch` + SSE `slip:edit` broadcast
- `services/slip-service/src/main/java/.../slip/realtime/{RedisRealtimeBroker,RedisRealtimeConfigBean,RealtimePublishHook}.java` 신규 — Redis Pub/Sub config toggle (`SAMHAN_REALTIME_BROKER=in-memory|redis`, default in-memory, 미연결 startup 정상, `*Bean` suffix 가드)
- `services/slip-service/src/main/java/.../slip/realtime/SlipRealtimeBroker.java` — publishCount / publishFailureCount / heartbeatCount 통계 보강 (TM 보완 IT 의존)
- `services/slip-service/src/main/resources/db/migration/V18__add_slip_audit_logs.sql` 신규 — `slip_audit_logs` 신규 + `slips.revision_count BIGINT NOT NULL DEFAULT 0` + 부분 인덱스 + BaseEntity 7 audit
- `services/slip-service/src/main/resources/application.yml` — `samhan.realtime.broker` config toggle + `spring.data.redis` host/port
- `services/slip-service/build.gradle` — `spring-boot-starter-data-redis` 의존 추가 (config toggle redis 옵션 지원)
- `services/slip-service/src/test/java/.../slip/audit/service/{SlipAuditLogServiceTest,SlipAuditLogServiceRevertTest,SlipAuditPayloadCaptorTest}.java` 신규 — 단위 6+4+3 = 13 case
- `services/slip-service/src/test/java/.../slip/service/{SlipServiceAuditDiffTest,SlipServiceTest}.java` — memo diff 5 case + 회귀 3 case
- `services/slip-service/src/test/java/.../slip/realtime/{SlipRealtimeBrokerConcurrencyIT,RedisRealtimeBrokerTest}.java` 신규 — IT 3 + 단위 3 case
- `services/slip-service/src/test/java/.../slip/it/ApplicationContextLoadIT.java` — `SlipAuditLogService` 단일 등록 가드 보강
- `infrastructure/env-templates/slip-service.env` — `SAMHAN_REALTIME_BROKER=in-memory` (default) + `REDIS_HOST` / `REDIS_PORT` placeholder
- `clients/web/design-system/src/components/AuditOverlay/{AuditOverlay.tsx,AuditOverlay.module.css,AuditOverlay.stories.tsx,index.ts}` 신규 — 취소선 + 색상 dot + 수정자명 + 시각 + Storybook 4 story (Single / Multiple / Empty / MultiUserShowcase) + barrel export 보강
- `clients/web/design-system/src/index.ts` — AuditOverlay barrel export
- `clients/desktop/src/renderer/api/slipAudit.ts` 신규 — `listAuditLogs` + `revertToRevision`
- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` 보강 — `auditLogsQuery` + 수정 횟수 chip (`slip-detail-revision-count`) + AuditOverlay 적용 (memo / shippingAddress) + 복원 dropdown (`slip-detail-revert-select`) + SSE `slip:edit` cache invalidate
- `clients/desktop/src/renderer/api/mock.ts` — audit-logs / overlay PATCH / revert mock endpoint (capture 자동화 의존)
- `clients/mobile-staff/src/utils/userColorHash.ts` 신규 — design-system 1:1 RN 호환 복제
- `clients/mobile-staff/src/components/AuditOverlay.tsx` 신규 — RN Text 취소선 + View dot 색상 + 수정자명/role
- `clients/mobile-staff/src/screens/SlipDetailScreen.tsx` 보강 — 수정 횟수 헤더 + AuditOverlay 적용 (partnerName / status) + 복원 버튼 MASTER/MANAGER 만
- `clients/mobile-staff/src/api/slipAudit.ts` 신규 — list + revert + ApiResponse wrapper assert
- `clients/mobile-staff/src/realtime/SlipRealtimeClient.ts` — `slip.edit` event type 추가
- `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx` — `currentUserRole='DRIVER'` 명시 (복원 버튼 비표시 검증 의존)
- `docs/devops/redis-realtime-broker.md` 신규 — in-memory vs Redis 가이드 + AWS ElastiCache cache.t3.micro ~₩30K/월 + cutover 절차 + Testcontainers Redis 권고
- `docs/uiux/phase12/H2-audit-overlay.md` 신규 — wireframe + 한국어 라벨 + Designer 매뉴얼
- `docs/manual/05-슬립공유-수정-처리.md` 신규 — 사용자 시나리오 (페르소나 5) + 권한 + 화면 캡처 stub
- `docs/qa/phase-12-step-2-slip-audit-overlay/scenarios.md` 신규 — 27 case (audit_log 자동 기록 5 + AuditOverlay UI 5 + 수정 횟수 카운트 3 + 복원 4 + 실시간 sync 5 + 동시 수정 충돌 3 + Redis broker fallback 2) + 페르소나 5
- `docs/qa/phase-12-step-2-slip-audit-overlay/working-{audit-overlay-context-a-edit,audit-overlay-context-b-receives,audit-overlay-multi-revision,multi-context-edit-split}.png` 신규 — multi-context Playwright 작동 캡처 4 PNG (취소선 + 색상 + 수정자명 + 1초 sync 4 요소 시각 증거)
- `tools/manual-capture/capture-pr-h2.js` 신규 — Playwright multi-context 자동화 (browser.newContext 2회 분리 + sharp 좌-우 합성 + 한국어 라벨)
- `ROADMAP.md` Phase 12 row + Phase 12 section + PR 매트릭스 갱신
- `docs/dev-reports/integration-phase-12-step-2-slip-audit-overlay.md` 신규

후속 (PR-H2 머지 후):
- **PR-H3 (~1.5주) — 권한 / 수락 / 거절 워크플로우** — 영업 → 창고 → 기사 인계 시점 명시적 수락 + SSE 양방향 push (영업 입력 시 창고 알림 / 창고 수락 시 영업 알림 / 기사 수락 시 양측 알림). 본 PR-H2 머지 후 즉시 진입.
- **PR-H4 (~7주) — 전 15 service 확장 + Redis Pub/Sub 활성** — partner / inventory / accounting / arologis / dashboard 등 14 backend MSA 도메인 모두 SSE 채널 도입 + `shared/realtime` module 추출 + 본 PR-H2 시드된 `RedisRealtimeBroker` config toggle 활성 (다중 노드 진입 시).

---

### D-P12-03. slip 수정/삭제 요청 워크플로우 (Flyway V19 `slip_edit_requests`) + status 잠금 가드 정책 (LOCKED_REQUIRES_APPROVAL / FULLY_LOCKED 분류) + notification-service Internal Feign 통합 + TM 후속 fix BE/FE 정책 정합 (PR-H3, 2026-05-10)

PR (`feature/integrated-phase-12-step-3-slip-edit-permission`) — PR #124 (PR-H2 audit overlay + 실시간 sync) 머지 후 Phase 12 시리즈 3/4 진입. **사용자 핵심 워크플로우 = "잠금 → 요청 → 알림 → 수락 → 해제"** 5 단계 검증. 사용자 명시 잠금 정책 = (A) DRAFT/SAVED/SENT 작성자 자유 직접 수정 / (B) **CONFIRMED + ACCEPTED + PROCESSING `LOCKED_REQUIRES_APPROVAL`** = 작성자 직접 수정 차단 + 별도 요청 채널 + 창고 (또는 관리자) 수락 → APPROVED 1건 한정 mutation 진행 + mutation 직후 즉시 소진 (audit 무력화 차단) / (C) **INSPECTING + SHIPPING + DELIVERED `FULLY_LOCKED`** = 회계 마감 + 검수 무결성 보존 위해 관리자도 force 우회 차단 (별도 SQL audit 채널 필요).

근거:
- **Flyway V19 (`slip_edit_requests` + 인덱스 3) 신규** — `slip_edit_requests` 테이블 = `id UUID` PK + `slip_id UUID` FK + `requester_user_id UUID` + `requester_role` (SALES/MANAGER/MASTER) + `target_role` (WAREHOUSE) + `request_type` (EDIT/DELETE) + `reason TEXT` (≥ 10자 가드) + `status` (PENDING/APPROVED/REJECTED/EXPIRED) + `decided_by_user_id UUID` + `decided_at` + `decision_reason TEXT` (≥ 5자, REJECTED 의무) + `expires_at` + BaseEntity 7 audit + Soft Delete (`@SQLRestriction("is_deleted = false")`). 인덱스 3 = `idx_slip_edit_requests_slip_id` (슬립별 이력 조회) / `idx_slip_edit_requests_status_target` (창고 PENDING 대시보드) / `idx_slip_edit_requests_expires_at` (scheduler 자동만료 스캔).
- **`SlipEditRequestService` 6 책임 (request / approve / reject / listPendingForRole / findActiveApproval+consumeApproval / `@Scheduled` expirePending fixedRate=1h)** — `request(slipId, type, reason, requester)` = `guardRequestableStatus` (status 분기) + `expires_at = now() + 24h` (`samhan.slip.edit-request.expires-hours` property) + INSERT 후 SSE `slip:edit-request:created` broadcast + `NotificationClient.notifyTargetRole(WAREHOUSE)` graceful fallback 호출. `approve(requestId, decider)` = `status=APPROVED` + `decided_by/decided_at` 기록 + SSE `slip:edit-request:decided`. `reject(requestId, reason, decider)` = `decision_reason` 의무 + 동일 SSE. `findActiveApproval(slipId)` = `applyOverlayPatch` mutation 직전 호출 — 0건 → 차단 / 1건 → mutation 진행. `consumeApproval(requestId)` = mutation 직후 row soft-delete (1회 한정 보장 — audit 무력화 차단). `expirePending` = `@Scheduled(fixedRate = 3_600_000L)` 1시간마다 `expires_at < now()` PENDING row 자동 EXPIRED 전환 + SSE `slip:edit-request:decided` broadcast.
- **사용자 명시 잠금 정책 분류 (3 카테고리, TM 후속 fix `69779b8` 정합 기준)** —
  - **`FREE_DIRECT_EDIT = {DRAFT, SAVED, SENT}`** — 작성자 직접 수정 자유. 본 endpoint 호출 시 `INVALID_INPUT` 400 응답 ("현 단계는 작성자가 직접 수정/삭제 가능 — 별도 요청 불필요").
  - **`LOCKED_REQUIRES_APPROVAL = {CONFIRMED, ACCEPTED, PROCESSING}`** — 작성자 직접 수정 차단 + 별도 요청 채널만. 창고 수락 → APPROVED 1건 → mutation 진행 + 즉시 소진. **CONFIRMED 가 본 카테고리에 포함된 사유 = TM 후속 fix `69779b8`** = 초기 BE 가 CONFIRMED 를 FULLY_LOCKED 에 분류했으나, 사용자 명시 워크플로우 ("확정 후에도 거래처 요청으로 수량 변경 가능 — 단 창고 수락 의무") 와 불일치. FE `SlipDetailPage.tsx` 가 `isConfirmed = status === 'CONFIRMED'` 일 때 banner + 요청 버튼 노출 (사용자 의도 정합). BE/FE 정합을 위해 CONFIRMED → LOCKED_REQUIRES_APPROVAL 로 이동, FE `isConfirmed` → `isApprovalRequired` (의미 명확화) 로 명명 정정.
  - **`FULLY_LOCKED = {INSPECTING, SHIPPING, DELIVERED}`** — 검수 무결성 + 배송 진행 중 데이터 변동 차단 + 한국 일반기업회계기준 보존 의무. 관리자도 force 우회 차단 — 별도 SQL audit 채널 (`SlipAuditLogService.revertToRevision` PR-H2 시드) 만 허용. 본 endpoint 호출 시 `CONFLICT` 409 응답.
- **신규 endpoint 4** — (1) `POST /api/v1/slips/{slipId}/edit-request` SALES/MANAGER/MASTER (작성자 그룹) — `CreateEditRequestRequest {type, reason}` body, 사유 ≥ 10자 + 500자 카운터 가드 (FE/BE 양측 의무). (2) `POST /api/v1/slips/{slipId}/edit-request/{requestId}/approve` WAREHOUSE/MANAGER/MASTER (reviewer 그룹). (3) `POST /api/v1/slips/{slipId}/edit-request/{requestId}/reject` 동일 그룹 — `RejectRequest {reason}` body, 사유 ≥ 5자 의무. (4) `GET /api/v1/slips/edit-requests?status=PENDING` 창고 대시보드 진입 + `GET /api/v1/slips/{slipId}/edit-requests` 슬립별 이력. **차단 ROLE = DRIVER / INVENTORY / ACCOUNTANT / READONLY / PARTNER** (POST/GET 모두 403). ApiResponse wrapper 의무 (PR #98 D-P10-12 일관) + ROLE 풀네임 가드 (memory `feedback_role_naming_full`).
- **SSE event 2 신규 (`slip:edit-request:created` / `slip:edit-request:decided`)** — `created` = 요청 생성 시 창고 대시보드 + 작성자 화면 동시 broadcast (`{requestId, slipId, slipNo, requesterName, type, reason, requestedAt, expiresAt}`). `decided` = 수락/거절/만료 시 작성자 화면 broadcast (`{requestId, slipId, status, decidedByName, decidedAt, decisionReason}`) — 작성자 `SlipDetailPage` `decisionToast` (success/danger variant) 표시. desktop = `useEffect` 핸들러 + cache invalidate. mobile-staff = `Alert.alert` foreground.
- **`NotificationClient` (notification-service Internal Feign — graceful fallback)** — `services/slip-service/src/main/java/.../slip/client/NotificationClient.java` 신규. `notifyTargetRole(role, slipNo, requesterName, type, reason)` 호출 시 SMS (Aligo) + PUSH (Expo) 발송. `try/catch FeignException` 후 warning log 만 출력 + slip 비즈니스 로직 진행 (요청 row 정상 INSERT). 알림 실패가 slip mutation 차단하면 협력 워크플로우 마비 — graceful fallback 의무. production 가이드 = `docs/devops/slip-edit-request-notification.md` (Aligo SMS + Expo push 후속 환경변수 / Secret Manager 연동 / 멱등 키 / 재시도 정책).
- **design-system `SlipEditRequestDialog` + Storybook 3 story** — `clients/web/design-system/src/components/SlipEditRequestDialog/SlipEditRequestDialog.tsx` 신규. props = `{open, type, slipNo, requesterName, onSubmit, onClose}`. textarea = 사유 입력 ≥ 10자 가드 (submit `disabled=true` until pass) + 500자 카운터 (250/500 색상 분기). EDIT/DELETE type danger variant 분기 (DELETE = red badge). Storybook 3 story = Edit / Delete / Submitting (loading state).
- **desktop `SlipDetailPage.tsx` 잠금 분기 + `SlipEditRequestsPage` 신규** — `SlipDetailPage` 보강 = `isApprovalRequired = status in {ACCEPTED, PROCESSING, CONFIRMED}` (TM fix 정합) → `slip-detail-edit-request-banner` (warning variant) + `slip-edit-request-button` (작성자 노출). `isFullyLocked = status in {INSPECTING, SHIPPING, DELIVERED}` → `slip-detail-locked-banner` (danger variant). `latestEditRequest` state + SSE `slip:edit-request:decided` 핸들러 → `decisionToast`. `SlipEditRequestsPage` (`/admin/slip-edit-requests`) 신규 = PENDING list 표 (`admin-slip-edit-requests-row-{slipNo}` UUID 비공개) + 수락 confirm dialog + 거절 사유 dialog (≥ 5자) + **30초 polling fallback** (SSE 미가용 멀티 워크스테이션 자동 동기화). `AppLayout.tsx` `sidebar-warehouse-slip-edit-requests` NavLink (WAREHOUSE/MANAGER/MASTER 가시).
- **mobile-staff `SlipDetailScreen` 분기 + `SlipEditRequestsScreen` 신규 + DRIVER 차단** — `SlipDetailScreen` = 작성자 SALES 시 수정 요청 버튼 노출 / 창고 직원 WAREHOUSE 시 PENDING 카드 분기 (`SLIP_EDIT_REQUEST_AUTHOR_ROLES` 에 DRIVER 미포함 → 모바일 화면 차단 + BE `@PreAuthorize` 가 403 회귀 가드). `SlipEditRequestsScreen` 신규 = 창고 직원 inbox + 수락/거절 + 30초 polling. `SlipRealtimeClient` `slip.edit-request.{created,approved,rejected}` event type 추가 + foreground `Alert.alert`.
- **TM 후속 fix `69779b8` (BE/FE 정책 정합 — 본 PR 안에서 fix 완료)** — QA 발견 Major (FE banner 노출 후 BE 409 거부 = 사용자 신뢰 손상) 본 PR 머지 전 fix. 변경 = (1) `SlipEditRequestService.LOCKED_REQUIRES_APPROVAL` set = `{CONFIRMED, ACCEPTED, PROCESSING}` (CONFIRMED 추가) + `FULLY_LOCKED` = `{INSPECTING, SHIPPING, DELIVERED}` (CONFIRMED 제거), (2) `SlipDetailPage.tsx` `isConfirmed` → `isApprovalRequired` 명명 정정 + status set 동일 정합, (3) `SlipServiceLockGuardTest` 6 → 7 case (CONFIRMED + APPROVED 부재 → CONFLICT 회귀 가드 추가), (4) `SlipEditRequestServiceTest` 8 → 9 case (CONFIRMED 정상 PENDING 생성 회귀 가드 추가). 사용자 명시 워크플로우 정합 일관 (옵션 A) — 별도 후속 PR 회피 + 통합 PR 패턴 (memory `feedback_integrated_pr_pattern`) 일관.
- **단위 30+ + IT 3 case + Playwright 작동 캡처 4 PNG** — 단위 = `SlipEditRequestServiceTest` 9 case (DRAFT 거부 / ACCEPTED 정상 / CONFIRMED 정상 / INSPECTING CONFLICT / DELIVERED CONFLICT / approve transition / reject transition / 이미 종결 CONFLICT / expirePending 자동만료) + `SlipServiceLockGuardTest` 7 case (DRAFT 자유 / SAVED 자유 / ACCEPTED 미승인 CONFLICT / ACCEPTED 승인 후 진행+소진 / CONFIRMED 미승인 CONFLICT / INSPECTING 완전잠금 / DELIVERED softDelete 완전잠금) + 보조 단위 (NotificationClient 호출 / SSE payload schema). IT = `SlipEditRequestControllerIT` 3 case (DRAFT 400 / ACCEPTED 201 + notification 호출 / approve 200 + dashboard empty). 작동 캡처 4 PNG = `working-edit-request-dialog.png` (SALES dialog 사유 입력) / `working-warehouse-pending-list.png` (WAREHOUSE PENDING list 표) / `working-edit-request-approved-toast.png` (작성자 SSE 수락 toast) / `working-locked-slip-banner.png` (LOCKED_REQUIRES_APPROVAL banner + 요청 버튼). PR body inline raw URL + commit-pinned + HEAD 200 검증 의무 (memory `feedback_pr_qa_screenshots`).
- **단일 통합 PR (7 commits) — 별도 docs PR 회피** — Phase A (DevOps 1 + BE 1 + FE-1 desktop+design-system+uiux+manual 1 + FE-2 mobile-staff 1 = 4 commits) + Phase B (QA 1 = 1 commit) + 풀빌드 fix (TM 후속 1 = 1 commit) + docs (TM 본 PR 안 1 = 1 commit) = 총 7 commits. ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴 일관.

영향:
- `services/slip-service/src/main/java/.../slip/editrequest/{domain/{SlipEditRequest,SlipEditRequestType,SlipEditRequestStatus,SlipEditTargetRole},repository/SlipEditRequestRepository,service/SlipEditRequestService,web/SlipEditRequestController,web/dto/{ApproveRequest,CreateEditRequestRequest,RejectRequest,SlipEditRequestResponse}}.java` 12 신규 file — 수정/삭제 요청 도메인 (BaseEntity 7 audit + Soft Delete + ApiResponse wrapper + ROLE 풀네임 + UUID 비공개 + 한국어 Javadoc)
- `services/slip-service/src/main/java/.../slip/client/NotificationClient.java` 신규 — notification-service Internal Feign (`@FeignClient` + `try/catch FeignException` graceful fallback + warning log)
- `services/slip-service/src/main/java/.../slip/config/SlipEditRequestProperties.java` 신규 — `samhan.slip.edit-request.expires-hours` `@ConfigurationProperties` binding
- `services/slip-service/src/main/java/.../slip/service/SlipService.java` — `applyOverlayPatch` 잠금 가드 (`findActiveApproval` 호출 + mutation 후 `consumeApproval`) + `softDelete` 신규 (DELETE 요청 수락 후 1회 한정 소진)
- `services/slip-service/src/main/resources/db/migration/V19__add_slip_edit_requests.sql` 신규 — `slip_edit_requests` + 인덱스 3 (`idx_slip_edit_requests_slip_id` / `idx_slip_edit_requests_status_target` / `idx_slip_edit_requests_expires_at`) + BaseEntity 7 audit + Soft Delete
- `services/slip-service/src/main/resources/application.yml` — `samhan.slip.edit-request.expires-hours=24` (default)
- `services/slip-service/src/test/java/.../slip/editrequest/service/SlipEditRequestServiceTest.java` 신규 — 단위 8→9 case (TM fix 회귀 가드 보강)
- `services/slip-service/src/test/java/.../slip/service/SlipServiceLockGuardTest.java` 신규 — 단위 6→7 case (TM fix 회귀 가드 보강)
- `services/slip-service/src/test/java/.../slip/it/SlipEditRequestControllerIT.java` 신규 — IT 3 case (DRAFT 400 / ACCEPTED 201 + notification / approve 200 + dashboard empty)
- `clients/web/design-system/src/components/SlipEditRequestDialog/{SlipEditRequestDialog.tsx,.module.css,.stories.tsx,index.ts}` 4 신규 — 사유 textarea ≥ 10자 + 500자 카운터 + EDIT/DELETE danger variant + Storybook 3 story (Edit / Delete / Submitting)
- `clients/web/design-system/src/index.ts` — SlipEditRequestDialog barrel export
- `clients/desktop/src/renderer/api/slipEditRequest.ts` 신규 — create / approve / reject / list + `SLIP_EDIT_REQUEST_REVIEWER_ROLES` + `SLIP_EDIT_REQUEST_AUTHOR_ROLES` + 라벨 매핑
- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` — `editRequestDialogType` state + `latestEditRequest` state + SSE `slip:edit-request:decided`/`created` 핸들러 + `slip-detail-edit-request-banner` (LOCKED_REQUIRES_APPROVAL 작성자) + `slip-detail-locked-banner` (FULLY_LOCKED) + `decisionToast` + TM fix `isConfirmed` → `isApprovalRequired` 정정
- `clients/desktop/src/renderer/routes/admin/SlipEditRequestsPage.tsx` 신규 — PENDING list 표 + 수락 confirm + 거절 사유 dialog (≥ 5자) + 30s polling fallback
- `clients/desktop/src/renderer/components/AppLayout.tsx` — `sidebar-warehouse-slip-edit-requests` NavLink (WAREHOUSE/MANAGER/MASTER 가시)
- `clients/desktop/src/renderer/routes/index.tsx` — admin/slip-edit-requests 라우트 등록
- `clients/mobile-staff/src/api/slipEditRequest.ts` 신규 — request / approve / reject / list / listPending
- `clients/mobile-staff/src/screens/SlipDetailScreen.tsx` — 작성자 SALES 수정 요청 + 창고 직원 WAREHOUSE PENDING 카드 분기 + DRIVER 차단
- `clients/mobile-staff/src/screens/SlipEditRequestsScreen.tsx` 신규 — 창고 직원 inbox + 수락/거절 + 30s polling
- `clients/mobile-staff/src/realtime/SlipRealtimeClient.ts` — `slip.edit-request.{created,approved,rejected}` event type + foreground Alert
- `docs/uiux/phase12/H3-edit-request-workflow.md` 신규 — flow chart + 잠금 정책 + 한국어 라벨 + Designer 매뉴얼
- `docs/manual/02-출고-처리.md` — "수정/삭제 요청" section
- `docs/manual/03-역할별-권한.md` — 잠금 정책 표 (status × ROLE 매트릭스)
- `docs/devops/slip-edit-request-notification.md` 신규 — Aligo SMS + Expo push production 가이드
- `docs/qa/phase-12-step-3-slip-edit-permission/scenarios.md` 신규 — 24 case (status 잠금 6 + FULLY_LOCKED 4 + 요청→알림→수락/거절 5 + 수락 후 잠금 해제 + 1회 소진 4 + 만료 scheduler + UX 5) + 페르소나 5 + § 8 단위/IT 정합성
- `docs/qa/phase-12-step-3-slip-edit-permission/working-{edit-request-dialog,warehouse-pending-list,edit-request-approved-toast,locked-slip-banner}.png` 신규 — Playwright 작동 캡처 4 PNG (잠금 → 요청 → 알림 → 수락 → 해제 핵심 워크플로우 시각 증거)
- `tools/manual-capture/capture-pr-h3.js` 신규 — Playwright 자동화 (PR-H1/H2 패턴 일관)
- `ROADMAP.md` Phase 12 row + Phase 12 section + PR 매트릭스 갱신
- `docs/dev-reports/integration-phase-12-step-3-slip-edit-permission.md` 신규

후속 (PR-H3 머지 후):
- **PR-H4 (~7주) — 전 15 service + 50+ page audit+sync+권한 일괄 확장** — partner / inventory / accounting / arologis / dashboard 등 14 backend MSA 도메인 모두 SSE 채널 도입 + `shared/realtime` module 추출 + 본 PR-H2 시드 `RedisRealtimeBroker` config toggle 활성 (다중 노드 진입 시) + 본 PR-H3 시드 잠금 정책 (`LOCKED_REQUIRES_APPROVAL` / `FULLY_LOCKED`) + `EditRequestService` 패턴 14 도메인 적용 (요청 → 수락 → 1회 한정 소진 + audit 무력화 차단 일관). 본 PR-H3 머지 후 즉시 진입.

---

### D-P12-04a. `shared/realtime-abstraction` module 추출 + slip-service 시범 마이그 (broker / audit / lock / editrequest base + AutoConfiguration + InMemory default + Redis 옵션 toggle, PR-H4a 분할 1/3, 2026-05-10)

PR (`feature/integrated-phase-12-step-4a-shared-realtime-module`) — PR #125 (PR-H3 slip 수정/삭제 요청 워크플로우 + 잠금 가드) 머지 후 Phase 12 시리즈 4 (전 15 service + 50+ page 일괄 확장, ~7주) 진입. 시리즈 4 = 3 PR 분할 채택 (사용자 결정 옵션, 단일 PR 7주 회피 + diff 가독성 + 단계별 검증 게이트) — **(A) PR-H4a (본 PR, ~1주) `shared/realtime-abstraction` module 추출 + slip-service 시범 마이그 / (B) PR-H4b (~3주) BE 13 service 일괄 의존 추가 + 도메인별 Flyway template 활용 / (C) PR-H4c (~3주) FE 50+ page UI 통합**. 본 PR-H4a = BE 인프라 시드 단계 — 실제 13 service 도입은 PR-H4b 분리.

근거:
- **`shared/realtime-abstraction` module 신규 (java-library + Spring Boot autoconfigure + AutoConfiguration imports)** — `shared:common` / `shared:security` 패턴 일관 (Spring Boot plugin 미적용 — 의존만 추가). PR-H1/H2/H3 시점 slip-service 자체 구현된 broker / audit / lock / editrequest 4 책임을 14 service 공통 base 로 추출 — 향후 13 service 가 본 module 의존만 추가하면 자체 슬라이스 audit/realtime 활성. **dependency** = `spring-boot-autoconfigure` + `spring-web` + `spring-webmvc` (SseEmitter) + `spring-boot-starter-data-jpa` (`@MappedSuperclass`) + `jackson-databind` (Redis 직렬화) + `shared:common` (BaseEntity 7 audit / BusinessException / ErrorCode 일관). Redis broker = `compileOnly 'spring-boot-starter-data-redis'` — consumer service 가 starter-data-redis 의존 시만 활성. AutoConfiguration imports = `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 1 entry (`RealtimeAutoConfiguration`) — Spring Boot 3 표준 패턴 (legacy `spring.factories` 폐기).
- **4 책임 분리 (broker / audit / lock / editrequest)** — `realtime/broker/` (5 file) = `RealtimeBroker` interface + `InMemoryRealtimeBroker` default impl (`Map<String, CopyOnWriteArrayList<SseEmitter>>` + 30s heartbeat + cleanup race 방어, PR-H2 시드 1:1) + `RedisRealtimeBroker` 옵션 (Conditional `@ConditionalOnProperty(prefix="app.realtime", name="broker", havingValue="redis")` + Redis Pub/Sub) + `BrokerConfiguration` (Bean factory) + `RealtimePublishHook` (publish 후 외부 옵저버 hook). `realtime/audit/` (4 file) = `AuditLogRecorder` interface + `AuditLogEntry` `@MappedSuperclass` (BaseEntity 7 audit 상속 + `slip_audit_logs` PR-H2 시드 schema 일반화) + `AuditEventPayloadBuilder` (5 키 SSE payload — actorId/actorName/actorColor/changes[]/revisionNo) + `ChangeEntry` record (fieldName/oldValue/newValue). `realtime/lock/` (4 file) = `EditLockGuard` interface + `DefaultEditLockGuard` default impl (3 카테고리 status 분기) + `EditLockPolicy` enum (`FREE_DIRECT_EDIT` / `LOCKED_REQUIRES_APPROVAL` / `FULLY_LOCKED` PR-H3 시드 정책 일반화) + `LockedException` (BusinessException 상속). `realtime/editrequest/` (5 file) = `EditRequestService` interface + `EditRequestRecord` `@MappedSuperclass` (`slip_edit_requests` PR-H3 시드 schema 일반화 + status transition guard) + `EditRequestStatus` enum (PENDING/APPROVED/REJECTED/EXPIRED) + `EditRequestType` enum (EDIT/DELETE) + `EditTargetRole` enum (WAREHOUSE 등 도메인별 reviewer role).
- **slip-service 시범 마이그 — 호출자 0 변경 + 회귀 0 보장** — `services/slip-service/build.gradle` 에 `implementation project(':shared:realtime-abstraction')` 의존 추가만. 기존 `services/slip-service/.../slip/realtime/SlipRealtimeBroker.java` (259 line) → 109 line **thin facade `extends InMemoryRealtimeBroker`** — 도메인 메서드 (`broadcastEdit` / `broadcastEditRequestCreated` / `broadcastEditRequestDecided`) 만 보존 + base subscribe/cleanup/heartbeat 모두 shared module 으로 이전. **삭제 4 file** = `slip/realtime/RealtimePublishHook.java` (25 line) + `slip/realtime/RedisRealtimeConfigBean.java` (35 line) + `slip/realtime/RedisRealtimeBroker.java` (153 line) + `slip/realtime/RedisRealtimeBrokerTest.java` (111 line) — 모두 shared module 으로 이전 + 호출자 (Service / Controller / IT) 변경 0 회귀 가드. 회귀 검증 = **slip-service 336 tests / 0 fail** (PR-H1 SSE 5 + PR-H2 audit 9 + PR-H3 edit-request 3 IT 모두 PASS) + 단위 30+ 회귀 0.
- **단위 29 case (shared module)** — `InMemoryRealtimeBrokerTest` (subscribe / broadcast / cleanup race / 100 emitter / 1000 publish — PR-H2 `SlipRealtimeBrokerConcurrencyIT` 패턴 일반화) + `RedisRealtimeBrokerTest` (subscribe / publish / connection fallback) + `AuditEventPayloadBuilderTest` (5 키 schema — PR-H2 `SlipAuditPayloadCaptorTest` ArgumentCaptor 패턴 일반화) + `EditRequestRecordTest` (status transition guard + `consumeApproval` 1회 한정 소진 + expirePending) + `DefaultEditLockGuardTest` (3 카테고리 분기 — PR-H3 `SlipServiceLockGuardTest` 패턴 일반화) + `EditLockPolicyTest` (FREE/LOCKED/FULLY enum 일관) + `RealtimeAutoConfigurationTest` (bean 단일 등록 + Redis disabled default + classpath 분기). **모두 시드 패턴 (slip-service 자체 구현 PR-H1/H2/H3) 의 1:1 일반화** — 회귀 게이트 보장.
- **db/template/ 2 신규 file (PR-H4b 13 service 의존)** — `db/template/audit_log_template.sql` (50 line) = `slip_audit_logs` PR-H2 시드 schema 일반화 + `<domain>_audit_logs` 패턴 (BaseEntity 7 audit + Soft Delete + 부분 인덱스). `db/template/edit_request_template.sql` (58 line) = `slip_edit_requests` PR-H3 시드 schema 일반화 + `<domain>_edit_requests` 패턴 (인덱스 3 + status enum + expires_at). PR-H4b 진입 시 13 service 가 본 template 1:1 복제 + 도메인 prefix 만 교체 → Flyway 신규 V N migration 추가.
- **AutoConfiguration 패턴 (consumer service 의존만 추가 → bean 자동 등록)** — `RealtimeAutoConfiguration` = `@AutoConfiguration` + `@EnableConfigurationProperties(BrokerConfiguration.class)` + `@ConditionalOnClass(SseEmitter.class)`. consumer service 가 의존만 추가 (의존 추가만으로 `InMemoryRealtimeBroker` bean 자동 등록 + Redis 활성 시 `RedisRealtimeBroker` 자동 swap). **shared:security AutoConfig 패턴 일관 (PR #119 시드)** + `*Bean` suffix 가드 (PR #119 회귀 가드 일관) — 본 PR 도 `BrokerConfiguration` (정확히 Configuration class) + `RealtimeAutoConfiguration` (정확히 AutoConfiguration class) 명명 가드.
- **Designer 14 service 적용 패턴 가이드 (코드 0)** — `docs/uiux/phase12/H4a-shared-realtime-pattern.md` 신규 (277 line). 14 service × audit overlay 적용 매트릭스 (9 service / 약 30~40 page 1차 대상 + dashboard/auth/notification/logging/eureka 5건 적용 제외) + SlipDetailPage 시드 패턴 PR-H2 commit `435918c` 1:1 복제 가이드 (import / api client / useQuery+AuditOverlay / SSE+cache invalidate / 수정 횟수 chip / 복원 dropdown 6 단계) + 한국어 라벨 매핑 표 (도메인 5 시범 — partner/inventory/accounting/arologis/product) + UUID 비공개 가드 (`feedback_uuid_no_user_visibility` 일관) + PR-H4c 50+ page 적용 체크리스트 + mobile-staff RN 확장 가이드. **본 PR-H4a 코드 변경 0 — 가이드 자산만** (PR-H4b/H4c 의존).
- **DevOps Redis production 가이드 보강** — `docs/devops/redis-realtime-broker.md` (143 line 추가). shared module 의존 + AWS ElastiCache cache.t3.micro ~₩30K/월 + cutover 절차 (in-memory → Redis transition 무중단) + Testcontainers Redis 권고 (PR-H2 시드 일관) + 환경변수 (`SAMHAN_REALTIME_BROKER=in-memory|redis` + `REDIS_HOST` / `REDIS_PORT`) + production 운영 hint (max-connections / timeout / keepalive).
- **QA 61 case 시나리오** — `docs/qa/phase-12-step-4a-shared-realtime-module/scenarios.md` 신규 (364 line). shared module 단위 회귀 게이트 12 + slip-service 회귀 무손실 8 (PR-H1/H2/H3 모든 IT 그대로 PASS 게이트) + cross-domain 색상 일관 5 (`userIdToColor` deterministic + 5 service 같은 사용자 같은 hue) + Redis broker fallback 4 (Redis down → in-memory degrade graceful) + AutoConfig classpath 분기 4 (Redis 의존 미포함 startup / 포함 startup / property toggle) + multi-context SSE 회귀 게이트 5 (PR-H1/H2 multi-context 작동 캡처 회귀 0) + Designer 시각 회귀 5 + 한국어 라벨 일관 5 + UUID 비공개 5 + PR-H4b/H4c 진입 게이트 8. 페르소나 5 (영업/창고/배송/관리/시스템관리). **FE 변경 0 → 작동 캡처 면제** (QA 5.5.2 multi-context 회귀 게이트만 수행 — PR-H1/H2 작동 캡처 그대로 회귀 0 검증).
- **단일 통합 PR (3 commits) — 별도 docs PR 회피** — Phase A (Designer + DevOps + QA docs 1 commit `d18e80e` + BE shared module + slip 마이그 1 commit `3b36e2d`) + TM (ROADMAP/DECISIONS/dev-report 본 PR 안 1 commit) = 총 3 commits. ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴 일관.

영향:
- `shared/realtime-abstraction/` 신규 module — `build.gradle` (java-library + Spring Boot autoconfigure + Redis compileOnly + shared:common api) + 19 신규 java file (broker 5 + audit 4 + lock 4 + editrequest 5 + autoconfig 1) + `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 신규 + `db/template/{audit_log_template,edit_request_template}.sql` 2 신규 + 단위 7 testfile / 29 case PASS
- `settings.gradle` — `shared:realtime-abstraction` include 보강
- `services/slip-service/build.gradle` — `implementation project(':shared:realtime-abstraction')` 의존 추가 (3 line)
- `services/slip-service/.../slip/realtime/SlipRealtimeBroker.java` — 259 → 109 line (thin facade `extends InMemoryRealtimeBroker`, 호출자 0 변경)
- `services/slip-service/.../slip/realtime/{RealtimePublishHook,RedisRealtimeConfigBean,RedisRealtimeBroker}.java` 3 file 삭제 — shared module 으로 이전
- `services/slip-service/.../slip/realtime/RedisRealtimeBrokerTest.java` 삭제 — shared module 으로 이전
- `services/slip-service` 회귀 무손실 — 336 tests / 0 fail (단위 30+ + IT 9 모두 PASS) + 풀빌드 GREEN
- `docs/uiux/phase12/H4a-shared-realtime-pattern.md` 신규 (277 line) — Designer 14 service 적용 패턴 가이드
- `docs/devops/redis-realtime-broker.md` 보강 (143 line 추가) — shared module + AWS ElastiCache + cutover 절차
- `docs/qa/phase-12-step-4a-shared-realtime-module/scenarios.md` 신규 (364 line) — 61 case + 페르소나 5
- `ROADMAP.md` Phase 12 row + Phase 12 section + PR 매트릭스 갱신 (PR-H3 #125 확정 + PR-H4 3분할 H4a/H4b/H4c)
- `docs/dev-reports/integration-phase-12-step-4a-shared-realtime-module.md` 신규

후속 (PR-H4a 머지 후):
- **PR-H4b (~3주) — BE 13 service 일괄 의존 추가** — partner / inventory / accounting / arologis / product / dc-config / partner-order / partner-auth / user / notification / groupware / dashboard / logging 13 backend MSA. 본 PR-H4a `shared/realtime-abstraction` 의존만 추가 + 도메인별 Flyway 신규 V N migration (`db/template/audit_log_template.sql` + `edit_request_template.sql` 1:1 복제 + 도메인 prefix 교체). 본 PR-H4a 머지 후 즉시 진입.
- **PR-H4c (~3주) — FE 50+ page UI 통합** — desktop `<Domain>DetailPage` 일괄 audit overlay + edit-request banner + mobile-staff 적용 (DispatchScreen / StockAdjustScreen 등) + Designer wireframe 도메인별 1건씩. PR-H4b 머지 후 진입.

---

### D-P12-04b. BE 13 service 일괄 `shared/realtime-abstraction` 적용 + 도메인별 specialization (9 specialization domain + 2 broker only + 1 env, PR-H4b 분할 2/3, 2026-05-10)

PR (`feature/integrated-phase-12-step-4b-be-realtime-rollout`) — PR #126 (PR-H4a `shared/realtime-abstraction` module + slip-service 시범 마이그) 머지 후 Phase 12 시리즈 4 분할 2/3 진입. 본 PR-H4b = BE 13 service 일괄 적용 단계 — slip-service 외 13 backend MSA 가 PR-H4a 의 `shared/realtime-abstraction` 의존만 추가 + 도메인별 Flyway template 활용 + 도메인별 specialization (LockPolicy / EditRequestService / AuditLogService / RealtimeController). **신규 module 추가 0 (의존 추가 + specialization 만)** — PR-H4a 시드 패턴의 정확한 fan-out.

근거:
- **13 backend MSA 적용 분류 — 9 specialization + 2 broker only + 1 env 셋업 + slip 시드 = 13 service** — `services/{partner,inventory,accounting,arologis,product,dc-config,partner-order,user,groupware}-service` 9 specialization (도메인별 status enum × 3 카테고리 LockPolicy + EditRequestService 6 책임 + AuditLogService + RealtimeController 모두 PR-H4a shared base 1:1 상속), `services/{dashboard,notification}-service` 2 broker only (read-only KPI 도메인 + 알림 발송 도메인 — edit-request 미적용, broker + audit log + SSE 채널만), `services/logging-service` 1 env 셋업 (build.gradle shared 의존 + application.yml realtime property — audit log domain 도입은 PR-H4c 후속). slip-service 는 PR-H4a 시범 마이그 완료. **partner-auth-service 는 본 PR-H4b scope 외** (사용자 인증 도메인 — audit overlay 의 비즈니스 가치 낮음).
- **165 files +11932 (5 BE commits)** — BE-A `12ace4a` accounting+partner (42 files +2795) + BE-B `5bcb7ad` inventory+arologis (38 files +3117) + BE-C `530a149` partner-order+product (41 files +2442) + BE-D `5c30306` user+dc-config+notification (26 files +1255) + BE-E `3914fdf` logging+groupware+dashboard (10 files +386). 도메인별 통합 commit 패턴 (관련 도메인 묶음, fan-out 단순성 + 리뷰 가독성).
- **9 신규 Flyway migration — `db/template/{audit_log_template,edit_request_template}.sql` 1:1 복제 + `<domain>` prefix 교체** — `V5__add_partner_audit_logs_and_edit_requests.sql` (110 line) + `V6__add_inventory_audit_logs_and_edit_requests.sql` (131 line) + `V?__add_accounting_audit_logs_and_edit_requests.sql` (111 line) + `V?__add_arologis_audit_logs_and_edit_requests.sql` (128 line) + `V6__add_realtime_overlay.sql` product (125 line) + `V?__add_dc_config_audit_logs_and_edit_requests.sql` (113 line) + `V3__add_realtime_overlay.sql` partner-order (138 line) + `V4__add_user_audit_logs_and_edit_requests.sql` (111 line) + `V2__add_groupware_audit_logs.sql` (68 line) + `V3__add_groupware_edit_requests.sql` (83 line) + `V3__add_notification_audit_logs.sql` (71 line). **모두 BaseEntity 7 audit + Soft Delete + 부분 인덱스 일관** (PR-H4a template seed 1:1).
- **도메인별 LockPolicy 매트릭스 (9 specialization)** — partner DRAFT free / ACTIVE locked-approval / SUSPENDED-INACTIVE fully-locked / inventory DRAFT free / SUBMITTED locked-approval / POSTED-VOIDED fully-locked / **accounting DRAFT free / POSTED-CLOSED-VOIDED 즉시 FULLY_LOCKED (LOCKED_REQUIRES_APPROVAL 미사용 — 한국 일반기업회계기준 회계 무결성 의무, 정정 분개 의무)** / arologis PLANNED free / DISPATCHED locked-approval / IN_TRANSIT-DELIVERED-CANCELED fully-locked / product DRAFT free / ACTIVE locked-approval / DISCONTINUED-INACTIVE fully-locked / dc-config DRAFT free / ACTIVE locked-approval / EXPIRED-INACTIVE fully-locked / partner-order DRAFT free / SUBMITTED locked-approval / CONFIRMED-FULFILLED-CANCELED fully-locked / user ACTIVE free (audit only — edit-request 미도입, audit log 만) / SUSPENDED-INACTIVE fully-locked / groupware DRAFT-PUBLISHED free (audit only) / ARCHIVED fully-locked. **도메인 비즈니스 의미 1:1 반영** (회계는 보수적, 영업/마스터는 LOCKED_REQUIRES_APPROVAL 단계 보유).
- **Specialization 패턴 — `<Domain>LockPolicy` + `<Domain>EditRequestService` + `<Domain>AuditLogService` + `<Domain>RealtimeController`** — 4 클래스 명명 일관 + shared base 1:1 상속 + 호출자 변경 0. 예: `PartnerLockPolicies` (status enum × 3 카테고리 분기) + `PartnerEditRequestService` (request / approve / reject / listPendingForRole / findActiveApproval / consumeApproval 6 책임 + Properties expires-hours) + `PartnerAuditLogService` (record / listByEntity / revertToRevision) + `PartnerRealtimeController` (`samhan:partner:partner:edit:{id}` 채널 subscribe). 9 specialization 도메인 모두 동일 4 클래스 패턴.
- **Channel naming 규약 — `samhan:<service>:<entity>:edit:{id}` + `:edit-request:created/decided`** — slip 시드 패턴 1:1 (`samhan:slip:slip:edit:{slipId}` PR-H1/H2/H3 일관). 13 service 단일 ElastiCache 공유 환경 channel collision 차단 + service 식별 명확. `SAMHAN_REALTIME_SERVICE_NAME` 환경변수로 service prefix 주입.
- **2 broker only domain (dashboard / notification) — edit-request 미적용 사유** — dashboard = read-only KPI materialized view 도메인 (사용자 수정 의미 0), notification = 알림 발송 outbound 도메인 (수정/삭제 의미 0). audit log + broker + SSE 채널만 도입 — KPI refresh / 알림 발송 이벤트 다른 service 에 broadcast.
- **단위 88+93+다수 PASS + 각 service IT (RealtimeIT + ApplicationContextLoadIT) PASS + slip-service 336 tests / 0 fail** — accounting 88+ (AuditLogService + LockPolicies + EditRequestService + RealtimeIT + ApplicationContextLoadIT), partner 93+ (동일 5 testfile), inventory 다수 (Recorder + EditRequest + Lock + AuditService + RealtimeIT), arologis 다수 (Recorder + EditRequest + Lock + DerivedStatus + RealtimeIT) + DispatchServiceTest 회귀 0, partner-order/product/dc-config/user/notification/groupware/dashboard/logging specialization + broker 단위. **slip-service 336 tests 100% 회귀 보존** (PR-H1 SSE 5 + PR-H2 audit 9 + PR-H3 edit-request 3 IT 모두 PASS, 단위 30+ 회귀 0). 풀빌드 GREEN.
- **Designer 13 service 적용 매트릭스 + DevOps Redis multi-service + QA 65+5 = 70 case** — `docs/uiux/phase12/H4b-be-rollout-checklist.md` 신규 (343 line, 도메인별 잠금 정책 일람 + Specialization 명명 규약 + audit overlay endpoint 패턴 + 한국어 라벨 매핑) + `docs/devops/phase12-redis-multi-service.md` 신규 (388 line, 단일 ElastiCache 공유 환경 운영 + 단계적 cutover + channel naming + publishFailureCount metric + production hint) + `docs/qa/phase-12-step-4b-be-realtime-rollout/scenarios.md` 신규 (573+70 = 643 line, 70 case = 13 service × 5 + 회귀 가드 5 + 페르소나 5 + 우선순위 매트릭스 Critical 46 / Major 8 / Minor 3 / Info 3).
- **multi-service 동시 SSE 작동 캡처 4 PNG (사용자 명시)** — `docs/qa/phase-12-step-4b-be-realtime-rollout/working-multi-service-{tax-invoice-sync,partner-edit-sync,inventory-audit-sync,dispatch-sync}.png` 4 PNG. accounting TaxInvoice / partner edit / inventory audit overlay / arologis Dispatch 4 도메인 동시 SSE round-trip 시각 증거. Playwright multi-context A/B 분리 + sharp 좌-우 합성 (PR-H1/H2/H3 패턴 일관). `tools/manual-capture/capture-pr-h4b.js` 신규 (563 line) Playwright 자동화.
- **단일 통합 PR (8+ commits) — 별도 docs PR 회피** — Phase A docs (Designer + DevOps + QA 1 commit `8aacae3`) + Phase A BE (BE-A/B/C/D/E 5 commits) + Phase B QA (작동 캡처 1 commit `2db1d02`) + TM (ROADMAP/DECISIONS/dev-report 본 PR 안 1 commit) = 총 8+ commits. ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관). 별도 docs PR 폐기 패턴 일관.

영향:
- `services/{partner,inventory,accounting,arologis,product,dc-config,partner-order,user,groupware}-service` 9 specialization domain — `build.gradle` shared 의존 추가 (3~4 line 각) + audit/editrequest/realtime/lock 패키지 신규 + Flyway 신규 V?? + 단위/IT 신규
- `services/{dashboard,notification}-service` 2 broker only — `build.gradle` shared 의존 + audit log domain (notification 만) + RealtimeBroker
- `services/logging-service` 1 env 셋업 — `build.gradle` shared 의존 + `application.yml` realtime property 12 line 추가
- 165 files +11932 -1 (BE 5 commits 합산)
- `services/slip-service` — 변경 0 (회귀 100% 보존)
- `docs/uiux/phase12/H4b-be-rollout-checklist.md` 신규 (343 line)
- `docs/devops/phase12-redis-multi-service.md` 신규 (388 line)
- `docs/qa/phase-12-step-4b-be-realtime-rollout/scenarios.md` 신규 (573+70 = 643 line) + `working-multi-service-{tax-invoice-sync,partner-edit-sync,inventory-audit-sync,dispatch-sync}.png` 4 PNG
- `tools/manual-capture/capture-pr-h4b.js` 신규 (563 line)
- `ROADMAP.md` Phase 12 row + Phase 12 section + PR 매트릭스 갱신 (PR-H4a #126 확정 + 본 PR-H4b row 추가)
- `docs/dev-reports/integration-phase-12-step-4b-be-realtime-rollout.md` 신규

후속 (PR-H4b 머지 후):
- **PR-H4c (~2~3주) — FE 50+ page UI 통합** — desktop `<Domain>DetailPage` 일괄 audit overlay (9 specialization 도메인) + edit-request banner + mobile-staff 적용 (DispatchScreen / StockAdjustScreen 등) + Designer wireframe 도메인별 1건씩. 본 PR-H4b 머지 후 즉시 진입.
- **logging / dashboard / dc-config / groupware `ApplicationContextLoadIT` 보강** — PR-H4c 진입 시 처리 (본 PR-H4b 는 신규 entity / migration 위주, IT scaffold 는 PR-H4c 와 함께)
- **partner-auth-service** — Phase 12 후속 별도 평가 (사용자 인증 도메인, audit overlay 의 비즈니스 가치 별도 산정)

---

### D-P12-04c. FE 50+ page audit overlay + SSE 일괄 적용 — SlipDetailPage 시드 패턴 1:1 / list 30s polling / read-only AuditInfoBanner (PR-H4c 분할 3/3 마지막, Phase 12 시리즈 종결 마일스톤, 2026-05-10)

PR (`feature/integrated-phase-12-step-4c-fe-audit-overlay-rollout`) — PR #127 (PR-H4b BE 13 service 일괄 `shared/realtime-abstraction` 적용) 머지 후 Phase 12 시리즈 4 분할 3/3 마지막 진입. 본 PR-H4c = FE 50+ page UI 통합 단계 — PR-H4b BE 9 specialization 도메인의 audit overlay endpoint + SSE 채널을 desktop / mobile-staff / admin 50+ page 가 일괄 소비. **사용자 명시 "다른 모든 화면도 마찬가지" 충족** — slip 시드 (PR-H1/H2/H3) 와 동일한 audit overlay + edit-request workflow + 1초 SSE sync 가 9 audit overlay 도메인 모두 동일 동작. **Phase 12 실시간 협업 시리즈 100% 완성 (~13주 시리즈 종료 마일스톤)**.

근거:
- **5 commits 분할 = mobile + admin + 창고/arologis + 회계/영업 + Designer/QA** — `786ec82` FE-Mobile (DriverDashboard polling + DriverSignature audit + SalesEstimatePhoto stub, 3 files +232) + `fba327c` FE-C admin 10 page (PartnersPage / UsersPage / RolesPage / WarehousesPage / DepartmentsPage / RegionsPage / ChatRoomsPage / BlockedPartnersPage / SheetSyncPage / SlipEditRequestsPage = 30s polling + indicator, 10 files +239) + `586bb26` FE-B 창고+arologis 11 page (InventoryAuditDetailPage SlipDetailPage 패턴 1:1 + InventoryAudit list/Form/Compare + Arologis ManualDispatch/PreClassify/Unassigned/DispatchSms/Reconcile + SlipListPage + 신규 InventoryRealtimeClient/ArologisRealtimeClient + 공유 createRealtimeClient/createAuditApi/AuditOverlaySection, 15 files +801) + `3e454da` FE-A 회계+영업 12 page (TaxInvoiceDetailPage/FormPage + EstimateDetailPage/FormPage + DcConfigPage 11 컬럼 overlay + MonthEndClosingPage + SalesPartnerOrderListPage / ApprovalsPage + PartnerLedgerPage / StatementBatchPage / HometaxExportPage read-only AuditInfoBanner + 4 신규 RealtimeClient AccountingRealtimeClient / EstimateRealtimeClient / DcConfigRealtimeClient / PartnerOrderRealtimeClient + revert, 15 files +635) + `0e3b247` Designer + QA (Designer `H4c-fe-rollout-summary.md` 신규 464 line + 매뉴얼 8 docs 일괄 갱신 "수정 이력 보기" + "잠금/요청 워크플로우" section + QA `scenarios.md` 신규 865 line sampling 120 case + 작동 캡처 5 PNG + capture-pr-h4c.js 신규 717 line, 16 files +2620). **도메인 묶음 통합 commit 패턴** (PR-H4b BE-A~BE-E 5 commit 일관 — 리뷰 가독성 + 도메인 fan-out 단순성).
- **3 분류 패턴 — entity 보유 page = SSE+overlay / list-workflow = 30s polling + indicator / read-only = AuditInfoBanner only** — entity 보유 (TaxInvoiceDetailPage / EstimateDetailPage / InventoryAuditDetailPage / SlipDetailPage 등) = `useQuery` + `realtimeClient.subscribe` + `<AuditOverlaySection>` (각 필드별 취소선 + 색상 dot + 수정자명 + 시각 + 복원 dropdown) / list-aggregate page (admin 10 page / SalesPartnerOrderListPage 등) = `useQuery` `refetchInterval: 30_000` + 헤더 우측 "실시간 자동 갱신 30초" indicator (entity-id 단위 SSE 채널 직접 구독은 broadcast endpoint 합류 시 즉시 전환 가능 구조) / read-only (PartnerLedger / StatementBatch / Hometax / DispatchReconcile / DispatchSms) = `<AuditInfoBanner>` 만 (BE audit_log 자동 기록 안내). **SlipDetailPage (PR-H1/H2/H3 시드) 1:1 복제 가드** — 신규 패턴 발명 0, 시드 검증된 component 만 활용.
- **6 RealtimeClient 일관 패턴 + 2 공유 helper** — 4 신규 도메인 client (Accounting / PartnerOrder / DcConfig / Estimate, 단순 thin file 16~32 line) + 2 신규 (Inventory / Arologis) + 공유 `createRealtimeClient.ts` (212 line, JWT header + ReadableStream polyfill + 5s reconnect backoff + heartbeat watchdog 60s) + `createAuditApi.ts` (124 line, listAuditLogs / overlay PATCH / revertToRevision endpoint thin wrapper) + `AuditOverlaySection.tsx` (198 line, 11 컬럼 overlay 분기 + 한국어 라벨 + UUID 비공개 가드). **호출자 변경 0 의무 일관** — 기존 page = 5~50 line 추가만, 신규 component import + props 전달.
- **mobile-staff 12 화면 = 보수적 적용** — DriverDashboardScreen (헤더 우상단 마지막 동기화 시각 + driverCode hash 색상 dot userIdToColor + 30초 polling fallback gateway dispatch SSE 채널 미발행 임시 운영) + DriverSignatureScreen (서명 등록 후 signature field audit overlay 1건 합성, slip-service 미연동 시점에도 SlipDetailScreen 시각 동등 + actor props driverCode/fullName/role default 배송기사/DRIVER) + SalesEstimatePhotoScreen stub (audit overlay 적용 예정 안내 section, Phase 12 estimate→slip 변환 후 활성 가이드) + 기존 SlipDetailScreen (PR-H2) / SlipEditRequestsScreen (PR-H3) 보존 + EstimateWebViewScreen (legacy webview) 보존. **desktop / mobile 색상 일치 가드** (userIdToColor HSL hash util 1:1).
- **admin 10 page = list 진입점 일괄 정합** — 30s polling refetchInterval + 헤더 우측 "실시간 자동 갱신 30초" indicator. BE PR-H4b BE-A~BE-D 의 entity-id 단위 SSE 채널 (partner / inventory / accounting / arologis / partner-order / user / notification 등) 은 broadcast endpoint 합류 시 SSE 직접 구독으로 즉시 전환 가능한 구조. **SlipEditRequestsPage 는 PR-H3 에서 이미 SSE 통합 완료 — 변경 0 보존** (reference 패턴 명시 docstring 만 추가).
- **매뉴얼 8 docs 일괄 갱신 ("수정 이력 보기" + "잠금/요청 워크플로우" section 추가)** — `docs/manual/03-회계/01-분개-입력.md` (POSTED FULLY_LOCKED + 정정 분개) + `docs/manual/03-회계/03-세금계산서.md` (NTS 전송 후 잠금 + 수정세금계산서) + `docs/manual/01-영업/01-거래처-등록.md` (ACTIVE LOCKED_REQUIRES_APPROVAL) + `docs/manual/01-영업/06-견적서.md` (QUOTE_SENT 잠금 + ACCEPTED FULLY_LOCKED) + `docs/manual/02-창고/01-입고-처리.md` (SUBMITTED 잠금 + POSTED 회계 무결성) + `docs/manual/02-창고/05-재고-실사.md` (COMPLETED 결재 + ADJUSTED FULLY_LOCKED) + `docs/manual/05-arologis/02-수동-배차.md` (DISPATCHED 잠금 + 기사 변경 SMS) + `docs/manual/00-시작하기/03-역할별-권한.md` (9 도메인 잠금 정책 종합 일람). 8 docs 모두 도메인별 LockPolicy × 사용자 시나리오 1:1.
- **QA sampling 120 case + Playwright snapshot 시각 회귀 가드** — `docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/scenarios.md` 신규 (865 line) — slip 5 + partner 10 + inventory 15 + accounting 15 + arologis 15 + product/dc/order 15 + user/groupware 10 + partner-portal/admin 10 + broker only 5 + 회귀 가드 5 = 120 case + 페르소나 5 (SALES/WAREHOUSE/ACCOUNTANT/MANAGER/MASTER 또는 DEVOPS) + Playwright snapshot 시각 회귀 가드 (50+ page 픽셀 1:1 자동 보장).
- **작동 캡처 5 PNG (사용자 명시 "다른 모든 화면도 마찬가지" 시각 증거 핵심 5 도메인)** — `docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/working-{tax-invoice-detail-audit,estimate-detail-audit,inventory-audit-overlay,arologis-dispatch-audit,admin-users-audit}.png` 5 PNG (74-98 KB). 회계 (분개+세금계산서) / 영업 견적 DRAFT 자유 수정 / 창고 재고 실사 DRAFT / arologis DISPATCHED 잠금+SMS / admin MASTER 만 타인 수정 — 9 audit overlay 도메인 핵심 5 시각 증거. `tools/manual-capture/capture-pr-h4c.js` 신규 (717 line, PR-H4b 패턴 활용).
- **풀빌드 + typecheck PASS** — `tsc -p tsconfig.node.json && tsc -p tsconfig.web.json` GREEN (desktop / mobile-staff 모두) + Designer 14 service 적용 가이드 일관 + UUID 비공개 가드 (actorId 색상 hash 입력 전용, 화면 노출 = actorName 만, memory `feedback_uuid_no_user_visibility`).
- **단일 통합 PR (5 commits) — 별도 docs PR 회피** — FE-Mobile + FE-C + FE-B + FE-A + Designer/QA = 5 commits + TM (ROADMAP/DECISIONS/dev-report 본 PR 안) = 별도 commit. ROADMAP / DECISIONS / dev-report 본 PR 동시 갱신 (memory `feedback_continuous_docs_sync` 일관).

영향:
- `clients/desktop/src/renderer/realtime/{Accounting,PartnerOrder,DcConfig,Estimate,Inventory,Arologis,Warehouse}RealtimeClient.ts` 6 신규 + `createRealtimeClient.ts` 신규 (212 line)
- `clients/desktop/src/renderer/api/createAuditApi.ts` 신규 (124 line)
- `clients/desktop/src/renderer/components/audit/AuditOverlaySection.tsx` 신규 (198 line)
- `clients/desktop/src/renderer/routes/{TaxInvoice,Estimate,InventoryAudit}{Detail,Form,List}Page.tsx` audit overlay + SSE 통합
- `clients/desktop/src/renderer/routes/{MonthEndClosing,SalesPartnerDcConfig,SalesPartnerOrderList,SalesOrderApprovals,PartnerLedger,StatementBatch,HometaxExport,InventoryDpsCompare,Arologis*,DispatchSms,SlipList}Page.tsx` polling + indicator / read-only AuditInfoBanner
- `clients/desktop/src/renderer/routes/admin/{Partners,Users,Roles,Warehouses,Departments,Regions,ChatRooms,BlockedPartners,SheetSync,SlipEditRequests}Page.tsx` 10 page 일괄 30s polling
- `clients/mobile-staff/src/screens/{driver/DriverDashboard,driver/DriverSignature,SalesEstimatePhoto}Screen.tsx` 3 화면 audit + polling
- `docs/uiux/phase12/H4c-fe-rollout-summary.md` 신규 (464 line — 50+ page 적용 매트릭스 + 9 도메인 한국어 라벨 + 잠금 정책 × UI 분기 + UUID 비공개 가드)
- `docs/manual/{03-회계/01-분개-입력,03-회계/03-세금계산서,01-영업/01-거래처-등록,01-영업/06-견적서,02-창고/01-입고-처리,02-창고/05-재고-실사,05-arologis/02-수동-배차,00-시작하기/03-역할별-권한}.md` 8 docs 일괄 갱신
- `docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/scenarios.md` 신규 (865 line) + `working-{tax-invoice-detail-audit,estimate-detail-audit,inventory-audit-overlay,arologis-dispatch-audit,admin-users-audit}.png` 5 PNG
- `tools/manual-capture/capture-pr-h4c.js` 신규 (717 line)
- `ROADMAP.md` Phase 12 row + 시리즈 분해 + PR 매트릭스 갱신 (PR-H4b #127 확정 + 본 PR-H4c row 추가 + Phase 12 시리즈 종결 마일스톤 명시)
- `docs/dev-reports/integration-phase-12-step-4c-fe-audit-overlay-rollout.md` 신규
- `services/*` BE 변경 0 (PR-H4b 9 specialization 도메인 endpoint 소비만)

후속 (PR-H4c 머지 후 = Phase 12 시리즈 종결):
- **운영 검증 (Phase 12 회귀 가드)** — 9 audit overlay 도메인 × 50+ page 운영 환경 회귀 점검 (multi-context Playwright snapshot 자동 + 사용자 1주 시범 운영)
- **Phase 11 AWS 마이그레이션 진입** — `docs/migration/phase11/M-PHASE-11-readiness.md` 기반 P11-1/P11-2/P11-3 슬라이스 분해 (Seoul region + m5.xlarge + db.t3.medium + RDS auto backup + EC2 Auto Recovery + Health Check Lambda)
- **logging / dashboard / dc-config / groupware `ApplicationContextLoadIT` 보강** — PR-H4b 후속 잔존 backlog (audit overlay 도메인 도입 시 IT scaffold 일괄)
- **partner-auth-service** — Phase 12 후속 별도 평가 (사용자 인증 도메인, audit overlay 의 비즈니스 가치 별도 산정)
- **mobile-staff DispatchSmsScreen / StockAdjustScreen** — arologis broadcast endpoint 합류 시 30s polling → SSE 직접 구독 전환

---

## Phase 10.5 — 아로로지스 독립 분리 (2026-05-14, 본 통합 PR)

### D-AX-00. 아로로지스 = Samhan Public 의 마이크로서비스 → 독립 운영 단위 분리 (single integrated PR, 9 + 1 핵심 결정)

**배경**: 아로로지스 (`arologis-service`, Phase 10 W10-1~W10-4 완료) 를 Samhan Public 14 service 묶음에서 별도 운영 단위로 분리. 같은 AWS 환경 공유 + service-to-service 통신 유지 + 자체 auth + 휴대번호 passwordless 기사 인증.

| # | 결정 |
|---|---|
| D-AX-01 | **분리 수준** = monorepo 유지 + build/배포만 분리 (settings.gradle 의 `:services:arologis-service` 그대로). 코드 재명명 (com.samhanair.logis.*) 비용 회피 |
| D-AX-02 | **service-to-service 통신** = Eureka 클러스터 공유 (현 방식 유지). REST WebClient + load-balancer. `UserClient` 만 제거 (자체 user 도메인 도입), 3 client (Partner/Slip/Notification) 유지 |
| D-AX-03 | **Client 분리** = `clients/arologis-desktop` (Electron + Vite + React, app id `com.samhanair.arologis.desktop`) + `clients/arologis-mobile` (RN Expo, bundle id `com.samhanair.arologis.driver`) 신규 추출. Samhan Public 의 `clients/desktop` + `clients/mobile-staff` 영향 최소 (산재 페이지 후속 슬라이스 = D-AX-11 issue 발행) |
| D-AX-04 | **DB 인스턴스** = 공유 RDS (db.t3.medium) + `arologis_db` 격리 (service-per-DB). 비용 변경 0 |
| D-AX-05 | **운영 도메인** = `arologis.samhan-air.com` 하위 (api / app / mobile 3 subdomain). Route53 A 레코드 3개 추가. **ACM 인증서 SAN 갱신 의무** (wildcard `*.samhan-air.com` 는 2-level wildcard `*.arologis.samhan-air.com` 미커버 — Terraform main.tf 의 `aws_acm_certificate.main` SAN 에 `*.arologis.samhan-air.com` 추가 별도 PR 권고). |
| D-AX-06 | **PR 구조** = 단일 통합 PR (5-team 병렬 — BE 14 commit / FE 8 / Designer 5 / QA 3 / DevOps 6 = 36 + TM merge 5 + baseline 1 = **총 42 commit**). 메모리 `feedback_integrated_pr_pattern` 일관 |
| D-AX-07 | **계정/인증** = 완전 별도 (자체 auth + user 도메인). Samhan Public 의 auth-service / user-service 와 무관. 동일인이 두 제품 사용 시 별도 계정 발급 |
| D-AX-08 | **Auth 패키징** = arologis-service 내장 (단일 jar). 별도 microservice 도입 회피 (over-engineering 가드) |
| D-AX-09 | **기사 인증** = 휴대번호 passwordless (사전 등록 기사만 허용). OTP/PIN 없음. 미등록 phoneNumber = 401 |
| D-AX-10 | **EC2 Health Check Lambda 자동 reboot** = 아로로지스까지 확장 시 Samhan Public 14 service 도 함께 outage 위험 — 본 PR 범위 외, CloudWatch alarm + SNS 만 추가하는 별도 PR 권고. healthcheck 스크립트 (`phase11-deploy.ps1`) 보강 + 영향 분석 문서 (`docs/migration/arologis-extract/06-ec2-recovery-impact.md`) 본 PR 포함 |

**산출 (요약)**:
- spec: `docs/superpowers/specs/2026-05-14-arologis-extract-design.md` (12 섹션)
- plan: `docs/superpowers/plans/2026-05-14-arologis-extract.md` (5-team 36 task + TM 5 + PM 2)
- BE: `AdminUser` + `RefreshToken` entity + `JwtIssuer` + `ArologisJwtFilter` + 5 auth service (AdminLogin/DriverLogin/RefreshToken/MeResponse/...) + `ArologisAuthController` + Flyway V7/V8/V9 + IT 4 신규 (Admin/Driver/Security/Refresh) + `UserClient` 삭제 + `shared:user-client-abstraction` 의존 제거
- FE: `clients/arologis-desktop` skeleton + LoginPage (admin loginId+password) + DriverManagementPage (phoneNumber 사전 등록) + `clients/arologis-mobile` skeleton + PhoneLoginScreen (passwordless) + GpsPermissionScreen (foreground 의무)
- Designer: 5 화면 mock (`docs/uiux/arologis-extract/01~05.md`) + arologis-teal brand color (#2A9D8F) 정의
- QA: 6 시나리오 절차 + 회귀 33 case + 5단계 롤백 dry-run runbook (`docs/qa/arologis-extract/`)
- DevOps: `.github/workflows/arologis-{ci,deploy}.yml` + `infrastructure/docker/docker-compose.arologis.yml` + `services/arologis-service/Dockerfile` (신규) + `infrastructure/terraform/arologis.tf` (Route53 3 record) + `infrastructure/nginx/arologis.conf` (host-header 라우팅 4 server block) + EC2 Health Lambda 영향 분석
- DECISIONS / ROADMAP / README / service README / CLAUDE.md 일괄 갱신

**테스트 (BE Docker 미가용 환경 기준)**:
- 신규 unit: 16 (5 JwtIssuer / 3 AdminLogin / 2 DriverLogin / 5 RefreshTokenService / 1 BcryptHash) PASS
- 회귀 unit: ~98 (DispatchService / parser / matcher / realtime) PASS
- 합 unit 114 PASS, IT 70 (Docker 가용 시) SKIPPED
- arologis-service `assemble` + `compileTestJava` PASS

**후속 (별도 issue / PR 위임)**:
- **D-AX-11** (FE 산재 페이지 이전) — `ArologisManualDispatchPage` / `ArologisPreClassifyPage` / `ArologisUnassignedPage` / `ArologisDispatchReconcilePage` 4 page + `arologis*Api.ts` 3개 + `ArologisRealtimeClient.ts` 가 `clients/desktop/src/renderer/routes/`, `api/`, `realtime/` 루트에 산재 (현 `routes/arologis/` 폴더에는 `DISPATCH-DESIGN.md` 1건만 존재). 본 PR = placeholder + dispatches/ 폴더 skeleton. 후속 = 산재 페이지 `git mv` + import path 정정 + 실 routing.
- **D-AX-12** (mobile cross-import 분리, 2026-05-15) — `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx` 의 `../SlipDetailScreen` 직접 import 제거. 채택안은 `SlipDetailScreen` 이동/복제/shared 추출이 아니라 driver-local `DriverSlipDetailEntry` 경계 추가. 현재 배차 응답의 placeholder `vehicle-*` slipId 는 안내 화면으로 처리하고, 실제 slip bridge 는 아로로지스 모바일 이식 후속 PR에서 확장. `SlipDetailScreen` 의 comment/audit/edit-request/SSE 기능은 보존.
- **D-AX-13** (BE/FE auth schema 정합, 2026-05-15) — `/auth/me`와 login/refresh 응답을 같은 공개 식별자 계약으로 정렬. `AuthTokenResponse`/`MeResponse`는 admin `loginId/fullName`, driver `driverCode/phoneNumber`를 role 별로 제공하고 UUID는 내부 저장/검증 용도에만 둔다. desktop은 `loginId/fullName` undefined 저장을 방지하고, mobile은 login/refresh 흐름에서 `driverCode/phoneNumber`를 보존한다. QA 산출물은 `docs/qa/d-ax-13-auth-contract/`.
- **ACM SAN 갱신** (D-AX-05 의 부속) — Terraform main.tf `aws_acm_certificate.main` 의 `subject_alternative_names` 에 `*.arologis.samhan-air.com` 추가 별도 PR.
- **EC2 Health Lambda** (D-AX-10 의 부속) — CloudWatch alarm + SNS 만 추가하는 별도 PR.

**메모리 (양 PC sync)**:
- `.claude/memory/project_arologis_independent.md` (project) — 9 결정 + 도메인 영향
- `.claude/memory/feedback_arologis_name.md` (feedback) — 한국어 표기 "아로로지스" 정식
- `.claude/memory/feedback_samhan_public_name.md` (feedback) — 외부 호칭 "Samhan Public"
- `.claude/memory/feedback_arologis_extract_autopilot.md` (feedback) — 본 conversation 의 자율 진행 권한 (머지 외)

**비용**: AWS 변경 0 (EC2 m5.xlarge 1대 + RDS db.t3.medium 1대 공유, ₩405K/월 유지)


### D-AX-14. 기사 어플 — 본인 휴대번호 자동 인식 + 1-tap 로그인 (2026-05-14 사용자 결정)

D-AX-09 (passwordless) 위에 **본인 번호 자동 인식 흐름** 추가. 입력 *방법* 만 자동화 (인증 정책 변경 X).

**자동 인식 흐름**:
1. **SecureStore 우선** (key `arologis.driver.phoneNumber`) — 이전 로그인 성공 시 저장. 다음 실행부터 1-tap.
2. **Android `READ_PHONE_NUMBERS` 권한 요청** (SecureStore 미존재 시) — 첫 실행 dialog. 허용 시 `react-native-device-info.getPhoneNumber()` → 본인 번호 자동 채움. EAS Build dev client 의무 (Expo Go 미가용).
3. **iOS / 권한 거부 / native 미가용** — 수동 입력 fallback (기존 `03-mobile-phone-login.md` mock NumPad).

**UI**: 자동 인식 시 phoneNumber `fontSize 32 bold arologis-teal` 대형 표시 + "본인 번호로 로그인" 큰 버튼 1-tap + "다른 번호로 로그인" link.

**구현**:
- `clients/arologis-mobile/src/hooks/usePhoneNumberAutoFill.ts` (신규) — SecureStore → Android native → fallback 흐름 + `normalizeKorean` (+82 / hyphen 처리)
- `clients/arologis-mobile/src/screens/PhoneLoginScreen.tsx` (갱신) — 자동/수동 카드 분기 + saveAutoFillNumber on success + clearAutoFillNumber on 401
- `clients/arologis-mobile/package.json` (갱신) — `expo-secure-store` + `react-native-device-info` 의존 추가
- `clients/arologis-mobile/app.json` (갱신) — Android `READ_PHONE_NUMBERS` + `READ_PHONE_STATE` permission 추가
- `docs/uiux/arologis-extract/03b-mobile-phone-auto-detect.md` (신규) — Designer mock (3 흐름 분기)
- `docs/uiux/arologis-extract/03-mobile-phone-login.md` (기존, 보존) — 수동 입력 fallback mock

**PII**: phoneNumber 는 SecureStore (iOS keychain / Android EncryptedSharedPreferences) 에 암호화 저장. 일반 storage 노출 X. 401 미등록 시 자동 clear.

**참조**: D-AX-09 (passwordless) / `feedback_arologis_extract_autopilot` (자율 진행)

### D-AX-15. arologis-mobile dashboard/GPS 선이식 (2026-05-15)

D-AX-12 후속으로 `clients/arologis-mobile` 로그인 후 placeholder `DispatchListScreen` 대신 전용 `DriverTabNavigator` 로 진입한다.

사용자 요청에 따라 진행 방향은 멋대로 단정하지 않고 다자선택 후 추천안 B를 승인받았다.

**채택 범위**:
- dashboard + GPS 두 탭만 먼저 이식.
- 서명 / 배송사진 / 검수사진 / 실제 slip 상세 bridge 는 후속 PR 선택지로 분리.
- `mobile-staff` driver mode 는 운영 검증 전까지 삭제하지 않음.

**구현**:
- `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`
- `clients/arologis-mobile/src/screens/driver/DriverDashboardScreen.tsx`
- `clients/arologis-mobile/src/screens/driver/DriverLocationTrackingScreen.tsx`
- `clients/arologis-mobile/src/api/arologis.ts`
- `clients/arologis-mobile/src/utils/userColorHash.ts`
- `clients/arologis-mobile/src/theme/tokens.ts`

**검증**:
- `clients/arologis-mobile npm run typecheck`
- `rg` cross-import guard (`mobile-staff` 직접 참조 없음)
- PR 본문용 1200px 한국어 QA 캡처 8장

### D-AX-16. arologis-mobile signature / sign-and-send-copy 이식 (2026-05-15)

D-AX-15 후속 선택지 중 사용자 선택 1번에 따라 `clients/arologis-mobile` 에 전자서명 + sign-and-send-copy 1-tap 흐름을 이식한다.

**선택지 기록**:
- 1안(추천): backend `today` 응답을 실제 서명 가능한 정차 target 까지 확장하고 앱에서 정차 선택 후 호출.
- 2안: 화면만 이식하고 비활성/mock target 으로 보류.
- 3안: 테스트용 수동 target 만 둠.

사용자 이전 지시의 “추천 방식”에 따라 1안을 채택했다. `mobile-staff` 의 임시 all-zero mock stop 방식은 `arologis-mobile` 에 복제하지 않는다.

**채택 범위**:
- `GET /driver-app/arologis/dispatches/today` 응답에 `dispatchDate`, `dispatchType`, `label`, `stops[]` 를 추가하고 `dispatchId` UUID 는 제외.
- sign-and-send-copy 는 today UUID-free path 에서 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 내부 `dispatchId` 를 해석한다.
- dashboard 차량 카드 안에 정차 목록과 `서명` 버튼 표시.
- 하단 `서명` 탭 추가. target 없이 탭 진입 시 배차 선택 안내.
- `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy` 호출.
- 200 image/png success, 409 duplicate, 422 bridge fail, phone missing, renderer fail 분기 처리.
- `react-native-signature-canvas` 로 실제 서명을 캡처하고, `expo-file-system` + `expo-sharing` 으로 PNG 저장 후 Share Sheet 호출.

**검증**:
- Backend unit RED/GREEN: `ArologisDriverAppControllerTest`
- Backend IT: `ArologisDriverAppControllerIT.today_with_internal_driver_returns_200` 는 Docker 미가용 시 Testcontainers skip.
- Frontend type RED/GREEN: `clients/arologis-mobile/src/__tests__/types/signatureContract.test-d.ts`
- `clients/arologis-mobile npm run typecheck`
- PR 본문용 1220px 한국어 QA 캡처 10장

### D-AX-17. arologis-mobile 배송사진 / 검수사진 이식 (2026-05-15)

D-AX-16 후속 선택지 중 사용자 선택 1번에 따라 `clients/arologis-mobile` 에 DELIVERY / INSPECTION 사진 업로드 흐름을 이식한다.

**선택지 기록**:
- 1안(추천): 인증된 오늘 정차 target 기반 사진 API 를 추가하고 slip-service attachment 로 저장.
- 2안: 기존 `mobile-staff` public token/batchToken 흐름을 복제.
- 3안: UI 만 먼저 이식하고 업로드는 후속 처리.

사용자 이전 지시의 "추천 방식"에 따라 1안을 채택했다. `mobile-staff` 의 public token 사진 흐름은 아로로지스 전용 today target/권한/UUID 비공개 계약과 맞지 않아 복제하지 않는다.

**채택 범위**:
- `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}` 추가.
- `photoType` 은 `DELIVERY` / `INSPECTION` 만 허용한다.
- 요청 target 은 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 구성하고 서버에서 내부 dispatch/stop/slip UUID 로 해석한다.
- driver-facing API/UI 응답에는 `dispatchId`, `vehicleId`, `stopId`, `slipId`, `attachmentId`, `downloadUrl` 을 노출하지 않는다.
- `arologis-service` 는 internal multipart 로 `slip-service` `/internal/slips/{slipId}/attachments` 에 위임한다.
- `slip-service` internal attachment bridge 는 DELIVERY / INSPECTION 만 허용한다.
- `clients/arologis-mobile` 은 사진 탭, dashboard 사진 버튼, empty-target guard, DELIVERY 최대 3장, INSPECTION 최대 5장, 업로드 진행/성공/실패/재시도를 제공한다.
- `expo-image-picker` / `expo-image-manipulator` 로 촬영/선택/리사이즈 후 multipart 업로드한다.

**검증**:
- Backend targeted: `ArologisDriverAppControllerTest`, `SlipClientTest`, `SlipInternalAttachmentControllerTest`.
- Docker/Testcontainers actual run: `:services:arologis-service:test :services:slip-service:test`.
- Frontend typecheck: `clients/arologis-mobile npm run typecheck`.
- Frontend Jest: `DriverPhotoScreen.test.tsx`, `arologisPhotoUpload.test.ts`.
- Expo dependency alignment: `npx expo install --check`.
- PR 본문용 1260px 한국어 QA 캡처 10장.

### D-AX-18. arologis-mobile 전표 상세 브리지 (2026-05-16)

D-AX-17 후속 선택지 중 사용자 선택 1번에 따라 `clients/arologis-mobile` 에 오늘 정차 기반 읽기 전용 전표 상세를 연결한다.

**선택지 기록**:
- 1안(추천): today 정차 target 을 서버에서 slip 상세로 해석하고 UUID 없는 읽기 전용 상세 화면을 제공.
- 2안: `mobile-staff` 의 기존 전표 상세 화면을 직접 공유/복제.
- 3안: dashboard 버튼과 empty state 만 먼저 붙이고 상세 API 는 후속 처리.

사용자 이전 지시의 "추천 방식"에 따라 1안을 채택했다. `mobile-staff` 직접 import 는 D-AX-12 경계 분리 방향과 충돌하므로 복제하지 않는다.

**채택 범위**:
- `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail` 추가.
- 요청 target 은 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 구성하고 서버에서 내부 dispatch/stop/slip UUID 로 해석한다.
- slip 매핑 없음은 422 `SLIP_MAPPING_NOT_FOUND`, slip-service 상세 조회 실패는 502 `SLIP_DETAIL_FETCH_FAILED` 로 분리한다.
- driver-facing API/UI 응답에는 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 을 노출하지 않는다.
- `clients/arologis-mobile` dashboard 정차 행에 `전표` 버튼을 추가하고, 상세 화면은 전표번호/거래처/주소/창고/품목/합계만 읽기 전용으로 표시한다.
- comments/audit/SSE proxy 와 편집 기능은 D-AX-18 범위에서 제외하고 후속 선택지로 남긴다.

**검증**:
- Backend targeted: `ArologisDriverAppControllerTest`.
- Docker/Testcontainers actual run: `:services:arologis-service:test :services:slip-service:test`.
- Frontend typecheck: `clients/arologis-mobile npm run typecheck`.
- Frontend Jest: `DriverSlipDetailScreen.test.tsx`, `arologisSlipDetail.test.ts`.
- Expo dependency alignment: `npx expo install --check`.
- 공개 TS typecheck: `StopSlipDetailResponse` 에 `id/dispatchId/vehicleId/stopId/slipId/downloadUrl` 유입 차단.
- PR 본문용 1260px 한국어 QA 캡처 8장.

### D-AX-19. mobile-staff 기사 모드 은퇴 (2026-05-16)

D-AX-15~18 로 `clients/arologis-mobile` 에 dashboard/GPS, 서명, 사진, 전표 상세이 모두 이관되었으므로 `clients/mobile-staff` 의 기사 런타임을 제거한다.

**선택지 기록**:
- 1안(추천): `mobile-staff` 기사 모드 런타임을 제거하고 estimate WebView 단일 진입으로 축소.
- 2안: 앱 내부에 "기사 앱으로 이동" 안내 화면/딥링크를 추가.
- 3안: 코드는 보존하고 hidden feature flag 로만 비활성화.

사용자 이전 지시의 "추천 방식"에 따라 1안을 채택했다. 2안은 아직 배포/딥링크 운영 경로가 확정되지 않았고, 3안은 죽은 코드와 native 권한 의존성을 남겨 회귀 위험이 크다.

**채택 범위**:
- `clients/mobile-staff/src/screens/driver/**`, `src/api/arologis.ts`, `src/hooks/useGpsPermission.ts`, 기사 전용 Jest 제거.
- `AppRootNavigator` 는 `EstimateWebViewScreen` 만 렌더링하고 `배송기사` mode switch 를 노출하지 않는다.
- `base-64`, `@types/base-64`, `expo-file-system`, `expo-location`, `expo-sharing` 제거.
- `app.config.js` 의 위치 권한, background location, `expo-location` plugin 제거. 정적 `app.json` 은 Expo Doctor 중복 경고를 피하기 위해 삭제하고 `app.config.js` 를 단일 source of truth 로 유지.
- slip comment/audit/edit-request/attachment 공용 API 는 `salesUtils.API_BASE_URL` 로 base URL 을 이동한다.
- `expo-image-picker`, `expo-image-manipulator`, `react-native-sse`, `react-native-webview` 는 영업 방문사진/전표 실시간/견적 WebView 용도로 유지한다.

**검증**:
- `clients/mobile-staff npm run typecheck`.
- `npm test -- AppRootNavigator.test.tsx --runInBand`.
- `npx expo install --check`, `npx expo-doctor`.
- no driver runtime import guard.
- PR 본문용 1260px QA 캡처 5장.

### D-AX-20. Admin 사진 감사/재업로드 후보 화면 (2026-05-16)

D-AX-17 배송/검수 사진과 D-AX-18 전표 상세 bridge 이후, 운영자가 사진 업로드 상태를 조회하고 재업로드 후보를 확인할 수 있는 read-only Admin 화면을 추가한다.

**선택지 기록**:
- 1안(추천): `slip_attachments` + `slips` 기존 데이터를 조인해 Admin 사진 감사/재업로드 후보 화면을 만든다.
- 2안: 전표 상세 comments/audit/SSE proxy 를 먼저 확장한다.
- 3안: 실제 기기 QA 를 먼저 진행한다.

사용자 이전 지시의 "추천 방식"에 따라 1안을 채택했다. 사진 업로드 기능이 이미 driver app 에 들어갔으므로 운영 확인 화면을 먼저 닫는 것이 리스크가 작다.

**채택 범위**:
- BE `GET /slips/admin/photo-audit` 추가. gateway 외부 경로는 `/api/v1/slips/admin/photo-audit`.
- 권한은 `WAREHOUSE` / `MANAGER` / `MASTER`.
- 필터는 `type/from/to/slipNo/page/size`, 기본 page size 50, 최대 100.
- 신규 DB/Flyway 없이 `slip_attachments` 와 `slips` read-only join 으로 조회한다.
- 응답에는 작업용 `attachmentId` 를 포함하되 `slipId` 는 포함하지 않는다. UI 는 `attachmentId` 를 표시하지 않는다.
- desktop `/admin/photo-audit` route 와 창고 운영 sidebar `사진 감사` entry 를 추가한다.
- 현재 페이지 기준 `slipNo + attachmentType` 중복을 `재업로드 {count}회` badge 로 표시한다.
- `downloadUrl` 은 이미지 `src` 로만 사용하고 raw URL 텍스트는 표시하지 않는다.
- `uploadedBy` 가 UUID 패턴이면 FE 에서 `업로더 확인 필요`로 치환한다.
- 사용자 노출 전표번호 샘플은 `YYYY/MM/DD-{순번}` 형식을 사용한다.

**후속 결정 후보**:
- 기존 slip/dispatch/order 번호 예시 중 `001` padding, `S-2026-*`, `SL-*` 계열을 업무/메뉴 범위 표준 `YYYY/MM/DD-{순번}` 으로 정리하는 별도 PR.
- 삼한 퍼블릭 거래처 생성/관리 UI gap 점검.
- 사진 감사 후속 mutation(재업로드 요청 기록, 후보 해제)은 별도 role-gated PR.

### D-AX-21. 전표/배차 업무번호 범위형 표준화 (2026-05-16)

**배경**: 개발책임자 최신 지시 — UUID는 숨겨진 고유 PK이고, 전표코드/배차번호 등 사용자 노출 업무번호는 `YYYY/MM/DD-{순번}` 형식으로 통일한다. 단 판매전표와 구매전표처럼 서로 다른 메뉴/업무 속성은 같은 날짜 같은 순번을 가져도 된다.

**결정**:
- 공개 업무번호 scope = 서비스/메뉴/업무 속성 + 날짜다. OUTBOUND `2026/05/16-1`, INBOUND `2026/05/16-1`, 배차 `2026/05/16-1` 은 서로 다른 도메인 값이므로 동시에 허용한다.
- 전표번호 scope = `slip_type + slip_date`. OUTBOUND `2026/05/16-1` 과 INBOUND `2026/05/16-1` 은 동시에 허용한다.
- active slip unique = `slip_type + slip_no + is_deleted=false`. `slip_no` 단독 unique/lookup 은 신규 코드에서 지양한다.
- 배차번호도 전표번호와 같은 공개 형식 `YYYY/MM/DD-{순번}` 으로 정리한다. 기존 `DT-YYYYMMDD-NNN` 은 폐기한다.
- `SL-*`, `S-2026-*`, `001` padding 예시는 신규 fixture/문서/QA 캡처에서 제거한다.
- workflow syntax/actionlint 오류는 다음 PR CI 신뢰성을 막는 P0로 보아 본 PR에 최소 수정 포함한다.

**검증 의무**:
- Docker JDK `slip-service` / `arologis-service` 전체 테스트.
- 모바일 Jest/typecheck + 데스크톱 typecheck.
- actionlint `.github/workflows/*.yml`.
- PR 본문 캡처 8장 이상.

### D-AX-22. driver-facing UUID 비노출 계약 hardening (2026-05-16)

**배경**: D-AX-21 업무번호 표준화 이후, UUID PK 와 사용자 표시 업무번호의 경계를 더 엄격히 고정한다. UUID 는 복구/이력/조인용 내부 PK 이며, 기사 앱과 PR 캡처에 보이는 계약은 업무번호, target sequence, 표시명, 마스킹된 연락처만 사용한다.

**결정**:
- GPS 보고 응답은 저장 성공 여부와 capturedAt/source 만 공개한다. 내부 위치 row key 는 응답 body 에 포함하지 않는다.
- 서명 저장 응답과 sign-and-send-copy 성공 header 는 서명 내부키를 공개하지 않는다. 파일명/공유 sheet/토스트도 today target 기반 이름만 사용한다.
- sign-and-send-copy 실패 JSON 은 `copyFailureReason`, `copySent`, `slipBridged` 같은 운영 상태만 공개하고 저장 경로, 원본 URL, 내부키를 포함하지 않는다.
- slip-service full detail 의 `sourceWarehouseName` 은 내부 창고 UUID 문자열화 fallback 을 금지한다. 창고명 lookup 이 없는 경로에서는 중립 표시명만 사용한다.
- 전표번호 중복 허용 범위는 D-AX21과 동일하다. 판매/구매/배차 등 서로 다른 메뉴/업무 속성의 `YYYY/MM/DD-1` 은 같은 문자열이어도 충돌이 아니며, UUID PK + 업무 타입으로 구분한다.

**검증 의무**:
- Docker JDK `slip-service` / `arologis-service` 전체 테스트.
- 모바일 Jest/typecheck + 데스크톱 typecheck/lint/build.
- QA 캡처 8장 이상과 raw PNG 링크 확인.
- driver-facing JSON body/header 에 내부 UUID/원본 URL/저장키가 없는지 테스트 assertion 으로 고정.

---

### SP-04. Samhan Public 전메뉴 / legacy GAS / Notion CSV 이식 감사 (2026-05-16)

**배경**: Samhan Public 전메뉴에서 판매/구매/창고/재고이동/견적/주문 화면이 조회 전용처럼 보이거나, admin-origin 운영 화면이 인사/대표실 셸에 묶여 일반 업무 역할이 접근하기 어려운 구간이 있었다. 또한 `/tools/legacy-gas` 의 기존 이카운트 + Google Apps Script 연동 기능과 Notion 단톡방/발송금지/배차지역 데이터가 실제 서비스로 빠짐없이 이식됐는지 PR/문서/CSV 기준 재감사가 필요했다.

| # | 결정 |
|---|---|
| SP-04-01 | 전메뉴 primary label 은 조회 전용이 아닌 관리형 업무면 `…관리`로 표기한다. `판매관리`, `구매관리`, `재고이동 관리`, `창고 관리`, `견적서 관리`, `주문서 관리`가 기준이다. `주문서 승인`, `거래처 DC 설정`은 단일 행위를 드러내므로 유지한다. |
| SP-04-02 | `DISPATCH` 는 공통 Role enum 에 포함한다. 배차 담당자는 배차/지역 조회를 수행할 수 있으나, 지역 CSV import/edit/delete 같은 운영 변경은 `MANAGER / MASTER`로 제한한다. |
| SP-04-03 | `/sales/new`, `/purchases/new`, `/transfers/new`, `/sales/link-dispatch` 등 생성/발송 route 는 메뉴 노출뿐 아니라 router level `RoleGuard`도 반드시 둔다. |
| SP-04-04 | Excel export 는 운영 데이터 유출 면적이 크므로 `MANAGER / MASTER`로 제한한다. `SALES`는 거래처/판매/구매 목록 조회와 생성 흐름은 사용할 수 있지만 Excel 전체 export 및 거래처 상세 직접 편집은 제한한다. |
| SP-04-05 | 전표/배차/재고이동/견적/주문 등 사용자 노출 업무번호는 `YYYY/MM/DD-{순번}` 형식을 따른다. 메뉴/업무 타입이 다르면 같은 날짜 같은 순번이 중복될 수 있으며, 내부 UUID PK와 업무 타입이 정합성을 담당한다. |
| SP-04-06 | legacy GAS/Notion row count 검증은 과거 PR #115 시점 hardcoded count가 아니라 현재 CSV export 의 non-empty row 기준으로 한다. 2026-05-16 현재 기준: 배차지역 20 / 거래처 DC 213 / 단톡방 112 / 발송금지 6. |
| SP-04-07 | `/tools/legacy-gas` 이식 상태의 근거 PR은 #115(노션 4 CSV), #117(GAS B outbound), #118(GAS B accounting), #119(GAS C/D + Aligo mock), #120(vendor OCR), #163(legacy-gas cross-check + DPS)로 둔다. 누락이 아니라 mock/운영연동 후속인 항목은 dev-report 에 분리해 표시한다. |
| SP-04-08 | PR 캡처는 1장 요약이 아니라 메뉴/권한/노션 row count/legacy GAS 대조/표시번호/검증 matrix 를 여러 장으로 첨부한다. |
| SP-04-09 | 현재 Notion 단톡방리스트/발송금지리스트는 `거래처코드`가 없고 `이카운트 사업자명`만 있다. legacy GAS 도 사업자명 index 로 동작했으므로, Samhan Public import 는 code-first 를 유지하되 lookup miss row 를 `LEGACY-NAME-{hash}` alias 로 저장해 기능 누락 없이 보존한다. 사용자 화면에는 alias/UUID를 노출하지 않는다. |
| SP-04-10 | DC CSV는 거래처코드가 있지만 `dc_config_db.partners` seed가 비어 있을 수 있다. import 는 CSV의 `거래처코드`/`업체명`으로 최소 Partner snapshot 을 자동 생성한 뒤 DC config 를 upsert 하며, 이후 정식 partner master 동기화가 들어와도 UUID PK와 partnerCode 로 복구 가능하게 둔다. |
| SP-04-11 | `종합견적서` tab 자체는 출력 양식이므로 modelCode/단가 원본으로 보지 않는다. SP-07에서 정정: GAS UI/기능은 유지하고, 종합견적서는 `*_단가인상` 기본값 + base `인상 전 단가`를 product DB/PriceHistory로 보존한다. `ProductCatalogLookupClient`의 `INTEGRATED_QUOTE_RANGE`는 별도 3열 flat catalog가 있을 때만 override한다. |

---

### SP-05. Samhan Public 실사용 CRUD 표면 재점검 (2026-05-16)

**배경**: SP-04 전메뉴 감사 후, 개발책임자가 지적한 “판매/구매에서 생성·수정·삭제가 안 보인다” 문제를 실제 화면 사용성 관점에서 다시 점검했다. 생성 버튼은 복구되어 있었지만 목록 행 클릭은 다중 선택 토글로 쓰이고 있어 상세/수정 화면으로 가는 명시 진입점이 약했다.

| # | 결정 |
|---|---|
| SP-05-01 | 판매관리 목록은 `상세` 액션을 명시적으로 제공한다. 버튼은 `/sales/:id`로 이동하며, 상세 화면에서 기존 수정/상태 전이를 이어간다. |
| SP-05-02 | 구매관리 목록은 `상세` 액션을 명시적으로 제공한다. 버튼은 기존 `검수` CTA와 공존하며 `/purchases/:id`로 이동한다. |
| SP-05-03 | 판매/구매 목록의 row click은 현재 다중 선택 UX를 유지한다. 상세 진입은 별도 버튼으로 분리해 선택/일괄 인쇄/export 흐름과 충돌하지 않게 둔다. |
| SP-05-04 | 상세 버튼의 화면 텍스트, aria label, data-testid는 공개 업무번호(`slipNo`, `YYYY/MM/DD-{순번}`) 기반으로 만든다. 내부 `row.id`는 route param 전용이며 화면/캡처에 노출하지 않는다. |
| SP-05-05 | 전표 삭제 버튼은 이번 슬라이스에서 추가하지 않는다. 삭제/취소는 soft delete, 회계/재고 이력, 상태 전이 정책을 함께 정해야 하므로 후속 결정으로 분리한다. |
| SP-05-06 | inventory 문서는 최신 PR 상태를 우선 반영한다. 거래처 기본 생성 UI(`/admin/partners/new`)와 구매관리 검수 CTA는 더 이상 “UI 부재”로 표기하지 않는다. |
| SP-05-07 | PR 캡처는 판매/구매 상세 버튼, 거래처 기본 UI, 검수 CTA, 문서 정정, 검증 matrix를 여러 장으로 나누어 첨부한다. |

---

### SP-06. legacy GAS/Notion DB 이관 정합성 (2026-05-16)

**배경**: SP-04에서 `/tools/legacy-gas`와 기존 PR을 대조하며 Notion 단톡방/발송금지/배차지역/DC 데이터의 이식 상태를 확인했지만, 개발책임자는 “Notion import 후 Notion과 통신”이 아니라 “Notion 원본을 우리 DB로 이관하고 이후 모든 통신은 Samhan Public DB CRUD로 전환”하는 것이 원래 방향임을 재확인했다. 따라서 gateway, 운영 스크립트, 사용자-facing CRUD 라벨, 활성 web app의 잔여 Notion endpoint를 같이 정리한다.

| # | 결정 |
|---|---|
| SP-06-01 | Notion 4표(단톡방리스트, 발송금지리스트, 배차지역 분류표, 거래처 DC정보)는 cutover seed 원본일 뿐 runtime source가 아니다. 이관 후 source-of-truth는 각 service DB다. |
| SP-06-02 | 단톡방은 `notification-service.partner_chat_room_mappings`, 발송금지는 `partner-service.blocked_partners`, 배차지역은 `arologis-service.region_dispatch_classifications`, DC는 `dc-config-service.dc_configs`로 소유권을 둔다. |
| SP-06-03 | desktop CRUD 화면/API는 `/admin/chat-rooms`, `/admin/blocked-partners`, `/admin/regions`, `/sales/partner-dc-config`를 기준으로 운영한다. `/admin/regions` 표시명은 `배차지역 관리`로 둔다. |
| SP-06-04 | gateway는 full-path controller에 대해 generic StripPrefix route보다 앞선 no-strip route를 둔다. 대상: `/api/v1/notification/admin/chat-rooms/**`, `/api/v1/partners/admin/blocks/**`, `/api/v1/dc-config/admin/**`, `/api/v1/partner-approvals/**`. |
| SP-06-05 | 거래처 주문 인증 `/api/v1/auth/partner-*`는 `auth-service` generic route가 아니라 `partner-auth-service` no-strip public route로 먼저 라우팅한다. |
| SP-06-06 | `import-notion-csv.ps1`는 “Notion import”가 아니라 “DB 이관” 스크립트로 정의한다. 로컬 포트 충돌 시 `SAMHAN_API_GATEWAY_PORT` 및 `SAMHAN_*_PORT` override, default+100 health fallback을 따라 gateway 로그인과 service endpoint를 호출한다. |
| SP-06-07 | `run-smoke-tests.ps1`는 health 단계에서 해석한 실제 service port를 gateway/direct smoke endpoint에 재사용한다. 하드코딩 포트와 실제 부팅 포트가 달라 검증이 실패하면 안 된다. |
| SP-06-08 | 활성 web/order app에 `https://api.notion.com` 또는 `Notion-Version` runtime endpoint 문자열을 남기지 않는다. legacy 함수명은 호환을 위해 유지하되 DB 로그 RPC로 위임하고, shim은 legacy 4-인자와 migrated 2-인자 호출을 모두 정규화한다. |
| SP-06-09 | 운영 검증 SQL은 실제 Flyway 테이블명과 soft-delete active 조건 기준으로 작성한다: `region_dispatch_classifications`, `partner_chat_room_mappings`, `blocked_partners`, `dc_configs`. |
| SP-06-10 | SP-06 PR 캡처는 DB 이관 흐름, gateway no-strip route, CRUD 화면별 소유 DB, smoke 포트 재사용, Notion endpoint 제거, 검증 matrix를 여러 장으로 분리한다. |
| SP-06-11 | `partner-approvals` no-strip gateway route는 partner-auth-service downstream에서도 `X-User-*` header auth를 수용해야 한다. gateway route 추가만으로 인증 정합성이 끝났다고 보지 않는다. |

---

### SP-07. Google Sheets 견적/주문 원본 재검증 + credential form 분리 (2026-05-16)

**배경**: 개발책임자는 종합견적서/주문서가 Google Spreadsheet 데이터를 그대로 가져와야 하며, 외부 원천과의 통신 방향은 Samhan Public DB/API 계약으로 정리되어야 함을 재확인했다. GAS UI/기능은 그대로 유지하고 Notion 통신만 DB/API로 치환한다. Notion은 SP-06에서 DB 이관 원칙을 고정했고, SP-07에서는 Google Sheets의 source tab과 output/control form을 분리해 견적/주문 데이터 흐름을 재검증한다.

| # | 결정 |
|---|---|
| SP-07-01 | `종합견적서` tab 자체는 출력 양식이다. 모델/단가 원본은 `홈멀티_단가인상`, `싱글 세트_단가인상`, `싱글 구성품_단가인상`, `상업멀티_단가인상`, `상업멀티 구성_단가인상`, `구형` 등 source tab이다. |
| SP-07-02 | `전표업로드목록`은 전표 업로드용 output/form이다. bootstrap prefetch나 catalog lookup source로 사용하지 않는다. |
| SP-07-03 | `전표생성폼`은 credential-bearing 제어 폼이다. API 인증키/계정값은 문서, 테스트 fixture, PR 캡처에 게시하지 않으며 runtime bootstrap range-map에도 포함하지 않는다. |
| SP-07-04 | `partner-order-service` bootstrap `range-map`은 거래처 발송 주문서 GAS처럼 base payload와 `*_단가인상` helper map을 모두 읽는다. 존재하지 않는 `설정!A1:Z` config read는 제거하고, config는 V2 seed fallback + DC secret strip으로 응답한다. |
| SP-07-05 | `ProductCatalogLookupClient`는 기존 vendor OCR 업로드 UI/API를 바꾸지 않고 `_단가인상` tab에서 modelCode 단가를 찾는다. `INTEGRATED_QUOTE_RANGE`는 별도 3열 flat catalog를 운영자가 만든 경우에만 지정한다. |
| SP-07-06 | `ProductSheetSyncService`는 `*_단가인상` tab을 ProductMaster 기본 단가로 동기화하고, 붙지 않은 base tab은 `인상 전 단가`용 `PriceHistory`로 보존한다. Samhan Public 화면/API는 DB 계약을 통해 조회/CRUD하고, 외부 spreadsheet는 검증/동기화 원천으로만 다룬다. |
| SP-07-07 | live connector snapshot은 tab metadata와 민감값 없는 제품 샘플만 문서화한다. 거래처 tab은 header/row count 중심으로 기록하고 개인 연락처 row는 게시하지 않는다. |
| SP-07-08 | SP-07 PR 캡처는 live tab inventory, source/output 분리, secure range-map, catalog column contract, product DB sync, verification matrix를 여러 장으로 첨부한다. |

---

## Phase A — Samhan Public 배차 메뉴 + 아로로지스 발송 (2026-05-14)

### D-DB-00. Samhan Public 배차 메뉴 신규 + 아로로지스 service-to-service 발송 (5-team 통합 PR, 9 결정)

**배경**: 출고전표 (slip-service) → 배차담당자 → 배차 메뉴 → 아로로지스 발송 흐름의 **Phase A** (Phase B~F 별도). 사용자 요구 (2026-05-14): 50개 페이지네이션 + 차량 추가 9 종류 + drag-and-drop + 배차 완료 → arologis Mock matcher 회신.

| # | 결정 |
|---|---|
| D-DB-01 | 배차 도메인 위치 = slip-service 안 신규 (`dispatch_task` + `dispatch_vehicle_group` + `dispatch_vehicle_group_slip` + `dispatch_matched_driver`) |
| D-DB-02 | drag-and-drop = `@dnd-kit/core` + `@dnd-kit/sortable` (desktop). RN mobile = long-press 250ms + slip→그룹 선택 sheet (RN 호환 fallback, 진짜 drag 는 Phase B 후보 `react-native-gesture-handler`) |
| D-DB-03 | 차량 종류 9 = MOTORCYCLE / DAMAS / TONNAGE_1 / TONNAGE_1_5 / TONNAGE_2_5 / TONNAGE_3 / TONNAGE_5 / TONNAGE_10 / TONNAGE_20. arologis VehicleTonnage 확장 (legacy 2 deprecated 유지) |
| D-DB-04 | Slip dispatchStatus = `slips` 테이블에 column 추가 (UNDISPATCHED / DISPATCHING / DISPATCHED). plan 의 'slip' 명칭은 실제 repo 의 'slips' 일관 적용 |
| D-DB-05 | 발송 endpoint = `POST /internal/arologis/dispatches` (X-Internal-Token + ROLE_MASTER). arologis 발송 default URL = `http://arologis-service:8097` |
| D-DB-06 | UI = desktop + mobile-staff (양쪽). mobile = AppRootNavigator 의 신규 `dispatch` mode (3rd mode, ROLE-aware) |
| D-DB-07 | Phase A 매칭 = MockDriverMatcher (Phase B 에서 InsungQuickDriverMatcher 실 활성, W10-2 trigger) |
| D-DB-08 | 회신 endpoint = `POST /internal/slip/dispatch-tasks/{id}/confirm` + `/unavailable`. slip-service 실 port = **8086** (plan 의 8084 정정, 실 application.yml 일관) |
| D-DB-09 | 알림 = notification-service Aligo (배차담당자, 회신 시점). batch sendExternalSms phone resolve 는 후속 Phase |

**산출 (25 commit)**:
- BE 14 commit: slip-service 4 entity + Slip.dispatchStatus + Flyway V21/V22 (V16/V17 충돌 회피) + 5 service + 3 controller + 2 client + arologis VehicleTonnage 확장 (V10) + DispatchReceiveService + SlipDispatchTaskClient + 단위 ~45 + IT ~13 compile PASS
- FE 3 commit: desktop dispatch-board 페이지 5 컴포넌트 + `@dnd-kit/core` + 사이드바 + mobile-staff DispatchBoardScreen (long-press fallback)
- Designer 5 commit: 5 mock 1509줄 (desktop / mobile / add vehicle / slip detail / state badges) + arologis-teal #2A9D8F + a11y
- QA 2 commit: 6 시나리오 + 회귀/롤백 runbook + Mock PNG 6장 (PowerShell System.Drawing + UTF-8 BOM, 재실행 가능)
- DevOps 1 commit: env-templates 갱신 + docker-compose.arologis.yml + 배포 가이드

**테스트**:
- BE 단위 45 PASS / IT 13 compile PASS (Docker 가용 시 실 실행)
- FE desktop typecheck + build PASS / mobile typecheck + prebuild PASS
- 회귀 가드 0 결함 (TM compile assemble + compileTestJava 양쪽 PASS)

**후속 (별도 issue / PR 위임)**:
- **Phase B** — arologis `InsungQuickDriverMatcher` 실 활성 (W10-2 trigger 대기)
- **Phase C** — 배차 완료 후 수정/취소 요청 흐름 (Samhan Public ↔ arologis)
- **Phase D** — GPS 실시간 공유 (인성 LBS → arologis → SSE → Samhan Public)
- **Phase E** — 인수자 카톡/문자 발송
- **Phase F** — 전자서명 양쪽 저장 (재활용) + 사본 1회 발송
- **mobile drag-and-drop** — `react-native-gesture-handler` + `react-native-reanimated` 도입 검토 (D-DB-02 fallback 의 후속)
- **MatchedDriver.driverName** — Phase B 에서 InsungQuick 응답 시 정정 (현재 driverCode 임시 사용)
- **SlipDispatchTaskClient skeleton-mode** — Phase B 시 `samhan.arologis.client.skeleton-mode=false` 활성 환경변수
- **변수명 표준** — `SAMHAN_AROLOGIS_DISPATCH_URL` + `SAMHAN_SLIP_DISPATCH_TASK_URL` (spec § 8 의 _CLIENT_URL 명칭은 폐기, 본 결정 표준)

**비용**: AWS 변경 0 (기존 slip-service + arologis-service 그대로, 신규 service 도입 X)


---

### D-DC-00. Samhan Public 배차 수정/취소 요청 흐름 (Phase C, 2026-05-14)

**배경**: Phase A (PR #188 머지 `01d41f6`) 후속. DispatchTask DISPATCHED 상태에서 수정/취소 요청 → 아로로지스 수락/거부 → 재 dispatch 또는 취소. Phase B (인성데이타 API 링크 도착 후 별도 진행).

| # | 결정 |
|---|---|
| D-DC-01 | 수정 범위 = **전체** (사용자 확정) — slip + 차량 그룹 재배치 + 정차 순서 + 차량 종류 변경 |
| D-DC-02 | 수정 lock = **DISPATCHED 만 요청 가능** (DRAFT/DISPATCHING/FAILED 는 직접 수정) |
| D-DC-03 | DispatchTaskStatus 6 신규 + CANCELLED = 총 11 값 (MODIFICATION_REQUESTED / ACCEPTED / REJECTED + CANCEL_REQUESTED / ACCEPTED / REJECTED + CANCELLED) |
| D-DC-04 | **아로로지스 측 = delete-recreate** (incremental 회피, race condition 가드) |
| D-DC-05 | 취소 처리 = CANCELLED + slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete |
| D-DC-06 | 거부 처리 = rejectionReason + 배차담당자 notification |
| D-DC-07 | 권한 = ROLE_DISPATCH + ROLE_MANAGER + ROLE_MASTER |
| D-DC-08 | 재 dispatch = MODIFICATION_ACCEPTED 후 [배차 완료] 재 클릭 → arologis 재 발송 |
| D-DC-09 | 알림 = notification-service Aligo (요청/수락/거부/취소 각 시점) |

**5-team 산출 (16 commit + TM 4 merge = 20 commit)**:
- BE 8 commit: DispatchTaskStatus 11 + Flyway V23 + 5 service + 2 controller endpoint + arologis 2 receive + 4 회신 client + Mock 자동 수락 5초 비동기. unit 24 PASS / IT 9 compile PASS
- FE 2 commit: DispatchTaskDetailModal + 2 RequestDialog + 편집 모드 indicator + 11 상태 배지 + mobile-staff 동일
- Designer 4 commit: 4 화면 mock 1951줄 + 11 상태 배지 매트릭스 종합 (Phase A 4 + Phase C 7)
- QA 2 commit: 6 시나리오 + 회귀/롤백 + Mock PNG 6장 (PowerShell System.Drawing + UTF-8 BOM)
- DevOps 0 (기존 환경변수 재활용)

**테스트**: BE 단위 24 + arologis 3 = **27 PASS** / IT 9 compile PASS (Docker 가용 시 실행). 회귀 가드 0 결함.

**5-team 패턴 정정 (2026-05-14)**: 본 Phase C 머지 후 — `feedback_qa_sequential_after_be_fe.md` 신규 메모리. 다음 Phase D~F 부터 BE/FE/Designer/DevOps 4-team 병렬 → QA sequential 의무.


---

### D-DF-00. Samhan Public 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (Phase F, 2026-05-15)

**배경**: Phase A (PR #188) + C (PR #189) 머지 후. 기사 어플 (mobile-staff) 배송 완료 흐름 — 정차 도착 시 DELIVERY 사진 첨부 → 자체+인수자 서명 캡처 → arologis 양쪽 저장 (자체 `signatures` + slip-service `signature_source=APP`) → 서버 Playwright Chromium 으로 OutboundView 양식 사본 PNG 합성 → mobile expo-sharing 으로 인수자 카톡/SMS 발송 (기사 본인 발신, Aligo 0).

| # | 결정 |
|---|---|
| D-DF-01 | **서명 정보 양쪽 저장** = PR #99 `SlipClient.registerSignature()` 활성 (`SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false`). arologis 자체 `signatures` INSERT + slip-service `slips.signature_source=APP` 갱신 + `slip_signature_audit` 적재. 출고전표 본체 (Slip) 는 slip-service 단일 source of truth |
| D-DF-02 | 사본 형식 = **PNG** (출고전표 양식 사본 + 서명 2개 합성, OutboundView 시각 그대로) |
| D-DF-03 | **사본 발송 채널 = mobile RN expo-sharing 일반 Share Sheet** (카톡/SMS, 기사 본인 계정 발신). Aligo / notification-service 호출 0 (v3 Aligo 폐기) |
| D-DF-04 | 사본 1회 제한 = arologis `Signature.copy_sent_at` (PNG download 시각 기준). NULL → 호출 OK, NOT NULL → 409. 재발송은 Admin 후속 PR |
| D-DF-05 | 인수자 번호 = slip-service `recipientPhoneNumber` (Phase A SlipRef). null/잘못된 형식 → 서명 OK + 사본 skip + reason 응답 |
| D-DF-06 | **PNG 합성 = arologis-service in-process Playwright Java SDK + Chromium headless → `OutboundView.tsx` URL 렌더링 → PNG 캡처** (서버 단일 출처, drift 0) |
| D-DF-07 | 사본 endpoint = arologis `POST /driver-app/.../sign-and-send-copy` (1-tap UX). 응답 = PNG image/png byte[] (성공) 또는 application/json `{copyFailureReason}` (실패) |
| D-DF-08 | 권한 = `ROLE_AROLOGIS_DRIVER` + 서비스 레이어 `JWT.driverId == dispatch.driverId` 검증 (Phase A/C 패턴 일관) |
| D-DF-09 | PII = `recipientPhoneNumber` 응답/로그/UI 마스킹 (`010-****-1234`), DB/audit 풀 번호 보관 (Admin 재발송용) |
| D-DF-10 | PNG 보관 = disk path (`/var/lib/arologis/signature-copies/{signatureId}.png`, env `AROLOGIS_SIGNATURE_COPY_DIR`). Phase 11 AWS 이전 시 S3 키로 갈아탐 |
| D-DF-11 | PNG 양식 사이즈 = A4 portrait, ~600×850 px viewport (OutboundView 의 `a4-portrait` variant), 1MB 이내 |
| D-DF-12 | mobile Share API = **`expo-sharing`** (RN Expo 표준). 카톡/SMS Share Sheet OS 표준. 인수자 번호 화면 표시. KakaoLink SDK 의존 X |
| D-DF-13 | **배송 완료 증거 사진 (DELIVERY) 사전 첨부** = 기존 `SignaturePhotoScreen` 인프라 (P1-8 Stage 4, batchToken 기반 public 업로드, 1MB 자동 압축, 최대 3장). W10-4 deep link 활성 — `SignaturePhotoScreen.onUploaded` → `DriverSignatureScreen` chain. 사진은 slip-service attachment 로만 별도 저장 (사본 PNG 와 분리) |

**4-team + QA sequential 산출 (17 commit, QA 후속 sequential)**:
- Designer 1 commit (`bacb6de`): 3 mock 812 lines (`docs/uiux/samhan-signature-copy/01~03`) — SignatureScreen 1-tap + Share Sheet Android/iOS
- DevOps 3 commit (`7647323` → `4551ef2` → `3e0c359`): Dockerfile (Playwright + Chromium + fonts-noto-cjk) + 4 env + multi-entry print-renderer 빌드 + PrintRendererApp PoC + Phase 11 메모리/CPU 검증 노트 + cutover storage migration runbook
- FE 5 commit (`dc5336c` → `d1dd8a2`): expo-sharing/expo-file-system 의존성 + `api/arologis.ts signAndSendCopy` + `DriverSignatureScreen` 1-tap 갱신 + 5 토스트 + 재시도 + `SignaturePhotoScreen → DriverSignature` chain (D-DF-13 deep link 활성). Jest 7 시나리오 (success/skip/timeout/duplicate/bridge/disabled/chain)
- BE 8 commit (`895a713` → `2d169f5`): Signature 4 column + V11 + `CopyFailureReason` + `CopyImageDiskStorage` + `PlaywrightCopyRenderer` + `SignAndSendCopyService` Tx1+Tx2 orchestration + `POST /sign-and-send-copy` endpoint + 기존 `/sign` `@Deprecated` + slip-service 2 endpoint (`/recipient-phone`, `/full`) + 단위 19 + IT 5
- QA: 후속 sequential — TM 통합 후 Designer 6 시나리오 + 실 PNG 캡처 + 실 Share Sheet 캡처 + 회귀 + 4단계 롤백 runbook 진행 예정

**테스트**: 
- arologis-service: **221 tests / 0 failure / 75 skipped** (단위 19 신규 + 기존 회귀, IT 75 Docker npipe skip, [feedback_testcontainers_windows_docker])
- slip-service: **454 tests / 0 failure / 171 skipped** (PR #99 `SignatureIntegrationIT` 보존, IT 171 Docker npipe skip)
- mobile-staff Jest: **7 PASS / 0 fail** (DriverSignatureScreen 6 + SignaturePhotoScreenChain 1)
- mobile-staff `tsc --noEmit`: **0 error**
- desktop `npm run build:print-renderer`: **SUCCESS** (148.67 kB, 787 ms)

**5-team 패턴 첫 적용**: BE/FE/Designer/DevOps 4 parallel → QA sequential. 본 Phase F 가 새 패턴 첫 적용 사례. TM 통합 commit 후 QA 별도 단계로 실 산출 검증 + 실 PNG/Share Sheet 캡처.

**자체 정정 (4 team 18건)**: BE 9건 + DevOps 4건 + FE 5건 — spec/plan vs 실 코드 정정 (예: SignatureRepository stream filter, 별도 vite.print-renderer.config.ts, mock dataURL guard 보존). 모두 worktree 자체에서 commit.

---

### SP-01. Samhan Public 거래처 관리 메뉴/권한 정합화 (2026-05-16)

**배경**: P0-6 거래처 4탭 UI는 구현되어 있었지만, 목록 화면이 `MASTER + 대표실` 전용 `AdminLayout` 영향권에 있어 `SALES / MANAGER` 사용자가 `신규 등록` 흐름을 찾기 어렵고, 등록 성공 후 `/admin/partners` 복귀가 권한 가드에 막힐 수 있었다.

| # | 결정 |
|---|---|
| SP-01-01 | 정식 UI 진입점 = `판매 > 거래처 관리`. `거래처 마스터` 라벨은 내부 도메인 용어로 보고 사용자-facing 메뉴에서는 `거래처 관리`를 사용한다. |
| SP-01-02 | `/admin/partners`, `/admin/partners/new` 는 `AdminLayout` 밖 공용 route 로 두고 `SALES / MANAGER / MASTER` RoleGuard 를 적용한다. 기존 대표실 인사 셸의 `admin-nav-partners`는 quick link 로 유지한다. |
| SP-01-03 | `partner-service` 4탭 신규 등록 `POST /api/v1/partners/full` 은 `SALES / MANAGER / MASTER` 모두 허용한다. 이는 영업 매뉴얼과 H4b 신규 거래처 직접 작성 기대를 우선한다. |
| SP-01-04 | 목록/검색 `GET /admin/partners`, `GET /admin/partners/search` 도 `SALES / MANAGER / MASTER` 공용 조회로 확장한다. |
| SP-01-05 | 내부 UUID는 계속 비공개다. UI/응답/QA 캡처에는 `partnerCode`, `name`, `bizNo`, `phone` 등 업무 식별자만 표시한다. |

---

### SP-02. Samhan Public 회계 마감 메뉴/route 정합화 (2026-05-16)

**배경**: 매뉴얼은 `매출 마감` 정식 route 를 `/sales/closing`으로, `월말 마감` 정식 route 를 `/accounting/period-close`로 안내한다. 그러나 desktop 사이드바의 회계 그룹 `매출 마감` entry 는 legacy `/warehouse/closing`으로 이동했고, `월말 마감` entry 는 노출되지 않았다.

| # | 결정 |
|---|---|
| SP-02-01 | `매출 마감` 정식 route 는 `/sales/closing`으로 둔다. 판매 그룹과 회계 그룹 양쪽 entry가 같은 route로 이동한다. |
| SP-02-02 | `월말 마감` 정식 route 는 `/accounting/period-close`로 둔다. 회계 그룹에 별도 entry 를 추가한다. |
| SP-02-03 | 두 route 는 기존 `ACCOUNTANT / MANAGER / MASTER` route guard 를 유지한다. 실행/역마감 가능 여부는 화면 내부 `canExecuteClosing` / `canReverseClosing` 정책이 결정한다. |
| SP-02-04 | legacy `/warehouse/closing` route 는 deep-link 호환으로 즉시 삭제하지 않는다. 단, 사용자-facing 사이드바 목적지에서는 제외한다. |
| SP-02-05 | 마감 row 내부 `id`는 action param 전용이며, UI/캡처에는 기간/상태/실행자명 등 업무 식별자만 표시한다. |
| SP-02-06 | `GET /accounting/closings` 와 `GET /accounting/closings/{id}/realtime` 은 `ACCOUNTANT / MANAGER / MASTER` 조회 전용 권한으로 맞춘다. `POST /accounting/closings` 는 `ACCOUNTANT / MASTER`, 역마감은 `MASTER` 전용으로 유지한다. |
| SP-02-07 | 마감 목록 repository 는 nullable JPQL 파라미터 대신 명시적 분기 조회를 사용한다. PostgreSQL/Testcontainers 에서 `year` 필터 조회가 500으로 무너지지 않아야 한다. |
| SP-02-08 | `TaxInvoiceBatchPreviewResponse.batchId` 는 `save()` 반환 entity 기준으로 채운다. UUID는 화면에 노출하지 않지만 다운로드/history API 연결에 필요한 내부 param 이므로 `null`로 응답하면 안 된다. |
| SP-02-09 | accounting-service IT 는 Docker/Testcontainers 가용 시 skip 없이 실행한다. 기존 disabled 5건은 외부 client `@MockBean` 격리와 실제 API 계약 보정 후 재활성화한다. |

---

### SP-03. Samhan Public 구매관리 입고 검수 CTA 복구 + 관리형 메뉴명 정리 (2026-05-16)

**배경**: `구매조회` 정식 route 가 legacy `SlipListPage(INBOUND)`에서 `PurchaseQueryPage`로 통합되면서, 매뉴얼이 안내하는 SAVED/CONFIRMED 행의 **[검수]** CTA와 `InboundInspectionDialog` 연결이 새 화면에 이식되지 않았다. 또한 판매/구매/재고이동/창고/견적서/주문서 화면은 생성·상세·수정/처리 흐름을 품고 있는데 `조회` 또는 단순 명사 라벨로 보여 사용자가 조회 전용으로 오해할 수 있었다. 사용자는 구매번호를 확인한 문맥에서 바로 검수 수량/불량 사유 입력으로 이동할 수 있어야 하며, 관리형 화면은 `…관리`로 드러나야 한다.

| # | 결정 |
|---|---|
| SP-03-01 | `/purchases`와 `/purchases/query`의 정식 구매관리 화면에서 `SAVED / CONFIRMED` 입고전표 행에 **[검수]** CTA를 노출한다. |
| SP-03-02 | 검수 CTA 권한은 `inventory-service` `InboundInspectionController`와 동일하게 `WAREHOUSE / MANAGER / MASTER`로 둔다. `SALES / ACCOUNTANT`는 구매관리 자체를 보더라도 검수 CTA를 보지 못한다. |
| SP-03-03 | CTA 클릭 시 기존 `InboundInspectionDialog`를 재사용한다. 저장/완료 성공 후 구매관리 query를 직접 refetch하여 통합 목록의 상태를 갱신한다. |
| SP-03-04 | `SlipQueryRow`는 backend `SlipResponse.status`를 타입에 포함한다. API schema 변경 없이 FE 타입 누락만 보정한다. |
| SP-03-05 | 버튼 `data-testid`와 화면 표시값은 구매번호(`slipNo`) 기반 public id를 사용한다. 내부 `row.id`/UUID는 Dialog API param으로만 사용하고 사용자 화면/캡처에는 노출하지 않는다. |
| SP-03-06 | 서로 다른 서비스·메뉴·업무 타입의 업무번호는 같은 날짜 같은 순번을 가질 수 있다. 예: 판매전표 `YYYY/MM/DD-1`과 구매전표 `YYYY/MM/DD-1`은 중복 허용이며, 구분은 업무 타입 + 내부 UUID PK가 담당한다. |
| SP-03-07 | 사이드바/페이지 타이틀에서 `판매조회` → `판매관리`, `구매조회` → `구매관리`, `재고이동` → `재고이동 관리`, `창고` → `창고 관리`, `견적서` → `견적서 관리`, `주문서 조회` → `주문서 관리`로 정리한다. |
| SP-03-08 | `주문서 승인`, `거래처 DC 설정`은 이미 단일 업무 행위를 표현하므로 명칭을 유지한다. |
| SP-03-09 | 재고이동 이동번호도 전표번호 표준과 동일하게 `YYYY/MM/DD-{순번}`으로 둔다. 신규 채번은 같은 날짜의 마지막 numeric suffix + 1을 사용한다. `T-YYYY/MM/DD-N`, `TR-YYYYMMDD-NNN` 같은 prefix/zero-padding 형식은 폐기하고 Flyway V10으로 기존 prefix 값을 정규화한다. |

---

### SP-08-2. DPS legacy GAS 저장내역 DB/API parity (2026-05-16)

**배경**: SP-08-1은 legacy GAS/Notion runtime 호출 제거와 기반 계약을 잠갔지만, DPS 비교/품목별 DPS 화면은 GAS의 저장내역/최근 결과 복원 사용감을 아직 DB/API로 보존하지 못했다. SP-08-2는 Notion runtime 호출 없이 Samhan Public `inventory-service`가 DPS 실행 결과 history의 단일 runtime source가 되도록 한다.

| # | 결정 |
|---|---|
| SP-08-2-01 | DPS 저장내역은 `inventory-service`의 `dps_save_history` 테이블에 둔다. payload는 프로그램별 응답 shape를 보존하기 위해 PostgreSQL `JSONB`로 저장한다. |
| SP-08-2-02 | 프로그램 구분은 `DPS_COMPARE`, `DPS_BY_PRODUCT` 두 값으로 고정한다. 두 화면은 같은 API를 쓰되 저장내역 list/latest 조회는 program type으로 격리한다. |
| SP-08-2-03 | 저장 방식은 `AUTO_LATEST`, `MANUAL_NAMED` 두 값으로 둔다. 자동 저장은 사용자+프로그램별 active 1건만 유지하며 이전 자동 저장 row는 BaseEntity soft-delete 처리한다. |
| SP-08-2-04 | 명시 저장은 topic 필수 append-only 기록이다. 동일 사용자의 수동 저장내역은 자동 저장 대체 대상이 아니며 사용자가 행을 클릭해 복원한다. |
| SP-08-2-05 | API는 `/warehouse/audit/dps-history` 하위 `POST`, list, detail, latest 4개 endpoint로 둔다. 권한은 `WAREHOUSE / MANAGER / MASTER`로 정렬한다. |
| SP-08-2-06 | 화면은 legacy GAS 사용감과 맞춰 `실행 / 저장내역` 2탭을 제공한다. latest active row가 있으면 진입 시 자동 복원 배너를 노출하고, row click은 결과 payload를 실행 탭에 복원한다. |
| SP-08-2-07 | 내부 UUID는 path param과 React 상태에서만 사용한다. 사용자 화면과 Playwright `data-testid`는 `dps-history-row-{i}` 같은 row index/업무 문구 기반으로 둔다. |
| SP-08-2-08 | payload는 UTF-8 JSON 직렬화 기준 100KB를 초과하면 422로 거절한다. 파일/이미지 본문을 history에 넣지 않고 결과 요약 JSON만 저장한다. |
| SP-08-2-09 | Notion runtime call은 재도입하지 않는다. `api.notion.com`, `Notion-Version`, `@notionhq` import는 inventory-service main과 desktop renderer에서 0건이어야 한다. |

### SP-08-3-1. 배차 legacy GAS DB/API parity 기반 잠금 (2026-05-16)

**배경**: SP-08-2에서 DPS history parity가 완료되었고, SP-08 후속 구현 대상 2번인 배차 영역은 가배차/지방가배차/미배차/전표정리/배차문자/운송사 비교 6개 화면이 3개 서비스에 분산되어 있다. 실제 DB/API/UI 구현에 앞서 legacy GAS 저장/복원/preview/send 흐름과 도메인별 history 소유권을 먼저 잠근다.

| 결정 | 내용 |
|---|---|
| SP-08-3-1-01 | 배차 history는 공통 `legacy_gas_history` table이 아니라 도메인별 table로 둔다. arologis는 `dispatch_save_history`, slip은 `slip_cleanup_save_history`, notification은 `dispatch_sms_save_history`를 사용한다. |
| SP-08-3-1-02 | arologis 4 화면(가배차/지방가배차/미배차/운송사 비교)은 `POST/GET /admin/arologis/dispatches/history` 하위 4 endpoint로 통합하고 `PRE_CLASSIFY`, `REGIONAL`, `UNASSIGNED`, `RECONCILE` programType으로 격리한다. |
| SP-08-3-1-03 | 전표정리는 `POST/GET /slips/cleanup/history`, programType `SLIP_CLEANUP`으로 둔다. |
| SP-08-3-1-04 | 배차문자는 `POST/GET /admin/notifications/dispatch-sms/history`, programType `DISPATCH_SMS`로 두고, 미리보기 저장은 `AUTO_LATEST`/`MANUAL_NAMED`, 발송 감사는 `SEND_AUDIT` append로 구분한다. |
| SP-08-3-1-05 | 모든 history table은 BaseEntity 7 audit + Soft Delete only + JSONB payload + 사용자 격리 + AUTO_LATEST per user/program active 1건 정책을 따른다. |
| SP-08-3-1-06 | 화면의 저장내역 row testid는 `pre-classify-history-row-{i}`(REGIONAL 토글 포함), `unassigned-history-row-{i}`, `dispatch-reconcile-history-row-{i}`, `slip-cleanup-history-row-{i}`, `dispatch-sms-history-row-{i}`처럼 화면별 prefix + index 기반을 사용하고, 내부 UUID는 화면 텍스트와 testid에 노출하지 않는다. |
| SP-08-3-1-07 | SP-08-3-1은 기획/정적 계약/QA 캡처/문서 동기화만 수행한다. 실제 Flyway/controller/UI 2-Tab 구현은 SP-08-3-2~4에서 분리 진행한다. |
| SP-08-3-1-08 | SP-08-3 sub-sub-task PR 시작 시 각 service `src/main/resources/db/migration/V*.sql` glob 을 즉시 재확인하고, 발견된 최신 번호 + 1 로 Flyway migration 을 채번한다. 문서의 예정 번호(V12/V25/V4)는 시작 시점 참고값이며 최종 채번 근거가 아니다. |
| SP-08-3-1-09 | PR #192 D-AX-11 이후 Samhan desktop 실제 route는 arologis 4 화면 기준 `/arologis/pre-classify`, `/arologis/unassigned`, `/arologis/dispatch-reconcile`이며, legacy arologis-desktop route(`/dispatches/*`)는 과거 비교값으로만 문서화한다. |
| SP-08-3-1-10 | SP-08-3 history endpoint RBAC는 기존 endpoint grep 결과와 1:1로 맞춘다. arologis=`MASTER/MANAGER/DISPATCH/AROLOGIS_MASTER/AROLOGIS_MANAGER`, slip cleanup=`SALES/MANAGER/MASTER`, notification dispatch-batch=`DISPATCH/MANAGER/MASTER`. |

### SP-08-3-2. 아로로지스 배차 저장내역 DB/API/UI 구현 (2026-05-17)

**배경**: SP-08-3-1에서 배차 6개 화면의 history 소유권과 endpoint matrix를 잠갔다. SP-08-3-2는 그중 arologis 소유 4개 화면(가배차/지방가배차/미배차/운송사 비교)의 실제 DB/API/UI 저장/복원 parity를 구현한다.

| 결정 | 내용 |
|---|---|
| SP-08-3-2-01 | arologis 저장내역 테이블은 `dispatch_save_history`로 둔다. payload는 화면별 응답 shape 보존을 위해 `JSONB`로 저장한다. |
| SP-08-3-2-02 | API는 `/admin/arologis/dispatches/history` 하위 `POST`, list, detail, latest 4 endpoint로 둔다. |
| SP-08-3-2-03 | 권한은 SP-08-3-1-10에 따라 `MASTER / MANAGER / DISPATCH / AROLOGIS_MASTER / AROLOGIS_MANAGER`로 둔다. |
| SP-08-3-2-04 | `AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하며 이전 자동 저장 row는 soft-delete 한다. unique race는 1회 retry한다. |
| SP-08-3-2-05 | `MANUAL_NAMED`는 topic 필수 append-only 저장내역이다. 명시 저장 row는 자동 저장 대체 대상이 아니다. |
| SP-08-3-2-06 | 상세 조회는 `findByIdAndCreatedBy`를 사용해 사용자별 저장내역 접근을 격리한다. 다른 사용자의 UUID 직접 접근은 payload를 반환하지 않는다. |
| SP-08-3-2-07 | payload는 UTF-8 JSON 직렬화 기준 100KB 초과 시 422로 거절한다. 파일/이미지 원본은 history에 저장하지 않는다. |
| SP-08-3-2-08 | 가배차 권역과 지방가배차는 같은 화면 파일을 공유하며 `PRE_CLASSIFY`와 `REGIONAL` programType은 분리하되, 저장내역 row testid prefix는 SP-08-3-1 §6.4와 동일하게 `pre-classify-history-*`로 고정한다. |
| SP-08-3-2-09 | 화면은 공통 `HistoryTab`, `RestoredBanner`, `SaveDialog`를 사용한다. row testid는 화면별 prefix + index 기반이며 내부 UUID를 포함하지 않는다. |
| SP-08-3-2-10 | Notion runtime call은 재도입하지 않는다. 신규 backend/frontend 저장내역 산출물은 `api.notion.com`, `Notion-Version`, `@notionhq` 0건이어야 한다. |

### SP-08-3-3. 전표정리 저장내역 DB/API/UI 구현 (2026-05-17)

**배경**: SP-08-3-1에서 slip 전표정리 history 소유권을 `slip_cleanup_save_history`로 잠갔다. SP-08-3-3은 `/sales/slip-cleanup`의 전표정리 결과를 DB/API 저장내역으로 보존하고, 월말 마감 직전 결과를 재현할 수 있게 한다.

| 결정 | 내용 |
|---|---|
| SP-08-3-3-01 | 전표정리 저장내역 테이블은 `slip_cleanup_save_history`로 둔다. payload는 `SlipCleanupResponse` shape 보존을 위해 `JSONB`로 저장한다. |
| SP-08-3-3-02 | API는 `/slips/cleanup/history` 하위 `POST`, list, detail, latest 4 endpoint로 둔다. |
| SP-08-3-3-03 | 권한은 기존 `GET /slips/cleanup`과 동일하게 `SALES / MANAGER / MASTER`로 둔다. `WAREHOUSE`, `INVENTORY`, `ACCOUNTANT`를 history endpoint에 추가하지 않는다. |
| SP-08-3-3-04 | programType은 `SLIP_CLEANUP` 단일 값으로 고정하고, saveMode는 `AUTO_LATEST`, `MANUAL_NAMED` 두 값만 둔다. `SEND_AUDIT`는 notification 전용이다. |
| SP-08-3-3-05 | `AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하며 이전 자동 저장 row는 soft-delete 한다. partial unique race는 service retry 3회 + REQUIRES_NEW `TransactionTemplate`으로 흡수한다. |
| SP-08-3-3-06 | `MANUAL_NAMED`는 topic 필수 append-only 저장내역이다. 명시 저장 row는 자동 저장 대체 대상이 아니다. |
| SP-08-3-3-07 | 상세 조회는 `findByIdAndCreatedBy`를 사용해 사용자별 저장내역 접근을 격리한다. 다른 사용자의 UUID 직접 접근은 존재 은닉을 위해 404 `SLIP_CLEANUP_HISTORY_NOT_FOUND`로 응답하고 payload를 반환하지 않는다. |
| SP-08-3-3-08 | payload는 UTF-8 JSON 직렬화 기준 100KB 초과 시 `SLIP_CLEANUP_HISTORY_PAYLOAD_TOO_LARGE` 422로 거절한다. |
| SP-08-3-3-09 | desktop `/sales/slip-cleanup`은 `실행 / 저장내역` 2탭을 제공한다. latest active row가 있으면 진입 시 자동 복원 배너를 노출하고, row click은 결과 payload를 실행 탭에 복원한다. |
| SP-08-3-3-10 | 화면 row testid는 `slip-cleanup-history-row-{i}` 기반이며 내부 UUID를 포함하지 않는다. createdBy는 UUID 및 X-User-Id 형식 모두 `maskCreatedBy`로 `사용자` 마스킹한다. |
| SP-08-3-3-11 | Notion runtime call은 재도입하지 않는다. 신규 backend/frontend 저장내역 산출물은 `api.notion.com`, `Notion-Version`, `@notionhq` 0건이어야 한다. |

### SP-08-3-4. 배차문자 미리보기/발송 감사 저장내역 DB/API/UI 구현 (2026-05-17)

**배경**: SP-08-3-1에서 notification 배차문자 history 소유권을 `dispatch_sms_save_history`로 잠갔다. SP-08-3-4는 legacy GAS `배차안내문자`의 미리보기 결과와 실발송 감사 결과를 DB/API/UI 저장내역으로 보존한다.

| 결정 ID | 결정 |
|---|---|
| SP-08-3-4-01 | 배차문자 저장내역 테이블은 `dispatch_sms_save_history`로 둔다. payload는 `DispatchBatchPreviewResponse`와 `DispatchBatchSendResponse` shape 보존을 위해 `JSONB`로 저장한다. |
| SP-08-3-4-02 | API는 `/admin/notifications/dispatch-sms/history` 하위 `POST`, list, detail, latest 4 endpoint로 둔다. |
| SP-08-3-4-03 | 권한은 기존 dispatch-batch controller와 동일하게 `DISPATCH / MANAGER / MASTER`로 둔다. |
| SP-08-3-4-04 | programType은 `DISPATCH_SMS` 단일 값으로 고정하고, saveMode는 `AUTO_LATEST`, `MANUAL_NAMED`, `SEND_AUDIT` 세 값을 둔다. |
| SP-08-3-4-05 | `AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하며 이전 자동 저장 row는 soft-delete 한다. partial unique race는 service retry 3회 + REQUIRES_NEW `TransactionTemplate`으로 흡수한다. |
| SP-08-3-4-06 | `MANUAL_NAMED`와 `SEND_AUDIT`는 append-only 저장내역이다. `SEND_AUDIT`는 실발송 감사 의도이므로 자동 저장 upsert 대상이 아니며 latest 자동 복원 대상도 아니다. |
| SP-08-3-4-07 | 상세 조회는 `findByIdAndCreatedBy`를 사용해 사용자별 저장내역 접근을 격리한다. 다른 사용자의 UUID 직접 접근은 존재 은닉을 위해 404 `DISPATCH_SMS_HISTORY_NOT_FOUND`로 응답한다. |
| SP-08-3-4-08 | payload는 UTF-8 JSON 직렬화 기준 100KB 초과 시 `DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE` 422로 거절한다. |
| SP-08-3-4-09 | desktop 배차문자 화면은 `실행 / 저장내역` 2탭을 제공한다. latest active row는 `AUTO_LATEST`만 자동 복원하고, row click은 미리보기 또는 발송 감사 payload를 실행 탭에 복원한다. |
| SP-08-3-4-10 | 화면 row testid는 `dispatch-sms-history-row-{i}` 기반이며 내부 UUID를 포함하지 않는다. createdBy는 공통 `maskCreatedBy`로 `사용자` 마스킹한다. |
| SP-08-3-4-11 | Notion runtime call은 재도입하지 않는다. 신규 backend/frontend 저장내역 산출물은 `api.notion.com`, `Notion-Version`, `@notionhq` 0건이어야 한다. |

### SP-08-4-2. 거래처 주문 direct PUT 수정 endpoint (2026-05-17)

**배경**: SP-08-4 주문 CRUD parity 중 U1 주문 수정은 legacy GAS 운영자가 주문 row를 즉시 수정하던 사용감을 보존해야 한다. 동시에 기존 `PartnerOrderEditRequestController`의 거래처 수정 요청 → 본사 승인 흐름은 신규 권한 분리 정책으로 유지한다.

| 결정 ID | 결정 |
|---|---|
| SP-08-4-2-01 | 본사 direct 수정 endpoint는 `PUT /api/v1/partner-orders/{id}`로 둔다. path `{id}`는 주문번호(`YYYY/MM/DD-N` 또는 안전 path `YYYY-MM-DD-N`)와 내부 UUID를 모두 허용하되 화면에는 주문번호만 표시한다. |
| SP-08-4-2-02 | direct PUT 권한은 `SALES / MANAGER / MASTER`로 제한한다. `PARTNER` role은 direct PUT 접근 시 403이며, 기존 EditRequest 요청 flow를 사용한다. |
| SP-08-4-2-03 | 낙관적 잠금은 상세 조회 응답의 `updatedAt`(BaseEntity `modifiedAt`)과 요청 본문 `updatedAt`을 비교한다. 불일치 시 `PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT` 409를 반환한다. |
| SP-08-4-2-04 | 라인 수정은 전체 교체 방식(`replaceLines`)으로 구현하되 server-side에서 수량/납품가를 검증한다. 잘못된 라인은 `PARTNER_ORDER_UPDATE_INVALID_LINE` 422로 거절한다. |
| SP-08-4-2-05 | direct PUT 성공 시 `partner_order_audit_logs`에 같은 revision의 audit row를 기록하고 기존 SSE `partner-order:edit` payload를 재사용한다. |
| SP-08-4-2-06 | `PartnerOrder`에는 direct PUT 전용 `due_date`, `memo` nullable 컬럼을 추가한다. 기존 row backfill은 하지 않는다. |
| SP-08-4-2-07 | `partnerName`처럼 현재 entity 컬럼이 없는 필드는 기존 SP-08-4-1 정책대로 null 유지 + `@JsonInclude(NON_NULL)` 직렬화 제외를 유지한다. |
| SP-08-4-2-08 | desktop 수정 form은 design-system `Input / Select / Modal / Button`으로 구성하며, 운영자 화면 라벨은 한국어만 사용한다. |

### SP-08-4-3. 거래처 주문 soft delete + 견적 주문 변환 endpoint (2026-05-17)

**배경**: SP-08-4 주문 CRUD parity 중 D1 삭제와 C1 견적→주문 변환을 `partner-order-service` REST API로 잠근다. legacy GAS row 삭제는 물리 삭제가 아니라 BaseEntity soft-delete 정책으로 이관한다.

| 결정 ID | 결정 |
|---|---|
| SP-08-4-3-01 | 주문 삭제 endpoint는 `DELETE /api/v1/partner-orders/{id}`로 둔다. path `{id}`는 주문번호(`YYYY/MM/DD-N` 또는 안전 path `YYYY-MM-DD-N`)와 내부 UUID를 모두 허용하되 화면에는 주문번호만 표시한다. |
| SP-08-4-3-02 | 삭제 권한은 `SALES / MANAGER / MASTER`로 제한한다. `PARTNER` role direct DELETE 접근은 403이다. |
| SP-08-4-3-03 | 삭제 가능 상태는 `DRAFT / CONFIRMING`으로 제한한다. `CONFIRMED` 또는 전표 발행 주문은 `PARTNER_ORDER_DELETE_FORBIDDEN_STATUS` 422로 거절한다. |
| SP-08-4-3-04 | 삭제는 `PartnerOrder.markDeleted("system-partner-order-delete")`와 라인 전체 `markDeleted`만 사용한다. 컬렉션 remove / hard delete / orphan removal은 사용하지 않는다. |
| SP-08-4-3-05 | 삭제 성공 시 `partner_order_audit_logs`에 `DELETE` action을 1 revision으로 기록한다. |
| SP-08-4-3-06 | 견적→주문 변환 endpoint는 `POST /api/v1/partner-orders/from-estimate/{estimateId}`로 둔다. 권한은 `SALES / MANAGER / MASTER`다. |
| SP-08-4-3-07 | `partner_orders.source_estimate_id` nullable 컬럼과 active unique index로 이미 변환된 estimate 재시도를 `PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED` 409로 차단한다. |
| SP-08-4-3-08 | 현재 partner-order-service에서 호출 가능한 estimate-service client가 없어 `EstimateClient` port + 기본 empty fixture로 계약을 먼저 둔다. IT는 `@MockBean` snapshot으로 실제 변환 계약을 검증하고, 실제 HTTP client는 후속 estimate-service 분리 시 교체한다. |
| SP-08-4-3-09 | desktop 본 PR 범위는 주문 상세 삭제 버튼/확인 Modal만 포함한다. 견적 변환 UI는 외부 `estimate-app` 흐름과 분리되어 후속 슬라이스에서 다룬다. |

### SP-08-5-2. 매입 수정 direct PUT endpoint (2026-05-18)

**배경**: SP-08-5 매입 CRUD parity 중 U1 매입 수정은 legacy GAS 운영자가 구매/매입 전표 row를 즉시 수정하던 사용감을 보존해야 한다. 매입은 별도 `PurchaseSlip` 없이 `slip-service`의 `Slip(type=INBOUND)`로 유지한다.

| 결정 ID | 결정 |
|---|---|
| SP-08-5-2-01 | 매입 direct 수정 endpoint는 `PUT /api/v1/slips/{id}`로 둔다. gateway strip 이후 service controller path는 `/slips/{id}`이며 path `{id}`는 내부 UUID를 받지만 화면에는 구매번호만 표시한다. |
| SP-08-5-2-02 | direct PUT 권한은 `WAREHOUSE / MANAGER / MASTER`로 제한한다. `INVENTORY / SALES / ACCOUNTANT`는 403이며, desktop에서는 수정 버튼을 렌더링하지 않는다. |
| SP-08-5-2-03 | 수정 대상은 `SlipType.INBOUND`만 허용한다. OUTBOUND 전표 direct 수정은 403으로 차단하고 별도 판매/출고 수정 흐름과 혼용하지 않는다. |
| SP-08-5-2-04 | 낙관적 잠금은 request `updatedAt`과 현재 `modifiedAt`을 비교한다. legacy row처럼 `modifiedAt`이 없으면 `createdAt`으로 fallback한다. 불일치 시 `SLIP_OPTIMISTIC_LOCK_CONFLICT` 409를 반환한다. |
| SP-08-5-2-05 | JPA optimistic lock 컬럼은 V1부터 존재하는 `slips.version`을 재사용한다. 신규 `lock_version` 컬럼은 만들지 않는다. |
| SP-08-5-2-06 | 라인 수정은 전체 교체 방식(`replaceLines`)으로 구현하되 기존 라인은 hard delete 하지 않고 `markDeleted` 처리한다. 잘못된 라인은 `SLIP_UPDATE_INVALID_LINE` 422로 거절한다. |
| SP-08-5-2-07 | direct PUT 성공 시 `slip_audit_logs`에 `SLIP_EDIT` action을 같은 revision 1건으로 기록한다. 화면과 QA PNG에는 내부 UUID/actorId 대신 구매번호/변경자명만 표시한다. |
| SP-08-5-2-08 | 기존 `SlipEditRequestController` 요청·승인 flow는 유지한다. direct PUT은 본사 운영자 즉시 수정 전용 별도 controller/service로 둔다. |
---

### D-MIG-1-00. 이카운트 → SamhanLogis 거래처 PoC (MIG-1, 2026-05-19)

**배경**: 사용자 (개발책임자) 가 이카운트 ERP `Self-Customizing > 정보관리 > 데이터관리 > 백업 및 삭제 > 기초코드 탭` 의 거래처 export CSV (7,748 lines) 첨부. 본 PoC 가 3-Tier (Excel → staging → 도메인) 패턴 + 멱등 적재 검증 → MIG-2~6 (마스터 5종 + 트랜잭션 4종) 의 선행 검증.

| # | 결정 |
|---|---|
| D-MIG-1-01 | **3-Tier 적재** = Excel/CSV → `staging.ecount_partner_raw` (17 raw text 컬럼) → transform → `samhan_partner.partners` |
| D-MIG-1-02 | **멱등 키** = staging `(source_file_hash, source_row_no)` 복합 PK + 도메인 `partner_code` UNIQUE (활성 행). source_file_hash = SHA-256(전체 파일 내용) |
| D-MIG-1-03 | **거래처코드 = partnerCode + bizNo 동시 적재** (이카운트는 둘을 분리하지 않음). 빈/`-`/`0000...` 등 가짜값은 SKIPPED_PLACEHOLDER 마킹 + staging 만 적재 |
| D-MIG-1-04 | **거래처명 NULL 거부** = REJECT_NAME_NULL 분류, staging 적재 유지 (사용자 보정 후 재 import) |
| D-MIG-1-05 | **사용구분 매핑** = `YES → ACTIVE`, `빈/NO → SUSPENDED`. 실 데이터에서는 거의 모두 YES (6,976/6,977) |
| D-MIG-1-06 | **trailing tab/CR/공백 일괄 strip** = OpenCSV 파싱 후 모든 셀에 `String.strip()` (이카운트 export 일관 트랩) |
| D-MIG-1-07 | **신규 컬럼 3개** (V9 migration) = `transfer_info VARCHAR(20)` + `note TEXT` + `manager_name VARCHAR(50)`. NULLable, 기본값 NULL |
| D-MIG-1-08 | **등록일자 파싱** = `YYYYMMDD` 정상 / `임시` or 빈값 → NULL. `최초작성일자` 는 staging 만 |
| D-MIG-1-09 | **여신한도 파싱** = 빈값/`-` → `BigDecimal.ZERO`. `,` 천단위 구분자 제거 |
| D-MIG-1-10 | **PII 마스킹 불필요** = 실 CSV 에 주민번호 컬럼 부재 확인 (spec 27 필드 정정) |
| D-MIG-1-11 | **importer 호출 방식** = Spring `@Service` + Admin REST `POST /admin/partners/imports/ecount` (multipart upload). 동기 실행 (7천 건 ~50초). 응답 = `{total, imported, updated, rejectedNullName, skippedPlaceholder, ACTIVE/SUSPENDED, sourceFileHash, sample}` |
| D-MIG-1-12 | **권한** = `ROLE_MASTER` + `ROLE_MANAGER` only (대량 운영 데이터 + 신용한도 노출 → DISPATCH 차단) |
| D-MIG-1-13 | **첨부파일 out-of-scope** = README §2-B Phase 1 일관 — 사업자등록증/명함 import 안 함. Phase 2 운영 cutover 시 상위 30~50건 사용자 수동 업로드 |
| D-MIG-1-14 | **DB 형태 이카운트 정렬 (V10, 사용자 요청 2026-05-19)** = 이카운트 export 에 없는 8 컬럼 (currency/shipment_target/sales_type/purchase_type/receivable_no_mgmt/payable_no_mgmt/outbound_adjustment_rate/inbound_adjustment_rate) NOT NULL + DEFAULT 제거. Partner.java 의 Java-level default 도 제거. 잉여 컬럼 완전 DROP 은 후속 PR (회귀 위험 큼) |
| D-MIG-1-15 | **VARCHAR length 확장 (V11)** = 실 CSV 측정 후 길이 부족 발견. partner_code/biz_no VARCHAR(50/20→100), phone/mobile/fax VARCHAR(30→50). 거래처코드 실측 max=86, 전화번호 max=43 |

**산출**:
- BE 1 cycle: V9 (3컬럼 + staging) + V10 (NOT NULL/default 제거) + V11 (VARCHAR 확장) + Partner.java 변경 + `EcountPartnerImporter` (OpenCSV + BOMInputStream + NamedParameterJdbcTemplate) + `EcountPartnerImportController` + `EcountPartnerImportResult` DTO + 단위 12 PASS
- QA: 7 시나리오 + 검증 SQL 7건 + 실 적재 cross-check
- 실 적재: **6,977 행 → 6,719 imported + 245 updated + 1 reject + 12 skipped** (49.5s, 141 row/sec)
- 멱등 검증: 재실행 시 imported=0 / updated=6,964 / sourceFileHash 동일 PASS

**테스트**: partner-service 단위 12건 PASS / 실 CSV 적재 cross-check PASS / 멱등 PASS.

**후속 (별도 PR)**:
- **MIG-1A-fix-placeholder** — placeholder 정규식을 narrow (0 만 + `-` 만). 현 정규식은 `01`/`1123`/`7002` 등 정상 4자리 ID 까지 SKIP. 사용자 검토 후 정정 PR
- **MIG-1B** — 이카운트 추가 export 확보 시 누락 10 잉여 필드 (FAX/email/주소2/단가그룹 등) 보강
- **partner-cleanup** — V10 NULLable 컬럼 중 사용도 0 인 것 완전 DROP (PartnerSeeder / Partner4TabService 영향 분석)
- **MIG-2** — 품목/계정/부서/창고/카드 마스터 5종 (동일 패턴)
- **MIG-3~6** — 트랜잭션 전표 (회계/매출매입/입출금/재고)

**비용**: AWS 변경 0 (partner-service 기존 그대로).

---

### D-MIG-3-00. 이카운트 회계 전표 4종 마이그레이션 (MIG-3, 2026-05-20)

**배경**: MIG-2 마스터 5종과 자동 lookup map 4종이 완료되어 회계 트랜잭션 raw 4종(매입전표 I / 매출전표 I / 일반전표 / 회계전표분개)을 accounting-service 도메인으로 transform 할 수 있게 됐다.

| # | 결정 |
|---|---|
| D-MIG-3-01 | 4 raw는 한 PR 통합으로 처리한다. |
| D-MIG-3-02 | staging 멱등 키는 MIG-1/MIG-2 와 동일한 `source_file_hash(SHA-256, VARCHAR(64))` + `source_row_no(1-base)` 복합 PK로 둔다. |
| D-MIG-3-03 | 4 importer 모두 `REQUIRES_NEW + READ_COMMITTED`와 `pg_advisory_xact_lock` namespace 분리를 사용한다. |
| D-MIG-3-04 | `EcountCsvSupport`의 BOM strip, `데이터관리>` meta row, strict header, advisory lock, max length guard를 재사용한다. |
| D-MIG-3-05 | 거래처명 lookup은 partner-service `/internal/partners/by-name?name=`를 사용한다. miss/ambiguous/fail은 silent fallback 없이 `MIG3_LOOKUP_MISS` reject로 보고한다. |
| D-MIG-3-06 | 회계전표분개 계정명 lookup은 MIG-2 산출 `staging.ecount_account_map.account_name → account_uuid` 역방향 검색으로 한다. |
| D-MIG-3-07 | 회계전표분개 journalNo 그룹의 차/대 합계가 일치하면 POSTED, 불일치하면 DRAFT 유지 + `MIG3_JOURNAL_BALANCE_MISMATCH` warning으로 보고한다. |
| D-MIG-3-08 | domain upsert 전 soft-deleted row는 `WITH restored AS (...)` CTE로 복구한다. |
| D-MIG-3-09 | 응답 DTO는 UUID를 노출하지 않고 slipNo/journalNo/partnerName/accountCode 등 비즈니스 식별자와 sample raw value만 반환한다. |
| D-MIG-3-10 | 실 raw CSV 의 마지막 빈 컬럼 1개는 이카운트 export 호환 범위로 허용하되, 그 외 헤더 컬럼 추가/불일치는 strict reject 한다. |

### D-MIG-4-00. 이카운트 영업·세무 raw 4종 마이그레이션 (MIG-4, 2026-05-20)

**배경**: MIG-3 회계 전표 4종 머지 후, 이카운트 영업·세무 raw 4종을 accounting-service 로 통합 이관한다. 세금계산서/판매전표는 기존 TaxInvoice/SalesAccountingSlip 도메인을 보강하고, 매출매입내역/주문서는 staging + 검증 SQL로 운영 대조 근거를 남긴다.

| 결정 | 내용 |
|---|---|
| D-MIG-4-01 | 4 raw는 한 PR 통합으로 처리한다. |
| D-MIG-4-02 | 세금계산서용 판매전표는 `TaxInvoice` OUTBOUND + `TaxInvoiceLine` 으로 이관한다. |
| D-MIG-4-03 | 판매전표는 `SalesAccountingSlipLine` 보강으로 처리하고, 전표가 없으면 신규 `SalesAccountingSlip`을 생성한다. |
| D-MIG-4-04 | `TaxInvoiceStatus.MIGRATED`를 추가한다. DB status 컬럼은 `VARCHAR(20)` 이므로 Postgres enum 분리 V25는 불필요하다. |
| D-MIG-4-05 | 매출매입내역은 staging only + 검증 SQL로 처리한다. |
| D-MIG-4-06 | 주문서는 staging only + 검증 SQL로 처리하고 Order 도메인 변환은 후속으로 둔다. |
| D-MIG-4-07 | 매출장/매입장 xlsx는 본 슬라이스 변환 대상에서 제외하고 DailyClosing 대조는 후속으로 둔다. |
| D-MIG-4-08 | lookup miss는 silent fallback 없이 `MIG4_LOOKUP_MISS` reject로 보고한다. |
| D-MIG-4-09 | staging 멱등 키는 SHA-256 `source_file_hash` + 1-base `source_row_no` 복합 PK로 둔다. |
| D-MIG-4-10 | 4 importer는 서로 다른 `pg_advisory_xact_lock` namespace를 사용한다. |
| D-MIG-4-11 | admin UI는 후속 슬라이스로 둔다. |
| D-MIG-4-12 | auth-service V17에 MIG4 PageCode 4종 권한 seed를 추가한다. |
| D-MIG-4-13 | shared/common에 MIG4 ErrorCode 9종을 추가한다. |
| D-MIG-4-14 | PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다. |
| D-MIG-4-15 | 주문서 5분할 파일은 동일 importer를 file hash 별로 5회 실행하는 방식으로 처리한다. |

**산출 예정/진행**: accounting V23 staging 4종, auth V16 PageCode seed, ErrorCode MIG3 5종, 4 importer/controller, fixture cross-check 4종, dev-report `docs/dev-reports/ecount-mig-3-voucher.md`.

### D-MIG-5-00. 이카운트 창고이동·지출결의서·입금보고서 raw 3종 마이그레이션 (MIG-5, 2026-05-20)

**배경**: MIG-4 영업·세무 raw 4종 머지 후, 재고 이동과 입출금성 raw 2종을 한 PR에서 처리한다. 창고이동은 기존 inventory `StockTransfer` 도메인으로 변환하고, 지출결의서/입금보고서는 cash 도메인 신설 전 staging + Partner aging 검증 근거를 남긴다.

| 결정 | 내용 |
|---|---|
| D-MIG-5-01 | 3 raw는 한 PR 통합으로 처리한다. |
| D-MIG-5-02 | 창고이동은 `StockTransfer` + `StockTransferLine` 으로 변환하고 마이그레이션 완료 상태는 `CONFIRMED`로 둔다. |
| D-MIG-5-03 | 지출결의서/입금보고서는 staging only + Partner aging cross-check로 처리한다. |
| D-MIG-5-04 | 거래처/품목/창고 lookup miss는 silent fallback 없이 `MIG5_LOOKUP_MISS` reject로 보고한다. |
| D-MIG-5-05 | staging 멱등 키는 SHA-256 `source_file_hash` + 1-base `source_row_no` 복합 PK로 둔다. |
| D-MIG-5-06 | 3 importer는 서로 다른 `pg_advisory_xact_lock` namespace를 사용한다. |
| D-MIG-5-07 | StockTransfer/Line soft-delete row는 CTE로 복구한다. |
| D-MIG-5-08 | admin UI는 후속 슬라이스로 둔다. |
| D-MIG-5-09 | auth-service V18에 MIG5 PageCode 3종 권한 seed를 추가한다. |
| D-MIG-5-10 | shared/common에 MIG5 ErrorCode 8종을 추가한다. |
| D-MIG-5-11 | PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다. |
| D-MIG-5-12 | footer는 빈 footer만 skip하고, 빈 일자 + nonblank row는 `MIG5_DATE_INVALID`로 reject 한다. |
| D-MIG-5-13 | importer behavior 테스트를 처음부터 작성해 MIG-4 회고를 반영한다. |
| D-MIG-5-14 | controller IT는 endpoint별 multipart/권한/header mismatch 케이스를 parameterized로 유지한다. |

**산출 예정/진행**: inventory V13, accounting V25, auth V18, 3 importer/controller, fixture cross-check 3종, dev-report `docs/dev-reports/ecount-mig-5-stock-expense-deposit.md`.

### D-MIG-6-00. 이카운트 잔여 마스터 5종 마이그레이션 (MIG-6, 2026-05-20)

**배경**: MIG-5 머지 후 잔여 마스터 raw 5종(통장계좌/사원/인사카드/급여관리사원/고정자산유형)을 한 PR에서 정리한다. 신규 meta row `회사명 :`와 인사카드 주민등록번호 PII를 critical guard로 둔다.

| 결정 | 내용 |
|---|---|
| D-MIG-6-01 | 5 raw는 한 PR 통합으로 처리한다. |
| D-MIG-6-02 | 통장계좌는 `BankAccount` 신규 도메인으로 둔다. MIG-2 `CardMaster`와 분리한다. |
| D-MIG-6-03 | 사원은 기존 `Employee`에 `ecount_code`를 보강하고, 인사카드/급여관리사원은 신규 도메인으로 둔다. |
| D-MIG-6-04 | 주민등록번호 평문 저장 금지. staging/domain 모두 `resident_number_masked`만 저장한다. |
| D-MIG-6-05 | `EcountCsvSupport.hasMetaRow`는 `데이터관리>`와 `회사명 :`를 모두 meta row로 인식한다. |
| D-MIG-6-06 | lookup miss/ambiguous는 silent fallback 없이 `MIG6_LOOKUP_MISS`/`MIG6_LOOKUP_AMBIGUOUS`로 reject 한다. |
| D-MIG-6-07 | staging 멱등 키는 SHA-256 `source_file_hash` + 1-base `source_row_no` 복합 PK로 둔다. |
| D-MIG-6-08 | 5 importer는 서로 다른 `pg_advisory_xact_lock` namespace를 사용한다. |
| D-MIG-6-09 | 5 도메인 upsert는 soft-delete CTE 복구 패턴을 적용한다. |
| D-MIG-6-10 | admin UI는 후속 슬라이스로 둔다. |
| D-MIG-6-11 | auth-service V19에 MIG6 PageCode 5종 권한 seed를 추가한다. |
| D-MIG-6-12 | shared/common에 MIG6 ErrorCode 8종을 추가한다. |
| D-MIG-6-13 | PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다. |
| D-MIG-6-14 | importer behavior 테스트를 처음부터 작성해 MIG-4/5 회고를 반영한다. |
| D-MIG-6-15 | controller IT는 5 endpoint × 5 case parameterized로 유지한다. |
| D-MIG-6-16 | `MIG6_CSV_HEADER_MISMATCH`는 HTTP 422로 통일한다. |

**산출 예정/진행**: accounting V26, user V8, auth V19, 5 importer/controller, fixture cross-check 5종, dev-report `docs/dev-reports/ecount-mig-6-master-employee-asset.md`.

### D-MIG-7-00. Cash 도메인 신규 + MIG-5 staging 변환 (MIG-7, 2026-05-20)

**배경**: MIG-5에서 staging only로 남긴 지출결의서/입금보고서를 CashDisbursement/CashReceipt 도메인으로 승격한다. Order 도메인은 후속 MIG-8+로 이연한다.

| 결정 | 내용 |
|---|---|
| D-MIG-7-01 | CashDisbursement + CashReceipt 도메인을 accounting-service에 신규 추가한다. |
| D-MIG-7-02 | MIG-5 staging 2표(`ecount_expense_voucher_raw`, `ecount_deposit_report_raw`)를 재사용하고 CSV 직접 import는 하지 않는다. |
| D-MIG-7-03 | transform 상태는 `PENDING` → `TRANSFORMED` / `REJECTED`로 추적한다. |
| D-MIG-7-04 | **옵션 C**: aging snapshot 갱신 + Journal 자동 생성 모두 MIG-8 후속 슬라이스로 이연한다. 본 슬라이스는 CashDisbursement/CashReceipt 도메인 변환만 수행하고 `linkJournal(UUID)` 도메인 메서드만 제공한다. |
| D-MIG-7-05 | `partner_id` 누락은 silent fallback 없이 `MIG7_LOOKUP_MISS`로 reject 한다. |
| D-MIG-7-06 | 도메인 멱등 키는 `external_ref = source_file_hash + '-' + source_row_no`로 둔다. |
| D-MIG-7-07 | CashDisbursement/CashReceipt transform은 서로 다른 `pg_advisory_xact_lock` namespace를 사용한다. |
| D-MIG-7-08 | soft-delete row는 CashDisbursement/CashReceipt 양쪽 모두 CTE로 복구한다. |
| D-MIG-7-09 | admin UI는 후속 슬라이스로 둔다. |
| D-MIG-7-10 | auth-service V20에 MIG7 PageCode 2종 권한 seed를 추가한다. |
| D-MIG-7-11 | shared/common에 MIG7 ErrorCode 6종을 추가한다. |
| D-MIG-7-12 | PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다. |
| D-MIG-7-13 | transform service behavior 테스트를 처음부터 작성해 MIG-4/5/6 회고를 반영한다. |
| D-MIG-7-14 | controller IT는 2 endpoint × 5 case parameterized로 유지한다. |
| D-MIG-7-15 | 본 슬라이스는 CSV 직접 import가 아니므로 MIG7 CSV header error는 만들지 않는다. |

**산출 예정/진행**: accounting V27, auth V20, Cash 도메인 2종, transform service/controller 2종, 단위 테스트 20 cases, controller IT 10 cases, dev-report `docs/dev-reports/ecount-mig-7-cash-domain.md`.

### D-MIG-8-00. Order 도메인 신규 + MIG-4 주문서 staging 변환 (MIG-8, 2026-05-20)

**배경**: MIG-4에서 staging only로 남긴 주문서를 Order/OrderLine 도메인으로 승격한다. 완료 주문은 기존 SalesAccountingSlip과 전표번호 기준으로 연결하되, 매칭 실패는 운영 warning으로 남기고 변환 자체는 성공 처리한다.

| 결정 | 내용 |
|---|---|
| D-MIG-8-01 | Order + OrderLine 도메인을 accounting-service에 신규 추가한다. |
| D-MIG-8-02 | MIG-4 `staging.ecount_order_raw`를 재사용하고 CSV 직접 import는 하지 않는다. |
| D-MIG-8-03 | progress_status enum은 COMPLETED / IN_PROGRESS / CANCELED / PENDING 4종으로 둔다. |
| D-MIG-8-04 | SalesAccountingSlip cross-link는 progress_status=COMPLETED일 때만 시도하고 miss는 warning 처리한다. |
| D-MIG-8-05 | 매니저명은 snapshot만 보존하고 Employee cross-link는 MIG-9+로 이연한다. |
| D-MIG-8-06 | 동일 order_no 다중 row는 1 Order + N OrderLine으로 grouping한다. |
| D-MIG-8-07 | 도메인 멱등 키는 `external_ref = source_file_hash + '-' + source_row_no`로 둔다. |
| D-MIG-8-08 | transform은 1개 `pg_advisory_xact_lock` namespace를 사용한다. |
| D-MIG-8-09 | soft-delete row는 Order + OrderLine 양쪽 모두 CTE로 복구한다. |
| D-MIG-8-10 | admin UI는 후속 슬라이스로 둔다. |
| D-MIG-8-11 | auth-service V21에 MIG8 PageCode 1종 권한 seed를 추가한다. |
| D-MIG-8-12 | shared/common에 MIG8 ErrorCode 7종을 추가한다. |
| D-MIG-8-13 | PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다. |
| D-MIG-8-14 | transform service behavior 테스트를 11+ 케이스로 작성해 MIG-4~7 회고를 반영한다. |
| D-MIG-8-15 | controller IT는 1 endpoint × 5 case parameterized로 유지한다. |
| D-MIG-8-16 | SalesAccountingSlip cross-link 성공/실패 회귀 테스트를 포함한다. |

**산출 예정/진행**: accounting V28, auth V21, Order 도메인 2종, transform service/controller 1종, 단위 테스트 13 cases, controller IT 5 cases, dev-report `docs/dev-reports/ecount-mig-8-order-domain.md`.

### D-MIG-9-00. Cash → Journal 자동 생성 + Partner aging snapshot view (MIG-9, 2026-05-20)

**배경**: MIG-7에서 이연한 D-MIG-7-04 옵션 C를 처리한다. CashDisbursement/CashReceipt를 POSTED Journal로 1:1 생성하고, 운영 조회용 `partner_aging_snapshot` MATERIALIZED VIEW를 추가한다.

| 결정 | 내용 |
|---|---|
| D-MIG-9-01 | CashDisbursement/CashReceipt 1건당 Journal 1건 + JournalLine 2건을 생성한다. |
| D-MIG-9-02 | JournalSourceType에 `CASH_DISBURSEMENT`, `CASH_RECEIPT`를 추가한다. |
| D-MIG-9-03 | `journal_no = 'J-' + cash.slip_no`로 둔다. |
| D-MIG-9-04 | 기본 ChartOfAccount lookup은 지출=`지급수수료`, 현금=`보통예금`, 매출채권=`외상매출금`으로 시작한다. |
| D-MIG-9-05 | lookup miss는 `MIG9_DEFAULT_ACCOUNT_MISSING` row-level reject로 처리한다. |
| D-MIG-9-06 | `journals(source_type, source_ref)` UNIQUE를 MIG-9 멱등 키로 둔다. |
| D-MIG-9-07 | 이미 `journal_id`가 있는 cash row는 skip한다. batch 조회 기본은 `journal_id IS NULL`이다. |
| D-MIG-9-08 | `DuplicateKeyException`은 `journals_source_type_ref_uk` constraint 명칭을 확인한 경우만 `MIG9_JOURNAL_DUPLICATE`로 흡수한다. |
| D-MIG-9-09 | `partner_aging_snapshot` MATERIALIZED VIEW는 partner_id unique index를 갖고 `REFRESH CONCURRENTLY`로 갱신한다. |
| D-MIG-9-10 | refresh는 트랜잭션 외(`Propagation.NEVER`)에서 실행한다. |
| D-MIG-9-11 | auth-service V22에 MIG9 PageCode 2종과 MASTER/MANAGER edit permission 4건을 seed한다. |
| D-MIG-9-12 | shared/common에 MIG9 ErrorCode 5종을 추가한다. |
| D-MIG-9-13 | 단위 테스트 11 cases를 처음부터 작성한다. |
| D-MIG-9-14 | cash-journals controller IT는 5 case × 2 endpoint = 10 cases로 유지한다. |

**산출 예정/진행**: accounting V29, auth V22, `Mig9CashJournalService`, `Mig9AgingSnapshotRefreshService`, controller 3 endpoint, 단위 테스트 11 cases, controller IT 10 cases, dev-report `docs/dev-reports/ecount-mig-9-cash-journal-aging.md`.

### D-MIG-10-00. Order Employee cross-link + Partner aging net view 보정 (MIG-10, 2026-05-20)

**배경**: MIG-8에서 이연한 D-MIG-8-05와 MIG-9 후 남은 C6-MIN-3을 묶어 처리한다. Order 담당자명 snapshot은 유지하되 Employee UUID를 별도 컬럼으로 backfill하고, Partner aging snapshot은 기존 increase-only 컬럼을 보존하면서 net 컬럼을 추가한다.

| 결정 | 내용 |
|---|---|
| D-MIG-10-01 | 두 이연 항목(D-MIG-8-05 + C6-MIN-3)을 한 PR 통합으로 처리한다. |
| D-MIG-10-02 | `orders.manager_name`은 snapshot으로 유지하고 `manager_employee_id`를 nullable UUID로 추가한다. |
| D-MIG-10-03 | `employees`는 user-service DB 소유이므로 lookup은 user-service internal `/internal/users/by-name?name=` endpoint로 수행한다. |
| D-MIG-10-04 | `employees`는 user-service DB 소유이므로 accounting V30 FK는 선언하지 않는다. service-per-DB 배포에서는 UUID logical reference + index로 두고 application-level `EmployeeLookupClient` 검증으로 참조 무결성을 보장한다. |
| D-MIG-10-05 | Employee name lookup 0건은 `MIG10_EMPLOYEE_LOOKUP_MISS` warning으로 보고하고 NULL을 유지한다. |
| D-MIG-10-06 | Employee name lookup 2건 이상은 `MIG10_EMPLOYEE_AMBIGUOUS` warning으로 보고하고 NULL을 유지한다. |
| D-MIG-10-07 | backfill 대상은 `manager_name IS NOT NULL AND manager_employee_id IS NULL AND is_deleted = FALSE`로 제한한다. |
| D-MIG-10-08 | backfill service는 `REQUIRES_NEW + READ_COMMITTED`와 `pg_advisory_xact_lock`을 사용한다. |
| D-MIG-10-09 | `partner_aging_snapshot`은 DROP + RECREATE로 기존 4컬럼과 신규 `net_receivable`/`net_payable`/`net_cash`를 함께 정의한다. |
| D-MIG-10-10 | `partner_aging_snapshot.partner_id` unique index를 재생성해 `REFRESH CONCURRENTLY` 계약을 유지한다. |
| D-MIG-10-11 | auth-service V23에 MIG10 PageCode 1종과 MASTER/MANAGER edit permission 2건을 seed한다. |
| D-MIG-10-12 | shared/common에 MIG10 ErrorCode 5종과 `EcountMig10Result`를 추가한다. |
| D-MIG-10-13 | 단위 테스트 8 cases와 controller IT 5 cases를 처음부터 작성한다. |

**산출 예정/진행**: accounting V30, auth V23, `Mig10OrderEmployeeBackfillService`, user-service internal Employee by-name lookup, controller 1 endpoint, 단위 테스트 8 cases, controller IT 5 cases, dev-report `docs/dev-reports/ecount-mig-10-employee-cross-link-aging-net.md`.

### D-MIG-11-00. 매출장/매입장 XLSX staging + DailyClosing 대조 (MIG-11, 2026-05-20)

**배경**: MIG-10 머지 후 잔여 검증 raw인 `매출장.xlsx`, `매입장.xlsx`를 도메인 변환 없이 보존하고, Samhan Public `DailyClosing` snapshot과 일별 합계를 대조한다.

| 결정 | 내용 |
|---|---|
| D-MIG-11-01 | 매출장/매입장 XLSX 2종은 단일 통합 PR로 처리하며 FE/admin UI는 MIG-12+로 이연한다. |
| D-MIG-11-02 | GHSA-gmg8-593g-7mv3 대응을 위해 Apache POI 5.4.0 기반 `EcountXlsxSupport`를 추가한다. |
| D-MIG-11-03 | 실제 raw sheet 0 row 0은 header가 아니라 `회사명 ... / 매출장|매입장` meta row이므로 row 1을 strict header로 사용한다. |
| D-MIG-11-04 | 매출장 header는 `월/일/유형명/전자구분/거래처코드/거래처명/적요/매출공급가액/매출부가세/매출합계`로 고정한다. |
| D-MIG-11-05 | 매입장 header는 `월/일/거래처코드/유형명/전자구분/거래처명/적요/매입공급가액/매입부가세`로 고정하고 `total_amount = 공급가액 + 부가세`로 계산한다. |
| D-MIG-11-06 | staging 멱등 키는 `source_file_hash` SHA-256 + 실제 Excel 1-base `source_row_no` 복합 PK로 둔다. |
| D-MIG-11-07 | accounting V31은 BaseEntity 7 audit 컬럼과 soft-delete flag를 포함한 staging 2표를 추가한다. |
| D-MIG-11-08 | DailyClosing 대조는 실제 도메인 스키마인 `closing_date`, `closing_kind`, `total_amount` 기준으로 수행한다. |
| D-MIG-11-09 | DailyClosing 불일치는 `MIG11_DAILY_CLOSING_MISMATCH` warning sample만 반환하고 import reject로 처리하지 않는다. |
| D-MIG-11-10 | footer skip은 첫 nonblank cell이 정확히 `합계` 또는 `총계`인 경우에만 적용한다. |
| D-MIG-11-11 | auth-service V24에 `ecount.mig11.sales-ledger`, `ecount.mig11.purchase-ledger` PageCode와 MASTER/MANAGER edit seed를 추가한다. |
| D-MIG-11-12 | shared/common에 MIG11 ErrorCode 5종과 `EcountMig11Result`를 추가한다. |
| D-MIG-11-13 | 단위 테스트는 importer별 9 cases, controller IT는 5 case × 2 endpoint로 작성한다. |
| D-MIG-11-14 | commit 가능한 fixture XLSX 2종은 PII placeholder `거래처A~E`만 포함하고 raw header cross-check test로 고정한다. |

**산출 예정/진행**: shared/common `EcountXlsxSupport`, accounting V31, auth V24, `EcountSalesLedgerImporter`, `EcountPurchaseLedgerImporter`, controller 2 endpoint, fixture XLSX 2종, dev-report `docs/dev-reports/ecount-mig-11-sales-purchase-ledger-xlsx.md`.

### D-MIG-12-00. V32 partial UNIQUE + Lookup auth 격상 follow-up (MIG-12, 2026-05-21)

**배경**: MIG-1~11 사후 재점검에서 `tax_invoice_lines` full UNIQUE가 soft-delete 컨벤션을 위반하는 MAJOR 결함과, Product/Partner lookup 401/403 silent miss P1 결함을 확인했다.

| 결정 | 내용 |
|---|---|
| D-MIG-12-01 | follow-up은 V32 partial UNIQUE와 Lookup auth 격상을 단일 통합 PR로 처리한다. |
| D-MIG-12-02 | V32는 기존 `ux_tax_invoice_lines_invoice_line`을 DROP하고 `ux_tax_invoice_lines_invoice_line_active WHERE is_deleted = FALSE`를 생성한다. |
| D-MIG-12-03 | 내부 서비스 token mis-config 및 401/403은 운영 설정 오류로 보고 `SERVICE_UNAVAILABLE(503)`로 격상한다. |
| D-MIG-12-04 | shared/common ErrorCode는 `MIG12_INTERNAL_AUTH_MISS` 1종만 추가한다. |
| D-MIG-12-05 | 신규 PageCode/API는 추가하지 않고 기존 lookup endpoint 계약을 유지한다. |
| D-MIG-12-06 | 옵션 A 12단계 첫 적용 슬라이스로 진행한다. |
| D-MIG-12-07 | 회귀 가드는 `TaxInvoiceLineSoftDeleteIT` 3 cases와 LookupClient 단위 테스트(token null/blank, 401, 403, 404)로 둔다. |

**산출 예정/진행**: accounting V32, `TaxInvoiceLineSoftDeleteIT`, Product/Partner LookupClient auth fail-fast, ErrorCode `MIG12_INTERNAL_AUTH_MISS`, dev-report `docs/dev-reports/mig-12-followup-tax-invoice-line-unique-lookup-auth.md`.

### D-MIG-13-00. Minor 백로그 청소 (MIG-13, 2026-05-21)

**배경**: MIG-1~12 사후 재점검에서 남은 Minor 항목을 admin UI(MIG-14) 진입 전에 정리한다. 신규 마이그레이션/권한/API는 만들지 않고 stale 문서, footer 판별, dead branch, 회고 주석만 다룬다.

| 결정 | 내용 |
|---|---|
| D-MIG-13-01 | PartnerLookupClient 문서는 V32(MIG-12) 이후 401/403 fail-fast 계약을 명시하고, 404/5xx/network fail-soft만 남긴다. |
| D-MIG-13-02 | MIG-9 dev-report의 cash journal prefix는 1e fix 결과에 맞춰 CashDisbursement `JD-`, CashReceipt `JR-`로 정정한다. |
| D-MIG-13-03 | EcountSalesPurchaseSummaryImporter footer 판별은 full-width 숫자와 NBSP 공백을 월계/누계/timestamp 모두에서 허용하고, 실 raw extra column footer를 위해 row 전체 셀에서 표식을 찾는다. |
| D-MIG-13-04 | EcountStockTransferImporter는 `MIG5_LOOKUP_MISS`를 throw하지 않으므로 sampleRawValue dead branch를 제거하고 enum 공유 배경만 주석으로 남긴다. |
| D-MIG-13-05 | AbstractPostgresIT HikariCP pool=5 값은 변경하지 않고, PostgreSQL 단일 Testcontainers reuse 및 test parallelism 회귀 위험을 주석으로 남긴다. |

**산출 예정/진행**: accounting/inventory service minor cleanup, `EcountSalesPurchaseSummaryImporterTest` full-width footer 회귀 가드, dev-report `docs/dev-reports/mig-13-minor-cleanup.md`.

### D-MIG-14-00. Admin UI 4 화면 통합 + DynamicPermissionClient 청소 (MIG-14, 2026-05-21)

**배경**: MIG-7 Cash, MIG-8 Order, MIG-9 partner_aging_snapshot, MIG-11 Ledger staging이 모두 머지되어 운영자 조회 화면을 만들 수 있는 상태가 됐다. MIG-12 follow-up의 minor 백로그였던 deprecated `DynamicPermissionClient @MockBean` 청소도 같은 큰 PR에서 처리한다.

| 결정 | 내용 |
|---|---|
| D-MIG-14-01 | Cash / Order / AgingSnapshot / Ledger admin UI 4 화면군은 단일 통합 PR로 처리한다. |
| D-MIG-14-02 | admin UI route는 `clients/desktop/src/renderer/routes/accounting/admin/` 아래에 둔다. |
| D-MIG-14-03 | 화면 권한은 SP-D5 이후 기존 desktop `PermissionGuard` 컴포넌트와 PageCode 기반 정책을 사용한다. |
| D-MIG-14-04 | API 응답 DTO와 renderer text/test id/screenshot에는 내부 UUID를 노출하지 않고, `slipNo`, `journalNo`, `orderNo`, `partnerName`, `managerName` 같은 업무 식별자만 표시한다. |
| D-MIG-14-05 | 30+ IT의 deprecated service-local `DynamicPermissionClient @MockBean`은 shared/security 통합 인터페이스 mock으로 일괄 교체한다. deprecated adapter 완전 삭제는 별도 운영 검증 후속으로 둔다. |
| D-MIG-14-06 | auth-service V25에 MIG14 PageCode 4종(`ECOUNT_MIG14_CASH_LIST`, `ECOUNT_MIG14_ORDER_LIST`, `ECOUNT_MIG14_AGING_SNAPSHOT`, `ECOUNT_MIG14_LEDGER`)과 MASTER/MANAGER 권한 seed를 추가한다. |
| D-MIG-14-07 | MIG14 전용 ErrorCode는 추가하지 않고 기존 조회/권한/검증 ErrorCode를 재사용한다. |
| D-MIG-14-08 | Playwright spec은 4개 화면군별 정상/권한거부/빈 결과/페이지네이션/캡처를 포함하고, fixture는 placeholder만 사용하며 자격 평문을 포함하지 않는다. |
| D-MIG-14-09 | 옵션 A 12단계 + 5-team 병렬 방식으로 PM 자율 연속 진행한다. DevOps/TM 문서는 dev-report, ROADMAP, DECISIONS, README, handoff, overview HTML을 동기화한다. |

**산출 예정/진행**: accounting-service 조회 endpoint 8개, auth V25 PageCode 4종, desktop admin route 7개, Playwright spec 4개 + QA PNG 4장 이상, DynamicPermissionClient IT mock cleanup, dev-report `docs/dev-reports/mig-14-admin-ui-4-screens.md`.

### D-MIG-15-00. POI shared/common → shared/ecount-io module 분리 (MIG-15, 2026-05-21)

**배경**: MIG-11에서 `shared/common`에 Apache POI를 추가하면서 POI가 14 service 공통 classpath로 전이됐다. POI 사용 범위를 Excel IO module로 분리해 SBOM/CVE 관리 범위를 축소한다.

| 결정 | 내용 |
|---|---|
| D-MIG-15-01 | `shared:ecount-io` 신규 module을 추가하고 POI 기반 이카운트/Excel IO 구현을 모은다. |
| D-MIG-15-02 | `EcountXlsxSupport`는 `com.samhanair.logis.common.ecount.io` package로 이동한다. |
| D-MIG-15-03 | `ExcelExporter` 구현과 테스트도 `shared:ecount-io`로 이동한다. `ExcelColumn`/`ExcelExportRequest`는 POI 비의존 DTO이므로 `shared:common`에 유지한다. |
| D-MIG-15-04 | `shared/common`의 `poi-ooxml` main/test dependency를 제거한다. |
| D-MIG-15-05 | `accounting-service`는 direct POI dependency를 제거하고 `shared:ecount-io`를 통해 MIG-11/Hometax/TaxInvoice XLSX 코드를 컴파일한다. |
| D-MIG-15-06 | `partner-service`는 POI 직접 import가 없으므로 direct POI dependency를 제거하고 Excel export는 `shared:ecount-io` 경유로 유지한다. |
| D-MIG-15-07 | `arologis-service`, `slip-service`, `inventory-service`는 각각 `VendorExcelParser`, `SlipExcelExportIT`, `DpsExcelParser/DpsCompareService` 자체 POI 사용이 있어 direct POI dependency를 유지한다. |
| D-MIG-15-08 | 옵션 C 21단계 첫 적용 슬라이스로 진행한다. |

**산출 예정/진행**: settings/root Gradle 갱신, `shared:ecount-io`, `EcountXlsxSupport` 이동, `ExcelExporter` 이동, direct POI dependency 정리, dev-report `docs/dev-reports/mig-15-poi-shared-io-module.md`.

### D-MIG-16-00. BE Minor 청소 — partnerNames batch + AGING pagination + 권한/토스트 보정 (MIG-16, 2026-05-21)

**배경**: MIG-14 사후 review에서 남은 Minor 항목 중 BE N+1 lookup, aging snapshot hard cap, refresh 피드백 부재, 권한 캐시 로딩 flash를 한 슬라이스에서 정리한다.

| 결정 | 내용 |
|---|---|
| D-MIG-16-01 | partner-service에 `POST /internal/partners/lookup-by-ids` batch endpoint를 추가하고, 요청은 `{ids:[uuid...]}`, 응답은 `partners[].id/name` 최소 DTO로 둔다. |
| D-MIG-16-02 | accounting-service `PartnerLookupClient`에 `findByPartnerIdsBatch(List<UUID>) -> Map<UUID, String>`을 추가하고 admin cash 조회의 partnerName N+1 호출을 batch 1회로 전환한다. |
| D-MIG-16-03 | `/api/v1/accounting/aging-snapshot`은 `Pageable` 기반 `Page<PartnerAgingSnapshotResponse>`를 반환하며 기본 size=100, 최대 size=500으로 제한한다. |
| D-MIG-16-04 | desktop `PartnerAgingSnapshotPage` refresh는 성공 시 `새로고침 완료 — refreshedAt`, 실패 시 `새로고침 실패 — 운영자 문의` toast를 표시하고 실패 상세는 console에 남긴다. |
| D-MIG-16-05 | `usePermissions().canAccess()`는 권한 캐시 미로드 시 false를 반환해 AppLayout admin 메뉴 flash를 방지한다. |
| D-MIG-16-06 | 옵션 C 21단계 일괄 개발 슬라이스로 진행하고, dev-report/handoff/overview를 같은 PR에서 동기화한다. |

**산출 예정/진행**: partner-service internal batch endpoint, accounting-service batch client/admin query pagination, desktop toast/permission loading 보정, dev-report `docs/dev-reports/mig-16-be-minor-cleanup.md`.

### D-MIG-17-00. Designer tokens.md + Mock 라벨 실 enum 동기화 (MIG-17, 2026-05-21)

**배경**: MIG-14 admin UI 4 화면 산출 이후 Designer Minor 백로그로 남은 `tokens.md`와 mock wireframe의 상태/구분 라벨을 화면 API enum 계약에 맞춰 docs-only로 정리한다.

| 결정 | 내용 |
|---|---|
| D-MIG-17-01 | MIG-14 FE 라벨과 `docs/design/mig-14-admin-ui/tokens.md`의 CashKind / CashReceiptKind / OrderProgressStatus는 실제 BE enum 값과 한국어 라벨을 1:1로 명시한다. |
| D-MIG-17-02 | `docs/design/mig-14-admin-ui/01~07` mock wireframe의 상태 chip과 구분 라벨은 tokens.md 라벨 계약을 따른다. |
| D-MIG-17-03 | 필터 chip + reset 공통 UI 구현은 MIG-18(E admin UI 2단계)로 이연하고, MIG-17은 라벨/문서 정합만 처리한다. |
| D-MIG-17-04 | 옵션 C 21단계 + PM 자율 연속 슬라이스로 진행하고, 사이클 1c CRITICAL fix에서 FE 라벨과 dev-report/handoff/overview HTML을 같은 변경에 포함한다. |

**산출 예정/진행**: MIG-14 design tokens/mock 문서 8건, dev-report `docs/dev-reports/mig-17-designer-tokens-sync.md`, handoff, overview HTML.

### D-MIG-18-00. Admin UI 2단계 — 필터 chip + AGING pagination + 메뉴 그룹화 (MIG-18, 2026-05-21)

**배경**: MIG-14 admin UI 산출 이후 Designer Minor로 남은 필터 chip/reset UI와 MIG-16의 aging snapshot Pageable 계약을 desktop FE에 연결한다. 회계 admin 목록 메뉴는 기존 회계 그룹 아래에서 접기/펼치기 가능한 운영자 묶음으로 정리한다.

| 결정 | 내용 |
|---|---|
| D-MIG-18-01 | `FilterChipBar`를 desktop renderer 공통 컴포넌트로 추가하고 admin 화면에서 재사용한다. |
| D-MIG-18-02 | 필터 chip은 Cash 2 + OrderList + Aging + Ledger 2 목록 화면에 일괄 적용하고, OrderDetailPage는 단일 상세 화면이므로 제외한다. |
| D-MIG-18-03 | AGING 목록은 FE page/size state를 React Query key에 포함하며 size 옵션은 50/100/200/500으로 둔다. |
| D-MIG-18-04 | Linux 스크린샷 재캡처는 본 PR 범위 밖으로 두고 후속 issue로 분리한다. Windows EPERM 환경 한계를 회피하기 위해 본 PR은 mock fallback PNG를 유지하며, Linux CI 자동 캡처 또는 별도 Linux 환경 재캡처를 후속으로 처리한다. |
| D-MIG-18-05 | 회계 admin 메뉴는 "회계 관리자" collapse/expand 그룹으로 묶고, 동적 권한 캐시 false 시 그룹 전체를 숨긴다. |
| D-MIG-18-06 | 옵션 C 21단계 + PM 자율 연속 슬라이스로 진행하고 dev-report/handoff/overview를 같은 변경에 포함한다. |

**산출 예정/진행**: desktop `FilterChipBar`, Cash/Order/Aging/Ledger admin 화면 적용, AGING page-size UI, AppLayout 회계 관리자 그룹화, dev-report `docs/dev-reports/mig-18-admin-ui-phase-2.md`.

### D-MIG-19-00. 이카운트 cutover 운영 가이드 (MIG-19, 2026-05-21)

**배경**: MIG-1~11 이카운트 데이터 이관 기능과 MIG-14~18 admin UI가 준비되어 실제 운영 cutover 시 운영자가 따라갈 단일 가이드가 필요하다. 본 슬라이스는 docs-only로 유지하고 코드/Flyway/권한 seed는 변경하지 않는다.

| 결정 | 내용 |
|---|---|
| D-MIG-19-01 | cutover 문서는 개발자가 아닌 운영자 대상 한국어 문서로 작성한다. |
| D-MIG-19-02 | MIG-1~11 실행 순서를 그대로 유지하고, 각 단계에 endpoint와 응답 sample을 둔다. |
| D-MIG-19-03 | admin UI 트레이닝은 MIG-14~18의 Cash / Order / AgingSnapshot / Ledger 화면 기준으로 정리한다. |
| D-MIG-19-04 | 롤백은 hard delete가 아니라 soft-delete 복구와 staging `PENDING` 재실행 중심으로 안내한다. |
| D-MIG-19-05 | cutover 가이드의 ground truth는 spec 초안이 아니라 실 BE 코드/Flyway grep 결과로 둔다. endpoint, record 필드, ErrorCode status, SQL 컬럼은 문서 작성 전 실제 코드에서 확인한다. |
| D-MIG-19-06 | 사이클 2는 옵션 C의 가치를 입증했다. 사이클 1 1c/1e/1f가 잡지 못한 transform/journal/backfill DTO sample 결함을 재검토 단계에서 잡았다. |
| D-MIG-19-07 | ground truth 의무를 실 BE record/DTO grep까지 강화한다. 응답 sample은 controller 추정이나 spec 초안이 아니라 shared/common record 정의와 test fixture를 확인한 뒤 작성한다. |
| D-MIG-19-08 | Journal 번호 충돌 회피는 MIG-13 정정 결과인 CashDisbursement `JD-`, CashReceipt `JR-` 접두사를 명시한다. |
| D-MIG-19-09 | MIG-19는 docs-only 슬라이스로 유지하고 코드, Flyway, 권한 seed를 변경하지 않는다. |

**산출 예정/진행**: 운영자용 `docs/migration/ECOUNT-CUTOVER-GUIDE.md`, dev-report `docs/dev-reports/mig-19-cutover-guide.md`, handoff/overview 동기화.

### D-MIG-20-00. 이카운트 raw 자동 재import 스케줄 (MIG-20, 2026-05-21)

**배경**: MIG-19 cutover 가이드 이후 운영자가 월별 raw 파일을 같은 디렉토리에 내려받고 기존 MIG-1~11 importer/transform을 반복 실행할 수 있는 운영 trigger가 필요하다. 실행 주기는 회사 운영 일정에 종속되므로 서비스 내부 `@Scheduled`가 아니라 외부 스케줄러가 수동 endpoint를 호출한다.

| 결정 | 내용 |
|---|---|
| D-MIG-20-01 | Spring `@Scheduled` 대신 수동 trigger endpoint + 외부 cron/Windows Task Scheduler로 운영한다. |
| D-MIG-20-02 | 단일 endpoint `POST /admin/ecount/reimport/{slice}`가 `mig-1`~`mig-11` slice를 모두 받는다. |
| D-MIG-20-03 | 실행 권한은 정적 `ROLE_MASTER`와 동적 `ecount.reimport` EDIT를 모두 통과해야 한다. MANAGER/ACCOUNTANT는 실행할 수 없다. |
| D-MIG-20-04 | raw 파일 scan 위치는 `docs/migration/ecount-data/raw/`를 기본값으로 두고 `ecount.reimport.raw-dir`로 운영 환경에서 변경 가능하게 한다. |
| D-MIG-20-05 | 멱등성은 기존 staging `source_file_hash` 확인과 `staging.ecount_reimport_file_runs` run registry를 함께 사용한다. |
| D-MIG-20-06 | 실패 알림은 notification-service Slack alert 연동 대상으로 두고, 본 슬라이스는 cron/Task Scheduler/curl 예시와 실패 시 수동 Slack 호출 예시를 운영 가이드에 제공한다. |

**산출 예정/진행**: shared/common `EcountReimportResult`, accounting-service `EcountReimportService`/controller/V33, auth-service V26 `ECOUNT_REIMPORT`, dev-report `docs/dev-reports/mig-20-scheduled-reimport.md`, cutover guide §7.

### D-MIG-21-00. 마이그레이션 운영 대시보드 — Micrometer + dashboard-service + Grafana (MIG-21, 2026-05-21)

**배경**: MIG-20 재import trigger 이후 운영자가 이카운트 마이그레이션 상태를 Prometheus/Grafana와 desktop 관리자 화면에서 동시에 확인할 수 있어야 한다. 본 슬라이스는 PM 자율 연속 마지막 슬라이스로, 완료 후 사용자 결정 대기 상태로 멈춘다.

| 결정 | 내용 |
|---|---|
| D-MIG-21-01 | Micrometer counter는 base name으로 등록하고 Prometheus exporter의 `_total` suffix를 actuator 노출명으로 사용한다. |
| D-MIG-21-02 | accounting-service는 기존 `/actuator/prometheus` endpoint를 재사용하고 별도 metrics API를 만들지 않는다. |
| D-MIG-21-03 | dashboard-service는 accounting-service Prometheus text를 조회해 `/api/v1/dashboard/ecount-mig` gateway 경로로 운영 DTO를 제공한다. |
| D-MIG-21-04 | desktop은 회계 관리자 그룹에 `운영 대시보드` 메뉴를 추가하고 6개 카드(transform/import/reject/aging/reimport/DailyClosing)를 5분 polling 한다. |
| D-MIG-21-05 | auth-service V27은 `ecount.mig.ops-dashboard` PageCode를 추가하고 MASTER/MANAGER view+edit, ACCOUNTANT view-only로 seed 한다. |
| D-MIG-21-06 | Grafana JSON은 metric 1:1 패널 8개와 rejected 비율, DailyClosing diff, reimport FAIL 알림 기준을 포함한다. |
| D-MIG-21-07 | PM 자율 연속 마지막 슬라이스로 기록하고, 완료 후 D 단계에서 사용자 결정 대기 상태로 멈춘다. |

**Cycle 1c 보완**: `/actuator/prometheus`는 동일 endpoint를 유지하되 `X-Internal-Token` 내부 scrape로 제한한다. Aging/DailyClosing gauge는 실제 refresh/import call site에서 기록하고, dashboard-service scrape 실패는 `dashboard_accounting_scrape_failures_total`로 별도 관측한다. ACCOUNTANT는 V27 view-only seed와 일관되게 API view도 허용한다.

**산출 예정/진행**: accounting-service `MigOpsMetricsRecorder`, dashboard-service `EcountMigOpsDashboardService`, desktop `MigOpsDashboardPage`, auth-service V27, Grafana JSON/README, dev-report `docs/dev-reports/mig-21-migration-ops-dashboard.md`.

### D-MIG-22-00. IDE workspace + PROBLEMS 정리 (MIG-22, 2026-05-21)

**배경**: MIG-21 머지 후 사용자 PROBLEMS 지적에서 VS Code/Eclipse Java workspace가 MIG-15 신규 `shared:ecount-io` module을 stale 상태로 인식하지 못하고, TypeScript deprecation 및 Java warning이 다수 남은 것을 확인했다.

| 결정 | 내용 |
|---|---|
| D-MIG-22-01 | repo에는 `.project`/`.classpath`를 commit하지 않고, Gradle Java leaf project에 Eclipse plugin을 적용해 `./gradlew eclipse`/`eclipseClasspath`가 `/ecount-io` project dependency를 생성하도록 한다. |
| D-MIG-22-02 | `clients/desktop/tsconfig.web.json`은 `baseUrl` 유지와 함께 로컬 TypeScript 5.9가 허용하는 `ignoreDeprecations: "5.0"`을 추가해 deprecation 경고를 고정한다. |
| D-MIG-22-03 | Java unused import는 자동 스캔 + compile 검증으로 52개 파일 69건을 정리한다. |
| D-MIG-22-04 | `VehicleTonnage.fromRaw("1.4"/"11"/"25")`는 deprecated enum을 반환하지 않고 active enum(`TONNAGE_1`/`TONNAGE_10`/`TONNAGE_20`)으로 normalize한다. |
| D-MIG-22-05 | service-local `DynamicPermissionClient` 잔존 warning 25+ 파일은 본 PR에서 삭제하지 않고 MIG-23+ 점진 제거 백로그로 명시한다. |

**산출**: root Gradle Eclipse task 활성화, README IDE workspace 복구 절차, desktop tsconfig, Java unused import 정리, arologis tonnage normalization, dev-report `docs/dev-reports/mig-22-ide-workspace-problems-cleanup.md`.

### D-MIG-23-00. 로컬 6 client 직접 검증 환경 (MIG-23, 2026-05-21)

**배경**: MIG-22 머지 후 개발책임자가 로컬에서 직접 접속해 여러 client를 클릭 검증하겠다고 강하게 요구했다. AWS 배포 전 14 backend service와 기존 6 client 운영 단위를 한 번에 띄우는 로컬 검증 entrypoint가 필요하다.

| 결정 | 내용 |
|---|---|
| D-MIG-23-01 | 신규 client를 만들지 않고 기존 6 client 운영 단위(desktop / mobile / mobile-staff / web 3종 / arologis-desktop / arologis-mobile)를 정비한다. |
| D-MIG-23-02 | 기존 `infrastructure/docker-compose.yml`은 infra source of truth로 유지하고, backend 전체 실행은 `infrastructure/docker-compose.local-all.yml` overlay로 분리한다. |
| D-MIG-23-03 | `scripts/launch-local-stack.ps1`와 `.sh`가 bootJar build, compose up, health check, client 병렬 실행을 담당한다. |
| D-MIG-23-04 | 사용자 5 credential은 auth-service register API로 seed한다. auth-service에는 현재 `POST /admin/users`가 없고 user-service admin create는 임시 비밀번호 자동 발급 계약이므로, 고정 비밀번호 로컬 seed는 `/api/auth/register`를 사용한다. Role enum은 본 슬라이스에서 8 → 10 (STAFF/DRIVER 추가, commit a4db1f08) 으로 확장하여 alias 없이 직접 등록한다. 등록 후 `POST /api/auth/login` token 발급 verification 자동화 (실패 시 비-0 exit). |
| D-MIG-23-05 | 이카운트 raw 11종 자동 import는 MIG-20 reimport endpoint `mig-1`~`mig-11` 호출로 수행하며 `source_file_hash` 멱등을 그대로 사용한다. |
| D-MIG-23-06 | 사용자 친화 가이드는 `docs/local-stack/README.md`에 1 command 시작, URL, credential, troubleshooting, migration 검증 절차를 모은다. |
| D-MIG-23-07 | 옵션 C 21단계와 TM PR comment 머지 게이트 의무는 PR 발행 후 comment로 남겨 머지 전 확인한다. |

**산출**: local-all Docker Compose overlay, 공통 Spring runtime Dockerfile, PowerShell/Bash launcher, seed script, 8개 client `local-dev` script, local-stack README, dev-report `docs/dev-reports/mig-23-local-6-client-direct-test.md`.

### D-ISSUE-4-00. 통합 알림 센터 Slice 1 — target_role 배열 저장 (PR #297 Cycle 1c, 2026-05-22)

**배경**: PR #297 5-team BE 리뷰에서 `:role = ANY(string_to_array(target_role, ','))` native query 가 컬럼에 함수를 적용해 partial index 활용을 막는 P1 성능 결함으로 확인됐다. Slice 1 Flyway V5는 아직 main 머지 전 branch-local migration 이므로 history 누적 없이 in-place 수정한다.

| 결정 | 내용 |
|---|---|
| D-ISSUE-4-01 | `notification_center.target_role`은 CSV `VARCHAR(200)`이 아니라 PostgreSQL native `TEXT[]`로 저장한다. |
| D-ISSUE-4-02 | role 조회 native query는 `string_to_array`를 제거하고 `target_role @> ARRAY[CAST(:role AS text)]`로 통일해 GIN index 사용 가능성을 보존한다. |
| D-ISSUE-4-03 | `idx_notification_center_target_role_unread` btree partial index는 제거하고 `idx_notification_center_target_role_gin ON notification_center USING GIN(target_role) WHERE is_deleted = FALSE`를 사용한다. |
| D-ISSUE-4-04 | noise row 차단을 위해 `target_role IS NOT NULL OR target_user_id IS NOT NULL` CHECK 제약을 V5에 포함한다. |

**검증**: `NotificationCenterServiceTest` 9건 PASS, notification-service compile/test PASS. Testcontainers 기반 `NotificationCenterControllerIT` 6건은 로컬 Docker daemon 미가용 조건으로 skip, CI Linux runner에서 실 PostgreSQL 검증 대상.

### D-D7-00. 잔여 PreAuthorize 동적 권한 마이그레이션 (SP-D7, 2026-05-27)

**배경**: SP-D1~D6 후 잔여 `@PreAuthorize("isAuthenticated()")` 조회 endpoint와 redundant 이중 가드가 남아 있어 PageCode 기반 동적 권한 정책을 완성해야 한다.

| 결정 | 내용 |
|---|---|
| D-D7-01 | behavior-preserving을 최우선으로 한다. 유형 A endpoint는 기존 내부 인증 사용자 접근을 유지하도록 `PARTNER`를 제외한 내부 role에 VIEW grant를 보강하고, 기존 VIEW endpoint가 있던 page는 SP-D7 전용 `.view` page code로 분리한다. 단, `EstimatePermissionGuard`처럼 programmatic guard가 기존 page RBAC를 강제하는 endpoint는 descope하여 `isAuthenticated()`와 guard를 유지한다. |
| D-D7-02 | 알림 센터 3개 endpoint는 신규 PageCode `notifications.center` VIEW로 묶는다. |
| D-D7-03 | 유형 B endpoint는 공존 `@RequirePermission` seed grant와 기존 role guard를 대조한다. grant가 동일한 create/update만 redundant `@PreAuthorize` 삭제를 유지하고, Employee 역할 변경/퇴사 및 inventory widening 위험 endpoint는 더 엄격한 `@PreAuthorize`를 유지한다. |
| D-D7-04 | UserMe executive-office, SlipSalesQuery, HR/internal/auth-infra 등 SP-D6 KEEP 대상은 본 슬라이스에서 건드리지 않는다. |
| D-D7-05 | 권한 IT는 allow-all 기본 stub 후 deny case 요청 직전 page/action-aware 명시 deny stub을 사용한다. PR #310 see-saw 교훈을 반영한다. |
| D-D7-06 | Flyway V38은 case W 재사용 page의 내부 role active row만 `can_view = TRUE`로 UPDATE하고, 신규/전용 page와 missing row는 `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING` insert로 멱등 처리한다. `estimates.list`는 guard-gated page라 V38 UPDATE/INSERT 대상에서 제외해 V10/V31/V32 제한 grant를 보존한다. |

**산출**: 유형 A 23 endpoint `@RequirePermission` 전환, `EstimateController` 조회 2건 descope(`isAuthenticated()` + `EstimatePermissionGuard.checkView` 유지), case V 전용 page code 4건, cycle 4 V38 seed, `notifications.center` PageCode, Employee/Inventory strict `@PreAuthorize` 복원, dev-report `docs/dev-reports/sp-d7-remaining-preauthorize-migration.md`.

---

### D-PO-00. 권한 체계 전면 재편 Phase 1 — 계정 × page × 7-action 프레임워크 (2026-05-28)

**배경**: role 기반(영업원/회계원 등) 2-action(VIEW/EDIT) 동적 RBAC을 폐기하고, **계정(account) 단위 × page × 7-action**(보기/입력/수정/삭제/복원/다운로드/출력) enforcement + MASTER 전용 매트릭스 UI(개별/일괄)로 전환한다. Phase 0 인벤토리(173 PageCode × 7 action) 기반. role은 enforcement에서 분리되어 비강제 템플릿으로만 잔존.

| 결정 | 내용 |
|---|---|
| D-PO-01 | role 컬럼은 **비강제 템플릿**으로 유지하고 enforcement는 100% account-level로 한다. role은 (i) 로그인/감사 식별 + (ii) MASTER UI의 "템플릿 적용" 소스로만 사용한다. cold-start 1,200 셀 수동 설정 회피 + "role 기반 그룹화 폐기" 요구의 본질(enforcement 그룹화 폐기) 충족. |
| D-PO-02 | DOWNLOAD는 **단일 `can_download`** bit로 둔다. 포맷(Excel/PDF/PNG)은 기능 레이어로 분리한다. 인벤토리상 PDF/PNG는 전 codebase 0, Excel 7 endpoint이므로 포맷별 미세제어 필요성 미입증. |
| D-PO-03 | 마이그레이션은 **행동보존 자동전개**(Flyway V39)로 한다. 기존 `role_page_permissions` → 7-action `role_page_permission_templates` → 각 계정 `account_page_permissions` materialize. VIEW→VIEW, EDIT→CREATE+UPDATE+DELETE, RESTORE/DOWNLOAD/PRINT는 보존 매핑표 기준. 회귀 0. |
| D-PO-04 | MASTER 매트릭스 UI는 **평탄 매트릭스 + 도메인 섹션 헤더**(단일 계정 view, 173 행)로 한다. 행/열/도메인 일괄 토글 + 검색 + 템플릿 적용 + 다른 계정 복사. 다계정 일괄은 별도 wizard(`/admin/permission-matrix/bulk`). |
| D-PO-05 | MASTER bypass는 **PermissionAspect short-circuit**으로 한다. role=MASTER는 client.check 미호출 proceed (grant row 0). `/auth/admin/permissions/my`도 MASTER는 전 PageCode × 7-action all-true 반환(FE 메뉴 게이트 보존). |
| D-PO-06 | RESTORE 메커니즘 구현은 **Phase 2 도메인별 spec**으로 분리한다. Phase 1은 `can_restore` bit 정의 + 기존 2 endpoint(inventory.warehouse.admin, slip.audit-revert) 가드만. |
| D-PO-07 | PARTNER 경계는 PermissionAspect가 internal page 접근을 자동 deny한다. 내부 Role enum에 PARTNER 없음(외부=partner-auth-service 전용 endpoint). SP-D7 PARTNER widening 회고 반영. |
| D-PO-08 | FE 자기-권한 로드는 `GET /auth/admin/permissions/my`(`isAuthenticated()`)를 account 기반 7-action map으로 전환하여 사용한다. internal `hasRole('INTERNAL')` endpoint를 데스크톱 토큰으로 호출 시 403이 나므로 admin `/my`로 통일(MASTER all-true / PARTNER deny / X-User-Id 누락·parse 실패 fail-closed). |
| D-PO-09 | FE `usePermissions`/`PermissionGuard`는 7-action `canAccess`를 쓰되, 기존 라우트의 `action="edit"` 호환을 위해 `PermissionLookupAction = PermissionAction | 'edit'` + `normalizePermissionAction`(edit→update)을 과도기 shim으로 둔다. 라우트 prop의 명시 7-action 정리는 후속(편의상 본 PR의 AppLayout 범위 밖 개별 버튼 fan-out은 미수행). |
| D-PO-10 | **아로로지스 descope** (2026-05-29, PR #316 사이클2). arologis는 독립 auth(자체 `auth_admin_user`/Driver UUID + `AROLOGIS_MASTER/MANAGER/DRIVER` role)라 auth-service `accounts` 기반 V39 materialize 대상 외 → account 기반 `check()`에서 권한 row 부재로 전 엔드포인트 lockout. 해소: shared `PermissionAspect`에 `samhan.security.permission.enforcement-mode` opt-in(**default=account, 13 service 불변**), arologis만 `role` 모드(VIEW→canView/변경계열→canEdit, `AROLOGIS_*` 정규화, `AROLOGIS_MASTER` bypass). 아로로지스 독립 account×page×action 권한 체계는 별도 슬라이스(Phase 2 후보). |
| D-PO-11 | **PARTNER self-service carve-out** (2026-05-29, PR #316 사이클1~2). `PermissionAspect`의 PARTNER 무조건 deny가 V30 grant된 partner-facing self-service(주문 print/draft/confirm/list/detail/history/edit-requests/tutorial)까지 차단해 기존 partner 기능 회귀. 해소: `@RequirePermission.partnerSelfService` flag(default false) — PARTNER이고 flag=true면 aspect proceed, 자기범위는 service 계층(`PARTNER_CODE_HEADER`/`PartnerSelfScopeGuard`)이 강제(자기 거래처 200, 타 거래처 403). self-scope 검증 있는 endpoint에만 적용, admin성(decide/edit/delete/from-estimate) 미적용. |
| D-PO-12 | **role-form 권한 endpoint 양식 분기** (2026-05-29, PR #316 사이클3). 7-action 전환으로 `/auth/internal/permissions/check`를 account-form(accountId+action) 전용화하면서 레거시 role-form(roleCode+type) 소비자(programmatic guard: EmployeePermissionGuard 등 + arologis role-mode)가 400→deny로 운영 lockout(IT @MockBean으로 CI false-green). 해소: `/check`가 account-form(`AccountPermissionService.check`)·role-form(`DynamicPermissionService.canAccess`, `role_page_permissions`) 양식 동시 지원. 실 HTTP 회귀 테스트(MockRestServiceServer + Testcontainers) 추가로 mock 가림 재발 방지([[feedback_enforcement_real_http_test]]). |
| D-RST-01 | **복원 접근법 = full-snapshot + point-in-time** (2026-05-29, Phase 2.1 RESTORE 첫 구현). `slip_revisions`에 각 시점의 전표 헤더+라인 **완전 스냅샷**(JSONB, V27)을 적재하고, 복원은 대상 revision 스냅샷을 현재 행에 그대로 재기록(`restoreFromSnapshot`)한다. **field-diff replay 기각**: (i) 다수 mutation 경로(create/editHeader/updateSlip/overlay/addLine/removeLine)에서 diff 누락 시 replay 결과가 silently 어긋남, (ii) 복원이 O(N revisions) 재생이라 비용·정합성 리스크, (iii) D-PO-02 audit-log(field 단위 before/after)는 **표시용**으로 이미 존재해 역할 분리가 명확. snapshot은 저장 비용(전표당 수~수십 KB)을 감수하고 복원 정확성·단순성을 택한다. 복원 자체도 새 RESTORE revision을 발급해 이력 보존. |
| D-RST-02 | **slip이 RESTORE 첫 도메인 + 도메인별 분해 로드맵** (2026-05-29). D-PO-06(RESTORE bit 정의 + 메커니즘은 Phase 2 도메인별 spec 분리) 후속으로 slip(전표)을 첫 도메인으로 구현한다. 전표가 (i) 변경 빈도·다중 작성자 충돌이 가장 높고, (ii) 기존 `slip.audit-revert` page + AuditOverlay 인프라가 이미 있어 재사용 효율이 최대이기 때문. inventory.warehouse.admin 등 잔여 RESTORE 보유 도메인은 각자 데이터 모델 특성(스냅샷 크기/변경 패턴)에 맞춰 후속 슬라이스에서 본 패턴을 차용·조정한다(일괄 프레임워크 강제 X). |
| D-RST-03 | **`slip.audit-revert` page 재사용 + overlay 공존 + 캡처 완전성** (2026-05-29). 버전이력/복원 권한은 신규 page code를 만들지 않고 기존 `slip.audit-revert`(RESTORE action) page를 재사용한다(권한 매트릭스 행 증가 억제, D-PO-04 평탄 매트릭스 정합). FE는 기존 AuditOverlay(field 단위 표시) **옆에** `SlipVersionHistoryPanel`(시점 단위 복원)을 **공존** 배치 — 둘은 표시(diff)와 복원(snapshot)으로 역할이 다르다. 복원 정확성의 전제는 **스냅샷 캡처 완전성**이므로 모든 content-mutation 경로(create/editHeader/updateSlip/overlay/addLine/removeLine/reject-with-reason/restore)에 capture 훅을 빠짐없이 건다(누락 시 복원이 옛 라인 상태로 회귀). 마감(period close)·권한 가드는 복원 시에도 동일 적용. |
| D-RST-05 | **견적(Estimate) = RESTORE 3번째 적용 도메인** (2026-05-29, Phase 2.2). inventory 보류(D-RST-04) 후 "편집되는 도메인"으로 견적 선택 — 견적서가 헤더+라인 구조 + 주문 전 활발 편집 + slip 과 동형이라 slip 패턴(D-RST-01~03) 이식 효율 최대. 구현 특이점: (i) `estimates.list` page에 **RESTORE action 추가**(신규 page code 미생성), (ii) 복원 가드 = `requireEditable()`(EDITABLE_STATUSES={QUOTE_DRAFT,QUOTE_SENT}, ACCEPTED/CONVERTED/REJECTED 차단 — slip 마감 lock 사상), (iii) **SSE 생략**(estimate BE realtime broker 부재 → FE 복원 응답 invalidate 로 충분), (iv) 라인 전량교체는 `lines.clear()`(orphanRemoval=true, slip 의 markDeleted 와 차이), (v) `EstimateService` content-mutation = create/update 뿐(status 전이 send/accept/reject/convert 제외). **slip+estimate 공통부 shared 추출은 형태차(slip=overlay 공존/필드, estimate=단순)로 D-RST-02대로 계속 보류** — 다음 도메인에서 재평가. 신규 `estimate_revisions`(V28, JSONB). |
| D-RST-04 | **inventory RESTORE 보류 — 적합 대상 부재** (2026-05-29, Phase 2.2 brainstorming grounding 결론). RESTORE 도메인 확장으로 inventory 를 검토했으나 slip 식 "편집되는 전표" 적합 대상이 없음: (i) `StockBalance`/`StockLot` = **mutable balance 컬럼** + `StockMovement` append-only → full-snapshot 복원이 movement 와 desync(정정은 기존 adjust 로 충분), (ii) `StockTransfer`(이동전표) = **생성 후 내용 편집 기능 자체가 없음**(상태전이만, header/line update/replace 메서드 부재) → 버전이력 use case 없음(복원=no-op), (iii) `InventoryAudit`(실사) = complete 시 stock_balance 조정 + accounting 분개 연동 → 복원 시 회계 정합성까지 필요(고복잡). 결론: RESTORE 차기 슬라이스는 **slip 처럼 활발히 편집되는 도메인**(거래처 마스터 / 견적·주문 등)으로 진행. inventory 는 재고 모델 특성상 snapshot-rollback 부적합. |
| D-RST-06 | **거래처(Partner) = RESTORE 4번째 적용 도메인** (2026-05-29, Phase 2.3). D-RST-04 결론대로 "활발히 편집되는 도메인"인 거래처 마스터를 선택 — 기본정보(헤더) + 배송지/담당자/단가할인 3종 자식의 4탭 구조라 버전이력 use case 명확. slip/estimate 패턴(D-RST-01~03/05) 이식하되 구조 특이점 5가지: (i) 자식이 단일 `@OneToMany` 컬렉션이 아닌 **4탭 이종 자식**(배송지/담당자/단가)이라 복원은 JPA orphanRemoval 자동 재현이 불가 → **service-layer 에서 toSnapshot/restore 직접 조립**(자식 전량교체), (ii) 권한은 `partners.4tab.edit` page 에 **RESTORE action 추가**(신규 page code 미생성, D-RST-03 정합), (iii) **거래종료(TERMINATED) 가드 신설** — 복원 허용 = ACTIVE/SUSPENDED 만, TERMINATED 는 409(slip 마감 lock·estimate requireEditable 사상 계승, 거래종료 거래처 부활 방지), (iv) `creditLimit`/`outstandingBalance`(신용 도메인 누적 일관성 — 잔액은 거래 누적이라 시점 복원 부적합) + `partnerCode`/`bizNo`(불변 식별자) **복원 제외**(헤더 부가정보·자식만 복원), (v) **partner-service 첫 JSONB 스냅샷**(`partner_revisions` V12) + **SSE `partner:edit` 채널 재사용**(estimate 와 달리 broker 존재 → 복원도 실시간 반영). **shared 추출은 slip(overlay 공존/단일 라인)·estimate(단순 단일 라인)·partner(4탭 이종 자식) 3형태차로 여전히 보류** — 도메인 모델 차이가 커 공통화 이득보다 강결합 리스크 우위, 인프라성 공통부(채번 race 재시도/changeSummary diff 골격)만 추출 후보(D-RST-02/05 유지). |
| D-PO-25 | **주문 보류(ON_HOLD) 상태 도입 + 리스트 업무용어 통일** (2026-05-31, Phase 2.5). `PartnerOrderStatus.ON_HOLD` 신규 enum 추가. 전이 규칙: **진행중(DRAFT) ↔ 보류(ON_HOLD) 양방향**만 허용. 완료(CONFIRMED)는 출고전표(slip) 발행이 완료된 상태이므로 보류 전환 불가(slip 정합성 보호). 보류 주문은 `PartnerOrderDraft` confirm 흐름과 무관 — createFromEstimate 견적전환분의 status 전이이며 PartnerOrderDraft INSERT 경로가 아님. 보류/해제 권한은 `sales.partner-order.edit` UPDATE action 재사용(신규 page 불필요, D-PO-04 매트릭스 최소화 방침 일관). 보류/해제 전이 시 Phase 2.4 예약 STATUS revision 유형 **첫 실사용**. 리스트 status 필터 인프라(Controller/Specification/Repository)는 grounding 결과 기완성 — ON_HOLD enum 추가만으로 자동 동작. 기간필터 기준 필드 분기: DRAFT·ON_HOLD → `createdAt`(confirmedAt=null이므로), 그 외 → `confirmedAt`. 리스트 기본 필터 = DRAFT(진행중)만 — 보류 분리 표시로 목록 간결화. FE 라벨 업무용어 통일: DRAFT='작성중' → **'진행중'**, CONFIRMED='확정' → **'완료'**, ON_HOLD='보류'(신규). Flyway 마이그레이션 불필요: `status VARCHAR(20)` CHECK 제약 없어 enum 추가만으로 즉시 적용. |
| D-RST-07 | **주문(Partner-Order) = RESTORE 5번째 적용 도메인** (2026-05-30, Phase 2.4). V7 `partner_order_revisions`(JSONB) 신설. 캡처 범위: **from-estimate 전환(CREATE) + confirm(CREATE) + draft update(EDIT) + 본사 직결 수정(EDIT) + soft-delete 직전(DELETE)**. STATUS 유형은 향후 취소·보류 전이용 예약. 복원 구조 특이점 5가지: (i) **제외목록 가드** — CONFIRMING(advisory lock transient)·CANCELED 만 409, DRAFT·CONFIRMED 및 추후 ON_HOLD 는 자동 포함(가드 수정 없음), (ii) **CONFIRMED 복원 시 slip 연동 정책** — 주문 내용(헤더 편집 필드+라인)만 역적용, slipNo/slipPublishStatus/confirmedAt/slipPublishedAt/status 는 복원 제외(발행 사실 보존), `slipResyncRequired=true` 경고 플래그로 담당자 안내, slip 재발행은 차기 슬라이스, (iii) **삭제 주문 복원(undelete)** — `findByIdIncludingDeleted` native query로 soft-deleted 주문 로드 → `restoreFromDeleted()` is_deleted=false + deletedAt/deletedBy 클리어 → 시점 내용 적용. 삭제 여부 무관 status 기준 가드. (iv) **권한 분리** — VIEW=`sales.partner-order.history.view`(기존 재사용), RESTORE=`sales.partner-order.revisions`(신규, V40 시드, **auth-service 먼저 배포 필수**), (v) **업무용어 확정** — 진행중=DRAFT / 완료=CONFIRMED / 보류=신규 ON_HOLD(별도 슬라이스) / CONFIRMING·CANCELED=사용자 비노출. **D-RST-05 shared 추출 재평가**: 4도메인 비교 결과 엔티티 골격/채번 race/changeSummary 구조/UUID 가드는 공통 추출 후보, 스냅샷 조립·복원 역적용·가드 로직은 도메인별 유지 타당 — 실제 추출은 별도 슬라이스 권장(현 시점 강제 추출은 4개 서비스 동시 수정 위험). |

**산출(2026-05-28 세션)**: shared/security `PermissionAction` 7-action enum + `@RequirePermission` enum화 + `PermissionAspect`(account-id/MASTER bypass/PARTNER deny) + `DynamicPermissionClient` account+7action(Stage 1); auth-service `account_page_permissions`/`role_page_permission_templates` 엔티티·서비스·admin/internal API + Flyway V39 + `/my` 7-action 전환(Stage 1+SP-PO-11); 14 service ~380 `@RequirePermission` 2→7 재주석화 + `EstimatePermissionGuard` account 전환 + dead guard 3개 삭제(Stage 2); FE `permissionsApi`/`usePermissions` 7-action + account 매트릭스 API + `PermissionMatrixPage` 평탄 매트릭스 재작성 + 다계정 wizard + AppLayout 게이트 + Playwright 3 spec(Stage 3); dev-report `docs/dev-reports/phase-1-permission-overhaul-framework.md`. spec `docs/superpowers/specs/2026-05-28-permission-overhaul-phase-1-framework-design.md`, plan `docs/superpowers/plans/2026-05-28-permission-overhaul-phase-1-framework.md`.

---

### D-WH. slip ↔ inventory 창고코드 정렬 (2026-05-31, 슬라이스 C)

**배경**: Phase 2.6c 가 주문→출고전표 전환 시 재고 예약(reserve) 정합까지 머지했으나, 전환 happy-path(=slip 발행 성공)가 **창고코드 네임스페이스 단절**로 막혀 있었다. inventory 자체 코드(`HQ-001` 등)와 slip `WarehouseCodeMapper` 의 이카운트 레거시 코드(`00003/2/14/1`)가 교집합 0 → convert 가 같은 warehouseCode 를 양쪽에 보내면 한쪽이 반드시 실패(slip 400 또는 inventory 404). 추가로 FE 전환 모달이 warehouseCode 를 전혀 보내지 않아 convert 2a 가드 409. e-Count 제거(PR-G1 V16)로 slip 의 warehouseId 는 단순 스냅샷이고 실제 예약은 partner-order 가 inventory UUID 로 수행한다는 점이 전제.

| 결정 | 내용 |
|---|---|
| D-WH-01 | **창고코드 단일 출처 = inventory DB**. inventory 코드(`HQ-001` 등)를 정반으로 삼는다. e-Count 제거 + reserve 가 inventory UUID 로 일어나므로 inventory 가 자연스러운 진실원. |
| D-WH-02 | **convert 경로 = warehouseId 직접 전달, estimate 경로 = yml 격리**. partner-order convert 가 inventory `by-code` 로 해석한 `warehouseId`(UUID)를 slip payload 에 직접 실어 보내고, slip 은 warehouseId 가 있으면 yml(`WarehouseCodeMapper`) 미경유로 그대로 사용한다. warehouseId 가 없으면 warehouseCode 를 yml 폴백 해석(estimate-app from-estimate 가 레거시 코드 `00003` 등을 지금도 전송하므로 yml 맵 유지·무영향). slip yml 맵 완전 폐기는 inventory `legacy_code` 별칭 도입 후속 슬라이스. fingerprint 는 멱등 안정성 위해 warehouseCode 기준 유지(warehouseId 미포함). |
| D-WH-03 | **FE 전환 모달 창고 드롭다운 필수(기본값 없음)**. design-system `WarehouseSelector`(hideVirtual) 로 출고 창고를 명시 선택해야 전환 가능(미선택 시 제출 비활성). 재고 없는 창고 오선택 방지. UUID 비공개: 선택 내부 value 는 창고 id 지만 convert 요청 본문엔 warehouseCode 만 전송. 창고별 가용 재고 표시는 슬라이스 B(2.6d 재고조회 모달). |

**산출**: slip `PublishFromPartnerOrderRequest.warehouseId`(nullable) + `SlipPublishService.resolveWarehouseId`(warehouseId 우선·yml 폴백, 커밋 `bcafe950`); partner-order `PartnerOrderConvertService.convert` slip payload 에 warehouseId 추가(`fd5f4378`); FE 전환 모달 `WarehouseSelector` 필수 선택 + warehouseCode 전송(`44cbc420`). 테스트: `SlipPublishWarehouseIdIT`(2) + `PartnerOrderConvertIT.case6` captor + Playwright 시나리오 11. spec `docs/superpowers/specs/2026-05-31-slip-inventory-warehouse-code-align-design.md`, plan `docs/superpowers/plans/2026-05-31-slip-inventory-warehouse-code-align.md`, dev-report `docs/dev-reports/slice-c-warehouse-code-align.md`. 배포 순서: slip → partner-order → FE.

---

### D-CF. confirm 자동발행 폐지 (2026-05-31, 슬라이스 D1 = 2.6b 분할 ①)

**배경**: 거래처 포털 confirm(`PartnerOrderConfirmService.confirm`)이 주문 INSERT 직후 자동으로 출고전표(slip)를 발행(200→CONFIRMED+slipNo / 5xx→outbox PENDING_RETRY)했다. 이 강결합이 부분전환/병합(2.6a/2.6c/D2)의 명시적 convert 모델과 충돌(confirm 발행 주문은 slipNo≠null → convert 불가)했고, from-estimate 경로(이미 DRAFT+NOT_REQUIRED)와 비대칭이었다.

| 결정 | 내용 |
|---|---|
| D-CF-01 | **2.6b 를 D1(confirm 자동발행 폐지) / D2(다중주문 병합) 로 분할.** D1 먼저 독립 슬라이스. confirm 폐지가 주문 라이프사이클 근간(전환 일원화)이라 D2 병합의 토대 — 각각 독립 테스트·머지. |
| D-CF-02 | **confirm 은 slip 미발행 주문만 생성, 결과 status=DRAFT(진행중) + NOT_REQUIRED.** `PartnerOrder.createFromConfirm`(from-estimate 동형, sourceEstimateId=null)으로 생성. 출고전표는 명시적 convert 액션(`PartnerOrderConvertService`)으로만 발행(완료=CONVERTED). CONFIRMING/CONFIRMED/SlipPublishStatus 는 신규 흐름 미사용(레거시 호환만). 두 주문생성 경로 통일 + convert 모델 정합 + churn 최소. 부수효과: slip-service 다운 시에도 confirm 200(가용성 개선). |
| D-CF-03 | **outbox/scheduler/SlipPublishStatus/markSlipPublished/markSlipPendingRetry 는 dormant 유지(코드 물리 제거는 후속).** confirm 신규 enqueue 0, 스케줄러는 레거시 PENDING_RETRY 행 drain 지속. 운영 in-flight 안전 + 최소 diff. deprecated 주석으로 후속 제거 표식. |

**산출**: `PartnerOrder.createFromConfirm`(DRAFT+NOT_REQUIRED) + `PartnerOrderConfirmService.confirm` slip 발행 블록 제거 + 미사용 의존(slipServiceClient/outboxRepository/objectMapper/buildSlipPayload/serialize) 제거 + confirm IT 재작성(`85d6150f`). FE(order-app) 무변경(confirm 성공 핸들러 slipNo/status 비의존). spec `docs/superpowers/specs/2026-05-31-confirm-no-autopublish-design.md`, plan `docs/superpowers/plans/2026-05-31-confirm-no-autopublish.md`, dev-report `docs/dev-reports/slice-d1-confirm-no-autopublish.md`. partner-order-service 단독 배포, Flyway 불필요. **D2(다중주문 병합) 후속.**

---

### D-CR. confirm 경로 복구 — DC price-calc 정식 연동 + FE res.ok (2026-05-31)

**배경**: 슬라이스 D1 Docker 실 QA 가 실 confirm 직접호출 BLOCKED 로 드러낸 **기존 버그 2건**(D1 무관). ① `DcConfigClient.fetchDcConfig` 가 없는 경로 `/api/v1/dc-configs/{partnerCode}` 호출 → 403 → confirm 예외 + applyDc 기대 스키마가 실제 엔드포인트와 불일치(죽은 DC 스켈레톤). ② order-app `sendOrderFromUi` 가 ApiResponse `{success}` 반환하나 레거시 핸들러는 `res.ok` 확인 → 항상 "전송 실패".

| 결정 | 내용 |
|---|---|
| D-CR-01 | **confirm DC 적용 = dc-config-service `/internal/price-calculations` 정식 연동.** 죽은 `fetchDcConfig`/`applyDc`/`mapCategoryToDcKey` 제거 → `DcConfigClient.calculatePrices` 가 라인별 정상가+카테고리 전송, finalPrice 수신. dc-config 가 DC 단가 단일 소유(아키텍처 정합). |
| D-CR-02 | **fail-soft 보존**: price-calc 404(DC 미설정)/5xx/연결실패 → 빈 결과 → confirm 이 listPrice 사용(DC 미적용). 기존 "DC 미적용 시 정상가" 사상 + 회계 critical path 가용성. |
| D-CR-03 | **order-app `sendOrderFromUi` 응답 정규화**: ApiResponse → 레거시 핸들러 기대형 `{ok: success, orderNo, error: message}`. 거대 index.html 미변경, 성공 표시 복구. |

**산출**: `DcConfigClient.calculatePrices`(POST /internal/price-calculations, ApiResponse<PriceCalculationResponse> 파싱, fail-soft) + confirm finalPrice 사용 + mapCategory + 죽은 메서드 제거 + VendorOrderService fetchDcConfig 참조 제거(미리보기 dcRate=0) + confirm IT 2종(`e85f45f3`). order-app sendOrderFromUi 정규화(`70dacf5f`). 225 tests PASS(skipped=0). spec/plan/dev-report `docs/.../2026-05-31-confirm-recovery-dc-price-calc*` + `docs/dev-reports/confirm-recovery-dc-price-calc.md`. partner-order+order-app 배포, Flyway 불필요. 옵션 정액 DC(confirm 라인 옵션 플래그)·estimate price-calc 점검 후속. **partner_order↔dc-config 거래처코드 시드 정합 후속**(실 confirm DC 실적용 — confirm 은 정상 partnerCode 전송, 로컬 시드 불일치로 fail-soft).

---

### D-AC. 마스터데이터 자동완성 — 창고/품목/거래처 (2026-05-31)

**배경**: 슬라이스 C 가 전환 모달에 `WarehouseSelector`(드롭다운) 도입. 개발책임자 요청 = 드롭다운 대신 **입력 즉시 자동완성**(거래처명/코드/기타 · 창고 · 품목 모델명/품목명). design-system 에 기존 typeahead idiom `AccountCodeSelect` 존재.

| 결정 | 내용 |
|---|---|
| D-AC-01 | 마스터데이터 자동완성 = **3분할 순차 슬라이스(AC-1 창고 → AC-2 품목 → AC-3 거래처)**, 공용 `AccountCodeSelect` typeahead idiom 재사용. 각 독립 검색 백엔드·배선이라 분리(PR 비대화 방지). |
| D-AC-02 | 각 엔티티별 **신규 design-system 컴포넌트**(WarehouseAutocomplete/ProductAutocomplete/PartnerAutocomplete), 기존 드롭다운(WarehouseSelector 등) **보존**(회귀 격리). 4종 완료 후 공용 typeahead 추출 재평가. |
| D-AC-03 | 적용은 해당 입력 폼만, **API 본문은 비즈니스 식별자만**(warehouseCode/modelName/partnerCode — UUID 비공개), 기존 게이트/에러/로딩 로직 유지. |

**산출(AC-1)**: design-system `WarehouseAutocomplete`(AccountCodeSelect 이식: 코드 prefix/이름 부분일치, 키보드 네비, hideVirtual, FormField, combobox 접근성) + Storybook + 전환 모달(`SalesPartnerOrderDetailPage`) `WarehouseSelector`→`WarehouseAutocomplete` 교체 + Playwright 갱신(`4cb264fa`). spec/dev-report `docs/.../2026-05-31-ac1-warehouse-autocomplete*`. AC-2/AC-3 후속.

**산출(AC-2, 2026-05-31)**: design-system `ProductAutocomplete`(**서버검색형** — WarehouseAutocomplete 의 async 변형: `searchProducts:(q)=>Promise<ProductOption[]>` 주입, debounce/minChars/로딩·빈·에러/stale 응답 무시/combobox) + Storybook + `LineRow` optional `modelCell` slot(backward compat) + desktop `searchProducts(q)`(`GET /api/products?q=` product-service, 백엔드 무변경) + SlipFormPage 품목 라인 배선(modelName onBlur 정확매칭 → 부분입력 서버검색) + Playwright(`5e407438`). 결정: D-AC2-01 서버검색형(다수 품목) / D-AC2-02 product-service q 검색 재사용(백엔드 무변경) / D-AC2-03 LineRow modelCell slot(타 소비자 격리) / D-AC2-04 SlipFormPage 만. spec/dev-report `docs/.../2026-05-31-ac2-product-autocomplete*`. AC-3 거래처 후속.

**산출(AC-3, 2026-05-31)**: design-system `PartnerAutocomplete`(ProductAutocomplete 포팅 — 서버검색 async/debounce/per-instance seq/로딩·빈·에러/isCompact aria-label/combobox/blur 게이트) + Storybook + desktop `searchPartners(q)`(`GET /admin/partners/search?q=` code/name/bizNo/phone, 백엔드 무변경) + SlipFormPage 거래처 필드 배선(`01fc6da0`). 결정: D-AC3-01 서버검색형 / D-AC3-02 /admin/partners/search 재사용 / **D-AC3-03 2단계 채움**(검색 summary code/name/phone 즉시 + address/representative 는 기존 detail `GET /admin/partners/{code}` 재사용 보강, 수동 자동채움 버튼 → 선택 시 자동) / D-AC3-04 SlipFormPage 거래처만. Playwright 7/7 PASS. **마스터데이터 자동완성 트리오(창고#331/품목#332/거래처) 완료** → 공용 async typeahead(`AsyncAutocomplete<T>`) 추출 별도 리팩터 후보. spec/dev-report `docs/.../2026-05-31-ac3-partner-autocomplete*`.

---

### D-MRG. 다중 주문 → 단일 출고전표 병합 전환 (Phase 2.6b ② = D2, 2026-05-31)

**배경**: 2.6a 단일주문 부분전환·2.6c 재고 reserve·D1 confirm 자동발행 폐지 후, 같은 거래처의 여러 DRAFT/ON_HOLD 주문을 하나의 출고전표로 병합 발행하는 기능. 기존 `slip.sourceId` 가 단일 String 이라 N:1 출처추적 불가.

| 결정 | 내용 |
|---|---|
| D-MRG-01 | **N:1 출처추적 = slip-service `slip_source_orders`(V30) 조인 테이블**(slip_id, partner_order_id, order_no) + 기존 `SlipLine.sourceOrderLineId`(V29) 라인레벨 병행. 단일주문 경로는 미기록(회귀 0). `slip.sourceId`=대표(첫) 주문, N:1 진실은 조인 테이블. |
| D-MRG-02 | **신규 병합 엔드포인트 추가** — partner-order `POST /convert-to-slip-merge` + slip `POST /from-orders-merge`. 검증된 단일주문 경로(`/{id}/convert-to-slip`, `publishFromPartnerOrder`) 무변경, 공통 헬퍼만 재사용. |
| D-MRG-03 | **헤더 '/' 병기 = FE 가 최종 확정 전송**, BE 는 그대로 저장 + partnerCode 동일성만 검증(불일치 409). 사용자 통제·단순. |
| D-MRG-04 | **원자적(all-or-nothing)** — 한 라인 가용부족 또는 slip 발행 실패 → 전체 409 + 예약 성공분 release 보상(멱등 no-op 제외). 단일주문 reserve 사전차단과 일관. partner_order_db 단일 트랜잭션. |
| D-MRG-05 | **권한 = 기존 `sales.partner-order.convert` CREATE 재사용**. 신규 page 코드/시드 불필요. |
| D-MRG-06 | **주문 식별자 = `PartnerOrderIdResolver`(주문번호/UUID 양용)**, 단일 경로와 일관. 응답은 orderNo 반환(UUID 비공개). 결정적 멱등키 `PO-MRG-{SHA256[:16]}`(전 주문/라인 convertedBefore 스냅샷) = reserve referenceId + slip Idempotency-Key 공용. |

**산출**: slip V30 `slip_source_orders` + `SlipSourceOrder` 엔티티/리포지토리 + `publishFromOrdersMerge` + `findBySource` UNION 확장(비대표 주문 역조회) + `SlipPublishMergeIT` 6종. partner-order `MergeConvertToSlipRequest`/`MergeConvertResultResponse` + `PartnerOrderMergeConvertService`(reserve→발행→보상 N주문 일반화) + `POST /convert-to-slip-merge` + `SlipServiceClient.publishFromOrdersMerge` + 단위 8/IT 12. desktop 주문목록 다중선택+병합버튼 + `MergeConvertDialog`(충돌헤더 라디오/직접입력, 비가역 danger 경고, 4-AND 제출) + Playwright 9. 5-team 사이클 N=2 APPROVE(skipped=0). 배포순서 slip→partner-order→FE(런북 `docs/runbooks/d2-order-merge-deploy.md`). spec/plan/dev-report `docs/.../2026-05-31-order-merge-to-slip*`. 후속(비차단): 목록 배지 갱신 E2E, discountInfo 충돌헤더(PartnerOrderDetail 미보유), D2 Playwright CI 자동실행 게이트, 공용 AsyncAutocomplete 추출.

---

### D-IL. 품목 재고조회 모달 (Phase 2.6d, 2026-05-31)

**배경**: 주문/출고전표/입고전표 상세에서 작업 중 품목 재고를 즉시 확인하는 운영 편의. 2.6c 가 가용/실/예약 데이터를 확정한 위에 읽기전용 조회 UX.

| 결정 | 내용 |
|---|---|
| D-IL-01 | "0수량 창고도 표시" 토글 = **전 창고 마스터 머지** — FE 가 batch 결과 + `GET /inventory/warehouses` 머지로 balance row 없는 창고도 0/0/0 표시 |
| D-IL-02 | **다중 품목 매트릭스** — 상세 라인 다중선택 → 품목×창고 매트릭스 |
| D-IL-03 | **셀 3줄 누적(가용/실/예약)**. 토글 OFF=실재고(total)>0 창고만, ON=전 창고 |
| D-IL-04 | API = **`POST /inventory/balances/batch` 재사용**(inventory 무변경). 권한 `inventory.list` VIEW = 전 인증 role → 주문/판매 담당자 가능. VIRTUAL 창고 제외 |
| D-IL-05 | **신규 공유 `InventoryLookupModal`** — 기존 SlipFormPage StockBalanceModal(총량 전용)과 별개, 무변경 |
| D-IL-06 | partner-order **`PartnerOrderDetailResponse.LineResponse` 에 productId 노출**(재고 batch 키). 화면 미노출(UUID 비공개=화면 노출만 금지). 출고/입고 슬립 라인은 이미 보유 |

**산출**: partner-order LineResponse productId 1필드 + FE `fetchProductBalancesMatrix`(lines 기준 순회 — 잔량 없던 품목도 행 생성 + 전 창고 머지) + `InventoryLookupModal`(셀 3줄 가용/실/예약, 0토글, design-system 토큰: 가용0 danger·예약>0 warning, sticky 고정컬럼, th scope/caption/aria) + SlipDetailPage(기존 단일 alert 재고조회 대체)·SalesPartnerOrderDetailPage 배선 + Playwright 13. 5-team 사이클 N=2 APPROVE(skipped=0). **FE 전용 + BE 1필드** → 배포 partner-order→FE, Flyway 없음. 후속(비차단): SlipFormPage 모달 통합 / 시리얼 카운트 확장 / D2-6d Playwright CI 자동실행 게이트. spec/plan/dev-report `docs/.../2026-05-31-inventory-lookup-modal*`.

---

### D-SER. 시리얼 인스턴스 재고 모델 — S1 인스턴스 기반 (Phase INV-S, 2026-06-01)

**배경**: 개별시리얼 품목(에어컨/판넬)의 재고 최소단위를 UUID 인스턴스로 모델링. 품목코드(productCode)=분류 그룹, UUID=인스턴스 시리얼 키. spec `2026-05-31-serial-instance-inventory-design`.

| 결정 | 내용 |
|---|---|
| D-SER-01 | **범위 = S1 인스턴스 기반만** (테이블+도메인+판정+seed+CRUD/조회). 입출고 전표 연동은 S2(입고)/S3(출고)/S4(회수) 후속 독립 슬라이스. (2026-05-31 마우스) |
| D-SER-02 | **관리방식 판정 = product-service `categories.serial_managed` 파생** — 에어컨 계열 카테고리 true(개별시리얼), 부자재(PIPING/CONTROL) false(batch). `ProductSummaryResponse.serialManaged` 노출 → inventory 소비. 카테고리 의미를 product-service 단일 소유(inventory 하드코딩 없음). (2026-05-31 마우스) |
| D-SER-03 | **인스턴스 상태 = status 전이**(AVAILABLE/RESERVED/SHIPPED/RECALLED), soft-delete 대신. 도메인 메서드 ship/recall/reserve/release + requireStatus 가드(BusinessException CONFLICT). |
| D-SER-04 | **FIFO/역-FIFO** — 출고 소진 = product_code+AVAILABLE received_at ASC. 회수 = outbound_partner_code+product_code+SHIPPED outbound_at DESC. V15 인덱스 2개. |
| D-SER-05 | **S2 연동 = 동기 REST + 보상**. 이벤트 인프라 없이 기존 slip→inventory 동기 호출 패턴을 확장한다. inventory 호출 실패 시 slip 트랜잭션 롤백 + 인스턴스 배치 멱등으로 재시도 수렴. |
| D-SER-06 | **트리거 = 기존 `SlipService.complete()` INBOUND 루프 확장**. 라인별 product `serialManaged` 판정 후 serial → `POST /inventory/instances/batch`, batch → 기존 `/inventory/lots/inbound`. 혼합 전표는 라인 단위 분기. |
| D-SER-07 | **시리얼 데이터 = 자동 UUID 인스턴스만**. 수량 N개 입고 시 제조 시리얼번호 입력 없이 `stock_instances` N행을 AVAILABLE 로 생성한다. 실 제조 시리얼 수집은 후속. |
| D-SER-08 | **inboundType 판정 = `slip.deliveryTag`**. BORROW→"차용", tag 없음/일반→"구매". RETURN/RETURN_TRIP(회수)은 S4 범위라 S2 complete 에서 409 CONFLICT 가드. |
| D-SER-09 | **S3 출고연동 생명주기 A안**(개발책임자). accept→인스턴스 FIFO 예약(AVAILABLE→RESERVED, source창고, 재고부족 409 사전차단), complete→출고(RESERVED→SHIPPED + 출고처/일시), reject·cancel(직전 ACCEPTED)→예약 해제(RESERVED→AVAILABLE). batch 라인은 기존 수량 경로(reserve/deduct/release) 무변경. |
| D-SER-10 | **ship 가드 확장 = AVAILABLE\|RESERVED→SHIPPED**(직접 출고 + 예약 후 출고 모두 허용). `reserve(outboundSlipNo)` 마커로 전표 추적, `release()` 시 마커 클리어. |
| D-SER-11 | **reserveBatch 재고부족 = 후보 목록 크기 단일 판정**(count 쿼리 제거). advisory lock(`outboundSlipNo\|productCode`)이 동일 전표만 직렬화하므로, 다른 전표의 동시 소진 TOCTOU 로 인한 IndexOutOfBounds(500)를 후보 목록 크기로 사전차단. (Claude 5-agent P0 fix) |
| D-SER-12 | **accept 혼합전표 동기 REST 보상**. serial/batch 라인 예약을 순차 호출하되 중간 실패 시 이미 성공한 원격 예약을 역순 release/releaseInstances 보상(보상 실패는 `addSuppressed`). product-service 에 `POST /internal/products/lookup-by-code` 신규(productCode 단건조회, inventory `requireExistsByCode` 소비 — plan 무변경 가정 정정). 배포순서 product→inventory→slip. (Codex cross-check P1 fix) |
| D-SER-13 | **S4 회수 = `recall()` SHIPPED→RECALLED**(S1 도메인 재사용 + recallSlipNo 마커). 회수품 재판매(RECALLED→AVAILABLE)는 본 슬라이스 descope(후속 검수/재입고). ⚠️ 개발책임자 확인 권장(회수품 재판매 정책). |
| D-SER-14 | **회수 역-FIFO = `outbound_partner_code` + `product_code`, `outbound_at DESC` + `id ASC` tie-break**. 가장 최근 출고분부터 회수(LIFO), source 창고 무관(출고처 거래처 기준). |
| D-SER-15 | **회수 트리거 = `SlipService.complete()` INBOUND RETURN/RETURN_TRIP**. S2 의 409 가드 해제 + serial→recallInstances / batch→수량복원. S3 출고연동 대칭. |
| D-SER-16 | **회수부족 409 후보크기 단일판정**(S3 D-SER-11 TOCTOU 패턴) + recall_slip_no 마커 멱등(V18 컬럼/인덱스). ⚠️ **동시성·보상 인프라 후속(Codex cross-check P1)**: completeRecallInbound un-recall 보상 / recallBatch 다른 전표 동시 후보 경합 — **S3 reserveBatch 공통**, "시리얼 동시성·보상 강화" 후속 슬라이스 + 개발책임자 결정 대기. |
| D-SER-17 | **후보조회 PESSIMISTIC_WRITE row lock**. `reserveBatch` 의 productCode+warehouse+AVAILABLE FIFO 후보와 `recallBatch` 의 partnerCode+productCode+SHIPPED 역-FIFO 후보를 `@Lock(PESSIMISTIC_WRITE)` JPQL(`SELECT ... FOR UPDATE`) 변형으로 전환한다. advisory lock은 전표별 멱등(`slipNo|productCode`) 담당, row lock은 서로 다른 전표가 같은 후보 행을 동시에 선택하는 경합 담당으로 병행한다. |
| D-SER-18 | **recall 역전이 보상 = unrecall**. `StockInstance.unrecall()` 은 RECALLED→SHIPPED 로 되돌리고 `recall_slip_no` 만 제거하며 outbound 마커는 유지한다. inventory `POST /inventory/instances/unrecall-batch` 와 slip `InventoryClient.unrecallInstances` 를 추가하고, `completeRecallInbound` 는 serial recall 성공 후 batch inbound 실패 시 S3 accept 와 같은 역순 보상(addSuppressed)을 실행한다. |
| D-SER-19 | **ForUpdate 후보조회 `LIMIT :deficit`**. reserve/recall/unrecall 의 PESSIMISTIC_WRITE 후보조회에 `Pageable`(`PageRequest.of(0, deficit)`)를 전달해 거래처+품목 전체 N행이 아닌 deficit 행만 `FOR UPDATE` 잠근다. LIMIT 결과가 deficit 미만이면 기존 부족판정(409)·멱등(already) 정합 유지. (#349 DevOps P1 후속) |
| D-SER-20 | **Flyway V19 `ix_stock_instances_fifo_wh`** = `(product_code, warehouse_id, status, received_at) WHERE is_deleted = FALSE` 부분 인덱스. reserve FIFO ForUpdate 의 warehouse 조건까지 인덱스에서 제한(실 EXPLAIN `Index Scan` 확인). V16/V17 부분 인덱스 컨벤션 일관·bloat 방지. |
| D-SER-21 | **`lock.timeout` 명시(`@QueryHints` 3000ms) + PG 실적용 검증 결과**: PostgreSQL 16 은 트랜잭션 `SET LOCAL lock_timeout` 을 수용하나, `FOR UPDATE WAIT n` 구문 부재로 Hibernate `PostgreSQLDialect` 가 `jakarta.persistence.lock.timeout` 힌트를 **PG 에 자동 발행하지 않음(no-op, BE cross-check 지적이 정확)**. 실 동시성 방어는 **advisory lock(키별 직렬화) 1차 + LIMIT deficit 락범위 축소**가 담당하므로 무한 대기 위험이 실질 차단됨. hard statement-level lock_timeout 강제는 후속(P2: native `SET LOCAL` 또는 datasource `connection-init-sql`). 머지 비차단(설계 수준 한계). |
| D-SER-22 | **동기 REST 보상 실패 관측·영속 (분산 보상 견고화 ⓑ)**. `addSuppressed` 조용한 삼킴 → (1) 구조적 WARN 로그 `[COMPENSATION_FAILURE]` (2) slip 측 `serial_compensation_failures`(V31) append-only 감사 1행을 `@Transactional(REQUIRES_NEW)` 독립 커밋(원본 롤백과 분리)으로 영속. 보상 실패의 전형 원인이 inventory 도달 불가이므로 inventory `stock_movements` 가 아닌 **호출자(slip) 측 영속**이 정합. `accept`(ACCEPT_RESERVE)·`completeRecallInbound`(COMPLETE_RECALL) 보상 루프를 공통 헬퍼로 추출, **serial·batch 보상 공통 적용**(동일 미관측 위험). 운영 알림(notification-service 푸시)·복구 API·자동 재시도(outbox/Saga)는 후속. D-SER-05 한계는 "관측·복구단서"까지 1차 완화. slip-service 단독(inventory 무변경). |
| D-SER-23 | **보상 실패 복구 API + 운영자 화면 (ⓑ 후속)**. `serial_compensation_failures` 를 운영자가 조회(GET `/api/v1/slips/compensation-failures?resolved=false`, 페이지)·수동 정합 완료 표시(PATCH `/{id}/resolve` → `SerialCompensationFailure.resolve()` resolved=true 전이, 멱등)하는 복구 루프. `@RequirePermission(inventory.list, VIEW/UPDATE)`. 응답 `CompensationFailureResponse` 는 **slipId 미노출**(UUID 비공개 — slipNo 만). desktop `CompensationFailuresPage`(목록+해소 다이얼로그, design-system 재사용) + 사이드바 진입 + PermissionGuard. retention 자동 스케줄러는 **descope**(운영 가이드 문서화 — 90일 경과 resolved 정리, 무한누적은 resolve 표시로 식별). slip(BE)→desktop(FE). |
| D-SER-24 | **시리얼 회수품 재판매 (RECALLED→AVAILABLE)**. D-SER-13 descope 분 구현(개발책임자 결정). `StockInstance.resell()` RECALLED→AVAILABLE + 마커 클리어(recall_slip_no/outbound 3-필드 null) + `received_at=now()`(재입고 시점 FIFO 재진입). **검수 후 운영자 명시 액션**(자동 전환 아님). inventory `POST /inventory/instances/resell-batch`(recallSlipNo+productCode+quantity, RECALLED 후보 < quantity 면 409 후보크기 단일판정, advisory+row lock, 멱등). inventory 단독(slip 무변경 — 전표 트리거 연동은 후속). |
| D-SER-25 | **보상 실패 retention 스케줄러 (ⓑ 후속, D-SER-23 descope 분 구현)**. `serial_compensation_failures` 무한 누적 방지 — `CompensationRetentionScheduler`(@Scheduled cron) 가 `resolved=true AND created_at < now-retentionDays` 행을 **soft-delete**(BaseEntity is_deleted, 복구가능·영구삭제 아님). `@ConditionalOnProperty(samhan.compensation.retention.enabled, 기본 비활성)` — 운영 명시 활성. `application.yml` retention-days(기본 90)/cron 설정. **미해소(resolved=false)·보존기간내 행은 절대 정리 안 함**. Clock/cutoff 주입(date-bomb 회피). slip-service 단독. |
| D-SER-26 | **보상 실패 운영 알림 푸시 (ⓑ 후속, #351 TODO seam 연동)**. `CompensationAuditWriter.record()` 가 감사 행 저장 성공 후 `CompensationAlertNotifier` 를 호출해 운영자에게 **best-effort push** 발송. 기존 `NotificationClient.sendUserPush` 재사용(신규 client 금지). **config-gated**: `samhan.compensation.alert.{enabled(기본 false), recipient-user-id}` — 운영에서 enabled=true + recipient 지정 시에만 발송. **best-effort**: 알림 발송 실패는 모두 삼켜(WARN 로그만) 보상 감사/전표 흐름에 무영향. 알림 본문은 **UUID 비공개** — slipNo·품목코드 등 비즈니스 식별자만. slip-service 단독. |
| D-SER-27 | **보상 실패 자동 재시도 (outbox/Saga, ⓑ 보상 saga 완성)**. 미해소 시리얼 보상 실패를 주기적으로 자동 재실행해 성공 시 자동 해소. **V32**: `serial_compensation_failures` 에 `retry_count/last_retry_at/next_retry_at` 추가(append-only 본문 불변, 재시도 상태만). 디스패치: `RELEASE_INSTANCES`→`releaseInstances(slipNo,productCode)`, `UNRECALL_INSTANCES`→`unrecallInstances(slipNo,productCode)`(저장 필드로 재시도 가능). 수량형(RELEASE/RESERVE)은 식별자 부족 → **자동 재시도 제외(skip+WARN, 수동 정합 유지)**. `CompensationRetryService`(best-effort, 개별 실패가 배치 중단 X, 지수 백오프 next_retry_at) + `CompensationRetryScheduler`(@Scheduled cron+zone, `@ConditionalOnProperty(samhan.compensation.retry.enabled, 기본 false)`, Clock 주입). `findRetryCandidates`(resolved=false AND retry_count<max AND next_retry_at≤now). **멱등**(inventory unrecall/release advisory+row lock #349) — 중복 재호출 안전. max-retries 도달 시 자동 재시도 중단(resolved=false 유지, 수동 정합). slip-service 단독. |

**산출(S1)**: product V9 `categories.serial_managed` + Category 도메인 + ProductSummaryResponse + HvacProductSeeder markSerialManaged. inventory V15 `stock_instances` + StockInstance(Status) + Repository(FIFO/역-FIFO/findByProductId) + Service(serial_managed 가드 409) + Controller(/inventory/instances) + seeder + IT 12. batch 품목은 기존 stock_lots/balances 무변경. 5-team 사이클 N=2 APPROVE. CI green(skipped=0). Docker 실 QA PASS(인스턴스 201/batch 409/FIFO ASC/psql cross-DB). 배포 product(V9)→inventory(V15), 순서 위반 시 serialManaged=false 안전 degrade. dev-report `docs/dev-reports/slice-inv-s1-serial-instance.md`.

**산출(S2, 2026-06-01)**: inventory V16 `(inbound_slip_no, product_id)` partial non-unique index + `StockInstanceService.inboundBatch` count 기반 deficit 멱등 + `POST /inventory/instances/batch`. product internal lookup `serialManaged` 기존 전파 확인. slip `ProductSummary.serialManaged` 매핑 + `InventoryClient.inboundInstances` + `SlipService.complete()` INBOUND serial/batch 분기 + RETURN/RETURN_TRIP 409 가드. 테스트: inventory service batch 단위 PASS, slip ProductClient/InventoryClient/SlipService 단위 PASS, Testcontainers IT는 로컬 Docker 감지 실패로 skip. dev-report `docs/dev-reports/slice-inv-s2-inbound.md`. 후속: S3 출고, S4 회수, 2.6c 수량 reserve↔인스턴스 RESERVED 통합.

---

### D-GW-CORS. 게이트웨이 ↔ arologis CORS 중복 헤더 dedup (2026-06-01)

**배경**: arologis-service 는 게이트웨이 우회 직접접근(:8097)용 자체 Spring Security CORS 를 보유. 이 `.cors()` 가 게이트웨이 **경유** 2xx 응답에도 발동 → 게이트웨이 전역 `CorsWebFilter` 의 ACAO/ACAC 와 중복(×2) → 브라우저/Electron `multiple values` 차단. #322 와 같은 2026-05-30 게이트웨이 경유 실 QA 에서 발견됐으나 머지 누락(실행 이미지엔 반영, git 미커밋)된 1행 후속 수정.

| 결정 | 내용 |
|---|---|
| D-GW-CORS-01 | 게이트웨이 `spring.cloud.gateway.default-filters` 에 `DedupeResponseHeader=Access-Control-Allow-Origin Access-Control-Allow-Credentials, RETAIN_UNIQUE` 추가. 전 라우트 응답에서 ACAO/ACAC 중복 제거(유일값 유지). 양쪽이 요청 Origin 을 동일 반영하므로 단일화 안전. 서비스 직접접근(:8097) 자체 CORS 는 게이트웨이 미경유라 보존. 자체 CORS 미설정 서비스는 ACAO 1개뿐이라 무영향(회귀 0). 대안 `RETAIN_FIRST`/서비스측 CORS 제거는 직접접근 시나리오 훼손 또는 동등하므로 기각. |

**산출**: `services/api-gateway/.../application.yml` default-filters 1행(+주석). Flyway/DB 무변경 = 게이트웨이 config-only 단독 재배포. **Docker 실 QA**: before(dedup 없는 소스 재빌드) arologis 경유 ACAO/ACAC=2(중복) → after(커밋 소스 재빌드) =1(단일), 비-arologis(권한/회계)·preflight 회귀 0(`docs/qa/gateway-arologis-cors-dedup/real-qa-evidence.md`). dev-report `docs/dev-reports/fix-gateway-arologis-cors-dedup.md`. 후속(비차단): arologis 자체 CORS 를 직접접근 전용 조건으로 한정하면 중복 근본 제거.

---

### D-3D. SlipFormPage 재고모달 일원화 + 목록 배지 갱신 E2E (2026-06-02, PR #343)

**배경**: 2.6d(#335) 신 공용 `InventoryLookupModal`(가용/실/예약)은 상세 페이지에만 배선되고, 작성 페이지(`SlipFormPage`)는 구 `StockBalanceModal`(총량+합계)을 유지 → 재고 모달 2개 분기 + 작성 페이지 정보 빈약.

| 결정 | 내용 |
|---|---|
| D-3D-01 | **작성 페이지 재고모달을 신 공용 `InventoryLookupModal`(가용/실/예약)로 일원화**, 구 `StockBalanceModal` + `fetchStockBalanceBatch` 데드코드 제거. 신 모달은 자체 페치(`useQuery`)라 폼의 페치 state/mutation/창고컬럼 memo 불필요. 스냅샷은 모달 열린 채 라인 편집 시 표 흔들림 방지용으로 유지. |
| D-3D-02 | **슬라이스 범위 = 모달 일원화 + 목록 배지 갱신 E2E(둘 다)**. 배지 E2E 는 병합 후 `invalidateQueries(['partner-orders'])`가 수동 새로고침 없이 목록을 갱신함을 검증(mock 상태보존으로 CONVERTED 모사). |
| D-3D-03 | **합계(실재고 총합) 컬럼 생략**. 전환은 특정 창고 기준이며 합계는 각 창고 셀(가용/실/예약)로 파악. 상세 모달과 100% 동일 UX 우선. |

**산출**: `SlipFormPage` 모달 교체 + 데드 state/mutation/memo 제거. design-system `StockBalanceModal`(4파일)+배럴 export 삭제, `inventory.ts` `fetchStockBalanceBatch`/타입 제거(`ProductBalanceResponse` 유지). `mock.ts` `mockConvertedOrderNos` 상태보존 + 목록 CONVERTED 반영. 신규 Playwright `partner-order-list-badge-refresh` + `d2-6d` 시나리오 12 일원화 회귀. 순감 –818/+57. **dual 5-agent(Claude+Codex) P0/P1 0 수렴**, CI green. dev-report `docs/dev-reports/slice-3-d-slipform-stock-modal-unify.md`. **후속**: 신규 desktop Playwright 스펙 CI 자동실행 = item 3-A2(별도). 머지 게이트 = Docker 실 QA(구-시드 reseed 선결).

---

### D-3A2. desktop Playwright CI hard gate (2026-06-02, PR #344)

**배경**: `clients/desktop/playwright/**` 77 스펙이 어떤 CI 잡에서도 미실행(`qa-e2e.yml` 은 별도 `qa/playwright` 만, `frontend-desktop` 은 typecheck/build 만, tsconfig 도 playwright 미포함) → 3-D 추가 `partner-order-list-badge-refresh` 등 회귀 가드가 green 이어도 0회 실행([[feedback_ci_test_filter_false_green]] 계열).

| 결정 | 내용 |
|---|---|
| D-3A2-01 | 게이트 범위 = **mock 회귀 스펙**(VITE_MOCK_MODE headless)만. 실QA/manual 캡처 스펙 제외. |
| D-3A2-02 | 큐레이션 = **opt-out 컨벤션**(testIgnore: manual/full-qa/audit/phase-2-4-real-qa/`*-real-qa`/full-menu-contract — 그 외 전부 실행). allowlist 금지 → 신규 mock 스펙 자동 게이트. |
| D-3A2-03 | 트리아지 잔여 실패는 **투명 격리 허용**(testIgnore QUARANTINE 블록 + dev-report 추적, 은폐 금지). |

**산출**: `playwright.config.ts`(testIgnore opt-out + 크로스플랫폼 webServer `env:{VITE_MOCK_MODE}` + `workers:CI?2:1` + CI json reporter) + `qa-e2e.yml` `desktop-playwright` 잡(`npx playwright test`, `|| true` 금지 = hard gate) + `scripts/assert-playwright-ran.mjs`(silent-skip 가드: expected==0 실패) + `playwright/README.md`(컨벤션). **트리아지**: load-error 복구(`__dirname` ESM shim/sp-09-5 문법/full-menu-contract 제외) → 수집 0→416 → 로컬 전수 335 pass/77 fail(39 레거시 파일)/4 skip → **39파일 투명 격리** → 게이트 171 tests green(핵심 mock 회귀 24 tests 포함). **후속(추적)**: 격리 39 레거시 스펙 수리(동적RBAC sp-d*/정적계약 sp-08·09/드리프트UI). dev-report `docs/dev-reports/slice-3-a2-desktop-playwright-ci-gate.md`.

---

### D-AAC. 공용 AsyncAutocomplete<T> 추출 (2026-06-02, PR #345)

**배경**: ProductAutocomplete(450)·PartnerAutocomplete(465)가 async 서버검색 typeahead로 95% 중복.

| 결정 | 내용 |
|---|---|
| D-AAC-01 | 추출 범위 = Product + Partner(async)만. WarehouseAutocomplete/Selector(sync 변형)는 별도 평가. |
| D-AAC-02 | 제네릭 `AsyncAutocomplete<T>`(어댑터 getKey/getInputLabel/renderOption/listboxLabel/matchExact) 추출, 기존 두 컴포넌트는 **얇은 wrapper로 보존**(공개 API·타입·소비처 불변). |
| D-AAC-03 | CSS 통합 시 **focus-ring 토큰(`--focus-ring-brand`/`--focus-ring-danger`) 채택** — Product 하드코딩 rgba 제거, AC-2 백포트 흡수. |

**산출**: `AsyncAutocomplete/{tsx,module.css,index.ts}` 신규(제네릭 430) + Product/Partner wrapper 축소(87/93) + 구 css 2개 삭제 + barrel export. 순감 900→610. 공개 API 불변 → SlipFormPage·LineRow 0 변경. **dual(Claude 2-agent + Codex) P0/P1 0 수렴**(P2 tabular-nums fix). **CI 29/29 green** — item 3-A2 게이트가 ac-2/ac-3 회귀 통과로 동작 불변 실증. dev-report `docs/dev-reports/slice-item2-async-autocomplete.md`. 후속: Warehouse 변형 통합 평가, 단위 테스트 보강.

---

### D-SPD1. sp-d1 권한설정 재게이트 + 한글화 + 한국어 404 (2026-06-04, PR #386)

**배경**: sp-d1 동적 RBAC 화면이 role-grid → account-select 재설계되며 구 스펙 obsolete → testIgnore 격리(3-A2-④ B/C 잔여 마지막 1건). 세션 중 개발책임자가 액션 한글화 + "권한 매트릭스"→"권한설정" + 한국어 404 추가 지시.

| 결정 | 내용 |
|---|---|
| D-SPD1-01 | sp-d1 스펙 account-select 신 UI + in-process mock 정합 전면 재작성(page.route/waitForTimeout 0), testIgnore 정식 해제. T1~T6 strict(false-green 0). |
| D-SPD1-02 | 액션 라벨 한글 = 보기/생성/수정/삭제/복원/**엑셀**(엑셀 내보내기)/**인쇄**(프린트 출력). 메뉴·페이지명 "권한설정". 라우트 `/admin/permission-matrix`·testid **불변**(내부 식별자, 회귀 방지). |
| D-SPD1-03 | 미매칭 URL → 한국어 `NotFoundPage`(catch-all `*` 2곳: AppLayout/AdminLayout children 말미). `/admin/*` 미매칭은 AdminLayout MASTER 가드 선점(/forbidden) — 의도. |

**산출**: 스펙 재작성 + `NotFoundPage.tsx` 신규 + catch-all 2곳 + `PermissionMatrixPage`/`AppLayout` 한글화. **dual 5-team(Claude 5-agent + Codex 5-섹션) 사이클 1~2 — 전 팀 APPROVE 수렴**(Claude fix: T4 fallback·T2 고정셀·T6 strict·waitForTimeout·JSDoc / Codex fix: T1 ≥700+대표5셀·T5 404strict / 사이클2: 한국어404·T2 element 증빙). sp-d1 6/6 green, 회귀(sidebar-disabled 5/5·permission-overhaul 4/4·sp-d4 20/20), tsc 0. dev-report `docs/dev-reports/slice-sp-d1-rbac-regate.md`. **후속(P2)**: mock id UUID화·mock PageCode 카탈로그 동기화·BulkPage 한글화 consistency. → **3-A2-④ B/C triage 완결.**

---

### D-PGC. 동적 권한그룹 Phase C2a — redundant 외부 RoleGuard 제거 (2026-06-06)

**배경**: desktop `routes/index.tsx` 의 다수 라우트가 이중 가드(`<RoleGuard allow={ROLES}><PermissionGuard pageCode=...>`). 동적 권한그룹(Phase A/B) 철학상 seed/그룹 grant 가 단일 진실원이므로 외부 RoleGuard 는 redundant.

| 결정 | 내용 |
|---|---|
| D-PGC-01 | **widening 정책 = Option A(seed 진실원 수용, 개발책임자 2026-06-06)**. 일부 RoleGuard 가 seed grant 보다 제한적(예: `AUDIT_ROLES=[WAREHOUSE,MASTER]` vs `inventory.audit` seed=MASTER/MANAGER/ACCOUNTANT/WAREHOUSE/INVENTORY)이나, BE API 가 이미 해당 role 에 열려 있어 보안 신규 노출 아님(FE↔BE 정합). RoleGuard 제거 → PermissionGuard 단일 게이트. #387 inventory Option A(D-PAM-05) 연장. |
| D-PGC-02 | 제거 대상 = **내부 PermissionGuard 를 감싸는 외부 RoleGuard 75건**. RoleGuard 단독(PermissionGuard 미병행) 22건은 **유지**(C2b 후속, page-code 매핑 후 전환). 상세페이지 버튼 ROLES·AdminLayout 부서 가드는 C2c. |
| D-PGC-03 | MASTER 전용 라우트(`/admin/permission-groups/delegation`=system.permission-admin 등)는 PermissionGuard(MASTER-only) 로 비-MASTER 차단 유지. **접근 차단 동일, UX 만 RoleGuard 메시지→홈 redirect(404 효과)**. `permission-delegation.spec.ts` 단언을 redirect 로 갱신. |

**산출**: `routes/index.tsx` RoleGuard 75 제거 + ROLES 상수 정리(237++/460--), `permission-delegation.spec.ts` 단언 갱신. typecheck 0, Playwright 회귀 sidebar-disabled 5+sp-d1 6+sp-d4 20+permission-groups 5 = **36 passed**(delegation 실 회귀 적발·수정). spec `2026-06-06-permission-groups-phase-c2a-roleguard-removal-design.md`, dev-report `slice-phase-c2a-roleguard-removal.md`. **후속**: C2b(gap 22 라우트), C2c(버튼/부서 가드).

### D-PGC (C2b 추가, 2026-06-06) — 단독 RoleGuard gap 라우트 전환 + mock 카탈로그 동기화

| 결정 | 내용 |
|---|---|
| D-PGC-04 | C2b = PermissionGuard 미병행 단독 RoleGuard **19 라우트 전환**(page-code seed 실재 검증 후), **보류 3**(/sales/vendor-order-upload·/sales/closing·/admin/sheet-sync — BE 미구현/page-code 미확정, RoleGuard 유지). page-code 미존재 시 PermissionGuard 전원 차단 치명 → 전환 전 seed 교차검증 필수. |
| D-PGC-05 | **mock 권한 카탈로그 동기화 = C2b 필수 동반.** PermissionGuard 는 mock 모드에서 `permissions/my` mock(SP_D1_PAGES+DEFAULT_VIEW/EDIT)으로 판정 → 전환 page-code 12개를 auth seed 의 역할별 can_view/can_edit 그대로 추가(MASTER 자동 전권). 미동기화 시 mockRole-only 진입 테스트 전원 redirect(ac-2/ac-3 등 19 spec). 핸드오프 P2 "mock PageCode 카탈로그 동기화"를 흡수. |

### D-PGC (C2c 추가, 2026-06-06) — 상세페이지 버튼 동적 권한 전환 (C2 FE 완료)

| 결정 | 내용 |
|---|---|
| D-PGC-06 | 상세페이지 액션 버튼 정적 역할 게이트(`*_ROLES.includes(role)`) → `usePermissions().canAccess(pageCode, action)` 동적 전환(4파일 10상수). 버튼은 UX, 실제 차단은 BE @RequirePermission. mock 카탈로그에 5 page-code(purchases.slip.edit/delete·sales.slip.edit·sales.partner-order.edit/convert) seed 정확 추가(D-PGC-05 동일 패턴). **AdminLayout 부서(EXECUTIVE_OFFICE) 가드는 유지**(조직 정책 = page-code 직교, C2 비목표). → **C2(FE 고정역할 게이트 제거) 완료**(C2a/C2b/C2c). |

### D-PGC (C3a + C4/C5 보류, 2026-06-06 야간)

| 결정 | 내용 |
|---|---|
| D-PGC-07 | C3a = 역할 변경 시 빌트인 role-group 자동 동기화(AuthService.updateAccountRole/registerWithId → syncBuiltinRoleGroup + materialize). role↔group 발산 해소(C5 교량). 시스템그룹 가드 우회 internal 경로, 수동그룹 보존, MASTER bypass 불변(materializer systemMaster skip). **Option A(role 드롭다운 UX 유지, 그룹 동기화)** — Option B(그룹배속 UI 대체)는 개발책임자 결정 대기. |
| D-PGC-08 | **C4·C5 자율 머지 보류**(PM 판단, 개발책임자 취침). C4(isMasterBypass role→is_system_master)가 JWT 클레임+게이트웨이 헤더+전 14서비스 필터 변경 필요 = C5 핵심 인프라 결합. spec §6 "한 세션 강행 금지(락아웃)" + 락아웃 시 대응 불가 → 계획서(`plans/2026-06-06-...-c4-c5-execution-plan.md`) 준비 후 개발책임자집중 세션 권장. 기능 목표는 A/B 로 달성, C4/C5=enum 물리제거(긴급도 낮음). |

### D-PGC (C3b Option B, 2026-06-06)

| 결정 | 내용 |
|---|---|
| D-PGC-09 | 개발책임자 "123 순서" ① — C3 Option B 채택. UsersPage 역할변경(RoleChangeModal 단일 role 드롭다운) → GroupAssignModal(권한그룹 배속). 빌트인 role-group 이 primary(그룹→role 역매핑 BUILTIN_GROUP_ROLE_MAP, V43 `...01XX`) → updateAdminUserRole(C3a 동기화). 추가 커스텀 그룹 multi-assign(Phase A permissionGroupsApi 재사용). accounts.role = 기본 그룹 파생 스냅샷(C5 전 JWT 호환), multi-role 미지원(단일 primary). BE 무변경(role 파생 FE). full multi-role 은 C5 후. |

### D-PGC (C4, 2026-06-06)

| 결정 | 내용 |
|---|---|
| D-PGC-10 | C4 = MASTER bypass 키에 **is_system_master 그룹 경로 추가**(additive). `isMasterBypass = (X-Is-System-Master=="true") OR (role=="MASTER")` — 새 경로 추가, role 폴백 **유지**(락아웃 0). JWT isSystemMaster 클레임(JwtTokenProvider 6-arg 오버로드, 기존 보존)→게이트웨이 X-Is-System-Master 헤더→PermissionAspect OR. auth-service login 이 `existsByAccountIdAndSystemMasterTrue` EXISTS 로 산출. C3a 불변식(systemMaster 그룹 ⟺ role==MASTER) 토대. role 폴백 제거=C4-3(후속). 전 14서비스 compile SUCCESSFUL, Docker 실QA 의무. |

### D-PGC (C5-1, 2026-06-06)

| 결정 | 내용 |
|---|---|
| D-PGC-11 | 개발책임자 다중그룹 표현 정책 = **JWT/헤더 그룹 집합 전파**. C5-1 = 그 인프라 additive 부설 — JWT `groups` 클레임(JwtTokenProvider 7-arg, 기존 보존) + 게이트웨이 `X-User-Groups` 헤더(소비처 0, behavior-preserving, 락아웃 0). AuthService.login 이 account_groups comma-join 산출. **C5-2(소비/X-User-Role·role 클레임·accounts.role 제거, FE role 헬퍼/~86파일 그룹 재설계)는 폴백 없는 총 락아웃 위험 → 전 서비스 동시 cutover + DB 백업 + 롤백 + 개발책임자 입회 집중 세션**(계획서 §7, 자율 금지). |

### D-PGC (C5-2b, 2026-06-06)

| 결정 | 내용 |
|---|---|
| D-PGC-12 | C5-2a 정찰 = 백엔드 사용자 경로 @PreAuthorize(hasRole) 이미 0(전부 INTERNAL/arologis 유지). C5-2b = **FE 인가용 role 의존 → canAccess(pageCode) 이관**. session.ts 헬퍼 4 제거(canCreateSlip/canInspectInbound/canQuerySales/canCreateTransfer) + 직접 role==='MASTER' 5 이관(slip.signature/dc-config.import/partners.block.bulk/arologis.region.manage/system.permission-admin, BE @RequirePermission 대조). 표시용 role·hasAdminRole(coarse)·canTransition*(action 복합)·C2b 보류·AdminLayout 부서가드 유지. 일부 Option A widening(D-PGC-01 일관). source-contract 4 갱신(헬퍼 단언→canAccess). 잔여 = hasAdminRole/canTransition page-code 확정·PARTNER/arologis·C4-3·최종 X-User-Role/role/accounts.role 제거(개발책임자 입회 cutover). |

### D-PGC (C5-2c, 2026-06-06)

| 결정 | 내용 |
|---|---|
| D-PGC-13 | C5-2c = FE 잔여 인가 헬퍼(hasAdminRole/canTransitionSlip/canTransitionTransfer) → action별 canAccess(pageCode,action) 이관(BE @RequirePermission 정밀 대조 — C5-2b page-code 불일치 교훈). slipActionPageCode/transferActionPageCode exhaustive 매핑. hasAdminRole→inventory.warehouse.admin(DEVELOPER 제외=FE>BE 교정). dual P1(삭제 버튼 canAccess('sales.slip.cancel') 가드 누락 → FE노출/BE403)+P2(EOF) 수정. mock 5 page-code seed 정합 보강. 전체 suite 418 passed. → **FE role 인가 의존 거의 소진**(표시용 role·canQuerySales[BE 가드 불일치로 유지]만 잔존). C5 잔여 = 입회 cutover(C4-3·PARTNER/arologis 정책·X-User-Role/accounts.role 제거). |

### D-AROLO-HR (Phase B, 2026-06-08)

| 결정 | 내용 |
|---|---|
| D-AROLO-HR-01 | arologis-desktop = 아로로지스 행정직원 전용 백오피스(Samhan Public 축소판). 자체 마스터/auth 기구축(V9). 신규 = 인사·회계·권한관리UI, 순서 B(인사)→C(간이회계)→A(권한UI). |
| D-AROLO-HR-02 | **직원↔계정 1:1 통합** — ArologisEmployee 생성 시 AdminUser 자동 provisioning(BCrypt 임시pw 1회반환), 퇴직 시 양쪽 soft-delete. **롤 = 기존 AROLOGIS_MASTER/MANAGER 2롤 유지**, 인사 접근은 page-code `arologis.hr.*` 통제(롤 세분화 안 함). RoleChangeHistory(changedByLoginId) 포함. |
| D-AROLO-HR-03 | **권한 grant = 중앙 auth-service 공유 유지**(arologis 는 이미 권한체크 auth 위임, 독립은 계정뿐). arologis.hr.* → `role_page_permissions`(arologis.admin V10 컨벤션, 중앙 DynamicPermissionService 무변경). `arologis.*`/`AROLOGIS_*` 네임스페이스 분리 → 향후 "auth 없이 단독 운영" 필요 시 해당 행만 arologis-service 이관(문 열어둠). |
| D-AROLO-HR-04 | 보안: **AROLOGIS_MASTER 생성/승격은 actor=AROLOGIS_MASTER 한정**(MANAGER self-escalation 차단). UUID 비노출(changedByLoginId=loginId). 부서 삭제 현직 배속자 가드 409. login_id race→409. |

### D-AROLO-ACCT (계정과목 표준차트 + 활성상태, 2026-06-09)

| 결정 | 내용 |
|---|---|
| D-AROLO-ACCT-01 | arologis 백오피스 실 운영 seed 확정(개발책임자). **삼한 퍼블릭 아닌 아로로지스 독립 운영**. 부서 = **대표실/행정팀/회계팀 3개**(V17, 배차/운영 soft-delete). |
| D-AROLO-ACCT-02 | 계정과목 = **일반기업회계기준 표준계정과목 5유형 전체 101개**(V17). `arologis_simple_account.type` CHECK 4→5유형(**자본 EQUITY 추가**) — 미확장 시 EQUITY INSERT 거부([[enum-expansion-check-constraint]]). 코드 4자리(1xxx 자산·2xxx 부채·3xxx 자본·4xxx 수익·8xxx 비용). 운송업 상용만 active=TRUE, 나머지 active=FALSE(데이터 보존, 드롭다운 숨김). |
| D-AROLO-ACCT-03 | **활성상태 관리 = 신규 page-code `arologis.accounting.accounts`**(현금출납장 cashbook 과 분리). 권한 = 대표실·회계팀 → **마스터·회계사원만 V/E**(V54), 매니저는 거래 입력 가능하나 계정 마스터 관리 제외(권한 격리). FE canManageAccounts(MASTER\|ACCOUNTANT) + BE @RequirePermission 이중 방어. |
| D-AROLO-ACCT-04 | 스코프 = 표준차트 고정 → **활성상태 토글만**(계정 CRUD 아님). UI 표기 = `active` 미노출 **"활성상태"**(개발책임자 지시). |

### D-AF3 (arologis-desktop 백오피스 page-code canAccess 정렬 — 후속3, 2026-06-22~23, PR #569)

| 결정 | 내용 |
|---|---|
| D-AF3-01 | arologis-desktop 5 백오피스 페이지(Employees/Departments/Cashbook/Accounts/Permissions)의 FE 접근 게이팅을 **롤 하드코딩 → page-code canAccess** 로 정렬(spec §4.2 2026-06-08 "인사/회계 접근은 page-code 권한으로만 통제" 실현). 메인 desktop 패턴(permissionsApi/usePermissions/PermissionGuard) 복제. ※ 정찰 premise 정정: "5 page-code 미배선(0파일)"은 grep false-negative 오판 — 5페이지 전부 존재·머지(#426~#433). |
| D-AF3-02 | canAccess 진실원 = 신규 BE `GET /admin/arologis/permissions/my`(`@PreAuthorize isAuthenticated`, 본인 effective arologis.* 권한). 신규 auth 엔드포인트/Flyway **0** — 기존 `AuthPermissionAdminClient.getRoleMatrix("arologis.")` 재사용(arologis-desktop은 게이트웨이 우회 :8097 직접호출이라 메인 `/auth/admin/permissions/my` 불가). |
| D-AF3-03 | FE page-code/action = BE `@RequirePermission` **정확 일치**(테마틱 금지·FE>BE widening 금지, [[fe-canaccess-pagecode-be-match]]). employees/departments/cashbook=view/CRUD, accounts/permissions=view/update. |
| D-AF3-04 | `canGrantMaster`(EmployeesPage "MASTER 롤 부여 옵션" 게이트)는 page-code 아닌 **롤-부여 정책**이라 유지. page/메뉴/CRUD 게이트만 canAccess 이관. |
| D-AF3-05 | **회계(cashbook) 메뉴가 ACCOUNTANT/DEVELOPER에 노출되는 변화 = BE seed(V51/V53) 이미 grant 중인 정책에 FE 정합하는 결함 수정**(회계사원이 권한 있는 회계 메뉴를 못 보던 버그). [[pgc-c2-widening-option-a]] seed=진실원 선례. ⚠️ 사용자 가시 widening → 개발책임자 확인([[pm-permission-autonomy]] "widening 수용" 멈춤점). 라이브 QA로 의도대로 동작 실증. |
| D-AF3-06 | 보안: `/my` 롤을 raw `X-User-Role` 헤더 아닌 **SecurityContext `ROLE_AROLOGIS_*` authority**(서명 JWT claim)에서 도출 → inbound 헤더 위조 권한상승 차단([[identity-header-authz-antipattern]]). 라이브 실증(JWT 없이 X-User-Role:MASTER→data:{}). 로그인/로그아웃 권한캐시 제거(세션 누출 차단). |

### D-EDX (검수완료→배차발송 외부기사/배송사 마스터 슬2, 2026-06-24)

| 결정 | 내용 |
|---|---|
| D-EDX-01 | 외부기사/배송사 마스터는 `slip-service.external_carrier` 단일 테이블로 둔다. 필드=name/phone/email/default_vehicle_type/memo/active + BaseEntity 7 audit + soft-delete. `active` 는 운영 비활성 토글이며 soft-delete 와 별개다. |
| D-EDX-02 | 권한은 단일 page-code `dispatch.external-carriers` + 7-action(account-mode)으로 고정한다. dual `.manage` page-code 는 사용하지 않는다. MASTER/MANAGER/DISPATCH 에 view/create/update/delete/restore=TRUE, download/print=FALSE 를 시드한다. |
| D-EDX-03 | 사용자 화면 식별자는 name/phone 으로 제한한다. UUID id 는 API path key/DataTable rowKey 등 내부 라우팅 용도로만 사용하고 data-testid suffix 도 name 기반으로 둔다. |
| D-EDX-04 | 슬2는 마스터 CRUD까지만 구현한다. `external_dispatch` / `external_dispatch_slip` 발송 기록과 SMS/인쇄 실행은 슬3/슬4 범위로 분리한다. |

### D-COEDIT-S2B (slip 문서전역 수정/버전 로그, 2026-06-30)

| 결정 | 내용 |
|---|---|
| D-COEDIT-S2B-01 | S2b 기록 시점은 기존 저장 PUT 완료 후의 EDIT revision capture 로 둔다. 즉시영속 전환은 하지 않고, S2a 의 Yjs 편집값이 save-PUT 으로 저장되는 순간 기존 버전 이력에 누적한다. |
| D-COEDIT-S2B-02 | 저장소는 신규 silo 테이블 없이 `slip_revisions` 기존 스냅샷을 진실원으로 유지한다. API 응답에서 인접 revision snapshot 을 비교해 `fieldChanges`를 산출한다. |
| D-COEDIT-S2B-03 | diff 구조는 `fieldPath`, 한국어 `label`, `beforeValue`, `afterValue`, `actorName`, `actorColor`, `changedAt` 으로 고정한다. UUID 필드와 actorId/connectedId 는 사용자 응답·화면에 노출하지 않는다. |
| D-COEDIT-S2B-04 | 수정자 색상은 BE `PresenceColor.fromUserId`와 FE `presenceColorToHex` 계열 단일색상 정책을 따른다. presence, coedit, audit 표시색을 분리하지 않는다. 수정 카운트와 레드라인은 S2c/S2d 후속으로 둔다. |
| D-COEDIT-S2C-01 | 사용자 노출 "전표수정내역"(`editHistoryCount`) 증가 임계: 판매전표(OUTBOUND)=작성완료·창고이관(재고차감, `inspect()`→COMPLETED) 後 / 그 외(비-OUTBOUND)=작성완료 후 다음 결재선(`send()`→SENT) 後 편집만 카운트. 임계 前 편집은 S2b 버전로그엔 남되 카운트 X (개발책임자 2026-06-30 확정). |
| D-COEDIT-S2C-02 | `revisionCount`(=audit revisionNo)는 불변 유지하고, 신규 `slips.revision_count_baseline`(V53)에 임계 전이 시점 revisionCount 를 1회 스냅샷한다. `editHistoryCount = baseline==null ? 0 : max(0, revisionCount-baseline)`. 기존 임계통과 전표는 backfill `baseline=0`(현 표시 보존; 과거 baseline 복원 불가에 따른 영구 신/구 불연속 수용, 상세 이력은 S2b 버전로그 보존). |
| D-COEDIT-S2C-03 | INBOUND(SENT 임계) 카운트는 BE·mock 구현하되 `PurchaseQueryPage` 컬럼은 미노출로 둔다(forward-compatible). 화면 노출 여부는 개발책임자 결정 대기. |
| D-COEDIT-S2D-01 | 레드라인(track-changes)은 임계 통과 전표 조회 시 셀에 인라인 표시한다(구글독스식). 임계 전이 시점 `max(slip_revisions.revision_no)` 를 `slips.redline_anchor_revision_no`(V54)로 고정하고 anchor 後 편집만 표시(드래프트 제외). 재귀 스택(기존값 취소선 + 바로 위 수정값 사용자색+라벨, 수정의 수정도 스택). S2b `slip_revisions` 재사용. (개발책임자 brainstorming 2026-06-30, anchor 기반) |
| D-COEDIT-S2D-02 | **S2d-1 은 헤더 필드 레드라인 한정**, 라인 셀(품목)은 S2d-1b 후속 분리. 사유: 라인 fieldPath 행인덱스 누적 misattribution(anchor 後 재정렬 시 productId 혼입·이력손실) + 단가/합계 snapshot VAT 제외↔표시 VAT 포함 불일치. S2d-1b 에서 productId 안정키 + VAT 정합값으로 해소. S2d-2 = 라이브 Yjs 실시간 track-changes. (#677) |
| D-COEDIT-S2D-03 | **S2d-1b 라인 셀 레드라인은 Snapshot 확장 A안**으로 구현한다. `SlipSnapshot.Line`에 `unitPriceWithVat`·`vatAmount`·`supplyAmount` nullable 필드를 additive로 추가하고(Flyway 없음), 라인 redline은 `productId + 등장순서` 안정키로 anchor 後 revision snapshot을 직접 비교한다. 단가/합계는 신규 VAT 필드를 우선 사용하고 legacy VAT-null snapshot은 VAT 제외값 그대로 fallback(×1.1 추정 금지). |
| D-COEDIT-S2D-04 | **S2d-2 라이브 변경 하이라이트는 접근법 A(awareness `lastEdit` + transient pulse)** 로 구현한다. 로컬 편집 시 FE awareness에 `lastEdit:{fieldPath,ts}`를 세팅하고, 타 클라이언트는 최근 2.5초 미만 원격 lastEdit만 사용자색 펄스 + `{displayName} 수정` 배지로 표시한다. awareness relay는 기존 opaque base64 흐름이므로 BE/slip-service 변경은 0이다. 저장 redline accept/reject 및 편집모드 live redline stack은 비대상이다. |
| D-COEDIT-S3-00 | **relay/provider 공용화는 계약 무변경 추출로 고정**한다. BE Yjs relay는 `shared:collab-core` `CollabCoeditService(documentId)`가 소유하고, slip은 기존 `/slips/{id}/collab/coedit[/update|/awareness]` endpoint·DTO·권한을 유지한 채 delegate한다. FE는 `makeCoeditApi(basePath)`와 `createDocCoeditProvider({documentId,basePath,headerTextFields})`를 공용 계약으로 삼으며, slip의 긴 헤더 텍스트 필드 집합만 slip 소비자 측 상수로 둔다. 타 문서 rollout은 basePath/headerTextFields 주입으로 진행하고, redline generic화·다중노드 relay 외부화는 별도 후속이다. |

### D-DMR (배차 #3 수정제안 재배차/수동기입, 2026-06-12)

| 결정 | 내용 |
|---|---|
| D-DMR-01 | 재배차 진입 = 전용 endpoint `POST /admin/dispatch-tasks/{taskId}/start-redispatch`. `MODIFICATION_ACCEPTED` 상태에서 바로 편집하지 않고, endpoint 가 `markBackToDraftForRedispatch()` + 발송그룹 `resetToPending()` + 매핑 slip `UNDISPATCHED` 복귀를 원자 처리한다. |
| D-DMR-02 | 수동기입 vendor = enum + CHECK. 허용값은 `AROLOGIS`, `GYEONGGI_QUICK`, `JEONGUK_HWAMUL`, `OTHER`; 기존 arologis/외부 자동 매칭 source 문자열은 `AROLOGIS` 대표값으로 정규화하고, 기존 `MANUAL` 값은 `OTHER` 로 보존한다. |
| D-DMR-03 | arologis 재배차 = delete-recreate. 기존 `arologisDispatchId` 로 internal soft-delete 호출 후 task 단일 id 를 null 처리한다. arologis 무연동/실패는 graceful warning 이며 재배차 자체는 진행한다. |
| D-DMR-04 | 그룹별 dispatch-id 테이블화는 후속. #3 은 단일 `DispatchTask.arologisDispatchId` 모델을 유지하되, 재배차 시작 시 기존 id 명시 처리와 재발송 confirm 시 새 id 저장 흐름을 일관화한다. |
| D-DMR-05 | arologis `matchAndNotify` 는 **동기 유지** — confirm 타이밍의 AFTER_COMMIT/async 전환은 defer. 현재 confirm 회신은 로컬 sync-skeleton(Mock matcher) 한정이고 `InsungQuickIntegrationIT` 가 동기 `Vehicle.status=ASSIGNED` 단언. 비동기 전환은 실 vendor 연동 슬라이스에서 트랜잭션 경계와 재설계. (Round C 시도→회귀로 revert) |
| D-DMR-06 | arologis silent 파괴 차단 — `DispatchReceiveService.receive()` 를 **insert-only**(기존 active soft-delete 제거)로, `ux_dispatches_date_type_active` 를 **kakao-native(`samhan_dispatch_task_id IS NULL`) 한정**(V22)으로 좁혀 같은날 2회차 task·kakao dispatch 공존을 허용한다. samhan task 는 `ux_dispatches_samhan_task_active`(V21, task당 active 1) governance. 추가 부분발송은 **명시 409**(재배차로 전체 재발송) — 그룹별 dispatch-id 정밀화 전까지 침묵 파괴 방지. |
| D-DMR-07 | (개발책임자 2026-06-12 결정, Option A) 재배차 흐름 UI 진입 = **배차현황(완료배차)에서 수정요청 허용**. 배차현황 상세를 조회전용에서 완화해 DISPATCHED 상세에서 [수정 요청]·[취소 요청](arologisDispatchId 보유 시), MODIFICATION_ACCEPTED 에서 [재배차 시작]을 노출(권한 가드 동반). 보드 today-draft 모델로는 발송된 task in-place 수정 불가하다는 Fable5 Round C 적발 해소. 모바일은 재배차 미지원(데스크톱 배차현황 안내). |
| D-PMR-01 | 품목 등록 종류 3구분(일반품목/세트/세트구성품). 신규 enum 최소화 — `ProductItemKind`(요청 전용, DB 미영속)로 받아 `productType`(SINGLE/BUNDLE) + `BundleComponent` 부모 링크로 변환. 세트구성품=SINGLE+부모 세트 링크 필수(누락/미해소/비BUNDLE→400)+usageScope NONE. 표시=견적기본 세트명/견적상세+출고전표 구성품 폭발(기존 구현). |
| D-PMR-02 | 상품/비상품 = 신규 `ProductGoodsType`(GOODS/NON_GOODS) + V16 CHECK. 비상품(운임/수수료/설치비)=재고 미생성. inventory 게이트(StockService.inbound/adjust, StockInstanceService.create/inboundBatch, InboundInspectionService)는 reject 아닌 **no-op skip**(개발책임자 2026-06-15 — 전표 전환 시 비상품 라인이 전표 전체를 깨뜨리지 않게). 비상품용 카테고리 SERVICE(서비스/요금, serial_managed=false) 시드. |
| D-PMR-03 | modelCode = 불변(개발책임자 2026-06-15). create 시 modelName.trim()로 1회 설정, update에서 modelName 변경해도 modelCode 유지(BundleComponent 링크 키 안정). |
| D-PMR-04 | FE 품목 등록/수정 경로 = `/api/products`(게이트웨이 StripPrefix=1 → ProductController), `/api/v1/products` 아님(no-strip GET 라우트가 POST를 405 가로챔 — 실서버 QA 단독 적발). 자동완성 = design-system `AsyncAutocomplete`(방향키 기보유) 전역 표준 일원화. |

---

## 종합견적서 거래처·담당자 시트→사내 DB 전환 G2 (2026-06-16, PR #491)

**배경**: 에픽 "estimate-app 외부 시트 잔여 제거(G1+G2)". 개발책임자 2026-06-16 — 거래처=우리 거래처 DB(partner-service), 담당자=우리 행정직원(user-service), "따로 추가는 무의미"(기존 데이터 read만). spec `docs/superpowers/specs/2026-06-16-estimate-partner-manager-db.md`, dev-report `docs/dev-reports/2026-06-16-estimate-partner-manager-db.md`.

| 결정 코드 | 내용 |
|---|---|
| D-EPM-01 | 거래처 = partner-service `GET /internal/partners/list`(신규 read DTO `PartnerDirectoryResponse` 8필드, ACTIVE만, page/limit 5000 순회, ROLE_MASTER). 기존 `PartnerInternalResponse` 무변경(blast radius 0). 신규 데이터/엔티티 0 = 기존 거래처 마스터 read projection. |
| D-EPM-02 | 담당자 = user-service `GET /internal/users/employees`(행정직원 fullName+ecountCode+부서). 활성 정의 = `isDeleted=false AND terminationDate IS NULL`(searchAdmin 정합, 퇴사/비활성 제외). slip employeeCode 는 자유문자열 스냅샷이라 ecountCode 포맷 무관(비파손). |
| D-EPM-03 | estimate-app `PARTNER_SERVICE_URL` 은 레거시상 **dc-config-service(:8089)** 지칭 → 신규 거래처 directory(`directory.js`)는 별개 env `SAMHAN_PARTNER_SERVICE_URL`(실 partner-service :8095) 사용. .env.example·render.yaml 정합. (Docker 실QA 단독 적발 — 미수정 시 배포에서 거래처 목록 404.) |
| D-EPM-04 | 시트 '거래처'/'담당자' 컬럼 중 `싱글 할인`·거래처시트 `담당자명/연락처`는 vestigial(dc-config 가 할인 진실원, 슬립 manager 는 partner-order 출처) → 마이그 제외. 거래처→담당자 역참조 empCd 폴백 폐기(empCd=로그인 사용자 우선). |

---

## 싱글 자재 정정(A안) + 품목 종류 단일/세트 (2026-06-16, PR #493)

**배경**: 1차 V18 시드가 자재시트 28행을 가짜 Product(MATERIAL)로 만들고 model_name 유니크 충돌 회피용 `MAT-`+md5 해시 코드 부여 → 개발책임자 "모델명 이상함" 지적. 정찰: 자재=이미 실모델코드 가진 카탈로그 품목(부품=SINGLE_PART, 패널/리모컨=HOME_MULTI/상업 `PC1BWCK3NW`). spec `docs/superpowers/specs/2026-06-16-single-material-product.md`, dev-report `docs/dev-reports/2026-06-16-single-material-product.md`.

| 결정 코드 | 내용 |
|---|---|
| D-SMP-01 | 자재 모델링 = **A안(실 카탈로그 통합)**. 가짜 MATERIAL 품목(V18) 폐기 — 자재(패널/리모컨/부품)는 이미 실모델코드 가진 기존 카탈로그 품목. material-prices 엔드포인트는 `material_price`(구형 참조 lookup) 복원. 싱글 옵션 단가는 실 구성품 단가 차액으로 동적 계산(estimate-app `calcSetUnitPrice`, 기구현). |
| D-SMP-02 | **품목 종류 = 단일(GENERAL)/세트(SET) 2구분** (개발책임자 Option B — D-PMR-01 3구분 대체). '세트구성품' 종류 폐기, 구성품 지정은 세트측 ComponentsModal 에서만(단일 품목 선택). 판넬/리모컨/유연호스=단일 품목이며 노출(usageScope/카테고리) ⊥ 구성품(BundleComponent) 독립 축. BE `ProductItemKind` enum 은 backward-compat 유지. |
| D-SMP-03 | P1 데이터 손상 픽스 — 세트 구성품인 단일 품목 편집(itemKind=GENERAL) 저장 시 BE가 부모 세트 BundleComponent 링크를 soft-delete 하던 회귀 제거(`ProductService.applyUpdateFields` GENERAL 분기). 구성품 링크는 세트측에서만 관리. 실 BE 회귀 IT 추가(mock 미재현). 머지 게이트 Opus 재리뷰 단독 적발. |
| D-SMP-04 | 노출 설정 견적 카테고리 사용자 라벨 `레거시`→`구형`(enum 값 LEGACY/OLD 내부 식별자 유지). |

---

## 이카운트 이관 자료 네이티브 편입 슬1 — 잔액 스냅샷 silo 폐기 (2026-06-19, PR #518)

**배경**: 에픽 "이카운트 이관 자료 네이티브 편입"([[ecount-native-fold]]) — 이관 자료를 별도 메뉴/저장(silo)으로 두지 않고 네이티브 도메인에 편입하고 "회계 관리자" silo 를 폐기한다. 슬1 = MIG-9/MIG-14 잔재인 거래처 잔액 스냅샷 silo(page-code `ecount.mig14.aging-snapshot`) 제거. dev-report `docs/dev-reports/2026-06-19-ecount-native-fold-slice1-aging.md`.

| 결정 코드 | 내용 |
|---|---|
| D-ECT-FOLD-01 | 이카운트 이관 자료 네이티브 편입 슬1: 잔액 스냅샷 silo(page-code `ecount.mig14.aging-snapshot`) 폐기 → 네이티브 거래처 미수/미지급 보고서 `GET /accounting/reports/partner-aging`(`PartnerAgingController`, journals POSTED 110/201 직접 집계, 재무 보고서 메뉴 도달)로 대체. FE 메뉴/route/`PartnerAgingSnapshotPage`/`accountingAdminApi` aging 함수·타입/permissions/mock 제거, BE `GET /accounting/aging-snapshot`·`POST /admin/accounting/aging-snapshot/refresh` endpoint + DTO(`PartnerAgingSnapshotResponse`, `AgingSnapshotRefreshResult`) 제거, auth `PageCode` enum 값 제거. MIG-14 admin UI 4 → 3 화면(cash-list / order-list / ledger). |
| D-ECT-FOLD-02 | LINEAGE 유지 — MV `partner_aging_snapshot` DDL 과 `Mig9AgingSnapshotRefreshService`(EcountReimportService 재import wiring)는 보존(cutover 후 물리 제거). silo 화면/endpoint/page-code 만 폐기하고 재import 계보는 끊지 않는다. |
| D-ECT-FOLD-03 | V59 마이그 = page-code 권한 정리. `role_page_permissions` 는 hard delete, `role_page_permission_templates`/`account_page_permissions`/`group_page_permissions`/`account_permission_overrides` 는 soft delete. |

---

## 이카운트 이관 자료 네이티브 편입 슬2 — 현금 지출/입금 silo 폐기 (2026-06-19, PR #520)

**배경**: 에픽 "이카운트 이관 자료 네이티브 편입"([[ecount-native-fold]]) 슬2. 슬1(잔액 스냅샷, PR #518)과 동형으로, MIG-14 admin UI 의 현금 지출/입금 트랜잭션 조회 silo(page-code `ecount.mig14.cash-list`)를 제거한다. 현금 자료는 MIG-9 가 이미 네이티브 회계 journals 에 편입해 분개장·입금매칭·원장으로 노출하므로 cash-list 화면은 중복 silo 다. dev-report `docs/dev-reports/2026-06-19-ecount-native-fold-slice2-cash.md`.

| 결정 코드 | 내용 |
|---|---|
| D-ECT-FOLD-04 | 이카운트 이관 자료 네이티브 편입 슬2: 현금 지출/입금 트랜잭션 silo(page-code `ecount.mig14.cash-list`) 폐기 → 현금 자료는 MIG-9 가 이미 네이티브 journals 에 편입(분개장 `GET /accounting/journals` + 입금매칭 `GET /accounting/deposit-match` + 원장 노출)했으므로 별도 조회 화면 불요. FE 지출/입금 메뉴·route·`CashDisbursementListPage`/`CashReceiptListPage`/`CashTransactionList`/`accountingAdminApi` cash 함수·타입/permissions/mock/PermissionMatrix/Playwright(`mig-14-cash-admin`)/pagecodes 제거, BE accounting `GET /accounting/cash-disbursements`·`/cash-receipts` endpoint + `CASH_PAGE_CODE` + `listCash*` + DTO(`CashDisbursementResponse`, `CashReceiptResponse`) 제거, auth `PageCode.ECOUNT_MIG14_CASH_LIST` enum 값 제거. MIG-14 admin UI 3 → **2 화면**(order-list / ledger). |
| D-ECT-FOLD-05 | LINEAGE 유지 — `CashDisbursement`/`CashReceipt` 엔티티·repository·`cash_*` 테이블, `Mig7Cash*TransformController`(`/transform-from-staging`, page-code `ecount.mig7.*`), `Mig9CashJournalController`(page-code `ecount.mig9.*`)는 보존(cutover 후 물리 제거). silo 화면/조회 endpoint/page-code 만 폐기하고 staging→Cash→Journal 편입 계보는 끊지 않는다. |
| D-ECT-FOLD-06 | V60 마이그 = page-code 권한 정리(V59 패턴 동일). `cash-list` 권한 행은 `role_page_permissions` hard delete, `role_page_permission_templates`/`account_page_permissions`/`group_page_permissions`/`account_permission_overrides` soft delete. |
| D-ECT-FOLD-07 | 슬4(PR #521): "회계 관리자"(MIG-18) 중첩 토글 그룹 완전 해체 → 멤버를 네이티브 카테고리 flat 편입(별도 silo 섹션 금지 — 에픽 원칙 "기존 회계 메뉴 편입"). 원장대조·운영대시보드·회계수정요청=회계 flat. route/page-code/RBAC seed/롤/BE 무변경(cutover 전 폐기 금지 — 메뉴 IA만). 슬5(토글그룹 해체) 흡수. |
| D-ECT-FOLD-08 | 슬4(PR #521, 개발책임자 정정): 주문서 관리(eCount 이관 주문 silo)는 회계 아닌 **판매 도메인** → 판매 카테고리 flat 이동. 네이티브 주문서 관리(`/sales/partner-orders`)와 구분 위해 **"주문서 관리 (이관)"** 라벨(계약 박제). 슬6 partner_orders 이식 시 링크/route/page-code 제거. |

---

## #809 거래처+품목 최근단가 R3 BE 결정 (2026-07-15, PR #820)

| 결정 코드 | 내용 |
|---|---|
| D-R3-1 | UUID 비공개 기준은 사용자 화면이다. 가격기억 단건 query string 및 bulk JSON payload의 `partnerId`/`productId`는 내부 API 식별자로 유지한다. UUID 회피용 재설계는 하지 않는다. |
| D-R3-3 | soft-delete 된 거래처/품목이 걸린 기존 문서 편집에서도 가격기억을 반환한다. partner/product 생존 확인 호출은 추가하지 않는다. |
| D-R3-4 | 조회 증폭 해소는 단건 유지 + `POST /slips/price-memory/bulk`(1~100, hit-only 배열) + 4종 권한 OR short-circuit + auth RestClient 2초 connect/3초 read timeout 조합으로 확정한다. |
| D-R3-5 | 최대 라인 수는 전표/견적/모바일 견적 모두 100건이다. 가격기억은 단일 set-based upsert, `remembered_at` recency guard, 1초 lock/3초 statement/4초 transaction timeout을 사용한다. |
| D-R3-6 | afterCommit REQUIRES_NEW 는 bounded async(core 2/max 4/queue 100)로 outer connection을 먼저 반환한다. durable outbox는 유실 방지는 우수하지만 보조 기능에 worker/table/backfill 운영비가 과도해 미채택한다. queue/DB 실패는 metric 후 fail-soft 한다. |

---

## #809 거래처+품목 최근단가 R4 개발책임자 결정 (2026-07-15, PR #820)

R4(FABLE5 1차 적대검증) 확인요청 4건 확정 — 근거 전문: [PR #820 결정 기록](https://github.com/ewoo14/Samhan-Public/pull/820#issuecomment-4980376041). 잔존 경계의 정직 기록은 `docs/dev-reports/2026-07-15-809-partner-product-price-memory.md` "정직 한계" 절.

| 결정 코드 | 내용 |
|---|---|
| D-R4-1 | 자동채움 catalog 폴백 마커 용어는 `판매가`다(실체 = `product.sellingPrice` = 제품 등록 화면 기존 라벨). 이 레포 기존 용어체계에서 '정가'는 출고가 계열 별칭(estimate-app `lib/code.js` 동의어 매핑)이라 사용자를 오도하므로 마커/설명/문서에서 `정가` 라벨을 금지한다. `정가` 로 확정돼 있던 spec 38-39 는 spec 자체가 기존 결정과 상충한 경우로 보아 정정한다. |
| D-R4-2 | 가격기억 최신성 권위는 `remembered_at`(원 전표/견적 트랜잭션의 애플리케이션 캡처 시각)을 유지한다. 커밋순서 권위(`clock_timestamp()`/시퀀스) 재설계는 하지 않는다. 실제 커밋 순서와의 ms~수백ms 역전 창은 dev-report 에 정직 기록한다 — 역전돼도 두 값 모두 사용자 실입력 단가이며, flush 실행 순서 역전은 IT 로 방어돼 있다. |
| D-R4-3 | 전표 생성(VAT포함 basis)→직접 PUT(공급단가 basis) 교차 경로의 서브-원 드리프트(예: 100,000 → 기억값 99,999.90 · 1회 수렴 · 비복리 · 11의 배수 단가 미발생)는 두 저장 basis 병존의 내재적 반올림 한계로 수용하고 문서화한다. PUT 경로의 `unitPriceWithVat` 우선 계약 확장은 하지 않는다. |
| D-R4-4 | 거래처 선택 해제 시 라인 단가값은 유지하고 REMEMBERED 마커(저장일 표기 포함)만 해제한다. 단가를 판매가로 되돌리지 않는다 — 사용자가 이미 확인한 입력값을 임의로 변경하지 않는다. 라인 상태(priceSource)는 유지해 거래처 재선택 시 재조회 자격을 보존한다. |

## #810 입금자명↔거래처 자동 매핑 (2026-07-17, PR #829)

입금 통장거래의 입금자명을 거래처에 한 번 지정하면 기억하여 자동 매칭. 3라운드 다모델 적대검증(R1 OPUS·R2 CODEX·R3 OPUS+CODEX) — R2·R3에서 fix가 회귀를 낳는 사이클로 비수렴, 개발책임자 결정 A로 bound. dev-report `docs/dev-reports/2026-07-17-810-bank-depositor-partner-mapping.md`.

| 결정 코드 | 내용 |
|---|---|
| D-810-01 | **학습 = 인간기원만**. 매핑 upsert는 수동 매칭(match-partner)·관리 CRUD(`deposit-mapping:UPDATE` 보유 시)에서만, 입금(DEPOSIT)+입금성 source 한정. import/CODEF/KFTC resolver는 read-only — 자동매칭 결과가 다시 매핑으로 학습되는 자기강화 오염 루프를 차단한다. |
| D-810-02 | **권한 이중경로**. 단건 거래처 배정=`accounting.bank-matching:UPDATE`. 매핑 학습/삭제=`accounting.deposit-mapping:UPDATE/DELETE` 보유 시(미보유자는 단건 배정만·"매핑도 삭제" 미노출). 해제 UX 분리: "이 거래만 해제"(clear) vs "매핑도 삭제"(clear-and-delete-mapping). SYSTEM MASTER는 내부 게이트 bypass — 게이트웨이가 JWT claim 기반으로 `X-Is-System-Master` 를 remove-then-set 하는 단일권위라 위조 불가(공격표면 확장 0). |
| D-810-03 | **stale·일시장애 무폴백**. 매핑 target 이 stale(삭제/비활성 거래처)이면 partnerCode 정확일치 폴백 없이 미매칭+관리 경고. 정확일치 폴백도 `PartnerStatus=ACTIVE` 검증. partner lookup 은 FOUND/NOT_FOUND/**UNAVAILABLE**(5xx/네트워크/파싱) 3분류 — UNAVAILABLE 은 stale 로 오분류하지 않고(정상 매핑 미매칭 오염 방지) 매칭만 보류·재시도 대상. **import 시 거래는 항상 UNMATCHED 로 영속화하고 매칭만 보류**(거래 유실 금지). |
| D-810-04 | **provenance·감사**. `bank_transaction` 에 매칭근거(source·mapping_id·snapshot) 보존, snapshot 불변식은 도메인+DB(V60 NULL-safe CASE CHECK) 이중 강제. 매핑 이력은 entityId 기준 append-only(변경분만·작업당 단일 timestamp·rename 연속성·opaque entryKey). UUID 비공개(business key normalizedName). |
| D-810-A | **개발책임자 결정 A (수렴 bound)**. R3 도 비수렴(R3-OPUS fix 가 거래유실 HIGH 회귀 유발)이자, 거래유실+#810 핵심 genuine 만 현 PR 에 fix 하고 엣지는 후속 분리한 뒤 포커스 재검증→머지. 후속: **#830**(멀티인스턴스 revision 채번) · **#831**(pre-#810 회계 도메인의 lookup UNAVAILABLE→NOT_FOUND 붕괴 계열·tax invoice HIGH 포함) · **#832**(mock parity·감사 표시 정밀도·BOM 정규화). resilience/엣지가 깊은 슬라이스는 무한 iterate 대신 PM 이 비수렴을 조기 보고하고 개발책임자가 스코프를 bound 한다. |

## #845 DS-2 문서 레이아웃 템플릿 (2026-07-18)

| 결정 코드 | 내용 |
|---|---|
| D-DS2-11 | 문서 레이아웃은 groupware `document_templates`의 typed JSONB(`paper+bands`)를 권위로 삼고 V10에만 추가한다. docType별 ACTIVE는 bulk 강등 시 `lock_version`/modified audit를 명시 증가시킨 뒤 대상만 승격하며, 경합은 409로 반환한다. |
| D-DS2-12 | desktop renderer는 `ApprovalLine.documentType` active 조회를 로딩 종료 후 1회 결정한다. active 없음·오류·malformed·네트워크/재연결/late 결과는 기존 `GROUPWARE_DEFAULT` 출력으로 수렴하며, 기본 양식은 recursive freeze하고 반환 시 deep-clone한다. |

## #848 documentType 컬럼 40→70 확장 (2026-07-19, PR #852)

`documentTypeFor()`가 생성하는 `GROUPWARE_${code}`(최대 70자=`GROUPWARE_`(10)+`ApprovalTemplate.code`(≤60))가 저장 컬럼 VARCHAR(40)을 초과(code 31자+ 시 500/truncation). `GROUPWARE_${code}`를 저장하는 컬럼 전 3곳을 40→70 확장. 워크플로우: SOL 기획검수 v1→v4 GO·LUNA 구현·OPUS R1 5-agent(DTO @Size(40) 게이트 HIGH·라이브 400 확증→fix)·CODEX SOL R2 5-agent. dev-report `docs/dev-reports/2026-07-19-848-documenttype-column-widen.md`.

| 결정 코드 | 내용 |
|---|---|
| D-848-01 | **blast radius = `GROUPWARE_${code}` 저장 3컬럼**(라이브 DB 17-DB 전수 실측·grep false-negative 회피): ①groupware `approval_lines.document_type`(V8·nullable·`ApprovalLineBase`) ②groupware `document_templates.doc_type`(V10·`DocumentTemplate`) ③auth `approval_line_config.document_type`(V61·`ApprovalLineConfig`). 협업 `document_type`(고정 `CollabDocumentType` enum·최장 23자·`GROUPWARE_` 유입 0)은 스코프 밖. `approval_attachments.ref_doc_type`(별 enum)도 무관. |
| D-848-02 | **엔티티·마이그 모두 70**: `ApprovalLineBase.document_type` length 70 / `DocumentTemplate.DOC_TYPE_MAX_LENGTH` 70(오류문구 상수 보간) / `ApprovalLineConfig.document_type` length 70 + `createDisplayStep`/`addStep` length guard(≤70·free-form). groupware `V11`(2 ALTER+backfill)·auth `V89`(1 ALTER), 둘 다 첫 문장 `SET LOCAL lock_timeout='5s'`. |
| D-848-03 | **ddl-validate 는 VARCHAR length 미검사** → 부팅 green≠폭확장. `information_schema.character_maximum_length=70` 단언 IT(3컬럼) + 실 flush IT(41/70 성공·71 거부·정확값 round-trip 단언)로 genuine 검증. V11 backfill 멱등은 `JdbcTemplate.update()` count=0(2번째 `flyway.migrate()` migrationsExecuted false-green 금지). |
| D-848-04 | **V11 backfill 대상 현 라이브 0행**: 활성 NULL 64행은 전부 `template_id IS NULL` 독립형 결재(정당·backfill 무영향). backfill(`BETWEEN 41 AND 70`)은 타 환경의 V10-skipped 41–70 행 복구 목적·멱등. |
| D-848-05 | **DTO 계약 게이트도 70**(R1 OPUS 적대검증 HIGH): `DocumentTemplateCreate/UpdateRequest.docType`·`AddApprovalLineStepRequest.documentType` `@Size(max=40→70, 한국어 message)`. `@Valid` 가 도메인 validateDocType 보다 먼저 발동하므로 DTO 미확장 시 41–70 저장이 실 HTTP 400 차단(서비스 직접호출 IT 가 @Valid 우회로 마스킹→MockMvc HTTP 경계 IT 로 방어). FE `templateSchema.MAX_DOC_TYPE_LENGTH` 70·mock parity(71 거부). |
| D-848-06 | **배포 순서 권장 = auth V89 → groupware V11 → desktop**(데이터 정합상 순서 무관이나 동시 재시작+양쪽 blocker 시 동시 기동불가 회피). 사전 blocker query(장기 tx)·단계별 information_schema=70 검증·`SET LOCAL lock_timeout='5s'` fail-fast+저활동창 재시도. ALTER VARCHAR 확장=no-rewrite이나 doc_type 키 유니크 인덱스 3개는 ALTER 락 내 재빌드(소규모 무시). |

## 전표 거래처 필수화 — 생명주기 전이 가드 (2026-07-19, PR #853)

OUTBOUND/INBOUND 전표가 committed(SENT+)로 전이 시 거래처(`partner_id`) 필수 불변식. 거래처 없는 committed 전표(#823 오귀속 뿌리·실측 14건) 원천 차단. **컬럼 NOT NULL 비채택**(DRAFT null 1926 정당). dev-report `docs/dev-reports/2026-07-19-slip-partner-required-transition-guard.md`. 별건 #854(outbox self-invocation).

| 결정 코드 | 내용 |
|---|---|
| D-SLIP-PR-01 | **불변식 = `status ∈ REQUIRED_PARTNER_STATUSES ⟹ partner_id != null`**. `REQUIRED_PARTNER_STATUSES` = 전 SlipStatus − {DRAFT, SAVED, CANCELED} = {SENT,ACCEPTED,PROCESSING,INSPECTING,COMPLETED,SHIPPING,DELIVERED,CONFIRMED,REJECTED}. CANCELED 제외(DRAFT/SAVED 취소 partner null 정당)·REJECTED 포함(SENT 이후 도달). |
| D-SLIP-PR-02 | **도메인 3중 가드**: `send()`(SAVED→SENT·requireStatus 먼저) + `restoreFromSnapshot()`(committed+snapshot.partnerId null 복원 거부·표준+협업 revision 공통) + **forward 전이(accept~confirm/reject) `requirePartnerForCommitted()`**(R2·legacy null progress 코드 차단). 불변식을 데이터+cutover 의존 아닌 **코드 강제**. |
| D-SLIP-PR-03 | **DRAFT/SAVED partner null 허용 유지**(편집 단계). FE `SlipDetailPage` 전송 preflight(mobile+desktop 공통)·`SlipFormPage` DRAFT lenient. 컬럼 nullable 유지. |
| D-SLIP-PR-04 | **주문→전표 발행 fail-closed**: `SlipPublishService.resolveCommittedPartnerId`(단일·병합)가 `PartnerInternalClient` `FOUND+partnerId` 만 성공·`NOT_FOUND/5xx/SKIPPED/FOUND-empty` 전부 차단(strict-off·5xx fail-open 우회·회계무결성>가용성·spec 인가). estimate/mobile 발행=DRAFT 종료라 미적용. |
| D-SLIP-PR-05 | **위반 보정 = 동일 릴리스 cutover + 코드 아티팩트**(SOL 3모델 지적·runbook 산문만은 prod 재현·감사 불가): slip-service internal 보정 엔드포인트(9상태 위반 재조회→partner_code→partner_id FOUND 해소·멱등·dry-run·audit·미해소 리포트). code 無(대구HVAC솔루션)=운영 승인 단건 매핑. cutover 순서 = 배포+구버전 drain → 보정 → 검증 0. dev 실측 14→0. |

## #845 DS-3a 재인쇄 승인시점 레이아웃 pin (2026-07-21, PR #865)

결재 문서 재인쇄가 `docType → 현재 ACTIVE 문서양식`을 그때그때 조회해, 관리자가 양식을 수정하면 이미 승인 완료된 과거 문서의 재인쇄 외형까지 함께 바뀌던 감사·법정 무결성 결함을 해소한다. OPUS 기획 → CODEX LUNA 구현 → FABLE5 R1 6-agent 적대검증+라이브QA(HIGH 2·MED 5·LOW 7) → SONNET5 fix. dev-report `docs/dev-reports/2026-07-21-845-ds3a-reprint-pin.md`. spec `docs/specs/845-ds3a-reprint-pin-spec.md`.

| 결정 코드 | 내용 |
|---|---|
| D-DS3A-01 | **pin 기전 = `document_template_revisions` append-only 이력 테이블 + `approval_lines.(document_template_id, document_template_revision)` 참조 각인**(JSONB 전체 스냅샷 복제 아님). 최초 채택 근거였던 "저장 비용"은 FABLE5 R1이 무의미함을 실측 확인했다(승인 20건×321B → 전량 스냅샷도 ~6.4KB로 양방향 모두 무시할 규모). **진짜 근거**: ①`approval_lines`(핵심 감사 테이블) 슬림 유지 ②DS-3b(#868) 편집기가 이력·롤백·브라우징을 요구 ③템플릿 변경 이력 자체의 독립 감사 가치 ④`(template_id, revision)` 복합 FK로 dangling pin 원천 차단(스냅샷은 무결성 검증 불가 blob) ⑤pin 시점 `ensureCurrentRevision` self-heal. "참조만 각인하면 pin이 깨진다"는 원 논거는 '이력 없는 참조각인' 배제 논거이지 스냅샷 배제 논거가 아니다. |
| D-DS3A-02 | **pin 발효 시점 = 최종 승인 완료(APPROVED 전이) 시점**, 같은 `@Transactional` 경계에서 각인(#854 self-invocation 동형 결함 회피 확인 — `pinApprovedLayout`은 `approve()` 내부 private 직접 호출). 반려→재상신→재승인 시 재-pin(단, 현재 코드베이스에 재상신 도메인 자체가 없어 이 경로는 미실증). |
| D-DS3A-03 | **소급 각인 금지.** 이미 승인된 과거 문서에 당시 ACTIVE 양식을 추정해 채우지 않는다. 단, 승인 순간 ACTIVE 양식이 0개였다는 시스템 관측 사실은 `document_template_default_pinned=true`로 승인 시점에 각인하고 이후 `GROUPWARE_DEFAULT`로 고정한다. 기존 R1의 **ACTIVE-0 영구 무pin 수용 결정은 철회**한다(개발책임자 결정, 2026-07-21). 기존 pin 없는 문서(`false`)는 docType이 있을 때 현재 ACTIVE fallback + 고지를 유지하며 docType 없는 구식/독립형 결재는 고지하지 않는다. |
| D-DS3A-04 | 스키마 v1 유지 — `FIELD`/`TEXT`·geometry/style/binding은 DS-3b. |
| D-DS3A-05 | **권한 이원화**: 관리자 문서 양식 CRUD는 기존 `groupware.approval-templates`(DFD-07) 재사용. **재인쇄용 pin revision 단건 조회는 인증-only**(page-code 검사 없음 — 재인쇄 주체는 `groupware.approvals` view 보유자이지 템플릿 관리자가 아니므로). auth-service 마이그레이션·권한 seed 신규 0건. (최초 spec은 이력 조회를 `groupware.approval-templates` 재사용으로 잘못 적어 구현과 상충했다 — FABLE5 R1 M-5로 구현에 맞춰 정정) |
| D-DS3A-06 | 🚨**R3 정정(2026-07-21) — D-DS3A-03의 ACTIVE-0 철회 결정 이후 3-way로 재정의**(구 2-way "pin 있음/pin 없음" 문구가 D-DS3A-03과 상충해 DS-3b가 그대로 따르면 방금 고친 BLOCKING이 복귀하는 상태였음). **렌더 우선순위 = ① pin 있음(실 revision)→각인된 revision, ② `document_template_default_pinned=true`(승인 순간 ACTIVE-0)→내장 DEFAULT로 영구 고정(이후 새 ACTIVE가 생겨도 재조회하지 않음), ③ 셋 다 미기록(레거시/pin 없음)→현재 ACTIVE 조회, ④ pin은 있는데 revision 조회 자체가 실패/malformed→DEFAULT**(DS-2 R2 latch 유지). **④의 경우 `role="alert"` 고지 + 재시도 경로 필수 — 무고지 DEFAULT 강하 금지**(FABLE5 R1 H-2 — 최초 spec은 미pin에는 고지를 요구하면서 pin-조회-실패에는 요구하지 않은 비대칭이 있었고, 그 기획 공백이 구현 결함(retry:false와 맞물려 일시 5xx 한 번에도 무고지로 제3의 외형 인쇄)의 근본 원인이었다). **세 고지**(②=`default-pinned`, ③=`unpinned`, ④=`pin-failed`)는 `role`(② ③=`status` 정보성 / ④=`alert` 오류성)로 구분되는 서로 다른 배너이며 인쇄 출력에는 포함되지 않는다(`no-print`, DS-1 strangler 불변식 연장). ②③④는 상호 배타적이다. |
| D-DS3A-07 | **`DocumentTemplateRevisionRepository`는 `JpaRepository`가 아닌 Spring Data 최소 `Repository` 마커만 상속**(FABLE5 R1 M-2) — `BaseEntity.markDeleted()` public 상속 + `JpaRepository`의 delete류 노출을 차단한다. 단, raw `EntityManager#persist`는 Spring 예외 변환을 우회하므로 사용하지 않고, 저장소에는 `saveAndFlush`만 선택 노출해 unique 경합을 typed `DataIntegrityViolationException`/`BusinessException(CONFLICT)`로 수렴시킨다(2026-07-21 R2 fix). |

## #845 DS-3b 문서 양식 편집기 schema v2 (2026-07-22, Issue #868)

| 결정 코드 | 내용 |
|---|---|
| D-DS3B-01 | **schemaVersion은 버전 dispatch로 해석한다.** `CURRENT_SCHEMA_VERSION=2`는 신규 편집 저장의 기본값일 뿐이며, 승인 당시 revision의 v1 envelope는 계속 v1 parser를 탄다. v1→v2 upcast는 렌더 직전 메모리에서만 envelope version을 올리고 레거시 element `{key,type}`와 DOM을 변형하지 않는다. |
| D-DS3B-02 | **v2 payload는 FE parser·BE typed record·JSONB 세 층에서 동일하게 보존한다.** 신규 `FIELD`/`TEXT`는 band 상대 `%` geometry, 제한된 style, allowlist binding/text만 허용하고 자유 CSS·UUID binding은 허용하지 않는다. 실 PostgreSQL HTTP 왕복 IT를 저장 계약의 권위 검증으로 둔다. |
| D-DS3B-03 | **편집 lifecycle은 ACTIVE 직접 수정을 금지한다.** ACTIVE 양식은 한국어 안내 후 비활성화해야 DRAFT 편집을 시작할 수 있고, 저장은 명시적인 v2 request 한 번으로만 revision을 증가시킨다. VIEW 권한만 있는 사용자는 목록/편집기를 읽기 전용으로 본다. |
| D-DS3B-04 | **Flyway 신규 migration을 추가하지 않는다.** V10~V13의 JSONB `document`와 `schema_version` 컬럼은 v2 payload를 수용하며, schema 집합 검증은 애플리케이션 경계에서 수행한다. |

## #845 DS-4 문서 양식 고도화 (2026-07-23, PR #908)

| 결정 코드 | 내용 |
|---|---|
| D-DS4-01 | schema v2에 `DETAIL`·`IMAGE`를 additive union으로 추가한다. 기존 `FIELD`·`TEXT`·레거시 요소와 v1 upcast/렌더 해석은 변경하지 않는다. |
| D-DS4-02 | `DETAIL`은 `body.lineItems`만 반복 바인딩하고 `EstimateLineResponse`의 `productName`, `modelName`, `specification`, `quantity`, `supplyAmount`(부가세 제외 공급가액), `vatAmount`, `lineTotal`(부가세 포함 합계), `note`만 허용한다. |
| D-DS4-03 | `IMAGE` source는 정확한 `/print-logo.svg` 또는 50KB 이하 PNG/JPEG/WebP base64 data URL만 허용한다. 외부 URL·토큰 query/hash·blob/file/protocol-relative/SVG data는 차단한다. |
| D-DS4-04 | 신규 DB/Flyway/API/design-system 컴포넌트 없이 기존 JSONB와 `DocumentRenderer → PrintLayout` 경로를 사용한다. 반복 표는 flow 높이·`thead` 반복·행 `break-inside: avoid`를 사용한다. |

## #825 슬5 null-semantics (2026-07-21, PR #864 R2)

| 결정 코드 | 내용 |
|---|---|
| D-S5-06-R2 | CODEF 저장 scope의 `defaultImportType`은 저장 기반 가져오기 실행 범위에도 그대로 적용한다. `scopeMode=ALL`이면 `type`만 전달하고 refs 필드는 생략해 `CARD+ALL`·`BANK+ALL`·`LOAN+ALL`·`ALL+ALL`이 각 범위만 CODEF에서 열거하게 한다. `scopeMode=SELECTED`는 저장 ref 사용 경로를 유지한다. |
| D-S5-07 | V64 `user_codef_import_scope.scope_mode`는 기존 행을 근거 없이 `ALL`로 추정하지 않고 `SELECTED`로 backfill한다. 동시에 `DEFAULT 'SELECTED'`를 둔다. V64 적용 후 구버전 앱만 롤백되어도 구 ORM INSERT가 `scope_mode` 누락으로 23502가 되지 않는 호환성 가드이며, 신규 앱의 명시 계약을 대체하지 않는다. |
| D-S5-08 | 기존 backfill 행이 `SELECTED + 빈 refs`이면 FE는 저장 선택 복원으로 가장하지 않고 복원 실패·재선택 필요를 alert로 안내하며 저장·가져오기를 잠근다. 사용자가 항목을 다시 선택하면 정상 저장으로 회복한다. |
| D-S5-09 | 권한 없는 사용자에게 범위 전체 칩을 focusable button으로 노출하지 않는다. `role`·`tabIndex`·press handler를 제거하고 `aria-disabled="true"`를 둔다. |
| D-S5-10-R4 | `import-scoped` 요청이 `scopeMode=ALL`이고 저장 scope도 `ALL`이면 BE는 사용자 scope를 조회해 저장 `defaultImportType`을 실행 type의 권위값으로 강제한다. 저장 scope가 없으면 명시 요청 type을 유지하고, `SELECTED`는 요청의 explicit refs/type 계약을 유지한다. FE 유형 드롭다운은 `canUpdate=false`에서 disabled이며 desktop mock도 같은 축소 규칙을 적용한다. |

## #920 CODEF scope 낙관적 잠금 (2026-07-25)

| 결정 코드 | 내용 |
|---|---|
| D-S5-11 | CODEF scope 전체 교체 PUT은 조회 당시 `version`과 현재 행 버전을 정확히 대조한다. 미저장 첫 저장은 `version=null`만 허용하고, 기존 행은 현재 버전과 일치해야 한다. 불일치·최초 저장 unique 충돌은 `409 CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT`로 거부하며 저장 retry로 last-write-wins를 만들지 않는다. |
| D-S5-12 | 낙관적 잠금 충돌 시 데스크톱은 서버 최신 scope를 재조회해 표시하고 자동 합집합을 적용하지 않는다. 사용자가 최신 상태에서 의도한 계좌·카드·대출을 다시 명시적으로 선택해 저장한다. 충돌 안내에는 UUID를 쓰지 않고 사용자 표시명을 사용한다. |
| D-S5-13 | V66은 `user_codef_import_scope.version BIGINT NOT NULL DEFAULT 0`을 추가한다. 기존 행과 신규 행 모두 버전 0에서 시작하며, 성공 응답의 증가 버전은 같은 화면의 다음 저장에 사용한다. **이 하위호환은 `version`을 보내는 클라이언트 한정이다** — `version`을 모르는 구버전 데스크톱(#920 이전 빌드)이 기존 행에 PUT하면 요청에 `version` 필드 자체가 없어 현재 버전(0)과 불일치로 간주돼 항상 409로 거부된다(영구, 업그레이드 전까지). 개발책임자 결정(2026-07-25): `UserCodefImportScopeService.verifyVersion`의 `requestedVersion == null` → 409 판정은 바꾸지 않고, 배포 순서로 해소한다 — ① 데스크톱 forceLevel=CRITICAL 강제 업데이트(비해제 차단 모달, `clients/desktop/src/renderer/version/versionCheck.ts:62-63`) 선행 → ② accounting-service 배포. 회귀 가드: `UserCodefImportScopeServiceTest.missingVersionFieldOnExistingRowRejectedWith409`(기존 행 + version 필드 없는 요청 → 409 pin). |

## #824 품목행 공급가액·부가가치세 정합성 (2026-07-22)

| 결정 코드 | 내용 |
|---|---|
| D-824-01 | **법적 기준과 애플리케이션 단수정책을 분리한다.** [부가가치세법 제29조](https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq=276117&efYd=20260102&chrClsCd=010202&ancYnChk=0)는 과세표준을 공급가액으로 두고, [국세청 유권해석(2008.02.01)](https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000046365)은 세금계산서 세액을 공급가액의 10%로 보며 단수조정 실제청구액은 거래 당사자 약정·합의 사항으로 설명한다. 확인한 공식 자료에는 HALF_UP 또는 절사를 법정 단일 방식으로 강제하는 문구가 없었다. 따라서 현재 제품 계약인 세금계산서 절사와 동일한 0 방향 절사를 공통 정책으로 채택하며, 이를 법률이 HALF_UP/절사를 직접 명령한다고 표현하지 않는다. |
| D-824-02 | 전표·견적·세금계산서의 공급가액 기준 VAT 계산은 `shared:common.VatAmountCalculator`와 desktop `vatRounding.ts`로 수렴한다. PRICE/TOTAL의 VAT 포함 합계 분리도 같은 원 단위 절사 정책을 사용한다. 이미 저장된 권위 금액과 발행 완료 세금계산서는 소급 재계산하지 않는다. |
| D-824-03 | 코드 실측상 주문 `PartnerOrderLine.subtotal`은 기존부터 `quantity × priceVat`인 VAT 포함 T이며, 전표의 `lineTotal=S`와 의미가 다르다. partner-order V12는 `supply_amount`·`vat_amount`를 nullable로 추가하고 기존 행 backfill을 하지 않는다. 신규 행과 API 응답은 `S+V=subtotal(T)`를 보장한다. |
| D-824-04 | 주문의 DC는 server-side VAT 포함 단가에 먼저 적용되고, 그 결과를 PRICE 권위로 삼아 S/V/T를 계산한다. direct update·견적 변환은 authority가 없으면 이 legacy PRICE 경로를 사용하고, 명시 authority가 있으면 PRICE/SUPPLY/VAT/TOTAL을 그대로 따른다. |
## #825 슬6 메신저 수신자 칩 복수선택 (2026-07-22, Issue #866 / PR #892)

| 결정 코드 | 내용 |
|---|---|
| D-S6-01 | 메신저 복수 수신은 정규화된 수신자 배열 테이블을 도입하지 않는다. 기존 `Message` 모델처럼 `messages` 1행을 수신자 1명으로 유지하고, 동일 발송 묶음만 nullable `batch_id`로 연결한다. 신규 Flyway는 groupware V14 한 건(`messages.batch_id` + soft-delete partial index)이다. |
| D-S6-02 | `POST /admin/groupware/messages/bulk`는 한 트랜잭션에서 입력 dedup→self 차단→`verifyBulk` 1회→전체 존재 확인→전량 저장 순서로 처리한다. 한 명이라도 없으면 404와 0건 저장, self·51명 초과·빈 입력은 400, 요청은 비멱등이다. 알림은 commit 이후 수신자별 1건이다. |
| D-S6-03 | 수신자 검색은 결재자 검색을 재사용하지 않고 `messenger.send` VIEW 전용 endpoint를 둔다. 부서 제약은 두지 않으며, groupware가 user-service `activeOnly=true`를 전달해 퇴사자를 제외한다. user-service `activeOnly` 기본값은 false로 기존 호출자 동작을 유지한다. |
| D-S6-04 | 데스크톱 `/messenger`는 design-system의 기존 `MultiSelectAutocomplete`를 무수정 사용한다. 칩과 수신함에는 이름·부서·본문·상태만 표시하고 UUID/opaque user id는 표시하지 않는다. 기존 단건 발송 endpoint는 삭제·변경하지 않고 deprecated 표기만 추가한다. |

## #897 입출금·일마감 목록 열 계층화 (2026-07-26)

| 결정 코드 | 내용 |
|---|---|
| D-COL-897-01 | `BankTransactionPage`와 `DailyClosingPage`의 화면 목록 열 집합은 각각 `BANK_TRANSACTION_LIST_COLUMN_KEYS`와 `DAILY_CLOSING_LIST_COLUMN_KEYS` 단일 상수로 관리한다. 개발책임자 실사용 확인 전에는 PM 제안(거래일·적요·거래처·입금·출금·잔액·상태 / 일자·구분·건수·금액 합계·마감상태)을 기본값으로 사용하고, 후속 정정은 해당 상수와 열 정의만 조정한다. API 원본 모델은 축소하지 않는다. |
| D-COL-897-02 | 입출금에서 목록에 감춘 계좌·상대계좌·원문 등은 신규 모달이나 UUID 링크를 만들지 않고 행 내부의 native `<details>` disclosure로 확인한다. 일마감은 기존 `/accounting/closings/daily` 상세 데이터 경로를 행의 `상세` 조작으로 연결한다. |
| D-COL-897-03 | `소스`는 원천 전체 탭에서만, `매칭상태`는 상태 전체 탭에서만 표시하는 #877/#918 조건을 유지한다. #880이 정한 좁은 폭 조작 버튼의 `mobilePriority: secondary` 계약을 소비 화면에서 계속 사용한다. |
| D-COL-897-04 | 열 축소는 화면 목록에만 적용한다. 두 화면에서 기존 인쇄·엑셀 export surface는 코드 실측상 존재하지 않으므로 신규 export 경로를 신설하지 않으며, API 원본·기존 상세 데이터의 전체 필드는 보존한다. |
