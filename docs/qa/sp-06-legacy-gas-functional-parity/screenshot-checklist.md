# SP-06 QA 캡처 체크리스트

> 위치: `docs/qa/sp-06-legacy-gas-functional-parity/screenshots/`

| # | 파일 | 검증 포인트 |
| --- | --- | --- |
| 01 | `01-db-migration-ownership-map.png` | Notion 원본 4표가 각 service DB 테이블로 이관되는 소유권 |
| 02 | `02-chat-room-db-crud.png` | 단톡방리스트 notification DB CRUD와 CSV 업로드 |
| 03 | `03-blocked-partner-db-crud.png` | 발송금지 partner DB CRUD와 soft delete |
| 04 | `04-dispatch-region-management.png` | `/admin/regions` 배차지역 관리 라벨과 CRUD |
| 05 | `05-dc-config-db-seed-and-crud.png` | DC정보 DB seed/import와 거래처 DC 설정 CRUD |
| 06 | `06-gateway-no-strip-routes.png` | full-path controller no-strip gateway route |
| 07 | `07-operational-scripts-port-aware.png` | DB 이관/Smoke 스크립트 포트 override와 실제 port map 재사용 |
| 08 | `08-active-app-notion-endpoint-removed.png` | active order-app Notion HTTP endpoint 제거와 DB 로그 RPC 위임 |
| 09 | `09-verification-matrix.png` | RED/GREEN, static contract, active endpoint scan 검증 matrix |

## PR 첨부 규칙

- PR 본문에는 최종 commit SHA 기반 `raw.githubusercontent.com` URL로 9장을 모두 인라인 첨부한다.
- PNG가 0 byte이거나 링크가 상대 경로이면 PR 본문에 첨부하지 않는다.
- 캡처에는 UUID 또는 raw internal id가 보이면 안 된다.
