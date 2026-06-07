# P2 후속 일괄 정리 — 보상 purge + Micrometer 메트릭 + sp-09-5 502 트리거 + M1 dev-report (구현 계획)

> 2026-06-07 개발책임자 선택("P2 후속 일괄 정리"). 시리얼 보상 루프 시리즈(#359/#360/#369) 누적 P2 백로그 단일 PR 일괄.

## 1. 범위 (4건)

| # | 항목 | 설계 요지 |
|---|---|---|
| D1 | **retention soft-delete 물리 purge** (slip) | 2단계 purge 모델 (**D-SER-28**): soft-delete(90일, D-SER-25 복구창) 후 `deleted_at` 기준 **grace 30일** 추가 경과분만 native hard-delete. `CompensationPurgeService/Scheduler`(@ConditionalOnProperty 기본 비활성, cron 04:00 Asia/Seoul, batch 500) + V33 partial index (`deleted_at WHERE is_deleted`) + env 템플릿. native DELETE 는 `is_deleted=TRUE AND deleted_at<cutoff` 3중 가드 — 미해소/활성 행 불가침 IT 단언 의무 |
| D2 | **Micrometer 보상 메트릭** (slip) | `CompensationMetrics` wrapper (NotificationGatewayMetrics 선례, 사전 등록): `compensation_failure_recorded_total{operation,phase}` / `compensation_alert_send_total{result}` / `compensation_retry_total{outcome}` / `compensation_retention_purged_total{mode}`. 태그 = enum/고정 문자열만 (UUID/slipNo 금지). AlertNotifier 수동 생성자 파급 → 테스트 호출부 갱신 |
| D3 | **sp-09-5 vendor 502 in-process mock 트리거** (desktop) | NTS `mockNts502=1` + Aligo `mockAligo502=1` query param 트리거 (mockLocationParams 선례) + TaxInvoiceDetail topError testid. spec T1 재작성: vacuous skip(`if(count>0)`) 제거 → 필수 visible 단언, page.route no-op 잔재 삭제, 전용 testid 단언 (bodyText OR 우연 일치 false-green 차단), step 별 page.reload |
| D4 | **M1 dev-report 채무** (#382) | `slice-preauth-m1-require-department.md` — PM 직접 작성 (opt-in 교훈 포함) |

## 2. 디스패치 순서

D1 → D2 (D2 가 D1 의 PurgeService 에 카운터 부착 — 순서 의존) → D3 (독립) → D4 (PM).

## 3. 리스크/가드

1. **영구 삭제**: 3중 가드(resolved-only soft-delete → is_deleted=TRUE → grace 경과) + 기본 비활성. **활성화(enabled=true) 시점에 개발책임자 grace 기간 확인** (D-SER-28).
2. `@Modifying` native — 전용 @Transactional 격리 (1차 캐시 비공유).
3. 메트릭 cardinality — enum 태그만 (리뷰 체크포인트).
4. spec false-green 재발 — 전용 testid + 메시지 부분 일치 한정, 실행 green 의무.
5. Phase11 활성화 env 는 운영 작업 — env 템플릿 체크리스트 갱신까지만.
