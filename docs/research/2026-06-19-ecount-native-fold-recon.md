# 이카운트 이관 자료 "네이티브 편입 + silo 폐기" — 정찰 보고

> 2026-06-19. 개발책임자 지적: "이카운트 이관 자료를 따로 메뉴로 만들지 말고 시드로 기존 시스템에 편입시켜야지. 과거 자료를 따로 저장하면 어떻게해."
> 전략 근거: [[전산=이카운트 대체, GAS는 export원]], [[옵션C 폐기 — 외부 4종 전면 DB 치환]].
> 방법: 정찰(본 문서) → spec → 슬라이스 (개발책임자 확정).
> Opus 5-리더 병렬 정찰(pipeline/native-domain/silo/fe-menu/service-boundary) 종합.

## 1. 현황 요약

| 자료 | foldStatus | 네이티브 등가(화면/테이블) | silo 메뉴(page-code) | SoT |
|---|---|---|---|---|
| 현금 지출(cash_disbursements) | **folded-native(데이터)** + silo(화면) | 분개장 journals(source_type=CASH_DISBURSEMENT) / JournalListPage | 지출 트랜잭션 `ecount.mig14.cash-list` | journals(자립 source_ref) |
| 현금 입금(cash_receipts) | **folded-native** + silo(화면) | 분개장 journals(CASH_RECEIPT) / 입금매칭 | 입금 트랜잭션 `ecount.mig14.cash-list` | journals |
| 주문(orders/order_lines, MIG-8) | **siloed (미편입)** | 부분: 완료주문→sales_accounting_slips slip_no 매칭만. 본문 등가 없음 | 주문서 관리 `ecount.mig14.order-list` | **미정**(slip partner_orders vs accounting sales-slip) |
| 거래처 잔액(partner_aging_snapshot) | **native-only(MV 파생)** | 거래처 aging 보고서 `/accounting/reports/partner-aging` + PartnerLedgerPage | 잔액 스냅샷 `ecount.mig14.aging-snapshot` | journals(POSTED) |
| 매출/매입 원장(ecount_*_ledger_raw) | siloed(검증 raw) | 원장 `/accounting/ledgers` (대조 메타는 등가 없음) | 원장 대조 `ecount.mig14.ledger` | staging raw(cutover 검증) |
| 운영 대시보드 | transform-tool | 없음(ETL 관측) | `ecount.mig.ops-dashboard` | Prometheus |
| 회계 수정 요청 | native-only | 화면 자체가 네이티브 결재 | `accounting.edit-requests.decide`(silo 아님) | edit_requests |

**핵심:** 현금은 데이터가 이미 네이티브 분개장 전 화면(분개장/원장/시산표/B-S/I-S/현금흐름/일·월계/거래처 aging)에 노출됨 — MIG-9가 `POSTED` 직접 INSERT하고 조회 쿼리에 source_type 배제 필터 전무. **silo는 데이터가 아니라 중복 화면 + 중간테이블 문제.**

## 2. 갭

- **G1 (최대) 주문 본문 미편입**: accounting `orders`(kind=ECOUNT_MIG8)는 이관 전용 중간 엔티티. 네이티브 주문(slip-service partner-order)으로 가는 transform/client 0건. 완료주문→sales_accounting_slips slip_no 매칭만. → cross-service 이식 또는 accounting sales-slip 귀속 결정 필요(D1).
- **G2 거래처 배선**: cash_*/orders는 partner_id+denormalized name 보유, SoT=partner-service. **시드 불필요**, lookup 재조회뿐 — 비용 낮음.
- **G3 원장 대조 메타**: transform_status·daily_diff는 네이티브 등가 없음 — 편입 대상 아닌 **cutover 검증 전용 격리** 대상.
- **G4 (확인 필요)**: JournalListPage가 이관 현금 분개에 source_type 배지/필터를 노출하는지 미확인(D2 연계).

## 3. "회계 관리자" 상설 메뉴 폐기 → 대체 (AppLayout.tsx:985-1061)

| 하위메뉴 | 처리 | 대체 네이티브 화면 |
|---|---|---|
| 지출 트랜잭션 | 폐기 | 분개장 + 입금매칭 |
| 입금 트랜잭션 | 폐기 | 분개장 + 입금매칭 |
| 주문서 관리/상세 | 이식 후 폐기 | (등가 없음) → D1 해소 후 |
| 잔액 스냅샷 | 폐기 | `/accounting/reports/partner-aging` |
| 매출/매입 원장 대조 | 격리(1회성) | 운영 admin 분리, cutover 후 폐기 |
| 운영 대시보드 | 격리/비노출 | 운영 admin |
| 회계 수정 요청 | 재배치(폐기X) | 회계 본류 메뉴 이동 |

## 4. 중간테이블(cash_*/orders) 처리

journals.source_ref는 cash external_ref 복사 자립 컬럼, 멱등성=journals UNIQUE(source_type,source_ref) → **journals는 cash_*에 런타임 의존 없음**. read 소비자=AccountingAdminQueryService 1곳.
- cash_*: silo 화면 제거 후 **사용자 비노출 lineage 유지 권장**(audit/재import 멱등 가드). 물리 DROP은 cutover 완전 종료 후.
- orders/order_lines: G1 이식 전 **제거 불가**(미편입 유일 사본).

## 5. 슬라이스 분해

- **슬1** 잔액 스냅샷 화면 폐기 → native partner-aging 연결 (의존 0, 최안전)
- **슬2** 현금 지출/입금 silo 화면 폐기 → 분개장/입금매칭 (cash_* lineage 유지)
- **슬3** 분개장 source_type 가시성(배지/필터) — D2 확정 후
- **슬4** 원장 대조 + 운영 대시보드 격리(운영 admin) — cutover 전 폐기 금지
- **슬5** 회계 수정 요청 재배치 + "회계 관리자" 토글 그룹 최종 해체 (슬1·2·4 후)
- **슬6 (대형)** 주문 네이티브 이식 — D1 확정 필수, 별도 에픽급

권장 순서: 슬1 → 슬2 → 슬4 → 슬5 (빠른 가치) ‖ 슬3(정책 후) ‖ 슬6(정책+대형).
Phase11 관계: 슬1·2·3·5 cutover 무관 즉시 가능. 슬4 원장대조/운영대시보드 + cash_*/orders 물리 DROP은 **cutover 후**.

## 6. 미해결 결정 (개발책임자)

- **D1 (슬6 선결) 주문 도메인 귀속**: slip-service partner_orders 이식 vs accounting sales-slip 귀속. 이식 범위가 전혀 달라짐.
- **D2 (슬3) 과거 이관 데이터 표시 범위**: 통합 표시 vs source_type "이관" 배지 vs 기간 컷오프 필터.
- **D3 cash_*/orders 물리 제거 시점**: lineage 영구 유지 vs cutover 후 DROP.
- **D4 원장 대조/운영 대시보드 cutover 후**: 완전 제거 vs 운영 admin 영구 보존(감사).

## 7. 위험

- false-green: MIG-8/9 Testcontainers IT는 Windows 로컬 skip 가능 → fresh Postgres probe + Linux CI 확인. silo 화면/route 제거는 [[FE 가드 제거=전체 mock suite]], 분개장 source_type 변경은 [[권한 enforcement 실 HTTP 회귀]]. 슬6 cross-service 이식은 [[마이그레이션 fresh Postgres probe]].
- 추측 표시 항목: 세금계산서 silo 존재, JournalListPage source_type 노출, 주문 SoT 귀속 — 별도 정찰/개발책임자 확인.
