## 개요

같은 거래처(`partnerCode`)의 **DRAFT/ON_HOLD 주문 여러 개**를 선택해 **단일 출고전표**로 병합 발행한다 (Phase 2.6b ② = D2). 2.6a 단일주문 부분전환·2.6c 재고 reserve·D1 confirm 자동발행 폐지의 후속.

- 출고정보(배송지/납기 등) 충돌 시 FE 가 선택 또는 `/` 병기한 최종 헤더 전송, 거래처는 단일.
- 라인별 부분수량 전환(단일주문과 동일), 전량 전환된 주문은 각각 `CONVERTED`.
- **원자적(all-or-nothing)**: 한 라인 가용부족 또는 slip 발행 실패 → 전체 409 + 예약 보상.

## 핵심 결정 (DECISIONS D-MRG-01~06)

| # | 결정 |
|---|---|
| D-MRG-01 | N:1 추적 = slip `slip_source_orders`(V30) 조인 테이블 + 기존 `SlipLine.sourceOrderLineId`(V29). 단일주문 경로 미기록(회귀 0) |
| D-MRG-02 | 신규 병합 엔드포인트(`/convert-to-slip-merge`, `/from-orders-merge`), 검증된 단일주문 경로 무변경 |
| D-MRG-03 | 헤더 '/' 병기 = FE 확정 전송, BE 는 저장 + partnerCode 동일성만 검증 |
| D-MRG-04 | 원자적 all-or-nothing, reserve→발행→실패 시 release 보상, 단일 트랜잭션 |
| D-MRG-05 | 권한 = 기존 `sales.partner-order.convert` CREATE 재사용 |
| D-MRG-06 | 주문 식별자 = PartnerOrderIdResolver(주문번호/UUID 양용), 응답 orderNo(UUID 비공개), 결정적 멱등키 PO-MRG |

## 변경 (서비스별)

**slip-service** (먼저 배포)
- Flyway **V30** `slip_source_orders` (BaseEntity 7 audit + soft delete, FK slips, 인덱스 2개 — 무중단 CREATE)
- `SlipSourceOrder` 엔티티/리포지토리, `PublishFromOrdersMergeRequest`/`SourceOrderRef` DTO
- `SlipPublishService.publishFromOrdersMerge`(공통부 재사용 + 대표주문 sourceId + N행 기록 + SENT 불변) + `POST /from-orders-merge`
- `findBySource` UNION 확장(비대표 주문 역조회, 배치 findAllById)

**partner-order-service** (이후 배포)
- `MergeConvertToSlipRequest`/`MergeConvertResultResponse`, `PartnerOrderMergeConvertService`(reserve→발행→보상 N주문 일반화)
- `POST /convert-to-slip-merge`, `SlipServiceClient.publishFromOrdersMerge`

**desktop FE**
- 주문목록 체크박스 다중선택 + 병합 버튼(같은 거래처만 활성), `MergeConvertDialog`(충돌헤더 라디오/직접입력, 비가역 danger 경고, 4-AND 제출), `mergeConvertToSlip` API

## 테스트 / 리뷰

- **slip** `SlipPublishMergeIT` 6종 (실 Postgres, skipped=0) — slip_source_orders N행 / sourceId 대표주문 / source_order_line_id / partner_code / 멱등 replay / findBySource 비대표.
- **partner-order** 단위 8 + IT 12 (실 Postgres) — partnerCode 불일치 409 / 가용부족→전체409+보상 / slip실패→보상 / 멱등(publish 1회+converted 1회) / 부분수량+잔여추적 / ON_HOLD / reserve captor.
- **desktop** Playwright 9 (skipped=0) — 다중선택→병합→발행, 혼합거래처 비활성, 재고부족 409.
- **5-team 사이클 N=2 전원 APPROVE** (BE/FE/Designer/QA/DevOps). 산출물 `docs/qa/slice-d2-order-merge/`.
  - 사이클 1: V30 컬럼 정합·findBySource N+1·@NotBlank / danger 토큰·4-AND·라디오패턴·카피 / IT 단언 9종 추가 / 배포 런북. 사이클 2 수렴.
- PM 통합 게이트: 양 서비스 병합 IT `--rerun-tasks` BUILD SUCCESSFUL.

## 배포 순서

**slip-service(V30+수신) → partner-order-service(오케스트레이션) → desktop FE**. 런북 `docs/runbooks/d2-order-merge-deploy.md` (게이트웨이 404-금지 스모크, 무중단, 롤백). 기존 단일전환/confirm 경로 무영향.

## Docker 실 QA

CI green 후 실 gateway+JWT+렌더러 기반 실 QA 진행 예정 — 실화면 캡처 + psql 실적중(slip_source_orders N행 / converted_quantity / source_order_line_id). 합성·mock 화면 금지 ([[no-fake-data-ever]]). 결과는 본 PR 코멘트로 첨부.

## 연관

- spec `docs/superpowers/specs/2026-05-31-order-merge-to-slip-design.md`
- plan `docs/superpowers/plans/2026-05-31-order-merge-to-slip.md`
- 핸드오프 다음 후보 D2 (CURRENT-WORK.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
