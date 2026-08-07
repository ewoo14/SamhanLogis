# #1116 S14 — false-green holes fix

## 판정

S13에서 확인된 거짓 green 4건을 가드와 회귀 probe로 닫았다. 커밋·push는 하지 않았다.

## 원인과 수정

1. per-file cache는 `mtimeMs + size`에 `ctimeMs`를 추가했다. 같은 크기로 내용을 바꾸고 mtime을 복원해도 Windows 파일시스템의 변경시각이 달라지면 writer 판정을 다시 계산한다. 따라서 S13의 동일-stat probe가 RED-B가 아니라 RED-A 경로로 재판정된다.
2. G3 JS 모집단의 확장자 필터에 `.ts`를 추가하고, G3c PowerShell 스캔을 `scripts/` 재귀로 바꿨다. G3a/G3c의 fixture는 각각 `tools/s14-probes/build/deep/*.ts|*.mjs`와 `scripts/s14-probes/deep/nested-writer.ps1`를 생성해 실제 위반 목록에 들어오는지 단언한다.
3. `build`, `out`, `bin`, `target`은 basename만으로 skip하지 않는다. 나머지 generated 전용 디렉터리는 git의 tracked/non-ignored source 파일이 있을 때만 재귀한다. ignored generated output은 그대로 건너뛰고, tracked source는 basename과 무관하게 모집단에 도달한다. 이 기준은 이름보다 VCS 상태를 근거로 하며, S14 probe의 `build` 중첩 source도 별도로 도달시킨다.
4. symlink/junction를 따라갈 때 canonical directory/file이 canonical `REPO_ROOT` 밖이면 즉시 제외한다. 저장소 밖 junction writer probe는 발견 결과에 들어오지 않고, 저장소 안 junction 회귀는 계속 canonical 파일로 발견된다.

## 결함 2 도달성 매트릭스

| 위치 | `.mjs`/`.js`/`.cjs` | `.ts` | `.ps1` |
|---|---:|---:|---:|
| `scripts/` 루트 | G3a 도달, G3a 판정 | G3a 도달, G3a 판정 | G3c 도달, G3c 판정 |
| `scripts/**` 중첩 | G3a 도달, G3a 판정 | G3a 도달, G3a 판정 | G3c 도달, G3c 판정 |
| 저장소 임의 위치 | G8 모집단 도달 | G8 모집단 도달 | G8 모집단 도달 |

S13의 단절은 JS walker의 `.cjs|mjs|js` 재필터와 G3c의 루트 `readdirSync()`였다. 이제 G3/G8이 동일 discovery 결과를 공유한다.

## 전건 검증 원문

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts; $testExit = $LASTEXITCODE; Write-Output "S14_FULL_EXIT=$testExit"; exit $testExit

Test Files 1 passed (1)
Tests 53 passed (53)
Duration 65.51s (transform 60ms, setup 153ms, collect 153ms, tests 64.80s, environment 0ms, prepare 102ms)
S14_FULL_EXIT=0
```

기준 S13 `62.64s` 대비 `+2.87s`이며 S10 제한 `226s`보다 `160.49s` 빠르다.

## 신규 파일 및 잔여물

- 신규 파일: `docs/dev-reports/2026-08-08-1116-s14-false-green-holes.md` (본 보고서)
- 수정 파일: `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`
- S14 probe, S10 probe, 외부 junction, 외부 target은 모두 각 테스트 `finally`에서 삭제했다.
- `.gitguardian.yaml`은 수정하지 않았다.
