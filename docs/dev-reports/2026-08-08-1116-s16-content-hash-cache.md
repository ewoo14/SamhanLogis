# #1116 S16 내용 해시 캐시 — 결함 3건 종결

## 판정

**S16 구현 완료.** stat fingerprint를 제거하고 파일 내용의 SHA-256을 캐시 키로 사용했다. ignored generated output은 discovery에서 제외하고, tracked source와 non-ignored untracked source는 계속 발견한다. 실제 저장소에 존재하는 `.py` writer도 G3a 관할에 포함했다.

## 변경

### 1. stat fingerprint 제거

`discoveredEvidenceWriters()`는 이제 후보 소스 파일을 한 번 읽고 `createHash('sha256')`로 내용 해시를 만든다.

- 동일 내용: 기존 `isEvidenceWriter` 판정 재사용
- 내용 변경: `stripComments`부터 writer 판정을 다시 실행
- `mtimeMs`, `size`, `ctimeMs`: 캐시 키와 변경 판정에서 제거
- 동일 byte 길이로 치환하고 timestamp를 복원해도 내용 해시가 달라져 재판정된다

첫 구현에서 레포의 모든 파일을 읽고 해시하는 방식은 전건 240초 제한에 도달했다. 이는 stat으로 회귀하지 않고, `git ls-files`로 확인한 writer 후보 소스 확장자만 읽고 해시하는 방식으로 수정했다.

### 2. ignored / tracked / non-ignored untracked 경계

skip basename(`build`, `out`, `bin`, `target` 등)은 `git ls-files -co --exclude-standard` 결과에 해당 디렉터리 아래 파일이 있을 때만 연다.

| 상태 | discovery 결과 | 회귀 증거 |
|---|---|---|
| ignored generated output | 스캔하지 않음 | `tools/s14-probes/build/deep/generated.cjs`가 `git check-ignore`에 잡히고 discovery 결과에서 제외 |
| tracked source | 스캔함 | 기존 tracked 소스 모집단과 G8 discovery가 계속 200건 이상 유지 |
| non-ignored untracked source | 스캔함 | G3a가 `tools/s14-probes/source/deep/`의 신규 `.ts`, `.mjs`, `.py`를 발견하고 위반으로 보고 |

git 조회 실패 시에는 보수적으로 skip basename을 열지 않는다. 따라서 VCS를 확인할 수 없는 상태에서 ignored generated output을 내용 walk로 되살리는 fallback은 없다.

### 3. writer 확장자 전수 조사

기준 HEAD에서 `git ls-files`로 확인한 writer 후보 언어 확장자와 적용은 다음과 같다.

| 확장자 | tracked 파일 수 | S16 처리 | 근거 |
|---|---:|---|---|
| `.cjs` | 58 | 포함 | Node 캡처·파일 복사 writer 다수 |
| `.mjs` | 63 | 포함 | Playwright/QA 캡처 writer 다수 |
| `.js` | 60 | 포함 | JS 캡처 및 manual-capture writer |
| `.ts` | 976 | 포함 | Playwright `.ts`와 중첩 script 도달성 유지 |
| `.tsx` | 540 | 포함 | 실제 저장 호출이 가능한 TSX 소스 확장자 |
| `.ejs` | 1 | 포함 | 템플릿 내부 `doc.save()` 등 writer 가능성을 목록에서 임의 제외하지 않음 |
| `.ps1` | 61 | 포함 | 기존 G3c의 제한적 PowerShell OutDir 휴리스틱 재사용 |
| `.py` | 6 | 포함 | `save()` / `savefig()` writer를 G3 관할에 추가; 이번 결함 회귀 |
| `.sh` | 9 | 포함 | 기존 H2-sh의 `OUT=` writer 휴리스틱 유지 |

`.java`, `.html`, `.md`, 이미지·문서·데이터 확장자 등은 현재 가드가 검사하는 QA 증거 writer 언어가 아니다. 이들은 writer 후보 확장자 목록에서 제외해 매 실행 불필요한 바이너리·문서 read/hash를 하지 않는다. 단, 새 writer 언어가 저장소에 추가되면 이 목록과 가드 휴리스틱을 함께 확장해야 한다. 비-JS(`.ps1`/`.py`/`.sh`) 처리는 완전한 언어 파서가 아니라 저장 호출과 QA 목적지의 제한적 텍스트 근사라는 한계도 코드 주석에 명시했다.

## 유지 확인

- `.ts`와 중첩 `scripts/**/*.ps1` 도달성 유지
- 저장소 내부 junction/link는 canonical 경로로 따라감
- 저장소 밖 link target은 `isWithinRepo` 경계로 제외
- 주석·문자열 언급·문서·`resolveQaShotsDir` 마커 파일은 green 유지

## 검증

실행 명령은 pipe 없이 직접 실행했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 53 passed (53)
S16_FINAL_EXIT=0
S16_FINAL_WALL_SECONDS=19.99
Vitest Duration 18.47s
```

비교 기준은 S15 보고서의 `53 passed`, Vitest `65.33s`, wall `66.90s`다. 최종 S16은 내용 해시를 사용하면서도 후보 확장자 제한 후 Vitest `18.47s`, wall `19.99s`로 측정됐다. 중간의 전체 파일 해시 구현은 240초 실행 제한에 도달했으며, 최종 구현은 그 경로를 남기지 않았다.

`npm test`는 사전 `real-qa-scope` 단계에서 공유 `design-system/dist/index.d.ts`와 Electron `out/main/index.js` 부재로 실행되지 않았다. 위 결과는 그 사전 단계와 동일한 Vitest 본체를 직접 실행한 원문이다.

## 산출물 및 정리

신규 파일:

- `docs/dev-reports/2026-08-08-1116-s16-content-hash-cache.md`

G3a/S10 probe와 ignored build probe는 테스트 `finally`에서 삭제되도록 했고, 최종 작업 트리에는 probe를 남기지 않았다. `.gitguardian.yaml`은 수정하지 않았다. 커밋·push는 하지 않았다.
