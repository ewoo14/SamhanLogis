# Samhan Public 전자서명 양쪽 저장 + PNG 사본 1회 발송 (Phase F) — 설계서

> 작성일: 2026-05-14
> Phase A (PR #188) + C (PR #189) 머지 후. Phase B, D 는 인성데이타 API 링크 도착 대기.
> **새 QA sequential 패턴 첫 적용** ([[feedback_qa_sequential_after_be_fe]]).

---

## 1. 배경 / 목적

기사 어플 (arologis-mobile) 전자서명 흐름 완성:
- 기사님이 어플에서 전표 클릭 → 자신 + 인수자 서명 캡처
- 자동으로 **arologis + Samhan Public 양쪽 저장** (PR #99 의 skeleton-mode false 활성)
- 서명 완료 시 **인수자 번호로 PNG 사본 1회 발송** (rate limit)

기존 인프라 활용:
- PR #99 의 `SlipClient.registerSignature()` (arologis → slip-service)
- arologis `Signature` entity (PR #99 시점 통합)
- notification-service Aligo

**비목표**: 인성데이타 (Phase B), GPS SSE (Phase D), 인수자 기사 정보 카톡 (Phase E).

---

## 2. 10 핵심 결정 (D-DF-00~09)

| # | 결정 |
|---|---|
| D-DF-01 | 전자서명 양쪽 저장 = PR #99 `SlipClient.registerSignature()` 활성 (`SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false`) |
| D-DF-02 | 사본 형식 = **PNG** (사용자 확정 2026-05-14, 카톡 단일 이미지) |
| D-DF-03 | 사본 발송 채널 = notification-service Aligo (본 시스템 알림, 인성 알림톡 별도) |
| D-DF-04 | 사본 1회 제한 = arologis `Signature.copy_sent_at` column + 중복 호출 시 409 |
| D-DF-05 | 인수자 번호 = slip-service `recipientPhoneNumber` (Phase A SlipRef 에 포함, arologis VehicleStop 매핑) |
| D-DF-06 | PNG 합성 = Java `BufferedImage` + `Graphics2D` (외부 의존 0, ~800×1200) |
| D-DF-07 | 사본 발송 endpoint = arologis `POST /driver-app/.../sign-and-send-copy` (서명 완료 + 1-tap UX) |
| D-DF-08 | 권한 = ROLE_AROLOGIS_DRIVER. Admin 측 수동 재 발송 = 후속 PR |
| D-DF-09 | PII = recipientPhoneNumber 마스킹 (`010-****-1234`) + Aligo audit log |

---

## 3. 전체 아키텍처

```
[기사 어플 (arologis-mobile)]
  서명 캡처 (자신 + 인수자) → POST .../sign-and-send-copy
        │
        ▼
[arologis-service]
  1. Signature 저장
  2. slip-service POST /internal/slip/signatures (PR #99 활성)
  3. PNG 합성 (BufferedImage)
  4. notification-service Aligo POST (kakao-image, multipart)
  5. Signature.copy_sent_at = now (1회 제한)
        │
        ▼
[인수자 카톡] PNG 즉시 확인
```

---

## 4. 데이터 모델

### arologis `signature` column 추가 (Flyway V11)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| copy_sent_at | TIMESTAMP NULL | 1회 제한 가드 |
| copy_send_failure_count | INT NOT NULL DEFAULT 0 | retry 0, admin 수동 재 발송 후속 |

slip-service 영향 0 — PR #99 의 V10 `slips.signature_source = APP` 이미 지원.

---

## 5. API

### 신규 — arologis

```
POST /driver-app/arologis/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy
Headers: Authorization: Bearer <driver JWT>
Body:
{
  "driverSignatureBase64": "iVBOR...",
  "recipientSignatureBase64": "iVBOR...",
  "capturedAt": "2026-05-14T14:30:00+09:00",
  "gpsLat": 37.4979,
  "gpsLng": 127.0276
}
Response 200: { signatureId, slipBridged, copySent, copySentAt }
Response 409 (중복): { error: COPY_ALREADY_SENT, previousCopySentAt }
```

### notification-service Aligo (기존 또는 신규)

```
POST http://notification-service:8093/internal/notifications/aligo/kakao-image
Headers: X-Internal-Token
Body: multipart (phoneNumber + imagePng + message)
```

---

## 6. PNG 합성 (Java BufferedImage)

`SignatureCopyPngRenderer` (~800×1200 px, Malgun Gothic 한글 폰트 fallback):
- 헤더: 전표번호 + 거래처
- 본문: 주소 + 배송 메모 + 기사 정보
- 서명: 기사 + 인수자 PNG 합성 (각 350×200)
- 푸터: 발송 시각

외부 라이브러리 의존 0 (Java 표준).

---

## 7. UI 흐름

### arologis-mobile SignatureScreen 갱신

기존 (W10-3) — 자신 + 인수자 서명 → POST `/sign`
신규 — POST `/sign-and-send-copy` (자동 발송 포함)

```
┌─ SignatureScreen ──────────────────────────────┐
│  SL-001 대구공조                                │
│  ┌──────────────┐ ┌──────────────┐            │
│  │ 기사 서명    │ │ 인수자 서명  │            │
│  └──────────────┘ └──────────────┘            │
│                                                │
│  ☑ 사본을 인수자 (010-****-5678) 에게 발송    │
│  [완료 + 사본 발송]                            │
└────────────────────────────────────────────────┘
```

toast: "서명 저장 + 사본 발송 완료" 또는 "이미 발송됨".

---

## 8. 테스트 + 롤백

### 단위 (~15 case)
- `SignAndSendCopyService` (~6) / `SignatureCopyPngRenderer` (~4) / `Signature.markCopySent()` (~3) / Aligo client mock (~2)

### IT (~5 case, Docker 가용)
- `SignAndSendCopyIT` / `SignatureCopyDuplicateIT` / 회귀 PR #99 `SignatureIntegrationIT`

### FE (~5 case)
- SignatureScreen 의 사본 발송 체크박스 + toast

### QA 시나리오 (6, **QA sequential**)
1. 기사 어플 → 서명 캡처
2. [완료 + 사본 발송] → 양쪽 저장 + 인수자 카톡
3. 중복 → 409
4. Aligo fail Mock → 미 발송
5. 회귀 PR #99 LINK source 0 결함
6. PNG 시각 검증 (한글 + 합성)

**QA sequential**: BE/FE/Designer/DevOps 완료 후 dispatch → 실 산출 검증 + 실 화면 캡처.

### 롤백 (3 단계)
1. FE 회수 (20분)
2. arologis 회수 (sign-and-send-copy endpoint + Service + Renderer, 30분)
3. Flyway V11 DROP (10분)

---

## 9. 5-team 디스패치 (새 패턴 첫 적용)

| Team | scope | 시점 |
|---|---|---|
| **BE** | arologis SignAndSendCopyService + Renderer + endpoint + Signature column + V11 + notification-service Aligo client. 단위 ~15 + IT ~5 | **1차 parallel** |
| **FE** | arologis-mobile SignatureScreen — 사본 발송 체크박스 + toast + 1-tap UX | **1차 parallel** |
| **Designer** | 1 mock (SignatureScreen 사본 UI + PNG 합성 예시) | **1차 parallel** |
| **DevOps** | `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false` 환경변수 + Aligo endpoint URL | **1차 parallel** |
| **QA** | 6 시나리오 + **실 BE/FE 산출 검증 + 실 화면 캡처** + 회귀 | **2차 sequential** |
| **TM** | merge + 컴파일/회귀 + 문서 동기화 + PR | TM |
| **PM** | CI watch + 머지 요청 | PM |

---

## 10. 메모리 + 후속

- `.claude/memory/project_samhan_signature_copy.md` (신규)
- DECISIONS `D-DF-00~09` (10 entry)

**후속**: Phase B / D (인성 자료 도착) / Phase E (인수자 기사 정보 카톡) / Admin 측 수동 재 발송 / D-AX-11~13

---

## 11. 참조

- [[project_samhan_dispatch_board]] / [[project_samhan_dispatch_modification]] (Phase A/C)
- [[feedback_qa_sequential_after_be_fe]] (새 패턴, 본 Phase 첫 적용)
- PR #99 (slip-service signature 통합, 핵심 의존)
- [[feedback_pr_qa_screenshots]] / [[feedback_korean_commits]] / [[feedback_arologis_extract_autopilot]]
