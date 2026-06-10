# #29 DC설정 Notion→DB 이식 — 실 QA 결과

- 일시: 2026-06-10 / branch `feat/29-dc-config-notion-to-db`
- 방법: **실 레거시 Notion**(거래처별 DC리스트, data_sources API) → CSV 추출 → **실 로컬 Docker dc-config-service**(본 PR 코드 재빌드) 게이트웨이 실 로그인(dev_master JWT) import → estimate-app `initDcConfigFromNotion` 실 E2E. 가짜 데이터 0.
- ⚠️ 추출 CSV(거래처 할인 영업 데이터)는 `.claude/tmp/`(gitignored) 한정 — **레포 PUBLIC 이므로 커밋 절대 금지**, 적재는 런타임 import 만.

## ① 실 Notion 추출 (`scripts/extract-notion-dc-csv.js`)

- **227행 / API 3페이지 / 거래처코드 보유 227(전건)** — 결정 ③(partnerCode=bizno digits) 정합.
- 단위처리 select 분포: `100원 반올림 2 / 100원 올림 1` (나머지 빈값).

## ② 실 import (게이트웨이 `/api/v1/dc-config/admin/import`, dev_master 실 JWT)

```json
{"inserted": 225, "updated": 2, "skipped": 0, "rejected": []}
```
- **227행 전건 적재, rejected 0**.
- **단위처리 fidelity fix 실증** (이전 parseYesNo 였으면 select 3건이 reject 또는 silent 유실):

```
7968102976|t|100|ROUND|0.4700
8428102605|t|100|ROUND|0.4800
1588802571|t|100|CEIL |0.4800
```

## ③ estimate-app 실 E2E (`initDcConfigFromNotion`, X-Internal-Token)

| 입력 bizno | 결과 | 판정 |
|---|---|---|
| `158-88-02571` | home **0.48** / comm **0.49** / roundTo **100** / mode **CEIL** / d360 **60000** | ✅ 실 Notion 값 복원 |
| `796-81-02976` | home **0.47** / roundTo **100** / ROUND | ✅ |
| 미등록 `999-99-99998` | 404 → **default(0.45) 환원** | ✅ graceful |
| 오토큰 | **401 → default 환원** 로그 명시 | ✅ |

## 테스트

- estimate-app jest **53/53 PASS**(by-bizno 매핑 + dcConfig null + 기존 가드).
- dc-config-service 테스트 **BUILD SUCCESSFUL**(단위처리 select 9종 파서·비인식 reject·import 매트릭스 신규 3케이스 포함).

## 운영 런북 (시드 1회)

1. `node clients/web/estimate-app/scripts/extract-notion-dc-csv.js` (NOTION_TOKEN env 또는 로컬 라이브 소스).
2. 운영 게이트웨이 로그인(MASTER, `dc-config.import` 권한) 후 `POST /api/v1/dc-config/admin/import` (multipart `file`).
3. estimate-app `.env`: `PARTNER_SERVICE_URL`(dc-config-service)+`SAMHAN_INTERNAL_TOKEN` 확인.
