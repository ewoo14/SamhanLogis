# 항목 3 — 알리고 주소록 API 실 spec 적용 검증

> **선행 산출물** — PR-F1 commit `f3b313a`
> - `services/notification-service/src/main/java/com/samhanair/logis/notification/client/AligoAddressBookClient.java` (인터페이스 계약)
> - `services/notification-service/src/main/java/com/samhanair/logis/notification/client/MockAligoAddressBookClient.java` (dryRun 구현체)
> - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/AligoAddressBookSyncService.java` (chunk 50 + 429 backoff)
>
> **본 문서** — 사용자가 알리고 주소록 API spec 첨부 후 mock → 실 RestClient 교체 가이드

---

## 1. 현재 상태 — Mock dryRun

```
+----------------------------+
| AligoAddressBookSyncService| chunk 50 + 429 backoff
+-------------+--------------+
              |
              | uploadChunk(contacts)
              v
+----------------------------+
| AligoAddressBookClient     | 인터페이스 (계약 안정)
+-------------+--------------+
              |
              v
+----------------------------+
| MockAligoAddressBookClient | <-- 현재 활성 (실 spec 부재)
| (dryRun + INFO log)        |
+----------------------------+
```

Mock 동작 — 외부 API 호출 X. INFO 로그만 출력. 입력 contact 수 = added 카운트 반환.

---

## 2. 사용자 작업 단계

### 2-1. 알리고 주소록 API 인증 정보 확보

알리고 콘솔 (https://smartsms.aligo.in) 로그인 → **API 사용 신청** → 다음 정보 발급:

| 항목 | 환경변수 (notification-service application.yml) | 예시 |
| ---- | ----------------------------------------------- | ---- |
| API key | `SAMHAN_ALIGO_KEY` | `abcdef1234567890` |
| user ID | `SAMHAN_ALIGO_USERID` | `samhanair` |
| 발신번호 | `SAMHAN_ALIGO_SENDER` | `02-1234-5678` |

> SMS 발송용 자격증명 (`SAMHAN_ALIGO_*`) 은 application.yml §46~50 에 이미 정의됨. 주소록 API 도 동일 자격증명 재활용 가정.

### 2-2. 알리고 주소록 API spec 첨부 (사용자 → Claude 전달 의무)

사용자가 다음 spec 을 알리고 고객지원 또는 공식 문서에서 확보 후 본 문서 §6 부록에 첨부:

- [ ] **endpoint URL** (예: `https://apis.aligo.in/address/upload/`)
- [ ] **HTTP method** (POST 가정)
- [ ] **request payload schema** (form-data / JSON / multipart)
  - 인증 필드 (key, userid)
  - contact 필드 (group, name, phone, memo)
  - chunk 단위 (50 가정 — 알리고 측 limit 확인 의무)
- [ ] **response payload schema**
  - success / fail 분기
  - added / updated / skipped 카운트
  - rate limit 응답 (HTTP 429 또는 body code)
- [ ] **rate limit 정책** (RPS / RPM)
- [ ] **인증 방식** (form key/userid 평문? signature?)

### 2-3. RestClient 실 구현체 작성 (Claude 작업)

위 spec 확정 후 Claude 가 다음 파일 작성:

```
services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientAligoAddressBookClient.java
```

작성 규칙:
- `@Component` 또는 `@Configuration` + `@Bean` (NoopAligoCsvSourceClient 패턴 준수)
- `AligoProperties` 주입 — key/userid/sender
- `RestClient` 또는 `WebClient` 사용 (notification-service `WebClientConfig` 재활용)
- 429 응답 시 `UploadResult.rateLimited()` 반환 → 호출 측 backoff trigger
- 본 빈 등록 시 `MockAligoAddressBookClient` 자동 비활성 (`@ConditionalOnMissingBean(AligoAddressBookClient.class)` 가드)

### 2-4. 1 회 동기화 검증

start-local-full.ps1 부팅 후:

```powershell
# JWT 발급 (kimmiseon)
$loginBody = '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}'
$loginResp = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" `
    -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResp.data.accessToken

# 주소록 동기화 trigger (admin endpoint)
Invoke-RestMethod -Uri "http://localhost:8093/api/v1/notification/admin/aligo/address-book/sync" `
    -Method POST -Headers @{ Authorization = "Bearer $token" }
```

> endpoint 경로는 notification-service `AligoAddressBookController` 와 일치해야 함 (실제 path 확인 후 update).

### 2-5. 알리고 콘솔에서 주소록 확인

알리고 콘솔 로그인 → 주소록 → 새로 추가된 contact (chunk 50 단위) 확인.

---

## 3. 합격 기준

| 항목 | 기대 결과 | 합격 |
| ---- | --------- | ---- |
| `AligoAddressBookClient` 활성 빈 | `RestClientAligoAddressBookClient` (Mock 자동 비활성) | ✅ |
| sync endpoint 응답 | HTTP 200 + `{ "totalUploaded": N, "chunksSent": M }` | ✅ |
| notification-service 로그 | `Mock dryRun placeholder 활성` 메시지 부재 | ✅ |
| 알리고 콘솔 | 새 contact group / 명단 표시 | ✅ |
| 429 시뮬레이션 | backoff 후 재시도, 최종 success | ✅ |

---

## 4. 트러블슈팅

| 증상 | 원인 | 해결 |
| ---- | ---- | ---- |
| `Mock dryRun placeholder 활성` 로그 지속 | `RestClientAligoAddressBookClient` 빈 미등록 또는 `@ConditionalOn*` 가드 부정 | 빈 클래스 `@Configuration` + `@Bean` 명시 + 클래스경로 확인 |
| HTTP 401 from 알리고 | key / userid 오타 | `SAMHAN_ALIGO_KEY` env 재확인 |
| 모든 contact `skipped` | 전화번호 정규화 미흡 (010 prefix / dash 포함) | `AligoContact.phone` 11자리 정규화 검증 |
| HTTP 429 반복 | chunk 50 too large 또는 RPS 초과 | chunk 25 로 감축 + delay 1s |

---

## 5. AWS 진입 (Phase 11) 영향

- 본 항목 = **mock 통과 허용** (실 spec 부재 시 Phase 11 진입 후 별도 PR 가능)
- 위험 수용 시 — Phase 11 PR 본문에 "알리고 주소록 자동 동기화 = mock 유지, post-cutover 별도 PR" 명시 + 사용자 승인 댓글 필수
- production 환경에서도 Mock 활성 시 알리고 콘솔에 신규 contact 미반영 → 운영자가 수동 CSV 업로드 fallback (legacy 흐름 임시 유지)

---

## 6. 부록 — 알리고 API spec (사용자 작성)

> 사용자가 spec 확보 후 본 섹션에 채우기.

### 6-1. endpoint
```
URL: <TBD>
Method: <TBD>
Content-Type: <TBD>
```

### 6-2. request payload
```
<TBD — JSON / form-data 예시>
```

### 6-3. response payload
```
<TBD — success + fail 예시>
```

### 6-4. rate limit
```
<TBD — RPS / RPM>
```

---

## 7. 검증 완료 시 update

- spec 확보 + RestClient 작성 + 1 회 동기화 성공 후 `docs/operational-validation/README.md` §2 항목 3 ✅
- spec 미확보 + mock 유지 시 ⬜ 유지 + Phase 11 PR 본문에 위험 수용 명시
