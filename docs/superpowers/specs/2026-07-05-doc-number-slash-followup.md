# 문서번호 통일 후속 — %2F 결함군·재고실사 동시성·커버리지·문서 (fix/doc-number-slash-followup)

> #727 소급 5-agent+Codex 리뷰가 적발한 실 버그/갭 종합 fix. **이번엔 정식 듀얼 리뷰 준수**(Codex 개발 → Opus 5-agent ↔ Codex 0수렴 → PM 종합 → CI → 머지). 워크플로우 재량-제거([[feedback_expanded_scope_reinstate_review]]).

## 배경
#727에서 전표번호/문서번호를 슬래시 `yyyy/MM/dd-N`로 통일했으나, 소급 리뷰가 (a) 수금계획 CREATE mock 누락 (b) %2F 결함군 미완주(collection-plans만 처리·나머지 4곳 잔여) (c) 재고실사 채번 동시성 미보강 (d) 테스트 갭 (e) 문서 stale 적발.

## 결정
- **D1 %2F 경로 = 정석 `toOrderPathId`**: 슬래시→하이픈 URL 경로 치환(FE) + BE 하이픈/슬래시 양방향 수용(`PartnerOrderIdResolver.toSlashOrderNo` 선례). Codex가 collection-plans에 쓴 `/{year}/{month}/{daySeq}` 비정석 overload는 **toOrderPathId 패턴으로 refactor**(BE 리뷰 지적·DRY).
- **D2 재고실사 채번 = 수금계획 V55 패턴**: `inventory_audit_number_sequences` 시퀀스 테이블 + PESSIMISTIC_WRITE + insertIfAbsent + 신규 마이그(inventory 최신 V+1). count+1 race 제거.
- **D3 주문번호 Mig8(별건 확인)**: `Mig8OrderTransformService` ORDER_NO 정규식이 hyphen `^\d{4}-\d{2}-\d{2}-\d+$` — 이게 저장 형식인지 경로 형식인지 조사 후 판단. 런타임 주문번호가 이미 슬래시 저장+toOrderPathId 경로면 Mig8은 legacy import 검증이라 **본 PR 범위 밖(별도 이슈)**. → 개발책임자 확인.

## 요구 (fix 목록)
1. **[실버그] 수금계획 CREATE mock** `mock.ts:5690` `CP-${...}` → `plannedDate.replace(/-/g,'/') + '-' + seq`(선행0 없음). CollectionPlan 시퀀스 채번과 정합.
2. **[%2F] FE toOrderPathId + BE 하이픈 수용**:
   - `postSalesSlip`/`postPurchaseSlip`(salesAccountingSlipApi:224·purchaseAccountingSlipApi:212)
   - `signature.ts:104,132`(인수자·기사 서명)
   - `getAccountingOrder`(accountingAdminApi:112)
   - BE: 각 컨트롤러(`SalesAccountingSlipController`·`PurchaseAccountingSlipController`·`PublicSlipController`·`AccountingAdminQueryController`)가 하이픈 slipNo/orderNo 를 슬래시로 정규화해 조회. mock 핸들러도 하이픈 경로 parity.
   - CollectionPlan overload → toOrderPathId refactor(FE `accounting.ts:1922` + BE `CollectionPlanController` 하이픈 수용, `/{year}/{month}/{daySeq}` 제거).
3. **[동시성] 재고실사** D2대로 시퀀스 도입 + 마이그.
4. **[테스트]**:
   - `mock.test.ts` `DOCUMENT_NO_KEY_SET`에 `planNo`·`auditNo` 추가 + CREATE(POST) 결과 형식 assertion.
   - 동시성 채번 IT: CollectionPlanNumberSequence·재고실사(ExecutorService+CountDownLatch, 타 *NumberServiceIT 선례).
   - 마이그 전환 회귀 IT: 레거시 AU-/CP- seed → migrate → 슬래시 검증(V20/V55 전환경로 자동화).
   - CollectionPlanPage/서명/전표확정 %2F 경로 회귀(실 함수 경유 — 기존 우회 테스트 보강).
5. **[문서]**: InventoryAudit Javadoc stale 3곳(Service:337·domain:105·Repository:20)·`accounting.ts:1926` %2F 주석(실측=미차단으로 정정).

## 함정
- **%2F는 게이트웨이 StrictHttpFirewall 이 실제 차단**(#728 라이브 실증: 하이픈 경로 200·%2F 경로 400 — #727 초기 404 관측은 구 accounting 이미지 기준 오차) → toOrderPathId(하이픈)+BE resolver 필요.
- 적용된 마이그 불변 — 신규 V만. fresh+기존 DB probe.
- BE 하이픈 수용 시 기존 슬래시 본문(body)과 혼동 없게(경로만 하이픈).

## Disposition (소급 5-agent 리뷰 반영)
- **[보류] stripSlipNoZeros 인쇄/화면 비대칭**(#727 Design MED): print 계열만 정규화·목록/상세 raw. **본 PR 범위 밖으로 보류** — 근거: 레거시 선행0 데이터는 이미 별건 마이그(accounting V39·slip V47/V48·groupware V7)로 대부분 정규화됐고 현 BE 채번기가 무-pad(선행0 없음)라 신규 데이터 안전. 표시 정합 통일(화면에도 stripSlipNoZeros 적용 or 헬퍼 정책 명문화)은 별도 UI 슬라이스로 분리.
- **[별건 이슈] 게이트웨이 라우트 부재**: `/admin/sales-slips/**`·`/admin/purchase-slips/**` 라우트 없어 게이트웨이 경유 404(전표 확정 실경로 단절·main 동일·pre-existing). 서명 `/public/batches/**` FE 경로 `/api` prefix 누락 404. → 별도 인프라 이슈 등록(#728 원인 아님).
- **[보류] DRY 3중 복제**: DocumentNumberPathResolver·PartnerOrderIdResolver·(구)PublicSlipController 동일 로직 → shared/common 이관은 다서비스 리팩터라 별도.
