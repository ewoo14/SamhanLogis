# 전표 거래처 필수화 — 생명주기 전이 가드 (2026-07-19, PR #853)

## 문제
OUTBOUND/INBOUND 전표가 committed 단계(SENT 이후)로 전이할 때 거래처(`partner_id`) 검증이 없어 **거래처 없는 committed 전표**가 생성 가능(실측 SENT null 13 + REJECTED null 1). 이는 #823 배분 원천 거래처·세금계산서·분개 오귀속의 뿌리. 회계체인(#823 다음) 슬라이스.

## 결정 (전이 가드 — 컬럼 NOT NULL 아님)
- **불변식**: `status ∈ REQUIRED_PARTNER_STATUSES(SENT,ACCEPTED,PROCESSING,INSPECTING,COMPLETED,SHIPPING,DELIVERED,CONFIRMED,REJECTED) ⟹ partner_id != null`. CANCELED 제외(DRAFT/SAVED 취소 정당)·REJECTED 포함(SENT 이후 도달).
- **D-1 `Slip.send()` 가드**: SAVED→SENT partner null → INVALID_INPUT(requireStatus 먼저·비-SAVED=CONFLICT).
- **D-2 `Slip.restoreFromSnapshot()` 공통 가드**: committed 상태+snapshot.partnerId null 복원 거부(표준 SlipRevisionService + 협업 SlipDocumentCollaborationPort 양 경로가 이 도메인 메서드 경유).
- **D-7 forward 전이 가드**(R2): accept/process/complete/inspect/ship/deliver/confirm/reject 진입에 `requirePartnerForCommitted()` — legacy null 이 committed 로 progress 하는 것 코드 차단(불변식을 데이터+cutover 의존 아닌 코드 강제).
- **D-3 주문→전표 발행 partnerId 해소**: `SlipPublishService.resolveCommittedPartnerId`(단일·병합) — `PartnerInternalClient` 검증 결과 `FOUND+partnerId` 만 성공·`NOT_FOUND/SERVER_ERROR(5xx)/SKIPPED/FOUND-empty` 전부 fail-closed(strict-off·5xx fail-open 우회). estimate/mobile 발행은 DRAFT 종료라 미적용.
- **D-4 컬럼 `partner_id` nullable 유지**(DRAFT null 1926 정당·NOT NULL 비채택).
- **D-5 FE `SlipDetailPage` 전송 preflight**: `shouldBlockPartnerlessSend`(mobile handleTransition + desktop handleAdvanceStage 공통)·SlipFormPage DRAFT lenient 유지.
- **D-6/D-8 위반 보정 = 동일 릴리스 cutover + 코드 아티팩트**: slip-service internal 보정 엔드포인트(9상태 위반 재조회→partner_code→partner_id FOUND 해소·멱등·dry-run·audit·미해소 리포트). cutover 순서 = 배포+구버전 drain → 보정 → 검증 0.

## 워크플로우 (캐논)
- OPUS 기획 spec v1→v3 · **CODEX SOL 기획검수 3라운드 GO**(주문발행 중단·restore 복원·FE 오타깃·14건 cutover·필수 상태집합 등 실 설계갭 포착).
- **CODEX LUNA 구현**.
- **OPUS R1 5-agent + 라이브 QA**: [BLOCKING] 미갱신 기존 유닛 fixture 9건이 send() 가드에 arrange throw→CI RED(2 fixture partnerId fix). [HIGH] 14건 보정 dev 미실행(→dev 실행 14→0). 라이브 QA: 음성(무partner 전송 400 차단)·양성(partner 전송 SENT)·보정 14→0.
- **CODEX SOL R2 5-agent**(리뷰=SOL·fix=LUNA): [BLOCKING] forward 전이 미가드·보정 코드 아티팩트 부재·docs sync·send() 가드 HTTP IT 부재. [HIGH] restore 9-status·FE wiring·ci skipped=0 게이트·PR 본문·outbox self-invocation(pre-existing #854). → D-7 forward 가드·보정 엔드포인트·테스트 하드닝·docs.

## 검증
- genuine `--rerun-tasks`·slip-service + desktop. CI slip 전 잡 green(skipped=0)·핵심 IT skipped=0 hard gate.
- 라이브 QA(실서버·slip 재빌드): 음성 400 차단·양성 SENT·보정 14→0(§8 검증쿼리). 증거 `docs/qa/slip-partner-required/`.

## 교훈
- **가드는 신규만 차단·기존 위반은 보정 필요**: send/restore/forward 가드가 신규 committed-null 을 막으나, 배포 전 기존 14건은 코드가 정정 못함 → 동일 릴리스 cutover 보정(코드 아티팩트·3모델 지적).
- **도메인 순수 가드는 실 HTTP/DB IT 로 게이트**: transient Slip 단위 테스트는 서비스 tx·HTTP 매핑·DB 유지 회귀를 못 잡음(라이브 QA 1회는 CI 게이트 아님).
- **불변식은 상태 집합 완결성 테스트로 고정**: 수동 EnumSet 은 enum 추가 시 fail-open → REQUIRED == 전체−DRAFT/SAVED/CANCELED 단언.
- **fail-closed 전환이 pre-existing 버그 노출**: 주문발행 fail-closed 가 outbox self-invocation @Transactional 우회(#854) 를 material 화.

관련: PR #853 · 별건 #854(outbox)
