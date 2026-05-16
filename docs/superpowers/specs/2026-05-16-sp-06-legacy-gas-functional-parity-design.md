# SP-06 legacy GAS/Notion DB 이관 정합성 설계

> 작성일: 2026-05-16
> 브랜치: `codex/sp-06-legacy-gas-functional-parity`
> 전제: SP-05 merge 후 Samhan Public CRUD 표면은 1차 보정 완료. 본 슬라이스는 legacy GAS/Notion 원본 데이터가 runtime Notion 통신 없이 Samhan Public DB CRUD로 귀속되는지 고정한다.

## 문제

Notion 단톡방리스트, 발송금지리스트, 배차지역 분류표, 거래처 DC정보는 운영 원본으로 존재하지만, 제품 방향은 Notion을 계속 runtime source로 쓰는 것이 아니다. 원본 표는 cutover 시 우리 서비스별 DB로 이관하고, 이후 화면/API는 Samhan Public DB CRUD만 사용해야 한다.

또한 일부 controller는 `/api/v1/...` 풀패스를 직접 보유하는데 gateway generic route의 `StripPrefix=2` 뒤에 놓이면 CRUD/API가 잘못 전달될 수 있다. 로컬 smoke 스크립트도 health 단계에서 실제 포트를 탐지하고도 endpoint 호출에는 기본 포트를 쓰는 구간이 있었다.

## 목표

| 항목 | 목표 |
| --- | --- |
| DB 소유권 | CHAT/BLOCK/REGION/DC 원본 데이터를 각 service DB 테이블 source-of-truth로 명시한다. |
| CRUD 경로 | desktop CRUD 화면과 API가 Notion URL이 아니라 Samhan Public API만 호출하도록 계약화한다. |
| Gateway | full-path controller는 no-strip route를 generic route보다 먼저 선언한다. |
| 운영 스크립트 | CSV 이관/Smoke 스크립트가 포트 override와 실제 테이블명을 따른다. |
| 활성 앱 | order-app에 남은 Notion HTTP endpoint 문자열을 DB 로그 RPC 위임으로 교체한다. |
| UI 명칭 | `/admin/regions`는 사용자-facing `배차지역 관리`로 정리한다. |

## 비목표

- `/tools/legacy-gas` 원본 파일 자체를 삭제하거나 변형하지 않는다. 해당 폴더는 이식 근거로 보존한다.
- Notion connector에서 매번 데이터를 다시 읽어 runtime 동기화하지 않는다.
- Google Sheets 견적/주문 실제 E2E는 SP-07로 분리한다.
- 품목 마스터 7탭 UI는 본 슬라이스에서 새로 구현하지 않는다.

## 수용 기준

1. `clients/desktop/playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts`가 RED 후 GREEN으로 통과한다.
2. CHAT/BLOCK/REGION/DC CRUD controller, service, desktop page/API가 Notion URL 없이 DB repository를 기준으로 동작한다.
3. gateway no-strip route가 `notification-chat-rooms-v1`, `partner-blocks-v1`, `dc-config-admin-v1`, `partner-auth-public-v1`, `partner-auth-approvals-v1`를 포함한다.
4. `import-notion-csv.ps1`와 `run-smoke-tests.ps1`가 `SAMHAN_*_PORT` 또는 실제 health port를 반영한다.
5. `clients/web/order-app/index.html`에 `https://api.notion.com`/`Notion-Version` endpoint 문자열이 남지 않는다.
6. QA 캡처는 DB 이관 흐름과 CRUD/gateway/smoke 검증을 여러 장으로 분리한다.
