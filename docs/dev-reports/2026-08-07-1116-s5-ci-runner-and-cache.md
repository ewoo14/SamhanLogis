# #1116 S5 — CI runner·죽은 walker 제거·전수 discovery cache 공유

## 결과

S4에서 확인된 세 결함을 이 워크트리에서 수정했다. 커밋·푸시와 CI 재실행은 하지 않았다.

### ① CI runner 배선

`.github/workflows/ci.yml`의 기존 `credential-plaintext-guard` 잡에 Node 20 설치와 다음 계약 테스트를 추가했다.

```text
node --test scripts/lib/qa-credentials.test.cjs
```

이 잡은 checkout-only로 실행되므로 `.env.local`에 의존하지 않는다. `ci.yml`의 `pull_request`/`push` 트리거에는 `scripts/**`를 무시하는 항목이 없고, `paths-ignore`는 `docs/**` 등만 제외하므로 `scripts/lib/**` 변경 시 CI가 발동한다.

로컬에서 CI의 정확한 Node 명령을 실측했다.

1. `scripts/.s5-ci-probe.cjs`에 `process.env.QA_PASSWORD` 직접 읽기를 주입했다.
2. `node --test scripts/lib/qa-credentials.test.cjs` 실행 결과 **exit 1, 6 pass / 1 fail**. 실패 메시지는 probe 경로를 직접 지목했다.
3. probe 파일을 즉시 삭제했다.
4. 정상 상태에서 같은 명령은 **exit 0, 7 pass / 0 fail**.

이는 실제 GitHub run을 만들지 않고도 새 runner 명령이 위반을 red로 만드는 것을 확인한 결과다. 커밋·푸시 금지 조건 때문에 GitHub CI의 신규 run 자체는 이 세션에서 만들 수 없다.

### ② 죽은 walker 3곳과 G8a

`clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`에서 다음 도달 불가 코드를 제거했다.

- `walkG3Sources()`의 즉시 `return` 뒤 `G3_ROOTS` registry walker
- `derivedEvidenceWriters()`의 즉시 `return` 뒤 `.ps1`/`.sh`/`.py` 확장자별 walker
- `guardScannedFiles()`의 즉시 `return` 뒤 `GUARD_ROOTS` registry walker

이제 G3, G8b, G8c, G9의 모집단은 파일 내용에서 도출된 `discoveredEvidenceWriters()`를 사용한다. 빈 `GUARD_ROOTS`를 순회하던 G8a는 제거하고, discovery 결과가 200건을 초과하며 전부 실재 파일인지 단정하도록 바꿨다. 따라서 관할 전체가 0건이어도 통과하는 vacuous 검사가 아니다.

### ③ discovery cache 공유

`derivedEvidenceWriters()`가 자체적으로 레포 전수 walker를 다시 돌지 않고 `discoveredEvidenceWriters()`를 반환하도록 바꿨다. `discoveredEvidenceWriters()`의 모듈 캐시는 G3/G8b/G8c/G9가 공유한다. 모집단을 경로·확장자 목록으로 좁히는 변경은 하지 않았다.

## 스캔 시간

S4가 기록한 exact SHA의 CI 기준선은 다음과 같다.

| 항목 | S4 기준선 |
|---|---:|
| G3a | 46,460 ms |
| G8b | 45,044 ms |
| G8c | 46,726 ms |
| G3b | 개별 시간 미출력 |

이번 세션은 커밋·푸시 및 컨테이너/의존성 설치를 금지했으며, 워크트리에는 데스크톱 `vitest` 의존성도 없어 동일 CI Vitest의 사후 ms를 측정할 수 없었다. 코드 경로상 G8b/G8c의 추가 전수 discovery는 제거됐고, 다음 CI run에서 G3a가 채운 캐시를 재사용한다. 신규 CI 측정값은 생성하지 않고 미측정으로 남긴다.

## 검증

- `node --test scripts/lib/qa-credentials.test.cjs` — **7/7 PASS**, 5.54초
- probe 주입 후 동일 명령 — **1 RED**, 6/7 PASS, exit 1
- probe 삭제 후 probe 이름 검색 — 0건
- `git diff --check` — PASS
- 데스크톱 Vitest — 로컬 의존성/빌드 산출물 부재로 실행 불가; `npm ci`·빌드하지 않음

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1116-s5-ci-runner-and-cache.md`

임시 probe 파일은 삭제했으며 잔류시키지 않았다.
