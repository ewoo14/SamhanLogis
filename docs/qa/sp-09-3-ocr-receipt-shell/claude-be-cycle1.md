# SP-09-3 OCR Receipt Shell — BE Review (Claude, Cycle 1)

> 브랜치: `feat/sp-09-3-ocr-receipt-shell` commit `b0428441`
> 리뷰 날짜: 2026-05-18
> 리뷰어: Claude BE Agent

---

## 검증 항목 체크리스트

| # | 검증 항목 | 결과 | 비고 |
|---|---|---|---|
| B1 | BaseEntity 7 audit + Soft Delete 상속 | PASS | Slip 은 BaseEntity 상속 — 신규 entity 없으므로 직접 해당 없음 |
| B2 | 도메인 메서드 chain — Slip.createInbound 활용 | PASS | ReceiptOcrParseService 에서 직접 setter 없이 createInbound 호출 |
| B3 | REQUIRES_NEW audit 별도 bean | PASS | ReceiptOcrAuditRecorder @Component + Propagation.REQUIRES_NEW |
| B4 | placeholder 4 키워드 case-insensitive 차단 | PASS | isPlaceholderKey 에서 toLowerCase(Locale.ROOT) 적용 |
| B5 | 권한 SP-03 §4.2 (WAREHOUSE/MANAGER/MASTER) | PASS | @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')") |
| B6 | 422 HTTP status (RECEIPT_FILE_INVALID) | PASS | HttpStatus.UNPROCESSABLE_ENTITY 매핑 확인 |
| B7 | 502 HTTP status (OCR_SUBMIT_FAILED) | PASS | HttpStatus.BAD_GATEWAY 매핑 확인 |
| B8 | 한국어 Javadoc — interface/service/controller | PASS | 모든 신규 파일 한국어 Javadoc 구비 |
| B9 | UUID 비공개 — ReceiptParseResponse 에 slipId 미포함 | PASS | 응답 DTO 에 slipNo (비즈니스 식별자) 만 포함 |
| B10 | nil UUID destinationWarehouseId 처리 | PASS (WARN) | 00000000-... nil UUID 사용; createInbound null guard 통과 |
| B11 | ContentType null 파일 422 거부 | FAIL | contentType null 이면 ALLOWED_CONTENT_TYPES 검사 skip |
| B12 | originalFilename null 파일 확장자 거부 | FAIL | originalFilename null 이면 확장자 검사 skip |
| B13 | ReceiptParseRequest 활용 여부 | WARN | DTO 생성했으나 Controller 에서 @RequestParam 직접 사용 — 미활용 |
| B14 | Case 8 REQUIRES_NEW audit IT 정확성 | WARN | @Transactional IT 에서 REQUIRES_NEW 커밋 row 가 테스트 후 DB 에 잔류 (오염 가능성) |
| B15 | Flyway 마이그레이션 영향 없음 확인 | PASS | OCR shell 은 신규 테이블 없이 기존 slips / slip_audit_logs 재활용 |
| B16 | CLOVA mode Phase 11 TODO 명시 | PASS | submitClova 에 TODO(Phase 11) 주석 및 예외 로직 명확 |

---

## 결함 목록

### CRITICAL

없음.

### HIGH

#### H1 — contentType null / originalFilename null 시 파일 검증 우회 가능

**파일**: `ReceiptOcrController.java` L136~149

```java
// 현재
if (contentType != null && !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
    throw new BusinessException(...);
}
if (originalFilename != null) {
    // 확장자 검사
}
```

**문제**: `MultipartFile.getContentType()` 가 null 이면 ALLOWED_CONTENT_TYPES 검사 pass.
`getOriginalFilename()` 가 null 이면 확장자 검사 전체 skip. 테스트 클라이언트나
Content-Type 헤더 미설정 요청이 pdf/bmp 등 비지원 포맷을 통과시킬 수 있다.

**권장 fix**:
```java
// contentType null → 허용하지 않은 것으로 처리
String contentType = file.getContentType();
if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
    throw new BusinessException(ErrorCode.RECEIPT_FILE_INVALID,
            "지원하지 않는 파일 형식입니다. jpg/png 이미지만 허용합니다.");
}
// filename null → 허용하지 않은 것으로 처리
String originalFilename = file.getOriginalFilename();
if (originalFilename == null || originalFilename.isBlank()) {
    throw new BusinessException(ErrorCode.RECEIPT_FILE_INVALID,
            "파일명이 없습니다. 유효한 영수증 이미지를 업로드하세요.");
}
```

---

### MEDIUM

#### M1 — ReceiptParseRequest DTO 미활용 (dead code)

**파일**: `web/dto/ReceiptParseRequest.java`

Controller 가 `@RequestParam(value = "submitMethod", required = false) String submitMethod` 으로
직접 파라미터를 받아 `ReceiptParseRequest` 가 전혀 사용되지 않는다.
`@Pattern(regexp = "DRY_RUN|CLOVA")` 유효성 검사도 동작하지 않는다.

**권장 fix**: Controller 에서 `@Valid @ModelAttribute ReceiptParseRequest request` 방식으로 교체
또는 DTO를 제거하고 submitMethod 파라미터에 직접 `@Pattern` 적용.

#### M2 — Case 8 @Transactional IT + REQUIRES_NEW audit 잔류 가능성

**파일**: `ReceiptOcrShellIT.java` L67, L300~332

클래스 레벨 `@Transactional` → 테스트 종료 후 rollback. 그러나 REQUIRES_NEW로
이미 커밋된 audit row는 rollback 대상이 아니라 DB에 잔류할 수 있다.
다음 테스트 실행 시 `auditLogRepository.findAll()` 결과에 이전 테스트 데이터가 포함될 수 있어
Case 7/8 의 slipId 기반 필터 로직이 다른 IT 실행 환경에서 flaky 해질 수 있다.

**권장 fix**: Case 8 에서 `auditLogRepository.deleteAll()` 을 @BeforeEach 에 추가하거나,
findAll() 대신 slipId 기반 조회를 직접 구현해 isolation 보장.

---

### LOW

#### L1 — submitMethod fallback 로직 이중화

**파일**: `ReceiptOcrParseService.java` L117

```java
return new ReceiptParseResponse(
    ...,
    submitMethod != null && !submitMethod.isBlank() ? submitMethod : "DRY_RUN",
    ...
);
```

실제 사용된 `effectiveMethod` 가 아닌 원본 `submitMethod` 파라미터 기준으로 응답에 반환.
서버 property fallback 동작 시 응답의 `submitMethod` 가 null 또는 blank 로 표시될 수 있다.

**권장 fix**: `effectiveMethod` 를 서비스 내 로컬 변수로 유지하고 응답에 반환.

#### L2 — extractBytes IOException RuntimeException 래핑

**파일**: `ReceiptOcrParseService.java` L151~156

IOException → `RuntimeException` 으로 래핑 시 500 Internal Server Error 반환.
Spring ExceptionHandler 에서 `RuntimeException` 에 대한 처리가 없으면 클라이언트에게 500이 노출된다.

**권장 fix**: `BusinessException(RECEIPT_FILE_INVALID, ...)` 으로 래핑하여 422 반환.

---

## 종합

- **CRITICAL 0건, HIGH 1건, MEDIUM 2건, LOW 2건**
- H1 (contentType/filename null bypass) 은 보안 관련 유효성 우회 가능성으로 cycle 2 fix 권장
- M1 (ReceiptParseRequest dead code) 은 비기능적이지만 혼란 유발 — fix 권장
- 도메인 메서드, REQUIRES_NEW 패턴, 권한, 에러 코드 HTTP 매핑 모두 정상
