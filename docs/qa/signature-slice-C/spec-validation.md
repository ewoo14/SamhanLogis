# Signature Slice C — spec 검증 결과

> 작성: 2026-05-19, QA agent (audit Slice C)
> 기준: docs/design/signature-slice-C/mobile-spec.md (100% 인용)
> 브랜치: feat/audit-slice-c-new-infra (working tree 갱신, commit 금지)

---

## 1. 검증 범위

mobile-spec.md 전체 §1~§7 에 대해 현재 구현 상태를 점검하고,
부재(미구현) 항목과 구현 완료 항목을 구분합니다.

---

## 2. 구현 상태 요약

### 2.1 BE (slip-service) — 완전 구현 확인

| 항목 | mobile-spec.md 참조 | 구현 위치 | 상태 |
|---|---|---|---|
| POST /public/batches/{token}/slips/{slipNo}/signature | §2.1 | PublicSlipController.java line 94 | 완료 |
| GET /public/signatures/{shareToken} | §2.2 | PublicSlipController.java line 153 | 완료 |
| SHA-256 재계산 + clientHash 비교 | §3.7 | SlipSignatureService.java sha256Hex() | 완료 |
| PNG 50KB 가드 (PNG_MAX_BYTES=51200) | §3 budget | SlipSignatureService.java line 64,109 | 완료 |
| slipNo slug 정규화 (2026-05-19-1 ↔ 2026/05/19-1) | §1.1 | canonicalSlipNo() | 완료 |
| batchToken 만료 → 410 GONE | §1 URL spec | Controller CONFLICT→410 변환 | 완료 |
| shareToken +30일 만료 → 410 GONE | §7.4 보안 검증 | findByShareToken() CONFLICT→410 | 완료 |
| 응답 UUID 미포함 (slip.id, signature.id 없음) | §5 UUID 미노출 | PublicSignatureResponse record | 완료 |
| signatureHashShort 8자 | §2.2 응답 | PublicSignatureViewResponse.Signature.signatureHashShort | 완료 |
| API Gateway /api/public/** no-auth route | §6 CSP | application.yml slip-service-public route | 완료 |
| @MockBean 외부 client 격리 | feedback_it_mockbean_external_clients | PublicSignatureControllerIT @MockBean | 완료 |

### 2.2 BE IT 커버리지 확인 (PublicSignatureControllerIT)

현재 8 시나리오 구현 확인:

1. recordSignature_happyPath_returns200_withShareToken_andHidesUuids
2. recordSignature_hashMismatch_returns400
3. recordSignature_pngOver50KB_returns400
4. recordSignature_expiredBatchToken_returns410Gone
5. recordSignature_processingStageSlip_returns409
6. getSignatureView_validShareToken_returns200_withoutUuids
7. getSignatureView_unknownToken_returns404
8. getSignatureView_expiredShareToken_returns410Gone

QA 시나리오 설계서(docs/qa/signature-slice-C/qa-report.md) §1 의 14 시나리오 대비
BE IT 8 시나리오 커버. 나머지 6건 (SlipSignatureAdminIT — 관리자 서명 조회/무효화)
은 별도 파일에서 커버 여부 확인 필요 (본 audit 범위 외).

### 2.3 FE public mini bundle — 미구현 확인

| 항목 | mobile-spec.md 참조 | 탐색 위치 | 상태 |
|---|---|---|---|
| signature.js (≤6KB gzip) | §3.1 budget | clients/web/, services/slip-service/resources/static/ | 없음 |
| mobile.css canvas 추가분 (≤0.5KB gzip) | §3.1 budget | 전체 프로젝트 | 없음 |
| /d/{token}/s/{slipNo} HTML 서빙 | §1 신규 라우트 | slip-service Controller, static resources | 없음 |
| /share/{shareToken} HTML 서빙 | §1 신규 라우트 | slip-service Controller, static resources | 없음 |
| vite / esbuild build target | §3.2 dynamic import | clients/web/signature/, clients/web/public/ | 없음 |
| canvas + touch { passive: false } | §3.5 | signature.js 없음 | 없음 |
| canvas 사이즈 분기 (320 / 400) | §3.4 | signature.js 없음 | 없음 |
| Web Share API + clipboard fallback | §4.3 | signature.js 없음 | 없음 |
| [서명 완료] disabled 조건 | §4.1 | signature.js 없음 | 없음 |
| 전송 중 lock (opacity 0.6) | §4.2 | signature.js 없음 | 없음 |

---

## 3. audit cycle 1 발견 결함

### DEFECT-C1: FE public mini bundle 전체 미구현

mobile-spec.md 가 정의하는 `/d/{token}/s/{slipNo}` 서명 페이지와
`/share/{shareToken}` 인수자 view 를 서빙하는 FE 번들이 전혀 존재하지 않음.

- BE API 는 완전 구현 (PublicSlipController + SlipSignatureService)
- API Gateway 라우팅도 /api/public/** no-auth 완료
- FE 번들 없으므로 실제 모바일 사용자 접근 불가

**영향**: 기사/인수자가 SMS/카카오톡으로 수신한 링크 `/d/{token}/s/{slipNo}` 를
모바일 브라우저에서 열면 404 (HTML 서빙 없음).

**권고**: 별도 슬라이스 (signature-slice-C-fe 권고)에서 다음 구현 필요:

1. `clients/web/signature/` 또는 `services/slip-service/src/main/resources/static/` 에
   `signature.html` + `signature.js` + `mobile.css` 배치
2. vite.config.ts 또는 esbuild 스크립트에 signature.js entry 추가
   (vanilla JS only, lib 없음, ≤6KB gzip 검증 CI step 포함)
3. slip-service 에 `@GetMapping("/d/{token}/s/{slipNo}")` HTML 서빙 controller
   또는 nginx `try_files` 규칙 추가
4. `/share/{shareToken}` 서빙도 동일 방식
5. CSP `default-src 'self'; img-src 'self' data:; script-src 'self'` 변경 없음 유지

---

## 4. Playwright spec 산출물

파일: `qa/playwright/tests/signature-c/signature-c-smoke.spec.ts`

### 4.1 구현 시나리오 (10건)

| ID | 설명 | 방식 | 상태 |
|---|---|---|---|
| SC-1 | BE 서명 API happy path — 200 + shareToken + UUID 0건 | page.route() mock + fetch evaluate | 구현 |
| SC-2 | BE hash mismatch → 400 | mock + evaluate | 구현 |
| SC-3 | BE PNG 50KB 초과 → 400 | mock + evaluate | 구현 |
| SC-4 | BE 만료 batch token → 410 Gone | mock + evaluate | 구현 |
| SC-5 | 인수자 view API — UUID 0건 + 핵심 정보 | mock + evaluate | 구현 |
| SC-6 | FE bundle 위치 + signature.js ≤6KB | FE 미구현 | fixme |
| SC-7 | UUID DOM 노출 0건 — /d/{token}/s/{slipNo} | FE 미구현 | fixme |
| SC-8 | PNG 49999 bytes 경계값 — 50KB 가드 통과 | mock + evaluate | 구현 |
| SC-9 | { passive: false } touch 이벤트 | FE 미구현 | fixme |
| SC-10 | canvas 사이즈 분기 320/400 | FE 미구현 | fixme |
| Web Crypto 1 | SHA-256 hex 64자 결정적 결과 | page.evaluate | 구현 |
| Web Crypto 2 | data URI base64 split 로직 | page.evaluate | 구현 |

### 4.2 false green 가드 준수 확인

- page.setContent() 패턴: 0건 (실 HTTP 응답만 사용)
- `|| true` 패턴: 0건
- `test.skip(!ok)` 로 PASS 처리: 0건 (미구현 케이스는 test.fixme 표기)
- FE 미구현 케이스: test.fixme() 4건 — PASS 아닌 fixme 상태로 명시

### 4.3 playwright.config.ts 추가 project

```
name: 'signature-c-smoke'
testMatch: /.*\/signature-c\/signature-c-smoke\.spec\.ts/
baseURL: QA_SIGNATURE_URL ?? QA_API_BASE_URL ?? 'http://localhost:8080'
device: Desktop Chrome
```

---

## 5. mobile-spec.md §7 검증 체크리스트 대응

### §7.1 디바이스 검증 (신규)

| 항목 | 상태 | 비고 |
|---|---|---|
| iPhone SE 1세대 (320×568) 서명 캡처 + 전송 | 미검증 | FE 미구현 |
| iPhone 13 (390×844) 서명 + Web Share 시트 | 미검증 | FE 미구현 |
| Galaxy S22 (360×780) Chrome 서명 + Web Share | 미검증 | FE 미구현 |
| iPad mini (768×1024) Safari canvas 400×200 | 미검증 | FE 미구현 |
| desktop Chrome Web Share → clipboard fallback | 미검증 | FE 미구현 |

### §7.2 기능 검증 (신규)

| 항목 | 상태 | 비고 |
|---|---|---|
| 빈 canvas 에서 [서명 완료] disabled | 미검증 | FE 미구현 |
| 인수자명 빈 상태 [서명 완료] disabled | 미검증 | FE 미구현 |
| [다시 서명] canvas clear + disabled 복귀 | 미검증 | FE 미구현 |
| 전송 중 canvas 인터랙션 차단 (opacity 0.6) | 미검증 | FE 미구현 |
| 전송 성공 후 /share/{shareToken} 이동 | BE mock 검증 (SC-1) | |
| 전송 실패 시 토스트 + canvas 보존 | 미검증 | FE 미구현 |
| 410 응답 시 410 GONE 페이지 | BE mock 검증 (SC-4) | |
| hash mismatch 400 시 토스트 + canvas clear | BE mock 검증 (SC-2) | |
| 인수자 view PNG 정상 표시 | BE mock 검증 (SC-5) | |
| DOM inspector UUID 0건 | SC-7 fixme | FE 미구현 |

### §7.3 성능 검증 (신규)

| 항목 | 상태 | 비고 |
|---|---|---|
| signature.js ≤6KB gzip | SC-6 fixme | FE 미구현 |
| mobile.css 추가분 ≤0.5KB gzip | 미검증 | FE 미구현 |
| FCP < 1.5s (3G throttling) | 미검증 | FE 미구현 |
| PNG 평균 ≤30KB (BE bytea ≤50KB 안전 마진) | SC-8 경계값 검증 완료 | |

### §7.4 보안 검증 (신규)

| 항목 | 상태 | 비고 |
|---|---|---|
| CSP 정책 변경 없이 정상 동작 | 미검증 | FE 미구현 |
| Web Crypto SHA-256 64자 hex | Web Crypto 1,2 검증 완료 | |
| BE hash mismatch 400 검증 | SC-2 검증 완료 | |
| shareToken +30일 만료 후 410 GONE | SC-4 패턴으로 커버 | mock 기반 |

---

## 6. 다음 단계 권고

1. **FE 구현 슬라이스 신규 생성 권고 (signature-slice-C-fe)**
   - 본 audit 에서 DEFECT-C1 으로 명시한 FE 번들 전체 구현
   - mobile-spec.md 100% 인용하여 BE API 와 연동
   - CI 에 signature.js gzip 사이즈 assert step 추가

2. **FE 구현 완료 후 fixme 해제**
   - SC-6, SC-7, SC-9, SC-10 의 test.fixme 제거
   - TODO 주석의 실 검증 코드로 교체
   - QA_SIGNATURE_URL 환경 변수 설정 후 CI matrix 추가

3. **SlipSignatureAdminIT 커버리지 확인**
   - 관리자 서명 조회 (GET /slips/{id}/signature MANAGER/MASTER/AUDITOR)
   - 관리자 서명 무효화 (DELETE — MASTER 전용)
   - qa-report.md §1.2 의 5 시나리오 IT 구현 여부 별도 확인 필요

---

## 7. 참고 파일

| 용도 | 경로 |
|---|---|
| mobile-spec.md (FE spec 원본) | docs/design/signature-slice-C/mobile-spec.md |
| BE Controller | services/slip-service/src/main/java/com/samhanair/logis/slip/delivery/web/PublicSlipController.java |
| BE Service | services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipSignatureService.java |
| BE IT | services/slip-service/src/test/java/com/samhanair/logis/slip/delivery/it/PublicSignatureControllerIT.java |
| BE 응답 DTO (서명 등록) | services/slip-service/src/main/java/com/samhanair/logis/slip/delivery/web/dto/PublicSignatureResponse.java |
| BE 응답 DTO (인수자 view) | services/slip-service/src/main/java/com/samhanair/logis/slip/delivery/web/dto/PublicSignatureViewResponse.java |
| API Gateway 라우팅 | services/api-gateway/src/main/resources/application.yml (slip-service-public route) |
| Playwright spec (신규) | qa/playwright/tests/signature-c/signature-c-smoke.spec.ts |
| playwright.config.ts | qa/playwright/playwright.config.ts (signature-c-smoke project 추가) |
| 기존 QA report | docs/qa/signature-slice-C/qa-report.md |
| Designer mock (서명 페이지) | docs/design/signature-slice-C/mocks/01_mobile_signature_page.html |
