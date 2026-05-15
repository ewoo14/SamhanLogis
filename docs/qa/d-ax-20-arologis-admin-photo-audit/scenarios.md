# D-AX-20 QA 시나리오 — arologis admin photo audit

## 범위

- 대상: 아로로지스 관리자 사진 감사 화면 및 PR 본문용 증거 캡처.
- 목표: 기사 앱에서 업로드된 DELIVERY / INSPECTION 사진을 관리자가 검토할 때, 필터/썸네일/재업로드 후보/GPS/audit metadata 를 확인하되 개인정보, UUID, token, raw download URL 을 노출하지 않는다.
- 캡처 방식: 실제 앱 의존 없이 deterministic Playwright HTML 을 렌더링해 PNG 를 생성한다.

## 시나리오

| # | 시나리오 | 기대 결과 | 증거 |
|---|---|---|---|
| 1 | scope / contract 확인 | 관리자 화면은 전표번호, 거래처명, 사진 유형, 공개 상태값만 표시하고 내부 식별자와 원본 저장 경로를 숨긴다. | `screenshots/01-scope-contract.png` |
| 2 | 필터 + 목록 테이블 | 날짜, 사진 유형, 상태, 거래처 검색 필터가 표 상단에 있고 결과 row 는 공개 비즈니스 식별자로만 구분된다. | `screenshots/02-filter-table.png` |
| 3 | 썸네일 no-url | 썸네일은 검토용 preview 로만 표시되며 raw URL, storage key, token 문구가 보이지 않는다. | `screenshots/03-thumbnail-no-url.png` |
| 4 | 재업로드 후보 badge | 저용량, GPS 누락, 메타데이터 누락 같은 후보가 badge 와 사유 목록으로 명확히 보인다. | `screenshots/04-reupload-candidate-badge.png` |
| 5 | GPS / audit metadata | GPS 는 좌표 없이 있음/없음과 권역 수준으로만 표시되고, audit 는 작성자 표시명/시각/행위만 보여준다. | `screenshots/05-gps-audit-metadata.png` |
| 6 | 검증 매트릭스 | SQL, Playwright, privacy guard, PR inline attachment 기준이 한 장에 요약된다. | `screenshots/06-verification-matrix.png` |
| 7 | PR 첨부 체크리스트 | PR 본문에 붙일 캡처 7장과 금지 노출 기준을 확인할 수 있다. | `screenshots/07-pr-inline-capture-checklist.png` |

## 검증 명령

```powershell
.\scripts\generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1

Get-ChildItem docs\qa\d-ax-20-arologis-admin-photo-audit\screenshots\*.png |
  Sort-Object Name |
  Select-Object Name, Length

Push-Location clients\desktop
npx.cmd playwright test playwright/photo-audit/photo-audit.spec.ts --reporter=line
Pop-Location
```

## PASS 기준

- PNG 가 `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/` 아래 7장 생성된다.
- generator 출력의 모든 이미지가 `1360x920` 이며 각 파일 크기는 25KB 초과다.
- generator 자체 privacy guard 가 통과한다.
  - 캡처 HTML 에 UUID 패턴, `http://`, `https://`, `Bearer`, `token`, `downloadUrl`, `storageKey`, `presigned` 가 없어야 한다.
  - 캡처 HTML 에 내부 audit rule id (`LOW_FILE_SIZE`, `GPS_MISSING`, `CAPTURED_AT_MISSING`) 가 없어야 한다.
- 캡처 화면에는 실제 개인정보, 내부 UUID, 인증 token, raw URL, object storage key 를 넣지 않는다.
- PR 본문에는 위 PNG 중 최소 1장 이상을 인라인 첨부하고, 권장은 6장 이상 첨부다.

## PR 캡처 목록

| 파일 | 목적 |
|---|---|
| `screenshots/01-scope-contract.png` | D-AX-20 관리자 사진 감사 범위와 비노출 계약 |
| `screenshots/02-filter-table.png` | 필터 바와 audit result table |
| `screenshots/03-thumbnail-no-url.png` | 썸네일 표시 시 raw URL/token/storage key 비노출 |
| `screenshots/04-reupload-candidate-badge.png` | 재업로드 후보 badge 및 사유 |
| `screenshots/05-gps-audit-metadata.png` | GPS 좌표 미노출과 audit metadata |
| `screenshots/06-verification-matrix.png` | 검증 명령/증거/판정 매트릭스 |
| `screenshots/07-pr-inline-capture-checklist.png` | PR 본문 인라인 첨부 체크리스트 |
