# ✅ PM 최종 종합 리뷰 — Phase 2.6a 주문→출고전표 부분전환

> HEAD `6e9c4cf2` · **CI 전 job + GitGuardian PASS** · ⚠️ Codex 다운 → Claude 5-team 전면 대체

## 결론: 머지 승인

## 구현 요약
- **대상**: slipNo=null AND status∈{DRAFT,ON_HOLD} 화이트리스트(이중발행 차단)
- **데이터**: `converted_quantity`(V8+CHECK) / `SlipLine.source_order_line_id`(slip V29)
- **전환**: `convert`/`requireConvertible` 화이트리스트/`markConvertedIfComplete`(CONVERTED) + `POST /{id}/convert-to-slip` + 트랜잭션(사전검증→발행→발행성공후 converted) + idempotencyKey convertedBefore 스냅샷
- **FE**: 전환버튼 화이트리스트 + 라인 수량 모달(비가역 경고) + CONVERTED 별색 + 전환됨/잔여 컬럼
- **권한**: sales.partner-order.convert(auth V41)
- **🔧 P0 버그 수정**(Docker 실 QA 발견): SlipServiceClient `/slips/` → `/api/v1/slips/from-partner-order` + X-User-Role:MASTER 헤더 (Phase 6 잠재버그, confirm/convert/outbox 공통)

## 사이클 이력
| 사이클 | 결과 |
|---|---|
| Cycle 1 (5팀) | P0 2(트랜잭션/DEFAULT폴백) + P1 6(idempotency/PENDING_RETRY 이중발행/linkedSlipNo 등) |
| Cycle 1 fix | requireConvertible 화이트리스트 + 트랜잭션 재설계 + idempotency convertedBefore + IT 7~10 + FE 화이트리스트/CONVERTED별색/모달경고 |
| Cycle 2 (재리뷰) | BE/FE/QA APPROVE, 차단 0 |
| Docker 실 QA + cycle3 | SlipServiceClient P0 경로버그 발견·수정 + 실화면 4장 + 실적중 psql + BE 재검 APPROVE |

## 검증
- **CI 전 job + GitGuardian PASS**
- **BE IT 10**(실 Postgres, skipped=0) + 단위 4 + Playwright
- **Docker 실 QA**: convert API 200, converted_quantity=2(psql), slip_lines.source_order_line_id 기록(psql), 잔여초과/CONFIRMED 409 — 실 gateway+실 JWT+실 DB

## 잔여 (2.6b/2.6c 분리 — dev-report 명시)
- **2.6b**: 다중주문 병합(같은 거래처, 헤더 '/'병기) + confirm 자동발행 폐지
- **2.6c**: inventory 차감(부분전환 출고전표 재고 미반영 경고) + 회계 정합 + outbox(발행 후 save 실패 보상)
- 비차단: FE pagecodes 동적연동 / slip-service source_order_line_id DB 단언 IT / 서비스간 contract test
- **운영 주의**: SlipServiceClient 경로 fix 배포 후 그동안 쌓인 outbox PENDING 일괄발행 부하 — 배포 전 `SELECT count(*) ... slip_publish_outbox WHERE status='PENDING'` 확인
- **배포순서**: auth(V41)→slip(V29)→partner-order(V8)

## 메모리 가드 ✅
[[cycle-n2-mandatory]] / [[no-fake-data-ever]](실화면 캡처) / [[feedback_qa_docker_real_test]] / [[gitguardian-false-positive]](평문 제거로 실해소) / [[always-mouse-choices]]
