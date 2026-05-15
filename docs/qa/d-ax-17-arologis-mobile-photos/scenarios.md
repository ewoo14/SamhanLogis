# D-AX-17 arologis-mobile DELIVERY / INSPECTION photos QA

## Scope

D-AX-17 은 `clients/arologis-mobile` 에 기사용 현장 사진 첨부 흐름을 이식한다.
사진 저장소는 slip-service `slip_attachments` 를 사용하되, 기사 앱 API/UI 는 내부 UUID 를 노출하지 않는다.

## Target contract

기사 앱은 오늘 배차에서 내려온 공개 target 만 사용한다.

- Target fields: `dispatchType`, `vehicleSequence`, `stopSequence`, `parsedKakaoSeq`
- Display fields: 거래처명, 주소, 차량 라벨, 정차 상태, 카톡 순번
- Forbidden in driver-facing API/UI: `dispatchId`, `vehicleId`, `stopId`, `slipId`, `attachmentId`, `downloadUrl`
- Upload endpoint shape: `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}`
- Path `photoType`: `DELIVERY` or `INSPECTION`
- Multipart fields: `file`, `capturedAt`, `exifGpsLat`, `exifGpsLng`, `parsedKakaoSeq`
- Success response is UUID-free and contains only photo/attachment type, `fileName`, `fileSize`, `contentType`, `uploadedAt`, `capturedAt`, optional GPS metadata, and retry/display state.
- Slip mapping failure returns `422 application/json` with a mapping failure code such as `SLIP_MAPPING_NOT_FOUND`, and no `slip_attachments` row is inserted.

## Scenarios

| ID | Case | Expected |
|---|---|---|
| Q1 | UUID-free today photo target API | Today response or photo-target response includes `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` and display labels only. JSON snapshot contains no `dispatchId`, `vehicleId`, `stopId`, `slipId`, or `attachmentId`. |
| Q2 | UUID-free UI target selection | Dashboard stop card shows partner/address/status/카톡 순번 and `배송사진` / `검수사진` actions. Route params and visible text do not expose UUID-like values. |
| Q3 | DELIVERY max 3 | DELIVERY mode accepts camera/gallery preview up to 3 photos. A fourth add attempt is blocked client-side with max-count copy and no upload request. |
| Q4 | INSPECTION max 5 | INSPECTION mode accepts camera/gallery preview up to 5 photos. A sixth add attempt is blocked client-side with max-count copy and no upload request. |
| Q5 | Camera/gallery preview | Camera capture and gallery selection both normalize to preview items with thumbnail, file name, MIME, capturedAt, optional EXIF GPS, and remove action before upload. |
| Q6 | Upload progress | Batch upload shows per-photo pending/uploading/success/fail state. Progress text uses counts, not UUIDs. Buttons are disabled while the active photo is uploading. |
| Q7 | Upload success | Successful DELIVERY/INSPECTION upload persists to slip-service `slip_attachments`, returns UUID-free response, marks the preview item success, and keeps the user on the same target for additional allowed photos. |
| Q8 | Partial failure / retry | If N photos are selected and one upload fails, successful photos remain success, failed photos show retry, and retry sends only failed photos. Duplicate successful uploads are not re-sent. |
| Q9 | `parsedKakaoSeq` target narrowing | Two same-day vehicles/stops with the same `vehicleSequence` and `stopSequence` but different `parsedKakaoSeq` resolve to the selected stop only. Missing or mismatched `parsedKakaoSeq` returns 400/422 and does not upload. |
| Q10 | Slip mapping failure -> 422 | When `parsedKakaoSeq` cannot resolve to a slip-service slip, upload returns 422 mapping failure JSON (`SLIP_MAPPING_NOT_FOUND` in the current implementation); UI shows "전표 매핑 실패" retry/help state and does not claim upload success. |
| Q11 | Type/count server guard | Backend rejects unsupported `photoType`, DELIVERY count > 3, and INSPECTION count > 5 even if the client is bypassed. The rejection leaves existing successful rows unchanged. |
| Q12 | Regression evidence | Backend Docker/Testcontainers, frontend typecheck/Jest/Expo dependency check, domain integrity SQL, and screenshot generation all have PR evidence. |

## Backend verification

Run the full backend test set with Docker/Testcontainers enabled:

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'
.\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks
```

Notes:

- arologis-service IT must use Testcontainers PostgreSQL 16-alpine through `AbstractPostgresIT`.
- External RestClient integrations must be isolated with `@MockBean` and lenient stubs.
- On Windows Docker Desktop npipe-only machines, the IT may skip per repo guard; retry with `DOCKER_HOST=tcp://localhost:2375` before accepting a skip.

## Frontend verification

```powershell
Push-Location clients\arologis-mobile
npm run typecheck
npm test -- DriverPhotoScreen.test.tsx arologisPhotoUpload.test.ts --runInBand
npx expo install --check
Pop-Location
```

Expected:

- TypeScript enforces UUID-free photo target/request/response DTOs.
- Jest covers max counts, camera/gallery preview, progress, success, partial failure retry, `parsedKakaoSeq` narrowing, and 422 mapping failure UI.
- Expo dependency check passes after camera/gallery/photo manipulation dependencies are installed.

## Screenshots

Generate PR screenshots:

```powershell
.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1
```

Required files:

| File | Evidence |
|---|---|
| `screenshots/01-today-photo-target-contract.png` | UUID-free today target JSON and forbidden-key guard |
| `screenshots/02-dashboard-photo-and-signature-buttons.png` | Stop card photo actions without UUIDs |
| `screenshots/03-photo-empty-target-guard.png` | Photo tab empty-target guard |
| `screenshots/04-delivery-photo-capture-preview.png` | DELIVERY camera preview and max 3 guard |
| `screenshots/05-inspection-type-switch-max-count.png` | INSPECTION type switch and max 5 guard |
| `screenshots/06-upload-progress.png` | Per-photo upload progress |
| `screenshots/07-upload-success-uuid-free-response.png` | Successful slip attachment response without UUID exposure |
| `screenshots/08-partial-failure-retry.png` | Partial failure and retry-only-failed flow |
| `screenshots/09-slip-mapping-failure-422.png` | Slip mapping failure -> 422 UI |
| `screenshots/10-verification-matrix.png` | Backend/frontend/domain/screenshot verification summary |

## PR acceptance checklist

- [ ] PR body embeds at least one D-AX-17 screenshot inline.
- [ ] UI copy and screenshots expose slip number / 카톡 순번 / 거래처명 only, never UUIDs.
- [ ] DELIVERY cannot exceed 3 active photos for the target slip.
- [ ] INSPECTION cannot exceed 5 active photos for the target slip.
- [ ] 422 mapping failure leaves `slip_attachments` unchanged.
- [ ] Domain integrity SQL in `domain-integrity-check.md` returns expected 0-row anomaly sets.
