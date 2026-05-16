# SP-05 Samhan Public CRUD 표면 재점검 실행 계획

> 작성일: 2026-05-16
> 브랜치: `codex/sp-05-samhan-public-crud-audit`

## 순서

1. 기준 확인
   - main 최신 상태와 SP-04 머지 결과를 확인한다.
   - 판매/구매/거래처/검수/전표 상세 route와 권한을 읽는다.

2. TDD 계약 추가
   - 판매관리 상세 버튼, 구매관리 상세 버튼, inventory 문서 정정 상태를 정적 Playwright 계약으로 먼저 작성한다.
   - 실패를 확인한 뒤 최소 구현으로 통과시킨다.

3. 구현
   - `SalesQueryPage`에 public `slipNo` 기반 상세 버튼을 추가한다.
   - `PurchaseQueryPage`에 public `slipNo` 기반 상세 버튼을 추가한다.
   - 기존 컬럼 QA 스펙을 `상세` 열 포함으로 갱신한다.

4. 문서
   - `README.md`, `ROADMAP.md`, `migration/decisions/DECISIONS.md`, `docs/handoff/CURRENT-WORK.md`를 SP-05 기준으로 동기화한다.
   - `docs/dev-reports/sp-05-samhan-public-crud-audit.md`와 QA 체크리스트를 작성한다.

5. QA / 검증
   - SP-05 캡처 여러 장을 생성하고 non-zero PNG를 확인한다.
   - Playwright static contract, typecheck, lint, build를 실행한다.
   - 가능하면 기존 판매/구매 UI 스펙도 dev server에서 실행한다.

6. PR/CI/머지
   - 한국어 commit으로 push한다.
   - PR 본문에 캡처를 commit-SHA raw URL로 인라인 첨부한다.
   - CI green 확인 후 PM 재점검, merge, 불필요 브랜치 정리를 진행한다.

## 5-team 검토 범위

| 역할 | 검토 포인트 |
| --- | --- |
| Backend | route/API param에 내부 UUID를 쓰되 화면 노출 없이 유지되는지 확인 |
| Frontend | 판매/구매 목록의 선택과 상세 진입이 충돌하지 않는지 확인 |
| Designer | `상세` 액션이 기존 밀도 높은 ERP 테이블 안에서 과하지 않게 보이는지 확인 |
| DevOps | 새 검증이 dev server 없이도 CI에서 실행 가능한지 확인 |
| QA | RED/GREEN 증거, 캡처, 기존 sales/purchase 회귀 영향 확인 |
