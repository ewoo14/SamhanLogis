# Phase F (samhan-signature-copy) — QA 시나리오 + 회귀 + 4단계 롤백 runbook

> 본 문서는 **QA sequential 패턴** ([feedback_qa_sequential_after_be_fe](../../.claude/memory/feedback_qa_sequential_after_be_fe.md)) 첫 적용 산출물.
>
> spec: [`docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md`](../../superpowers/specs/2026-05-14-samhan-signature-copy-design.md) v3 (D-DF-01~13)
> plan: [`docs/superpowers/plans/2026-05-15-samhan-signature-copy.md`](../../superpowers/plans/2026-05-15-samhan-signature-copy.md) (QA Task QA1~QA2)
> dev-report: [`docs/dev-reports/samhan-signature-copy.md`](../../dev-reports/samhan-signature-copy.md)
>
> 작성일: 2026-05-15 · 검증 대상 commit: `8142d56` (TM 통합 — BE/FE/Designer/DevOps 17 commit cherry-pick)
> 작성자: QA team agent (sequential 단계, BE+FE+Designer+DevOps merge 후 진입)

---

## 0. 검증 환경

| 항목 | 값 |
|---|---|
| base branch | `feat/samhan-signature-copy-spec` |
| TM 통합 commit | `8142d56` (4-team 17 commit + 자체 정정 통합) |
| arologis-service Flyway | V11 (`signatures` 4 column 추가) |
| slip-service Flyway | V14 (slip_attachments — 기존, 본 Phase 영향 0 / 변경 없음) |
| arologis-mobile (mobile-staff) Jest | 7 시나리오 (6 Driver + 1 Photo→Signature chain) |
| 캡처 방식 | **PowerShell System.Drawing mock** (3순위 fallback, [feedback_pr_qa_screenshots](../../../.claude/memory/feedback_pr_qa_screenshots.md)) — Android emulator/iOS simulator 미가용 환경 |

> **캡처 fallback 근거**: 본 worktree 환경은 Android Studio / Xcode / Docker 미가용 (Phase A PR #188, Phase C PR #189 와 동일 패턴). 따라서 Designer mock (`docs/uiux/samhan-signature-copy/01~03.md`) 의 텍스트 명세 + spec §7 UI 흐름 + plan F3/F5 의 RN 코드를 PowerShell System.Drawing 으로 wireframe PNG 합성. 후속 인수 테스트에서 실 emulator 캡처로 갱신 권장.

---

## 1. QA 7 시나리오 (BE/FE 산출 검증)

### 시나리오 1 — 1-tap 완료+발송 success → Share Sheet 호출 (200 image/png)

**사전조건**: 기사 D-001 로그인, 정차 SL-001 진입, slip recipientPhoneNumber=`010-1234-5678`, Playwright Chromium 정상.

**절차**:
1. arologis-mobile `DriverSignatureScreen` 진입 (배차 ID + stop 컨텍스트 navigation prop)
2. 좌측 SignaturePad — 기사 본인 서명 캡처
3. 우측 SignaturePad — 인수자 서명 캡처
4. 화면에 인수자 마스킹 표시 확인: `010-****-5678`
5. `[완료 + 사본 발송]` 탭 (1-tap)
6. Loading spinner (`testID="copy-sending"`) 표시 → 평균 1.5~3초
7. 응답 200 + Content-Type `image/png` 수신 (~200~800KB)
8. 응답 헤더 검증:
   - `X-Signature-Id: <UUID>`
   - `X-Slip-Bridged: true`
   - `X-Copy-Sent-At: 2026-05-15T...+09:00`
   - `X-Copy-Recipient-Phone-Masked: 010-****-5678`
9. 자동으로 `expo-sharing` Share Sheet 호출 → "○○○ 기사님이 사본을 보냅니다" dialogTitle
10. 사용자가 카톡 (또는 SMS) 선택 → 인수자 friend/번호 선택 → 전송 (OS 표준)

**예상 결과**: Toast "서명 저장 완료. Share Sheet 에서 인수자 (010-****-5678) 에게 보내세요" / Share Sheet 자동 출현.

**캡처**: `01-signature-1tap-success.png` + `02-share-sheet-android.png` + `03-share-sheet-ios.png`

**검증 SQL (arologis-service)**:
```sql
SELECT id, copy_sent_at, copy_image_path, copy_recipient_phone, copy_send_failure_count
FROM signatures
WHERE id = '<X-Signature-Id 값>';
-- 기대값:
--   copy_sent_at         : NOT NULL (응답 직전 set, KST 현재 시각 ±5초)
--   copy_image_path      : '/var/lib/arologis/signature-copies/<id>.png'
--   copy_recipient_phone : '010-1234-5678' (풀 번호 — DB 보관, 응답에서만 마스킹)
--   copy_send_failure_count: 0
```

**검증 SQL (slip-service)** (PR #99 양쪽 저장 활성 확인):
```sql
SELECT id, signature_source, signed_at
FROM slips
WHERE slip_no = 'SL-001';
-- 기대값:
--   signature_source : 'APP' (기존 'LINK' 또는 NULL → 'APP' 으로 갱신)
--   signed_at        : NOT NULL

SELECT slip_id, source, recorded_at
FROM slip_signature_audit
WHERE slip_id = '<SL-001 의 slip uuid>'
ORDER BY recorded_at DESC LIMIT 1;
-- 기대값:
--   source       : 'APP'
--   recorded_at  : 시나리오 1 캡처 시각 ±5초
```

---

### 시나리오 2 — 두 번째 호출 → 409 (COPY_ALREADY_SENT)

**사전조건**: 시나리오 1 직후 같은 stop 의 `signatureId` 가 `copy_sent_at NOT NULL`.

**절차**:
1. 시나리오 1 직후 `DriverSignatureScreen` 재진입 (또는 mobile-staff 가 caching 무시 강제 재호출)
2. 동일 endpoint `POST /driver-app/.../sign-and-send-copy` 재호출

**예상 결과**:
- HTTP 409 + Content-Type `application/json`
- 응답 body:
  ```json
  {
    "error": "COPY_ALREADY_SENT",
    "previousCopySentAt": "2026-05-15T14:30:00+09:00"
  }
  ```
- Toast: "이미 발송된 사본입니다 (2026-05-15 14:30). Admin 재발송이 필요하면 사무실에 요청"
- Share Sheet 호출 X

**캡처**: `06-already-sent-409.png`

**검증 SQL**:
```sql
-- 시나리오 1 의 row 변경 0 확인
SELECT copy_sent_at, copy_send_failure_count FROM signatures WHERE id = '<X-Signature-Id>';
-- 기대값: copy_sent_at 시나리오 1 그대로, copy_send_failure_count = 0 (Tx2 진입 X)
```

---

### 시나리오 3 — 인수자 번호 없음 → 200 with RECIPIENT_PHONE_MISSING

**사전조건**: 테스트용 slip (예: `SL-T-NULL`) 의 `recipientPhoneNumber` = NULL 또는 잘못된 형식 (`123` 등).

**절차**:
1. slip-service 에 `INSERT slips ... recipient_phone_number = NULL` (또는 dev seed)
2. 기사 어플 → 해당 stop 진입 → 서명 2개 캡처
3. `[완료 + 사본 발송]` 탭

**예상 결과**:
- HTTP 200 + Content-Type `application/json` (PNG 미반환)
- 응답 body:
  ```json
  {
    "signatureId": "uuid",
    "slipBridged": true,
    "copySent": false,
    "copyFailureReason": "RECIPIENT_PHONE_MISSING"
  }
  ```
- Toast: "서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요"
- Share Sheet 호출 X (mobile FE 가 reason 보고 skip)

**캡처**: `04-recipient-phone-missing.png`

**검증 SQL (arologis)**:
```sql
SELECT copy_sent_at, copy_image_path, copy_recipient_phone, copy_send_failure_count
FROM signatures WHERE id = '<X-Signature-Id>';
-- 기대값:
--   copy_sent_at         : NULL  (발송 미진행 — 1회 가드 미소비)
--   copy_image_path      : NULL
--   copy_recipient_phone : NULL
--   copy_send_failure_count: 0   (RECIPIENT_PHONE_MISSING 은 Tx2 fail 가 아닌 정상 skip 이므로 카운트 X)
```

**검증 SQL (slip-service)** (Tx1 양쪽 저장은 정상 진행 확인):
```sql
SELECT signature_source FROM slips WHERE slip_no = 'SL-T-NULL';
-- 기대값: signature_source = 'APP'
```

---

### 시나리오 4 — Playwright timeout → 200 with RENDERER_TIMEOUT + 재시도 OK

**사전조건**: 환경변수 `AROLOGIS_COPY_RENDERER_TIMEOUT_MS=100` (테스트 단축, default 1024ms).

**절차**:
1. 서명 후 `[완료 + 사본 발송]` 탭
2. Playwright `page.goto` 가 100ms 안에 완료 못함 → `PlaywrightException timeout`
3. 응답 200 + JSON `{ copyFailureReason: "RENDERER_TIMEOUT" }`
4. Toast: "서명 저장 완료. 사본 합성 실패 (RENDERER_TIMEOUT) — [재시도]"
5. `[재시도]` 버튼 (`testID="copy-retry"`) 표시
6. 환경변수 `AROLOGIS_COPY_RENDERER_TIMEOUT_MS=8000` 으로 복원
7. `[재시도]` 탭 → 같은 `signatureId` 로 endpoint 재호출 (`copy_sent_at` 가 NULL 이므로 409 X)
8. 응답 200 image/png + Share Sheet 자동 호출

**예상 결과**:
- 1차: 200 JSON RENDERER_TIMEOUT, `copy_send_failure_count = 1`
- 2차 (재시도): 200 image/png, `copy_sent_at` set + `copy_send_failure_count = 1` 그대로 (실패 누적)

**캡처**: `05-renderer-timeout-retry.png`

**검증 SQL**:
```sql
-- 1차 fail 직후
SELECT copy_sent_at, copy_send_failure_count
FROM signatures WHERE id = '<X-Signature-Id>';
-- 기대값: copy_sent_at = NULL, copy_send_failure_count = 1

-- 2차 재시도 success 후
SELECT copy_sent_at, copy_send_failure_count
FROM signatures WHERE id = '<X-Signature-Id>';
-- 기대값: copy_sent_at = NOT NULL, copy_send_failure_count = 1 (누적 보존)
```

---

### 시나리오 5 — 회귀 PR #99 SignatureIntegrationIT (LINK source 0 결함)

**사전조건**: PR #99 의 IT 모음 (`SignatureIntegrationIT`, `SlipSignatureLinkIT` 등) 보존.

**절차**:
1. `gradlew :services:slip-service:test --tests "*SignatureIntegrationIT*"` 단독 실행
2. `gradlew :services:arologis-service:test --tests "*SignatureIntegrationIT*"` (있으면) 실행
3. `/sign` (deprecated) endpoint 호출 IT — 기존 동작 (signature_source=LINK) 유지 확인
4. `/sign-and-send-copy` 신규 endpoint 호출 IT — signature_source=APP 갱신 확인

**예상 결과**:
- LINK source 시나리오 0 결함 (기존 PR #99 contract 보존)
- APP source 시나리오 0 결함 (신규 Phase F 통합)
- `@Deprecated` 마킹만 추가, 동작 변경 0 ([feedback_continuous_docs_sync](../../../.claude/memory/feedback_continuous_docs_sync.md))

**검증 SQL** (회귀 테스트 후 DB 상태):
```sql
SELECT signature_source, COUNT(*) FROM slips GROUP BY signature_source;
-- 기대값: 'LINK' / 'APP' / NULL 모두 존재 가능 (상호 배제 X)
```

---

### 시나리오 6 — 실 PNG 시각 검증 (출고전표 양식 + 한글 + 1MB 이내)

**사전조건**: 시나리오 1 의 산출 PNG 저장됨 (`/var/lib/arologis/signature-copies/<signatureId>.png`).

**절차**:
1. 시나리오 1 의 `X-Signature-Id` 로 disk path 의 PNG 다운로드 (또는 mobile 화면 캡처)
2. 별도 viewer (Edge / Photos) 로 PNG 열기
3. 시각 비교 항목:
   - **양식 일치**: `clients/desktop/src/renderer/print/OutboundView.tsx` 의 `a4-portrait` variant 와 동일 — 헤더 (회사 로고/주소/사업자등록번호), 거래처 (대구공조 P-1234), 배송 주소 (인천 남동구...), lines table (품목/수량/단가/금액), 합계 (totalSupply/vat/total), 인수자 서명 box, 기사 서명 box, footer (capturedAt + GPS)
   - **한글 글자 정상**: Noto Sans CJK KR (Dockerfile 의 `fonts-noto-cjk` apt 설치 확인) — 거래처명/주소/품목 한글 깨짐/사각형 없음
   - **서명 2개 위치**: 양식 하단 우측 인수자 서명 box / 좌측 기사 서명 box, base64 PNG 디코드 정상
   - **사이즈**: viewport 600x850 px 기준 PNG, 파일 크기 < 1MB (~200~800KB 범위)
4. PNG file size 검증:
   ```powershell
   Get-Item /var/lib/arologis/signature-copies/<id>.png | Select-Object Length
   # Length < 1048576 (1MB)
   ```

**예상 결과**: OutboundView 단일 출처 → drift 0, 한글 깨짐 0, 사이즈 < 1MB.

**캡처**: 시나리오 6 자체 캡처 X (시나리오 1 의 `01-signature-1tap-success.png` PNG 본체 검증).

---

### 시나리오 7 — 사진 첨부 → 서명 → 완료+발송 e2e (D-DF-13 chain)

**사전조건**: arologis-mobile 의 `SignaturePhotoScreen` 인프라 정상 (P1-8 Stage 4), W10-4 deep link 활성 (`onUploaded` → `DriverSignatureScreen` navigation).

**절차**:
1. 정차 도착 → 주문 카드 → `[배송 사진 첨부]` 진입 → `SignaturePhotoScreen`
2. 사진 첨부 toggle ON
3. attachment_type = `DELIVERY` 선택
4. 카메라 또는 갤러리 1~3장 선택
5. 자동 1MB 압축 (FE compress util) → batchToken 발급 → public 업로드 endpoint POST
6. 업로드 완료 → `onUploaded` callback → 자동으로 `DriverSignatureScreen` navigate (W10-4 deep link)
7. 기사 + 인수자 서명 캡처 → `[완료 + 사본 발송]` 탭
8. 응답 200 image/png + Share Sheet 자동 호출 → 카톡/SMS 선택 → 전송

**예상 결과**: 사진 → 서명 → 사본 발송 chain 단절 없음 (Stage 4 → Phase F 통합).

**캡처**: `07-photo-then-signature-chain.png` (SignaturePhotoScreen → DriverSignatureScreen 자동 진입 캡처)

**검증 SQL (slip-service)**:
```sql
-- 사진 첨부 검증 (V14 schema)
SELECT id, file_name, attachment_type, uploaded_at, exif_gps_lat, exif_gps_lng
FROM slip_attachments
WHERE slip_id = '<X-Signature-Id 의 slipId>'
  AND attachment_type = 'DELIVERY'
ORDER BY uploaded_at DESC;
-- 기대값:
--   1~3 row, attachment_type = 'DELIVERY'
--   file_name, file_size, content_type, storage_key 모두 NOT NULL
--   uploaded_at = 시나리오 7 캡처 시각 ±5초
```

**검증 SQL (arologis)**:
```sql
-- 시나리오 1 SQL 와 동일 — 사본 PNG 발송 정상
SELECT copy_sent_at, copy_image_path, copy_recipient_phone, copy_send_failure_count
FROM signatures WHERE id = '<X-Signature-Id>';
-- 기대값: copy_sent_at NOT NULL, copy_image_path 세팅, copy_send_failure_count = 0
```

**검증 SQL (slip-service signature_source 갱신)**:
```sql
SELECT signature_source FROM slips WHERE id = '<slipId>';
-- 기대값: signature_source = 'APP' (Tx1 양쪽 저장 정상)
```

---

## 2. 회귀 절차 + 결과

### 2.1 명령

```powershell
# arologis-service + slip-service 통합 회귀
.\gradlew :services:arologis-service:test :services:slip-service:test

# mobile-staff TypeScript 타입 검증
cd clients/mobile-staff
npx tsc --noEmit

# mobile-staff Jest (Phase F 7 시나리오)
npx jest --testPathPattern='driver/(DriverSignatureScreen|SignaturePhotoScreenChain)'

# desktop print-renderer 빌드 검증 (Vite multi-entry)
cd ../desktop
npm run build:print-renderer
```

### 2.2 결과 (TM 통합 commit `8142d56` 기준 재검증)

| 검증 대상 | 명령 | 결과 | 비고 |
|---|---|---|---|
| arologis-service | `:services:arologis-service:test` | **0 failure** (221 tests, 75 skipped) | 단위 19 신규 + IT 5 신규 + 기존 회귀, IT 75 Docker npipe skip ([feedback_testcontainers_windows_docker](../../../.claude/memory/feedback_testcontainers_windows_docker.md)) |
| slip-service | `:services:slip-service:test` | **0 failure** (454 tests, 171 skipped) | PR #99 SignatureIntegrationIT 보존 (시나리오 5), IT 171 Docker npipe skip |
| mobile-staff TS | `npx tsc --noEmit` | **0 error** | 타입 검증 PASS |
| mobile-staff Jest | `npx jest --testPathPattern='driver/...'` | **7 PASS / 0 fail** | F4 6 + F5 1 chain |
| desktop print-renderer | `npm run build:print-renderer` | **SUCCESS** (148.67 kB / 787 ms) | Vite multi-entry, OutboundView a4-portrait variant PoC |

**결론**: 회귀 0 결함 — TM1 보고와 일치 (재검증 PASS).

> 본 worktree 환경의 실제 build 결과는 본 commit 의 `docs/dev-reports/samhan-signature-copy.md §4 테스트 통계` 와 100% 일치 (재실행 결과 본 scenarios.md 발행 시점).

### 2.3 회귀 한계 (skip 사유)

- **IT skip 75 (arologis) + 171 (slip)** — Windows + Docker Desktop npipe 한계 ([feedback_testcontainers_windows_docker]). Linux CI (GitHub Actions) 환경에서 실 IT 통과 검증.
- **실 emulator e2e 미수행** — 본 worktree Android Studio / Xcode 미가용 → mock PowerShell PNG 로 대체 (캡처 7장 fallback 패턴).

---

## 3. 4단계 롤백 runbook (~80분)

> 본 Phase F 머지 후 운영 결함 발견 시 **단계별 부분 롤백 가능** — 전체 revert 불필요.

### 단계 1 — FE 회수 (~20분)

**대상**: `clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx`

**절차**:
1. PR #99 시점 (`/sign` endpoint) 의 `DriverSignatureScreen` 코드 git checkout:
   ```powershell
   git checkout <PR-99-merge-sha> -- clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx
   ```
2. `signAndSendCopy` import 제거 → 기존 `signSignature` (signal-only) 복원
3. `expo-sharing` Share Sheet 호출부 제거
4. `__tests__/screens/driver/DriverSignatureScreen.test.tsx` 회귀
5. EAS update 또는 OTA push (CodePush 채널)

**검증**: 기사 어플 `/sign` 정상 동작 (signature_source=LINK, 사본 발송 X).

**risk**: 사본 PNG 발송 흐름 0 — 사용자 안내 ("사본 발송 일시 중단, 사무실 통해 재발송 요청") 필요.

### 단계 2 — arologis 회수 (~30분)

**대상**: `services/arologis-service/.../signandsendcopy/**`

**절차**:
1. `ArologisDriverAppController` 의 `POST /sign-and-send-copy` endpoint 제거 (또는 503 응답)
2. `SignAndSendCopyService`, `PlaywrightCopyRenderer`, `CopyImageDiskStorage`, `CopyFailureReason` enum 제거
3. `SlipResolver` 확장 메서드 (`findRecipientPhone`, `buildSlipDataMap`) 회수
4. `SlipClient.getRecipientPhone` / `getFullSlip` 제거
5. slip-service 의 `/internal/slips/{id}/recipient-phone` / `/full` endpoint 제거
6. `Signature.markCopySent` / `markCopyFailure` 도메인 메서드 제거
7. `gradlew :services:arologis-service:assemble :services:slip-service:assemble` 컴파일 검증
8. arologis-service Docker 이미지 재빌드 → 배포

**검증**: arologis-service `/sign-and-send-copy` → 404, 기존 `/sign` → 200 (PR #99 동작).

**risk**: signatures 테이블의 신규 4 column (V11) 은 단계 3 까지 보존 — Hibernate validate mode 에서 문제 없음 (extra column 허용).

### 단계 3 — Flyway V11 DROP (~10분)

**대상**: `signatures` 테이블 4 column 제거.

**절차**:
1. 신규 Flyway migration `V12__rollback_signature_copy_columns.sql` 작성 (forward-only convention 따라 DROP migration 으로):
   ```sql
   ALTER TABLE signatures
       DROP COLUMN copy_sent_at,
       DROP COLUMN copy_send_failure_count,
       DROP COLUMN copy_image_path,
       DROP COLUMN copy_recipient_phone;
   ```
2. arologis-service 재기동 → Flyway 자동 적용
3. 기존 row 의 신규 column data 손실 (의도된 롤백)
4. 기존 운영 PNG 파일 (`/var/lib/arologis/signature-copies/`) 은 단계 4 에서 처리

**검증**: `\d signatures` 결과 신규 4 column 0.

**risk**: Phase F 머지 ~ 롤백 사이 발송된 PNG 의 disk path 추적 불가 (Admin 수동 cleanup 필요).

### 단계 4 — Docker 이미지 재배포 (~20분)

**대상**: arologis-service Docker 이미지 (Playwright/Chromium/fonts-noto-cjk 제거).

**절차**:
1. `services/arologis-service/Dockerfile` 의 다음 항목 제거:
   - `RUN apt-get install -y fonts-noto-cjk`
   - `RUN mvn ... playwright install chromium`
   - `COPY clients/desktop/print-renderer/ /app/print-renderer/`
2. `clients/desktop/vite.print-renderer.config.ts` + `clients/desktop/print-renderer/` 디렉토리 삭제 (또는 내버려둠 — 영향 0)
3. `clients/desktop/package.json` 의 `build:print-renderer` script 제거
4. arologis-service Docker 이미지 재빌드 (`docker build -t arologis-service:rollback .`)
5. 운영 환경 (Phase 11 AWS 또는 dev Docker Compose) 에 재배포
6. env 4건 unset: `AROLOGIS_SIGNATURE_COPY_DIR`, `AROLOGIS_PLAYWRIGHT_BROWSER_PATH`, `AROLOGIS_PRINT_RENDERER_PATH`, `AROLOGIS_COPY_RENDERER_TIMEOUT_MS`
7. `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=true` 복원 (PR #99 의 양쪽 저장 비활성, 사본 brige 0)
8. 디스크 정리: `rm -rf /var/lib/arologis/signature-copies/`

**검증**: arologis-service container 메모리 ~500MB 감소 (Chromium pool 제거), Docker 이미지 size ~300MB 감소.

**risk**: 단계 1~3 보다 가장 무거운 단계 — 운영 트래픽 무중단 cutover 필요 (Blue/Green deploy 권장).

### 롤백 총평

| 단계 | 시간 | 가역성 | 운영 영향 |
|---|---|---|---|
| 1. FE 회수 | 20분 | 즉시 (OTA push) | 사본 발송 중단, 서명/배송 자체는 정상 |
| 2. arologis 회수 | 30분 | container 재기동 | endpoint 404, 기존 `/sign` 정상 |
| 3. V11 DROP | 10분 | DB 변경 | 신규 column 데이터 손실 (1회만 적용) |
| 4. Docker 재배포 | 20분 | image 재빌드 | 메모리 회수, env unset |
| **합계** | **~80분** | 단계별 부분 롤백 가능 | 단계 1 만 진행해도 사본 발송 즉시 중단 가능 |

**권장**: 운영 결함이 사본 발송 흐름 한정이면 **단계 1 만** 진행 (20분, 즉시 효과). 백엔드 안정 확인 후 단계 2~4 점진 진행.

---

## 4. 캡처 7장 산출 방식 + 한계

### 4.1 산출 방식

본 worktree 환경 한계 (Android Studio / Xcode / Docker 미가용) 로 **3순위 PowerShell System.Drawing mock fallback** 적용 ([feedback_pr_qa_screenshots](../../../.claude/memory/feedback_pr_qa_screenshots.md), Phase A PR #188 / Phase C PR #189 패턴 일관).

스크립트: [`scripts/generate-samhan-signature-copy-screenshots.ps1`](../../../scripts/generate-samhan-signature-copy-screenshots.ps1) (재실행 가능)

### 4.2 7 PNG 매핑

| 파일 | 시나리오 | 내용 |
|---|---|---|
| 01-signature-1tap-success.png | 1 | DriverSignatureScreen 1-tap 완료+발송 직후 (서명 2개 + 마스킹 + Loading + Toast) |
| 02-share-sheet-android.png | 1 | Android expo-sharing OS Share Sheet (카톡/메시지/Drive) |
| 03-share-sheet-ios.png | 1 | iOS expo-sharing OS Share Sheet (메시지/카톡 인앱/AirDrop) |
| 04-recipient-phone-missing.png | 3 | 200 + Toast "인수자 번호 미등록 — Admin 재발송 필요" |
| 05-renderer-timeout-retry.png | 4 | 200 + Toast "사본 합성 실패 (RENDERER_TIMEOUT) — [재시도]" 버튼 |
| 06-already-sent-409.png | 2 | 409 + Toast "이미 발송된 사본입니다 (2026-05-15 14:30)" |
| 07-photo-then-signature-chain.png | 7 | SignaturePhotoScreen DELIVERY 업로드 완료 → DriverSignatureScreen 자동 진입 (W10-4) |

### 4.3 후속 권장

실 emulator 캡처 가능한 환경 (CI Linux GHA 또는 macOS Xcode) 에서 본 7 PNG 를 실 캡처로 갱신 권장. 본 mock 은 layout 명세 + brand color (`#2A9D8F` arologis-teal) + 토스트 텍스트 정확성에 한정 검증.

---

## 5. 참조

- [feedback_qa_sequential_after_be_fe](../../../.claude/memory/feedback_qa_sequential_after_be_fe.md) — 새 패턴 첫 적용
- [feedback_pr_qa_screenshots](../../../.claude/memory/feedback_pr_qa_screenshots.md) — mock fallback 패턴
- [feedback_testcontainers_windows_docker](../../../.claude/memory/feedback_testcontainers_windows_docker.md) — IT skip 사유
- [feedback_powershell_utf8_writes](../../../.claude/memory/feedback_powershell_utf8_writes.md) — UTF-8 BOM 가드
- [feedback_uuid_no_user_visibility](../../../.claude/memory/feedback_uuid_no_user_visibility.md) — 인수자 번호 마스킹
- spec §8 — 6 시나리오 + 롤백 원안
- plan §QA1 — 7 시나리오 (D-DF-13 chain 추가) + 검증 SQL 형식
- dev-report §3.5 — QA sequential 산출 예고
- PR #99 — slip-service signature 통합 (skeleton-mode 의존)
- PR #188 / #189 — Phase A / C 캡처 mock fallback 선례
