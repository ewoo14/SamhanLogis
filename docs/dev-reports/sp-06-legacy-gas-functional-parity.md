# SP-06 legacy GAS/Notion DB 이관 정합성

> 작성일: 2026-05-16
> 브랜치: `codex/sp-06-legacy-gas-functional-parity`
> 목적: Notion 원본 데이터를 runtime dependency로 남기지 않고 Samhan Public service-per-DB로 이관한 뒤, 이후 모든 조회/수정/삭제를 우리 DB CRUD로 수행하도록 계약과 운영 스크립트를 보정한다.

## 1. 결론

| 영역 | 처리 |
| --- | --- |
| DB 소유권 | CHAT/BLOCK/REGION/DC 원본 데이터의 source-of-truth를 notification/partner/arologis/dc-config DB로 명시했다. |
| Gateway | full-path CRUD endpoint가 generic `StripPrefix=2` route에 삼켜지지 않도록 no-strip route를 선행 추가했다. |
| 운영 스크립트 | `import-notion-csv.ps1`는 DB 이관 스크립트로 정리하고, gateway/service 모두 실제 탐지 포트를 재사용한다. |
| UI 라벨 | `/admin/regions`는 `배차지역 관리`로 정리했다. |
| 활성 app | `clients/web/order-app/index.html`의 Notion HTTP endpoint를 제거하고 DB 로그 RPC로 위임했다. |
| 문서 | 운영 SQL 테이블명을 실제 Flyway 기준으로 정정했다. |

## 2. 변경 파일

| 파일 | 내용 |
| --- | --- |
| `clients/desktop/playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts` | DB CRUD, gateway, 스크립트, active app Notion endpoint 제거 계약 |
| `services/api-gateway/src/main/resources/application.yml` | partner-auth public/approval, chat-room, block, dc-config no-strip route |
| `tools/operational-validation/import-notion-csv.ps1` | Notion 4 CSV “DB 이관” 용어와 `SAMHAN_*_PORT` override |
| `tools/operational-validation/run-smoke-tests.ps1` | health 탐지 port map 재사용 및 gateway URL 보정 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/config/*.java` | `partner-approvals` gateway route가 downstream에서 인증되도록 `X-User-*` header auth 추가 |
| `clients/desktop/src/renderer/components/AppLayout.tsx` | `/admin/regions` 메뉴 라벨 `배차지역 관리` |
| `clients/desktop/src/renderer/routes/admin/RegionsPage.tsx` | 페이지 타이틀/헤더 `배차지역 관리` |
| `clients/web/order-app/index.html` | Notion page create endpoint 제거, DB 로그 RPC 위임 |
| `clients/web/order-app/src/samhanApi.ts` | legacy 4-인자 `logFrontEvent`와 migrated 2-인자 로그 호출 모두 정규화 |
| `docs/operational-validation/*.md` | DB 이관 표현과 실제 테이블명 정정 |

## 3. DB 이관 소유권

| 원본 | DB / 테이블 | CRUD 화면/API |
| --- | --- | --- |
| 단톡방리스트 | `notification_db.partner_chat_room_mappings` | `/admin/chat-rooms`, `/api/v1/notification/admin/chat-rooms` |
| 발송금지리스트 | `partner_db.blocked_partners` | `/admin/blocked-partners`, `/api/v1/partners/admin/blocks` |
| 배차지역 분류표 | `arologis_db.region_dispatch_classifications` | `/admin/regions`, `/admin/arologis/regions` |
| 거래처 DC정보 | `dc_config_db.dc_configs` | `/sales/partner-dc-config`, `/api/v1/partner-dc-configs`, `/api/v1/dc-config/admin/import` |

2026-05-16 실 CSV 기준 DC정보는 거래처코드 row 213건, unique partnerCode 210건이다. `dc_configs`는 partner 1:1 활성 unique index를 가지므로 import 응답은 213 row를 처리하고, DB 최종 active config count는 210으로 검증한다.

## 4. 검증 결과

| 검증 | 결과 |
| --- | --- |
| `npx playwright test playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts --reporter=line` | PASS — 10 tests, skipped 0. smoke port / 라벨 / Notion endpoint RED 확인 후 GREEN |
| `npx playwright test playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` | PASS — 21 tests, skipped 0 |
| `npm run typecheck` (`clients/desktop`) | PASS |
| `npm run lint` (`clients/desktop`) | PASS — 기존 warning 2건, error 0 |
| `npm run build` (`clients/desktop`) | PASS |
| `gradlew partner/notification/arologis/dc-config targeted tests` | PASS — `PartnerBlock*`, `ChatRoom*`, `Region*`, `DcConfig*` |
| `gradlew :services:partner-auth-service:test` | PASS — downstream header auth compile/test 회귀 |
| `gradlew :services:api-gateway:test` | PASS |
| `infrastructure/scripts/start-local-full.ps1 -SkipDocker` | PASS — service health UP 15/15 |
| `tools/operational-validation/import-notion-csv.ps1` | PASS — REGION 20 / DC 213 processed / CHAT 112 / BLOCK 6, rejected 0 |
| `tools/operational-validation/run-smoke-tests.ps1` | PASS — service health UP 15/15, endpoint smoke OK 7/7 |
| DB row count 직접 검증 | PASS — region 20 / dc active 210 (CSV unique partnerCode) / chat 112 / block 6 |
| `rg "https://api\\.notion\\.com\|Notion-Version" clients/web clients/desktop/src clients/mobile-staff/src` | PASS — active order-app endpoint 제거 확인. estimate-app shim의 blocklist/README 설명만 잔존 |
| `git diff --check` | PASS — CRLF 안내 warning만 출력 |
| `node scripts/generate-sp-06-legacy-gas-functional-parity-screenshots.mjs` | PASS — QA PNG 9장 생성, 모두 non-zero |

## 5. 5-agent 리뷰 반영

| 역할 | 확인/반영 |
| --- | --- |
| Backend | `partner-approvals` no-strip route가 gateway에서 끝나지 않고 partner-auth-service header auth로 인증되도록 보완했다. UUID는 화면 미표시 계약을 유지하고, API opaque key 전환은 SP-08 전메뉴 회귀에서 별도 감사 대상으로 둔다. |
| Frontend | order-app의 Notion 제거 대체 호출이 로그 payload를 잃지 않도록 shim에서 legacy 4-인자와 migrated 2-인자를 모두 정규화했다. |
| Designer | PR 캡처의 검증 수치와 메뉴 문구를 정정했다. `발송금지` 캡처 라벨은 `발송금지 관리`로 맞췄다. |
| DevOps | DB 이관 스크립트에도 `SAMHAN_API_GATEWAY_PORT` 및 default+100 health fallback을 추가했다. smoke PASS는 runtime endpoint smoke, gateway no-strip은 정적 계약으로 분리 표기한다. |
| QA | DC active count SQL에 `is_deleted = false` 조건을 추가하고, PR용 검증 매트릭스를 실제 PASS 수치와 일치시켰다. |

## 6. 후속 후보

| 후보 | 이유 |
| --- | --- |
| SP-07 Google Sheets 견적/주문 E2E | 종합견적서/주문서 원본 tab 계약을 실제 생성→전표 흐름으로 검증 |
| SP-08 권한/UUID 전메뉴 회귀 | route/role/비노출 계약이 계속 늘어 dedicated 회귀 필요 |
| 품목 마스터 7탭 UI | legacy GAS와 실제 운영 메뉴에서 추가 관리 표면이 필요한 후보 |
