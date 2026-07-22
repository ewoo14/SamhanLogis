# #845 DS-3b 문서 양식 편집기 MVP

작성일: 2026-07-22  
대상: Issue #868 / PR #891  
범위: desktop 3-pane 문서 양식 편집기, schema v2, groupware JSONB 왕복

## 구현 요약

- `CURRENT_SCHEMA_VERSION=2`와 v1/v2 parser dispatch를 추가했다.
- v1 승인 revision은 v1 parser로 읽고, v1→v2 upcast는 렌더 전 메모리에서만 수행한다. 레거시 element shape와 기존 flow renderer를 유지해 golden을 변경하지 않았다.
- v2 `FIELD`/`TEXT`의 geometry(`%`), style whitelist, binding allowlist, text를 FE parser·BE `DocumentPayload` record·PostgreSQL JSONB에서 보존한다.
- desktop에 목록, 팔레트·HEADER/BODY/FOOTER 캔버스·속성 패널 3-pane, DRAFT/ACTIVE lifecycle, 읽기 전용 권한, 실제 `DocumentRenderer` preview를 연결했다.
- mock CRUD와 seed 기반 Playwright AC를 추가했다. Flyway V10~V13은 수정하지 않았고 신규 migration도 없다.

## RED → GREEN

| 항목 | RED 재현 | GREEN 확인 |
|---|---|---|
| R1 | v2 상수 기대 테스트가 `expected 1 to be 2`로 실패했고, 기존 upcast가 schema 1을 반환했다. | AC-845 DS-3a pin Playwright 5/5 통과. v1 revision이 현재 v2 active로 강하하지 않았다. |
| R2 | 최초 BE 테스트는 `JsonNode` 체인에서 `set` 컴파일 오류가 나 실제 record 왕복 검증에 진입하지 못했다. 이 RED는 테스트 작성 오류였고, 수정 후 실 DB behavioral RED를 별도로 만들지 못했다. | `DocumentTemplateIT` 19개 통과. v2 HTTP create→activate→active GET에서 geometry/style/binding/text를 검증했다. |
| R3 | v2 fixture parser 테스트가 `expected false to be true`로 실패했다. | v2 parser 2개 테스트 통과. |
| R4 | 기존 unsupported schema 테스트가 schema 2를 거부하도록 남아 있어 v2 허용 변경과 충돌했다. | validator 단위 테스트와 `DocumentTemplateIT` v1 CRUD/activate 왕복 통과. |
| R5 | upcast/renderer 테스트가 schema 1 반환을 기대해 실패했다. | upcast DOM 테스트와 golden 19개 통과, golden 파일 무변경. |
| R6 | 최초 Playwright 시도는 mock 환경변수 없이 서버가 login 화면을 내어 functional RED가 아닌 실행환경 timeout이었다. | seed/mock AC에서 VIEW-only 목록이 저장·활성화 버튼을 노출하지 않는 시나리오 통과. |
| R7 | 같은 초기 Playwright timeout 때문에 ACTIVE 문구 functional RED 원문은 확보하지 못했다. | seed ACTIVE 양식에서 한국어 차단 안내와 저장 disabled 통과. |
| R8 | 구현 전 `useTemplateDraft` 모듈이 없어 `Failed to load module './useTemplateDraft'`로 실패했다. | Vitest key 테스트와 Playwright TEXT 2회 추가 시 unique key 통과. |
| R9 | 구현 전 real renderer가 v2 element를 legacy body로 넘겨 `Cannot read properties of undefined (reading 'type')`로 실패했다. | real `DocumentRenderer` Vitest와 Playwright live preview 통과. |

R6/R7은 서버 기동 설정이 잘못된 첫 시도에서 functional RED를 만들지 못했다. 이를 기능 RED로 포장하지 않는다.

## 검증

- `clients/desktop`: `npm run typecheck` 통과.
- `clients/desktop`: `npm run lint` exit 0. 기존 warning 77건, 신규 error 0건.
- `clients/desktop`: `npm test` 통과, 138 files / 1,078 tests.
- Playwright AC-868: 4/4 통과.
- Playwright AC-845 DS-3a pin 회귀: 5/5 통과.
- `:services:groupware-service:test --tests ...DocumentTemplateIT --rerun-tasks --no-build-cache`: 19개 통과.
- `:services:groupware-service:test --tests ...DocumentPayloadValidatorTest --rerun-tasks --no-build-cache`: 통과.
- `clients/web/design-system`: `npm run build` 통과. design-system source는 수정하지 않았다.

실서버 `868-ds3b-real-qa`는 하네스만 추가했으며, 이 워크트리에서는 공유 실서버 write를 실행하지 않았다.
