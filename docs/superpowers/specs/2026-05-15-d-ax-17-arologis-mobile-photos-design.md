# D-AX-17 arologis-mobile photos Design

## Context

D-AX-15 moved the arologis driver dashboard and GPS flow into `clients/arologis-mobile`.
D-AX-16 added the UUID-free stop target and signature copy flow. The next recommended
slice is delivery and inspection photo upload for the same stop target.

The existing `clients/mobile-staff` photo flow uses delivery batch tokens and slip numbers.
That path is not copied as-is because `clients/arologis-mobile` is an authenticated driver app
whose current contract exposes only `dispatchType`, `vehicleSequence`, `stopSequence`, and
`parsedKakaoSeq`. The server must resolve the internal slip ID.

## Options

1. Recommended: authenticated today-stop photo API.
   The mobile app posts photos to an arologis UUID-free endpoint. The service verifies the
   logged-in driver, today's dispatch, vehicle sequence, stop sequence, and optional
   `parsedKakaoSeq`, then resolves the internal slip and stores the attachment through
   slip-service.

2. Copy the `mobile-staff` token flow.
   This would reuse more code, but it requires a delivery batch token/slip number contract
   that the arologis driver app does not currently own.

3. UI-only photo capture.
   This is fast but leaves the real evidence path incomplete and creates another follow-up
   slice before users can test the workflow.

Decision: use option 1.

## API Design

Add a driver-facing endpoint:

```http
POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}
Content-Type: multipart/form-data
```

Path values use public/business target fields only. `photoType` accepts `DELIVERY` and
`INSPECTION`.

Multipart fields:

- `file`: image file.
- `parsedKakaoSeq`: optional numeric guard, used to narrow the stop target.
- `exifGpsLat`, `exifGpsLng`: optional GPS metadata.
- `capturedAt`: optional ISO local date-time.

Success response is UUID-free:

```json
{
  "success": true,
  "data": {
    "attachmentType": "DELIVERY",
    "fileName": "delivery-20260515-001.jpg",
    "fileSize": 421312,
    "contentType": "image/jpeg",
    "capturedAt": "2026-05-15T13:40:00",
    "uploadedAt": "2026-05-15T13:41:02"
  }
}
```

Failure responses:

- `400 INVALID_INPUT`: invalid type, bad metadata, empty file, ambiguous target.
- `403 FORBIDDEN`: logged-in account is not a registered arologis driver.
- `422 SLIP_MAPPING_NOT_FOUND`: stop target is valid but slip-service mapping is unavailable.
- `502 SLIP_ATTACHMENT_UPLOAD_FAILED`: slip-service upload failed or skeleton mode is active.

## Backend Design

`arologis-service` owns driver authorization and target resolution. It reuses the D-AX-16
today target rules and `SlipResolver.resolveSlipId(stop)`.

`slip-service` owns attachment persistence. Add an internal multipart endpoint under
`/internal/slips/{slipId}/attachments`, protected by `X-Internal-Token`, so arologis-service
does not call user-facing slip endpoints with spoofed gateway headers.

The internal slip response may contain attachment UUIDs, but the arologis driver response must
strip `id`, `slipId`, and `downloadUrl`.

## Frontend Design

`clients/arologis-mobile` adds an independent photo capture component. It may reuse the shape
of the `mobile-staff` implementation but cannot import from `clients/mobile-staff`.

Dashboard stop rows show both `사진` and `서명` actions. `UNPARSED` stops disable both because
the server cannot map them reliably.

The photo screen has:

- target guard when no stop is selected.
- DELIVERY/INSPECTION segmented control.
- max 3 delivery photos and max 5 inspection photos.
- camera/gallery capture, preview, delete.
- upload all and retry failed items.
- Korean mapping/upload failure messages.
- no UUID, slip ID, attachment ID, or presigned download URL shown.

## Testing

Backend:

- controller test for UUID-free today photo target and response.
- controller test for `parsedKakaoSeq` mismatch.
- SlipClient multipart test for internal path, token header, and type field.
- Docker/Testcontainers full `:services:arologis-service:test`.

Frontend:

- photo screen target guard.
- upload API path includes `dispatchType`, vehicle/stop sequences, `photoType`, and
  `parsedKakaoSeq`.
- success and partial failure/retry UI.
- typecheck and Expo dependency check.

QA:

- at least 10 PR-visible screenshots.
- domain integrity SQL split by `arologis-service` and `slip-service` because cross-DB joins
  are not available.
