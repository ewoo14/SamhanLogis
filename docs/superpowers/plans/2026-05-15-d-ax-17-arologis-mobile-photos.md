# D-AX-17 arologis-mobile photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated, UUID-free delivery and inspection photo upload to `clients/arologis-mobile`.

**Architecture:** The mobile app posts photos against the same today stop target introduced in D-AX-16. `arologis-service` verifies driver ownership and resolves the internal slip; `slip-service` persists attachments through an internal token endpoint. The mobile response strips UUIDs and download URLs.

**Tech Stack:** Spring Boot 3.3, Java 17, RestClient multipart, React Native Expo SDK 53, Jest/RTL, Playwright static screenshot generation.

---

### Task 1: Backend Photo Bridge

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java`
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipClient.java`
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisDriverAppController.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/dto/photo/DriverPhotoUploadResponse.java`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/controller/ArologisDriverAppControllerTest.java`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/client/SlipClientTest.java`

- [ ] **Step 1: Write controller test**

Add a test that calls `uploadStopPhotoToday(NIGHT, 1, 1, DELIVERY, request, file, 4321L, ...)` and asserts:

```java
assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
assertThat(response.getBody().getData().attachmentType()).isEqualTo("DELIVERY");
assertThat(response.getBody().getData().fileName()).isEqualTo("delivery.jpg");
assertThat(response.getBody().getData().toString()).doesNotContain(slipId.toString());
assertThat(response.getBody().getData().toString()).doesNotContain(attachmentId.toString());
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest
```

Expected: compile failure because photo DTO/endpoint do not exist.

- [ ] **Step 3: Add DTO and endpoint**

Add a UUID-free `DriverPhotoUploadResponse` record and a multipart controller method. Reuse D-AX-16 driver resolution and today target narrowing.

- [ ] **Step 4: Add SlipClient multipart upload**

Use `LinkedMultiValueMap`, `ByteArrayResource#getFilename`, and `X-Internal-Token` to call:

```http
POST /internal/slips/{slipId}/attachments
```

Parse `ApiResponse.data` and return a compact internal record.

- [ ] **Step 5: Add slip-service internal endpoint**

Accept `type`, `file`, GPS, `capturedAt`, and `uploadedBy`. Reject types outside DELIVERY/INSPECTION. Call `SlipAttachmentService.upload`.

- [ ] **Step 6: Run backend targeted tests**

Run:

```powershell
.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --tests com.samhanair.logis.arologis.client.SlipClientTest
```

Expected: PASS.

### Task 2: Frontend Photo Flow

**Files:**
- Modify: `clients/arologis-mobile/package.json`
- Modify: `clients/arologis-mobile/package-lock.json`
- Modify: `clients/arologis-mobile/src/api/arologis.ts`
- Modify: `clients/arologis-mobile/src/screens/driver/DriverDashboardScreen.tsx`
- Modify: `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`
- Create: `clients/arologis-mobile/src/components/PhotoAttachmentCapture.tsx`
- Create: `clients/arologis-mobile/src/screens/driver/DriverPhotoScreen.tsx`
- Test: `clients/arologis-mobile/src/__tests__/screens/driver/DriverPhotoScreen.test.tsx`

- [ ] **Step 1: Add failing Jest test**

Test target guard, upload success, partial failure retry, and UUID-free visible text.

- [ ] **Step 2: Add Expo dependencies**

Run:

```powershell
cd clients\arologis-mobile
npx expo install expo-image-picker expo-image-manipulator
```

Expected: SDK 53 compatible versions in `package.json` and `package-lock.json`.

- [ ] **Step 3: Add API function**

Create `uploadStopPhoto` with FormData and no manual `Content-Type` header.

- [ ] **Step 4: Add photo capture component and screen**

Implement camera/gallery capture, preview, delete, segmented type, upload all, and retry.

- [ ] **Step 5: Wire dashboard and navigator**

Add `사진` action beside `서명`, pass a `PhotoTarget`, and show `DriverPhotoScreen`.

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
cd clients\arologis-mobile
npm test -- DriverPhotoScreen.test.tsx --runInBand
npm run typecheck
npx expo install --check
```

Expected: PASS.

### Task 3: QA Evidence

**Files:**
- Create: `qa/playwright/scripts/generate-d-ax-17-arologis-mobile-photos-screenshots.mjs`
- Create: `scripts/generate-d-ax-17-arologis-mobile-photos-screenshots.ps1`
- Create: `docs/qa/d-ax-17-arologis-mobile-photos/scenarios.md`
- Create: `docs/qa/d-ax-17-arologis-mobile-photos/domain-integrity-check.md`
- Create: `docs/dev-reports/d-ax-17-arologis-mobile-photos.md`

- [ ] **Step 1: Add screenshot generator**

Generate 10 PNGs covering contract, dashboard action, empty guard, delivery/inspection capture, upload progress, success, retry, mapping failure, and verification matrix.

- [ ] **Step 2: Add QA docs**

Document scenario matrix and split SQL checks for `arologis-service` and `slip-service`.

- [ ] **Step 3: Run screenshot generator**

Run:

```powershell
.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1
```

Expected: 10 screenshots in `docs/qa/d-ax-17-arologis-mobile-photos/screenshots`.

### Task 4: Final Verification

**Files:**
- Modify: `docs/handoff/CURRENT-WORK.md`
- Modify: `migration/decisions/DECISIONS.md`

- [ ] **Step 1: Run backend Docker verification**

Run:

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test --no-daemon --rerun-tasks
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run:

```powershell
cd clients\arologis-mobile
npm test -- DriverPhotoScreen.test.tsx --runInBand
npm run typecheck
npx expo install --check
```

Expected: PASS.

- [ ] **Step 3: Update handoff and decision log**

Record D-AX-17 implementation, validation, screenshot list, and next candidates.
