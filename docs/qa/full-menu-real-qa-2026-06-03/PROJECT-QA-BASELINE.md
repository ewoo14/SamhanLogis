# Samhan Public Desktop QA 프로젝트 기준선

검증일: 2026-06-03
대상 PR: Samhan Public Desktop 전체 메뉴 실 Docker QA 재검증 산출물

## 확인한 프로젝트 개요 문서

- `AGENTS.md`
- `.codex/AGENTS.md`
- `docs/handoff/CURRENT-WORK.md`
- `README.md`
- `ROADMAP.md`
- `settings.gradle`
- `.claude/memory/project_overview.md`
- `.claude/memory/project_arologis_independent.md`
- `.claude/memory/project_domain_strategy.md`
- `.claude/memory/feedback_uuid_no_user_visibility.md`

## 운영 단위와 시스템 경계

Samhan Public은 (주)삼한공조시스템의 자체 물류, 회계, 견적, 주문 통합 플랫폼이다. 운영 기준은 14 backend MSA, service-per-DB, Spring Cloud Gateway, Eureka, Electron Desktop, web client, mobile client 조합이다.

아로로지스는 Samhan Public 마이크로서비스에서 분리된 독립 운영 단위다. monorepo와 일부 인프라를 공유하지만, 운영 호칭과 인증, client, 배포 경계는 별도 기준으로 봐야 한다. 따라서 Samhan Public Desktop에서 아로로지스 메뉴를 검증할 때는 단순 화면 렌더링뿐 아니라 gateway CORS, 아로로지스 서비스 경계, 독립 운영 단위 노출 문구까지 같이 봐야 한다.

## QA 기준선

| 축 | 기준 | 이번 QA 반영 상태 |
|---|---|---|
| 운영 명칭 | 외부 호칭은 Samhan Public, repo명 SamhanLogis는 내부 작업 디렉터리명 | PR 제목과 본문은 Samhan Public 기준으로 작성 |
| 클라이언트 | Desktop은 내부 Electron 운영 화면. 전체 프로젝트에는 web/mobile/arologis client도 존재 | 이번 PR은 Desktop 전체 메뉴 QA로 한정. 전체 프로젝트 QA로 확대하려면 web/mobile/arologis client 별도 필요 |
| 서비스 경계 | Gateway → 각 service route → service-per-DB 정합성 확인 | gateway 404, CORS 중복, DB soft-delete probe 일부 확인 |
| 데이터 식별자 | UUID는 wire/internal 전용. 사용자 화면에는 슬립번호, 창고코드, 거래처명, 모델명 등 업무 식별자만 노출 | 스크린샷 기준 partner-aging UUID 노출 확인. 후속 자동 detector 추가 |
| 권한/RBAC | MASTER뿐 아니라 역할별 VIEW/EDIT/7-action 권한이 프로젝트 핵심 계약 | 이번 QA는 `dev_master` 중심. 역할별 권한 매트릭스는 후속 재실행 필요 |
| 업무 흐름 | 판매, 구매, 재고, 회계, 배차, 알림, 권한, 마이그레이션 운영 흐름이 서로 연결됨 | 판매/구매 CRUD와 회계 날짜 변경만 deep flow. 나머지는 메뉴 first-screen 중심 |
| 사용자 문구 | SQL, stack trace, 내부 enum, PR/MOCK 같은 개발 문구 노출 금지 | 사진 감사 SQL, 일계표 stack trace, 내부 타입명 노출 확인 |
| 실 Docker | mock이 아닌 gateway/service/DB 통신으로 검증 | local Docker + gateway 직접 경유로 수행. nginx reverse proxy 경유는 별도 필요 |

## 이번 QA의 실제 범위

이번 산출물은 Samhan Public Desktop의 전체 메뉴 실사용자 스모크 QA와 일부 핵심 CRUD 검증이다.

- local Docker backend와 Desktop renderer를 사용했다.
- `dev_master`로 로그인했다.
- main/AdminLayout 메뉴 85개를 순회하고 스크린샷 107장을 생성했다.
- 판매/구매 전표 생성, 수정, 삭제를 실제 API와 DB soft-delete probe로 확인했다.
- 회계 전표 날짜 변경 플로우에서 배분 source API 실패를 확인했다.
- 직접 API probe로 gateway route 404, photo-audit 500, edit-request 400, Arologis CORS 중복을 확인했다.

## 이번 QA의 한계

개발책임자 지적처럼, 최초 PR 산출물은 프로젝트 전체 개요를 선행 기준선으로 충분히 반영하지 못했다.

- `qa-results.json` 자동 이벤트만으로는 partner-aging UUID 노출을 잡지 못했고, 스크린샷 육안/TM 검수로 P0 판정했다.
- 전체 프로젝트 client 중 Desktop만 검증했다. `clients/web/*`, `clients/mobile-staff`, `clients/arologis-mobile`, `clients/arologis-desktop` 별도 QA는 포함하지 않았다.
- 역할별 권한, 부서 게이팅, 7-action permission matrix는 `dev_master` 단일 계정 QA로 대체할 수 없다.
- nginx reverse proxy와 실제 도메인/subdomain 경로는 이번 QA에서 제외했다.
- service-per-DB 전체 정합성은 일부 전표 soft-delete와 partner_code probe만 확인했다.
- legacy GAS/ECount 마이그레이션 원본 parity는 화면 first-screen 수준을 넘는 재검증이 필요하다.

## 재실행 권장 프로토콜

다음 재검증은 아래 순서로 진행해야 한다.

1. 프로젝트 기준선 확인: README, ROADMAP, CURRENT-WORK, AGENTS, 관련 memory를 먼저 읽고 QA 범위를 문서화한다.
2. 운영 단위 분리: Samhan Public Desktop, 아로로지스 Desktop/Mobile, web/mobile client를 같은 QA로 섞지 않고 경계를 명시한다.
3. Gateway matrix: Samhan Public 주요 service route와 아로로지스 route를 gateway 기준으로 직접 probe한다.
4. 사용자 화면 detector: UUID, SQL, stack trace, 내부 enum, secret-like marker, PR/MOCK 문구를 body text 기준으로 자동 탐지한다.
5. 메뉴 스모크: Desktop 메뉴 전체 first-screen 캡처를 수행하되, 오탐과 실제 HTTP/console 이벤트를 분리한다.
6. 핵심 업무 플로우: 판매, 구매, 재고, 회계, 배차, 알림, 권한, 마이그레이션 운영 대시보드 중 대표 CRUD/상태전이를 deep flow로 검증한다.
7. DB 정합성: service-per-DB 원칙에 맞춰 생성/수정/삭제 결과를 각 DB에서 업무 식별자 중심으로 대조한다.
8. 역할별 권한: MASTER 단일 계정 외 MANAGER, WAREHOUSE, SALES, ACCOUNTING, HR 등 주요 role의 VIEW/EDIT 차이를 별도 매트릭스로 검증한다.
9. TM 판정: Desktop 스모크, 서비스 경계, 데이터 정합성, 사용자 문구, 권한을 분리해서 P0/P1/P2를 재분류한다.

## 현재 판정 보정

이번 PR의 P0/P1 판정은 유지한다. 다만 이 산출물은 프로젝트 전체 QA가 아니라, 프로젝트 개요 기준선을 보강한 Samhan Public Desktop 전체 메뉴 실 Docker QA 산출물로 보는 것이 정확하다.

운영 배포 승인 전에는 위 재실행 프로토콜에 따라 Desktop 외 client와 role matrix까지 확장한 QA가 필요하다.
