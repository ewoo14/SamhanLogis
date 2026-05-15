# Samhan Public 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (Phase F) — 설계서 v3

> 작성일: 2026-05-14 (v1) / 갱신일: 2026-05-15 (v3, 브레인스토밍 12 weak spot 해소)
> Phase A (PR #188) + C (PR #189) 머지 후. Phase B / D 는 인성데이타 API 링크 도착 대기.
> **새 QA sequential 패턴 첫 적용** ([[feedback_qa_sequential_after_be_fe]]).
> v3 변경: Aligo 채널 제거 → mobile Share Sheet 발송, 서버 Playwright Chromium 으로 OutboundView 양식 사본 PNG 합성.

---

## 1. 배경 / 목적

기사 어플 (arologis-mobile / 현 mobile-staff) 배송 완료 흐름 완성:
- 기사님이 정차 도착 → **DELIVERY 사진 첨부** (인수자/배송지/물품 증거, 옵션 toggle, 기존 `SignaturePhotoScreen` 인프라 활용 — D-DF-13)
- → 자신 + 인수자 서명 캡처
- 자동으로 **서명 정보가 양쪽 저장** (PR #99 의 skeleton-mode false 활성)
  - **arologis-service 측**: 자체 `signatures` 테이블 INSERT (배차/기사 도메인 운영 사본)
  - **slip-service (Samhan Public) 측**: `slips.signature_source = APP` 갱신 + `slip_signature_audit` 적재 (출고전표의 서명 상태 변화)
  - **출고전표 본체 (Slip entity)** 는 slip-service 가 단일 source of truth — 이미 발행 흐름으로 존재. 본 Phase 가 update 하는 것은 **그 슬립의 서명 정보** (signature_source/audit) 만
- 서명 완료 시 **서버가 출고전표 양식 사본 PNG 합성** (`OutboundView.tsx` 단일 출처)
- mobile 이 PNG 받아 **기사 본인 카카오톡/SMS Share Sheet 으로 인수자에게 직접 발송**
  - 발신자 = 진짜 기사 본인 (회사 대표번호 X, Aligo X)

기존 인프라 활용:
- PR #99 의 `SlipClient.registerSignature()` (arologis → slip-service)
- arologis `Signature` entity (PR #99 시점 통합)
- `clients/desktop/src/renderer/print/OutboundView.tsx` (출고전표 인쇄 양식, 88mm + A4 portrait, 도장 자리/인수자 서명 칸 이미 디자인됨)

**비목표**: 인성데이타 (Phase B), GPS SSE (Phase D), 인수자 기사 정보 카톡 (Phase E), Admin 측 수동 재 발송 (후속 PR).

---

## 2. 12 핵심 결정 (D-DF-01~12)

| # | 결정 | 비고 |
|---|---|---|
| D-DF-01 | **서명 정보 양쪽 저장** = PR #99 `SlipClient.registerSignature()` 활성 (`SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false`). arologis = 자체 `signatures` INSERT, slip-service = `slips.signature_source=APP` + `slip_signature_audit` 적재. 출고전표 본체 (Slip) 는 slip-service 단일 source of truth (update 만) | 변경 없음 |
| D-DF-02 | 사본 형식 = **PNG** (출고전표 양식 사본 + 서명 2개 합성) | OutboundView 시각 그대로 |
| D-DF-03 | **사본 발송 채널 = mobile RN expo-sharing 일반 Share Sheet** (카톡/SMS, 기사 본인 계정 발신). Aligo / notification-service 호출 0 | v3 변경 — Aligo 폐기 |
| D-DF-04 | 사본 1회 제한 = arologis `Signature.copy_sent_at` (PNG download 시각 기준). NULL → 호출 OK, NOT NULL → 409. 재발송은 Admin 후속 PR | "성공 1회" 정의 = download 1회 |
| D-DF-05 | 인수자 번호 = slip-service `recipientPhoneNumber` (Phase A SlipRef, arologis VehicleStop 매핑). null/잘못된 형식 → 서명 OK + 사본 skip + reason | 차단 X |
| D-DF-06 | **PNG 합성 = arologis-service in-process Playwright Java SDK + Chromium headless → `OutboundView.tsx` URL 렌더링 → PNG 캡처** | v3 변경 — 서버 단일 출처, drift 0 |
| D-DF-07 | 사본 endpoint = arologis `POST /driver-app/.../sign-and-send-copy` (1-tap UX). Response = PNG byte[] (응답 바디) 또는 `GET .../copy-png` 분리 (plan 결정) | 1-tap |
| D-DF-08 | 권한 = ROLE_AROLOGIS_DRIVER + 서비스 레이어 `JWT.driverId == dispatch.driverId` 검증 (Phase A/C 패턴 일관) | 보안 강화 명시 |
| D-DF-09 | PII = recipientPhoneNumber 응답/로그/UI 마스킹 (`010-****-1234`), DB/audit 풀 번호 보관 (Admin 재발송용) | Aligo audit 의미 약화 (v3) |
| D-DF-10 | PNG 보관 = disk path (`/var/lib/arologis/signature-copies/{signatureId}.png`, env `AROLOGIS_SIGNATURE_COPY_DIR`). Phase 11 AWS 이전 시 S3 키로 갈아탐 | Admin 재발송용 |
| D-DF-11 | PNG 양식 사이즈 = A4 portrait, ~600×850 px viewport (OutboundView 의 `a4-portrait` variant 디자인) | 가독성 + 1MB 이내 |
| D-DF-12 | mobile Share API = **`expo-sharing`** (RN Expo 표준). 카톡/SMS Share Sheet OS 표준. 인수자 번호 화면 표시 ("010-****-5678 에게 보내세요"). 사용자가 카톡 friend / SMS 수신자 선택 | KakaoLink SDK 의존 X |
| D-DF-13 | **배송 완료 증거 사진 (DELIVERY) 사전 첨부** = 기존 `SignaturePhotoScreen` 인프라 활용 (P1-8 Stage 4 완료, batchToken 기반 public 업로드, 1MB 자동 압축, 최대 3장). W10-4 deep link 활성 — `SignaturePhotoScreen.onUploaded` → `DriverSignatureScreen` navigation chain. 사진은 slip-service attachment 로만 저장 (사본 PNG 와 분리, Admin/거래처 분쟁 증빙용) | 신규 |

---

## 3. 전체 아키텍처 (v3)

```
[arologis-mobile (RN Expo)]
  서명 캡처 (자신 + 인수자)
  → POST .../sign-and-send-copy
        │ JSON: { driverSignatureBase64, recipientSignatureBase64, capturedAt, gpsLat, gpsLng }
        ▼
[arologis-service]
  Tx1 [보상 트랜잭션 — 서명 정보 양쪽 저장]:
       a. arologis 자체 signatures 테이블 INSERT (Spring @Transactional, savepoint)
          — 배차/기사 도메인 운영 사본 (서명 PNG 2장 byte[] 또는 imageRef)
       b. slip-service POST /internal/slips/{slipId}/signatures (PR #99 활성, RestClient timeout 5s)
          — slip-service 가 Slip.signature_source = APP 갱신 + slip_signature_audit INSERT
          (출고전표 본체는 이미 존재, signature 상태만 update)
       → b 5xx/timeout 시 arologis 로컬 savepoint rollback → 422 SIGNATURE_BRIDGE_FAILED + retryable: true
       → 본 단계까지 OK 여야 Tx2 진행 (사본 PNG 합성/발송은 별도 단계)

  Tx2 [best effort — 사본 합성 + 보관]:
       c. Playwright Chromium → file:///app/print-renderer/index.html?slipNo=...&driverSig=...&recipientSig=... 렌더 (1024ms timeout)
       d. PNG byte[] → disk 저장 ({signatureId}.png)
       e. Signature.copy_image_path = path
       f. 응답 200 = PNG byte[] (image/png) 또는 { copyPngUrl }
       g. Signature.copy_sent_at = now (응답 직전 set, 응답 = download 시각으로 간주, 1회 가드)
       → c/d fail 시 응답 200 (Content-Type: application/json) with copyFailureReason + copy_send_failure_count++ + copy_sent_at 미설정 (사용자 같은 endpoint 재호출 OK)
        │
        ▼
[arologis-mobile]
  PNG byte[] 수신 → expo-sharing Share Sheet 자동 호출
  → 사용자 (기사) 가 카톡 선택 → 인수자 친구 선택 → 전송
  또는 SMS 선택 → 인수자 번호 입력 → 전송
        │
        ▼
[인수자 카톡 / SMS] 출고전표 양식 사본 + 서명 2개 (발신자 = 기사 본인)
```

---

## 4. 데이터 모델

### arologis `signature` column 추가 (Flyway V11)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| copy_sent_at | TIMESTAMP NULL | "성공 1회 가드" = PNG download 시각. NULL → 호출 OK, NOT NULL → 409 |
| copy_send_failure_count | INT NOT NULL DEFAULT 0 | 모니터링 alert 임계치용 (Tx2 c/d 단계 fail 카운트) |
| copy_image_path | VARCHAR(255) NULL | disk path. Phase 11 cutover 시 S3 키로 갈아탐 (마이그레이션 별도 PR) |
| copy_recipient_phone | VARCHAR(20) NULL | 발송 시점 slip recipientPhoneNumber 스냅샷 (운영 변경 대비, 풀 번호) |

slip-service 영향 0 — PR #99 의 V10 `slips.signature_source = APP` 이미 지원.

### slip-service 측 신규 column 0 (PR #99 의 변경 그대로 활성).

---

## 5. API

### 신규 — arologis `POST /driver-app/.../sign-and-send-copy`

```
POST /driver-app/arologis/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy
Headers: Authorization: Bearer <driver JWT (ROLE_AROLOGIS_DRIVER)>
Content-Type: application/json
Body:
{
  "driverSignatureBase64": "iVBOR...",
  "recipientSignatureBase64": "iVBOR...",
  "capturedAt": "2026-05-14T14:30:00+09:00",
  "gpsLat": 37.4979,
  "gpsLng": 127.0276
}

Response 200 (성공 — 서명 양쪽 저장 + PNG 합성 OK):
Content-Type: image/png
Headers: X-Signature-Id, X-Slip-Bridged: true, X-Copy-Sent-At, X-Copy-Recipient-Phone-Masked: 010-****-5678
Body: <PNG bytes (~200~800KB)>

Response 200 (서명 OK + 사본 skip — 인수자 번호 없음):
Content-Type: application/json
{
  "signatureId": "uuid",
  "slipBridged": true,
  "copySent": false,
  "copyFailureReason": "RECIPIENT_PHONE_MISSING"
}

Response 200 (서명 OK + 사본 합성 fail — 사용자 retry 가능):
Content-Type: application/json
{
  "signatureId": "uuid",
  "slipBridged": true,
  "copySent": false,
  "copyFailureReason": "RENDERER_TIMEOUT" | "RENDERER_ERROR" | "STORAGE_FULL"
}

Response 409 (이미 download 완료 — Admin 재발송 후속 PR):
Content-Type: application/json
{
  "error": "COPY_ALREADY_SENT",
  "previousCopySentAt": "2026-05-14T14:30:00+09:00"
}

Response 422 (Tx1 atomic 실패 — 양쪽 저장 중 1 fail):
Content-Type: application/json
{
  "error": "SIGNATURE_BRIDGE_FAILED",
  "retryable": true,
  "reason": "SLIP_SERVICE_TIMEOUT" | "ROLE_FORBIDDEN" | ...
}
```

**대안 endpoint 분리 (plan 단계 결정)**:
- `POST .../sign` (서명만, JSON 응답) + `GET .../signatures/{id}/copy-png` (PNG 별도) —  REST 정통.
- 또는 단일 endpoint 다중 Content-Type (`Accept: image/png` vs `Accept: application/json`).
- 본 spec 은 **단일 `sign-and-send-copy` + Content-Type 분기** 추천 (1-tap mobile 흐름 단순).

### notification-service 호출 0 (v3 변경)

Aligo client / kakao-image endpoint 호출 제거. notification-service 변경 없음.

---

## 6. PNG 합성 (D-DF-06) — 서버측 Playwright Chromium

### 토폴로지: arologis-service in-process

- **arologis-service Docker 이미지**에 Playwright Java SDK (`com.microsoft.playwright:playwright`) + Chromium 동봉 (`mvn ... playwright install chromium`)
- 한글 폰트: Dockerfile 에 `apt-get install -y fonts-noto-cjk` (Noto Sans CJK KR)
- 신규 service 추가 X (YAGNI). 향후 PNG/PDF 합성 needs 가 2건 이상 누적되면 `signature-renderer-service` 분리 검토

### print-renderer 정적 빌드

- `clients/desktop/src/renderer/print/OutboundView.tsx` 의 `a4-portrait` variant 를 **별도 entry** 로 빌드 (Vite multi-entry):
  - `clients/desktop/print-renderer/index.html` (entry, query param 으로 데이터 주입)
  - `clients/desktop/print-renderer/main.tsx` (query param 파싱 → mock QueryClient 또는 OutboundView refactor 후 props 주입 → render. router/useQuery 의존 제거)
- **OutboundView 데이터 주입 방식 (plan 결정)**: (a) OutboundView 자체를 props 기반으로 refactor (useQuery 분리) 후 print-renderer 에서 props 직접 주입 — drift 0 추천. (b) 현 OutboundView 유지 + print-renderer 가 mock QueryClient + 가짜 API mock 으로 데이터 주입 — refactor 0 이지만 깨지기 쉬움
- 빌드 결과 = 정적 HTML + JS + CSS bundle
- arologis-service Docker 이미지에 `print-renderer/` 디렉토리 동봉 (multi-stage build, `npm run build:print-renderer` 산출물)
- Playwright = `chromium.newPage().goto("file:///app/print-renderer/index.html?slipNo=SL-001&driverSig=base64&recipientSig=base64&...")` → `page.screenshot({ fullPage: true, type: "png" })`

### 데이터 주입 query param

| param | 용도 |
|---|---|
| `slipNo` | 출고전표 번호 |
| `slipDate` | 발행일 |
| `partnerName` | 거래처명 |
| `recipientAddress` | 배송지 |
| `lines` | base64-encoded JSON array (품목/수량/단가/금액) |
| `totalSupply`, `vat`, `total` | 합계 (사전 계산) |
| `sourceWarehouseName` | 출고 창고 |
| `driverSig`, `recipientSig` | 서명 PNG base64 |
| `capturedAt`, `gps` | 서명 시각/위치 (footer 표시) |

데이터 양이 큰 경우 (lines 길면) → POST 방식 변경 (Playwright `page.evaluate` 로 window 객체 주입) 또는 임시 파일 — plan 단계 결정.

### 양식 사이즈 (D-DF-11)

- Playwright viewport = `{ width: 600, height: 850 }` (A4 portrait scaled)
- `OutboundView` 의 `a4-portrait` paper class 그대로 적용
- 결과 PNG 약 200~800KB (한글 + 서명 2개 포함)

### 메모리/CPU

- Chromium per-request ~150MB heap. arologis-service Java heap (~2GB) + Chromium (~500MB pool) → m5.xlarge 16GB 여유 충분
- Playwright `BrowserContext` 풀 재사용 (request 마다 page 만 새로 — context reuse). 동시 발송 ~3 tile.

---

## 7. UI 흐름 (v3 변경)

### mobile-staff 흐름 갱신 (W10-4 deep link 활성)

```
[정차 도착 — SignaturePhotoScreen]
  사진 첨부 toggle ON → DELIVERY 유형 → 사진 1~3장 → 일괄 업로드
  → onUploaded callback → DriverSignatureScreen navigate (deep link)
        ▼
[DriverSignatureScreen]
  자신 + 인수자 서명 → [완료 + 사본 발송] → POST sign-and-send-copy
```

기존 (W10-3) — 자신 + 인수자 서명 → POST `/sign` (사진 별도 화면)
신규 — 사진 첨부 → 서명 → POST `/sign-and-send-copy` → PNG 받기 → expo-sharing Share Sheet 자동 호출

```
┌─ SignatureScreen ──────────────────────────────┐
│  SL-001 대구공조                                │
│  ┌──────────────┐ ┌──────────────┐            │
│  │ 기사 서명    │ │ 인수자 서명  │            │
│  └──────────────┘ └──────────────┘            │
│                                                │
│  인수자: 010-****-5678                         │
│  [완료 + 사본 발송]                            │
└────────────────────────────────────────────────┘

→ 탭 시:
  1. 양쪽 저장 + PNG 합성 (서버, ~2~3초)
  2. PNG byte[] 수신
  3. expo-sharing Share Sheet 자동 호출 ("○○○ 기사님이 사본을 보냅니다")
  4. 사용자가 카톡/SMS 선택 → 인수자 선택/입력 → 전송
```

### 토스트 케이스

- **성공 (PNG 수신 + Share Sheet 표시)**: "서명 저장 완료. Share Sheet 에서 인수자 (010-****-5678) 에게 보내세요"
- **사본 fail (서명만 OK)**: "서명 저장 완료. 사본 합성 실패 ({reason}) — [재시도]"
- **번호 없음**: "서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요"
- **이미 발송됨**: "이미 발송된 사본입니다 (2026-05-14 14:30). Admin 재발송이 필요하면 사무실에 요청"

### Share Sheet 동작 (D-DF-12)

```typescript
// arologis-mobile/src/screens/SignatureScreen.tsx (의사 코드)
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const pngBytes = await api.signAndSendCopy(...);  // arraybuffer 또는 base64
const localUri = `${FileSystem.cacheDirectory}signature-copy-${signatureId}.png`;
await FileSystem.writeAsStringAsync(localUri, pngBase64, { encoding: 'base64' });

if (await Sharing.isAvailableAsync()) {
  await Sharing.shareAsync(localUri, {
    mimeType: 'image/png',
    dialogTitle: `${recipientName} 님에게 출고전표 사본 보내기`,
    UTI: 'public.png',
  });
}
```

- 카톡 미설치 → SMS / 이메일 / 갤러리 저장 옵션 자동 표시 (OS Share Sheet)
- 카카오 디벨로퍼 등록 0 (KakaoLink SDK 미사용)
- 향후 KakaoLink deep link (인수자 번호 prefill) 도입은 별도 PR
- **Trade-off**: 인수자가 기사 카톡 친구 아닌 경우 카톡 옵션 선택 시 "전화번호로 친구 추가" 단계 추가 (사용자 수동). SMS 폴백이 더 자연. 본 PR 후 사용자 피드백 수집 후 KakaoLink deep link 도입 우선순위 결정

---

## 8. 테스트 + 롤백

### 단위 (~18 case)

- `SignAndSendCopyService` (~7) — Tx1/Tx2 분리, retry 정책, 1회 가드, RECIPIENT_PHONE_MISSING/RENDERER_TIMEOUT/STORAGE_FULL 분기
- `PlaywrightCopyRenderer` (~5) — query param 인코딩, viewport, fullPage screenshot, fail timeout, 한글 폰트 렌더 검증
- `Signature.markCopySent()` (~3) — copy_sent_at NULL→ NOT NULL, 409 가드
- `CopyImageDiskStorage` (~3) — path 생성, 디스크 가용 검사, 파일명 충돌 방지

### IT (~6 case, Docker 가용)

- `SignAndSendCopyIT` — endpoint round trip (서명 양쪽 저장 + PNG 응답 200, image/png header)
- `SignatureCopyDuplicateIT` — 두 번째 호출 → 409
- `SignatureCopyMissingPhoneIT` — slip recipientPhoneNumber=null → 200 with RECIPIENT_PHONE_MISSING
- `SignatureCopyRendererTimeoutIT` — Playwright timeout mock → 200 with RENDERER_TIMEOUT, copy_send_failure_count++
- `SignatureCopyAtomicFailIT` — slip-service 5xx mock → 422 SIGNATURE_BRIDGE_FAILED, arologis Signature 도 미저장 (롤백)
- 회귀 PR #99 `SignatureIntegrationIT` — `/sign` deprecate 후에도 기존 IT 통과 확인 (`@Deprecated` 만, 동작 보존)

### FE (~6 case)

- SignatureScreen — 서명 캡처 + POST + PNG 수신 + Share Sheet 호출
- 사본 fail toast (RENDERER_TIMEOUT) + 재시도 버튼
- RECIPIENT_PHONE_MISSING toast
- 409 toast
- Share Sheet OS dialog mock (Android/iOS)
- 인수자 번호 마스킹 표시 (UI)

### QA 시나리오 (6, **QA sequential**)

1. 기사 어플 → 서명 캡처 → [완료 + 사본 발송] → 양쪽 저장 + PNG 응답 + Share Sheet
2. 카톡 선택 → 인수자 friend 선택 → 인수자 카톡에 PNG 도착 (시각 검증, 출고전표 양식 + 서명 2개)
3. 두 번째 호출 → 409 + Admin 재발송 안내 toast
4. 인수자 번호 null mock → 서명 OK + RECIPIENT_PHONE_MISSING toast
5. Playwright timeout (chromium suspend) → RENDERER_TIMEOUT + copy_send_failure_count = 1
6. 회귀 PR #99 `/sign` deprecated 호출 → 기존 동작 (LINK source 0 결함)

**QA sequential**: BE/FE/Designer/DevOps 완료 후 dispatch → 실 BE/FE 산출 검증 + 실 화면 캡처 ([[feedback_qa_sequential_after_be_fe]]).
- 실 PNG 시각 검증 = `OutboundView` 의 a4-portrait 와 시각 일치 + 한글 글자 깨짐 없음 (Noto Sans CJK KR)
- 실 Share Sheet 캡처 = Android/iOS 에뮬레이터 또는 실 기기

### 롤백 (4 단계, ~80분)

1. **FE 회수** — SignatureScreen 의 sign-and-send-copy 호출을 PR #99 `/sign` 으로 되돌리기 (20분)
2. **arologis 회수** — sign-and-send-copy endpoint + Service + PlaywrightCopyRenderer + CopyImageDiskStorage + Signature column 추가 사용 제거 (30분)
3. **Flyway V11 DROP** — copy_sent_at, copy_send_failure_count, copy_image_path, copy_recipient_phone DROP (10분)
4. **Docker 이미지 재배포** — Playwright/Chromium/fonts-noto-cjk 제거된 이전 이미지로 (20분)

---

## 9. 5-team 디스패치 (새 패턴 — QA sequential)

| Team | scope | 시점 |
|---|---|---|
| **BE** | arologis SignAndSendCopyService + PlaywrightCopyRenderer + CopyImageDiskStorage + endpoint + Signature 4 column 추가 + V11 + slip-service registerSignature 활성. 단위 ~18 + IT ~6 | **1차 parallel** |
| **FE** | arologis-mobile SignatureScreen — POST + PNG 수신 + expo-sharing Share Sheet + 마스킹 표시 + 토스트 5종 + 재시도 버튼. **`expo-sharing` 의존 추가** | **1차 parallel** |
| **Designer** | (a) SignatureScreen 갱신 mock 1장 + (b) Share Sheet OS dialog mock 1장 + (c) `clients/desktop/print-renderer/` 정적 entry 양식 검증 (OutboundView a4-portrait 그대로 사용) | **1차 parallel** |
| **DevOps** | Dockerfile 갱신 — Playwright Java SDK + Chromium 설치 + `fonts-noto-cjk` apt-install + `print-renderer/` 정적 디렉토리 동봉 + `AROLOGIS_SIGNATURE_COPY_DIR` env. **Phase 11 m5.xlarge 메모리 검증 노트** + **`SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false` 활성** | **1차 parallel** |
| **QA** | 6 시나리오 + 실 BE/FE 산출 검증 + 실 PNG 캡처 (양식 + 한글) + 실 Share Sheet 캡처 (Android/iOS 에뮬) + 회귀 | **2차 sequential** |
| **TM** | merge + 컴파일/회귀 + 문서 동기화 + PR 발행 | TM |
| **PM** | CI watch + GitGuardian + 머지 요청 | PM |

---

## 10. 메모리 + 후속

### 신규 메모리

- `.claude/memory/project_samhan_signature_copy.md` — Phase F 결정 (D-DF-01~12) + 새 QA sequential 첫 적용 결과 + Aligo 미사용 결정 근거

### DECISIONS

- `D-DF-01~12` (12 entry, 신규)

### 후속 PR (별도 spec)

- **Phase B** — arologis `InsungQuickDriverMatcher` 실 활성 (인성 자료 도착 후)
- **Phase D** — GPS SSE (인성 LBS callback)
- **Phase E** — 인수자 카톡/문자 발송 (배차 기사 정보) — notification-service Aligo (다른 시나리오)
- **Admin 재발송** — `/admin/.../signatures/{id}/resend-copy` endpoint (disk path 의 PNG 또는 재합성 → Aligo 회사 대표번호 발송 또는 Share 링크 생성). 본 PR 후 우선순위 결정.
- **KakaoLink SDK 도입** — 인수자 번호 prefill 카톡 deep link (사용자 피드백 후 검토)
- **`/sign` endpoint 제거** — `@Deprecated` 마킹 후 1~2 분기 후 제거 (PR #99 의 IT 도 함께 정리)

---

## 11. 참조

- [[project_samhan_dispatch_board]] / [[project_samhan_dispatch_modification]] (Phase A/C)
- [[feedback_qa_sequential_after_be_fe]] (새 패턴, 본 Phase 첫 적용)
- [[feedback_print_design_iteration]] (인쇄 양식 iteration 의무 — print-renderer 빌드 시 Edge 캡처 검증)
- [[feedback_uuid_no_user_visibility]] (인수자 번호 마스킹 일관)
- [[feedback_continuous_docs_sync]] (PR 본문에 README/ROADMAP/dev-report 동기화)
- [[feedback_pr_qa_screenshots]] (QA 스크린샷 PR 본문 인라인)
- [[feedback_korean_commits]] (한국어 commit/PR/Issue)
- [[feedback_arologis_extract_autopilot]] (자율 진행 권한)
- PR #99 (slip-service signature 통합, 핵심 의존)
- `clients/desktop/src/renderer/print/OutboundView.tsx` (양식 단일 출처)
- `clients/desktop/src/renderer/print/PrintLayout.tsx` (PaperSize, krw, krDate, calcAmounts 공유)

---

## 12. v3 변경 이력 (브레인스토밍 12 weak spot 해소)

| weak spot | v1/v2 | v3 결정 |
|---|---|---|
| W1 partial fail | 정의 X | **C — 서명 atomic + 사본 best effort + retry** |
| W2 1회 제한 정의 | 모호 | "성공 1회" = PNG download 시각 (`copy_sent_at`) |
| W3 Aligo | 알림톡+MMS 폴백 | **폐기 — mobile Share Sheet** |
| W4 한글 폰트 | (변동) | Chromium Docker 에 `fonts-noto-cjk` apt-install |
| W5 인수자 번호 없음 | 정의 X | 서명 OK + 사본 skip + RECIPIENT_PHONE_MISSING reason |
| W6 endpoint 양립 | 정의 X | `/sign-and-send-copy` 단독 + PR #99 `/sign` `@Deprecated` |
| W7-a 권한 | 정의 X | ROLE_AROLOGIS_DRIVER + 서비스 driverId 검증 |
| W7-b PNG 콘텐츠 | "기사 정보" 모호 | 출고전표 양식 사본 (OutboundView 단일 출처) + 서명 2개 |
| W7-c 마스킹 위치 | 정의 X | 응답/로그/UI 마스킹 / DB·audit 풀 번호 |
| D-DF-06 합성 방식 | BufferedImage | **서버 Playwright Chromium → OutboundView URL 렌더 (in-process, arologis-service)** |
| W8 PNG 보관 | 정의 X | disk path, Phase 11 S3 cutover |
| W9 양식 사이즈 | 800×1200 | A4 portrait ~600×850 (OutboundView a4-portrait) |
| W10 업로드 형식 | (v3 변경) | mobile 업로드 X (서버가 합성, 응답 PNG byte[]) |
| W11 Share API | (신규) | `expo-sharing` 일반 Share Sheet (KakaoLink SDK 미사용) |
| W12 1회 가드 시점 | (신규) | PNG download 시각 (mobile confirm 불필요) |
| W13 사진 첨부 통합 | (사용자 추가 요구) | 기존 SignaturePhotoScreen + W10-4 deep link 활성. DELIVERY 사진은 slip-service attachment 별도, 사본 PNG 와 분리 |
