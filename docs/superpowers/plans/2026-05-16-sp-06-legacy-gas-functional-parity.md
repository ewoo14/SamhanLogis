# SP-06 legacy GAS/Notion DB 이관 정합성 실행 계획

> 작성일: 2026-05-16
> 브랜치: `codex/sp-06-legacy-gas-functional-parity`

## 순서

1. 기준 확인
   - SP-05 merge 후 main commit과 현재 브랜치를 확인한다.
   - CHAT/BLOCK/REGION/DC controller, service, desktop API/page, gateway route, 운영 스크립트를 읽는다.

2. TDD 계약 추가
   - Notion 원본 데이터가 각 service DB CRUD로 귀속되는 정적 Playwright 계약을 먼저 작성한다.
   - gateway no-strip route, 포트 override, 활성 order-app Notion endpoint 제거 조건을 포함한다.
   - 기존 코드에서 실패하는 RED를 확인한 뒤 최소 구현으로 GREEN을 만든다.

3. 구현
   - api-gateway full-path no-strip route를 보강한다.
   - `import-notion-csv.ps1`를 DB 이관 용어와 `SAMHAN_*_PORT` override 기준으로 정리한다.
   - `run-smoke-tests.ps1`가 health 탐지 포트를 endpoint smoke에 재사용하도록 수정한다.
   - `/admin/regions` 라벨을 `배차지역 관리`로 정리한다.
   - active `order-app`의 잔여 Notion HTTP endpoint 문자열을 DB 로그 RPC 위임으로 제거한다.

4. 문서
   - README, ROADMAP, DECISIONS, CURRENT-WORK를 SP-06 기준으로 동기화한다.
   - 운영 검증 문서의 실제 SQL 테이블명을 Flyway 기준으로 정정한다.
   - dev-report와 QA 체크리스트를 추가한다.

5. QA / 검증
   - SP-06 캡처 여러 장을 생성하고 non-zero PNG를 확인한다.
   - Playwright static contract, desktop typecheck/lint/build, 가능한 backend targeted tests를 실행한다.
   - Docker 가용 시 서비스 DB 이관/Smoke 스크립트를 skip 없이 실행한다.

6. PR/CI/머지
   - 한국어 commit으로 push한다.
   - PR 본문에 commit-SHA raw URL 캡처를 인라인 첨부한다.
   - CI green 확인 후 PM 재점검, merge, 불필요 브랜치 정리를 진행한다.

## 5-agent 검토 범위

| 역할 | 검토 포인트 |
| --- | --- |
| Backend | DB table ownership, gateway no-strip route, partner-auth route precedence |
| Frontend | CRUD 화면이 Notion URL 없이 Samhan Public API만 쓰는지, `배차지역 관리` 라벨 정합성 |
| Designer | DB 이관/CRUD 관리자 화면이 조회 전용처럼 보이지 않는지, PR 캡처 가독성 |
| DevOps | 운영 스크립트 포트 override, smoke direct/gateway endpoint 재사용, Docker 검증 절차 |
| QA | RED/GREEN 증거, no-skip static contract, 캡처 수량/선명도, UUID/Notion endpoint 노출 스캔 |
