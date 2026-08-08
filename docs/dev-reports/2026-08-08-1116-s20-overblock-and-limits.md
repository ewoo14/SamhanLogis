# #1116 S20 오차단 및 정적 분석 한계 보고서

## 결론

S18의 fail-closed 범위를 저장소가 책임지는 source로 좁혔다. `git ls-files`에 있는 evidence 후보를 읽지 못하면 계속 실패하지만, 그 외 후보는 `unreadEvidenceCandidates` 목록에 남기고 discovery에서 건너뛴다. 따라서 병렬 워크트리에서 생성·삭제되는 잠금 임시 파일은 전체 가드를 RED로 만들지 않는다.

Python과 Batch 스캐너에는 경량 주석 제거와 문자열 마스킹을 적용했다. Python의 `#`, Batch의 줄 단위 `REM`/`::` 주석과 문자열 속 writer 언급은 writer로 판정하지 않는다. 이는 완전한 Python AST/Batch 문법 파서가 아니므로 정적 분석은 보수적인 어휘 탐지 범위로 한정한다.

격리 marker는 파일 전체의 `_local` 단어로 면죄하지 않는다. marker가 있는 대상 변수와 실제 `open`/`save`/`copy` 등의 쓰기 호출이 같은 경로에 이어질 때만 격리로 인정한다. 주석에만 `_local`이 있는 Python writer probe는 RED로 유지된다.

## 정적 분석 한계와 저장소 census

아래 두 형태는 동적으로 목적지를 조립하므로 이 PR에서 정규식을 추가하지 않았다.

| 형태 | `git ls-files` 결과 | 판단 |
|---|---:|---|
| Python `Path('docs') / 'qa'` | 0 | 실제 저장소에 없음. 정적 분석에서 원리적으로 완전 해석하지 않음 |
| Batch `%OUT%` 목적지 | 0 | 실제 저장소에 없음. 변수 값의 동적 목적지는 원리적으로 완전 해석하지 않음 |

결과 기반 대안(테스트 실행 후 `docs/qa` 오염 여부 확인)은 개발책임자 제안대로 이 PR 범위에서 제외했다.

## 검증

실행 명령:

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts --reporter=dot
```

원문 결과:

```text
Test Files 1 passed (1)
Tests 56 passed (56)
Duration 22.25s (transform 68ms, setup 0ms, collect 162ms, tests 21.64s, environment 0ms, prepare 93ms)
```

S13·S15·S17·S19의 기존 probe 경로를 포함한 G3/S18 전체 guard가 통과했다. probe와 생성 output은 테스트 `finally`에서 제거했으며, 신규 파일은 이 보고서 1개다. 커밋·push는 하지 않았다.
