# #896 P0 골든·열 계약·적재 manifest 고정

작성일: 2026-08-08  
범위: `docs/dev-reports/2026-08-08-896-migration-plan.md` §0, §1.2, §2 P0, §3

## 결과

코드 동작, DB, Google Sheets, 기존 QA 산출물은 변경하지 않았다. 새 산출물은 저장된 sheet parity run2를 바이트 그대로 복제한 골든과, 저장소 기준선의 행/JSON 좌표를 고정한 manifest다.

실행 명령:

```powershell
node scripts/generate-896-p0-golden-manifest.mjs
```

저장 경로는 모두 명령의 작업 디렉터리 기준 상대경로다. SA 키, DB 쓰기, Sheets 쓰기, git 명령은 사용하지 않았다.

## 새 산출물

- `scripts/generate-896-p0-golden-manifest.mjs`
- `docs/qa/896-p0-golden-manifest/manifest.json`
- `docs/qa/896-p0-golden-manifest/input-manifest.jsonl`
- `docs/qa/896-p0-golden-manifest/golden/SHA256SUMS.txt`
- `docs/qa/896-p0-golden-manifest/golden/01-catalog-and-categories.json`
- `docs/qa/896-p0-golden-manifest/golden/02-set-expansion.json`
- `docs/qa/896-p0-golden-manifest/golden/03-options-features-defaults.json`
- `docs/qa/896-p0-golden-manifest/golden/04-quantity-derived.json`
- `docs/qa/896-p0-golden-manifest/golden/05-price-scenarios.json`
- `docs/qa/896-p0-golden-manifest/golden/06-toggle-off-on.json`

## 고정한 입력 총계와 열 계약

| 항목 | 결과 |
|---|---:|
| GAS 수식 items | 3,392 |
| 실질 그룹 | 2,648 |
| groups 전체(종료 마커 포함) | 2,649 |
| DATA_OK / DATA_PARTIAL / CODE_ONLY / UNKNOWN | 524 / 551 / 1,560 / 14 |
| 주 시트 탭 / 코드 read 탭 | 27 / 17 |
| 카탈로그 참조 모델(모델·setModel 합집합) | 1,118 |
| 가격 셀 | 8,094 |

열 계약은 `manifest.json.columnContract`에 고정했다. 카탈로그, 세트 구성품, 특징, 가격 시나리오, 단가변동 토글, provenance 열을 각각 명시했다. 저장된 기준선 JSON에서 실제 소비된 스펙 키/값은 `capacity` 2,735/78종, `spec` 1,995/227종, `note` 103/35종으로 고정했다.

## 재현성 확인 원문

같은 명령을 연속 두 번 실행했다. 두 실행 모두 동적 시각값을 쓰지 않으며, 아래는 각 실행의 stdout 원문이다.

### 실행 1

```text
{
  "outputDirectory": "docs/qa/896-p0-golden-manifest",
  "goldenFiles": [
    { "file": "golden/01-catalog-and-categories.json", "sha256": "457116d968bbd55e8d2267f7ceb4c1ed36fd7892f851d16dc0b5884cb2a6afd4" },
    { "file": "golden/02-set-expansion.json", "sha256": "c8f85e9320722c75f4800ef914cd1b86856cbf32e6ba512acb1f0e475615da97" },
    { "file": "golden/03-options-features-defaults.json", "sha256": "04406c58181addd354ccdf17a4db3dc05bc7813eb9122a657a65aa99e89460e3" },
    { "file": "golden/04-quantity-derived.json", "sha256": "313de591afddc779799a8460fc92f832d8f33da22099c4d83360eeeaa3086db9" },
    { "file": "golden/05-price-scenarios.json", "sha256": "f8309be614b67f0b13df07b0d87b4017cfaf0b8441c069713afad07edc9d47e8" },
    { "file": "golden/06-toggle-off-on.json", "sha256": "b09c30363fea710439a08c6ca25f3bedde20bba1781f079657ca7f8135938fd9" }
  ],
  "manifestSha256": "dc309a488d3c5b6e8ce8c8bb593f4f817be910060fc79b98acad332fadc6e8b8",
  "inputManifestSha256": "66d6a2200003f8072d949144d475835299d5e84e31444098faafb3f6d01ec1bc",
  "sourceRecords": 4186,
  "groupStatusCounts": { "DATA_OK": 524, "DATA_PARTIAL": 551, "CODE_ONLY": 1560, "UNKNOWN": 14 }
}
```

### 실행 2

```text
{
  "outputDirectory": "docs/qa/896-p0-golden-manifest",
  "goldenFiles": [
    { "file": "golden/01-catalog-and-categories.json", "sha256": "457116d968bbd55e8d2267f7ceb4c1ed36fd7892f851d16dc0b5884cb2a6afd4" },
    { "file": "golden/02-set-expansion.json", "sha256": "c8f85e9320722c75f4800ef914cd1b86856cbf32e6ba512acb1f0e475615da97" },
    { "file": "golden/03-options-features-defaults.json", "sha256": "04406c58181addd354ccdf17a4db3dc05bc7813eb9122a657a65aa99e89460e3" },
    { "file": "golden/04-quantity-derived.json", "sha256": "313de591afddc779799a8460fc92f832d8f33da22099c4d83360eeeaa3086db9" },
    { "file": "golden/05-price-scenarios.json", "sha256": "f8309be614b67f0b13df07b0d87b4017cfaf0b8441c069713afad07edc9d47e8" },
    { "file": "golden/06-toggle-off-on.json", "sha256": "b09c30363fea710439a08c6ca25f3bedde20bba1781f079657ca7f8135938fd9" }
  ],
  "manifestSha256": "dc309a488d3c5b6e8ce8c8bb593f4f817be910060fc79b98acad332fadc6e8b8",
  "inputManifestSha256": "66d6a2200003f8072d949144d475835299d5e84e31444098faafb3f6d01ec1bc",
  "sourceRecords": 4186,
  "groupStatusCounts": { "DATA_OK": 524, "DATA_PARTIAL": 551, "CODE_ONLY": 1560, "UNKNOWN": 14 }
}
```

두 실행의 산출물 전체 SHA 비교 원문:

```text
REPRODUCIBILITY_DIFF_COUNT=0
```

최종 산출물의 SHA는 `golden/SHA256SUMS.txt`와 `manifest.json`의 `golden` 배열에 직접 계산해 기록했다. 기존 `896-legacy-output-baseline`, `896-db-mode-output`, `896-parity-run2` 파일의 SHA를 승인값으로 복사하지 않았다.

## 계획서 §2 P0 합격 기준 측정

| 기준 | 측정 결과 | 판정 |
|---|---:|---|
| 원시 총계/골든 SHA 누락 | 0 | PASS |
| items 파싱 | 3,392건 | PASS |
| groups 파싱 | 2,649그룹 | PASS |
| 그룹 상태 합계 | 524 + 551 + 1,560 + 14 = 2,649 | PASS |
| 골든 `01`~`06` SHA 기록 | 6/6 | PASS |
| 재현성 두 실행 SHA diff | 0 | PASS |

## 확정하지 못한 것

저장소에 있는 기존 산출물은 출력 기준선 JSON이며, 원시 Google Sheets의 파일별 탭·실제 행 번호·원시 셀 문자열 스냅샷은 포함하지 않는다. 따라서 이번 P0에서는 기준선 JSON의 `source/index`와 JSON 경로를 완전한 provenance로 고정했지만, 원시 셀 수준의 1회성 Sheets 적재 manifest는 확정하지 않았다. `manifest.json.sourceManifest.rawGoogleSheetSnapshotPresent=false`로 남겼다.

이 상태에서 원시 셀 좌표가 있다고 주장하거나 Google Sheets를 새로 읽어 보완하지 않았다. 원시 snapshot이 확보되는 다음 조사에서 `input-manifest.jsonl`의 `rawCells`를 실제 원시 셀 값으로 교체하고 동일한 SHA 체인을 추가해야 한다. 따라서 P0의 골든·열 계약 축은 PASS이나, 원시 입력 provenance 축은 미확정이며 P2로 진행하지 않는다.

## 기존 산출물 보호

생성기는 기존 세 디렉터리를 읽기만 하고, 결과는 `docs/qa/896-p0-golden-manifest/`에만 쓴다.
