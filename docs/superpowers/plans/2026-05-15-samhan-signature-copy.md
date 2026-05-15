# Samhan Public 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (Phase F) — 구현 plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **새 5-team 패턴 첫 적용** ([[feedback_qa_sequential_after_be_fe]]) — BE/FE/Designer/DevOps **4 parallel** + **QA sequential** (실 BE/FE 산출 검증 + 실 화면 캡처).

**Goal:** 기사 어플 (mobile-staff) — **정차 도착 시 DELIVERY 사진 첨부** (기존 SignaturePhotoScreen + 1MB 압축 + 최대 3장, D-DF-13) → DriverSignatureScreen navigation chain (W10-4 deep link 활성) → 자체+인수자 서명 캡처 → arologis-service 가 양쪽 저장 (자체 signatures + slip-service signature_source=APP) + 출고전표 양식 사본 PNG 합성 (서버 Playwright Chromium → OutboundView URL 렌더) + mobile expo-sharing Share Sheet 으로 인수자에게 발송 (기사 본인 카톡, Aligo 0). 사진은 slip-service attachment 로만 별도 저장 (사본 PNG 와 분리).

**Architecture:** arologis-service 신규 3 service (SignAndSendCopyService + PlaywrightCopyRenderer + CopyImageDiskStorage) + Signature 4 column 추가 (V11) + endpoint 1 + Playwright Java SDK + Chromium in-process. clients/desktop 의 OutboundView.tsx 를 Vite multi-entry 별도 빌드 (`clients/desktop/print-renderer/`) → arologis-service Docker 에 정적 동봉. mobile-staff DriverSignatureScreen 갱신 (POST + image/png 응답 + expo-sharing). slip-service `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false` 활성.

**Tech Stack:** Spring Boot 3 / Java 17 / PostgreSQL (Flyway V11) / Playwright Java SDK 1.47 + Chromium / Vite multi-entry / React 19 / RN Expo (mobile-staff) + expo-sharing + expo-file-system / Docker (fonts-noto-cjk apt) / GitHub Actions.

**참조 spec:** `docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md` (v3, 12 결정 D-DF-01~12).

**branch:** `feat/samhan-signature-copy-spec` (spec branch 그대로 사용 또는 `feat/samhan-signature-copy` 신규 — TM 결정).

---

## 팀 디스패치 구조 (5-team, QA sequential)

| 팀 | scope | 핵심 산출 | 시점 |
|---|---|---|---|
| **BE** | arologis SignAndSendCopyService + PlaywrightCopyRenderer + CopyImageDiskStorage + endpoint + Signature 4 column + V11 + slip-service 호출 활성. 단위 ~18 + IT ~6 | `services/arologis-service/**` | 1차 parallel |
| **FE** | mobile-staff (a) DriverSignatureScreen 갱신 — POST + image/png 응답 + expo-sharing + 5 토스트 + 재시도, (b) **SignaturePhotoScreen → DriverSignatureScreen W10-4 deep link 활성 (D-DF-13)**. expo-sharing/expo-file-system 추가 | `clients/mobile-staff/**` | 1차 parallel |
| **Designer** | 3 mock (`docs/uiux/samhan-signature-copy/`) — SignatureScreen 1-tap UI / Share Sheet Android / Share Sheet iOS | `docs/uiux/samhan-signature-copy/**` | 1차 parallel |
| **DevOps** | Dockerfile (Playwright + Chromium + fonts-noto-cjk + print-renderer/) + AROLOGIS_SIGNATURE_COPY_DIR env + SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false + Phase 11 메모리 검증 노트 + clients/desktop multi-entry print-renderer 빌드 | `infrastructure/**`, `clients/desktop/vite.config.ts`, `clients/desktop/print-renderer/`, `services/arologis-service/Dockerfile` | 1차 parallel |
| **QA** | 6 시나리오 + 실 BE/FE 산출 검증 + 실 PNG 캡처 (출고전표 양식 + 한글) + 실 Share Sheet 캡처 (Android/iOS 에뮬) + 회귀 ~98 절차 + 4단계 롤백 runbook | `docs/qa/samhan-signature-copy/**` | **2차 sequential** (BE+FE merge 후) |
| **TM** | merge + 컴파일/회귀 + 문서 동기화 + PR 발행 + GitGuardian | `migration/decisions/DECISIONS.md`, README, ROADMAP, dev-report | TM |
| **PM** | CI watch + 머지 요청 | (없음, 절차) | PM |

---

# Team 1: BE — arologis-service

## 파일 구조

```
services/arologis-service/
├── build.gradle                                                  (수정 — Playwright 의존성)
├── Dockerfile                                                    (NEW or 수정 — Playwright + Chromium + fonts-noto-cjk + print-renderer/)
├── src/main/java/com/samhanair/logis/arologis/
│   ├── domain/
│   │   └── Signature.java                                        (수정 — 4 column + markCopySent + markCopyFailure)
│   ├── service/copy/
│   │   ├── SignAndSendCopyService.java                           (NEW — Tx1 atomic + Tx2 best effort orchestration)
│   │   ├── PlaywrightCopyRenderer.java                           (NEW — Playwright Java SDK wrapper)
│   │   ├── CopyImageDiskStorage.java                             (NEW — disk path 저장)
│   │   └── CopyFailureReason.java                                (NEW — enum: RECIPIENT_PHONE_MISSING, RENDERER_TIMEOUT, RENDERER_ERROR, STORAGE_FULL, ALIGO_TEMPORARY_FAIL retain for compat)
│   ├── controller/
│   │   └── ArologisDriverAppController.java                      (수정 — POST /sign-and-send-copy 추가, 기존 /sign 은 @Deprecated)
│   ├── client/
│   │   └── SlipClient.java                                       (수정 없음 — 기존 registerSignature 활용)
│   ├── web/dto/copy/
│   │   ├── SignAndSendCopyRequest.java                           (NEW — JSON body)
│   │   └── SignAndSendCopyResponse.java                          (NEW — JSON 변형 응답)
│   └── config/
│       └── PlaywrightConfig.java                                 (NEW — Browser + BrowserContext bean, lifecycle)
├── src/main/resources/
│   ├── application.yml                                           (수정 — playwright.copy + signature-copy storage)
│   └── db/migration/
│       └── V11__add_signature_copy_columns.sql                   (NEW)
└── src/test/java/com/samhanair/logis/arologis/
    ├── service/copy/
    │   ├── SignAndSendCopyServiceTest.java                       (NEW — ~7 unit)
    │   ├── PlaywrightCopyRendererTest.java                       (NEW — ~5 unit, Playwright fake)
    │   └── CopyImageDiskStorageTest.java                         (NEW — ~3 unit)
    ├── domain/SignatureCopyTest.java                             (NEW — ~3 unit, markCopySent + 가드)
    └── it/
        ├── SignAndSendCopyIT.java                                (NEW — endpoint round trip)
        ├── SignatureCopyDuplicateIT.java                         (NEW — 409 가드)
        ├── SignatureCopyMissingPhoneIT.java                      (NEW — RECIPIENT_PHONE_MISSING)
        ├── SignatureCopyRendererTimeoutIT.java                   (NEW — Playwright timeout)
        └── SignatureCopyAtomicFailIT.java                        (NEW — slip-service 5xx → 422 + arologis rollback)
```

---

## BE Task B1: Signature entity 4 column 추가 + Flyway V11

**Files:**
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/Signature.java`
- Create: `services/arologis-service/src/main/resources/db/migration/V11__add_signature_copy_columns.sql`
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/domain/SignatureCopyTest.java`

- [ ] **B1.1 — Flyway V11 작성**

```sql
-- V11__add_signature_copy_columns.sql
-- Phase F (D-DF-04, D-DF-09, D-DF-10) — 출고전표 사본 PNG 1회 발송 가드 + 보관 + 인수자 번호 스냅샷.

ALTER TABLE signatures
    ADD COLUMN copy_sent_at TIMESTAMP NULL,
    ADD COLUMN copy_send_failure_count INT NOT NULL DEFAULT 0,
    ADD COLUMN copy_image_path VARCHAR(255) NULL,
    ADD COLUMN copy_recipient_phone VARCHAR(20) NULL;

COMMENT ON COLUMN signatures.copy_sent_at IS '출고전표 사본 PNG download 시각 (성공 1회 가드, NULL → 호출 OK, NOT NULL → 409)';
COMMENT ON COLUMN signatures.copy_send_failure_count IS 'Tx2 c/d 단계 fail 카운트 (모니터링 alert 임계치용)';
COMMENT ON COLUMN signatures.copy_image_path IS '디스크 저장 경로 (env AROLOGIS_SIGNATURE_COPY_DIR + {signatureId}.png), Phase 11 cutover 시 S3 키로 갈아탐';
COMMENT ON COLUMN signatures.copy_recipient_phone IS '발송 시점 slip recipientPhoneNumber 스냅샷 (운영 변경 대비, 풀 번호)';
```

- [ ] **B1.2 — Signature entity 4 column 추가**

```java
// Signature.java — 기존 fields 아래 추가
@Column(name = "copy_sent_at")
private LocalDateTime copySentAt;

@Column(name = "copy_send_failure_count", nullable = false)
private int copySendFailureCount = 0;

@Column(name = "copy_image_path", length = 255)
private String copyImagePath;

@Column(name = "copy_recipient_phone", length = 20)
private String copyRecipientPhone;

/**
 * 사본 PNG download 직전 호출 — 성공 1회 가드 set.
 *
 * @param imagePath 디스크 path
 * @param recipientPhone 발송 시점 인수자 번호 스냅샷
 * @throws IllegalStateException 이미 copySentAt set (중복 호출)
 */
public void markCopySent(String imagePath, String recipientPhone) {
    if (this.copySentAt != null) {
        throw new IllegalStateException("이미 사본 발송 완료 — copySentAt=" + this.copySentAt);
    }
    if (imagePath == null || imagePath.isBlank()) {
        throw new IllegalArgumentException("imagePath 필수");
    }
    this.copySentAt = LocalDateTime.now();
    this.copyImagePath = imagePath;
    this.copyRecipientPhone = recipientPhone;
}

/** Tx2 c/d 단계 fail 시 카운트 증분 (copySentAt 미설정 — 재시도 가능). */
public void markCopyFailure() {
    this.copySendFailureCount++;
}

/** 1회 가드 readonly check. */
public boolean isCopySent() {
    return this.copySentAt != null;
}
```

- [ ] **B1.3 — SignatureCopyTest 단위 테스트 작성 (3 case)**

```java
package com.samhanair.logis.arologis.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SignatureCopyTest {

    private Signature newAppSignature() {
        return Signature.of(UUID.randomUUID(), SignatureSource.APP, "image-ref",
                LocalDateTime.now(), new BigDecimal("37.4979"), new BigDecimal("127.0276"));
    }

    @Test
    void markCopySent_set_path_phone_and_now() {
        Signature sig = newAppSignature();
        sig.markCopySent("/var/lib/arologis/signature-copies/abc.png", "01012345678");

        assertThat(sig.getCopySentAt()).isNotNull();
        assertThat(sig.getCopyImagePath()).isEqualTo("/var/lib/arologis/signature-copies/abc.png");
        assertThat(sig.getCopyRecipientPhone()).isEqualTo("01012345678");
        assertThat(sig.isCopySent()).isTrue();
    }

    @Test
    void markCopySent_twice_throws_IllegalStateException() {
        Signature sig = newAppSignature();
        sig.markCopySent("/var/lib/arologis/signature-copies/abc.png", "01012345678");

        assertThatThrownBy(() -> sig.markCopySent("/another.png", "01099999999"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 사본 발송 완료");
    }

    @Test
    void markCopyFailure_increment_count_no_sent_set() {
        Signature sig = newAppSignature();
        sig.markCopyFailure();
        sig.markCopyFailure();

        assertThat(sig.getCopySendFailureCount()).isEqualTo(2);
        assertThat(sig.getCopySentAt()).isNull();
        assertThat(sig.isCopySent()).isFalse();
    }
}
```

- [ ] **B1.4 — 단위 테스트 실행 (Docker 무관, H2)**

Run: `gradlew :services:arologis-service:test --tests "*SignatureCopyTest*"`
Expected: 3 PASS

- [ ] **B1.5 — 커밋**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/Signature.java \
        services/arologis-service/src/main/resources/db/migration/V11__add_signature_copy_columns.sql \
        services/arologis-service/src/test/java/com/samhanair/logis/arologis/domain/SignatureCopyTest.java
git commit -m "feat(samhan-signature-copy/be): Signature 4 column 추가 + Flyway V11 + markCopySent 단위 3건 (D-DF-04/09/10)"
```

---

## BE Task B2: CopyFailureReason enum + CopyImageDiskStorage

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/CopyFailureReason.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/CopyImageDiskStorage.java`
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/copy/CopyImageDiskStorageTest.java`

- [ ] **B2.1 — CopyFailureReason enum**

```java
package com.samhanair.logis.arologis.service.copy;

/**
 * 사본 PNG 합성/저장/응답 실패 사유 — Phase F (D-DF-05/06/10).
 *
 * <p>응답 200 + JSON 형태로 반환되며, 사용자가 같은 endpoint 재호출 가능 (copy_sent_at 미설정).
 * RECIPIENT_PHONE_MISSING 만 Tx2 진입 전 분기, 나머지는 Tx2 c/d 단계 실패.
 */
public enum CopyFailureReason {
    /** slip recipientPhoneNumber == null 또는 blank. */
    RECIPIENT_PHONE_MISSING,
    /** Playwright Chromium 렌더 timeout (config: playwright.copy.timeout-ms). */
    RENDERER_TIMEOUT,
    /** Playwright 기타 오류 (Chromium crash, page eval 실패). */
    RENDERER_ERROR,
    /** disk 저장 실패 (디스크 가득, 권한 등). */
    STORAGE_FULL
}
```

- [ ] **B2.2 — CopyImageDiskStorage 작성**

```java
package com.samhanair.logis.arologis.service.copy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 사본 PNG 디스크 저장 — Phase F (D-DF-10).
 *
 * <p>경로: {AROLOGIS_SIGNATURE_COPY_DIR}/{signatureId}.png
 * Phase 11 AWS 이전 시 S3 키로 갈아탐 (마이그레이션 별도 PR).
 */
@Slf4j
@Component
public class CopyImageDiskStorage {

    private final Path baseDir;

    public CopyImageDiskStorage(@Value("${arologis.signature-copy.dir:/var/lib/arologis/signature-copies}") String dir) {
        this.baseDir = Paths.get(dir);
    }

    /**
     * PNG byte[] 저장 후 절대 경로 반환.
     *
     * @param signatureId 서명 UUID (파일명 prefix)
     * @param png PNG byte[]
     * @return 절대 경로 String (Signature.copy_image_path 에 저장)
     * @throws IOException 디렉토리 생성/파일 쓰기 실패
     */
    public String save(UUID signatureId, byte[] png) throws IOException {
        Files.createDirectories(baseDir);
        Path filePath = baseDir.resolve(signatureId + ".png");
        Files.write(filePath, png);
        log.debug("사본 PNG 저장 — signatureId={}, path={}, size={} bytes",
                signatureId, filePath, png.length);
        return filePath.toAbsolutePath().toString();
    }

    /** Admin 재발송 후속 PR 용 — 현재 PR 에서는 미호출, getter 만. */
    public Path getBaseDir() {
        return baseDir;
    }
}
```

- [ ] **B2.3 — CopyImageDiskStorageTest 작성 (3 case)**

```java
package com.samhanair.logis.arologis.service.copy;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CopyImageDiskStorageTest {

    @Test
    void save_creates_directory_and_writes_png(@TempDir Path tempDir) throws IOException {
        CopyImageDiskStorage storage = new CopyImageDiskStorage(tempDir.toString());
        UUID id = UUID.randomUUID();
        byte[] png = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47};

        String path = storage.save(id, png);

        assertThat(path).endsWith(id + ".png");
        assertThat(Files.exists(Path.of(path))).isTrue();
        assertThat(Files.readAllBytes(Path.of(path))).isEqualTo(png);
    }

    @Test
    void save_baseDir_does_not_exist_creates_it(@TempDir Path tempDir) throws IOException {
        Path nestedDir = tempDir.resolve("sub/nested");
        CopyImageDiskStorage storage = new CopyImageDiskStorage(nestedDir.toString());

        storage.save(UUID.randomUUID(), new byte[]{0x01});

        assertThat(Files.isDirectory(nestedDir)).isTrue();
    }

    @Test
    void getBaseDir_returns_configured_dir(@TempDir Path tempDir) {
        CopyImageDiskStorage storage = new CopyImageDiskStorage(tempDir.toString());
        assertThat(storage.getBaseDir()).isEqualTo(tempDir);
    }
}
```

- [ ] **B2.4 — 단위 테스트 실행**

Run: `gradlew :services:arologis-service:test --tests "*CopyImageDiskStorageTest*"`
Expected: 3 PASS

- [ ] **B2.5 — 커밋**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/CopyFailureReason.java \
        services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/CopyImageDiskStorage.java \
        services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/copy/CopyImageDiskStorageTest.java
git commit -m "feat(samhan-signature-copy/be): CopyFailureReason enum + CopyImageDiskStorage 단위 3건 (D-DF-10)"
```

---

## BE Task B3: Playwright 의존성 + PlaywrightConfig + PlaywrightCopyRenderer

**Files:**
- Modify: `services/arologis-service/build.gradle`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/PlaywrightConfig.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/PlaywrightCopyRenderer.java`
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/copy/PlaywrightCopyRendererTest.java`
- Modify: `services/arologis-service/src/main/resources/application.yml`

- [ ] **B3.1 — build.gradle 에 Playwright Java SDK 추가**

`build.gradle` 의 `dependencies {` 블록에 추가 (한국어 주석으로 위 line 위에):

```groovy
    // Phase F (D-DF-06) — 출고전표 양식 사본 PNG 합성. OutboundView URL → headless Chromium → PNG.
    // Chromium browser binary 는 Docker 빌드 시 `playwright install chromium` 로 동봉.
    implementation 'com.microsoft.playwright:playwright:1.47.0'
```

- [ ] **B3.2 — application.yml 에 Playwright + storage 설정 추가**

`services/arologis-service/src/main/resources/application.yml` 의 적절한 위치 (samhan: 또는 신규 arologis: 블록):

```yaml
arologis:
  signature-copy:
    dir: ${AROLOGIS_SIGNATURE_COPY_DIR:/var/lib/arologis/signature-copies}
  playwright:
    copy:
      # print-renderer 정적 빌드 file:// 경로 (Docker COPY 동봉)
      base-url: ${AROLOGIS_PRINT_RENDERER_URL:file:///app/print-renderer/index.html}
      # 단일 페이지 렌더 timeout (Chromium goto + load 완료까지)
      timeout-ms: ${AROLOGIS_PLAYWRIGHT_TIMEOUT_MS:8000}
      viewport-width: 600
      viewport-height: 850
```

- [ ] **B3.3 — PlaywrightConfig — Browser bean lifecycle**

```java
package com.samhanair.logis.arologis.config;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Playwright;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Phase F (D-DF-06) — Playwright Chromium browser singleton bean.
 *
 * <p>arologis-service 시작 시 1회 launch, shutdown 시 close. context/page 는 호출마다 신규
 * (PlaywrightCopyRenderer 가 try-with-resources 로 lifecycle 관리).
 *
 * <p>Chromium binary 는 Docker 빌드 시 동봉 (Dockerfile 의 `playwright install chromium`).
 * 본 bean 은 binary 가 없으면 launch 실패 — DevOps team 의 Dockerfile 갱신 의무.
 */
@Slf4j
@Configuration
public class PlaywrightConfig {

    private Playwright playwright;
    private Browser browser;

    @Bean
    public Browser playwrightBrowser() {
        this.playwright = Playwright.create();
        this.browser = playwright.chromium().launch(
                new BrowserType.LaunchOptions()
                        .setHeadless(true)
                        .setArgs(java.util.List.of("--no-sandbox", "--disable-dev-shm-usage")));
        log.info("Playwright Chromium 시작 — headless, no-sandbox");
        return this.browser;
    }

    @PreDestroy
    public void shutdown() {
        if (browser != null) {
            browser.close();
        }
        if (playwright != null) {
            playwright.close();
        }
        log.info("Playwright Chromium 종료");
    }
}
```

- [ ] **B3.4 — PlaywrightCopyRenderer 작성**

```java
package com.samhanair.logis.arologis.service.copy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.PlaywrightException;
import com.microsoft.playwright.options.ScreenshotType;
import com.microsoft.playwright.options.ViewportSize;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 출고전표 양식 사본 PNG 합성 — Phase F (D-DF-06).
 *
 * <p>흐름: print-renderer file:// URL + slip 데이터 + 서명 2개 base64 query param → Chromium goto →
 * fullPage screenshot (PNG byte[]) 반환.
 *
 * <p>OutboundView 의 a4-portrait variant 그대로 사용 (clients/desktop/print-renderer/ 별도 entry 빌드).
 * 양식 변경 시 print-renderer 재빌드 → Docker 이미지 재배포 (drift 0).
 */
@Slf4j
@Component
public class PlaywrightCopyRenderer {

    private final Browser browser;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final int timeoutMs;
    private final int viewportWidth;
    private final int viewportHeight;

    public PlaywrightCopyRenderer(
            Browser browser,
            ObjectMapper objectMapper,
            @Value("${arologis.playwright.copy.base-url}") String baseUrl,
            @Value("${arologis.playwright.copy.timeout-ms}") int timeoutMs,
            @Value("${arologis.playwright.copy.viewport-width}") int viewportWidth,
            @Value("${arologis.playwright.copy.viewport-height}") int viewportHeight) {
        this.browser = browser;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
    }

    /**
     * 슬립 데이터 + 서명 2개로 출고전표 사본 PNG 합성.
     *
     * @param slipData slipNo / slipDate / partnerName / recipientAddress / lines (List of Map) /
     *                 totalSupply / vat / total / sourceWarehouseName / capturedAt / gpsLat / gpsLng
     * @param driverSignatureBase64 기사 서명 PNG base64
     * @param recipientSignatureBase64 인수자 서명 PNG base64
     * @return PNG byte[] (~200~800KB)
     * @throws RendererTimeoutException Chromium goto/screenshot timeout (D-DF-06 timeout-ms 초과)
     * @throws RendererErrorException Chromium 기타 오류
     */
    public byte[] render(Map<String, Object> slipData,
                         String driverSignatureBase64,
                         String recipientSignatureBase64) {
        try (BrowserContext context = browser.newContext()) {
            context.setDefaultTimeout(timeoutMs);
            try (Page page = context.newPage()) {
                page.setViewportSize(viewportWidth, viewportHeight);

                String url = buildUrl(slipData, driverSignatureBase64, recipientSignatureBase64);
                page.navigate(url);
                page.waitForLoadState();  // network idle

                return page.screenshot(new Page.ScreenshotOptions()
                        .setFullPage(true)
                        .setType(ScreenshotType.PNG));
            } catch (PlaywrightException ex) {
                if (ex.getMessage() != null && ex.getMessage().toLowerCase().contains("timeout")) {
                    log.warn("Playwright timeout — slipNo={}, msg={}", slipData.get("slipNo"), ex.getMessage());
                    throw new RendererTimeoutException(ex.getMessage(), ex);
                }
                throw new RendererErrorException(ex.getMessage(), ex);
            }
        } catch (PlaywrightException ex) {
            throw new RendererErrorException(ex.getMessage(), ex);
        }
    }

    private String buildUrl(Map<String, Object> slipData,
                             String driverSig, String recipientSig) {
        try {
            String slipJson = objectMapper.writeValueAsString(slipData);
            String slipB64 = Base64.getUrlEncoder().encodeToString(slipJson.getBytes(StandardCharsets.UTF_8));
            return baseUrl
                    + "?slip=" + slipB64
                    + "&driverSig=" + URLEncoder.encode(driverSig, StandardCharsets.UTF_8)
                    + "&recipientSig=" + URLEncoder.encode(recipientSig, StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new RendererErrorException("URL 인코딩 실패: " + ex.getMessage(), ex);
        }
    }

    /** Playwright 호출 timeout 시 (Tx2 c 단계 fail). */
    public static class RendererTimeoutException extends RuntimeException {
        public RendererTimeoutException(String msg, Throwable cause) { super(msg, cause); }
    }

    /** Playwright 기타 오류 (Chromium crash 등). */
    public static class RendererErrorException extends RuntimeException {
        public RendererErrorException(String msg, Throwable cause) { super(msg, cause); }
    }
}
```

- [ ] **B3.5 — PlaywrightCopyRendererTest 단위 (5 case, Browser fake)**

```java
package com.samhanair.logis.arologis.service.copy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.PlaywrightException;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PlaywrightCopyRendererTest {

    private Browser browser;
    private BrowserContext context;
    private Page page;
    private PlaywrightCopyRenderer renderer;

    @BeforeEach
    void setUp() {
        browser = mock(Browser.class);
        context = mock(BrowserContext.class);
        page = mock(Page.class);
        when(browser.newContext()).thenReturn(context);
        when(context.newPage()).thenReturn(page);
        renderer = new PlaywrightCopyRenderer(browser, new ObjectMapper(),
                "file:///app/print-renderer/index.html", 8000, 600, 850);
    }

    @Test
    void render_returns_screenshot_bytes() {
        byte[] expected = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47};
        when(page.screenshot(any(Page.ScreenshotOptions.class))).thenReturn(expected);

        byte[] actual = renderer.render(
                Map.of("slipNo", "SL-001", "partnerName", "대구공조"),
                "driver-base64", "recipient-base64");

        assertThat(actual).isEqualTo(expected);
    }

    @Test
    void render_timeout_throws_RendererTimeoutException() {
        when(page.screenshot(any(Page.ScreenshotOptions.class)))
                .thenThrow(new PlaywrightException("Timeout 8000ms exceeded"));

        assertThatThrownBy(() -> renderer.render(Map.of("slipNo", "SL-001"), "a", "b"))
                .isInstanceOf(PlaywrightCopyRenderer.RendererTimeoutException.class);
    }

    @Test
    void render_other_error_throws_RendererErrorException() {
        when(page.screenshot(any(Page.ScreenshotOptions.class)))
                .thenThrow(new PlaywrightException("Chromium crashed"));

        assertThatThrownBy(() -> renderer.render(Map.of("slipNo", "SL-001"), "a", "b"))
                .isInstanceOf(PlaywrightCopyRenderer.RendererErrorException.class);
    }

    @Test
    void render_sets_viewport_size_600x850() {
        when(page.screenshot(any(Page.ScreenshotOptions.class))).thenReturn(new byte[]{0x01});

        renderer.render(Map.of("slipNo", "SL-001"), "a", "b");

        org.mockito.Mockito.verify(page).setViewportSize(600, 850);
    }

    @Test
    void render_navigates_with_query_params() {
        when(page.screenshot(any(Page.ScreenshotOptions.class))).thenReturn(new byte[]{0x01});

        renderer.render(Map.of("slipNo", "SL-001"), "drv", "rcp");

        org.mockito.ArgumentCaptor<String> urlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(page).navigate(urlCaptor.capture());
        assertThat(urlCaptor.getValue()).startsWith("file:///app/print-renderer/index.html?slip=");
        assertThat(urlCaptor.getValue()).contains("driverSig=drv");
        assertThat(urlCaptor.getValue()).contains("recipientSig=rcp");
    }
}
```

- [ ] **B3.6 — 단위 테스트 실행**

Run: `gradlew :services:arologis-service:test --tests "*PlaywrightCopyRendererTest*"`
Expected: 5 PASS (Mockito fake, Chromium binary 불필요)

- [ ] **B3.7 — 커밋**

```bash
git add services/arologis-service/build.gradle \
        services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/PlaywrightConfig.java \
        services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/PlaywrightCopyRenderer.java \
        services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/copy/PlaywrightCopyRendererTest.java \
        services/arologis-service/src/main/resources/application.yml
git commit -m "feat(samhan-signature-copy/be): Playwright Java SDK 의존성 + Browser bean + Renderer 단위 5건 (D-DF-06)"
```

---

## BE Task B4: SignAndSendCopyRequest/Response DTO

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/dto/copy/SignAndSendCopyRequest.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/dto/copy/SignAndSendCopyResponse.java`

- [ ] **B4.1 — Request DTO**

```java
package com.samhanair.logis.arologis.web.dto.copy;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * POST /driver-app/.../sign-and-send-copy 요청 — Phase F (D-DF-07).
 */
public record SignAndSendCopyRequest(
        @NotBlank(message = "driverSignatureBase64 필수") String driverSignatureBase64,
        @NotBlank(message = "recipientSignatureBase64 필수") String recipientSignatureBase64,
        @NotNull(message = "capturedAt 필수") LocalDateTime capturedAt,
        BigDecimal gpsLat,
        BigDecimal gpsLng
) {}
```

- [ ] **B4.2 — Response DTO (JSON 변형 응답 — fail/skip/duplicate)**

```java
package com.samhanair.logis.arologis.web.dto.copy;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.arologis.service.copy.CopyFailureReason;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 사본 fail / skip / duplicate 시 JSON 응답.
 *
 * <p>성공 (PNG 응답) 시는 image/png byte[] + X-* 헤더 사용 (본 DTO 미사용).
 * 본 DTO 는 Content-Type: application/json 분기 응답 전용.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SignAndSendCopyResponse(
        UUID signatureId,
        boolean slipBridged,
        boolean copySent,
        LocalDateTime copySentAt,
        String copyRecipientPhoneMasked,
        CopyFailureReason copyFailureReason,
        String error,
        Boolean retryable,
        LocalDateTime previousCopySentAt
) {
    /** 사본 skip — 인수자 번호 없음. */
    public static SignAndSendCopyResponse phoneMissing(UUID signatureId) {
        return new SignAndSendCopyResponse(signatureId, true, false, null, null,
                CopyFailureReason.RECIPIENT_PHONE_MISSING, null, null, null);
    }

    /** 사본 합성/저장 fail (Tx2 c/d). */
    public static SignAndSendCopyResponse copyFailed(UUID signatureId, CopyFailureReason reason) {
        return new SignAndSendCopyResponse(signatureId, true, false, null, null, reason, null, null, null);
    }

    /** 409 — 이미 download 완료. */
    public static SignAndSendCopyResponse alreadySent(LocalDateTime previousCopySentAt) {
        return new SignAndSendCopyResponse(null, false, false, null, null, null,
                "COPY_ALREADY_SENT", null, previousCopySentAt);
    }

    /** 422 — Tx1 atomic fail. */
    public static SignAndSendCopyResponse bridgeFailed(String reason) {
        return new SignAndSendCopyResponse(null, false, false, null, null, null,
                "SIGNATURE_BRIDGE_FAILED:" + reason, true, null);
    }
}
```

- [ ] **B4.3 — 커밋**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/dto/copy/
git commit -m "feat(samhan-signature-copy/be): SignAndSendCopy Request/Response DTO (D-DF-07)"
```

---

## BE Task B5: SignAndSendCopyService — Tx1 + Tx2 orchestration

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/SignAndSendCopyService.java`
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/copy/SignAndSendCopyServiceTest.java`

- [ ] **B5.1 — Service 작성**

```java
package com.samhanair.logis.arologis.service.copy;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipClient.SignaturePayload;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyRequest;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase F (D-DF-01~12) — 전자서명 양쪽 저장 + 사본 PNG 합성/저장 orchestration.
 *
 * <p>Tx1 [보상 트랜잭션 — atomic 양쪽 저장]: arologis Signature INSERT + slip-service registerSignature.
 * 둘 다 OK 여야 진행. b 5xx/timeout 시 a rollback (Spring @Transactional propagation).
 *
 * <p>Tx2 [best effort — 사본 합성/저장]: PlaywrightCopyRenderer + CopyImageDiskStorage + markCopySent.
 * fail 시 markCopyFailure (copySendFailureCount++) + JSON 응답 (200) — 사용자 같은 endpoint 재호출 OK.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SignAndSendCopyService {

    private final SignatureRepository signatureRepository;
    private final VehicleStopRepository vehicleStopRepository;
    private final SlipResolver slipResolver;
    private final SlipClient slipClient;
    private final PlaywrightCopyRenderer renderer;
    private final CopyImageDiskStorage storage;

    /**
     * sign-and-send-copy endpoint orchestration.
     *
     * @return SignAndSendCopyResult (PNG byte[] + 응답 메타) — controller 가 image/png 또는 JSON 분기
     */
    public SignAndSendCopyResult execute(UUID dispatchId, int vehicleSeq, int stopSeq,
                                          UUID driverIdFromJwt,
                                          SignAndSendCopyRequest request) {
        // 0. stop 조회 + 본인 dispatch 권한 검증 (D-DF-08)
        VehicleStop stop = vehicleStopRepository.findByDispatchIdAndVehicleSeqAndStopSeq(
                        dispatchId, vehicleSeq, stopSeq)
                .orElseThrow(() -> new IllegalArgumentException("정차 미발견"));
        if (!stop.getDispatch().getDriverId().equals(driverIdFromJwt)) {
            throw new SecurityException("본인 dispatch 가 아님");
        }

        // 1. 1회 가드 (D-DF-04) — 기존 Signature 조회 (stopId 기준)
        Optional<Signature> existing = signatureRepository.findFirstByStopIdAndSourceOrderByCreatedAtDesc(
                stop.getId(), SignatureSource.APP);
        if (existing.isPresent() && existing.get().isCopySent()) {
            return SignAndSendCopyResult.alreadySent(existing.get().getCopySentAt());
        }

        // 2. Tx1 — atomic 양쪽 저장
        Signature signature = saveSignatureBoth(stop, request, existing);

        // 3. 인수자 번호 lookup (slip recipientPhoneNumber)
        Optional<String> recipientPhone = slipResolver.findRecipientPhone(stop);
        if (recipientPhone.isEmpty() || recipientPhone.get().isBlank()) {
            return SignAndSendCopyResult.phoneMissing(signature.getId());
        }

        // 4. Tx2 — best effort PNG 합성 + 저장
        return tryRenderAndStore(signature, stop, request, recipientPhone.get());
    }

    /** Tx1 — Spring REQUIRED propagation, slip-service fail 시 rollback. */
    @Transactional(propagation = Propagation.REQUIRED)
    protected Signature saveSignatureBoth(VehicleStop stop,
                                           SignAndSendCopyRequest request,
                                           Optional<Signature> existing) {
        // 기존 signature 가 있으면 (사본만 fail 후 retry 케이스) 재사용, 아니면 신규
        Signature signature = existing.orElseGet(() ->
                signatureRepository.save(Signature.of(
                        stop.getId(), SignatureSource.APP,
                        "inline-base64",  // Phase F PoC, 실 imageRef 는 후속 file-server PR
                        request.capturedAt(), request.gpsLat(), request.gpsLng())));

        // slip-service 호출 — skeleton-mode false 활성 (DevOps env)
        Optional<UUID> slipIdOpt = slipResolver.resolveSlipId(stop);
        if (slipIdOpt.isEmpty()) {
            throw new BridgeFailedException("SLIP_RESOLVE_FAILED");
        }

        BigDecimal lat = request.gpsLat();
        BigDecimal lng = request.gpsLng();
        boolean ok = slipClient.registerSignature(slipIdOpt.get(),
                SignaturePayload.appReceiver(
                        "inline-base64",
                        stop.getRecipientName(),
                        request.capturedAt(), lat, lng));
        if (!ok) {
            throw new BridgeFailedException("SLIP_SERVICE_REJECTED");
        }
        return signature;
    }

    private SignAndSendCopyResult tryRenderAndStore(Signature signature, VehicleStop stop,
                                                     SignAndSendCopyRequest request,
                                                     String recipientPhone) {
        try {
            byte[] png = renderer.render(
                    slipResolver.buildSlipDataMap(stop),
                    request.driverSignatureBase64(),
                    request.recipientSignatureBase64());
            String path = storage.save(signature.getId(), png);
            signature.markCopySent(path, recipientPhone);
            signatureRepository.save(signature);
            return SignAndSendCopyResult.success(signature.getId(), png,
                    signature.getCopySentAt(), maskPhone(recipientPhone));
        } catch (PlaywrightCopyRenderer.RendererTimeoutException ex) {
            log.warn("사본 fail RENDERER_TIMEOUT — signatureId={}", signature.getId());
            signature.markCopyFailure();
            signatureRepository.save(signature);
            return SignAndSendCopyResult.copyFailed(signature.getId(), CopyFailureReason.RENDERER_TIMEOUT);
        } catch (PlaywrightCopyRenderer.RendererErrorException ex) {
            log.warn("사본 fail RENDERER_ERROR — signatureId={}, msg={}", signature.getId(), ex.getMessage());
            signature.markCopyFailure();
            signatureRepository.save(signature);
            return SignAndSendCopyResult.copyFailed(signature.getId(), CopyFailureReason.RENDERER_ERROR);
        } catch (IOException ex) {
            log.warn("사본 fail STORAGE_FULL — signatureId={}, msg={}", signature.getId(), ex.getMessage());
            signature.markCopyFailure();
            signatureRepository.save(signature);
            return SignAndSendCopyResult.copyFailed(signature.getId(), CopyFailureReason.STORAGE_FULL);
        }
    }

    static String maskPhone(String phone) {
        if (phone == null || phone.length() < 8) return phone;
        return phone.substring(0, 3) + "-****-" + phone.substring(phone.length() - 4);
    }

    /** Tx1 보상 — slip-service 실패 시 throw. */
    public static class BridgeFailedException extends RuntimeException {
        public BridgeFailedException(String reason) { super(reason); }
    }

    /**
     * 결과 envelope — controller 가 image/png 또는 JSON 분기.
     */
    public record SignAndSendCopyResult(
            byte[] png,
            UUID signatureId,
            boolean alreadySent,
            LocalDateTime copySentAt,
            String copyRecipientPhoneMasked,
            CopyFailureReason failureReason,
            LocalDateTime previousCopySentAt) {

        public static SignAndSendCopyResult success(UUID signatureId, byte[] png,
                                                     LocalDateTime sentAt, String maskedPhone) {
            return new SignAndSendCopyResult(png, signatureId, false, sentAt, maskedPhone, null, null);
        }
        public static SignAndSendCopyResult phoneMissing(UUID signatureId) {
            return new SignAndSendCopyResult(null, signatureId, false, null, null,
                    CopyFailureReason.RECIPIENT_PHONE_MISSING, null);
        }
        public static SignAndSendCopyResult copyFailed(UUID signatureId, CopyFailureReason reason) {
            return new SignAndSendCopyResult(null, signatureId, false, null, null, reason, null);
        }
        public static SignAndSendCopyResult alreadySent(LocalDateTime previousSentAt) {
            return new SignAndSendCopyResult(null, null, true, null, null, null, previousSentAt);
        }
    }
}
```

> **참고**: `SlipResolver.findRecipientPhone(stop)` + `SlipResolver.buildSlipDataMap(stop)` 는 SlipResolver 확장 (B6 task) 또는 새 helper. `VehicleStopRepository.findByDispatchIdAndVehicleSeqAndStopSeq` + `SignatureRepository.findFirstByStopIdAndSourceOrderByCreatedAtDesc` 는 기존 repo 확장 또는 신규. 자세한 signature 는 BE worker 가 SlipResolver / repository 코드 보고 확정.

- [ ] **B5.2 — SignAndSendCopyServiceTest 단위 (7 case)**

```java
package com.samhanair.logis.arologis.service.copy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyRequest;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SignAndSendCopyServiceTest {

    private SignatureRepository signatureRepo;
    private VehicleStopRepository stopRepo;
    private SlipResolver slipResolver;
    private SlipClient slipClient;
    private PlaywrightCopyRenderer renderer;
    private CopyImageDiskStorage storage;
    private SignAndSendCopyService service;

    private final UUID DISPATCH_ID = UUID.randomUUID();
    private final UUID DRIVER_ID = UUID.randomUUID();
    private final UUID STOP_ID = UUID.randomUUID();
    private final UUID SLIP_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        signatureRepo = mock(SignatureRepository.class);
        stopRepo = mock(VehicleStopRepository.class);
        slipResolver = mock(SlipResolver.class);
        slipClient = mock(SlipClient.class);
        renderer = mock(PlaywrightCopyRenderer.class);
        storage = mock(CopyImageDiskStorage.class);
        service = new SignAndSendCopyService(signatureRepo, stopRepo, slipResolver,
                slipClient, renderer, storage);

        // 기본 stop + dispatch + driver
        Dispatch dispatch = mock(Dispatch.class);
        when(dispatch.getDriverId()).thenReturn(DRIVER_ID);
        VehicleStop stop = mock(VehicleStop.class);
        when(stop.getId()).thenReturn(STOP_ID);
        when(stop.getDispatch()).thenReturn(dispatch);
        when(stop.getRecipientName()).thenReturn("홍길동");
        when(stopRepo.findByDispatchIdAndVehicleSeqAndStopSeq(DISPATCH_ID, 1, 1))
                .thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.of(SLIP_ID));
        when(slipResolver.buildSlipDataMap(stop))
                .thenReturn(Map.of("slipNo", "SL-001", "partnerName", "대구공조"));
    }

    private SignAndSendCopyRequest req() {
        return new SignAndSendCopyRequest("driverB64", "recipientB64",
                LocalDateTime.now(), new BigDecimal("37.4979"), new BigDecimal("127.0276"));
    }

    @Test
    void execute_success_returns_png_and_marks_sent() {
        when(signatureRepo.findFirstByStopIdAndSourceOrderByCreatedAtDesc(STOP_ID, SignatureSource.APP))
                .thenReturn(Optional.empty());
        Signature signature = Signature.of(STOP_ID, SignatureSource.APP, "x",
                LocalDateTime.now(), null, null);
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(any())).thenReturn(Optional.of("01012345678"));
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{(byte) 0x89, 0x50});
        try {
            when(storage.save(any(UUID.class), any(byte[].class)))
                    .thenReturn("/var/lib/arologis/signature-copies/x.png");
        } catch (java.io.IOException ignored) {}

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.png()).isNotNull();
        assertThat(result.copySentAt()).isNotNull();
        assertThat(result.copyRecipientPhoneMasked()).isEqualTo("010-****-5678");
    }

    @Test
    void execute_already_sent_returns_alreadySent() {
        Signature existing = Signature.of(STOP_ID, SignatureSource.APP, "x",
                LocalDateTime.now(), null, null);
        existing.markCopySent("/already.png", "01012345678");
        when(signatureRepo.findFirstByStopIdAndSourceOrderByCreatedAtDesc(STOP_ID, SignatureSource.APP))
                .thenReturn(Optional.of(existing));

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.alreadySent()).isTrue();
        assertThat(result.previousCopySentAt()).isNotNull();
    }

    @Test
    void execute_phone_missing_returns_phoneMissing_after_signature_save() {
        when(signatureRepo.findFirstByStopIdAndSourceOrderByCreatedAtDesc(STOP_ID, SignatureSource.APP))
                .thenReturn(Optional.empty());
        Signature signature = Signature.of(STOP_ID, SignatureSource.APP, "x",
                LocalDateTime.now(), null, null);
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(any())).thenReturn(Optional.empty());

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.failureReason()).isEqualTo(CopyFailureReason.RECIPIENT_PHONE_MISSING);
        assertThat(result.png()).isNull();
        verify(renderer, never()).render(any(), any(), any());
    }

    @Test
    void execute_renderer_timeout_returns_RENDERER_TIMEOUT() {
        when(signatureRepo.findFirstByStopIdAndSourceOrderByCreatedAtDesc(STOP_ID, SignatureSource.APP))
                .thenReturn(Optional.empty());
        Signature signature = Signature.of(STOP_ID, SignatureSource.APP, "x",
                LocalDateTime.now(), null, null);
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(any())).thenReturn(Optional.of("01012345678"));
        when(renderer.render(any(), any(), any()))
                .thenThrow(new PlaywrightCopyRenderer.RendererTimeoutException("timeout", null));

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.failureReason()).isEqualTo(CopyFailureReason.RENDERER_TIMEOUT);
        assertThat(signature.getCopySendFailureCount()).isEqualTo(1);
    }

    @Test
    void execute_storage_io_returns_STORAGE_FULL() throws Exception {
        when(signatureRepo.findFirstByStopIdAndSourceOrderByCreatedAtDesc(STOP_ID, SignatureSource.APP))
                .thenReturn(Optional.empty());
        Signature signature = Signature.of(STOP_ID, SignatureSource.APP, "x",
                LocalDateTime.now(), null, null);
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(any())).thenReturn(Optional.of("01012345678"));
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{0x01});
        when(storage.save(any(UUID.class), any(byte[].class)))
                .thenThrow(new java.io.IOException("disk full"));

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.failureReason()).isEqualTo(CopyFailureReason.STORAGE_FULL);
    }

    @Test
    void execute_other_driver_throws_SecurityException() {
        UUID otherDriver = UUID.randomUUID();
        org.junit.jupiter.api.Assertions.assertThrows(SecurityException.class,
                () -> service.execute(DISPATCH_ID, 1, 1, otherDriver, req()));
    }

    @Test
    void execute_slip_service_reject_throws_BridgeFailedException() {
        when(signatureRepo.findFirstByStopIdAndSourceOrderByCreatedAtDesc(STOP_ID, SignatureSource.APP))
                .thenReturn(Optional.empty());
        Signature signature = Signature.of(STOP_ID, SignatureSource.APP, "x",
                LocalDateTime.now(), null, null);
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(false);

        org.junit.jupiter.api.Assertions.assertThrows(SignAndSendCopyService.BridgeFailedException.class,
                () -> service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req()));
    }
}
```

- [ ] **B5.3 — 단위 테스트 실행**

Run: `gradlew :services:arologis-service:test --tests "*SignAndSendCopyServiceTest*"`
Expected: 7 PASS

- [ ] **B5.4 — 커밋**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/copy/SignAndSendCopyService.java \
        services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/copy/SignAndSendCopyServiceTest.java
git commit -m "feat(samhan-signature-copy/be): SignAndSendCopyService Tx1+Tx2 orchestration + 단위 7건 (D-DF-01~10)"
```

---

## BE Task B6: SlipResolver 확장 — findRecipientPhone + buildSlipDataMap

**Files:**
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/SlipResolver.java`

> SlipResolver 의 기존 메서드 (resolveSlipId 등) 는 보존. 신규 2 메서드 추가. SlipResolver 가 slip-service `GET /internal/slips/{slipId}/full` (또는 적절한 endpoint) 를 호출하여 partnerName / recipientAddress / lines 등 lookup. **endpoint 가 없으면 신규 추가 필요** (slip-service 측 추가 task — B6.5 에 별도 명시).

- [ ] **B6.1 — SlipResolver.findRecipientPhone(stop) 추가**

```java
/**
 * Phase F (D-DF-05) — 인수자 휴대번호 lookup.
 *
 * <p>slip-service 의 slip recipientPhoneNumber (Phase A SlipRef 에 포함) lookup. arologis VehicleStop
 * 의 매핑된 slip 기준. null/blank 시 empty.
 */
public Optional<String> findRecipientPhone(VehicleStop stop) {
    return resolveSlipId(stop)
            .flatMap(slipClient::findRecipientPhone);
}
```

- [ ] **B6.2 — SlipResolver.buildSlipDataMap(stop) 추가**

```java
/**
 * Phase F (D-DF-06) — print-renderer query param 으로 보낼 slip 데이터 map 빌드.
 *
 * <p>OutboundView 가 받는 props 와 1:1 — slipNo, slipDate, partnerName, recipientAddress,
 * lines [{itemName, spec, quantity, unitPrice, lineTotal}], totalSupply, vat, total,
 * sourceWarehouseName, capturedAt, gpsLat, gpsLng.
 */
public Map<String, Object> buildSlipDataMap(VehicleStop stop) {
    UUID slipId = resolveSlipId(stop)
            .orElseThrow(() -> new IllegalStateException("slipId resolve 실패 — stopId=" + stop.getId()));
    SlipFullDetail detail = slipClient.findFullDetail(slipId)
            .orElseThrow(() -> new IllegalStateException("slip 상세 lookup 실패 — slipId=" + slipId));
    Map<String, Object> data = new HashMap<>();
    data.put("slipNo", detail.slipNo());
    data.put("slipDate", detail.slipDate().toString());
    data.put("partnerName", detail.partnerName());
    data.put("recipientAddress", detail.recipientAddress());
    data.put("lines", detail.lines());
    data.put("totalSupply", detail.totalSupply());
    data.put("vat", detail.vat());
    data.put("total", detail.total());
    data.put("sourceWarehouseName", detail.sourceWarehouseName());
    return data;
}
```

- [ ] **B6.3 — SlipClient 확장 — findRecipientPhone + findFullDetail**

```java
// SlipClient.java 에 추가

/** Phase F (D-DF-05) — slip recipientPhoneNumber lookup. */
public Optional<String> findRecipientPhone(UUID slipId) {
    if (skeletonMode) return Optional.empty();
    try {
        String body = restClient.get()
                .uri("/internal/slips/{slipId}/recipient-phone", slipId)
                .header("X-Internal-Token", internalToken)
                .retrieve()
                .body(String.class);
        if (body == null || body.isBlank()) return Optional.empty();
        JsonNode root = objectMapper.readTree(body);
        JsonNode data = root.get("data");
        if (data == null || data.isNull()) return Optional.empty();
        JsonNode phone = data.get("recipientPhoneNumber");
        if (phone == null || phone.isNull()) return Optional.empty();
        return Optional.ofNullable(phone.asText(null));
    } catch (Exception ex) {
        log.warn("findRecipientPhone 실패 — slipId={}, msg={}", slipId, ex.getMessage());
        return Optional.empty();
    }
}

/** Phase F (D-DF-06) — print-renderer 용 slip 전체 상세 lookup. */
public Optional<SlipFullDetail> findFullDetail(UUID slipId) {
    if (skeletonMode) return Optional.empty();
    try {
        return Optional.ofNullable(restClient.get()
                .uri("/internal/slips/{slipId}/full", slipId)
                .header("X-Internal-Token", internalToken)
                .retrieve()
                .body(SlipFullDetail.class));
    } catch (Exception ex) {
        log.warn("findFullDetail 실패 — slipId={}, msg={}", slipId, ex.getMessage());
        return Optional.empty();
    }
}

public record SlipFullDetail(String slipNo, java.time.LocalDate slipDate, String partnerName,
                              String recipientAddress, java.util.List<Map<String, Object>> lines,
                              java.math.BigDecimal totalSupply, java.math.BigDecimal vat,
                              java.math.BigDecimal total, String sourceWarehouseName) {}
```

- [ ] **B6.4 — slip-service 측 endpoint 추가 (`SlipInternalController`)**

`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java` 에 2 endpoint 추가:

```java
/** Phase F (D-DF-05) — 인수자 휴대번호 lookup. */
@GetMapping("/{slipId}/recipient-phone")
@PreAuthorize("hasRole('MASTER')")
public ApiResponse<RecipientPhoneResponse> findRecipientPhone(@PathVariable UUID slipId) {
    Slip slip = slipService.findById(slipId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "slip 미발견"));
    return ApiResponse.ok(new RecipientPhoneResponse(slip.getRecipientPhoneNumber()));
}

/** Phase F (D-DF-06) — print-renderer 용 전체 상세. */
@GetMapping("/{slipId}/full")
@PreAuthorize("hasRole('MASTER')")
public ApiResponse<SlipFullDetailResponse> findFullDetail(@PathVariable UUID slipId) {
    Slip slip = slipService.findByIdWithLines(slipId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "slip 미발견"));
    return ApiResponse.ok(SlipFullDetailResponse.from(slip));
}

public record RecipientPhoneResponse(String recipientPhoneNumber) {}
public record SlipFullDetailResponse(String slipNo, java.time.LocalDate slipDate, String partnerName,
                                      String recipientAddress, java.util.List<LineDto> lines,
                                      java.math.BigDecimal totalSupply, java.math.BigDecimal vat,
                                      java.math.BigDecimal total, String sourceWarehouseName) {
    public static SlipFullDetailResponse from(Slip slip) {
        // 매핑 — slip.getLines() → LineDto.from
        return new SlipFullDetailResponse(
                slip.getSlipNo(), slip.getSlipDate(), slip.getPartnerName(),
                slip.getRecipientAddress(),
                slip.getLines().stream().map(LineDto::from).toList(),
                slip.getTotalSupply(), slip.getVat(), slip.getTotal(),
                slip.getSourceWarehouseName());
    }
    public record LineDto(String itemName, String spec, int quantity,
                           java.math.BigDecimal unitPrice, java.math.BigDecimal lineTotal) {
        public static LineDto from(com.samhanair.logis.slip.domain.SlipLine line) {
            return new LineDto(line.getItemName(), line.getSpec(), line.getQuantity(),
                    line.getUnitPrice(), line.getLineTotal());
        }
    }
}
```

> **참고**: `Slip.recipientAddress` / `Slip.recipientPhoneNumber` / `Slip.totalSupply` / `Slip.vat` / `Slip.total` / `Slip.sourceWarehouseName` 가 실제 entity 의 getter 명과 일치하는지 BE worker 가 코드 확인 후 정정 필요. Phase A 의 SlipRef 에 recipientPhoneNumber 가 포함되었는지도 검증 (포함 안 됐으면 Slip entity 직접 lookup).

- [ ] **B6.5 — 컴파일 확인**

Run: `gradlew :services:arologis-service:compileJava :services:slip-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **B6.6 — 커밋**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/SlipResolver.java \
        services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipClient.java \
        services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java
git commit -m "feat(samhan-signature-copy/be): SlipResolver 확장 + SlipClient 2 endpoint + slip-service /recipient-phone /full (D-DF-05/06)"
```

---

## BE Task B7: ArologisDriverAppController — POST /sign-and-send-copy + /sign deprecate

**Files:**
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisDriverAppController.java`

- [ ] **B7.1 — sign-and-send-copy endpoint 추가**

```java
/**
 * Phase F (D-DF-07) — 서명 양쪽 저장 + 출고전표 사본 PNG 합성/저장 1-tap endpoint.
 *
 * <p>응답 분기:
 * <ul>
 *   <li>성공 (PNG 합성 + 저장 OK) → image/png byte[] + X-* 헤더</li>
 *   <li>인수자 번호 없음 / 사본 fail → application/json (SignAndSendCopyResponse)</li>
 *   <li>이미 발송됨 → 409 application/json</li>
 *   <li>Tx1 fail → 422 application/json</li>
 * </ul>
 */
@Operation(summary = "서명 양쪽 저장 + 사본 PNG 합성/저장 (Phase F)",
        description = "ROLE_AROLOGIS_DRIVER. 본인 dispatch 만 호출 가능 (서비스 레이어 driverId 검증). "
                + "Aligo 미사용 — 응답 PNG 를 mobile 이 받아 Share Sheet 으로 인수자에게 발송.")
@PostMapping(value = "/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy",
             produces = {MediaType.IMAGE_PNG_VALUE, MediaType.APPLICATION_JSON_VALUE})
@PreAuthorize("hasRole('AROLOGIS_DRIVER')")
public ResponseEntity<?> signAndSendCopy(
        @PathVariable UUID dispatchId,
        @PathVariable int vehicleSeq,
        @PathVariable int stopSeq,
        @AuthenticationPrincipal DriverPrincipal driver,
        @Valid @RequestBody SignAndSendCopyRequest request) {

    SignAndSendCopyResult result;
    try {
        result = signAndSendCopyService.execute(dispatchId, vehicleSeq, stopSeq,
                driver.getDriverId(), request);
    } catch (SignAndSendCopyService.BridgeFailedException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(SignAndSendCopyResponse.bridgeFailed(ex.getMessage()));
    } catch (SecurityException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "FORBIDDEN", "message", ex.getMessage()));
    }

    if (result.alreadySent()) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(SignAndSendCopyResponse.alreadySent(result.previousCopySentAt()));
    }
    if (result.failureReason() != null) {
        if (result.failureReason() == CopyFailureReason.RECIPIENT_PHONE_MISSING) {
            return ResponseEntity.ok(SignAndSendCopyResponse.phoneMissing(result.signatureId()));
        }
        return ResponseEntity.ok(SignAndSendCopyResponse.copyFailed(result.signatureId(), result.failureReason()));
    }
    // 성공 — image/png + 헤더
    return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_PNG)
            .header("X-Signature-Id", result.signatureId().toString())
            .header("X-Slip-Bridged", "true")
            .header("X-Copy-Sent-At", result.copySentAt().toString())
            .header("X-Copy-Recipient-Phone-Masked", result.copyRecipientPhoneMasked())
            .body(result.png());
}
```

- [ ] **B7.2 — 기존 /sign endpoint 에 @Deprecated 마킹**

기존 `signSync` (또는 sign 메서드명 — 코드 확인) 에 `@Deprecated` annotation + Javadoc 추가:

```java
/**
 * @deprecated Phase F (D-DF-06) — sign-and-send-copy 로 대체. 본 endpoint 는 PR #99 IT 보존용 유지,
 *             후속 PR 에서 제거 예정 (1~2 분기 후).
 */
@Deprecated
@PostMapping("/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign")
public ResponseEntity<...> sign(...) { ... }
```

- [ ] **B7.3 — 컴파일 확인**

Run: `gradlew :services:arologis-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **B7.4 — 커밋**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisDriverAppController.java
git commit -m "feat(samhan-signature-copy/be): /sign-and-send-copy endpoint 추가 + 기존 /sign @Deprecated (D-DF-07)"
```

---

## BE Task B8: IT — SignAndSendCopyIT (성공 round trip)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignAndSendCopyIT.java`

- [ ] **B8.1 — IT 작성 (Testcontainers + WireMock for slip-service + Playwright Mock 또는 실 Chromium)**

```java
package com.samhanair.logis.arologis.it;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.service.copy.PlaywrightCopyRenderer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Phase F (D-DF-07) — sign-and-send-copy 성공 round trip IT.
 *
 * <p>WireMock 으로 slip-service 응답 mock + PlaywrightCopyRenderer @MockBean (Chromium binary 미설치
 * 환경에서도 IT 가능, [[feedback_it_mockbean_external_clients]] 패턴).
 */
@SpringBootTest
@ActiveProfiles("it")
class SignAndSendCopyIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @MockBean private PlaywrightCopyRenderer renderer;

    @Test
    void signAndSendCopy_success_returns_image_png() throws Exception {
        // given — Playwright mock PNG
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47});

        // given — slip-service WireMock stubs (skeleton-mode false 활성)
        // ... (registerSignature 200 + recipient-phone 200 + full 200)

        // when
        mockMvc.perform(post("/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        DISPATCH_ID, 1, 1)
                        .header("Authorization", "Bearer " + DRIVER_JWT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().exists("X-Signature-Id"))
                .andExpect(header().string("X-Slip-Bridged", "true"))
                .andExpect(header().string("X-Copy-Recipient-Phone-Masked",
                        org.hamcrest.Matchers.matchesPattern("\\d{3}-\\*{4}-\\d{4}")));
    }

    // ... helper methods (validRequest, DISPATCH_ID, DRIVER_JWT 발급 등 — AbstractPostgresIT 에서 상속)
}
```

> **참고**: `AbstractPostgresIT` + `WireMock` 셋업 패턴은 기존 IT (예: `SignatureIntegrationIT`) 참조. `DriverPrincipal` JWT 발급은 ArologisAuthSecurityIT 패턴 활용.

- [ ] **B8.2 — IT 실행 (Docker 가용)**

Run: `gradlew :services:arologis-service:test --tests "*SignAndSendCopyIT*"`
Expected: PASS (Docker 미가용 시 [[feedback_testcontainers_windows_docker.md]] 의 DOCKER_HOST=tcp://localhost:2375 우회 또는 skip)

- [ ] **B8.3 — 커밋**

```bash
git add services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignAndSendCopyIT.java
git commit -m "test(samhan-signature-copy/be): SignAndSendCopyIT 성공 round trip (Playwright @MockBean)"
```

---

## BE Task B9: IT — SignatureCopyDuplicateIT (409)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyDuplicateIT.java`

- [ ] **B9.1 — 두 번째 호출 → 409 IT 작성**

```java
@Test
void second_call_returns_409_with_previous_copySentAt() throws Exception {
    // given — 첫 호출 성공
    when(renderer.render(any(), any(), any())).thenReturn(new byte[]{0x01});
    mockMvc.perform(post("...sign-and-send-copy", ...))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.IMAGE_PNG));

    // when — 두 번째 호출
    mockMvc.perform(post("...sign-and-send-copy", ...))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("COPY_ALREADY_SENT"))
            .andExpect(jsonPath("$.previousCopySentAt").exists());
}
```

- [ ] **B9.2 — IT 실행 + 커밋**

Run: `gradlew :services:arologis-service:test --tests "*SignatureCopyDuplicateIT*"`
Expected: PASS

```bash
git add services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyDuplicateIT.java
git commit -m "test(samhan-signature-copy/be): SignatureCopyDuplicateIT 409 가드 (D-DF-04)"
```

---

## BE Task B10: IT — SignatureCopyMissingPhoneIT (RECIPIENT_PHONE_MISSING)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyMissingPhoneIT.java`

- [ ] **B10.1 — 인수자 번호 없음 → 200 with reason**

```java
@Test
void missing_recipient_phone_returns_200_with_reason() throws Exception {
    // given — slip-service /recipient-phone 응답 = null
    stubFor(get(urlPathMatching("/internal/slips/.+/recipient-phone"))
            .willReturn(aResponse().withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withBody("{\"success\":true,\"data\":{\"recipientPhoneNumber\":null}}")));

    mockMvc.perform(post("...sign-and-send-copy", ...))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.copySent").value(false))
            .andExpect(jsonPath("$.copyFailureReason").value("RECIPIENT_PHONE_MISSING"))
            .andExpect(jsonPath("$.slipBridged").value(true));
    // verify renderer 미호출
    verifyNoInteractions(renderer);
}
```

- [ ] **B10.2 — IT 실행 + 커밋**

Run: `gradlew :services:arologis-service:test --tests "*SignatureCopyMissingPhoneIT*"`
Expected: PASS

```bash
git add services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyMissingPhoneIT.java
git commit -m "test(samhan-signature-copy/be): SignatureCopyMissingPhoneIT skip + reason (D-DF-05)"
```

---

## BE Task B11: IT — SignatureCopyRendererTimeoutIT

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyRendererTimeoutIT.java`

- [ ] **B11.1 — Playwright timeout → 200 with RENDERER_TIMEOUT**

```java
@Test
void renderer_timeout_returns_200_with_RENDERER_TIMEOUT() throws Exception {
    when(renderer.render(any(), any(), any()))
            .thenThrow(new PlaywrightCopyRenderer.RendererTimeoutException("Timeout 8000ms exceeded", null));

    mockMvc.perform(post("...sign-and-send-copy", ...))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.copySent").value(false))
            .andExpect(jsonPath("$.copyFailureReason").value("RENDERER_TIMEOUT"));

    // 같은 endpoint 재호출 — 가드 작동 X (copy_sent_at 미설정), 다시 시도
    when(renderer.render(any(), any(), any())).thenReturn(new byte[]{0x01});
    mockMvc.perform(post("...sign-and-send-copy", ...))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.IMAGE_PNG));
}
```

- [ ] **B11.2 — IT 실행 + 커밋**

Run: `gradlew :services:arologis-service:test --tests "*SignatureCopyRendererTimeoutIT*"`
Expected: PASS

```bash
git add services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyRendererTimeoutIT.java
git commit -m "test(samhan-signature-copy/be): SignatureCopyRendererTimeoutIT retry 가능 검증 (D-DF-06)"
```

---

## BE Task B12: IT — SignatureCopyAtomicFailIT (Tx1 422 + rollback)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyAtomicFailIT.java`

- [ ] **B12.1 — slip-service 5xx → 422 + arologis Signature 미저장**

```java
@Test
void slip_service_5xx_returns_422_and_no_signature_inserted() throws Exception {
    // given — slip-service registerSignature 5xx mock
    stubFor(post(urlPathMatching("/internal/slips/.+/signatures"))
            .willReturn(aResponse().withStatus(500).withBody("{\"success\":false}")));

    long beforeCount = signatureRepository.count();

    mockMvc.perform(post("...sign-and-send-copy", ...))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.startsWith("SIGNATURE_BRIDGE_FAILED")))
            .andExpect(jsonPath("$.retryable").value(true));

    long afterCount = signatureRepository.count();
    // Tx1 보상 — Signature INSERT rollback 확인
    assertThat(afterCount).isEqualTo(beforeCount);
}
```

- [ ] **B12.2 — IT 실행 + 커밋**

Run: `gradlew :services:arologis-service:test --tests "*SignatureCopyAtomicFailIT*"`
Expected: PASS

```bash
git add services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/SignatureCopyAtomicFailIT.java
git commit -m "test(samhan-signature-copy/be): SignatureCopyAtomicFailIT Tx1 보상 rollback (D-DF-01)"
```

---

## BE Task B13: 회귀 — PR #99 SignatureIntegrationIT + slip-service 단위 ~98 + IT ~50 통과 확인

- [ ] **B13.1 — arologis-service 전체 테스트**

Run: `gradlew :services:arologis-service:test`
Expected: 0 failure (단위 ~18 + IT ~6 신규 + 기존 모두 통과)

- [ ] **B13.2 — slip-service 전체 테스트**

Run: `gradlew :services:slip-service:test`
Expected: 0 failure (PR #99 SignatureIntegrationIT 포함, /sign deprecated 후에도 IT 보존)

- [ ] **B13.3 — 결과 commit (회귀 0 결함 검증 — 코드 변경 없음)**

회귀 통과만 검증하므로 commit 없음. CI watch 에서 자동 검증.

---

# Team 2: FE — mobile-staff DriverSignatureScreen 갱신

## 파일 구조

```
clients/mobile-staff/
├── package.json                                                   (수정 — expo-sharing + expo-file-system 추가)
├── src/
│   ├── screens/driver/
│   │   └── DriverSignatureScreen.tsx                              (수정 — POST + image/png + Share Sheet)
│   ├── api/
│   │   └── arologis.ts                                            (수정 — signAndSendCopy 함수 추가)
│   └── __tests__/screens/driver/
│       └── DriverSignatureScreen.test.tsx                         (NEW — Jest 6 case)
```

## FE Task F1: package.json 의존성

**Files:**
- Modify: `clients/mobile-staff/package.json`

- [ ] **F1.1 — expo-sharing + expo-file-system 추가**

`dependencies` 에 추가 (Expo SDK 호환 버전 — 현재 Expo 버전 확인 후 정확 매핑):

```json
"expo-sharing": "~12.0.1",
"expo-file-system": "~17.0.1"
```

- [ ] **F1.2 — 설치**

Run (PowerShell):
```powershell
cd clients/mobile-staff
npm install
```

- [ ] **F1.3 — 커밋**

```bash
git add clients/mobile-staff/package.json clients/mobile-staff/package-lock.json
git commit -m "feat(samhan-signature-copy/fe): expo-sharing + expo-file-system 의존성 추가"
```

---

## FE Task F2: api/arologis.ts — signAndSendCopy

**Files:**
- Modify: `clients/mobile-staff/src/api/arologis.ts`

- [ ] **F2.1 — signAndSendCopy 함수 추가**

```typescript
import { encode as base64Encode } from 'base-64';

export interface SignAndSendCopyRequest {
  driverSignatureBase64: string;
  recipientSignatureBase64: string;
  capturedAt: string;  // ISO LocalDateTime (서버 timezone)
  gpsLat?: number;
  gpsLng?: number;
}

export type CopyFailureReason =
  | 'RECIPIENT_PHONE_MISSING'
  | 'RENDERER_TIMEOUT'
  | 'RENDERER_ERROR'
  | 'STORAGE_FULL';

export interface SignAndSendCopyJsonResponse {
  signatureId?: string;
  slipBridged?: boolean;
  copySent: boolean;
  copySentAt?: string;
  copyRecipientPhoneMasked?: string;
  copyFailureReason?: CopyFailureReason;
  error?: string;
  previousCopySentAt?: string;
  retryable?: boolean;
}

export interface SignAndSendCopySuccess {
  kind: 'success';
  pngBase64: string;
  signatureId: string;
  copySentAt: string;
  copyRecipientPhoneMasked: string;
}

export interface SignAndSendCopyFail {
  kind: 'fail' | 'duplicate' | 'bridge';
  json: SignAndSendCopyJsonResponse;
  status: number;
}

/**
 * Phase F (D-DF-07) — 양쪽 저장 + 사본 PNG 합성/저장 1-tap.
 *
 * <p>응답 분기:
 * - 200 image/png → success (PNG byte[] base64, X-* 헤더)
 * - 200 application/json (copySent=false) → fail
 * - 409 application/json → duplicate
 * - 422 application/json → bridge fail
 */
export async function signAndSendCopy(
  token: string,
  dispatchId: string,
  vehicleSeq: number,
  stopSeq: number,
  request: SignAndSendCopyRequest,
): Promise<SignAndSendCopySuccess | SignAndSendCopyFail> {
  const url = `${baseUrl}/driver-app/arologis/dispatches/${dispatchId}/vehicles/${vehicleSeq}/stops/${stopSeq}/sign-and-send-copy`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'image/png, application/json',
    },
    body: JSON.stringify(request),
  });

  const contentType = response.headers.get('content-type') ?? '';

  if (response.ok && contentType.includes('image/png')) {
    const buffer = await response.arrayBuffer();
    const pngBase64 = base64Encode(String.fromCharCode(...new Uint8Array(buffer)));
    return {
      kind: 'success',
      pngBase64,
      signatureId: response.headers.get('X-Signature-Id') ?? '',
      copySentAt: response.headers.get('X-Copy-Sent-At') ?? '',
      copyRecipientPhoneMasked: response.headers.get('X-Copy-Recipient-Phone-Masked') ?? '',
    };
  }

  const json = (await response.json()) as SignAndSendCopyJsonResponse;
  if (response.status === 409) {
    return { kind: 'duplicate', json, status: 409 };
  }
  if (response.status === 422) {
    return { kind: 'bridge', json, status: 422 };
  }
  return { kind: 'fail', json, status: response.status };
}
```

- [ ] **F2.2 — 컴파일 확인 (TypeScript)**

Run (PowerShell):
```powershell
cd clients/mobile-staff
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **F2.3 — 커밋**

```bash
git add clients/mobile-staff/src/api/arologis.ts
git commit -m "feat(samhan-signature-copy/fe): api/arologis.ts signAndSendCopy 함수 + 응답 분기 타입"
```

---

## FE Task F3: DriverSignatureScreen 갱신 — POST + Share Sheet 통합

**Files:**
- Modify: `clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx`

- [ ] **F3.1 — Share Sheet 호출 + 5 토스트**

`DriverSignatureScreen.tsx` 의 기존 submit 로직을 sign-and-send-copy 호출로 교체:

```typescript
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { signAndSendCopy } from '../../api/arologis';

const handleCompleteAndShare = async () => {
  if (!driverSig || !recipientSig) {
    Alert.alert('서명 미완료', '기사 + 인수자 서명 둘 다 필요합니다');
    return;
  }
  setSubmitting(true);
  try {
    const result = await signAndSendCopy(token!, dispatchId, vehicleSeq, stopSeq, {
      driverSignatureBase64: driverSig,
      recipientSignatureBase64: recipientSig,
      capturedAt: new Date().toISOString().replace('Z', ''),
      gpsLat: gps?.latitude,
      gpsLng: gps?.longitude,
    });

    if (result.kind === 'success') {
      // PNG 받기 + Share Sheet 호출 (D-DF-12)
      const localUri = `${FileSystem.cacheDirectory}signature-copy-${result.signatureId}.png`;
      await FileSystem.writeAsStringAsync(localUri, result.pngBase64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'image/png',
          dialogTitle: `${result.copyRecipientPhoneMasked} 님에게 출고전표 사본 보내기`,
          UTI: 'public.png',
        });
        setToast(`서명 저장 완료. ${result.copyRecipientPhoneMasked} 에게 보내세요`);
      } else {
        setToast('서명 저장 완료. Share Sheet 미지원 — 갤러리에 저장됨');
      }
    } else if (result.kind === 'duplicate') {
      setToast(`이미 발송됨 (${result.json.previousCopySentAt}). Admin 재발송 필요`);
    } else if (result.kind === 'bridge') {
      setToast('서명 양쪽 저장 실패 — 다시 시도해 주세요');
      setRetryable(true);
    } else {
      // fail (200)
      const reason = result.json.copyFailureReason;
      if (reason === 'RECIPIENT_PHONE_MISSING') {
        setToast('서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요');
      } else {
        setToast(`서명 저장 완료. 사본 합성 실패 (${reason}) — [재시도] 가능`);
        setRetryable(true);
      }
    }
  } catch (err: any) {
    setToast(`오류: ${err.message}`);
    setRetryable(true);
  } finally {
    setSubmitting(false);
  }
};
```

- [ ] **F3.2 — UI 변경 — 단일 [완료 + 사본 발송] 버튼 + 인수자 번호 마스킹 표시**

```tsx
<View style={styles.container}>
  <Text style={styles.slipNo}>{stopLabel}</Text>
  <SignaturePad onSign={setDriverSig} placeholder="기사 서명" />
  <SignaturePad onSign={setRecipientSig} placeholder="인수자 서명" />

  {recipientPhoneMasked && (
    <Text style={styles.recipientHint}>인수자: {recipientPhoneMasked}</Text>
  )}

  <TouchableOpacity
    style={[styles.btnPrimary, (!driverSig || !recipientSig) && styles.btnDisabled]}
    onPress={handleCompleteAndShare}
    disabled={submitting || !driverSig || !recipientSig}
    testID="btn-complete-and-share"
  >
    <Text>{submitting ? '처리 중...' : '완료 + 사본 발송'}</Text>
  </TouchableOpacity>

  {retryable && (
    <TouchableOpacity style={styles.btnRetry} onPress={handleCompleteAndShare} testID="btn-retry-copy">
      <Text>재시도</Text>
    </TouchableOpacity>
  )}

  {toast && <Text style={styles.toast} testID="toast-result">{toast}</Text>}
</View>
```

- [ ] **F3.3 — 커밋**

```bash
git add clients/mobile-staff/src/screens/driver/DriverSignatureScreen.tsx
git commit -m "feat(samhan-signature-copy/fe): DriverSignatureScreen 1-tap 완료+발송 + Share Sheet + 5 토스트 (D-DF-07/12)"
```

---

## FE Task F4: DriverSignatureScreen Jest 단위 (6 case)

**Files:**
- Create: `clients/mobile-staff/src/__tests__/screens/driver/DriverSignatureScreen.test.tsx`

- [ ] **F4.1 — Jest test 6 case**

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import DriverSignatureScreen from '../../../screens/driver/DriverSignatureScreen';
import * as api from '../../../api/arologis';

jest.mock('expo-sharing');
jest.mock('expo-file-system');
jest.mock('../../../api/arologis');

describe('DriverSignatureScreen — Phase F', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('두 서명 후 완료 버튼 클릭 → POST + Share Sheet 호출 + success toast', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'success',
      pngBase64: 'iVBOR',
      signatureId: 'uuid-1',
      copySentAt: '2026-05-15T14:30:00',
      copyRecipientPhoneMasked: '010-****-5678',
    });

    const { getByTestId, findByText } = render(<DriverSignatureScreen {...defaultProps} />);
    // 서명 두 개 캡처 (mock SignaturePad)
    fireEvent(getByTestId('sig-driver'), 'sign', 'driverB64');
    fireEvent(getByTestId('sig-recipient'), 'sign', 'recipientB64');

    fireEvent.press(getByTestId('btn-complete-and-share'));

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(await findByText(/010-\*\*\*\*-5678 에게 보내세요/)).toBeTruthy();
  });

  it('RECIPIENT_PHONE_MISSING — Admin 재발송 toast + 재시도 버튼 미표시', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'fail',
      json: { copySent: false, copyFailureReason: 'RECIPIENT_PHONE_MISSING' },
      status: 200,
    });

    const { getByTestId, findByText, queryByTestId } = render(<DriverSignatureScreen {...defaultProps} />);
    fireEvent(getByTestId('sig-driver'), 'sign', 'd');
    fireEvent(getByTestId('sig-recipient'), 'sign', 'r');
    fireEvent.press(getByTestId('btn-complete-and-share'));

    expect(await findByText(/인수자 번호 미등록/)).toBeTruthy();
    expect(queryByTestId('btn-retry-copy')).toBeNull();
  });

  it('RENDERER_TIMEOUT — fail toast + 재시도 버튼 표시', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'fail',
      json: { copySent: false, copyFailureReason: 'RENDERER_TIMEOUT' },
      status: 200,
    });

    const { getByTestId, findByText } = render(<DriverSignatureScreen {...defaultProps} />);
    fireEvent(getByTestId('sig-driver'), 'sign', 'd');
    fireEvent(getByTestId('sig-recipient'), 'sign', 'r');
    fireEvent.press(getByTestId('btn-complete-and-share'));

    expect(await findByText(/RENDERER_TIMEOUT/)).toBeTruthy();
    expect(getByTestId('btn-retry-copy')).toBeTruthy();
  });

  it('409 duplicate — 이미 발송됨 toast', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'duplicate',
      json: { previousCopySentAt: '2026-05-14T10:00:00' },
      status: 409,
    });

    const { getByTestId, findByText } = render(<DriverSignatureScreen {...defaultProps} />);
    fireEvent(getByTestId('sig-driver'), 'sign', 'd');
    fireEvent(getByTestId('sig-recipient'), 'sign', 'r');
    fireEvent.press(getByTestId('btn-complete-and-share'));

    expect(await findByText(/이미 발송됨/)).toBeTruthy();
  });

  it('422 bridge fail — 다시 시도 toast + 재시도 버튼', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'bridge',
      json: { error: 'SIGNATURE_BRIDGE_FAILED:SLIP_SERVICE_REJECTED', retryable: true },
      status: 422,
    });

    const { getByTestId, findByText } = render(<DriverSignatureScreen {...defaultProps} />);
    fireEvent(getByTestId('sig-driver'), 'sign', 'd');
    fireEvent(getByTestId('sig-recipient'), 'sign', 'r');
    fireEvent.press(getByTestId('btn-complete-and-share'));

    expect(await findByText(/서명 양쪽 저장 실패/)).toBeTruthy();
    expect(getByTestId('btn-retry-copy')).toBeTruthy();
  });

  it('서명 미완료 시 완료 버튼 disabled', () => {
    const { getByTestId } = render(<DriverSignatureScreen {...defaultProps} />);
    expect(getByTestId('btn-complete-and-share').props.accessibilityState?.disabled).toBe(true);
  });
});

const defaultProps = {
  token: 'jwt-x',
  dispatchId: 'dispatch-1',
  vehicleSeq: 1,
  stopSeq: 1,
  stopLabel: 'SL-001 대구공조',
};
```

- [ ] **F4.2 — Jest 실행**

Run (PowerShell):
```powershell
cd clients/mobile-staff
npx jest src/__tests__/screens/driver/DriverSignatureScreen.test.tsx
```
Expected: 6 PASS

- [ ] **F4.3 — 커밋**

```bash
git add clients/mobile-staff/src/__tests__/screens/driver/DriverSignatureScreen.test.tsx
git commit -m "test(samhan-signature-copy/fe): DriverSignatureScreen Jest 6 시나리오 (success/skip/timeout/duplicate/bridge/disabled)"
```

---

## FE Task F5: SignaturePhotoScreen → DriverSignatureScreen deep link 활성 (D-DF-13)

**Files:**
- Modify: `clients/mobile-staff/src/screens/driver/SignaturePhotoScreen.tsx` (onUploaded → navigate)
- Modify: `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx` (route 등록 확인)
- Create: `clients/mobile-staff/src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx`

> **참고**: 기존 `SignaturePhotoScreen` 의 onUploaded callback 은 W10-4 deep link 후속이라 코드 주석에 명시되어 있음. 본 task 가 W10-4 활성을 Phase F 와 함께 진행. navigation library (React Navigation) 의 정확한 호출 방식은 FE worker 가 DriverTabNavigator 코드 확인 후 결정 (stack push vs replace).

- [ ] **F5.1 — SignaturePhotoScreen 의 onUploaded 에서 DriverSignatureScreen 으로 navigate**

```typescript
// SignaturePhotoScreen.tsx — 부모 컴포넌트 (DriverTabNavigator 또는 stack screen) 의 navigation prop 사용
// useNavigation 훅 import 추가
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { DriverStackParamList } from '../../navigation/types';

// 함수 내부:
const navigation = useNavigation<StackNavigationProp<DriverStackParamList>>();

// uploadAll 의 success block 갱신:
if (failedCount === 0) {
  Alert.alert('업로드 완료', `사진 ${successResponses.length}장 업로드가 완료되었습니다. 서명 화면으로 이동합니다.`);
  onUploaded?.(successResponses);
  // D-DF-13 — 사진 업로드 완료 후 서명 화면 chain (W10-4 deep link 활성)
  navigation.navigate('DriverSignature', {
    dispatchId: route.params.dispatchId,
    vehicleSeq: route.params.vehicleSeq,
    stopSeq: route.params.stopSeq,
    stopLabel,
    attachmentIds: successResponses.map((r) => r.id),  // 옵션 — 서명 화면이 첨부된 사진 개수 표시
  });
}
```

- [ ] **F5.2 — DriverTabNavigator 에 DriverSignature route 확인 / 추가**

```typescript
// DriverTabNavigator.tsx — Stack.Navigator 에 DriverSignature screen 등록 확인
<Stack.Screen
  name="DriverSignature"
  component={DriverSignatureScreen}
  options={{ title: '전자서명' }}
/>
```

이미 등록되어 있으면 변경 0. 없으면 추가.

- [ ] **F5.3 — chain Jest test 작성 (1 case)**

```tsx
// SignaturePhotoScreenChain.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import SignaturePhotoScreen from '../../../screens/driver/SignaturePhotoScreen';
import * as attachmentApi from '../../../api/attachmentApi';

jest.mock('../../../api/attachmentApi');

it('사진 업로드 완료 시 DriverSignature 로 navigate (D-DF-13 chain)', async () => {
  const navigate = jest.fn();
  jest.mock('@react-navigation/native', () => ({
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => ({ navigate }),
  }));
  (attachmentApi.uploadAttachmentByToken as jest.Mock).mockResolvedValue({
    id: 'att-1', fileName: 'photo.jpg', uploadedAt: '2026-05-15T14:00:00',
  });

  const { getByTestId, findByText } = render(
    <NavigationContainer>
      <SignaturePhotoScreen
        batchToken="token-x" slipNo="SL-001" stopLabel="대구공조"
        defaultType="DELIVERY"
      />
    </NavigationContainer>,
  );

  // 사진 1장 추가 mock + uploadAll 호출
  // ... (PhotoAttachmentCapture mock으로 photos 배열 채우기)
  fireEvent.press(getByTestId('btn-upload-all'));

  await waitFor(() => expect(navigate).toHaveBeenCalledWith('DriverSignature',
    expect.objectContaining({ stopLabel: '대구공조' })));
});
```

- [ ] **F5.4 — Jest 실행 + 커밋**

Run (PowerShell):
```powershell
cd clients/mobile-staff
npx jest src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx
```
Expected: 1 PASS

```bash
git add clients/mobile-staff/src/screens/driver/SignaturePhotoScreen.tsx \
        clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx \
        clients/mobile-staff/src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx
git commit -m "feat(samhan-signature-copy/fe): SignaturePhotoScreen → DriverSignature W10-4 deep link 활성 + chain Jest 1건 (D-DF-13)"
```

---

# Team 3: Designer — 3 mock

## 파일 구조

```
docs/uiux/samhan-signature-copy/
├── 01-signature-screen-1tap.md      (NEW — DriverSignatureScreen 1-tap UI)
├── 02-share-sheet-android.md        (NEW — Android Share Sheet 캡처)
└── 03-share-sheet-ios.md            (NEW — iOS Share Sheet 캡처)
```

## Designer Task D1: 3 mock 작성

**Files:**
- Create: `docs/uiux/samhan-signature-copy/01-signature-screen-1tap.md`
- Create: `docs/uiux/samhan-signature-copy/02-share-sheet-android.md`
- Create: `docs/uiux/samhan-signature-copy/03-share-sheet-ios.md`

- [ ] **D1.1 — 01-signature-screen-1tap.md (DriverSignatureScreen UI)**

기존 SignatureScreen 의 [완료] + [발송] 2-step 을 단일 [완료 + 사본 발송] 1-tap 으로 변경. 인수자 번호 마스킹 표시. wireframe + 토큰 (theme/tokens.ts) + data-testid 명시.

내용 가이드:
```markdown
# Phase F — DriverSignatureScreen 1-tap 완료+발송 mock

## 흐름
- 두 서명 캔버스 → 완료 버튼 단일 → 응답 후 Share Sheet 자동 호출 → 토스트

## 와이어프레임
[ASCII wireframe — 위 spec §7 참조]

## 토큰
- 색상 colors.primary / colors.disabled / colors.toast
- 간격 spacing.lg / spacing.md
- 타이포 typography.h3 / typography.body

## data-testid
- sig-driver / sig-recipient / btn-complete-and-share / btn-retry-copy / toast-result

## 토스트 5종
1. 성공: "서명 저장 완료. 010-****-5678 에게 보내세요"
2. 사본 fail: "서명 저장 완료. 사본 합성 실패 (RENDERER_TIMEOUT) — [재시도]"
3. 번호 없음: "서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요"
4. duplicate: "이미 발송됨 (2026-05-14 14:30). Admin 재발송 필요"
5. bridge: "서명 양쪽 저장 실패 — 다시 시도해 주세요"
```

- [ ] **D1.2 — 02-share-sheet-android.md / 03-share-sheet-ios.md**

각 OS Share Sheet 의 표시 형태 와이어프레임 + 카톡/SMS/이메일 옵션 위치 안내 + 사용자 경로 (카톡 선택 → 인수자 friend 검색 → 전송).

- [ ] **D1.3 — 커밋**

```bash
git add docs/uiux/samhan-signature-copy/
git commit -m "docs(samhan-signature-copy/designer): 3 mock — SignatureScreen 1-tap + Share Sheet Android/iOS"
```

---

# Team 4: DevOps — Docker Playwright + print-renderer 빌드 + env

## 파일 구조

```
services/arologis-service/Dockerfile                              (NEW or 수정 — Playwright + Chromium + fonts-noto-cjk + print-renderer/)
infrastructure/env-templates/arologis-service.env                 (수정 — env 추가)
clients/desktop/
├── vite.config.ts                                                (수정 — multi-entry print-renderer)
├── package.json                                                  (수정 — build:print-renderer script)
└── print-renderer/                                                (NEW)
    ├── index.html                                                 (NEW — entry HTML)
    ├── main.tsx                                                   (NEW — query param 파싱 + OutboundView render)
    └── PrintRendererApp.tsx                                       (NEW — props 주입 wrapper)
```

## DevOps Task DO1: arologis-service Dockerfile — Playwright + Chromium + 한글 폰트

**Files:**
- Create or Modify: `services/arologis-service/Dockerfile`

- [ ] **DO1.1 — Dockerfile multi-stage build**

```dockerfile
# Stage 1: Build print-renderer 정적 산출물
FROM node:20-alpine AS print-renderer-builder
WORKDIR /build
COPY clients/desktop/package.json clients/desktop/package-lock.json ./
RUN npm ci
COPY clients/desktop ./
RUN npm run build:print-renderer
# 산출물: /build/dist/print-renderer/

# Stage 2: arologis-service Java + Playwright + Chromium
FROM eclipse-temurin:17-jdk-jammy AS arologis-runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        # Chromium 의존성 (libnss3 등) + 한글 폰트
        libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
        libcairo2 libasound2 \
        fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/arologis-service/build/libs/arologis-service.jar app.jar

# Playwright Chromium 다운로드 (시작 전 1회)
RUN java -jar /tmp/playwright-cli.jar install chromium || \
    (curl -L https://repo1.maven.org/maven2/com/microsoft/playwright/playwright/1.47.0/playwright-1.47.0.jar \
        -o /tmp/playwright.jar && \
     java -jar /tmp/playwright.jar install chromium --with-deps)

# print-renderer 정적 동봉
COPY --from=print-renderer-builder /build/dist/print-renderer /app/print-renderer

# 사본 PNG 디스크 마운트 포인트
VOLUME ["/var/lib/arologis/signature-copies"]
ENV AROLOGIS_SIGNATURE_COPY_DIR=/var/lib/arologis/signature-copies
ENV AROLOGIS_PRINT_RENDERER_URL=file:///app/print-renderer/index.html
ENV SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false

EXPOSE 8094
ENTRYPOINT ["java", "-jar", "app.jar"]
```

> **참고**: Playwright CLI 설치 명령어는 Maven artifact 또는 Gradle task 활용 (`./gradlew :services:arologis-service:playwrightInstall` 같은 helper task 추가 가능). DevOps worker 가 정확한 install 절차 확정.

- [ ] **DO1.2 — env-templates 갱신**

`infrastructure/env-templates/arologis-service.env` 에 추가:

```env
# Phase F (D-DF-01) — slip-service 양쪽 저장 활성
SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false

# Phase F (D-DF-10) — 사본 PNG 디스크 저장 경로 (Phase 11 cutover 시 S3 키로 갈아탐)
AROLOGIS_SIGNATURE_COPY_DIR=/var/lib/arologis/signature-copies

# Phase F (D-DF-06) — print-renderer 정적 file:// 경로 + Playwright timeout
AROLOGIS_PRINT_RENDERER_URL=file:///app/print-renderer/index.html
AROLOGIS_PLAYWRIGHT_TIMEOUT_MS=8000
```

- [ ] **DO1.3 — 커밋**

```bash
git add services/arologis-service/Dockerfile infrastructure/env-templates/arologis-service.env
git commit -m "feat(samhan-signature-copy/devops): Dockerfile Playwright+Chromium+fonts-noto-cjk + env 4건 (D-DF-01/06/10)"
```

---

## DevOps Task DO2: clients/desktop print-renderer multi-entry 빌드

**Files:**
- Create: `clients/desktop/print-renderer/index.html`
- Create: `clients/desktop/print-renderer/main.tsx`
- Create: `clients/desktop/print-renderer/PrintRendererApp.tsx`
- Modify: `clients/desktop/vite.config.ts`
- Modify: `clients/desktop/package.json`

- [ ] **DO2.1 — print-renderer/index.html**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>Print Renderer (Phase F)</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Noto Sans CJK KR', sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

- [ ] **DO2.2 — print-renderer/main.tsx — query param 파싱**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrintRendererApp } from './PrintRendererApp';

const params = new URLSearchParams(window.location.search);
const slipB64 = params.get('slip');
const driverSig = params.get('driverSig') ?? '';
const recipientSig = params.get('recipientSig') ?? '';

if (!slipB64) {
  document.getElementById('root')!.textContent = 'slip 파라미터 누락';
} else {
  const slipJson = atob(slipB64.replace(/-/g, '+').replace(/_/g, '/'));
  const slipData = JSON.parse(slipJson);

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <PrintRendererApp
      slipData={slipData}
      driverSignatureBase64={driverSig}
      recipientSignatureBase64={recipientSig}
    />,
  );
}
```

- [ ] **DO2.3 — print-renderer/PrintRendererApp.tsx — OutboundView 호출**

OutboundView 를 props 기반으로 호출 (또는 OutboundView 의 데이터 fetch 로직을 mock QueryClient 로 wrap). 가장 단순한 안:

```tsx
import React from 'react';

interface SlipData {
  slipNo: string;
  slipDate: string;
  partnerName: string;
  recipientAddress: string;
  lines: Array<{ itemName: string; spec: string; quantity: number; unitPrice: number; lineTotal: number }>;
  totalSupply: number;
  vat: number;
  total: number;
  sourceWarehouseName: string;
}

interface Props {
  slipData: SlipData;
  driverSignatureBase64: string;
  recipientSignatureBase64: string;
}

export function PrintRendererApp({ slipData, driverSignatureBase64, recipientSignatureBase64 }: Props) {
  return (
    <div className="outbound-page outbound-a4" data-testid="outbound-print-area">
      <header className="outbound-header">
        <div className="outbound-company">삼한공조</div>
        <h1 className="outbound-title">출 고 전 표</h1>
        <div className="outbound-meta-row">
          <span>전표번호: <strong>{slipData.slipNo}</strong></span>
          <span>발행일: {slipData.slipDate}</span>
        </div>
      </header>

      <section className="outbound-partner">
        <p>거래처: {slipData.partnerName}</p>
        <p>배송지: {slipData.recipientAddress}</p>
      </section>

      <table className="outbound-lines">
        <thead>
          <tr><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr>
        </thead>
        <tbody>
          {slipData.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.itemName}</td><td>{l.spec}</td><td>{l.quantity}</td>
              <td>{l.unitPrice.toLocaleString()}</td><td>{l.lineTotal.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="outbound-total">
        <p>공급가: {slipData.totalSupply.toLocaleString()}</p>
        <p>부가세: {slipData.vat.toLocaleString()}</p>
        <p>합계: {slipData.total.toLocaleString()}</p>
      </section>

      <section className="outbound-signatures" style={{ display: 'flex', gap: 24 }}>
        <div>
          <p>기사 서명</p>
          <img src={`data:image/png;base64,${driverSignatureBase64}`} alt="기사 서명" style={{ width: 200, height: 100 }} />
        </div>
        <div>
          <p>인수자 서명</p>
          <img src={`data:image/png;base64,${recipientSignatureBase64}`} alt="인수자 서명" style={{ width: 200, height: 100 }} />
        </div>
      </section>

      <footer className="outbound-footer">
        <p>출고 창고: {slipData.sourceWarehouseName}</p>
      </footer>
    </div>
  );
}
```

> **참고**: 본 구현은 OutboundView 의 디자인을 단순화한 PoC 양식. **drift 0 위해 OutboundView 자체를 props 기반으로 refactor 후 print-renderer 가 그것을 직접 import 하는 것이 이상적** — DevOps worker 가 OutboundView 의 useQuery 사용을 검토하고, refactor 가능 여부 + 작업량 산정 후 (a) 본 PoC 그대로 (drift 위험 — Designer 가 양식 일치 검증) 또는 (b) OutboundView refactor 후 직접 import 결정.

- [ ] **DO2.4 — vite.config.ts multi-entry**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        printRenderer: path.resolve(__dirname, 'print-renderer/index.html'),
      },
    },
  },
});
```

- [ ] **DO2.5 — package.json script**

```json
"scripts": {
  "build:print-renderer": "vite build --outDir dist/print-renderer --emptyOutDir"
}
```

- [ ] **DO2.6 — 빌드 확인**

Run (PowerShell):
```powershell
cd clients/desktop
npm run build:print-renderer
```
Expected: `dist/print-renderer/index.html` + JS/CSS bundle 생성

- [ ] **DO2.7 — 커밋**

```bash
git add clients/desktop/print-renderer/ clients/desktop/vite.config.ts clients/desktop/package.json
git commit -m "feat(samhan-signature-copy/devops): print-renderer multi-entry 빌드 + PrintRendererApp PoC 양식 (D-DF-06)"
```

---

## DevOps Task DO3: Phase 11 메모리/CPU 검증 노트

**Files:**
- Create: `docs/migration/phase11/M-PHASE-11-signature-copy-memory.md`

- [ ] **DO3.1 — 메모리/CPU 검증 노트 작성**

```markdown
# Phase 11 — Signature Copy (Phase F) 메모리/CPU 검증

## 추가 부하
- Chromium per-request: ~150MB heap, ~500MB pool
- arologis-service Java heap: 2GB (기존)
- 합산: ~2.5GB peak (1 동시 발송)

## m5.xlarge 16GB 여유 확인
- Java 2GB + Chromium 0.5GB + RDS 분리 → 잔여 ~12GB+
- 동시 발송 ~3건 가정 시 max ~3GB → 여유 충분

## Cutover 시 storage migration
- AROLOGIS_SIGNATURE_COPY_DIR (현 disk) → S3 (Phase 11)
- 별도 PR 로 진행 — disk → S3 batch upload script + 환경변수 갱신

## 모니터링 alert
- copy_send_failure_count > 5 / 10분 → Slack alert (별도 PR)
```

- [ ] **DO3.2 — 커밋**

```bash
git add docs/migration/phase11/M-PHASE-11-signature-copy-memory.md
git commit -m "docs(samhan-signature-copy/devops): Phase 11 메모리/CPU 검증 노트 + cutover storage migration"
```

---

# Team 5: QA — sequential (BE+FE merge 후)

## 파일 구조

```
docs/qa/samhan-signature-copy/
├── scenarios.md                                                  (NEW — 6 시나리오 + 검증 SQL + 회귀 + 4단계 롤백)
└── screenshots/                                                   (NEW — 실 캡처 PNG)
    ├── 01-signature-1tap-success.png
    ├── 02-share-sheet-android.png
    ├── 03-share-sheet-ios.png
    ├── 04-recipient-phone-missing.png
    ├── 05-renderer-timeout-retry.png
    └── 06-already-sent-409.png
```

## QA Task QA1: 시나리오 작성 + 회귀 절차 + 롤백 runbook

**Files:**
- Create: `docs/qa/samhan-signature-copy/scenarios.md`

- [ ] **QA1.1 — scenarios.md 작성 (6 시나리오)**

Spec §8 의 6 시나리오를 SQL 검증 쿼리 + 예상 응답 + 캡처 의무 (PNG 파일명) 명시:

```markdown
# Phase F QA 시나리오 (sequential — BE+FE merge 후)

## 시나리오 1: 1-tap 완료+발송 success → Share Sheet 호출
1. 기사 어플 로그인 → SL-001 정차 진입
2. 기사 + 인수자 서명 캡처 (각 SignaturePad 에 사인)
3. [완료 + 사본 발송] 탭
4. 응답 200 image/png + Share Sheet 자동 호출
5. 카톡 선택 → 인수자 friend 선택 → 전송
6. 캡처: docs/qa/samhan-signature-copy/screenshots/01-signature-1tap-success.png + 02-share-sheet-android.png + 03-share-sheet-ios.png
7. 검증 SQL:
   SELECT copy_sent_at, copy_image_path, copy_recipient_phone, copy_send_failure_count
   FROM arologis.signatures WHERE id = '<X-Signature-Id>';
   → copy_sent_at NOT NULL, copy_image_path = /var/lib/arologis/signature-copies/<id>.png,
     copy_recipient_phone = 풀 번호, copy_send_failure_count = 0

## 시나리오 2: 두 번째 호출 → 409
1. 시나리오 1 후 같은 endpoint 재호출
2. 응답 409 application/json — { error: "COPY_ALREADY_SENT", previousCopySentAt }
3. 캡처: 06-already-sent-409.png

## 시나리오 3: 인수자 번호 없음 → 200 with RECIPIENT_PHONE_MISSING
1. 테스트용 slip (recipientPhoneNumber=null) 생성
2. 서명 후 [완료 + 사본 발송] 탭
3. 응답 200 application/json — copySent=false + copyFailureReason=RECIPIENT_PHONE_MISSING
4. 토스트: "서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요"
5. 캡처: 04-recipient-phone-missing.png
6. 검증 SQL: copy_sent_at = NULL, slip-service signature_source=APP 확인

## 시나리오 4: Playwright timeout → 200 with RENDERER_TIMEOUT + 재시도 OK
1. PlaywrightConfig timeout 을 100ms 로 임시 단축 (테스트 환경)
2. 서명 후 [완료 + 사본 발송] 탭
3. 응답 200 with RENDERER_TIMEOUT
4. [재시도] 버튼 표시
5. timeout 8000ms 로 복원 후 [재시도] 탭
6. 응답 200 image/png + Share Sheet
7. 캡처: 05-renderer-timeout-retry.png
8. 검증 SQL: copy_send_failure_count = 1, copy_sent_at NOT NULL (재시도 후)

## 시나리오 5: 회귀 PR #99 SignatureIntegrationIT
1. /sign deprecated 호출 → 기존 동작 유지 검증
2. slip-service signature_source=LINK 시나리오 0 결함

## 시나리오 6: 실 PNG 시각 검증
1. 시나리오 1 의 산출 PNG 다운로드 (curl 또는 mobile 화면 캡처)
2. OutboundView 의 a4-portrait variant 와 시각 비교 — 거래처/주소/lines/서명 2개 위치 일치
3. 한글 깨짐 없음 (Noto Sans CJK KR)
4. 1MB 이내 사이즈

## 시나리오 7: 사진 첨부 → 서명 → 완료+발송 e2e (D-DF-13 chain)
1. 정차 도착 → SignaturePhotoScreen 진입
2. 사진 첨부 toggle ON → DELIVERY 유형 → 카메라 또는 갤러리 1~3장 선택 → 자동 1MB 압축 → [업로드]
3. 업로드 완료 → 자동으로 DriverSignatureScreen navigate (W10-4 deep link)
4. 기사 + 인수자 서명 → [완료 + 사본 발송] → 응답 200 image/png + Share Sheet
5. 카톡 선택 → 인수자 friend 선택 → 전송
6. 캡처: docs/qa/samhan-signature-copy/screenshots/07-photo-then-signature-chain.png
7. 검증 SQL (slip-service):
   ```
   SELECT id, file_name, uploaded_at, attachment_type
   FROM slip.slip_attachments WHERE slip_id = '<X-Signature-Id 의 slipId>' AND attachment_type = 'DELIVERY';
   → 1~3 row, attachment_type = 'DELIVERY'
   ```
8. 검증 SQL (arologis): 시나리오 1 의 SQL 와 동일 — copy_sent_at NOT NULL, copy_image_path 등

## 회귀 절차
- arologis-service: gradlew :services:arologis-service:test (단위 ~18 + IT ~6 신규 + 기존 모두)
- slip-service: gradlew :services:slip-service:test (~98 + IT 50+ 보존)
- 양쪽 0 결함 시 통과

## 4단계 롤백 runbook (~80분)
1. FE 회수 (DriverSignatureScreen 의 sign-and-send-copy → /sign 으로 되돌리기) — 20분
2. arologis 회수 (sign-and-send-copy endpoint + Service + Renderer + Storage 제거) — 30분
3. Flyway V11 DROP — 10분
4. Docker 이미지 재배포 (Playwright/Chromium 미포함) — 20분
```

- [ ] **QA1.2 — 커밋**

```bash
git add docs/qa/samhan-signature-copy/scenarios.md
git commit -m "test(samhan-signature-copy/qa): 6 시나리오 + 회귀 + 4단계 롤백 runbook"
```

---

## QA Task QA2: 실 화면 캡처 6장 (sequential)

**Files:**
- Create: `docs/qa/samhan-signature-copy/screenshots/01~06.png`

- [ ] **QA2.1 — 시나리오 1~6 의 실 캡처**

BE/FE merge 완료 후 실 환경 (Docker 가용 시) 또는 mock 환경에서 6장 캡처:
- 01-signature-1tap-success.png — DriverSignatureScreen 완료 직후
- 02-share-sheet-android.png — Android emulator Share Sheet
- 03-share-sheet-ios.png — iOS simulator Share Sheet
- 04-recipient-phone-missing.png — 토스트 + 미발송
- 05-renderer-timeout-retry.png — fail toast + 재시도 버튼
- 06-already-sent-409.png — 409 토스트
- 07-photo-then-signature-chain.png — SignaturePhotoScreen 업로드 → DriverSignatureScreen 자동 진입 (D-DF-13 chain)

> **참고**: 실 캡처 어려운 환경에서는 Designer mock + Playwright e2e 또는 PowerShell System.Drawing mock PNG 활용 ([[feedback_pr_qa_screenshots]] 의 mock fallback 패턴).

- [ ] **QA2.2 — 커밋**

```bash
git add docs/qa/samhan-signature-copy/screenshots/
git commit -m "test(samhan-signature-copy/qa): 실 화면 캡처 6장 (sequential — BE+FE 산출 검증)"
```

---

# TM 통합 + 문서 동기화

## TM Task T1: merge + 문서 갱신 + DECISIONS

**Files:**
- Modify: `migration/decisions/DECISIONS.md` (D-DF-01~12 추가)
- Create: `docs/dev-reports/samhan-signature-copy.md`
- Modify: `services/arologis-service/README.md` (Phase F 섹션 추가)
- Modify: `clients/desktop/README.md` (print-renderer 빌드 안내)
- Modify: `ROADMAP.md` (Phase F 마킹)
- Create: `.claude/memory/project_samhan_signature_copy.md` + Modify `.claude/memory/MEMORY.md`

- [ ] **T1.1 — DECISIONS.md 에 D-DF-01~12 추가 (한국어)**

기존 DECISIONS 표 형식 따라 12 entry 추가.

- [ ] **T1.2 — dev-reports 작성 (3-layer 누적 의무 [[feedback_function_documentation]])**

```markdown
# samhan-signature-copy (Phase F) — dev-report

## 산출 요약
- BE: 18 단위 + 6 IT (신규) + Signature 4 column + V11 + endpoint 1 + Service 3
- FE: 6 Jest 시나리오 + DriverSignatureScreen 갱신 + expo-sharing/expo-file-system 도입
- Designer: 3 mock
- DevOps: Dockerfile Playwright + Chromium + fonts-noto-cjk + print-renderer multi-entry
- QA: 6 시나리오 + 실 캡처 6장 + 회귀 0 결함 + 4단계 롤백

## D-DF-01~12 결정 요약 (spec 참조)

## 후속
- Admin 재발송 PR
- KakaoLink SDK deep link 검토 (사용자 피드백 후)
- /sign 완전 제거 (1~2 분기 후)
- Phase 11 cutover 시 disk → S3 마이그레이션 PR
```

- [ ] **T1.3 — README + ROADMAP + 메모리 갱신**

- arologis-service README: Phase F 섹션 (Playwright + Chromium 설치 안내)
- desktop README: print-renderer 빌드 안내 (`npm run build:print-renderer`)
- ROADMAP: Phase F 완료 마킹
- `.claude/memory/project_samhan_signature_copy.md` 신규 + MEMORY.md hook 추가

- [ ] **T1.4 — 양 PC sync (회사 PC → 집 PC 동기화 의무)**

```powershell
.\scripts\sync-claude-memory.ps1
```

- [ ] **T1.5 — 컴파일/회귀 풀빌드 검증 ([[feedback_pm_integration_build_check]])**

Run: `gradlew :services:arologis-service:test :services:slip-service:test`
Expected: 0 failure 양쪽

- [ ] **T1.6 — 통합 commit + push**

```bash
git add migration/decisions/DECISIONS.md docs/dev-reports/samhan-signature-copy.md \
        services/arologis-service/README.md clients/desktop/README.md ROADMAP.md \
        .claude/memory/project_samhan_signature_copy.md .claude/memory/MEMORY.md
git commit -m "docs(samhan-signature-copy/tm): DECISIONS D-DF-01~12 + dev-report + README + ROADMAP + 메모리 동기화"
git push origin feat/samhan-signature-copy-spec
```

---

## TM Task T2: PR 발행

- [ ] **T2.1 — PR 본문 작성 + gh pr create**

PR 제목 (한국어): `feat(samhan-signature-copy): Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~12)`

PR 본문에 포함:
- 12 결정 표 (spec §2 참조)
- 5-team scope 표
- QA 6 시나리오 + 실 캡처 인라인 6장 ([[feedback_pr_qa_screenshots]])
- 4단계 롤백 runbook
- 연관 Issue 명시
- 회귀 통과 결과

```bash
gh pr create --base main --head feat/samhan-signature-copy-spec \
  --title "feat(samhan-signature-copy): Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~12)" \
  --body "$(cat <<'EOF'
## 요약
- 12 결정 표 + 5-team scope + QA 캡처 6장 (인라인) + 회귀 0 결함

## 12 결정 (D-DF-01~12)
[표]

## 변경 파일
- BE: arologis-service 신규 7 + 수정 2 + V11
- FE: mobile-staff DriverSignatureScreen + api/arologis.ts + Jest 6
- Designer: 3 mock
- DevOps: Dockerfile + print-renderer multi-entry + env

## QA 캡처
![](docs/qa/samhan-signature-copy/screenshots/01-signature-1tap-success.png)
... (6장)

## 회귀
- arologis-service: 단위 ~18 + IT ~6 신규 + 기존 모두 통과
- slip-service: ~98 + IT 50+ 보존

## 롤백
4단계 ~80분 (FE 회수 → arologis 회수 → V11 DROP → Docker 재배포)

## 연관 Issue
#XXX (Phase F)
EOF
)"
```

- [ ] **T2.2 — CI watch 시작**

Run (background): `gh pr checks <PR번호> --watch`

- [ ] **T2.3 — GitGuardian false positive 처리 (PM 자동, [[feedback_gitguardian_false_positive]])**

GitGuardian 알림 시 자동 판정 후 머지 진행 (signature base64 등 false positive 대비).

---

## PM Task P1: 5-team agent 토론 + 머지 요청

- [ ] **P1.1 — 5-team reviewer agent 디스패치 ([[feedback_tm_led_agent_discussion]])**

PR 발행 후 5 team 의 reviewer agent (BE/FE/Designer/QA/DevOps) 가 PR comment 로 토론. TM 이 종합하여 추가 commit.

- [ ] **P1.2 — 머지 요청 ([[feedback_user_merge_authority]])**

5-team 0 결함 + CI green 시 PM 자동 머지 또는 개발책임자 머지 요청.

---

## 12 weak spot ↔ task 매핑 (spec coverage)

| weak spot | task |
|---|---|
| W1 partial fail (Tx1 atomic + Tx2 best effort) | B5 (Service orchestration) + B12 (AtomicFailIT) |
| W2 1회 가드 = download 시각 | B1 (Signature.markCopySent) + B9 (DuplicateIT) |
| W3 Aligo 폐기 — Share Sheet | F3 (Share Sheet 호출) + Aligo 코드 0 |
| W4 fonts-noto-cjk Docker | DO1 (Dockerfile) |
| W5 RECIPIENT_PHONE_MISSING | B5 + B10 (MissingPhoneIT) |
| W6 /sign deprecate | B7 (Controller 갱신) |
| W7-a 권한 driverId 검증 | B5 (SecurityException) + B7 @PreAuthorize |
| W7-b PNG = 출고전표 양식 | DO2 (print-renderer) + B3 (Renderer) |
| W7-c 마스킹 | B5 (maskPhone) + B7 (X-Header) |
| D-DF-06 Playwright Chromium | B3 (Renderer) + DO1 (Dockerfile) + DO2 (print-renderer) |
| W8 disk path 보관 | B2 (DiskStorage) + DO1 (env) |
| W9 A4 portrait ~600x850 | B3 (viewport) + DO2 (PrintRendererApp 양식) |
| W10 응답 PNG byte[] | B7 (image/png response) |
| W11 expo-sharing | F1 (의존성) + F3 (Sharing.shareAsync) |
| W12 download = sent | B5 (markCopySent in success branch) |
| W13 사진 첨부 통합 (D-DF-13) | F5 (SignaturePhotoScreen → DriverSignatureScreen chain) + QA 시나리오 7 |

---

## Self-Review Notes

- **Spec coverage**: 12 결정 모두 task 매핑 (위 표). gap 없음.
- **Placeholder scan**: BE worker 가 SlipResolver 의 정확한 method signature, OutboundView refactor 옵션 (a/b), Playwright install 절차 확정 — `> 참고` 블록으로 명시. 본 plan 은 핵심 코드 모두 포함.
- **Type consistency**: SignAndSendCopyRequest / SignAndSendCopyResponse / SignAndSendCopyResult / CopyFailureReason 일관 사용. PlaywrightCopyRenderer.RendererTimeoutException / RendererErrorException 명명 일관.
- **Scope check**: Phase A/C 와 동급. 단일 plan + 단일 PR 가능. 만약 PR 너무 크면 TM 이 F1 (skeleton-mode false 단독) + F2 (PNG 합성+Share) 분할 검토 가능 (옵션).

---

## 후속

본 PR 머지 후:
1. Admin 재발송 endpoint PR (별도 spec)
2. KakaoLink SDK deep link 검토 PR (사용자 피드백 수집 후)
3. /sign 완전 제거 PR (1~2 분기 후)
4. Phase 11 disk → S3 cutover PR (Phase 11 시점)
5. copy_send_failure_count alert PR (모니터링)
