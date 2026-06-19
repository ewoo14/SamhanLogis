# spec: 이카운트 이관 자료 네이티브 편입 + "회계 관리자" silo 폐기

> 2026-06-19. 개발책임자 지적("이관 자료는 시드로 기존 시스템 편입, 별도 메뉴/저장 금지") → 정찰(`docs/research/2026-06-19-ecount-native-fold-recon.md`) → 본 spec → 슬라이스.
> 전략: [[전산=이카운트 대체]], [[옵션C 폐기 전면 DB 치환]]. 메모리 [[project-ecount-native-fold]].

## 개발책임자 결정 (확정)
- **D1 = slip-service `partner_orders` 이식**: 이관 주문(accounting `orders`, MIG-8)을 네이티브 주문 도메인(slip-service partner_orders)으로 cross-service 이식. 일반 "판매 ▸ 주문서" 화면에서 조회. [[project-partner-order-status-model]]·[[project-order-slip-conversion]] 계열.
- **D2 = 그대로 통합 표시**: 분개장/원장에 이미 섞여 보이는 이관 현금 분개를 이관/신규 구분 없이 통합 표시(별도 배지/필터/기간컷오프 없음). → **슬3 불필요(폐기)**.
- D3(중간테이블 물리 제거 시점)·D4(원장대조/운영대시보드 cutover 후 처리): Phase11 cutover 시점 후속 결정. 현재는 lineage 유지 + 격리.

## 현황 (정찰 확정)
- 현금(지출/입금): MIG-9가 네이티브 `journals`(POSTED 복식부기)로 이미 편입 → 분개장/원장/시산표/재무보고서/입금매칭 노출. silo는 **중복 화면 + 중간테이블**일 뿐.
- 주문: accounting `orders`(MIG-8)만 보유, 네이티브 미편입(유일 데이터 silo). → D1 이식 대상.
- 거래처 잔액: native MV(`partner_aging_snapshot`) 파생 → silo 화면 중복.
- 원장 대조·운영 대시보드: cutover 검증 1회성 도구.

## 슬라이스 (각 독립 머지, 순서)

### 슬1 — 잔액 스냅샷 silo 폐기 (정책 무관, 최안전)
- FE: AppLayout `회계 관리자 ▸ 잔액 스냅샷`(page-code `ecount.mig14.aging-snapshot`) 메뉴 제거, route 제거. 네이티브 `/accounting/reports/partner-aging`(거래처 aging)로 대체 안내.
- BE: AccountingAdminQueryService aging 조회 경로 deprecate(데이터는 native MV 유지).
- 가드: [[FE 가드 제거=전체 mock suite]] — route/메뉴 제거 시 전체 Playwright mock suite. page-code 제거는 permissions/matrix/mock seed 동기화([[defect-family-sweep-fix]] 4종 체크).

### 슬2 — 현금 지출/입금 silo 화면 폐기 (정책 무관)
- FE: `지출/입금 트랜잭션`(page-code `ecount.mig14.cash-list`) 메뉴·route 제거. 분개장(`/accounting/journals`)+입금매칭으로 대체.
- BE: cash 조회 endpoint deprecate. **cash_disbursements/cash_receipts 테이블은 비노출 lineage 유지(DROP 금지)** — MIG-9 멱등 가드.
- D2=통합표시이므로 분개장 변경 없음(이미 노출됨).

### 슬4 — 원장 대조 + 운영 대시보드 격리 (cutover 전 폐기 금지)
- FE: `매출/매입 원장 대조`(`ecount.mig14.ledger`)·`운영 대시보드`(`ecount.mig.ops-dashboard`)를 일반 회계 메뉴에서 제거 → 운영 admin 전용 가드(예: MASTER+운영)로 이동. 물리 제거는 cutover 후(D4).

### 슬5 — "회계 관리자" 토글 그룹 최종 해체 (슬1·2·4 후)
- FE: `회계 수정 요청`을 회계 본류 메뉴로 재배치(page-code `accounting.edit-requests.decide` 유지). `showAccountingAdminGroup` 중첩 토글(AppLayout.tsx:985-1061) 제거.

### 슬6 — 주문 네이티브 이식 (D1 확정, 대형·별도 에픽급)
- accounting `orders`/`order_lines`(MIG-8) → slip-service `partner_orders` cross-service 이식(시드 마이그레이션). partner_id는 partner-service SoT 재사용(G2, 시드 불필요).
- 이식 후 `주문서 관리/상세`(`ecount.mig14.order-list`) silo 폐기 → `/sales/partner-orders` 대체. 이식 완료 후에만 accounting orders lineage 격하.
- 가드: [[마이그레이션 fresh Postgres probe]], cross-service IT, [[변경 모듈 전체 test 완주]]. MIG-8 Testcontainers IT는 Linux CI 실행 확인([[testcontainers-windows-docker]]).
- ※ 과거 이관 주문의 상태 매핑(완료/진행/취소 → partner_order status)은 슬6 착수 시 세부 설계.

## 검증 원칙
- silo 화면/route/page-code 제거 = 전체 mock suite + permissions/matrix/mock seed 동기화 + Docker 실QA(해당 네이티브 대체 화면에 자료 보임 캡처, [[no-fake-data]]).
- BE 변경 = fresh Postgres probe(마이그) + Linux CI IT.
- 슬라이스마다 조기 PR + dual review(Opus↔Codex) + CI green + Docker 실QA → 머지.

## 권장 진행 순서
슬1 → 슬2 → 슬4 → 슬5 (silo 메뉴 정리, 빠른 가치, cutover 무관) → 슬6(대형, 주문 이식). Phase11 cutover 후: D3 물리 DROP, D4 격리도구 최종 처리.
