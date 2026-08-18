# 항목 5 — Service Account 키 설정 (종합견적서 시트) 검증

> **선행 산출물** — PR-D BE-A1 (`product-service` GoogleSheetsClient + `partner-order-service` GoogleSheetsClient 1:1 복제)
> **본 문서** — GCP Service Account 키 발급 + 시트 공유 + 두 service 가 시트 동기화 정상 동작 검증

---

## 1. 영향 service + 환경 변수

| service | 환경 변수 | application.yml 위치 | default |
| ------- | --------- | -------------------- | ------- |
| product-service | `GOOGLE_SHEETS_SHEET_ID` | §52 `google.sheets.sheet-id` | `<SHEET_ID>` (실제 시트) |
| product-service | `GOOGLE_SERVICE_ACCOUNT_KEY` | §53 `google.sheets.service-account-key-path` | `/etc/samhan/sa-key.json` |
| partner-order-service | `GOOGLE_SERVICE_ACCOUNT_KEY` | §61 (동일) | `/etc/samhan/sa-key.json` |

> 두 service 가 **동일 SA 키 + 동일/별도 시트** 공유. partner-order-service 의 sheet-id 는 별도 시트 사용 시 `GOOGLE_SHEETS_SHEET_ID` 별도 export.

---

## 2. 사용자 작업 단계

### 2-1. GCP Service Account 키 발급

1. GCP Console (https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. **"+ CREATE SERVICE ACCOUNT"**:
   - name: `samhan-sheets-reader`
   - role: 미부여 (시트 측 공유로 권한 부여)
3. 생성된 SA → "Keys" tab → "ADD KEY" → "Create new key" → JSON
4. `<프로젝트ID>-<해시>.json` 다운로드 → 안전한 위치 보관

### 2-2. Google Sheets API 활성

1. GCP Console → APIs & Services → Library
2. `Google Sheets API` 검색 → 활성

### 2-3. SA 키 배치

#### Windows 환경 (개발자)

```powershell
# 권장 위치
$dest = "$env:USERPROFILE\.samhan\sa-key.json"
New-Item -ItemType Directory -Path "$env:USERPROFILE\.samhan" -Force | Out-Null
Move-Item -Path "C:\Users\<user>\Downloads\<프로젝트ID>-<해시>.json" -Destination $dest

# env 변수 export
$env:GOOGLE_SERVICE_ACCOUNT_KEY = $dest
```

#### Linux/Mac (Phase 11 production EC2)

```bash
sudo mkdir -p /etc/samhan
sudo mv ~/Downloads/<프로젝트ID>-<해시>.json /etc/samhan/sa-key.json
sudo chmod 600 /etc/samhan/sa-key.json
sudo chown ec2-user:ec2-user /etc/samhan/sa-key.json   # 또는 service 운영 계정

# systemd unit env 또는 .env 파일에 명시 (default 경로면 생략 가능)
GOOGLE_SERVICE_ACCOUNT_KEY=/etc/samhan/sa-key.json
```

### 2-4. 시트 측 공유 권한 부여

1. SA 키 JSON 의 `client_email` 필드 복사 (예: `samhan-sheets-reader@<프로젝트>.iam.gserviceaccount.com`)
2. Google Sheets 시트 (sheet-id `<SHEET_ID>`) 열기
3. 우상단 "공유" 버튼 → SA email 추가 → **편집자** 권한 부여 (read-only sync 라도 metadata 호출 시 편집자 권한 필요)
4. partner-order-service 가 별도 시트 사용 시 동일 절차 반복

### 2-5. service 재기동

```powershell
# product-service + partner-order-service 만 재기동
Get-Job -Name "product-service" | Stop-Job
Get-Job -Name "partner-order-service" | Stop-Job
.\gradlew.bat :services:product-service:bootRun --console=plain
# (별 PowerShell 창)
.\gradlew.bat :services:partner-order-service:bootRun --console=plain
```

또는 14 service 일괄 재기동 (`start-local-full.ps1`).

---

## 3. 시트 동기화 검증

### 3-1. product-service 시트 sync trigger

```powershell
# JWT 발급 (kimmiseon)
$loginBody = '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}'
$loginResp = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" `
    -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResp.data.accessToken

# product-service sheet sync (실 endpoint 는 ProductSheetSyncService 트리거 path 확인)
Invoke-RestMethod -Uri "http://localhost:8084/api/v1/products/admin/sheet/sync" `
    -Method POST -Headers @{ Authorization = "Bearer $token" }
```

### 3-2. 기대 동작

1. product-service `GoogleSheetsClient` 가 SA 키로 GoogleCredentials 발급
2. Sheets API v4 호출 → 시트 metadata + 데이터 row 수신
3. product-service DB upsert → `products` 테이블 row 갱신
4. 응답: `{ "fetched": N, "upserted": M, "rejected": K }`

### 3-3. 합격 기준

| 항목 | 기대 결과 | 합격 |
| ---- | --------- | ---- |
| product-service 부팅 로그 | `GoogleSheetsClient 초기화 성공` (또는 미오류) | ✅ |
| sync endpoint 응답 | HTTP 200 + fetched ≥ 1 | ✅ |
| products DB row count | sync 전후 비교 시 증가 또는 갱신 | ✅ |
| partner-order-service 동일 검증 | (별도 endpoint, 동일 패턴) | ✅ |
| 시트 미공유 시 | HTTP 403 / `PERMISSION_DENIED` | 정상 reject |

---

## 4. 트러블슈팅

| 증상 | 원인 | 해결 |
| ---- | ---- | ---- |
| `FileNotFoundException: /etc/samhan/sa-key.json` | Windows 환경에 default Linux 경로 | `$env:GOOGLE_SERVICE_ACCOUNT_KEY` 명시 |
| `403 PERMISSION_DENIED` | SA email 시트 미공유 | 시트 공유 → 편집자 권한 |
| `404 NOT_FOUND` (sheet-id) | env 와 application.yml default 불일치 | `GOOGLE_SHEETS_SHEET_ID` 명시 export |
| `400 INVALID_ARGUMENT` | range 형식 오류 (sheet name 한글) | `'시트1'!A:Z` 형식 + 따옴표 escape |
| `429 RESOURCE_EXHAUSTED` | Sheets API rate limit (분당 60 reqs/user) | Caffeine cache TTL 5분 적용 (이미 default) |

---

## 5. AWS 진입 (Phase 11) 영향

- production EC2 의 `/etc/samhan/sa-key.json` 배치 — Phase 11 cutover 시점 사용자 작업 백로그
- IAM 별도 부여 X (SA 자체가 GCP 자격증명, AWS 와 무관)
- 키 rotation 정책 — 90일 권장 (GCP best practice). Phase 11 이후 분기별 rotate
- secret 관리 — production 에서는 AWS Systems Manager Parameter Store / Secrets Manager 검토 (Phase 11 cutover 후 별도 슬라이스)

---

## 6. 검증 완료 시 update

`docs/operational-validation/README.md` 의 §2 진행 상황 chart 의 항목 5 를 ✅ + 검증 일자 + 사용한 시트 ID 비고에 명시.
