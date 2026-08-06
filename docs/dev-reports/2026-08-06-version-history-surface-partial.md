# 버전이력 표면 조사 — **부분 산출물** (세션 종료로 미완)

> 2026-08-06 회사PC 세션. 워크플로우가 세션 종료로 중단됐고 **표면조사 4개 에이전트 결과만** 회수했다.
> 후속 단계(누락 적대재탐색 · 충돌 위험 · 모달 패턴 · 사양 종합)는 **미실시**다.

## 개발책임자 지시 (2026-08-06)

> *"전표와 문서 내 버전이력의 경우 바로 노출하지 않고 '버전이력'이라는 버튼을 통해 모달로 보여주는 것으로 변경. 한꺼번에 있으므로 가독성이 떨어짐. 시간 순에 따라 내림차순."*

## 🚨 이 문서를 쓰는 법

아래는 **검증되지 않은 부분 조사**다. 집PC 세션은 시작점으로만 쓰고 **다시 세라**.
조사되지 않은 것: 다른 이름으로 부르는 표면(수정이력·변경내역·audit·diff·restore) · 공용 컴포넌트 · 모바일 · 인쇄 렌더러 · Playwright spec 계약 · docs 단정 · 열린 PR 충돌 · 기존 모달 패턴.

⚠️ `#1078` 의 라이브QA 잔여 항목에 **"F 버전 이력 복원"** 이 있다 — 같은 표면이니 착수 전 충돌을 확인할 것.

---

## 회수 1

```json
{
 "surfaces": [
  {
   "screen": "종합견적 웹(estimate-app) — \"견적 저장 내역\" (상단 [저장내역] 버튼)",
   "file": "clients/web/estimate-app/views/index.ejs:2133 (마크업) · :17386 goSnapshotPage · :17860 renderSnapshotTable · :19660 버튼 배선",
   "currentRendering": "separate-page",
   "renderingEvidence": "마크업 index.ejs:2133 `<div id=\"divSnapshotPage\" style=\"display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:#fff; z-index:99999; overflow:hidden;\">` / 여는 함수 index.ejs:17385-17392 주석까지 `/* 저장 내역 페이지 열기 */ function goSnapshotPage() { ... page.style.display = 'block'; page.style.zIndex = '210000'; }` / 닫기 index.ejs:17851-17857 `function closeSnapshotPage() { page.style.display = 'none'; }` — design-system `Modal` 컴포넌트 미사용, backdrop(반투명 레이어) 없음, 화면 100%×100% 흰 배경 전면 점유. 트리거는 index.ejs:1391 `<button id=\"btnLoadSnapshot\" ...>저장내역</button>` + :19660 `addEventListener('click', () => goSnapshotPage())`",
   "ordering": "desc",
   "orderingEvidence": "서버 ORDER BY — services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/repository/QuoteSnapshotRepository.java:37 `ORDER BY q.savedAt DESC` (findHistory), :47 동일(findAllHistory), :62 동일(findByCustomer). FE 재정렬 없음 — index.ejs:17434-17443 은 날짜 필터만 하고 그대로 렌더 `const filtered = data.filter(item => {...}); renderSnapshotTable(filtered);`. renderSnapshotTable(index.ejs:17860-17888)에 sort/reverse 없음(`list.forEach((item, index) => ...)`).",
   "dataSource": "google.script.run.getQuoteHistory(sDate,eDate) / .getQuoteHistoryByCustomer(custName) → clients/web/estimate-app/lib/code.js:2495 `GET ${SNAPSHOT_BASE}` , :2512 `GET ${SNAPSHOT_BASE}/by-customer` → slip-service `/internal/estimates/snapshots`",
   "itemCountObserved": "코드상 상한 — 날짜조회: 서버 limit 없음(UI 안내 `※ 최대 7일 조회가능` index.ejs:2154) / 거래처조회: 최근 30건(QuoteSnapshotRepository.java:55-56 `호출자(서비스)가 Pageable.ofSize(30) 으로 limit 을 전달한다`). 실 DB 행 수는 **미판정** — 본 조사에 Docker 실행이 금지되어 psql 접속 불가.",
   "isTarget": false,
   "notes": "이미 [저장내역] 버튼 → 전면 페이지로 분리돼 있어 \"문서 안에 한꺼번에 펼쳐짐\"에 해당하지 않음. ▸복원 동작 있음 — 행마다 `<button ... onclick=\"restoreSnapshot(index)\">복원</button>` (index.ejs:17884), 핸들러 :17891-17896 `window.editingSnapshotId = item?.id || null; applySnapshot(...)`. 복원 후 저장은 **덮어쓰기** — code.js:2481 `snapshotId ? ax.put(...) : ax.post(...)`. 즉 한 문서의 버전 체인이 아니라 저장본 목록이며, `window.editingSnapshotId` 는 grep 전수 결과 설정(:17893)·읽기(:17761) 두 곳뿐이고 초기화 지점이 없음(사실 기술, 판정 아님). ▸협업(coedit)·SSE 실시간 갱신 없음. ▸인쇄·PDF 미포함 — 출력은 `html2canvas` 가 특정 엘리먼트만 캡처(index.ejs:10830 `const target = document.querySelector('#cardPreview'); // 캡처 대상`, :10840 `html2canvas(target, ...)`), document.body 나 window.print() 경로 없음."
  },
  {
   "screen": "주문 웹(order-app) — \"주문 저장 내역\" (상단 [저장내역] 버튼)",
   "file": "clients/web/order-app/index.html:1253 (마크업) · :9520 goSnapshotPage · :9592 renderSnapshotTable · :779 버튼",
   "currentRendering": "separate-page",
   "renderingEvidence": "마크업 index.html:1253 `<div id=\"divSnapshotPage\" style=\"display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:#fff; z-index:99999; overflow:hidden;\">` / 여는 함수 index.html:9520-9546 `function goSnapshotPage() { ... page.style.display = 'block'; page.style.zIndex = '210000'; ... setTimeout(() => { loadSnapshotHistory(); }, 300); }` / 닫기 :9549-9554. 트리거 index.html:779 `<button id=\"btnLoadSnapshot\" class=\"btn\" onclick=\"goSnapshotPage()\" ...>저장내역</button>`. Modal 컴포넌트·backdrop 없음, 전면 100% 점유.",
   "ordering": "desc",
   "orderingEvidence": "서버 파생 쿼리메서드 — services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderDraftRepository.java:19 `Page<PartnerOrderDraft> findAllByPartnerCodeOrderByCreatedAtDesc(...)`, :22 `...AndCreatedAtBetweenOrderByCreatedAtDesc`, :29 `...GreaterThanEqualOrderByCreatedAtDesc`, :35 `...LessThanEqualOrderByCreatedAtDesc` (호출부 PartnerOrderDraftService.java:105-119). FE 재정렬 없음 — index.html:9571-9583 은 날짜 필터만 후 `renderSnapshotTable(filtered)`; renderSnapshotTable(:9592-9626)에 sort/reverse 없음.",
   "dataSource": "google.script.run.getOrderSnapshotHistory(bizNo,sDate,eDate) → clients/web/order-app/src/samhanApi.ts:355 `getOrderSnapshotHistory: (args) => fetchAllPages('/partner-orders/drafts', draftHistoryParams(args), 20)` → partner-order-service `GET /api/v1/partner-orders/drafts`",
   "itemCountObserved": "페이지 크기 20 이지만 `fetchAllPages` 가 전 페이지를 이어붙임(samhanApi.ts:355) → 기간 내 전건이 한 화면. UI 안내 `※ 최대 7일 조회가능`(index.html:1274). 실 DB 행 수 **미판정**(Docker 금지로 조회 불가).",
   "isTarget": false,
   "notes": "estimate-app 과 동일 계보의 legacy 화면. 이미 버튼→전면 페이지. ▸복원 있음 — index.html:9621 `<button ... onclick=\"restoreSnapshot(${index})\">복원</button>`, 핸들러 :9628-9632 `const dec = decodeBase64(item.data); applySnapshot(dec, item.custName);`. estimate-app 과 달리 editingSnapshotId 개념 없음(전수 grep 결과 order-app 0건) → 복원 후 저장은 항상 신규 행. ▸SSE/coedit 없음. ▸인쇄·PDF 미포함 — index.html:9316-9319 이 전용 `wrapper` 엘리먼트를 만들어 `html2canvas(wrapper, ...)` 로 캡처. 페이지 전체 @media print 규칙은 index.html:145 한 줄뿐이며 카탈로그 경고만 숨김."
  },
  {
   "screen": "공유 디자인시스템 — AuditOverlay (필드 단위 인라인 변경이력 + \"이력 N개 보기\" 펼침)",
   "file": "clients/web/design-system/src/components/AuditOverlay/AuditOverlay.tsx:84-160 · barrel export clients/web/design-system/src/index.ts:60",
   "currentRendering": "inline",
   "renderingEvidence": "AuditOverlay.tsx:126-136 `{olderCount > 0 ? (<button type=\"button\" className={styles['expandToggle']} onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded}>{expanded ? '이력 닫기' : `이력 ${sorted.length}개 보기`}</button>) : null}` 이어서 :138-158 `{expanded && olderCount > 0 ? (<ul className={styles['expandedList']} ...>{sorted.slice(1).map((entry) => (<li key={entry.revisionNo}>...` — 같은 컨테이너 안에서 `<ul>` 로 그 자리 펼침. Modal/Dialog/portal 사용 없음(파일 내 Modal·createPortal grep 0). 접힌 상태에서도 최신 1건은 항상 인라인 노출(:103-120).",
   "ordering": "desc",
   "orderingEvidence": "FE 정렬 — AuditOverlay.tsx:87-91 `// 최신 → 과거 정렬 (revisionNo 내림차순). 원본 mutate 금지를 위해 slice 후 sort. const sorted = useMemo(() => [...history].sort((a, b) => b.revisionNo - a.revisionNo), [history])`. 서버도 desc — services/slip-service/.../audit/repository/SlipAuditLogRepository.java:17 `List<SlipAuditLog> findBySlipIdOrderByRevisionNoDescChangedAtDesc(UUID slipId)` (호출 SlipAuditLogService.java:142).",
   "dataSource": "props 전달만(컴포넌트 자체는 fetch 없음). 계약 DTO = services/slip-service/src/main/java/com/samhanair/logis/slip/audit/web/dto/SlipAuditLogResponse.java:25-36 (`id, slipId, revisionNo, actorId, actorName, actorColor, fieldName, oldValue, newValue, changedAt`), 엔드포인트 SlipAuditLogController.java:58 `GET /slips/{id}/audit-logs`",
   "itemCountObserved": "컴포넌트 상한 없음 — 펼치면 `sorted.slice(1)` 전건 렌더(:143). 한 화면 총계 = 소비 페이지의 AuditOverlay 개수 × 각 필드 revision 수. 실 데이터 건수 **미판정**(Docker 금지).",
   "isTarget": true,
   "notes": "지시가 겨냥한 \"한꺼번에 인라인\" 패턴의 본체 컴포넌트이지만, **소비처는 본 조사 범위 밖인 clients/desktop 뿐**이다. 전수 grep(`rg --no-ignore \"AuditOverlay\"`) 결과 실제 렌더 호출은 clients/desktop/src/renderer/routes/{SlipDetailPage.tsx:4119·4137, TaxInvoiceDetailPage.tsx:589, SalesPartnerDcConfigPage.tsx:414} 등 desktop 전용. **clients/arologis-desktop·arologis-mobile·mobile·mobile-public 에는 import 0건**. ▸복원 동작 **없음** — props 는 `field/currentValue/history` 3개뿐(:57-64), onRestore 류 콜백 부재. 복원은 desktop 전용 래퍼 clients/desktop/src/renderer/components/audit/AuditOverlaySection.tsx 에 있음(범위 밖). ▸`*VersionHistoryPanel` 계열(Slip/Partner/PartnerOrder/Estimate)은 전수 grep 결과 **전부 clients/desktop 에만 존재**, design-system 컴포넌트 목록(52개)에도 없음. ▸인쇄: AuditOverlay.module.css 전문에 `@media print` 규칙 없음 — 인쇄 노출 여부는 소비 페이지 CSS 소관(desktop, 범위 밖)."
  },
  {
   "screen": "mobile-staff(영업 앱) — 전표 상세 화면의 필드별 변경이력 AuditOverlay",
   "file": "clients/mobile-staff/src/components/AuditOverlay.tsx:53-87 · clients/mobile-staff/src/screens/SlipDetailScreen.tsx:423-460",
   "currentRendering": "inline",
   "renderingEvidence": "SlipDetailScreen.tsx:423-431 `{/* PR-H2: AuditOverlay — partnerName / statusLabel 변경 이력 표시. */}` 아래 `<AuditOverlay field=\"partnerName\" currentValue={partnerName ?? null} history={auditByField['partnerName'] ?? []} />` 가 헤더 필드 행에 직접 배치. 컴포넌트 AuditOverlay.tsx:60-85 는 `<View style={styles.root}>` 안에 현재값 `<Text style={styles.current}>` + 직전값 취소선 `<Text style={styles.previous}>` + `외 {moreCount}건` 을 나란히 렌더. RN `Modal` 은 이 컴포넌트에 없음(파일 내 Modal import 0) — SlipDetailScreen 이 import 하는 RN `Modal`(:48)은 PR-H3 수정요청 사유 입력용이며 이력용이 아님. 펼침 버튼도 없음 — `외 N건` 은 `<Text>`(:79-81)이지 Touchable 이 아니다.",
   "ordering": "unknown",
   "orderingEvidence": "FE — AuditOverlay.tsx:54 `const sorted = [...history].reverse(); // 최신순 (createdAt desc).` 이고 전제는 slipAudit.ts:5 `GET /slips/{slipId}/audit-logs — 감사 로그 목록 (정렬: createdAt asc)` · :117 `slip 감사 로그 목록. createdAt asc 정렬 (BE 보장).` 이다. 그러나 실제 BE 는 **desc** — SlipAuditLogRepository.java:17 `findBySlipIdOrderByRevisionNoDescChangedAtDesc`, SlipAuditLogController.java:30 `GET /slips/{id}/audit-logs — audit timeline (최신 revision 우선)`. 전제가 반대이므로 `.reverse()` 결과의 방향을 코드만으로 확정할 수 없어 **unknown** 으로 남긴다(실행 확인 불가 — 아래 도달성 참조).",
   "dataSource": "clients/mobile-staff/src/api/slipAudit.ts:122-134 `listSlipAuditLogs` → `GET ${API_BASE_URL}/slips/{slipId}/audit-logs`; 그룹핑 SlipDetailScreen.tsx:200-207 `auditByField`",
   "itemCountObserved": "인라인 표시는 필드당 **1건**(최신 추정) + `외 N건` 라벨뿐 — AuditOverlay.tsx:55-56 `const latest = sorted[0] ?? null; const moreCount = Math.max(0, sorted.length - 1);`. 즉 이 화면은 \"한꺼번에 전부 노출\" 형태가 아니다. 실 데이터 건수 **미판정**(Docker 금지 + 아래 도달성 문제).",
   "isTarget": false,
   "notes": "🚨 **사용자 도달 불가** — 앱 진입점이 이 화면을 마운트하지 않는다. clients/mobile-staff/App.tsx:42 `<AppRootNavigator />` → clients/mobile-staff/src/screens/AppRootNavigator.tsx:13-21 이 `<EstimateWebViewScreen />` **하나만** 렌더한다(분기 없음). `SlipDetailScreen` 전수 grep 결과 렌더/네비게이션 참조 0건(주석·자기 정의만). 파일 머리말도 SlipDetailScreen.tsx:6 `mobile-staff D-AX-19 이후 = estimate WebView 단일 진입. 본 화면은 후속 영업/창고 native 진입 후보로 보존.` ▸참고로 응답 스키마도 어긋나 있다(실측): FE 기대 slipAudit.ts:49-67 = `field / previousValue / newValue / actorFullName / actorRole / createdAt` vs BE 실제 SlipAuditLogResponse.java:25-36 = `fieldName / oldValue / newValue / actorName / changedAt`(+`revisionNo`,`actorColor`). ▸복원 동작 **있음** — SlipDetailScreen.tsx:432-441 `<TouchableOpacity onPress={() => onRevert(auditByField['partnerName']![auditByField['partnerName']!.length - 1].id)} ...><Text>{reverting ? '복원 중…' : '직전 값으로 복원'}</Text>`; MASTER/MANAGER 만(:210 `canRevert`). 배열 **마지막 원소**를 \"직전\"으로 집는데, 이는 위 정렬 전제(asc)에 의존한다. ▸협업/실시간 **있음** — SlipDetailScreen.tsx:219-234 SSE 구독에서 `evt.type === 'slip.edit'` 수신 시 `load()` 재호출(감사로그 재조회 포함, :157 `listSlipAuditLogs(token, slipId)`). ▸같은 화면의 SlipDetailScreen.tsx:539-542 `처리 완료 이력`(수정요청 APPROVED/REJECTED)은 인라인이지만 **버전이력이 아니라 요청 처리 기록**이다. ▸인쇄/PDF 경로 없음(RN 화면)."
  },
  {
   "screen": "아로로지스 데스크톱 — 미배차 / 운송사 실배차 비교 화면의 \"저장내역\" 탭",
   "file": "clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx:84-141 · 소비처 UnassignedPage.tsx:379-385, DispatchReconcilePage.tsx:797-803",
   "currentRendering": "tab",
   "renderingEvidence": "UnassignedPage.tsx:260-266 `<Tabs tabs={[{ label: '실행', testId: 'unassigned-history-tab-run' }, { label: '저장내역', testId: 'unassigned-history-tab-list' }]} activeIndex={activeTab} onTabChange={setActiveTab} ariaLabel=\"미배차 저장내역 탭\">` 의 두 번째 자식으로 :379 `<HistoryTab programType=\"UNASSIGNED\" ... />`. DispatchReconcilePage.tsx:382-390 도 동일 구조(`{ label: '저장내역', testId: 'dispatch-reconcile-history-tab-list' }`, ariaLabel=\"운송사 실배차 저장내역 탭\") + :797 `<HistoryTab programType=\"RECONCILE\" ... />`. HistoryTab 자체는 `<section>` + `<DataGrid>`(:84-141)이며 Modal 사용 없음(같은 파일이 쓰는 Modal 계열은 별도 `SaveDialog` 로 저장용).",
   "ordering": "desc",
   "orderingEvidence": "서버 고정 정렬 — services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/DispatchSaveHistoryController.java:101 `Sort.by(Sort.Direction.DESC, \"createdAt\")`. FE 재정렬 없음 — HistoryTab.tsx:77-80 `const rows: HistoryGridRow[] = (historyQuery.data?.content ?? []).map((row, index) => ({ ...row, __index: index }))` 는 인덱스만 부여.",
   "dataSource": "clients/arologis-desktop/src/renderer/api/dispatchSaveHistoryApi.ts:79-95 `listDispatchHistory` → `GET /admin/arologis/dispatches/history` (params: programType, mode, page, size)",
   "itemCountObserved": "기본 페이지 크기 **50** — dispatchSaveHistoryApi.ts:86 `size: opts.size ?? 50`. 기본 조회 조건은 이달 1일~오늘 + 모드 `MANUAL_NAMED` — HistoryTab.tsx:56-58 `useState(today.slice(0, 8) + '01')` / `useState(today)` / `useState<DispatchSaveMode | 'ALL'>('MANUAL_NAMED')`. 실 DB 행 수 **미판정**(Docker 금지).",
   "isTarget": false,
   "notes": "전표·문서가 아니라 **배차 실행 결과 저장본** 목록이고, 이미 별도 탭으로 분리돼 있어 \"한꺼번에 인라인\" 문제에 해당하지 않는다. ▸복원 동작 **있음** — HistoryTab.tsx:138 `onRowClick={(row) => void handleRestore(row.id)}` → :67-75 `const detail = await api.detail(id); onRestore(detail)`; 복원 결과 안내는 clients/arologis-desktop/src/renderer/routes/dispatches/RestoredBanner.tsx. 행 클릭 자체가 복원이라 모달로 옮길 경우 이 클릭 의미도 함께 가야 한다. ▸실시간/coedit 없음(react-query 수동 조회, SSE 구독 없음). ▸인쇄/PDF 경로 없음. ▸ManualDispatchPage.tsx:355 · DispatchReconcilePage.tsx:373 의 \"변경 이력 자동 추적 (PR-H4c)\" / \"감사 추적 (수정 이력) 은 원 dispatch 화면에서 자동\" 은 **안내 문구일 뿐 이력을 렌더하지 않는다**(해당 파일에 audit 데이터 fetch·렌더 없음)."
  },
  {
   "screen": "아로로지스 데스크톱 — 직원 관리 \"롤 변경 이력\" (이미 모달)",
   "file": "clients/arologis-desktop/src/renderer/routes/admin/EmployeesPage.tsx:640-652 (모달) · :153-155 (트리거 버튼)",
   "currentRendering": "modal",
   "renderingEvidence": "EmployeesPage.tsx:640 `<Modal open onClose={onClose} title=\"롤 변경 이력\" description={`${employee.fullName} (${employee.loginId})`} size=\"xl\">` 안에 `<DataGrid columns={columns} rows={historyQuery.data ?? []} ... emptyMessage=\"롤 변경 이력이 없습니다.\" />`(:644-651). 트리거는 :153-155 `<Button size=\"sm\" variant=\"ghost\" onClick={() => setModal({ mode: 'history', employee: row })}>이력</Button>`. 보조 근거로 :428 `hint=\"롤 변경은 별도 이력 모달에서 처리합니다.\"`.",
   "ordering": "desc",
   "orderingEvidence": "서버 파생 쿼리 — services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/ArologisEmployeeService.java:142 `historyRepository.findAllByEmployeeIdAndIsDeletedFalseOrderByCreatedAtDesc(employee.getId())`, 리포지토리 ArologisRoleChangeHistoryRepository.java:14 동일 시그니처. FE 재정렬 없음 — EmployeesPage.tsx:619-635 는 컬럼 정의만(`{ key: 'changedAt', label: '변경시각', width: 170, format: (v) => formatDateTime(String(v)) }`).",
   "dataSource": "clients/arologis-desktop/src/renderer/api/arologisHr.ts:143-148 `listRoleHistories(loginId)` → `GET /admin/arologis/hr/employees/{loginId}/role-histories` (컨트롤러 ArologisHrController.java:100)",
   "itemCountObserved": "페이지네이션 없음 — 서버가 해당 직원의 전건을 List 로 반환(ArologisEmployeeService.java:141-145). 실 DB 행 수 **미판정**(Docker 금지).",
   "isTarget": false,
   "notes": "**이미 [이력] 버튼 → 모달 + 시간 내림차순**이라 지시가 요구하는 최종 형태를 이미 충족한다. 다만 대상은 전표·문서가 아니라 직원 롤 변경 기록이다. 지시를 구현할 때 이 화면을 **참조 구현(패턴 선례)** 으로 삼을 수 있다. ▸복원 동작 없음(read-only DataGrid, 액션 컬럼 없음). ▸실시간/coedit 없음. ▸인쇄/PDF 경로 없음."
  },
  {
   "screen": "종합견적 웹(estimate-app) — \"발송내역\" (참고: 버전이력 아님)",
   "file": "clients/web/estimate-app/views/index.ejs:1976 (마크업) · :13706-13725 (버튼 핸들러) · :13825-13840 (렌더)",
   "currentRendering": "separate-page",
   "renderingEvidence": "마크업 index.ejs:1976 `<div id=\"pageHistory\" class=\"hidden\" style=\"position:fixed; inset:0; background:#fff; z-index:9000; display:flex; flex-direction:column;\">`. 전환 index.ejs:13712-13718 `const pOrder = document.getElementById('pageOrder'); const pHist = document.getElementById('pageHistory'); if (pOrder) pOrder.classList.add('hidden'); if (pHist) { pHist.classList.remove('hidden'); pHist.style.zIndex = '210000'; }`. 트리거 index.ejs:1387 `<button id=\"btnHistory\" class=\"btn\" style=\"background:#f97316; color:#fff;\">발송내역</button>`. Modal 아님 — 페이지 교체.",
   "ordering": "desc",
   "orderingEvidence": "FE 정렬 — index.ejs:13836 `data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));` (renderHistoryTable 내부, :13825 시작).",
   "dataSource": "google.script.run.getNotionHistory(sDate, eDate, dateField) (index.ejs:13821) → clients/web/estimate-app/lib/code.js:2442-2449 `GET ${BASE_URL}/api/v1/partner-orders?startDate=&endDate=`",
   "itemCountObserved": "코드상 클라이언트 상한 없음(응답 전건 렌더). 실 건수 **미판정**(Docker 금지).",
   "isTarget": false,
   "notes": "**버전이력이 아니다** — 한 문서의 판본 목록이 아니라 출고/발송 업무 기록 목록이다. 개발책임자 지시의 \"버전이력\"과 이름(`이력`/`History`)만 겹치므로 혼동 방지를 위해 실측 결과에 포함했다. 복원·coedit·인쇄 연결 없음."
  },
  {
   "screen": "주문 웹(order-app) — \"주문이력\" (참고: 버전이력 아님)",
   "file": "clients/web/order-app/index.html:999 (마크업) · :8831-8845 fetchOrderHistory · :8850-8892 renderHistory",
   "currentRendering": "separate-page",
   "renderingEvidence": "마크업 index.html:999 `<div id=\"pageHistory\" class=\"hidden\" style=\"position:relative; height:100%; display:flex; flex-direction:column;\">` + 표 본체 :1025 `<tbody id=\"historyBody\"></tbody>`. 전환은 body 클래스 스위치 — index.html:247 `body.history-active .grid { display: none !important; } body.history-active #pageHistory { display: flex !important; }`. Modal 아님 — 그리드 화면을 숨기고 이력 화면으로 교체.",
   "ordering": "desc",
   "orderingEvidence": "FE 정렬 — index.html:8858-8867 `data.sort((a, b) => { if (type === '주문일시') { const d1 = a.orderDate ? new Date(a.orderDate).getTime() : 0; const d2 = b.orderDate ? new Date(b.orderDate).getTime() : 0; return d2 - d1; } else { ... return d2 - d1; } });` (d2-d1 = 최신 우선). 서버도 desc — services/partner-order-service/.../repository/PartnerOrderRepository.java:50 `findAllByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc`, :54 partnerCode 변형(호출 PartnerOrderHistoryService.java:70-75).",
   "dataSource": "google.script.run.getOrderHistory(bizNo, type, s, e) (index.html:8844) → clients/web/order-app/src/samhanApi.ts:314-318 `getOrderHistory: ([bizCode, , from, to]) => fetchAllPages('/partner-orders/history', ...)`",
   "itemCountObserved": "`fetchAllPages` 로 전 페이지 이어붙여 한 화면에 전건(samhanApi.ts:314-318). 실 건수 **미판정**(Docker 금지).",
   "isTarget": false,
   "notes": "**버전이력이 아니다** — 확정 주문 기록 목록. 각 행의 [자세히] 버튼(index.html:8886)은 상세 **모달**을 연다(:8894 `window.openDetail`). 혼동 방지 목적의 참고 항목이며, 복원·coedit 없음."
  }
 ]
}
```

---

## 회수 2

```json
{
 "surfaces": [
  {
   "screen": "견적서 상세 — \"버전 이력\" 패널 (/sales/estimates/:id)",
   "file": "clients/desktop/src/renderer/components/audit/EstimateVersionHistoryPanel.tsx:142-148, 237-315",
   "currentRendering": "inline",
   "renderingEvidence": "패널 자체가 상시 렌더되는 Card 다. :142 `<Card padding={4} shadow=\"sm\" style={{ marginTop: 24 }} data-testid=\"estimate-version-history-panel\">` → :148 `<h4 style={{ marginTop: 0 }}>버전 이력</h4>` → :237 `<ul data-testid=\"estimate-version-history-list\" ...>` → :241 `{revisions.map((rev) => {`. 여는 토글/버튼 state 가 없다 — 이 파일의 useState 는 :106 restoreTarget(복원 confirm modal), :108 toast 둘뿐이다. 마운트 경로: EstimateCollaborationPanel.tsx:574 `<EstimateVersionHistoryPanel` → EstimateDetailPage.tsx:758(데스크톱, 합계 Card 직후) / :735(모바일, `<MobileCollapsible title=\"코멘트\" defaultOpen>` 내부). 이 파일 안의 `<Modal` 은 :319 하나뿐이고 그것은 `title=\"견적서 복원\"` confirm 이지 이력 목록이 아니다.",
   "ordering": "desc",
   "orderingEvidence": "서버가 정한다. services/slip-service/.../revision/repository/EstimateRevisionRepository.java:40 `List<EstimateRevision> findByEstimateIdOrderByRevisionNoDesc(UUID estimateId);` · 같은 파일 :52 native `ORDER BY revision_no DESC` · EstimateRevisionService.java:212-213 주석 `// 응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다` + `java.util.Collections.reverse(responses);` (인접 비교용으로 :191 에서 ASC 정렬했다가 되돌림). Controller EstimateRevisionController.java:63-68 `@GetMapping(\"/revisions\")` → `revisionService.listWithSummary(estimateId)`. FE 재정렬 없음 — EstimateVersionHistoryPanel.tsx:137-139 은 `Array.isArray(revisionsQuery.data) ? revisionsQuery.data : []` 이고 :241 에서 그대로 map 한다(`sort` 호출 0건).",
   "dataSource": "GET /api/v1/slips/estimates/{estimateId}/revisions — clients/desktop/src/renderer/api/estimateRevision.ts:69 `listRevisions`, react-query key `['estimateRevisions', estimateId]` (EstimateVersionHistoryPanel.tsx:114). 복원은 POST .../revisions/{revisionNo}/restore (estimateRevision.ts:85).",
   "itemCountObserved": "실 DB(samhan-postgres, slip_db) 실측 — `SELECT count(*) FROM estimate_revisions WHERE is_deleted=FALSE` = 47행 / 견적 24건. 건별 분포: 7건 1개(estimate_no 2026/07/16-9) · 4건 3개 · 2건 8개 · 1건 12개. 한 화면 최대 = 7행. 페이지네이션 없음 — 컨트롤러가 `List<>` 를 Pageable 없이 전량 반환(EstimateRevisionController.java:65-68).",
   "isTarget": true,
   "notes": "복원 동작이 붙어 있다 — :297-311 각 과거 행에 `이 시점으로 복원` Button(testid `estimate-version-history-restore-button-{n}`), :319-353 DS Modal confirm(`복원` 버튼 testid `estimate-version-history-restore-confirm`). 최신 행은 버튼 미노출(:244 `isLatest`). 편집 불가 상태(QUOTE_ACCEPTED/CONVERTED/REJECTED)면 :303 `disabled={!restorable ...}` + :151-162 안내 문구. ⟹ 모달로 옮기면 복원 버튼·confirm Modal(모달 안의 모달)·상태 안내가 함께 가야 한다.\n협업 중 실시간 갱신: 걸려 있다 — EstimateCollaborationPanel.tsx:169-176 SSE 구독이 `invalidateQueries({ queryKey: ['estimateRevisions', estimateId] })`(:174), 수정완료 mutation 도 :246 에서 무효화. EstimateDetailPage.tsx:211 도 무효화.\n인쇄: 들어가지 않는다 — 인쇄는 별도 라우트 `/sales/estimates/:estimateNumber/print`(EstimateDetailPage.tsx:204, routes/index.tsx:550 `<QuoteView />`) 이고 print/QuoteView.tsx(253줄)에 `버전|이력|revision|history` 매치 0건.\n🚨 계약이 고정돼 있다(모달 전환 시 RED): ① clients/desktop/src/renderer/routes/line-input-ux-r23.contract.test.ts:31-36 이 `components/audit/EstimateVersionHistoryPanel.tsx` 파일 본문에 `markEstimateRestoreFence(estimateId, restored.version)` 이 있을 것을 파일 단위로 단언 — 파일을 쪼개면 깨진다. ② clients/desktop/playwright/estimate-version-history/estimate-version-history.spec.ts:75-76 이 페이지 진입 직후 `estimate-version-history-panel` · `estimate-version-history-list` 를 `toBeVisible()` 로 단언(버튼 클릭 없음). ③ 모바일 라벨 CSS 가 testid 로 스코프됨 — styles/global.css:792 `.mobile-section-body [data-testid='estimate-version-history-panel'] h4 { display: block; }`.\n⚠️ PR #1078(feat/1075-estimate-product-candidate-modal)의 \"버전 복원\" 언급은 이 패널 UI 가 아니라 EstimateFormPage 의 `consumeEstimateRestoreFence` 무회귀 불변식이다(PR 본문 불변식 4). EstimateFormPage.tsx 에는 버전이력 UI 가 없다 — `CollaborationPanel|VersionHistory` grep 0건, :895 는 fence 주석뿐."
  },
  {
   "screen": "거래처 주문 상세 — \"버전 이력\" 패널 (/sales/partner-orders/:id)",
   "file": "clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx:206-212, 304-398",
   "currentRendering": "inline",
   "renderingEvidence": ":206 `<Card padding={4} shadow=\"sm\" style={{ marginTop: 24 }} data-testid=\"partner-order-version-history-panel\">` → :212 `<h4 style={{ marginTop: 0 }}>버전 이력</h4>` → :304 `<ul data-testid=\"partner-order-version-history-list\"` → :315 `{revisions.map((rev) => {`. 열고 닫는 state 없음(useState 는 :154 restoreTarget, :157 toast 둘). 마운트: PartnerOrderCollaborationPanel.tsx:571 → SalesPartnerOrderDetailPage.tsx:1379(데스크톱) / :1364(모바일 `<MobileCollapsible title=\"코멘트\" defaultOpen>` 내부). 파일 내 `<Modal` 은 :402 복원 confirm 하나뿐(`title=\"주문 복원\"`).",
   "ordering": "desc",
   "orderingEvidence": "서버. services/partner-order-service/.../revision/repository/PartnerOrderRevisionRepository.java:31 `findByPartnerOrderIdOrderByRevisionNoDesc` · service/PartnerOrderRevisionService.java:357-358 `// 응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다` + `Collections.reverse(responses);` · web/PartnerOrderRevisionController.java:82 `@return revisionNo 내림차순 버전 목록`, :95 `revisionService.listWithSummary(resolvedOrderId)`. FE 재정렬 없음 — Panel :201-203 `Array.isArray(...) ? revisionsQuery.data : []` 후 :315 그대로 map.",
   "dataSource": "GET /api/v1/partner-orders/{orderId}/revisions — react-query key `['partner-order-revisions', orderId]` (PartnerOrderVersionHistoryPanel.tsx:166). 복원 POST .../revisions/{n}/restore (:172).",
   "itemCountObserved": "실 DB(partner_order_db) 실측 — `SELECT count(*) FROM partner_order_revisions WHERE is_deleted=FALSE` = 568행 / 주문 567건. 분포: 2건 1개(order_no 2026/07/07-9001) · 1건 566개. 한 화면 최대 = 2행. 즉 이 표면은 현재 실데이터상 \"한꺼번에 많이 나오는\" 상태가 아니다.",
   "isTarget": true,
   "notes": "복원 동작 있음 — :381-394 `이 시점으로 복원` 버튼, :402-437 DS Modal confirm. 복원 성공 시 :182-193 `slipResyncRequired` 면 경고 토스트(판매전표 재발행 확인). 복원 불가 상태(CONFIRMING/CANCELED) 안내 :215-228.\n🚨 협업 중 실시간 갱신이 없다 — PartnerOrderCollaborationPanel.tsx 의 SSE 핸들러 :169-176 이 무효화하는 키는 commentQueryKey · orderQueryKey · ['partner-orders'] 셋뿐이고 `['partner-order-revisions']` 가 없다. 파일 전체 `invalidateQueries` 8곳(:171,172,173,184,191,198,244,245) 어디에도 revisions 키가 없다. 갱신은 이 패널 자신의 복원 mutation(:180)에서만 일어난다. (견적은 반대로 걸려 있음 — 두 계열이 비대칭이다. 사실 보고이며 결함 판정은 미판정.)\n인쇄: 별도 BE 경로 — SalesPartnerOrderDetailPage.tsx:509 `/api/v1/partner-orders/{orderId}/print`. 버전이력 미포함.\n계약 고정: clients/desktop/playwright/phase-2-4-partner-order-restore/phase-2-4-partner-order-restore.spec.ts:95-99 주석 `패널은 주문 상세 카드 하단에 항상 배치되므로 orderId 로 바로 진입` + `expect(page.getByTestId('partner-order-version-history-panel')).toBeVisible()`. styles/global.css:793 모바일 h4 스코프 규칙."
  },
  {
   "screen": "분개전표(회계전표) 상세 — \"수정 이력\" 패널 (/accounting/journals/:id)",
   "file": "clients/desktop/src/renderer/components/collab/JournalCollaborationPanel.tsx:578-660",
   "currentRendering": "inline",
   "renderingEvidence": ":578 `<Card as=\"section\" aria-label=\"수정 이력\" padding={4} shadow=\"sm\" style={{ marginTop: 24, width: '100%' }} data-testid=\"journal-collab-edit-history-panel\">` → :586 `<h4 style={{ marginTop: 0 }}>수정 이력</h4>` → :587-590 `<div data-testid=\"journal-collab-edit-list\" style={{ ... maxHeight: 320, overflowY: 'auto' }}>` → :599 `edits.map((edit) => {`. 토글 없음. 마운트: JournalDetailPage.tsx:586(데스크톱) / :572(모바일 MobileCollapsible \"코멘트\").",
   "ordering": "desc",
   "orderingEvidence": "서버. services/accounting-service/.../web/collab/JournalCollabController.java:182-184 `suggestionRepository.findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(CollabDocumentType.ACCOUNTING_VOUCHER, journalId, CollabSuggestionStatus.ACCEPTED)`. FE 재정렬 없음 — JournalCollaborationPanel.tsx:294 `const edits: JournalCollabEdit[] = Array.isArray(editsQuery.data) ? editsQuery.data : []` 후 :599 그대로 map(파일 내 `sort(` 는 :172 라인 정렬 1건뿐, edits 미적용).",
   "dataSource": "GET /api/v1/accounting/journals/{journalId}/collab/edits — clients/desktop/src/renderer/api/journalCollab.ts:90 `getJournalCollabEdits`. 패널 query 정의 :181-185.",
   "itemCountObserved": "실 DB(accounting_db) 실측 — `SELECT status, count(*) FROM journal_collab_suggestions GROUP BY status` = **0행**. ACCEPTED 건 0. ⟹ 로컬 실데이터로는 이 표면의 실제 항목 수를 셀 수 없다(발화 조건 0). 화면 상 개수 **미판정**.",
   "isTarget": true,
   "notes": "🚨 분개전표에는 \"버전이력\"이 존재하지 않는다 — full-snapshot revision/restore API·패널 자체가 없다. 근거: docs/dev-reports/2026-07-06-31-history-unify.md:25 `Journal | ... 확인 가능한 것은 /accounting/journals/{id}/audit-logs 감사 로그 계열이며, full-snapshot revision/restore API·패널은 없음.` 과거 있던 격차 안내 카드 `journal-version-history-gap` 은 제거됨(JournalCollaborationPanel.coedit.test.tsx:75 `expect(screen.queryByTestId('journal-version-history-gap')).toBeNull()`, playwright/journal-collab/journal-collab-panel.spec.ts:98 `toHaveCount(0)`). 대신 놓인 것이 이 \"수정 이력\"(changeSet diff)이다.\n복원 동작 없음 — 이 파일에 `복원|restore|Restore` 매치 0건. 읽기 전용 표시이고, 행 클릭은 :621-627 `setActiveFieldPath(diff.fieldName)` 로 코멘트 앵커 하이라이트만 한다.\n협업 실시간 갱신 있음 — :203-211 SSE 가 editQueryKey 무효화(:206).\n인쇄: 분개전표 상세에 print 경로 매치 0건(JournalDetailPage.tsx 에 `print|인쇄` 0건).\n⚠️ 개발책임자 지시의 \"버전이력\"이 이 \"수정 이력\"까지 포함하는지는 **미판정** — 라벨이 다르고 복원이 없다. 적용 여부 확인 필요."
  },
  {
   "screen": "결재문서(그룹웨어 결재) 상세 — \"수정 이력\" 패널 (/groupware/approvals/:id)",
   "file": "clients/desktop/src/renderer/components/collab/GroupwareApprovalCollaborationPanel.tsx:686-770",
   "currentRendering": "inline",
   "renderingEvidence": ":686 `<Card as=\"section\" aria-label=\"수정 이력\" padding={4} shadow=\"sm\" style={{ marginTop: 24, width: '100%' }} data-testid=\"groupware-approval-collab-edit-history-panel\">` → :694 `<h4 style={{ marginTop: 0 }}>수정 이력</h4>` → :695-698 `<div data-testid=\"groupware-approval-collab-edit-list\" style={{ ... maxHeight: 320, overflowY: 'auto' }}>`. 토글 없음. 마운트: GroupwareApprovalDetailPage.tsx:717 `<GroupwareApprovalCollaborationPanel`(페이지 최하단, 모바일/데스크톱 분기 없이 1회).",
   "ordering": "desc",
   "orderingEvidence": "서버. services/groupware-service/.../controller/GroupwareApprovalCollabController.java:189-191 `suggestionRepository.findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(CollabDocumentType.APPROVAL_LINE, approvalId, CollabSuggestionStatus.ACCEPTED)`. FE 재정렬 없음 — 패널 :366 `Array.isArray(editsQuery.data) ? editsQuery.data : []`.",
   "dataSource": "GET /api/v1/groupware/approvals/{approvalId}/collab/edits — clients/desktop/src/renderer/api/groupwareApprovalCollab.ts:99 `getGroupwareApprovalCollabEdits`. 패널 query :210-213.",
   "itemCountObserved": "실 DB(groupware_db) 실측 — `SELECT status, count(*) FROM approval_collab_suggestions GROUP BY status` = **0행**. ⟹ 화면 상 개수 **미판정**(발화 데이터 0).",
   "isTarget": true,
   "notes": "🚨 결재문서도 버전이력(full-snapshot revision/restore)이 없다 — docs/dev-reports/2026-07-06-31-history-unify.md:26 `GroupwareApproval | ... groupware_audit_logs 계열은 있으나 결재 full-snapshot revision/restore API·패널은 없음.` 격차 안내 카드 `groupware-approval-version-history-gap` 제거됨(GroupwareApprovalCollaborationPanel.coedit.test.tsx:159 `toBeNull()`).\n복원 동작 없음 — 파일 내 `복원|restore|Restore` 매치 0건.\n협업 실시간 갱신 있음 — :285-293 SSE 가 editQueryKey 무효화(:288).\n인쇄: 별도 라우트 `/groupware/approvals/:id/print`(GroupwareApprovalDetailPage.tsx:397·:461, routes/index.tsx:379-384 `<ApprovalDocView />`). ApprovalDocView.tsx 의 `revision`(:158-160 `approval?.documentTemplateRevision`, `findDocumentTemplateRevision`)은 **문서양식 pin 개정번호**이지 이력 목록이 아니다 — 인쇄물에 이력 목록 없음.\n참고: 같은 페이지 :532 `<h4>결재선</h4>` + :550 `approval.steps.map` 은 결재 진행 단계이지 버전이력이 아니다(대상 아님)."
  },
  {
   "screen": "결재 문서 양식 관리 (/groupware/document-templates) — \"개정 번호\" 열",
   "file": "clients/desktop/src/renderer/routes/GroupwareDocumentTemplateAdminPage.tsx:81",
   "currentRendering": "none",
   "renderingEvidence": ":81 `<td role=\"cell\" data-label=\"개정 번호\">{row.revision}</td>` — 표의 스칼라 1개 열이다. 시간순 항목 목록·타임라인·복원 액션이 없다. 이 파일 전체에서 `버전|이력|history` 매치 0건(`revision` 은 이 한 줄뿐).",
   "ordering": "none",
   "orderingEvidence": "항목 목록 자체가 없어 정렬 개념이 성립하지 않는다. 표 정렬은 `listDocumentTemplates`(api/documentTemplate.ts) 응답 순서를 그대로 쓰며 이력과 무관.",
   "dataSource": "listDocumentTemplates — react-query key ['groupwareDocumentTemplates'] (:26)",
   "itemCountObserved": "해당 없음 (이력 목록 없음)",
   "isTarget": false,
   "notes": "\"문서양식\" 계열에서 버전이력 표면을 찾았으나 **없다**. DocumentTemplateEditorPage.tsx 는 `버전|이력|revision|history|snapshot` 매치 0건, GroupwareApprovalTemplateAdminPage.tsx·GroupwareApprovalCreatePage.tsx 도 0건. 개정 번호는 인쇄 시 각인(pin)용 스칼라다(print/ApprovalDocView.tsx:158-160)."
  },
  {
   "screen": "(참고·범위 밖) 거래처 상세 다이얼로그 — \"버전 이력\" 탭 : 이미 모달 안",
   "file": "clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx:323-329",
   "currentRendering": "modal",
   "renderingEvidence": ":217 `<Modal` … :333 `</Modal>` 안쪽 Tabs 의 5번째 탭이다. :73 `const TABS = ['기본정보', '단가/할인 정책', '배송지', '담당자', '버전 이력'] as const` · :323 주석 `{/* 탭 5: 버전 이력 + 복원 (Phase 2.3 Task 6) — 조회 권한 보유 시에만 mount */}` · :325 `<PartnerVersionHistoryPanel partnerCode={...} status={...} />` · :259-260 `tabs={visibleTabs} activeIndex={...}`. 패널 본문은 components/audit/PartnerVersionHistoryPanel.tsx:148 `<h4>버전 이력</h4>`.",
   "ordering": "desc",
   "orderingEvidence": "services/partner-service/.../revision/repository/PartnerRevisionRepository.java:28 `findByPartnerIdOrderByRevisionNoDesc` · service/PartnerRevisionService.java:272 호출, :314 `java.util.Collections.reverse(responses);`",
   "dataSource": "GET /api/v1/partners/{partnerCode}/revisions — react-query key ['partnerRevisions', partnerCode] (PartnerDetailDialog.tsx:115-116 주석)",
   "itemCountObserved": "미측정 — 이번 조사 범위(견적·문서 계열) 밖이라 partner_db 카운트를 세지 않았다. **미판정**.",
   "isTarget": false,
   "notes": "지시 5번 항목(\"이미 모달인 것\")에 해당하는 **유일한 선례**다. 단 형태가 다르다 — \"버전이력\" 버튼→전용 모달이 아니라, 이미 모달인 거래처 상세 다이얼로그의 **5번째 탭**이다. 이 표면 자체는 지시(\"변경\")의 대상이 아니지만, 다른 계열을 모달로 옮길 때 참조 가능한 기존 패턴으로 보고한다. 견적·주문 계열과 달리 모바일 CSS 스코프 규칙(global.css:791-795)에 이 testid 는 없다."
  },
  {
   "screen": "(참고·타 트랙 범위) 판매전표 상세 — \"버전 이력\" 패널 (/sales/:id)",
   "file": "clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx:243-249, 324-425",
   "currentRendering": "inline",
   "renderingEvidence": ":243 `<Card padding={4} shadow=\"sm\" style={{ marginTop: 24 }} data-testid=\"slip-version-history-panel\">` → :249 `<h4 style={{ marginTop: 0 }}>버전 이력</h4>` → :324 `<ul data-testid=\"slip-version-history-list\"` → :328 `revisions.map((rev) => {`. 토글 없음. 마운트: SlipCollaborationPanel.tsx:517 → SlipDetailPage.tsx:4831(데스크톱) / :4815(모바일 MobileCollapsible \"코멘트\"). 파일 내 `<Modal` 은 :429 복원 confirm 하나.",
   "ordering": "desc",
   "orderingEvidence": "services/slip-service/.../revision/repository/SlipRevisionRepository.java:40 `findBySlipIdOrderByRevisionNoDesc` · :58 `findSnapshotRowsBySlipIdOrderByRevisionNoDesc` · service/SlipRevisionService.java:187 호출.",
   "dataSource": "GET /api/v1/slips/{slipId}/revisions — react-query key ['slipRevisions', slipId] (SlipDetailPage.tsx:1608-1609 주석: `slip:restored / slip:edit / slip:reverted → 버전이력 재조회`)",
   "itemCountObserved": "실 DB(slip_db) 실측 — `SELECT count(*) FROM slip_revisions WHERE is_deleted=FALSE` = 195행 / 전표 135건. 분포: 4건 2개 · 3건 9개 · 2건 36개 · 1건 88개. 한 화면 최대 = 4행.",
   "isTarget": true,
   "notes": "개발책임자 지시의 \"전표\"에 정면으로 해당하지만 **내 배정 범위(견적·문서 계열) 밖**이다 — 타 트랙 조사와 중복될 수 있으니 그쪽 보고를 정본으로 삼을 것. 여기 적은 것은 견적·주문 패널의 원본(미러 기준)이라 확인한 범위만 기록한 것이다. 견적/주문과 다른 점: field-level `fieldChanges` 가 있어 :335-340 필드 단위 하이라이트가 되고(견적·주문은 row-level 근사, EstimateVersionHistoryPanel.tsx:42-47 주석), 복원 버튼 testid 는 `slip-version-history-restore-button-{n}`(:412). 모바일 44px 터치타겟 규칙이 이 testid 에 걸려 있다(global.css:807-810)."
  }
 ]
}
```

---

## 회수 3

```json
{
 "surfaces": [
  {
   "screen": "전표 상세 (데스크톱) — 하단 \"버전 이력\" 패널 · 판매전표 /sales/:id · 구매전표 /purchases/:id 공용",
   "file": "clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx:242 (패널 본체) · 마운트 clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.tsx:517 · 페이지 마운트 clients/desktop/src/renderer/routes/SlipDetailPage.tsx:4831",
   "currentRendering": "inline",
   "renderingEvidence": "SlipVersionHistoryPanel.tsx:242-249 `<Card padding={4} shadow=\"sm\" style={{ marginTop: 24 }} data-testid=\"slip-version-history-panel\">` 다음 줄 `<h4 style={{ marginTop: 0 }}>버전 이력</h4>` — 여는 트리거 버튼도, open state 도 없다. 목록은 :324-327 `<ul data-testid=\"slip-version-history-list\" style={{ ... display: 'flex', flexDirection: 'column', gap: 8 }}>` 로 그 자리에 그대로 펼쳐진다. 이 파일의 유일한 `<Modal>` 은 :429 `<Modal open={restoreTarget !== null} ... title=\"전표 복원\">` 로 **복원 확인 전용**이지 이력 표시용이 아니다. 마운트도 무조건이다 — SlipCollaborationPanel.tsx:517 `<SlipVersionHistoryPanel slipId={slipId} activeRevisionNo={activeRevisionNo} .../>` 에 조건절이 없고, SlipDetailPage.tsx:4831 의 `<SlipCollaborationPanel .../>` 도 isMobile 분기의 else 가지에서 무조건 렌더된다. 데스크톱 전 화면에서 `버전이력` 라벨의 버튼은 저장소 전체에 0건(rg '버전이력|버전 이력' × button/Modal/onClick → 0 hit).",
   "ordering": "desc",
   "orderingEvidence": "서버 ORDER BY 로 정해지고 FE 는 재정렬하지 않는다. ① services/slip-service/src/main/java/com/samhanair/logis/slip/revision/repository/SlipRevisionRepository.java:40 `List<SlipRevision> findBySlipIdOrderByRevisionNoDesc(UUID slipId);` · 같은 파일 :56 네이티브 쿼리 `ORDER BY revision_no DESC`. ② SlipRevisionService.java:245 가 그 DESC 결과를 받아 :251 `revisions.sort(Comparator.comparingInt(SlipRevisionSnapshotRow::getRevisionNo))` 로 인접 diff 계산용 오름차순 정렬 후, :277 `java.util.Collections.reverse(responses);` 로 **다시 최신 우선으로 뒤집어** 반환(주석 :235 \"최종 반환은 다시 최신(revisionNo 내림차순) 우선으로 뒤집어 FE 타임라인 표시 순서와 맞춘다\"). ③ FE 는 SlipVersionHistoryPanel.tsx:328 `{revisions.map((rev) => {` 로 응답 배열 순서를 그대로 렌더하고, :331 `const isLatest = rev.revisionNo === revisions[0]?.revisionNo` 로 **\"배열 첫 항목 = 최신\"을 전제**한다 — 서버 정렬이 바뀌면 최신 판정도 함께 깨지는 결합.",
   "dataSource": "GET /api/v1/slips/{slipId}/revisions — clients/desktop/src/renderer/api/slipRevision.ts:88-93 `listRevisions()`, react-query key `['slipRevisions', slipId]` (SlipVersionHistoryPanel.tsx:205-208). BE: SlipRevisionController.java:63-66",
   "itemCountObserved": "제한·페이지네이션·가상화 **전무** — 전 revision + 각 revision 의 전 fieldChanges 를 한꺼번에 렌더한다(SlipVersionHistoryPanel.tsx:328 `revisions.map`, :395 `fieldChanges.map`, slice/limit 없음). 실측(로컬 slip_db, 2026-08-06 조회): slip_revisions 195행 / 135전표. 전표당 revision 분포 = 4건:2전표 · 3건:9 · 2건:36 · 1건:88. revision 유형 = CREATE 135 · EDIT 56 · RESTORE 4. **한 revision 카드가 펼치는 변경항목 행 수**(CREATE 135건 기준, 헤더 23필드 + 라인 7필드×라인수 중 non-null 카운트) = 최대 **42행**, 평균 **19.3행**(헤더 최대 10 + 라인 최대 35). 최악 전표 = 2026/08/03-2, 2026/08/03-3, 2026/08/03-4 각 42행. ⚠️이 DB 는 로컬 개발·QA 시드이지 운영 데이터가 아니다 — 운영 전표는 라인 수가 더 많을 수 있어 42행은 하한으로 보아야 한다. EDIT/RESTORE revision 의 diff 행 수는 스냅샷 쌍 비교가 필요해 **미측정(미판정)**.",
   "isTarget": true,
   "notes": "【복원 동작이 붙어 있다 — 모달로 옮기면 함께 가야 한다】 :408-421 `{!isLatest ? (<Button variant=\"secondary\" size=\"sm\" data-testid={`slip-version-history-restore-button-${rev.revisionNo}`} ...>이 시점으로 복원</Button>) : null}` — 최신 revision(:330-331)만 버튼 미노출. 클릭 → :429-463 DS Modal 확인 → :210-226 mutation → POST /api/v1/slips/{slipId}/revisions/{revisionNo}/restore (api/slipRevision.ts:103-111). BE 권한: 복원 = `slip.audit-revert` RESTORE (SlipRevisionController.java:90), 목록 조회 = `slip.audit-revert` VIEW (:64). 🚨FE 는 복원 버튼에 `canAccess` 게이트가 **없다** — 권한 없는 사용자에게도 버튼이 보이고 서버에서 거부된다. 조회 권한이 없으면 패널이 :308-315 `버전 이력을 불러오지 못했습니다.` 만 렌더한다.\n\n【협업 편집 중에도 보이고 실시간 갱신된다】 SlipCollaborationPanel.tsx:517 은 `editMode` 와 무관하게 렌더(편집 폼은 :430 `{canEdit && editMode ? ...}` 로 조건부지만 버전이력은 아님). SSE: SlipCollaborationPanel.tsx:162-172 가 `comment.*` / `suggestion.*` / `slip:edit` / `slip:restored` / `slip:reverted` 수신 시 :167 `invalidateQueries({ queryKey: ['slipRevisions', slipId] })`; SlipDetailPage.tsx:1610-1618 도 동일 invalidate; 복원 성공 시 :215 도 invalidate.\n\n【모달 이전 시 걸리는 결합 — 코멘트↔버전이력 양방향 하이라이트】 코멘트 클릭 → 버전이력 행 하이라이트(SlipCollaborationPanel.tsx:290-301 `setActiveFieldPaths([fieldPath])`), 버전이력 행 클릭 → 코멘트 하이라이트(:521-527 `onRevisionSelect`). 두 목록이 **동시에 보이는 것**을 전제로 하는 설계이고, 테스트 3건이 이를 고정한다: SlipCollaborationPanel.history-bridge.test.tsx:110 (정방향) · :132 (역방향) · :155 (다중필드 역방향). 버전이력만 모달로 빼면 이 3건이 실동작상 무의미해지거나 깨진다 — 개발책임자 판단 필요 사항.\n\n【인쇄】 전용 인쇄 라우트(/sales/:id/print/statement · /print/invoice · /purchases/:id/print/purchase → clients/desktop/src/renderer/print/*)에는 버전이력이 **없다** — `rg --no-ignore 'AuditOverlay|RedlineCell|VersionHistory|slipRevision|slipAudit|slipRedline' clients/desktop/src/renderer/print/` 결과 0건. ⚠️단 상세 화면을 브라우저 인쇄하면 패널에 `no-print` 클래스가 없어 그대로 인쇄된다(global.css:2655-2663 `@media print { .no-print { display: none !important; } }`, SlipVersionHistoryPanel 은 className 미지정). 실제 인쇄 실행은 **미검증(미판정)**.\n\n【inline 을 고정하는 테스트】 clients/desktop/playwright/slip-version-history/slip-version-history.spec.ts:74-75 (goto 직후 클릭 없이 `slip-version-history-panel`·`-list` 가 visible) · clients/desktop/playwright/31-history-unify-opus-round-real-qa/31-history-unify-opus-round-real-qa.spec.ts:117-125, :245-246 (`별도 \"버전 이력\" accordion 은 제거되어 있어야 함`) · SlipVersionHistoryPanel.test.tsx. 모달 전환 시 이 스펙들을 함께 갱신해야 한다."
  },
  {
   "screen": "전표 상세 (모바일) — \"코멘트\" 아코디언 안에 통합된 버전 이력",
   "file": "clients/desktop/src/renderer/routes/SlipDetailPage.tsx:4813 · 아코디언 구현 clients/desktop/src/renderer/components/common/MobileCollapsible.tsx:11 · 라벨 복원 CSS clients/desktop/src/renderer/styles/global.css:791",
   "currentRendering": "inline",
   "renderingEvidence": "SlipDetailPage.tsx:4813-4829 `{isMobile ? (<MobileCollapsible title=\"코멘트\" className=\"mobile-section-card\" defaultOpen><SlipCollaborationPanel slipId={id} .../></MobileCollapsible>) : (...)}`. MobileCollapsible 은 모달이 아니라 **인라인 아코디언**이다 — MobileCollapsible.tsx:22-33 `<div className={`mobile-section-accordion...`}><button ... aria-expanded={open} onClick={...}>{title}</button>{open ? <div className=\"mobile-section-body\">{children}</div> : null}</div>` (portal·backdrop 없음). `defaultOpen` 이 붙어 있어 :18 `useState(defaultOpen)` → **진입 즉시 펼쳐진 상태**다. 버전이력은 그 안에 중첩된 SlipCollaborationPanel.tsx:517 이 렌더하며, global.css:791-797 이 `.mobile-section-body [data-testid='slip-version-history-panel'] h4 { display: block; }` 로 \"버전 이력\" h4 라벨을 되살린다(#31 이력 일원화). 즉 모바일은 코멘트와 버전이력이 **한 아코디언 안에 세로로 이어 붙어** 나온다.",
   "ordering": "desc",
   "orderingEvidence": "데스크톱과 동일 컴포넌트·동일 API — SlipRevisionRepository.java:40 `findBySlipIdOrderByRevisionNoDesc` + SlipRevisionService.java:277 `Collections.reverse(responses)`. 모바일 전용 정렬 코드 없음.",
   "dataSource": "GET /api/v1/slips/{slipId}/revisions — api/slipRevision.ts:88-93, key ['slipRevisions', slipId]",
   "itemCountObserved": "데스크톱과 동일 데이터·동일 무제한 렌더(같은 컴포넌트). 모바일 전용 제한 없음. 실측 수치는 데스크톱 항목 참조(revision 최대 4 / CREATE 1건이 최대 42행). 좁은 화면에 같은 양이 그대로 쏟아진다는 점에서 가독성 문제는 모바일이 더 크다.",
   "isTarget": true,
   "notes": "모바일에서 버전이력·복원·필드 하이라이트의 **유일 경로**가 이 아코디언이다(global.css:799-801 주석 \"#31 이력 일원화 — 모바일에서 통합 협업 패널(SlipCollaborationPanel)이 버전이력·복원·필드 하이라이트의 유일 경로\"). 과거의 별도 \"버전 이력\"·\"수정 이력\" 아코디언은 제거됐고 그 부재가 테스트로 고정돼 있다(31-history-unify-opus-round-real-qa.spec.ts:245-246). 모바일 44px 터치타겟 보강 규칙이 이 구조에 붙어 있다: global.css:804-810 (`slip-collaboration-panel button`, `slip-version-history-change-*[role=button]`), :816-818 (portal 된 DS Modal footer 버튼). 모달로 옮기면 :791-797 라벨 복원 규칙과 :804-810 터치타겟 규칙의 선택자 스코프가 함께 재검토돼야 한다. 모바일 라이브QA 스펙이 이 구조를 고정: 31-history-unify-opus-round-real-qa.spec.ts:169, :189-191, :204, :210."
  },
  {
   "screen": "전표 상세 — 메모 필드 감사 오버레이 (AuditOverlay, \"이력 N개 보기\")",
   "file": "clients/desktop/src/renderer/routes/SlipDetailPage.tsx:4119 (호출) · 컴포넌트 clients/web/design-system/src/components/AuditOverlay/AuditOverlay.tsx:84",
   "currentRendering": "inline",
   "renderingEvidence": "AuditOverlay.tsx:126-136 `{olderCount > 0 ? (<button type=\"button\" className={styles['expandToggle']} onClick={() => setExpanded((prev) => !prev)} data-testid={`audit-overlay-${field}-expand`} aria-expanded={expanded}>{expanded ? '이력 닫기' : `이력 ${sorted.length}개 보기`}</button>) : null}` → :138-157 `{expanded && olderCount > 0 ? (<ul className={styles['expandedList']} data-testid={`audit-overlay-${field}-list`}>` — **같은 자리에서 펼쳐지는 인라인 확장**(아코디언)이지 모달·팝오버가 아니다. AuditOverlay.module.css 전체 109줄에 position:absolute/fixed·z-index·backdrop 규칙이 하나도 없고 :85-95 `.expandedList` 는 `border-left` + `background` 만 준다. 최신 1건은 토글 없이 :101-124 에서 항상 인라인 표시된다.",
   "ordering": "desc",
   "orderingEvidence": "FE 정렬. AuditOverlay.tsx:87-91 `// 최신 → 과거 정렬 (revisionNo 내림차순). 원본 mutate 금지를 위해 slice 후 sort.` `const sorted = useMemo(() => [...history].sort((a, b) => b.revisionNo - a.revisionNo), [history])`. 서버도 이미 내림차순으로 준다 — SlipAuditLogRepository `findBySlipIdOrderByRevisionNoDescChangedAtDesc` (SlipAuditLogService.java:142 호출). 즉 **서버 DESC + FE DESC 이중**이라 FE 만으로도 방향이 보장된다.",
   "dataSource": "GET /api/v1/slips/{slipId}/audit-logs — clients/desktop/src/renderer/api/slipAudit.ts:46-51 `listAuditLogs()`, key ['slipAuditLogs', id]. 필드별 group 은 SlipDetailPage.tsx:2580-2594 `auditByField`",
   "itemCountObserved": "🚨실측 결과 **현재 DB 에서는 0건이 렌더된다**. slip_audit_logs 62행(SLIP_EDIT 53 · SLIP_DELETE 9)인데 `field_name` 의 distinct 값이 `SLIP_EDIT`·`SLIP_DELETE` **둘뿐**이고 `memo`/`shippingAddress` 행은 0이다. FE 는 `auditByField['memo']`(SlipDetailPage.tsx:4125) 로 조회하므로 항상 빈 배열 → AuditOverlay.tsx:122 `<span className={styles['empty']}>변경 이력 없음</span>` 만 나오고 확장 토글은 아예 안 나타난다(126행 조건 `olderCount > 0` 불성립). 원인: 전표 PUT 수정 경로가 필드명 대신 리터럴 `\"SLIP_EDIT\"` 를 쓴다 — SalesSlipUpdateService.java:123 / SlipUpdateService.java:120 `new SlipAuditLogService.ChangeEntry(\"SLIP_EDIT\", before, after)`. 실제 필드명을 쓰는 경로는 overlay patch(SlipService.java:527-541) 와 협업 제안 수락(:604-610) 뿐인데 이 DB 엔 그 행이 0건이다. 운영 DB 에서도 같은지는 **미판정**.",
   "isTarget": false,
   "notes": "라벨이 \"버전이력\"이 아니라 \"이력 N개 보기\"이고 **필드 1개 단위**라, 개발책임자 지시(\"버전이력 버튼→모달\")의 대상인지는 **PM/개발책임자 판단 필요** — 나는 판정하지 않는다. 다만 지시의 근거(\"한꺼번에 있으므로 가독성이 떨어짐\")로 보면 이 표면은 이미 접혀 있고(최신 1건만 인라인), 현재 데이터로는 발화조차 안 한다.\n\n⚠️문서 불일치: docs/manual/08-실시간-협업/02-수정-이력-보기.md:14 이 `| 호버 popover | ✅ | desktop |`, :44 `자동으로 popover 표시 (300ms 지연)`, :75 `popover 하단 [전체 이력 보기] 클릭 시 history 전체 list dialog.` (+ :77-78 시간순/역시간순 정렬·필터) 라고 적었으나 **구현에는 popover·dialog·필터·300ms 지연이 전부 없다**(위 코드 근거). 이 매뉴얼을 사양 근거로 쓰면 안 된다."
  },
  {
   "screen": "전표 상세 — 배송지 필드 감사 오버레이 (출고전표에서만 표시)",
   "file": "clients/desktop/src/renderer/routes/SlipDetailPage.tsx:4137",
   "currentRendering": "inline",
   "renderingEvidence": "SlipDetailPage.tsx:4130-4145 `{/* PR-H2: 배송지 audit overlay (출고전표만 의미 있음) */}` `{isOutbound ? (<div data-testid=\"slip-detail-audit-overlay-shippingAddress\"> ... <AuditOverlay field=\"shippingAddress\" currentValue={slip.shippingAddress} history={auditByField['shippingAddress'] ?? []} /> ...) : null}` — 위 메모 오버레이와 **동일 컴포넌트**(AuditOverlay.tsx:84)라 렌더링 방식도 동일한 인라인 확장이다. 구매전표(INBOUND)에서는 아예 렌더되지 않는다.",
   "ordering": "desc",
   "orderingEvidence": "AuditOverlay.tsx:88-91 FE `sort((a, b) => b.revisionNo - a.revisionNo)` + 서버 `findBySlipIdOrderByRevisionNoDescChangedAtDesc` (SlipAuditLogService.java:142)",
   "dataSource": "GET /api/v1/slips/{slipId}/audit-logs — api/slipAudit.ts:46-51, `auditByField['shippingAddress']` (SlipDetailPage.tsx:4140)",
   "itemCountObserved": "실측 0건 — 메모 오버레이와 같은 이유(slip_audit_logs.field_name 에 'shippingAddress' 행 0). 현재 DB 의 출고전표 전부에서 \"변경 이력 없음\" 만 렌더된다.",
   "isTarget": false,
   "notes": "메모 오버레이와 한 몸으로 취급해야 한다(같은 컴포넌트·같은 데이터소스). 대상 여부 판단은 개발책임자 몫."
  },
  {
   "screen": "전표 상세 — 셀 인라인 레드라인 (헤더 11셀 + 품목표 6셀×라인수)",
   "file": "clients/desktop/src/renderer/components/audit/RedlineCell.tsx:16 · 렌더 헬퍼 clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1579-1586 · 호출부 SlipDetailPage.tsx:4081, 4087, 4093, 4117, 4135, 4162, 4168, 4174, 4180, 4186, 4192 (헤더) / 4502-4509 (품목 행 6셀) / 4553 (모바일 품목명)",
   "currentRendering": "inline",
   "renderingEvidence": "RedlineCell.tsx:29-77 `<span data-testid=\"redline-cell\" style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, ... }}>` 안에 :40-52 현재값 + :53-77 `{reversed.slice(1).map((layer, index) => { ... textDecoration: 'line-through' ... })}` 로 **이전값들을 취소선으로 그대로 쌓아** 렌더한다. 토글도, 트리거 버튼도, 접힘 상태도 없다 — layers 가 2개 이상이면 무조건 전부 보인다(:17 `if (layers.length <= 1)` 일 때만 단일 값). 표 셀 안에 세로로 누적되므로 라인 수가 많으면 표 자체가 늘어난다.",
   "ordering": "desc",
   "orderingEvidence": "FE 뒤집기. RedlineCell.tsx:15 주석 `/** S2d-1 셀 인라인 레드라인. layers 는 오래된 값 → 최신 값 순서다. */` 이 서버가 **오름차순**으로 준다고 명시하고, :25 `const reversed = layers.slice().reverse()` → :26 `const current = reversed[0]!` 로 **최신이 맨 위**가 된다. 서버 측 누적 순서는 SlipRedlineService.java:81-84 `builder.layers.add(...)` 가 revisionNo 오름차순 순회로 append 하는 삽입 순서다(:57 `.filter(revision -> revision.getRevisionNo() >= anchor)`).",
   "dataSource": "GET redline — clients/desktop/src/renderer/api/slipRedline.ts `getRedline()`, key ['slipRedline', id] (SlipDetailPage.tsx:1561-1566). BE: SlipRedlineService.java:43-91",
   "itemCountObserved": "anchor(redline_anchor_revision_no) 이후 **전 revision 무제한** — SlipRedlineService.java:57 에 상한·limit 없음. 실측(로컬 slip_db): `redline_anchor_revision_no IS NOT NULL` 인 전표 **3건 / 활성 전표 126건** → 현재 DB 에선 거의 발화하지 않는다. layer 수 상한은 SlipRedlineService.java:91 `.filter(builder -> builder.layers.size() >= 2)` 로 하한만 걸려 있고 상한은 없다.",
   "isTarget": false,
   "notes": "\"버전이력\" 라벨이 아니라 **셀 단위 레드라인**이고, 임계 전이(전송/검수) 이후 누적분만 보여준다는 점에서 성격이 다르다. 대상 여부는 개발책임자 판단 필요.\n\n다만 지시의 취지(\"한꺼번에 있으므로 가독성이 떨어짐\")로 보면 **이 표면이 잠재적으로 가장 시끄럽다** — 접히지 않고 표 셀 안에 무제한 누적되며, 헤더 11셀 + 품목 6셀×라인수 전부에 붙어 있다. 라인 6개짜리 전표면 잠재 셀 수가 11 + 36 = 47개다. 현재 DB 에선 anchored 전표가 3건뿐이라 실제로 드러나지 않았을 뿐이다.\n\n같은 상세 화면이 레드라인(VAT 포함)과 버전이력(과거엔 VAT 제외)을 나란히 렌더해 **같은 단어가 다른 값**을 가리킨 선례가 있다 — SlipRevisionService.java:100-119 주석(#937 재수렴 6·7차, 개발책임자 결정 A안). 버전이력만 모달로 빼면 두 표면이 더 이상 나란히 보이지 않게 되므로 이 정합 근거가 약해진다는 점을 결정 시 인지해야 한다."
  },
  {
   "screen": "전표 상세 — 상단 \"수정 N회\" 배지",
   "file": "clients/desktop/src/renderer/routes/SlipDetailPage.tsx:3572",
   "currentRendering": "none",
   "renderingEvidence": "SlipDetailPage.tsx:3571-3588 `{/* PR-H2: 수정 횟수 표시 — auditLogs distinct revisionNo 개수 */}` `<span data-testid=\"slip-detail-revision-count\" style={{ fontSize: 13, ... borderRadius: 12, background: 'var(--color-neutral-100)' }} title={auditLogsQuery.isError ? '수정 이력을 불러오지 못했습니다' : '전표 변경 누적 횟수'}>수정 {revisionCount}회</span>` — `<span>` 이고 `onClick`·`role`·`tabIndex` 가 전부 없다. **이력 목록을 보여주지 않고 개수만** 표시한다(currentRendering = none 으로 판정한 근거).",
   "ordering": "none",
   "orderingEvidence": "목록을 렌더하지 않으므로 정렬 개념 없음. 값은 SlipDetailPage.tsx:2596-2600 `const revisionCount = new Set(auditLogs.map((l) => l.revisionNo)).size` — distinct revisionNo 개수.",
   "dataSource": "GET /api/v1/slips/{slipId}/audit-logs — api/slipAudit.ts:46-51, key ['slipAuditLogs', id]",
   "itemCountObserved": "숫자 1개. 실측(로컬 slip_db): slip_audit_logs 가 있는 전표 45건, 전표당 audit 행 4건:2전표 · 3건:5 · 2건:1 · 1건:37 → 배지에 표시되는 값은 대체로 1~3.",
   "isTarget": false,
   "notes": "현재는 이력을 열어주지 않는 순수 표시물이지만, 지시가 요구하는 **\"버전이력\" 버튼의 자연스러운 자리**가 여기다(전표번호 옆 상단, 이미 개수를 알고 있음). 이는 제안이며 배치 결정은 개발책임자 몫이다. 라이브QA 스펙이 이 배지의 존재를 고정한다: clients/desktop/playwright/31-history-unify-opus-round-real-qa/31-history-unify-opus-round-real-qa.spec.ts:95-96."
  },
  {
   "screen": "전표 정리 (/sales/slip-cleanup) — \"저장내역\" 탭",
   "file": "clients/desktop/src/renderer/routes/SlipCleanupPage.tsx:319 (Tabs) · :541 (탭 본문) · 컴포넌트 clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx:54",
   "currentRendering": "tab",
   "renderingEvidence": "SlipCleanupPage.tsx:319-326 `<Tabs tabs={[{ label: '실행', testId: 'slip-cleanup-history-tab-run' }, { label: '저장내역', testId: 'slip-cleanup-history-tab-list' }]} activeIndex={activeTab} onTabChange={setActiveTab} ariaLabel=\"전표정리 저장내역 탭\">` — 모달이 아니라 **탭 전환**이다. 탭 본문은 :541 `<SlipCleanupHistoryTab ... testIdPrefix=\"slip-cleanup-history\" />`, 행 매핑은 SlipCleanupHistoryTab.tsx:54 `const rows: HistoryGridRow[] = (historyQuery.data?.content ?? []).map((row, index) => ({`.",
   "ordering": "desc",
   "orderingEvidence": "서버 정렬. services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java:97-100 `PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.DESC, \"createdAt\"));` — createdAt 내림차순. FE 는 재정렬하지 않고 `content` 순서 그대로 map 한다(SlipCleanupHistoryTab.tsx:54).",
   "dataSource": "GET 전표정리 저장내역 목록 — clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts (`getLatestSlipCleanupHistory` / list), key ['slip-cleanup-history-list', 'SLIP_CLEANUP'] (SlipCleanupPage.tsx:301-302). BE: SlipCleanupSaveHistoryController.java:85-104",
   "itemCountObserved": "페이지네이션 있음 — 기본 page size 50, 상한 200 (SlipCleanupSaveHistoryController.java:93 `@RequestParam(value = \"size\", defaultValue = \"50\") int size`, :96 `int safeSize = Math.max(1, Math.min(size, 200));`). 실 데이터 건수는 **미측정(미판정)**.",
   "isTarget": false,
   "notes": "이것은 **문서(전표)의 버전이력이 아니라 \"전표정리 실행 조건 저장내역\"** 이다 — 사용자가 조회 조건(from/to/topic)을 저장해 두고 되불러오는 기능(복원 시 SlipCleanupPage.tsx:306-315 `handleRestore` 가 조건만 되돌리고 :314 `복원: ...` 배너를 띄운다). 개발책임자 지시의 대상은 아니라고 보이나, \"이력\" 이라는 말이 붙어 있어 누락 없이 보고한다. 판단은 개발책임자 몫."
  }
 ]
}
```

---

## 회수 4

```json
{
 "surfaces": [
  {
   "screen": "전표 상세 — 「버전 이력」 (판매/구매 전표)",
   "file": "clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx:243 (BE: services/slip-service/src/main/java/com/samhanair/logis/slip/revision/web/SlipRevisionController.java:63)",
   "currentRendering": "inline",
   "renderingEvidence": "SlipVersionHistoryPanel.tsx:243-249 `return (<Card padding={4} shadow=\"sm\" style={{ marginTop: 24 }} data-testid=\"slip-version-history-panel\"> <h4 style={{ marginTop: 0 }}>버전 이력</h4>` — 최상위가 Card(section)이지 Modal 이 아님. 마운트 경로: SlipCollaborationPanel.tsx:517 `<SlipVersionHistoryPanel slipId={slipId} ...>` (같은 파일 261 `<section data-testid=\"slip-collaboration-panel\">` 안) → SlipDetailPage.tsx:4831 `<SlipCollaborationPanel .../>` (데스크톱 분기, 4813-4829 는 모바일 MobileCollapsible 분기). 이 파일의 `<Modal>` 은 SlipVersionHistoryPanel.tsx:429-430 `<Modal open={restoreTarget !== null}` 하나뿐이고 이는 **복원 확인 다이얼로그 전용**이지 이력 표시가 아님. 목록은 :324 `<ul data-testid=\"slip-version-history-list\">` → :328 `{revisions.map((rev) => {` 로 전량 펼침(slice/limit/collapse 없음).",
   "dataSource": "GET /api/v1/slips/{slipId}/revisions — SlipRevisionController.java:63-67 `@GetMapping(\"/revisions\")` → `revisionService.listWithSummary(slipId)`. FE 클라이언트 clients/desktop/src/renderer/api/slipRevision.ts:103-108 `listRevisions()`. react-query key `['slipRevisions', slipId]` (SlipVersionHistoryPanel.tsx:205).",
   "ordering": "desc",
   "orderingEvidence": "**서버에서 결정. FE 재정렬 없음.** ① DB ORDER BY — SlipRevisionRepository.java:56 `ORDER BY revision_no DESC` (native query `findSnapshotRowsBySlipIdOrderByRevisionNoDesc`), 폴백 경로도 :40 `findBySlipIdOrderByRevisionNoDesc`. ② 서비스에서 인접 diff 계산을 위해 잠시 오름차순으로 뒤집었다가 되돌림 — SlipRevisionService.java:251 `revisions.sort(Comparator.comparingInt(SlipRevisionSnapshotRow::getRevisionNo));` → :277 `java.util.Collections.reverse(responses);` (주석 :276 「응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다」). 폴백 경로도 :283/:308 동일. ③ FE 검증 — SlipVersionHistoryPanel.tsx 전체에 `.sort(` / `reverse(` 0건(rg 실측). ⚠️ 정렬 축은 **시각(created_at) 이 아니라 revision_no** 다. 다만 slip_db 실측에서 두 축의 순서 불일치는 0건 (slip_revisions 195행 전수, `LAG(created_at) OVER (PARTITION BY slip_id ORDER BY revision_no)` 역전 0). revision_no 는 SlipRevisionService.java:169-170 `maxRevisionNo + 1` 단조 채번.",
   "itemCountObserved": "실측(samhan-postgres / slip_db, 2026-08-06): slip_revisions 미삭제 195행 / 135 전표. **전표당 revision 카드 최대 4개, 평균 1.44개.** 그러나 카드 1개가 fieldChanges 를 전부 펼치므로 실제 화면 행 수는 훨씬 큼 — revision_no=1(CREATE) 카드 하나만으로 **최대 42행 · 평균 19.3행** (135 전표 전수, 헤더 23필드 중 non-null 개수 + 라인별 non-null 필드 수로 계산). SlipVersionHistoryPanel.tsx:385-406 `{fieldChanges.map((change) => ...)}` — 접힘/더보기 없음.",
   "isTarget": true,
   "notes": "🔴 **복원(restore) 동작이 붙어 있음 — 모달로 옮기면 복원 버튼도 함께 가야 함.** BE `POST /slips/{slipId}/revisions/{revisionNo}/restore` (SlipRevisionController.java:89-97, 권한 page=`slip.audit-revert` action=RESTORE). FE 는 행마다 「이 시점으로 복원」 버튼(SlipVersionHistoryPanel.tsx:408-420), 단 최신 revision 은 제외(:331 `const isLatest = rev.revisionNo === revisions[0]?.revisionNo`). 복원 확인은 이미 DS Modal(:429).\n🟡 **협업(coedit) 중 실시간 갱신 있음** — SlipCollaborationPanel.tsx:162-172 `SlipCollabRealtimeClient.subscribe(slipId, (evt) => { ... invalidateQueries({ queryKey: ['slipRevisions', slipId] }) ...})`. 커밋 시에도 :167, :223 에서 무효화. ⟹ 모달을 닫아두면 SSE 무효화가 닫힌 쿼리에만 걸리므로 열 때 재요청되는 구조는 유지됨.\n🟢 **인쇄/PDF 에는 없음** — 전용 인쇄 컴포넌트 디렉터리 clients/desktop/src/renderer/print/** 에 `VersionHistoryPanel`/`CollaborationPanel` 참조 0건(rg 실측). 인쇄 라우트 판정 AppLayout.tsx:222-234 `isPrintSurfacePath()` 는 `/sales`,`/sales/query`,`/purchases`,`/purchases/query` 와 `/print/` 경로만 인쇄 표면으로 보며 전표 상세 경로는 해당 없음. ⚠️ 단 SlipCollaborationPanel 의 `<section>`(:261)에 `no-print` 클래스가 없으므로 **브라우저에서 전표 상세 화면을 직접 인쇄하면 버전이력이 같이 출력된다** — 이 경로가 실사용 경로인지는 미판정.\n🟡 **페이징/limit 이 서버·클라 어디에도 없음** — 전량 반환. 모달화 시 그대로 옮기면 같은 양이 모달 안에 들어감.\n🟡 **fieldChanges 를 가진 유일한 DTO** — SlipRevisionResponse.java:39 `List<FieldChange> fieldChanges`. 견적/거래처주문/거래처 DTO 에는 없음(아래 참조). 가독성 저하의 실제 원인이 여기.",
   "screenNameAlso": "전표 상세"
  },
  {
   "screen": "견적 상세 — 「버전 이력」",
   "file": "clients/desktop/src/renderer/components/audit/EstimateVersionHistoryPanel.tsx:142 (BE: services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/revision/web/EstimateRevisionController.java:64)",
   "currentRendering": "inline",
   "renderingEvidence": "EstimateVersionHistoryPanel.tsx:142-148 `<Card ... data-testid=\"estimate-version-history-panel\">` + `:148 <h4 style={{ marginTop: 0 }}>버전 이력</h4>`. 마운트: EstimateCollaborationPanel.tsx:574 `<EstimateVersionHistoryPanel` → EstimateDetailPage.tsx:758 (데스크톱 인라인) / :735 (모바일 MobileCollapsible). 목록 :238 `data-testid=\"estimate-version-history-list\"` → :241 `{revisions.map((rev) => {`. `<Modal>` 은 :319 복원 확인 전용.",
   "dataSource": "GET /api/v1/slips/estimates/{estimateId}/revisions — EstimateRevisionController.java:64-69. FE: clients/desktop/src/renderer/api/estimateRevision.ts:70. query key `['estimateRevisions', estimateId]` (EstimateVersionHistoryPanel.tsx:114).",
   "ordering": "desc",
   "orderingEvidence": "서버 결정. EstimateRevisionRepository.java:54 `ORDER BY revision_no DESC` (native), :40 `findByEstimateIdOrderByRevisionNoDesc`. EstimateRevisionService.java:191 `revisions.sort(Comparator.comparingInt(EstimateRevisionSnapshotRow::getRevisionNo))` → :213 `java.util.Collections.reverse(responses)` (엔티티 폴백 경로 :219/:240 동일). FE 재정렬 0건(패널 파일에 `.sort(`/`reverse(` 없음 — rg 실측).",
   "itemCountObserved": "실측(slip_db): estimate_revisions 미삭제 47행 / 24 견적, **견적당 최대 7개**. 카드당 요약 1줄만 렌더(fieldChanges 없음).",
   "isTarget": true,
   "notes": "🔴 복원 있음 — `POST /slips/estimates/{estimateId}/revisions/{revisionNo}/restore` (EstimateRevisionController.java:91-100, page=`estimates.list` action=RESTORE). FE 행마다 「이 시점으로 복원」 (EstimateVersionHistoryPanel.tsx:301-309), `disabled={!restorable || ...}` (:303, :111 `isRestorableStatus(status)`), 불가 상태면 :151-153 안내 노트(`estimate-version-history-locked-note`).\n🟡 실시간 갱신 있음 — EstimateCollaborationPanel.tsx:174, :246 에서 `['estimateRevisions', estimateId]` 무효화. EstimateDetailPage.tsx:211 도 무효화.\n🟢 **fieldChanges 없음** — EstimateRevisionResponse.java:28 record 에 changeSummary 만 있고 fieldChanges 필드 부재(rg 실측). FE 도 요약 한 줄만(EstimateVersionHistoryPanel.tsx:294 `{formatChangeSummary(rev)}`). 파일 주석 :46 「revision DTO 에 fieldChanges 가 추가되면 Slip 과 동일한 field 단위 매칭으로 교체한다」 — 아직 미구현.\n🟢 인쇄 미포함(전표와 동일 근거).",
   "screenNameAlso": "견적서 상세"
  },
  {
   "screen": "거래처 주문 상세 — 「버전 이력」",
   "file": "clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx:206 (BE: services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/web/PartnerOrderRevisionController.java:90)",
   "currentRendering": "inline",
   "renderingEvidence": "PartnerOrderVersionHistoryPanel.tsx:206-212 `<Card ... data-testid=\"partner-order-version-history-panel\">` + `:212 <h4>버전 이력</h4>`. 마운트: PartnerOrderCollaborationPanel.tsx:571 `<PartnerOrderVersionHistoryPanel` → SalesPartnerOrderDetailPage.tsx:1379 (데스크톱 인라인) / :1364 (모바일 MobileCollapsible). 목록 :305 `data-testid=\"partner-order-version-history-list\"` → :315 `{revisions.map((rev) => {`. `<Modal>` 은 :402 `data-testid=\"partner-order-version-history-restore-modal\"` 복원 확인 전용.",
   "dataSource": "GET /api/v1/partner-orders/{id}/revisions — PartnerOrderRevisionController.java:90-96. FE: clients/desktop/src/renderer/api/partnerOrderRevision.ts:85.",
   "ordering": "desc",
   "orderingEvidence": "서버 결정. PartnerOrderRevisionRepository.java:31 `List<PartnerOrderRevision> findByPartnerOrderIdOrderByRevisionNoDesc(UUID partnerOrderId);` (네이티브 쿼리 없이 파생 쿼리만). PartnerOrderRevisionService.java:319 `return revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(partnerOrderId);` → :337 `revisions.sort(Comparator.comparingInt(PartnerOrderRevision::getRevisionNo));` → :358 `Collections.reverse(responses);` (주석 :357 「응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다」). FE 재정렬 0건.",
   "itemCountObserved": "실측(partner_order_db): partner_order_revisions 미삭제 568행 / 567 주문, **주문당 최대 2개**. 사실상 대부분 1건.",
   "isTarget": true,
   "notes": "🔴 복원 있음 — `POST /api/v1/partner-orders/{id}/revisions/{no}/restore` (PartnerOrderRevisionController.java:151-163, page=`sales.partner-order.revisions` action=RESTORE, 목록은 별도 page=`sales.partner-order.history.view` VIEW). FE 행마다 버튼 :385-392, `disabled={!restorable || ...}` (:386, :163 `isRestorableStatus(status)`), 불가 시 :215-217 잠금 노트. CONFIRMED 복원 시 `slipResyncRequired=true` 반환(컨트롤러 Javadoc :126-128).\n🟢 **fieldChanges 없음** — PartnerOrderRevisionResponse.java:27 record 에 changeSummary 만. 카드당 요약 1줄(:378 `{formatChangeSummary(rev)}`).\n🟡 **단건 스냅샷 상세 API 가 이미 있으나 화면 소비자가 0** — BE `GET /api/v1/partner-orders/{id}/revisions/{no}` (PartnerOrderRevisionController.java:112-119, `getRevisionDetail`), FE 래퍼도 존재 clients/desktop/src/renderer/api/partnerOrderRevision.ts:96-104 `getPartnerOrderRevisionDetail`. 그러나 이 함수를 호출하는 컴포넌트가 **0건**(rg `RevisionDetail|getPartnerOrderRevision` — 정의 파일 자신만 매치). ⟹ 모달 설계 시 「그 시점 스냅샷 전체 보기」에 바로 쓸 수 있는 미사용 계약.\n🟡 실시간 갱신: PartnerOrderCollaborationPanel 이 collab SSE 를 구독하는지는 이 조사에서 미확인 — **미판정**.",
   "screenNameAlso": "주문서 상세"
  },
  {
   "screen": "거래처 상세 4탭 다이얼로그 — 「버전 이력」 탭",
   "file": "clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx:325 (패널: clients/desktop/src/renderer/components/audit/PartnerVersionHistoryPanel.tsx:142, BE: services/partner-service/src/main/java/com/samhanair/logis/partner/revision/web/PartnerRevisionController.java:76)",
   "currentRendering": "modal",
   "renderingEvidence": "**이미 모달 안이다.** PartnerDetailDialog.tsx 의 반환 트리 최외곽이 `<Modal>` 이며(:333 `</Modal>`), 그 안 `<Tabs>` 의 다섯 번째 탭으로 :323-329 `{/* 탭 5: 버전 이력 + 복원 (Phase 2.3 Task 6) */} {canViewVersionHistory ? (<PartnerVersionHistoryPanel partnerCode={...} status={...} />) : null}`. 패널 자체는 PartnerVersionHistoryPanel.tsx:142 `<Card ... data-testid=\"partner-version-history-panel\">` + :148 `<h4>버전 이력</h4>` 인라인 리스트(:238 list → :241 `{revisions.map(...)}`), 즉 **모달 안의 탭 안 인라인 목록**. 패널의 `<Modal>`(:300)은 복원 확인 전용.",
   "dataSource": "GET /api/v1/partners/{partnerCode}/revisions — PartnerRevisionController.java:76-82. FE: clients/desktop/src/renderer/api/partnerRevision.ts. query key `['partnerRevisions', partnerCode]` (PartnerVersionHistoryPanel.tsx:114).",
   "ordering": "desc",
   "orderingEvidence": "서버 결정. PartnerRevisionRepository.java:28 `List<PartnerRevision> findByPartnerIdOrderByRevisionNoDesc(UUID partnerId);`. PartnerRevisionService.java:272 그 메서드 호출 → :296 `revisions.sort(Comparator.comparingInt(PartnerRevision::getRevisionNo));` → :314 `java.util.Collections.reverse(responses);`. FE 재정렬 0건.",
   "itemCountObserved": "실측(partner_db): partner_revisions 미삭제 28행 / 11 거래처, **거래처당 최대 7개**.",
   "isTarget": false,
   "notes": "🟢 **이미 모달 — 지시의 「변경」 대상이 아님.** 다만 「전표와 문서」가 아니라 거래처 마스터 데이터이고, 이미 모달 안 탭이므로 별도 「버전이력」 버튼을 또 만들 이유가 없다. **isTarget=false 로 판정했으나 개발책임자 확인 권장**(지시 문언 「전표와 문서」에 거래처가 포함되는지 이 조사로는 확정 불가).\n🔴 복원 있음 — `POST /api/v1/partners/{partnerCode}/revisions/{revisionNo}/restore` (PartnerRevisionController.java:101-114, page=`partners.4tab.edit` action=RESTORE).\n🟢 fieldChanges 없음 — PartnerRevisionResponse.java:27 record 에 changeSummary 만. 요약 필드명이 다름: PartnerVersionHistoryPanel.tsx:83 `const { headerChanged, childAdded, childRemoved, childModified }` (다른 3곳은 line*).\n🔴 **부수 발견 — 캐시 키 불일치(도달 가능 결함 후보)**: PartnerDetailDialog.tsx:117 은 편집 저장 후 `invalidateQueries({ queryKey: ['partnerRevisions', partnerId] })` 로 무효화하는데(:116 주석은 「partnerId === partnerCode」 라고 단정), 패널의 실제 쿼리 키는 PartnerVersionHistoryPanel.tsx:114 `['partnerRevisions', partnerCode]` 이고 패널이 받는 prop 은 PartnerDetailDialog.tsx:326 `partnerCode={query.data.basic.partnerCode}` 다. 두 값이 같은 문자열인지 이 조사에서 **미검증 — 미판정**. 이번 과업 범위 밖이라 확인만 남긴다."
  },
  {
   "screen": "분개(회계전표) 상세 — 「수정 이력」",
   "file": "clients/desktop/src/renderer/components/collab/JournalCollaborationPanel.tsx:584 (BE: services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/collab/JournalCollabController.java:177)",
   "currentRendering": "inline",
   "renderingEvidence": "JournalCollaborationPanel.tsx:577-586 `<Card as=\"section\" aria-label=\"수정 이력\" padding={4} shadow=\"sm\" style={{ marginTop: 24, width: '100%' }} data-testid=\"journal-collab-edit-history-panel\">` + `:586 <h4 style={{ marginTop: 0 }}>수정 이력</h4>`. 목록 :588-589 `data-testid=\"journal-collab-edit-list\"` … `maxHeight: 320, overflowY: 'auto'` → :599 `edits.map((edit) => {`. **모달 아님. 단 전표/견적/주문과 달리 320px 스크롤 박스로 이미 높이가 묶여 있다.**",
   "dataSource": "GET /accounting/journals/{journalId}/collab/edits — JournalCollabController.java:177-189 `listEdits`, 권한 page=JOURNAL_PAGE_CODE action=VIEW. FE: clients/desktop/src/renderer/api/journalCollab.ts:90-97. query key `['journalCollabEdits', journalId]` (JournalCollaborationPanel.tsx:164, :182-186).",
   "ordering": "desc",
   "orderingEvidence": "서버 ORDER BY. JournalCollabController.java:182-184 `suggestionRepository.findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(CollabDocumentType.ACCOUNTING_VOUCHER, journalId, CollabSuggestionStatus.ACCEPTED)`. **정렬 축이 created_at**(다른 버전이력 4종은 revision_no). FE 재정렬 0건.",
   "itemCountObserved": "실측(accounting_db): `SELECT status, count(*) FROM journal_collab_suggestions GROUP BY status;` → **0행**. 현재 발화 조건 없음 — 화면에 「아직 수정 이력이 없습니다」(:598)만 나온다.",
   "isTarget": false,
   "notes": "⚠️ **판정 갈림 — 개발책임자 확인 권장.** 분개는 「전표」이지만 이 패널의 라벨은 「버전이력」이 아니라 「수정 이력」이고, revision/restore 계열이 아니라 collab suggestion(ACCEPTED) 목록이다. 복원 동작 **없음**(JournalCollabController 에 restore/revert 엔드포인트 없음). global.css:786-789 주석이 이 관계를 명시 — 「개발책임자 결정1(2026-07-06, #31 재확인) — Journal/GroupwareApproval 은 버전이력 격차 안내 카드(journal-version-history-gap/groupware-approval-version-history-gap) 대신 수정 이력 패널(journal-collab-edit-history-panel/…)로 대체됐다」. ⟹ **분개에는 버전이력이 없고 그 자리를 수정 이력이 대신한다**는 것이 기존 결정.\n🟡 실시간 갱신: 커밋 시 :206, :272 에서 editQueryKey 무효화. SSE 구독 여부는 미확인 — **미판정**.\n🟡 이미 maxHeight 320 스크롤이라 「한꺼번에 나와 가독성 저하」 증상은 전표만큼 크지 않음."
  },
  {
   "screen": "전자결재 문서 상세 — 「수정 이력」",
   "file": "clients/desktop/src/renderer/components/collab/GroupwareApprovalCollaborationPanel.tsx:692 (BE: services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareApprovalCollabController.java:185)",
   "currentRendering": "inline",
   "renderingEvidence": "GroupwareApprovalCollaborationPanel.tsx:688-694 `aria-label=\"수정 이력\"` … `data-testid=\"groupware-approval-collab-edit-history-panel\"` + `:694 <h4 style={{ marginTop: 0 }}>수정 이력</h4>`. 목록 :696-697 `data-testid=\"groupware-approval-collab-edit-list\"` … `maxHeight: 320, overflowY: 'auto'` → :707 `edits.map((edit) => {`. 모달 아님.",
   "dataSource": "GET (approval collab base)/edits — GroupwareApprovalCollabController.java:185-196 `listEdits`, page=PAGE_CODE action=VIEW. FE: clients/desktop/src/renderer/api/groupwareApprovalCollab.ts:99-107 `collabPath(approvalId, 'edits')`. query key `['…CollabEdits', approvalId]` (GroupwareApprovalCollaborationPanel.tsx:210-214).",
   "ordering": "desc",
   "orderingEvidence": "서버 ORDER BY. GroupwareApprovalCollabController.java:190-192 `suggestionRepository.findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(CollabDocumentType.APPROVAL_LINE, approvalId, CollabSuggestionStatus.ACCEPTED)`. 축은 created_at. FE 재정렬 0건.",
   "itemCountObserved": "실측(groupware_db): `SELECT status, count(*) FROM approval_collab_suggestions GROUP BY status;` → **0행**. 현재 발화 조건 없음.",
   "isTarget": false,
   "notes": "⚠️ 분개와 동일 판정 — 「문서」이지만 버전이력이 아니라 수정 이력이고 복원 없음. 근거는 global.css:786-789 의 개발책임자 결정1(2026-07-06) 주석. **개발책임자 확인 권장.**\n🟢 인쇄: 전자결재 인쇄는 승인 시점 각인 revision 을 쓰지만(ApprovalDocView.tsx:158-160 `findDocumentTemplateRevision(templateId, revision, docType)`) 이는 **양식 레이아웃 pin** 이지 이력 목록이 아니다. 인쇄물에 이력 목록은 들어가지 않음."
  },
  {
   "screen": "세금계산서 상세 — 「수정 N회」 배지 + 복원 드롭다운",
   "file": "clients/desktop/src/renderer/components/audit/AuditOverlaySection.tsx:42 (마운트: clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx:528-533)",
   "currentRendering": "none",
   "renderingEvidence": "이력 **목록을 렌더하지 않는다.** AuditOverlaySection.tsx:54-68 은 `수정 {revisionCount}회` 텍스트 배지 한 개만 그리고(:49 `const revisionCount = new Set(logs.map((l) => l.revisionNo)).size`), 이력 접근은 :69-107 `<select data-testid={`${testIdPrefix}-revert-select`}>` 드롭다운 옵션(`revision #{rev} 으로 복원`)뿐이다. 확인은 `window.confirm`(:79-85). TaxInvoiceDetailPage.tsx:528-533 `<AuditRevisionBadge logs={auditLogs} … onRevert={isDraft ? (rev) => revertMutation.mutate(rev) : undefined} />`. 나머지 audit 데이터는 :274 `groupAuditLogsByField(auditLogs)` 로 **필드별 오버레이**에 흩어져 붙는다.",
   "dataSource": "GET /accounting/tax-invoices/{id}/audit-logs — clients/desktop/src/renderer/api/createAuditApi.ts:103-107 `taxInvoiceAuditApi`. 복원 `POST /accounting/tax-invoices/{id}/revert/{rev}` (:105-106).",
   "ordering": "desc",
   "orderingEvidence": "**여기만 FE 정렬이다.** AuditOverlaySection.tsx:50-52 `const revertCandidates = Array.from(new Set(logs.map((l) => l.revisionNo))).sort((a, b) => b - a)` — 클라이언트에서 내림차순 재정렬. 서버 정렬은 이 엔드포인트에 대해 미확인 — **미판정**(같은 계열인 slip 쪽은 서버 정렬임: SlipAuditLogRepository.java:17 `findBySlipIdOrderByRevisionNoDescChangedAtDesc`).",
   "itemCountObserved": "미측정 — 세금계산서 audit_logs 테이블을 이번 조사에서 세지 않았다. **미판정.**",
   "isTarget": false,
   "notes": "🟢 이미 목록을 펼치지 않는다(배지+드롭다운). 지시의 「한꺼번에 있어 가독성 저하」에 해당하지 않음.\n🔴 복원 동작 있음 — DRAFT 일 때만 활성(TaxInvoiceDetailPage.tsx:533 `onRevert={isDraft ? … : undefined}`).\n🟡 같은 `createAuditApi` 팩토리로 만들어진 형제 엔드포인트 다수 — createAuditApi.ts:103-146: closingAuditApi(월마감), partnerLedgerAuditApi(거래처원장), partnerOrderAuditApi(주문, revert 지원), dcConfigAuditApi, inventoryAuditAuditApi, arologisDispatchAuditApi. 모두 같은 배지/드롭다운 패턴이라 개별 조사는 생략 — **개별 렌더링 방식 미판정.**"
  },
  {
   "screen": "전표 상세 — audit-log 기반 「수정 N회」 + 필드별 레드라인",
   "file": "clients/desktop/src/renderer/routes/SlipDetailPage.tsx:2579-2600, 3571-3582 (BE: services/slip-service/src/main/java/com/samhanair/logis/slip/audit/web/SlipAuditLogController.java:58)",
   "currentRendering": "inline",
   "renderingEvidence": "목록으로 펼치지 않는다. SlipDetailPage.tsx:2579 `const auditLogs: SlipAuditLogEntry[] = Array.isArray(auditLogsQuery.data) ? auditLogsQuery.data : []` → :2580 `const auditByField: Record<string, AuditLogEntry[]> = auditLogs.reduce(` (필드별 그룹) → :2600 `const revisionCount = new Set(auditLogs.map((l) => l.revisionNo)).size`, :3571 주석 `{/* PR-H2: 수정 횟수 표시 — auditLogs distinct revisionNo 개수 */}`. 즉 **횟수 배지 + 셀 인라인 오버레이**로만 소비되고 타임라인 리스트는 없다.",
   "dataSource": "GET /slips/{slipId}/audit-logs — SlipAuditLogController.java:58-61 → SlipAuditLogService.java:140-142. 별도로 GET /slips/{slipId}/redline (SlipRedlineController.java:32-35, page=`slip.audit-overlay` VIEW) 이 셀 레드라인을 공급 — SlipDetailPage.tsx:1561-1577.",
   "ordering": "desc",
   "orderingEvidence": "서버 ORDER BY. SlipAuditLogRepository.java:17 `List<SlipAuditLog> findBySlipIdOrderByRevisionNoDescChangedAtDesc(UUID slipId);`, 호출부 SlipAuditLogService.java:142 `return auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId);`. FE 는 순서를 쓰지 않고 필드별로 재그룹(:2580).",
   "itemCountObserved": "미측정 — **미판정.**",
   "isTarget": false,
   "notes": "버전이력(revisions)과 **별개 계약**이다. 전표 상세 화면은 revisions(버전이력 패널)와 audit-logs(횟수 배지 + 레드라인) 두 계통을 동시에 쓴다. 모달화 대상은 앞의 revisions 쪽. 이 계통을 건드리면 셀 레드라인이 함께 사라지므로 분리 유지 필요."
  },
  {
   "screen": "창고 수정 다이얼로그 — 「변경 이력」 타임라인",
   "file": "clients/desktop/src/renderer/components/EditWarehouseModal.tsx:232 (타임라인 구현 :339, BE: services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/WarehouseController.java:164)",
   "currentRendering": "modal",
   "renderingEvidence": "**이미 모달 안이다.** 컴포넌트 이름·구조가 모달(EditWarehouseModal)이고 :232-240 `<AuditTimeline rows={auditQuery.data!} onRevert={(rev) => revertMutation.mutate(rev)} … />` 가 그 안 스크롤 박스(:219-223 `padding: 8, background: '#f9fafb'`)에 들어간다. 타임라인 본체 :339 `function AuditTimeline({ rows, onRevert, revertingRevision })` → :351-357 revision 별 그룹 → `<ul>`(:352 이후) 로 전량 렌더.",
   "dataSource": "GET /inventory/warehouses/{id}/audit-logs — WarehouseController.java:164-170 `listAuditLogs`, page=`inventory.warehouse` action=VIEW → `warehouseService.listAuditLogs(id)`.",
   "ordering": "desc",
   "orderingEvidence": "FE 가 서버 순서를 신뢰한다고 주석에 적고도 **한 번 더 재정렬한다**. EditWarehouseModal.tsx:340-341 주석 `// backend 가 이미 revisionNo desc + changedAt desc 로 정렬해서 반환.` :349 `const sortedRevisions = Array.from(grouped.keys()).sort((a, b) => b - a)` — 클라이언트 내림차순. ⚠️ 서버 측 ORDER BY 는 이번 조사에서 리포지터리까지 확인하지 못했다 — **서버 정렬 여부 미판정**(FE 주석은 근거가 아님).",
   "itemCountObserved": "미측정 — **미판정.**",
   "isTarget": false,
   "notes": "이미 모달 · 전표/문서가 아닌 창고 마스터. 다만 「모달 안 타임라인 + 행별 되돌리기 버튼」의 **기존 구현 선례**라 전표 모달 설계 시 참고 가능(:388-400 되돌리기 버튼, :361 `revertable` 판정으로 isDeleted 전용 그룹은 버튼 숨김)."
  },
  {
   "screen": "종합견적서(웹) — 견적 이력 페이지",
   "file": "clients/web/estimate-app/views/index.ejs:209 (BE: services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:82)",
   "currentRendering": "separate-page",
   "renderingEvidence": "index.ejs:209 `#pageHistory { padding: 0 16px; display: flex; flex-direction: column; height: 100%; overflow: hidden; }`, :214 `body.history-active .grid { display: none !important; } body.history-active #pageHistory { display: flex !important; }` — 본 화면(.grid)을 통째로 감추고 이력 화면으로 전환하는 **앱 내 별도 페이지**다(모달 아님). 표는 :211 `.history-list-wrap … .history-table`.",
   "dataSource": "GET /internal/estimates/snapshots?userEmail=&startDate=&endDate= — QuoteSnapshotController.java:82-88 `history(...)`. 거래처명 검색은 :102-107 `GET /internal/estimates/snapshots/by-customer`. FE RPC: clients/web/estimate-app/lib/code.js:2495 `getQuoteHistory`, :2512 `getQuoteHistoryByCustomer` (SNAPSHOT_BASE 정의 :2457).",
   "ordering": "desc",
   "orderingEvidence": "서버 ORDER BY. QuoteSnapshotRepository.java:37, :47, :62 세 쿼리 모두 `ORDER BY q.savedAt DESC`. 축은 저장일시(savedAt). 컨트롤러 Javadoc :75 「저장일시 내림차순 스냅샷 목록」·:95 「저장일시 내림차순 최근 30건」. FE 재정렬 여부는 미확인 — **미판정**.",
   "itemCountObserved": "실측(slip_db): `SELECT count(*) FROM quote_snapshots;` → **0행**. 현재 발화 조건 없음. 서버 상한은 by-customer 만 30건 — QuoteSnapshotService.java:69 `org.springframework.data.domain.PageRequest.of(0, 30)`; 기간 조회(`history`)에는 **상한 없음**.",
   "isTarget": false,
   "notes": "이것은 한 문서의 버전이력이 아니라 **저장된 견적 문서들의 목록(불러오기 이력)** 이다 — legacy `getQuoteHistory` 대체(컨트롤러 Javadoc :25-27). 복원 개념은 「그 스냅샷 blob 을 열기」이지 revision restore 가 아니다. 지시 대상 아님으로 판정."
  },
  {
   "screen": "전자결재 문서 양식 revision (재인쇄용 각인)",
   "file": "services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareDocumentTemplateController.java:107",
   "currentRendering": "none",
   "renderingEvidence": "**사용자에게 보여주는 이력 목록 자체가 없다.** 엔드포인트는 단건뿐 — :106-110 `@Operation(summary = \"승인 당시 문서 양식 revision 조회\") @GetMapping(\"/groupware/document-templates/{templateId}/revisions/{revision}\")` → `revisionService.findResponse(templateId, revision)`. 리포지터리에도 목록 메서드가 없다 — DocumentTemplateRevisionRepository.java 는 `findByTemplateIdAndRevisionAndIsDeletedFalse`, `findById`, `save`, `saveAndFlush` 4개만 노출(의도적으로 JpaRepository 미상속, 클래스 Javadoc 참조). FE 소비처는 인쇄 경로 하나 — ApprovalDocView.tsx:158-160 `const revision = approval?.documentTemplateRevision … return findDocumentTemplateRevision(templateId, revision, docType!)`, API clients/desktop/src/renderer/api/documentTemplate.ts:68.",
   "dataSource": "GET /groupware/document-templates/{templateId}/revisions/{revision} (단건). DTO: DocumentTemplateRevisionResponse.java (templateId, revision, schemaVersion, document).",
   "ordering": "none",
   "orderingEvidence": "목록 쿼리가 존재하지 않으므로 정렬 개념이 없다(위 리포지터리 메서드 4개 전수).",
   "itemCountObserved": "항상 1건(단건 조회).",
   "isTarget": false,
   "notes": "🟢 **인쇄 관련 질문의 답 중 하나** — 이 revision 은 「승인 당시 양식 레이아웃을 각인해 재인쇄 때 그대로 재현」하는 용도이지 사용자에게 보여주는 버전이력이 아니다. 인쇄물에 이력 목록은 들어가지 않는다. 모달화와 무관."
  },
  {
   "screen": "(미배선) shared collab-core 공통 revision 서비스",
   "file": "shared/collab-core/src/main/java/com/samhanair/logis/collab/CollabRevisionService.java:82",
   "currentRendering": "none",
   "renderingEvidence": "어떤 서비스도 주입하지 않는다. 저장소 전수 검색(`rg --no-ignore -l \"CollabRevisionService\"`, build/bin/node_modules 제외) 결과 매치는 **자기 자신 1개 + 문서 3개**(docs/superpowers/specs/2026-06-30-coedit-s3-0-relay-shared-design.md, docs/superpowers/specs/2026-06-13-global-collab-slip-reference.md, docs/dev-reports/2026-08-01-1014-doc-autosave-recon.md)뿐 — services/** 코드 참조 0건. 따라서 노출 지점 없음.",
   "dataSource": "없음 (컨트롤러에 배선되지 않음). 클래스 내부 계약: :82-91 `listWithCount(CollabDocumentType, UUID, int page, int limit)`, :56-79 `restore(...)`.",
   "ordering": "desc",
   "orderingEvidence": "클래스 내부적으로는 서버 정렬 — :87-88 `List<T> items = repository.findByDocumentTypeAndDocumentIdOrderByRevisionNoDesc(documentType, documentId, pageable);` (인터페이스 선언 :149). 주석 :81 「최신순 revision 목록과 전체 개수를 함께 반환한다」.",
   "itemCountObserved": "해당 없음(미사용).",
   "isTarget": false,
   "notes": "🟡 **모달 설계에 직접 쓸모 있는 유일한 페이징 계약** — 현재 배선된 버전이력 4종(전표·견적·주문·거래처)은 **모두 페이징이 없고 전량 반환**인데, 이 미사용 공통 서비스만 `PageRequest.of(safePage, safeLimit)` + `MAX_LIMIT` 상한 + `countByDocumentTypeAndDocumentId` 총건수를 갖고 있다(:83-90). 모달에 「더 보기/페이지」를 넣으려면 참고 대상.\n🟡 SSE 이벤트도 이미 정의됨 — :74 `publisher.publish(documentId, EVENT_REVISION_RESTORED, payload(restored))`."
  }
 ]
}
```
