# PR #1118 / 이슈 #1116 — S9 fingerprint 자동 무효화 실측 보고

## 판정

PM 설계의 핵심 동작은 RED-A 축에서 확인했지만, 현재 저장소 전체를 대상으로 fingerprint 변경 때마다 전수 read 하는 비용이 CI 기준을 크게 초과했다. 따라서 구현을 채택하지 않고 중단한다. 작업 중 실험 코드는 모두 원복했으며 commit/push·컨테이너 재빌드·다른 워크트리 변경은 하지 않았다.

## 채택 검토 설계

`discoveredEvidenceWriters()` 호출마다 파일의 `(상대경로, mtimeMs, size)`를 stat해 fingerprint를 만들고, fingerprint가 같을 때만 `{ fingerprint, writers }` 캐시를 재사용하는 방식이다. writer 판정 결과에는 `fs.realpathSync.native()`를 적용해 junction 별칭을 canonical 경로로 접는다.

구현 실험은 디렉터리 목록을 캐시하고 디렉터리 stat로 추가·삭제를 감지한 뒤 파일 stat으로 내용 변경을 감지하도록 최적화했지만, fingerprint가 바뀌는 RED-A 단계에서는 기존 16,334개 파일을 다시 읽어야 했다.

## RED-A 원문과 실측

① 캐시를 채운 뒤 invalidate를 부르지 않고 위반 writer를 생성하면 가드가 red가 되고, 파일 삭제 후 green이 되어야 한다.

```text
S9 RED-A: 호출자가 invalidate하지 않아도 writer 추가·삭제를 자동으로 반영한다
결과: GREEN
시간: 87.655 s
```

② 파일 내용만 바꿔 writer가 되면 자동으로 재판정되어야 한다.

```text
S9 RED-A: 파일 내용만 바뀌어 writer가 된 경우에도 자동으로 재판정한다
결과: GREEN
시간: 88.850 s
```

③ junction 별칭으로 만든 writer를 원본 경로로 삭제하면 canonical 캐시 항목에서 사라져야 한다.

```text
S9 RED-A: junction 별칭으로 발견한 writer를 원본 삭제 후 canonical 캐시에서 제거한다
결과: GREEN
시간: 60.353 s
```

④ 위 세 동작은 같은 프로세스의 연속 호출에서 invalidate API 없이 관찰되어야 한다. ①~③ 테스트는 모두 같은 Vitest 프로세스에서 실행했고, 호출자 무효화 호출은 사용하지 않았다.

## RED-B 및 성능

```text
G8a 모집단: 384건 — fresh 로컬 실행 GREEN
G8a 실행 시간: 28.78 s
기존 S6 CI 기준: 전체 45.07 s
```

S9 RED-A 세 계약을 포함한 전체 하네스 fresh 실행은 270초를 초과해 중단했다. 따라서 정상 전체 하네스의 완료 시간은 산출하지 못했으며, 45.07초 이내라고 주장할 수 없다. 변경 fingerprint마다 전수 read가 반복되어 CI 기준을 크게 넘길 위험이 실측으로 확인됐다.

G8a 199건 축소 적대 mutation은 이번 실행에서 별도 재측정하지 않았다. 기존 S8 기록의 199건 축소 RED는 보존 근거로만 남긴다.

CI 실측은 수행하지 않았다. 사용자 지시의 commit/push 금지로 새 Actions run을 발화하지 않았고, 로컬 결과만으로 CI 시간을 대체하지 않는다.

## 오탐 경계

기존 가드의 `k6 __ENV` 예외, `gradlew`, `Dockerfile`, `_headers`, `.d.cts` 경계는 production 파일을 원복했으므로 변경하지 않았다. 이번 실험에서 신규 probe와 junction은 모두 회수했다.

## 신규 파일 목록

```text
docs/dev-reports/2026-08-07-1116-s9-fingerprint-auto-invalidation.md
```

실험 코드와 `.s9-*` probe/junction은 잔류하지 않는다. 로컬 테스트 의존성 설치 디렉터리는 프로세스가 파일을 점유해 완전 삭제되지 않았으며, 이는 저장소 추적 파일이 아니다.
