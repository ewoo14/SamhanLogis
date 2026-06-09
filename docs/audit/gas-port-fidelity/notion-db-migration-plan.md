# 레거시 Notion DB → 우리 DB 시드/이식 플랜 (2026-06-10)

> 개발책임자 지시(2026-06-09): "레거시가 조회하던 노션 페이지 데이터도 모두 시드 데이터로 DB 이식 + 통신 호환." [[project_sheets_to_db_full_migration]]
>
> claude.ai Notion 커넥터로 레거시 워크스페이스 **읽기 접근 확인됨**(스키마/행 조회 가능 → 시드 추출 가능).

## 전 GAS 코드의 Notion DB 인벤토리 (24앱 전수 grep)

| 역할 | Notion DB ID | 우리 치환 대상 | 상태 |
|---|---|---|---|
| **견적 snapshot** (QUOTE) | 2fca1006…254bc67 | slip-service `quote_snapshots` `/api/v1/estimates/snapshots` | ✅ **P0-A 완료(#447)** |
| **거래처별 DC리스트** (DATA/DC) | 193a1006…96d7102b | dc-config-service `partner_dc_configs` | ⏳ **종합견적서 핵심 잔여** (아래 스키마) |
| **출고/발송 이력** (SEND/SHIPPING) | 2f8a1006…2b175780 | partner-order-service `/api/v1/partner-orders` | △ 매핑됨(param명 `dateFrom/dateTo` 정합 필요) |
| **인증/담당자** (AUTH/MANAGER) | 198a1006…25c5e9da | auth-service `/api/v1/auth/me` | △ 매핑됨(응답 shape 확인) |
| 인증 variant | 2dda1006…660203c0 | auth-service | (타 앱) |
| 발송금지 (BLOCK) | 34da1006…9942525e | partner-service `/api/v1/partners/admin/blocks` | (이관 완료 추정) |
| 채팅 (CHAT) | 34da1006…7a2635f6 | notification/groupware | (타 앱) |
| 동작로그 (LOG) | 2eda1006…8d281ea2 | `/api/v1/audit-logs/front` | △ 매핑됨 |
| 주문 (ORDER) | 2eca1006…6fab28f4 | partner-order-service | (타 앱) |
| 지역 (REGION) | 34ea1006…60a56c38 | dispatch/region | (타 앱) |
| 저장 (SAVE ×4: 328a/32ca/34aa/337a) | … | 각 앱별 저장 DB | (타 앱별) |
| 스냅샷 (SNAPSHOT) | 33aa1006…dc7f315c | (앱별) | (타 앱) |
| 매뉴얼 (MANUAL) | 337a1006…a44573b2 | docs | (타 앱) |

→ **Notion 이식은 24앱 전반에 걸친 대형 프로그램.** "종합견적서 완결 먼저" 원칙상 본 에픽 범위 = **QUOTE(완료) + DC리스트 + SEND + AUTH** 4종.

## 종합견적서 핵심 잔여 = 거래처별 DC리스트 (193a…)

### 실제 Notion 스키마 (커넥터 조회 확인)
`거래처별 DC리스트` (data-source `193a1006-d658-815a-…`):
| 컬럼 | 타입 | legacy DC config 매핑 |
|---|---|---|
| 거래처코드 | number | 조회 키 (※ legacy `fetchNotionDcConfig_` 는 **사업자번호(bizno)** 로 조회 — 키 불일치 주의) |
| 업체명 | title | — |
| 홈멀티DC | percent | `homeDiscount` |
| 상업멀티DC | percent | `commDiscount` |
| 유연호스I형 | checkbox | `showIHose` |
| 360 / 4way / 1way / 스탠드 / 디럭스 / 1등급 | number(won) | `discount360/discount4way/oneWayDiscount/discountStand/deluxeDiscount/firstGradeDiscount` |
| 단위처리 | select(10/100/1000원 올림·반올림·내림 9종) | `unitRoundTo` + `unitRoundMode` |
| 특이사항 | text | (메모) |

### 통신 호환 갭 (감사 P1 재확인)
- 웹 code.js `initDcConfigFromNotion` 가 `GET /api/v1/partners/{biznoDigits}/dc-config` 호출 → **BE 에 해당 path 없음**. 실제 dc-config-service: `/api/v1/partner-dc-configs/{partnerCode}`(외부 PATCH) / `/api/v1/dc-configs/{partnerCode}`(Internal).
- **키 불일치**: legacy=사업자번호(bizno), 우리=partnerCode. + legacy `buildDefaultDcConfig_` flat shape vs 포트 중첩 shape.
- → **결정 필요(개발책임자)**: dc-config-service 의 partner_dc_config 모델에 위 13컬럼이 모두 있는지/확장 필요한지, 조회 키를 bizno↔partnerCode 중 무엇으로 통일할지.

## 제안 실행 순서 (종합견적서 범위)
1. dc-config-service 모델 ↔ 거래처별 DC리스트 13컬럼 갭 분석 → 부족 컬럼 마이그레이션.
2. Notion `거래처별 DC리스트` 전 행을 커넥터로 추출 → dc-config-service 시드(또는 sync) 적재.
3. 웹 code.js `initDcConfigFromNotion` → 올바른 dc-config-service 엔드포인트 + 키 + flat/중첩 shape 정합. `buildDefaultDcConfig_` shape 통일(감사 P0-C 와 동반).
4. SEND/AUTH 는 param/응답 shape 정합만(소).

> ⚠️ 1~3 은 dc-config-service 기존 모델과 통합 방식(키·shape) 결정이 선행돼야 함 → **개발책임자 확인 후 진행**(신규 업무규칙성).
