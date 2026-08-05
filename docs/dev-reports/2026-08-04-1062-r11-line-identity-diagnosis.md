# PR #1063 R11 라인 정체성 구조 진단

- 진단 일자: 2026-08-04
- 작업 디렉터리: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 시작 HEAD: `5da4fcf700395a90da9ce30ab98f5ecd4faad2f2`
- 범위: 코드 수정 없이 BE 라인 정체성 계약, FE 재시드 보정 지도, 선재 결함 여부, 최소 설계 선택지를 진단한다.
- 금지 준수: 컨테이너 조작, DB 직접 쓰기, commit/push를 수행하지 않는다. 기존 `renderer-real-qa*.log` 파일을 수정하지 않는다.

## 진행 기록

### 1. 작업 기준점 확인

`git -C . rev-parse --show-toplevel` 결과는 `C:/dev/Samhan-Public/.claude/worktrees/t1062`이다. 현재 브랜치와 HEAD도 요청값과 일치한다.

진단 시작 당시 기존 작업 트리 변경은 다음과 같으며 본 진단에서 수정하지 않는다.

- `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`
- `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`
- `docs/dev-reports/2026-08-04-1062-r10-sol-reconvergence.md` (미추적)

### 2. 브랜치 계보와 1차 BE 확정

- `#1062` 브랜치의 공통 기준점은 `95d26e71a838b8f23dffad896dff2ed9aa2a81c7`이다.
- 이후 커밋은 R2 `0347d3fc0`, R5 `b0479f453`, R7 `68b23222a`, R9 `5da4fcf70` 순이다.
- 현재 `origin/main`은 별도 후속 문서 커밋을 포함하지만, 기능 비교 기준은 위 공통 기준점과 `origin/main` 양쪽을 확인한다.

BE 코드상 라인 ID 교체는 추정이 아니라 확정이다.

1. `SalesSlipUpdateService.java:92-97`은 요청 행마다 `toLine`을 호출해 새 `SlipLine` 목록을 만든다. `toLine`은 `SlipLine.create*` 팩토리를 호출할 뿐 기존 엔티티를 조회하거나 재사용하지 않는다(`SalesSlipUpdateService.java:221-245`).
2. `SlipLine`의 ID는 생성자 인자로 받지 않으며 새 엔티티 ID는 영속화 시 부여된다. 주석도 라인 편집을 전량 교체로 명시한다(`SlipLine.java:108-117`, `146-175`, `198-208`).
3. `Slip.replaceSalesLines`는 현재 활성 라인 전부를 `markDeleted`하고 컬렉션을 비운 뒤 신규 목록을 추가한다(`Slip.java:836-861`). 따라서 수량·메모만 바꾸어도 기존 영속 line ID를 재사용하지 않는다.

현재 단계의 판정: **저장 때마다 영속 line ID가 바뀌는 것은 현 구현의 명시적 설계이며, lineId 자체를 보존한다는 계약은 아니다.** 다만 그 설계가 협업 FE가 요구하는 안정적 행 정체성과 충돌하는지는 후속 실행·의존성 지도에서 별도로 판정한다.

### 3. 질문 3 최우선 실행 — 선재 결함 여부

코드 수정이나 DB 쓰기 없이, Git object에서 `origin/main`과 `HEAD`의 실제 `coeditLineIds.ts` 소스를 각각 읽고 TypeScript로 메모리 내 변환·실행했다. 동일한 provider 상태를 사용했다.

- 직전 서버/Y.Doc ID: `old-1`, `old-2`
- 상대 정상 PUT 뒤 REST ID: `new-1`, `new-2` (BE 전량 교체 모델)
- 다른 편집자 Y.Doc: 확정행 2개에 각각 미저장 수량 `7`, `9`와 메모 `B 미저장`, 뒤에 trailing 빈행 1개
- 실행 순서: `coeditLineIdsAreStale` → `reseedCoeditLineIds(provider, newIds, oldIds)`

실행 결과:

| 소스 | stale 판정 | 재시드 후 확정행 | 미저장 값 | trailing 빈행 |
|---|---:|---:|---|---:|
| `origin/main` | true | 2개 유지 | 수량·메모 전부 유지 | 1개 유지 |
| `HEAD` R9 | true | **0개** | **전부 소실** | 1개만 잔존 |

`origin/main`의 함수는 세 번째 인자를 받지 않는 구 구현이므로 기존 Y.Doc 행을 삭제하지 않고 새 서버 ID를 위치 순서로 덮어쓴다. 실행 결과 두 확정행의 `productId`, 수량, 메모가 그대로 남고 ID만 `new-1/new-2`로 바뀌었다. 반면 R9 `HEAD`는 `previousServerLineIds`에 속하면서 현재 ID 집합에 없는 두 행을 모두 삭제했고 빈행만 남겼다.

**핵심 판정: “상대가 수량·메모만 정상 저장하면 내 확정행 전체와 미저장 입력이 사라진다”는 결함은 `#1062` 이전 `origin/main`에서는 재현되지 않으며, R9가 도입한 결함이다.** BE의 ID churn은 선재 구조이지만, 그것을 원격 삭제로 오인하여 행을 제거하는 사용자 가시 결함은 이 PR의 R9에서 생겼다. 따라서 PR 범위 밖의 선재 결함으로 분리할 수 없고, 현 PR은 이 상태로 머지할 수 없다.

### 4. 실 데이터 재확인

실행 중인 `localhost:8080`, mock OFF 환경에서 `dev_manager`로 로그인한 뒤 GET 요청만 사용했다. OUTBOUND 목록과 수정 가능한 DRAFT/SAVED 2,174건의 상세를 24개 읽기 전용 worker로 전수 조회했다. 실패는 0건이며 개별 UUID·업무 내용은 기록하지 않았다.

```text
OUTBOUND 전체                         2,309
수정 가능                            2,174
  DRAFT                              2,162
  SAVED                                 12
상세 조회 성공/실패                  2,174 / 0
0라인 / 1라인 / 2라인 이상           0 / 2,026 / 148
기존 활성 라인 합계                  2,407
모든 기존 라인의 productId 확정 문서 2,174
```

요청에 제시된 수치와 전 항목 일치한다. 따라서 R9 경쟁 조건의 현재 도달 모수는 수정 가능 OUTBOUND 2,174문서·기존 활성 라인 2,407개다.

## BE 라인 정체성 계약 진단

### 5. 교체는 계약인가 결함인가

#### 결론

`replaceSalesLines`라는 **전량 교체 동작 자체는 의도된 구현**이다. 그러나 “정상 수정마다 기존 라인 ID를 반드시 폐기해야 한다”는 도메인 요구나 외부 계약은 찾지 못했다. 2026-05-18 도입 커밋 `85bb007ff9`와 당시 보고서 `docs/dev-reports/sp-08-6-2-sales-slip-edit-put.md:13,24,54`가 제시한 이유는 다음 두 가지다.

1. 매출 direct PUT을 매입 PUT과 대칭으로 빠르게 제공한다.
2. `orphanRemoval=false`·soft delete only 정책을 지키기 위해 기존 행을 hard delete하지 않는다.

두 요구는 “실제로 삭제되는 행은 soft-delete”를 강제하지만, 값만 수정된 행까지 새 엔티티로 바꾸는 것을 강제하지 않는다. 따라서 정확한 분류는 다음과 같다.

- **기존 단독 PUT 관점:** 문서 전체 replacement semantics를 택한 의도된 구현.
- **협업 편집 관점:** line ID를 영속 행 정체성으로 사용하면서도 정상 저장마다 그 정체성을 폐기하는 계약 불일치. stable ID가 필요한 새 소비자와 양립하지 않는 구조적 결함이다.
- **R10 사용자 가시 삭제 관점:** 선재 BE churn만으로 발생하지 않았고, R9 FE가 churn을 실제 삭제로 해석하면서 발생한 이 PR 결함이다.

#### lineId가 실제 보존하는 것

`BundleLineageResolver`는 기존 라인의 `id → (productId, parentSetModel, setHead)`를 캡처한다(`BundleLineageResolver.java:43-54`). 새 라인 목록을 만든 뒤 요청의 옛 `lineId`를 lookup key로 사용해 **세트 계보 값만 새 엔티티에 복사**한다(`72-87`, `146-153`). `productId`가 달라지면 계보를 승계하지 않는다(`177-190`). 즉 `restoreSlipLines`는 기존 엔티티나 ID를 복원하지 않는다.

`LineIdContractGate.requireLineIdsForLineage`는 기존 세트 구성품 ID 집합 `E`와 요청 non-null ID 집합 `R`을 대조한다(`LineIdContractGate.java:101-159`). `E` 누락과 익명 신규행이 동시에 있으면 “삭제인지 lineId 없는 재생성인지” 구분할 수 없어 400으로 거부한다. 익명행 없는 누락은 명시 삭제로 허용한다. 이 장치 역시 ID 자체의 장기 보존이 아니라 **한 번의 replacement에서 옛 계보를 올바른 새 라인으로 넘기는 상관키**를 보존한다.

의존 관계는 다음과 같다.

| 영역 | lineId 직접 의존 | 실제 보존/파손 영향 |
|---|---|---|
| 세트 계보 | 예 | 옛 ID로 `parentSetModel/setHead`를 새 엔티티에 승계한다. 잘못된/누락 ID는 계보 소실·오부착을 만든다. |
| 가격기억 | 간접 | 가격기억 key는 거래처+품목이며 lineId가 아니다(`SalesSlipUpdateService.java:269-289`). 다만 `parentSetModel`이 복원된 구성품은 기억 후보에서 제외되므로, lineId 오부착/누락이 구성품 배분가의 잘못된 각인 또는 정상 단가 기억 누락으로 이어진다. |
| 명시 audit log | 아니오 | `summarizeLines`는 품목·모델·수량·금액·메모를 기록하고 line ID는 넣지 않는다(`SalesSlipUpdateService.java:292-320`). 따라서 audit 의미는 ID 안정성에 직접 의존하지 않는다. |
| revision snapshot | 아니오 | `SlipSnapshot.Line`은 값·계보·단가 도메인을 저장하지만 line ID는 저장하지 않는다(`SlipSnapshot.java:120-165`). revision 복원도 새 라인을 만드는 모델이다. |
| BaseEntity 행 audit | 행 단위로 간접 | 기존 행은 soft-delete audit, 새 행은 create audit를 갖는다. 안정 ID로 한 행의 변경 연속성을 추적하는 대신 세대별 행으로 분절된다. |

가격기억 보고서의 R8 기록도 이 의미를 확인한다. lineId 없는 전량 교체가 세트 `parentSetModel/set_head`를 지우고 구성품 배분가를 `LINE_SAVE`로 각인했기 때문에 lineId 계약 게이트가 도입됐다(`docs/dev-reports/2026-07-15-809-partner-product-price-memory.md:878-904`). 즉 lineId 계약은 churn을 없애는 계약이 아니라 churn 전후의 계보 전달 계약이다.

## FE 재시드 전수 지도

### 6. 함수별 책임

| 함수 | 파일·줄 | 보정 대상 | 구조적 한계 |
|---|---|---|---|
| `toServerLineIdSet` | `clients/desktop/src/renderer/realtime/coeditLineIds.ts:61-70` | REST 상세의 `id`/`lineId`를 non-empty 집합으로 정규화해 서버 소유 ID의 권위 집합을 만든다. | 집합이라 순서·행 내용·삭제 사유·ID churn 사유를 표현하지 못한다. |
| `coeditLineIdsAreStale` | 같은 파일 `86-104` | 확정행 중 ID 부재, 현재 서버 집합 밖 ID, 중복 ID를 감지한다. trailing 미확정 빈행은 제외한다. | “구 Y.Doc 랜덤 ID”, “실제 원격 삭제”, “정상 PUT의 전량 ID 교체”를 모두 같은 stale로 합친다. |
| `reseedCoeditLineIds` | 같은 파일 `121-175` | 구 Y.Doc의 lineId 셀만 서버 기준으로 복구하면서 헤더·수량·메모 등 미저장 CRDT 값을 보존한다. 인자 3이 없으면 견적용 순서 재부착, 있으면 R9 전표용 삭제/중복 제거 후 누락 ID 부착을 수행한다. | 전표용 3인자 분기는 `old − new = 삭제`를 가정한다. BE churn에서는 모든 정상행이 이 차집합에 들어가 전 행을 제거한다. 순서 재부착 분기는 실제 삭제 시 잘못된 행에 ID를 붙이거나 삭제행을 부활시킬 수 있다. |
| `replaceItems` | `clients/desktop/src/renderer/realtime/createCoeditProvider.ts:733-753` | Y.Doc item 배열을 server-wins/full-seed 또는 reload 상태로 통째 교체한다. 전달 row의 lineId가 비면 client UUID를 생성한다. | 원격 미저장 item 편집을 전부 덮어쓴다. 랜덤 UUID는 서버 소유 ID가 아니어서 이후 검증·재시드가 필요하다. |

### 7. 호출부 지도

- 판매/매입 전표: `SlipDetailPage.tsx:1815-1820`에서 현재 REST ID와 직전 폼 ID 집합을 만든다. provider가 비면 `seedSlipCoeditProvider → syncSlipCoeditProvider → replaceItems`(`655-665`, `1880-1883`)로 전체 시드한다. 비어 있지 않고 stale이면 `reseedCoeditLineIds(..., previousServerLineIds)`(`1883-1891`)로 들어간다. R10은 이 경로다.
- 견적: `EstimateFormPage.tsx:819-820`에서 서버 집합을 만들고, 빈 provider 또는 서버/CRDT 행 수 불일치면 `seedEstimateCoeditProvider → replaceItems`(`287-315`, `876-886`)로 server-wins한다. 행 수는 같고 stale이면 2인자 재시드(`887-895`)로 원격 값은 보존한다. R9 전표 전용 삭제 분기는 사용하지 않는다.
- 판매주문: `SalesPartnerOrderDetailPage.tsx:127`은 provider 전체 시드에 `replaceItems`를 쓰지만 `coeditLineIds` 재시드 모듈 소비자는 아니다.
- 충돌 reload: `SlipDetailPage.tsx:655-660`의 `syncSlipCoeditProvider`가 헤더와 items를 서버 응답으로 전량 덮는다. 이는 명시적 “최신 내용 불러오기”에는 맞지만 미저장 공동 편집을 보존하지 않는다.

재시드가 존재하는 근본 이유는 **BE churn 자체 하나가 아니다.** (1) lineId seed 도입 전 영속 Y.Doc의 client 랜덤 UUID, (2) `replaceItems/addItem`가 만드는 신규 client UUID, (3) CRDT 위치 변화에서 React 배열 index로 ID를 복원하던 과거 오부착, (4) REST 재조회와 오래된 Y.Doc의 불일치를 동시에 보정하기 위해 존재한다. 이 네 상태를 단일 `stale` boolean과 순서/집합만으로 분류하려 한 것이 연속 실패의 구조적 원인이다.

## 최소 설계 선택지

### 8. (가) BE가 라인 정체성을 보존한다

요청 `lineId`가 현재 문서 소유이면 기존 `SlipLine`을 in-place 갱신하고, 요청에서 빠진 기존 행만 soft-delete하며, `lineId == null`만 새 엔티티로 만든다.

- 장점: REST·Y.Doc·DB가 같은 안정 ID를 사용한다. 정상 수량/메모 PUT은 stale를 만들지 않고, 실제 삭제만 `old − new`가 된다. FE 재시드의 가장 위험한 추론이 사라진다.
- 계보: 같은 품목의 기존 행은 `parentSetModel/setHead`가 자연히 유지된다. 품목 교체 시에는 D-R8-8에 따라 계보를 명시적으로 clear해야 한다.
- 가격기억: 계보 보유 행 제외 판정이 안정된다. 다만 mutator가 단가 권위 필드와 공급가/VAT/합계를 생성 팩토리와 완전히 같은 규칙으로 갱신해야 한다.
- audit/revision: 명시 audit와 snapshot은 lineId 비의존이라 유지된다. BaseEntity 행 audit는 “매 저장마다 구 행 delete+신 행 create”에서 “같은 행 modified”로 의미가 바뀐다. 이 변화가 오히려 행 연속성에는 맞지만 기존 복원/삭제 판별 테스트를 전수 재검증해야 한다.
- 비용: `SlipLine` mutator, 값 재계산, 품목 교체 계보 clear, `sourceOrderLineId/categoryKey` 보존 정책, 요청 순서/삭제/신규 혼합, 낙관 잠금, 매입·매출·견적 대칭을 함께 설계해야 한다. 가장 근본적이나 이 PR의 빈행 UX 범위를 넘는다.

### 9. (나) FE 재시드를 없애고 서버 응답으로 재하이드레이트한다

자기 저장 응답 또는 SSE 후 REST 상세를 권위로 삼아 Y.Doc 헤더/items를 `replaceItems`로 전량 덮는다.

- 장점: 새 서버 ID와 계보 결과가 즉시 반영되고 ID 추론 코드가 크게 줄어든다.
- 대가: 다른 편집자의 미저장 수량·메모·품목 입력 등 Y.Doc 전체가 서버 마지막 저장값으로 덮인다. 손실 범위는 ID 셀이 아니라 문서의 모든 미저장 필드다.
- 부분 적용 위험: 저장한 사용자만 재하이드레이트하면 다른 사용자는 계속 stale ID를 가진다. 모든 peer가 같은 server-wins epoch를 받아야 하므로 사실상 협업 편집을 “저장 시 강제 리셋” 모델로 바꾸는 결정이다.
- 계보/가격기억: 서버 응답을 그대로 쓰는 한 안전하지만, 재하이드레이트 전 stale client 저장을 막는 version/epoch 가드가 필요하다.

### 10. (다) trailing 빈행을 협업 문서에서 분리한다

미확정 trailing 행은 로컬 React draft로만 유지하고, 품목이 확정되는 순간에만 Y.Doc 행으로 승격한다. 저장 payload는 지금처럼 확정행만 필터링한다.

- 개발책임자 결정 ② “수정 모드 빈행 유지”: 화면에는 계속 빈행이 있으므로 충족한다. 결정 ②가 빈행의 원격 공유까지 요구하지는 않는다.
- 결정 ③ “빈행 저장 제외”: 로컬 draft는 애초에 Y.Doc/서버 행이 아니므로 더 강하게 충족한다.
- 장점: client random lineId를 가진 빈행이 stale 판정·재시드·원격 삭제 계산에 끼어드는 R5~R9 표면을 제거한다.
- 대가: 미확정 검색어/입력은 다른 협업 사용자에게 보이지 않고, 탭/프로세스 종료 시 복구되지 않는다. 품목 확정 시 CRDT 승격 경쟁을 처리해야 한다.
- 한계: BE ID churn과 확정행 재시드 문제 자체는 해결하지 않는다. 따라서 **R9의 `previousServerLineIds` 삭제 추론을 유지한 채 이 안만 적용하면 R10은 그대로다.** PR 범위안으로 쓰려면 `#1062`가 바꾼 확정행 ID 삭제 로직을 기준점으로 되돌리고, 빈행 UX만 로컬로 분리해야 한다. 실제 원격 행 삭제의 선재 재시드 한계는 별도 이슈로 남는다.

### 11. (라) 더 나은 대안 — 영속 PK와 협업 logical row ID를 분리한다

soft-delete 세대 모델을 유지해야 한다면 `SlipLine.id`와 별개로 저장 세대를 넘어 유지되는 `logicalLineId`(또는 서버가 보장하는 predecessor→successor mapping)를 둔다. Y.Doc은 logical ID를 쓰고, BE 계보 승계와 응답/SSE가 이전→신규 PK 매핑을 권위 있게 제공한다.

- 장점: 기존의 immutable-generation/soft-delete audit를 유지하면서 협업 정체성을 안정화한다. FE가 집합·순서로 삭제를 추론하지 않는다.
- 대가: DB/DTO/FE/SSE/견적·매입·매출 전체 계약 변경이 필요하다. 단순 응답 매핑만으로는 당시 접속하지 않은 peer가 복구할 수 없으므로 logical ID를 영속하거나 mapping history/epoch를 제공해야 한다.
- 적합 조건: “수정도 새 행 세대로 남겨야 한다”는 감사 요구가 실제로 확정될 때 (가)보다 맞다. 현재 조사에서는 그런 강제 요구를 찾지 못했으므로 우선순위는 (가)보다 낮다.

### 12. 선택지별 파손 표

| 선택지 | 결정 ② 빈행 유지 | 결정 ③ 빈행 저장 제외 | 계보 보존 | 가격기억 각인 | 주로 깨지는 것 |
|---|---|---|---|---|---|
| (가) BE 안정 ID | 유지 | 유지 | 가장 강함. 품목교체 clear 필수 | 가장 안정. 계산 mutator 정합 필수 | 기존 “매 저장 = 새 행 세대” BaseEntity audit 관행, 전량교체 전제 테스트 |
| (나) server-wins 재하이드레이트 | 재append로 유지 가능 | 필터로 유지 | 서버 결과 기준 안전 | 서버 결과 기준 안전 | 모든 peer의 미저장 헤더·라인 편집, 협업 UX |
| (다) 빈행 로컬 분리 | **유지** | **구조적으로 충족** | 직접 개선 없음 | 직접 개선 없음 | 미확정 입력의 원격 공유·복구; R9를 함께 걷지 않으면 R10 잔존 |
| (라) logical row ID | 유지 | 유지 | 권위 매핑으로 안전 | 권위 매핑으로 안전 | 스키마·프로토콜·SSE 범위와 마이그레이션 비용 |

### 13. 권고

두 단계가 최소 위험이다.

1. **PR #1063 범위:** (다)를 채택하되, R9의 확정행 `previousServerLineIds` 삭제 추론은 `#1062` 이전 상태로 되돌려 이 PR이 만든 R10을 제거한다. 이렇게 하면 결정 ②·③의 빈행 UX만 전달하고, 선재 협업 정체성 문제를 이 PR에서 더 확대하지 않는다.
2. **별도 구조 슬라이스:** 우선 (가)를 설계·검증한다. 감사상 매 수정 세대 보존이 필수라는 근거가 새로 확인될 때만 (라)로 전환한다. (나)는 협업 미저장 입력을 문서 전체에서 잃으므로 기본안으로 권고하지 않는다.

중요한 범위 판정: BE churn은 선재 구조 부채지만 R10은 R9가 만든 회귀다. 따라서 “전부 별도 이슈”도, “이 PR에서 BE 전체를 재설계”도 맞지 않는다. **이 PR은 자신이 추가한 오판을 제거하고 빈행 요구만 닫고, 안정 ID 재설계는 별도 통합 슬라이스로 분리**하는 것이 최소다.

## 이 진단이 보지 않은 것

- 코드 수정·fix 후보 구현·커밋·push·PR 변경은 수행하지 않았다.
- 컨테이너 상태/이미지/배포본을 변경하지 않았고 DB를 직접 읽거나 쓰지 않았다. 실 데이터 확인은 게이트웨이 GET API만 사용했다.
- 실제 운영 데이터에 PUT/DELETE를 보내 line ID churn을 새로 만들지 않았다. churn 자체는 BE 생성/soft-delete 코드와 기존 라이브 R10 증거로 확정했고, 사용자 가시 FE 결과는 양 ref의 실제 함수를 동일 입력으로 메모리 내 실행해 비교했다.
- (가)의 in-place 갱신이 매입·견적·리비전 복원·주문 부분전환의 모든 필드를 보존하는지 구현 수준 설계와 회귀 테스트는 하지 않았다.
- (라)의 migration/backfill 규모, logical ID 생성 규칙, SSE payload 호환성은 산정하지 않았다.
- 다중 브라우저 GUI에서 실제 두 계정이 동시에 입력하는 새 캡처는 수행하지 않았다. 이번 핵심 판정은 외부 시점·네트워크 타이밍에 의존하지 않는 동일 함수 상태 전이로 재현했다.

## 최종 검증

- 보고서 필수 절 자동 확인: 파일 존재, 필수 6개 표제 누락 0, trailing whitespace 0.
- 핵심 양 ref 실행을 assertion 포함으로 재실행: `origin/main` 확정행 2개·미저장 값 유지, `HEAD` 확정행 0개·trailing 빈행만 잔존, exit 0.
- 인접 FE 계약 회귀: `SlipDetailPage.lineIdContract.test.tsx` **107 passed / 0 failed**, exit 0. 이 기존 suite가 green인데도 R10 시나리오는 실패하므로 테스트 공백도 확인된다.
- `git diff --check`: exit 0.
- 최종 작업 트리: 시작 시 존재한 QA 로그 2개 수정과 R10 보고서 미추적 상태를 그대로 보존했고, 본 진단이 추가한 파일은 이 R11 보고서 하나다. commit/push 없음.
