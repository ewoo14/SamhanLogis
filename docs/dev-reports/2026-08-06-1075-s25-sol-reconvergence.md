# PR #1078 · 이슈 #1075 — S25 SOL 재수렴

## 1. 판정 — 실 사용자 재현 결함 0

**실 사용자 경로로 재현 가능한 결함은 0건이다. 기능적으로 머지를 권고한다.** S23-F1은 S24에서 닫혔고, 정규화 예외가 실제 규격·단가·수량·금액·비고 또는 다른 라인 값을 조용히 숨기는 조합은 재현되지 않았다.

다만 증거 무결성 예외가 1건 있다. 조회 시점 PR #1078의 GitHub check 48개 중 47개는 `SUCCESS`이나 `Desktop Playwright (mock 회귀 hard gate)` 1개가 장시간 `IN_PROGRESS`이고 `mergeStateStatus=UNSTABLE`이다. PR은 `MERGEABLE`이며 로컬 지정 Playwright 17/17은 통과했지만, 이 원격 check가 완료되거나 재실행으로 종결되기 전에는 “모든 GitHub check green”이라고 단정할 수 없다. 이는 제품 결함 판정과 분리한다.

### 정규화 예외의 실제 겹수와 합성 결과

코드는 독립적인 전역 제외 두 개가 아니라, legacy 한 줄에만 적용되는 **복합 정규화 판정 1개 안의 두 단계**다.

1. `specificationDiffers`가 구 marker를 제거한 canonical 문자열을 비교한다. 이 단계는 `previous source=null`, `current source=CATALOG`, 이전 문자열이 `U+2060`으로 시작하는 경우에만 열린다.
2. `specificationSourceDiffers`가 이전 문자열로 기대 source를 계산한다. 평문은 `USER`, marker는 `CATALOG`이며, 그 기대값과 현재 source가 같은 `null→명시 source`만 제외한다.

구 marker 라인 `U+2060X/null`의 조합을 전부 대조하면 다음과 같다.

| 현재 저장 상태 | 판정 | 이유 |
|---|---:|---|
| `X/CATALOG` | 변경 아님 | 무행위 hydrate의 정확한 canonical 상태 |
| `Y/CATALOG` | 변경 | canonical 규격 `X≠Y` |
| `X/USER` | 변경 | 사용자의 명시적 규격 입력으로 source 전환 |
| `Y/USER` | 변경 | 규격과 source 모두 전환 |
| 위 조합 + 단가·수량·금액·품목명·모델명·비고 변경 | 변경 | 정규화 판정 전후의 독립 필드 비교가 참 |

사용자가 화면에서 구 marker 규격의 표시값 `X`를 직접 다시 입력해 최종 문자열이 우연히 같아져도 `EstimateFormPage.updateLine(..., fromUser=true)`가 local state와 Yjs의 `specificationSource`를 `USER`로 바꾼다. 따라서 `U+2060X/null → X/USER`로 집계되어 `~1`이다. 실제로 다른 문자열을 입력하면 source와 무관하게 규격 비교에서 먼저 잡힌다.

상태가 최종적으로 `X/CATALOG`와 완전히 같으면 diff만으로 사용자의 중간 행동을 구별할 수 없다. 그러나 데스크톱 직접 입력 경로는 그 상태를 만들지 않고, 같은 상태로 돌아가는 경로는 catalog 재확정이다. 현재 실 사용자 경로에서 “사용자 수정인데 marker 제거 정규화와 같은 모양”으로 묻히는 셋째 경로는 없다. 임의 API client가 사용자의 직접 입력을 `CATALOG`로 거짓 전송하는 경우는 현재 화면 계약 밖이며 이번 실 사용자 결함으로 세지 않았다.

읽기 전용 실 DB 재계수:

```text
활성 견적 라인                         2,045
규격 보유 라인                             6 (평문 4 · marker 2)
규격 보유 활성 견적                         4
estimate_revisions                    2,089
source 키가 있는 revision                 0
규격 보유 구 revision                     5
그 revision의 규격 라인                    6 (평문 4 · marker 2)
```

규격 6라인은 3개 product를 참조한다. 현재 product 원문과 표시 규격을 대조하면 평문 4/4, marker 2/2가 모두 다르다. 그중 2라인의 product는 soft delete 상태다. 활성 product 4라인은 catalog 재확정 시 실제 규격 문자열이 바뀌어 diff에 잡히고, soft delete product 2라인은 재선택할 수 없지만 직접 규격 편집은 `USER` 경로로 잡힌다.

## 2. 범위 판단 — source 비교 유지와 제거의 양쪽 근거

### 유지 근거

- source는 단순 감사 장식이 아니다. `CATALOG` 규격은 품목 해제 때 함께 회수되고 `USER` 규격은 보존된다. 같은 표시 문자열이어도 이후 사용자 동작이 달라진다.
- revision 복원은 `specificationSource`를 실제 라인에 다시 적용한다. 같은 문자열의 `CATALOG↔USER` 전환은 복원 후 행동 차이를 만든다.
- 버전 이력은 source 이름을 보여 주지는 않지만 `라인 ~N`으로 행동 상태가 바뀐 라인이 있었음을 알리고, 사용자는 그 revision으로 복원할 수 있다.
- 현 예외는 임의의 `null` 또는 marker를 각각 광범위하게 버리는 규칙이 아니라, legacy 문자열에서 계산한 정확한 canonical tuple만 제외한다. 실제 값 변경은 독립 비교가 먼저 또는 함께 잡는다.

### 제거 근거와 잃는 것

- 화면은 source나 field-level 변경 원인을 표시하지 않고 `라인 ~N`만 보여 준다. source-only `~1`은 사용자가 왜 바뀌었는지 직접 해석할 수 없다.
- source 비교를 `lineModified`에서 빼면 legacy 예외 두 단계와 그 유지 비용은 사라지고, 표시 규격·수량·단가·금액·비고 등 사용자가 보는 값의 diff는 그대로 남는다.
- 대신 같은 규격을 직접 재입력해 `CATALOG→USER`가 된 revision이 `변경 없음`으로 보일 수 있고, 이후 품목 해제 시 규격 보존 여부가 달라졌다는 사실을 이력 요약에서 잃는다. snapshot·JSONB·restore 자체를 유지한다면 복원 데이터는 잃지 않지만 **변경 요약의 감사 정확성**을 잃는다.

### SOL 권고와 셋째 가능성

**현 source 비교를 유지하는 쪽을 권고한다.** source가 품목 해제와 복원 후 동작을 바꾸므로 실제 업무 상태이며, 현재 복합 예외는 그 상태를 잃지 않으면서 legacy 무행위만 좁게 제외한다.

셋째 가능성은 source를 snapshot/restore에는 계속 보존하되, 장래 `ChangeSummary`에 source 전용 변경을 별도 항목으로 분리하거나 field-level 변경 사유를 화면에 표시하는 것이다. 그러면 `라인 ~N`의 모호성을 줄이면서 legacy canonicalization과 실제 source 전환을 분명히 설명할 수 있다. 이번 라운드에서는 어느 방향으로도 코드를 고치지 않았다.

## 3. 차단·소실 반대급부와 28경계표 재대조

S15·S17·S19가 세운 저장→재개방, coedit 수신 분류, version capture→JSONB→restore 왕복은 유지된다.

- 직접 규격 입력은 local/Yjs 양쪽에서 `USER`가 되고 submit body에 규격/source가 함께 들어간다.
- 원격 규격 변경은 provider source가 있으면 그 값을 따르고, source가 없으면서 문자열이 실제로 달라질 때만 `USER` fallback을 쓴다.
- revision snapshot은 규격/source를 함께 직렬화하고 구 JSONB의 source 부재는 null로 읽는다.
- `Estimate.restoreFromSnapshot`은 라인을 전량 재생성한 뒤 source를 적용하며, 권위 금액·단가·세트 계보 복원 분기는 유지된다.
- `lineDiffers`는 수량, 단가, 공급가, VAT, 합계, 품목명, 모델명, 규격, source, 비고를 독립 비교한다.

S24의 28경계표를 코드와 다시 대조한 결과, 1~17과 19~28의 설명은 실제 운반/의도적 비운반 경계와 맞고 같은 과장은 추가로 발견되지 않았다. 18번 정정도 정확하다. `shared/collab-core`는 port가 준 JSON을 opaque하게 저장하고 restore callback으로 전달하지만, `EstimateDocumentCollaborationPort.restoreSnapshot`은 memo·validUntil·라인 note만 patch하며 specification/source는 둘 다 의도적으로 무시한다. 별도의 견적 version restore인 `Estimate.restoreFromSnapshot`은 규격/source를 실제로 복원한다. 두 revision 체계를 혼동하지 않은 현재 S24 문구가 코드와 일치한다.

## 4. 증거 무결성 재현

신선한 실행 결과:

```text
Backend EstimateRevisionRestoreIT             9/9
Backend EstimateRevisionSnapshotTest          5/5
Backend EstimateRestoreTest                   7/7
Backend EstimateRevisionServiceTest          14/14
Backend 합계                                 35/35 · 실패 0 · skip 0
Desktop 지정 4파일                          140/140
design-system 지정 2파일                     40/40 · build exit 0
Playwright 지정 2 spec                       17/17
desktop typecheck                            exit 0 · 내부 2/2, 50/50
origin/main TypeScript AST expect            1062 18/18 · bundle 48/48 · 누락 0
git diff --check                             PASS
```

Backend는 `--rerun-tasks`로 18 task 전부 실행했다. Playwright는 다른 워크트리의 5173을 중지하거나 자체 서버를 덮지 않고 `PLAYWRIGHT_SKIP_WEB_SERVER=1`, `CI=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`, Chromium worker 1, retry 0으로 실행했다. typecheck의 기존 미추적 real-QA 경고는 공식 수치에 포함하지 않았으며 command exit는 0이다.

origin/main 단정은 두 파일을 TypeScript AST로 파싱해 `expect(...)` call expression을 occurrence 단위로 비교했다. 현재 파일의 총 expect는 1062 73개, bundle 48개이며 origin/main 기준 18개와 48개의 누락은 각각 0이다.

GitHub 조회 시 HEAD는 요청 SHA `56905a8a32ab213f3f786f2154d097d1ba166911`와 일치하고 PR은 `MERGEABLE`이다. 앞서 적은 장시간 `IN_PROGRESS` check 1개 때문에 원격 전체 green만 미확정이다.

## 5. main 병합 준비 · 마이그레이션 · 파일 · 안 본 범위

읽기 전용 기준 `origin/main=d82fb265c`(`#874`, PR #1057 머지)와 classic `git merge-tree`를 대조했다.

```text
양쪽 변경 파일 교집합
  clients/desktop/src/renderer/api/mock.ts
  clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx

classic merge-tree conflict marker             0
PR #1078                                       MERGEABLE
```

두 교집합 파일은 자동 병합 예상이다. #874가 바꾼 `SlipFormPage.tsx`, `SlipFormPage.test.tsx`, `LineRow/LineRow.tsx`, `utils/usePartnerPriceRefresh.ts`, `slipDiscount.ts` 계열은 이 브랜치가 merge-base 이후 직접 바꾸지 않아 파일 충돌 대상이 아니다. 다만 자동 병합 뒤 desktop/design-system 지정 회귀는 다시 실행해야 한다.

마이그레이션은 main slip-service에 `V101`부터 `V112`까지 있고 최고가 `V112`다. 이 브랜치의 신규 migration은 `V113__add_estimate_specification_source.sql` 하나이며 main에 `V113`은 없다. 병합 결과가 `V112→V113`이 되므로 번호는 여전히 옳고 신규 재번호나 `V114`는 필요하지 않다.

이번 라운드 신규 파일:

- `docs/dev-reports/2026-08-06-1075-s25-sol-reconvergence.md`

코드 수정·기존 파일 수정·삭제: 없음. 저장소 QA driver·QA 디렉터리·raw `.log` 생성 없음. git 쓰기, DB 쓰기, Docker 재빌드·재배포·공유 컨테이너 중지, 다른 트랙 파일 수정은 수행하지 않았다.

안 본 범위: V113과 `d82fb265c`가 함께 들어간 실제 병합 worktree 실행, V113 적용 서버에서의 라이브 화면 mutation, 실제 두 브라우저 coedit relay, 모바일 실기기, 운영 DB, 장시간 pending GitHub check의 runner 내부 상태. 공유 DB는 읽기 전용 계수만 했고 로그인 응답이나 토큰 원문을 저장하지 않았다.
