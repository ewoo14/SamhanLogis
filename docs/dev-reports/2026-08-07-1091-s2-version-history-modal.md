# 2026-08-07 — #1091 S2 데스크톱 버전이력 모달 1라운드

## 범위

이번 라운드는 데스크톱 `Slip`·`Estimate`·`PartnerOrder`·`Partner` 버전이력 패널만 변경했다. Journal·GroupwareApproval·웹앱·아로로지스·mobile-staff·정렬·`listWithCount` 배선은 변경하지 않았다.

## 발화 조건 카운트

| 조건 | 판정 |
|---|---|
| 네 화면에 revision 실재 건수 | 판정 불가 — 관리자 화면/실 DB 라이브 확인을 이 작업 환경에서 수행하지 않음 |
| 78행 CREATE revision 실재 여부·번호 | 판정 불가 — DB 직접 INSERT 금지 및 라이브 문서 생성 미수행 |
| 테스트 표본 78행 | 코드 fixture로 78개 변경항목을 구성했으나 실 DB 표본은 아님 |

실제 표본을 확인하지 못한 상태를 PASS로 해석하지 않는다.

## RED-A / RED-B 원문

구현 전 기준 실패 기대:

```text
RED-A  '버전이력' 버튼을 눌러야 이력이 보인다 · 모달 안에서 78행 카드가 접혀 있다
       · 펼치면 78행이 전부 보인다 · 모든 revision 에 도달한다
RED-B  기존 동작 보존 — 내림차순 순서 그대로 · 이력 외 화면 요소 불변
```

Slip 단위 테스트에 RED-A를 먼저 추가했다. 실행 명령은 `npm run test -- src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx --run`이었다. 그러나 저장소 `pretest`가 테스트 런너 전에 다음 파생물 누락으로 중단되어, 구현 전 테스트 실패 원문을 런너 결과로 관찰하지 못했다.

```text
electron-updater가 설치된 node_modules에 없습니다.
file: 의존 design-system dist이(가) 없습니다.
Electron main 빌드 산출물 out/main/index.js이(가) 없습니다.
```

## 구현

- 네 패널의 기본 화면에는 기존 패널 카드와 `버전이력` 버튼만 남겼다.
- 버튼을 누른 뒤에만 `design-system`의 기존 `Modal`을 열고 revision query를 활성화한다.
- 모달 크기는 기존 저장소 사례와 동일한 DS Modal 계열에서 이력 표 가독성을 위해 `xl`을 사용했다.
- Slip의 field-level 변경항목은 각 revision 카드 안에서 native `<details>`로 접었다. 닫힌 상태에서도 revision 행과 변경항목 개수에 접근할 수 있고, 펼치면 전체 항목을 렌더한다.
- 기존 restore Modal, 복원 mutation, cache invalidation, test id, revision 배열 순서와 `revisions[0]` 최신 판정은 유지했다. 정렬 코드는 수정하지 않았다.
- 기존 협업 브리지 테스트는 새 버튼을 먼저 눌러 모달 내부 revision 행을 밟도록 갱신했다.

## 정본 패턴과 이유

`DispatchTaskDetailModal.tsx`의 “수정 이력”과 `DepositorMappingPage.tsx`의 “입금자명 매핑 이력” 중 후자의 구조를 따랐다. 즉, 화면에는 명시적 이력 버튼만 두고 기존 `design-system` `Modal`을 열어 표면을 보여준다. 전자는 상세 모달 안 섹션 패턴이고, 이번 변경은 기존 상세 화면의 패널 자체를 숨겼다가 여는 요구이므로 버튼→DS Modal 경계가 더 직접적이다. 신규 모달 컴포넌트는 만들지 않았다.

## RED 이후 동시 GREEN

코드 기준으로는 네 패널 모두 동일한 버튼→모달 경계를 갖고, Slip fixture 기준으로 접힘→펼침·78개 항목·revision 0/1 접근을 검증하도록 만들었다. 다만 현재 워크트리에는 의존성/빌드 파생물이 없어 Vitest·TypeScript·전체 참조 테스트를 실행하지 못했다. 따라서 동시 GREEN은 **판정 보류**이며, PM 환경에서 의존성 준비 후 실행이 필요하다.

## 필수 3절

### 1. 새 상태·화면 조합

| 조합 | 코드/테스트 확인 |
|---|---|
| 모달 닫힘 + revision 비노출 | Slip RED-A 테스트 추가 |
| 모달 열림 + 변경항목 접힘 | Slip `<details open=false>` 단정 추가 |
| 모달 열림 + 변경항목 펼침 | Slip 78개 항목 단정 추가 |
| revision 0건 | 기존 각 패널 empty 분기 보존 |
| revision 1건 | 기존 최신 revision 분기 보존 |
| 최대 21건 | 목록 slice/limit를 추가하지 않아 전부 도달 가능 |
| 모달 중 뒤로가기/닫기 | DS Modal `onClose` 연결 |
| 모달 중 문서 저장 | 이력 query는 기존 query key/cache invalidation 계약을 유지 |

실제 관리자 화면에서 각 조합을 밟은 라이브 QA는 수행하지 못했다.

### 2. 제거·이동·개명 식별자 전수

패널 파일 4개의 기존 `data-testid`, revision row test id, restore test id, query key와 협업 import는 유지했다. `rg`로 `VersionHistoryPanel` 참조를 전수 확인했고, 새 버튼 도입으로 고아 import/rename 참조는 확인되지 않았다. 이동·개명한 식별자는 없다.

### 3. 변경 파일 참조 테스트

변경 파일 참조 테스트 목록은 다음과 같다.

- `SlipVersionHistoryPanel.test.tsx`
- `SlipCollaborationPanel.history-bridge.test.tsx`
- `EstimateCollaborationPanel.history-bridge.test.tsx`
- `PartnerOrderCollaborationPanel.history-bridge.test.tsx`
- `PartnerDetailDialog`의 기존 협업/라우트 참조

지정 파일로 좁힌 실행은 의존성 가드에서 중단되었으므로, 위 참조 테스트 전부와 데스크톱 typecheck는 미실행 상태다.

## 완성한 화면 / 못 한 화면

완성한 코드 화면: Slip, Estimate, PartnerOrder, Partner — 모두 버튼→모달 전환을 반영했고 Slip 변경항목 접기를 반영했다.

못 한 검증 화면: 네 화면 모두 실제 관리자 데이터·실제 78행 CREATE revision·브라우저 뒤로가기/문서 저장을 라이브로 밟지 못했다. 이 때문에 발화 조건과 동시 GREEN은 판정 보류다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1091-s2-version-history-modal.md`

코드 신규 컴포넌트·신규 모달 파일은 없다.

## 변경 파일

- `clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx`
- `clients/desktop/src/renderer/components/audit/EstimateVersionHistoryPanel.tsx`
- `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`
- `clients/desktop/src/renderer/components/audit/PartnerVersionHistoryPanel.tsx`
- 각 패널의 Slip 단위 테스트 및 3개 협업 브리지 테스트

## 검증 로그

- `git diff --check` — 통과
- `npm run test -- src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx --run` — 저장소 `pretest` 파생물 가드에서 중단
- TypeScript / 전체 참조 테스트 — 의존성·파생물 부재로 미실행
- git commit / push / 컨테이너 재빌드 — 수행하지 않음
