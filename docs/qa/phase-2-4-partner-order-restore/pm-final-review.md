# ✅ PM 최종 종합 리뷰 — Phase 2.4 주문(Partner-Order) RESTORE

> HEAD `9dda437e` · CI 14/14 PASS · 머지 가능(MERGEABLE)
> ⚠️ Codex 토큰 소진(6/1 12:00 복구 전) → 구현 + dual 리뷰 모두 **Claude 에이전트 전면 대체** ([[feedback_early_pr_docker_qa_screenshots]])

## 결론: 머지 승인

RESTORE 메커니즘 **5번째 도메인**(slip 2.1 / estimate 2.2 / partner 2.3 / **partner-order 2.4**). 주문 헤더+라인 full-snapshot 버전이력 + point-in-time 복원 완성.

## 구현 요약
- **데이터**: Flyway V7 `partner_order_revisions`(JSONB, revision_type CREATE/EDIT/STATUS/RESTORE/DELETE, partial unique + 채번 race 재시도)
- **캡처**: from-estimate·confirm=CREATE / draft·본사 update=EDIT / delete=DELETE (삭제도 복원 대상)
- **복원**: 제외목록 가드(CONFIRMING·CANCELED만 409, DRAFT+CONFIRMED+추후 ON_HOLD 허용) / CONFIRMED 복원 시 `slipResyncRequired` 경고 + slip 연동필드 역적용 제외 / **삭제 주문 undelete 복원**(findByIdIncludingDeleted)
- **권한**: VIEW=sales.partner-order.history.view 재사용 / RESTORE=신규 sales.partner-order.revisions (auth V40, 배포순서 auth→partner-order)
- **FE**: PartnerOrderVersionHistoryPanel(배지 5종 + changeSummary + slip 경고 토스트 + DS Modal + invalidate F5 차단 + UUID 비공개)
- **업무용어**: 진행중=DRAFT / 완료=CONFIRMED(출고전표 전환) / 보류=신규 ON_HOLD(별도 슬라이스)

## 사이클 이력
| 사이클 | 결과 |
|---|---|
| Cycle 1 (5팀) | P1 6 + P2 7 (BE undelete 정합/FE createdAt·invalidate/Designer role/QA IT 단언) + DevOps APPROVE |
| Cycle 1 fix | 전 항목 fix (BE 6/FE 6/QA 시나리오) |
| Cycle 2 (4팀 재리뷰) | 전원 APPROVE, 비차단 권고 3 |
| Cycle 2c | 비차단 fix 2 (복원 라인경로 분기 + STATUS variant + 폴백 hex) |

## 검증
- **CI 14/14 PASS** (accounting+partner 8m13s 포함 전 group green, Playwright/Frontend/Detox/Guard 전부 pass)
- **BE IT 10 케이스**(실 Postgres + Flyway V7, skipped=0): 캡처 타임라인/DRAFT·CONFIRMED·삭제 복원/CONFIRMING·CANCELED 409/권한 deny·MASTER bypass/채번/비삭제 복원
- **Playwright 8** + 단위테스트
- **Docker 실 QA**: 실 partner-order-service(:8288) + 실 Postgres 적중 — `revision_no 1(EDIT)→2(EDIT)→3(RESTORE src=1)` 실증 + 스크린샷 13장. (한계: UI 캡처는 mock fixture 렌더, 실 DB 적중은 직접 API+psql 별도 증빙 — README 명시)

## 잔여 (비차단 후속)
- 보류(ON_HOLD) 상태 추가 + 주문 리스트 상태 필터 (별도 슬라이스)
- 주문→출고전표 전환 고도화: 품목별 부분전환 + 다중주문 병합 ([[project-order-slip-conversion]])
- MASTER bypass verify(never) IT 단언 / D-RST-05 shared 추출 PoC
- slip-service 로컬 V11 checksum mismatch (본 PR 무관, 기존 main 인프라 트랙)

## 메모리 가드 일관성 ✅
[[cycle-n2-mandatory]] (Codex 대체) / [[feedback_uuid_no_user_visibility]] / [[feedback_enforcement_real_http_test]] / [[feedback_qa_docker_real_test]] / [[feedback_continuous_docs_sync]] / [[feedback_korean_commits]]
