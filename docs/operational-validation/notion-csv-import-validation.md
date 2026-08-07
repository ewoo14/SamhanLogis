# 항목 4 — 4 CSV DB 이관 실 데이터 (Notion export) 검증

> **선행 산출물** — `tools/legacy-gas/_notion-export/` (사용자 노션 export)
> **본 문서** — 4 CSV 일괄 DB 이관 + DB row count 검증 + reject 보고 절차
> **자동화** — `tools/operational-validation/import-notion-csv.ps1`

본 항목의 목적은 Notion 을 Samhan Public 의 런타임 데이터 소스로 유지하는 것이 아니다.
노션 원본 표를 cutover 시점에 우리 service-per-DB 테이블로 그대로 이관하고, 이후
조회·수정·삭제는 Samhan Public DB CRUD 화면/API 에서만 수행한다.

---

## 1. 4 CSV + 매핑 service / endpoint

| Notion DB | CSV 위치 (legacy-gas/_notion-export 하위) | 대상 service | endpoint | 기대 row | 인증 |
| --------- | ----------------------------------------- | ------------ | -------- | -------- | ---- |
| 가배차용 지역별 분류표 | `가배차용 지역별 분류표/*.csv` | arologis-service (8097) | `POST /admin/arologis/regions/import` | CSV non-empty row 수 자동 계산 (2026-05-16 현재 20) | MASTER/MANAGER |
| 거래처 DC정보 | `거래처 DC정보/*.csv` | dc-config-service (8089) | `POST /api/v1/dc-config/admin/import` | CSV 거래처코드 row 수 자동 계산 (2026-05-16 현재 213, unique partnerCode 210) | MASTER |
| 단톡방리스트 | `단톡방리스트/*.csv` | notification-service (8093) | `POST /api/v1/notification/admin/chat-rooms/import` | CSV non-empty row 수 자동 계산 (2026-05-16 현재 112) | MASTER/MANAGER |
| 발송금지리스트 | `발송금지리스트/*.csv` | partner-service (8095) | `POST /api/v1/partners/admin/blocks/import` | CSV non-empty row 수 자동 계산 (2026-05-16 현재 6) | MASTER |

> 각 CSV 디렉토리에는 동일 내용의 `_all.csv` 도 존재 — 본 검증은 base CSV 1 건만 사용.
> PR #115 당시 문서 기준(REGION 19 / DC 221 / CHAT 111 / BLOCK 5)은 당시 export 스냅샷이다.
> 운영 Notion 표는 행 수가 변할 수 있으므로, 스크립트는 선택된 CSV 의 실제 non-empty row 수를 기대값으로 계산한다.
>
> 응답 schema 는 service 별 ImportResult DTO. 공통 필드: `inserted` / `updated` / `rejected[]` / `skipped` (일부 service 만).

---

## 2. 사용자 작업 단계

### 2-1. start-local-full.ps1 부팅 + healthy 확인

```powershell
.\infrastructure\scripts\start-local-full.ps1
```

다음 4 service 가 UP 상태 의무:
- arologis-service (8097)
- dc-config-service (8089) ← 14 service 외 추가 service. 별도 부팅 필요 시 `gradlew :services:dc-config-service:bootRun` 수동 기동
- notification-service (8093)
- partner-service (8095)

### 2-2. DB 이관 자동화 스크립트 실행

```powershell
.\tools\operational-validation\import-notion-csv.ps1
```

스크립트 동작:
1. kimmiseon (MASTER) 로그인 → JWT 발급
2. 4 CSV 파일을 multipart 로 admin endpoint 4 회 호출하여 각 서비스 DB 로 이관
3. 각 응답을 표 형식으로 표시 (inserted / updated / rejected / skipped)
4. 종합 표 + 합격/불합격 판정

성공 후 운영 흐름:
- 단톡방리스트: `/admin/chat-rooms` 화면과 `notification-service` DB CRUD
- 발송금지리스트: `/admin/blocked-partners` 화면과 `partner-service` DB CRUD
- 배차지역 분류표: `/admin/regions` 배차지역 관리 화면과 `arologis-service` DB CRUD
- 거래처 DC정보: `/sales/partner-dc-config` 화면과 `dc-config-service` DB CRUD

이후 조회·수정·삭제는 Samhan Public DB CRUD 만 사용하며, Notion 은 더 이상
애플리케이션 런타임 조회처가 아니다.

### 2-3. 결과 검증

스크립트 종료 시 다음 표 출력 기대:

```
DB      endpoint                                         expected  actual  rejected  verdict
-----   ----------                                       --------  ------  --------  -------
REGION  POST /admin/arologis/regions/import              CSV기준   CSV기준  0         OK
DC      POST /api/v1/dc-config/admin/import              CSV기준   CSV기준  0         OK
CHAT    POST /api/v1/notification/admin/chat-rooms/import CSV기준   CSV기준  0         OK
BLOCK   POST /api/v1/partners/admin/blocks/import        CSV기준   CSV기준  0         OK
```

### 2-4. DB row count 직접 검증 (선택 — psql)

2026-05-16 현재 `거래처 DC정보` CSV는 거래처코드가 있는 row 213건 중 partnerCode 중복 3건이 있어,
`dc_configs` 활성 row는 unique partner 기준 210건이다. import 응답의 inserted/updated 합계는 처리 row 수,
DB count는 active partner별 최종 설정 수로 해석한다.

```powershell
docker exec samhan-postgres psql -U samhan -d arologis_db        -c "SELECT count(*) FROM region_dispatch_classifications WHERE is_deleted = false;"
docker exec samhan-postgres psql -U samhan -d dc_config_db       -c "SELECT count(*) FROM dc_configs WHERE is_deleted = false;"
docker exec samhan-postgres psql -U samhan -d dc_config_db       -c "SELECT count(DISTINCT p.partner_code) FROM dc_configs d JOIN partners p ON d.partner_id = p.id WHERE d.is_deleted = false AND p.is_deleted = false;"
docker exec samhan-postgres psql -U samhan -d notification_db    -c "SELECT count(*) FROM partner_chat_room_mappings WHERE is_deleted = false;"
docker exec samhan-postgres psql -U samhan -d partner_db         -c "SELECT count(*) FROM blocked_partners WHERE is_deleted = false;"
```

---

## 3. 합격 기준

| 항목 | 기대 결과 | 합격 |
| ---- | --------- | ---- |
| 4 endpoint 모두 HTTP 200 | 응답 body 정상 JSON | ✅ |
| inserted+updated ≥ expected | 선택된 CSV non-empty row count 매칭. BLOCK 은 이미 차단된 row 를 `alreadyBlocked`/updated 로 합산 | ✅ |
| rejected 배열 길이 0 | lookup miss 없음 | ✅ (부분 통과 시 reject 보고서 검토 의무) |
| DB row count = expected | psql 직접 확인 | ✅ |

---

## 4. reject 보고서 (lookup miss) 분석

Notion CSV 중 단톡방리스트/발송금지리스트는 **사업자명 텍스트** 만 있고 거래처코드가 없다. legacy GAS 도 동일하게 `이카운트 사업자명` 기준 index 를 만들었으므로, Samhan Public import 는 다음 순서로 처리한다.

1. `거래처코드` 컬럼이 있으면 code-first 로 매핑한다.
2. 코드가 없고 사업자명 lookup 이 성공하면 실제 partnerCode 로 매핑한다.
3. 코드가 없고 사업자명 lookup 도 실패하면 `LEGACY-NAME-{hash}` alias 로 저장해 row 를 유실하지 않는다.

각 service 의 import 응답 `rejected` 배열은 진짜 CSV 형식 오류나 필수값 누락만 남아야 한다:

```json
{
  "inserted": 218,
  "updated": 0,
  "rejected": [
    { "row": 5, "reason": "partner not found", "name": "구) 한솔물류" },
    { "row": 47, "reason": "partner not found", "name": "동방운수(폐업)" },
    { "row": 102, "reason": "phone format invalid", "value": "010-1234-567" }
  ]
}
```

해결:
- partner not found → 현재 구현에서는 CHAT/BLOCK/DC 에 대해 reject 되지 않아야 한다. 발생 시 import service 회귀로 보고 수정한다.
- format invalid → CSV 수정 후 재 import (idempotent — 동일 데이터는 update 처리)

---

## 5. 트러블슈팅

| 증상 | 원인 | 해결 |
| ---- | ---- | ---- |
| HTTP 401 | JWT 발급 실패 | kimmiseon 비밀번호 `${QA_MASTER_PASSWORD}` 확인, auth-service UP 확인 |
| HTTP 403 | 토큰 role MASTER/MANAGER 아님 | `kimmiseon` 가 MASTER 인지 OrgChartSeeder 확인 |
| HTTP 400 (CSV 파싱) | UTF-8 BOM 누락 / 구분자 차이 | Notion export 원본 그대로 사용 (수동 가공 금지) |
| HTTP 400 (필드 누락) | CSV 헤더 변경 | service ImportService 의 expected header 와 비교 |
| dc-config-service down | 14 service 부팅 스크립트에서 누락 | `gradlew :services:dc-config-service:bootRun` 수동 기동 |
| 일부 row rejected | 필수값 누락 / CSV 헤더 변경 / import service 회귀 | reject 보고서 → 원인별 fix 후 재 import |

---

## 6. legacy name alias 동작

- alias 형식: `LEGACY-NAME-<SHA-256 앞 12자리>`
- 저장 위치:
  - 단톡방리스트 → `notification-service.partner_chat_room_mappings.partnerCode`
  - 발송금지리스트 → `partner-service.blocked_partners.partnerCode`
- 사용자 화면에는 alias/UUID를 노출하지 않고 `partnerBusinessNameSnapshot` / 카톡방명 / 업무번호만 보여준다.
- 내일자 전표 이미지와 배차안내는 partnerCode lookup 을 먼저 시도하고, 매핑이 없으면 전표의 `partnerName` 으로 단톡방/발송금지를 다시 찾는다.

---

## 7. AWS 진입 (Phase 11) 영향

- 본 항목 = **production 부팅 직후 1 회 DB 이관** 의무 (실 데이터 cutover)
- production EC2 에서도 동일 endpoint 호출 가능 — `start-local-full.ps1` 대신 systemd unit 부팅 후 `import-notion-csv.ps1` 의 PowerShell 명령을 bash + curl 로 변환 (Phase 11 cutover 슬라이스 별도)
- 주의 — production 에서는 `kimmiseon` 비밀번호 cutover 직후 변경 후 import 작업 진행 (기본 비밀번호 `${QA_MASTER_PASSWORD}` 노출 위험)

---

## 8. 검증 완료 시 update

`docs/operational-validation/README.md` 의 §2 진행 상황 chart 의 항목 4 를 ✅ + 검증 일자 + 4 endpoint 응답 row count 비고에 명시.
