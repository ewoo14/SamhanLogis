# 🔍 TM 통합 리뷰 — Phase 2.6a 주문→출고전표 부분전환 · Cycle 1 (Claude 5-agent)

> HEAD `0c79ef4d` · Codex 다운 → Claude 5-team 대체. **전원 CHANGES REQUESTED** (회계/재고 정합성 직결).

## 종합 판정: CHANGES REQUESTED (P0 2 / P1 6 / P2 다수)

### P0 — 머지 차단
| # | 팀 | 문제 | 권장 |
|---|---|---|---|
| P0-1 | BE/QA | **slip 발행(외부 REST)이 @Transactional 내** → 발행 성공 후 롤백 시 slip 발행됐는데 converted_quantity=0 (또는 반대). confirm 은 markSlipPendingRetry+outbox 로 해결한 문제를 convert 는 무방비 | slip 발행을 트랜잭션 마지막(saveAndFlush 후)으로 + 발행 실패 보상/재시도, 또는 발행 성공 후에만 converted 커밋 |
| P0-2 | DevOps | slip 마이그레이션 plan 표기 V10 ↔ 실제 V29 불일치(실제 V29 정상, 문서 정정 필요) | spec/plan/dev-report V29 정정 |

### P1
- **P1-1 (BE/QA) idempotencyKey 충돌**: key=SHA(orderId+정렬 lineId:qty). 같은 라인 같은 수량 2회 전환 → 동일 키 → 2번째 slip 미발행인데 converted_quantity 만 증가(출고전표 없이 전환수량 증가). → key 에 converted 스냅샷/sequence 포함 또는 클라이언트 제공 키.
- **P1-2 (BE/FE/QA) PENDING_RETRY 이중발행**: requireConvertible 이 slipNo!=null 만 검사 → CONFIRMED+slipNo=null(outbox 재발행 대기) 주문이 전환 통과 → outbox + convert 이중 출고전표. confirm/convert idempotencyKey 형식 달라 slip 멱등도 못 막음. → **전환 대상을 DRAFT/ON_HOLD 화이트리스트로 한정**(spec §7a 의 의도. 코드가 CONFIRMED 허용해버림) + FE NON_CONVERTIBLE 에 CONFIRMED 추가.
- **P1-3 (BE/QA) inventory 미차감**: 부분전환 출고전표 생기는데 재고 reserve/차감 없음 → 재고 과다출고. 2.6c 분리라도 dev-report 경고 필수.
- **P1-4 (QA) sourceOrderLineId DB 단언 부재**: captor payload 만, slip_line.source_order_line_id 실제 저장 IT 단언 없음(부분전환 추적 핵심).
- **P1-5 (FE) linkedSlipNo 필드명**: BE 응답 필드명(slipNo vs linkedSlipNo) 확인 — 불일치 시 모든 주문에 전환버튼.
- **P1-6 (DevOps) 3서비스 배포순서**: slip(V29) → auth(V41) → partner-order(V8). dev-report 명시 + V41 account_page_permissions materialize 확인.

### P2 (선별)
- markConvertedIfComplete 부분라인 IT / 전량전환후 재전환 409 IT / slip 5xx 경로 IT / confirm 회귀 / V8 CHECK 제약(0≤converted≤quantity) / productCode modelName 역조회 신뢰성 / source_order_line_id 인덱스.
- **Designer**: CONVERTED 뱃지색=CONFIRMED 동일(혼동) → 별색 / 모달 비가역 경고 문구 / 잔여0 opacity 대비.

### 정상
- 도메인 메서드(convert/remaining/isFullyConverted) + 단위4 / sourceOrderLineId nullable 회귀 0 / captor IT / V41 V39·V40 패턴.

→ 핵심: **전환 대상 DRAFT/ON_HOLD 엄격 한정(P1-2 원차단) + 트랜잭션 경계 재설계(P0-1) + idempotency(P1-1)**. cycle2 fix → 사이클 N=2.
