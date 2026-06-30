# 협업 코-에디팅 S3-1 — 주문(partner-order) 메모 coedit

## 목적
S3-0 공용화 토대(shared `CollabCoeditService` + `makeCoeditApi`/`createCoeditProvider` + `CollaborativeTextField`) 위에 slip 패턴을 1:1 이식해, 주문(partner-order) 상세 화면에 단일 '협업 메모' 실시간 동시편집 필드를 추가한다. 1차=메모 단일 필드(저위험·additive). 폼 전체 셀 동시편집은 S3-1b 후속.

## 구현 범위
- BE: `PartnerOrderCollabController`에 coedit 3엔드포인트(`GET /coedit`, `POST /coedit/update`, `POST /coedit/awareness`) 추가. `resolveOrderId(orderId)`로 UUID 정규화(기존 `stream` broker 채널 키와 일치). `@RequirePermission` read=`sales.partner-order.list`(VIEW)/write=`sales.partner-order.edit`(UPDATE). `CollabCoeditService` 빈은 `CollabCoreAutoConfiguration`(`@ConditionalOnBean(RealtimeBroker)`)으로 자동 주입(신규 @Bean 불요).
- BE: DTO 3종 로컬 미러(`PartnerOrderCoeditUpdateRequest`/`PartnerOrderCoeditAwarenessRequest`/`PartnerOrderCoeditUpdatesResponse`). Flyway/엔티티/리포지토리 변경 0(in-memory relay).
- FE: `PartnerOrderCollaborationPanel`에 `CollaborativeTextField`('협업 메모', `basePath=/partner-orders/{encodeURIComponent(orderId)}`) 추가. 편집권한 없으면 readOnly.

## 듀얼리뷰 fix (Opus ↔ Codex 0수렴)
- Opus 라운드(6): `mock.ts` 주문 coedit 3핸들러 추가(T04 pageerror 회귀 차단) · `SalesPartnerOrderDetailPage` `collabCurrentValues` 게이트 `query.data`→`query.data.orderNumber`(id='new' 오마운트 차단) · `CollaborativeTextField` `.catch`(graceful) · 협업메모 보조설명 · IT VIEW403+null400 · 컨트롤러 UPDATE-vs-slip-CREATE 주석.
- Codex 라운드(1 HIGH): `CollaborativeTextField` `providerStatus`(loading/ready/failed) + `effectiveReadOnly`로 미준비/실패 시 입력 잠금 + `role=alert`(저장 안 되는 로컬 메모로 보여 데이터 유실되는 점 차단), `provider-failure.test.tsx` 2건.
- Round C(Opus FE+Design) · Round D(Codex): 양쪽 새 fix 없이 0 반환 = 0수렴. `aria-describedby` ready-dangling은 비블로킹(ARIA spec 무시·표준 패턴)으로 후속 a11y sweep 이연.

## 계약 보존 / 정합
- 게이트웨이 풀패스(`/api/v1/partner-orders/{orderId}/collab/...`). 주문번호 슬래시형 path는 `encodeURIComponent`로 %2F 인코딩(게이트웨이 차단 회피), BE `resolveOrderId`가 UUID 변환.
- coedit '협업 메모'(in-memory 비영속 실시간)는 편집폼 persisted '요청사항'(memo, commitEdit)과 별개 — 라벨/보조설명으로 구분.
- `ApiResponse` `$.data.updates` 파싱. 화면 UUID 비노출(작성자 실명·주문번호만).

## 검증
- FE: `npm run typecheck`(node+web) PASS · vitest collab 19/19(provider-failure 2 신규 포함).
- BE: `:services:partner-order-service:compileTestJava` BUILD SUCCESSFUL · `PartnerOrderCollabIT` 15/15(Testcontainers PostgreSQL 16.14, VIEW403·null400 신규 포함).
- 라이브: sp-d4 Playwright T04 20/20(실 렌더, pageerror 0) · 게이트웨이:8080 실 HTTP coedit relay round-trip(POST update×2 누적→GET 2건→awareness 200→null/빈 body 400, dev_master JWT).
- CI: Desktop Playwright(mock 회귀 hard gate) 포함 전 잡 green.

## 후속
- S3-1b: 주문 폼 전체 셀 동시편집(`createDocCoeditProvider` + 셀 바인딩).
- S3-2~: 견적(slip-service 동거)/회계/결재/배차 문서별 롤아웃.
- a11y: `aria-describedby` ready-dangling 조건부 정리(후속 a11y sweep).
