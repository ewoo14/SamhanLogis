# 🔍 TM 통합 리뷰 — Phase 2.6a 부분전환 · Cycle 2 (Claude 5-agent 재리뷰)

> HEAD cycle1 fix `30b2c6d7`. 사이클 N=2 의무([[cycle-n2-mandatory]]).

## 종합 판정: APPROVE (cycle2). 차단 결함 0.

### cycle1 결함 해소 검증
| cycle1 | fix | cycle2 |
|---|---|---|
| P0-1 트랜잭션(발행 성공 후 converted) | 사전검증→발행→converted 누적+save | ✅ 발행성공=converted 원자성. save 실패 잔여=2.6c outbox |
| P0(warehouseCode DEFAULT 폴백) | 필수 검증, 폴백 제거 | ✅ |
| P1-1 idempotency 충돌 | convertedBefore 스냅샷 | ✅ case7 2키 isNotEqualTo |
| P1-2/G-1 PENDING_RETRY 이중발행 | requireConvertible 화이트리스트(DRAFT/ON_HOLD) | ✅ case9 CONFIRMED+PENDING_RETRY 409 |
| G-2/G-7 CONVERTED 추가전환 | 화이트리스트 자동 차단 | ✅ case8 409 |
| P1-5 linkedSlipNo | BE DTO 필드명 linkedSlipNo 확인(버그 아님) | ✅ |
| Designer 뱃지색/모달경고/컬럼/CSS | statusConverted 별색+비가역경고+전환됨컬럼+인라인 제거 | ✅ |
| IT 보강 | case7~10 | ✅ 10 IT + 단위4 skipped=0 |

### 잔여 비차단 (2.6b/2.6c 또는 후속 — dev-report 명시 의무)
- **P1(비차단)**: ① FE pagecodes.json `sales.partner-order.convert` 미등록 + 정적 CONVERT_ROLES(동적 RBAC 매트릭스 동일이라 운영 동작 차이 없음) ② Phase 2.6a Playwright spec → **Task 8 에서 작성 예정**.
- **P2/scope**: slip-service IT source_order_line_id DB 단언 / slip 5xx rollback IT / 권한 IT PARTNER→SALES 의미론 / **inventory 미차감(2.6c 재고정합)** / slip 발행 성공 후 save 실패(2.6c outbox).
- **문서**: slip V29(plan V10 오기) / 배포순서 auth(V41)→slip(V29)→partner-order(V8) / V41 ON CONFLICT V39 partial index 의존 확인.

→ Task 8(Playwright+dev-report+배포문서) → CI green(skipped=0) → Docker 실 QA(실화면 [[no-fake-data-ever]]) → 머지.
