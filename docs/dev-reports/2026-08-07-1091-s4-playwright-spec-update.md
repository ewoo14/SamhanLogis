# #1091 S4 — Playwright spec 회귀 갱신

작성일: 2026-08-07  
대상: PR #1104 / 이슈 #1091  
브랜치: `feat/1091-version-history-modal` (`ca3aed6e6` 기준)

## 결론

이번 CI 실패는 폐기된 “기본 화면에 이력 목록 노출” 동작을 spec이 계속 단정한 것이었다. S2의 의도된 사용자 경로인 `버전이력 버튼 → 모달 → 목록`이 네 도메인 모두 살아 있었으므로 코드는 수정하지 않고 Playwright spec을 갱신했다.

S3에서 복원한 협업 브리지는 별도 판단했다. Slip·Estimate·PartnerOrder는 코멘트 클릭 시 모달이 자동으로 열리고 하이라이트되는 경로가 살아 있었고, Partner에는 브리지가 없었다. 따라서 브리지 spec은 코멘트 클릭 자동 오픈을 유지하고, Partner 관련 spec은 버튼 경로만 검증했다.

## 재집계

| 측정 기준 | 결과 |
|---|---:|
| 이번 S4 대상 spec 파일 | 14개 |
| 대상 파일의 `version-history` testid/locator 참조(주석 제외) | 134건 |
| 직접 Playwright assertion line (`expect`/`toHave*` 등) | 41건 |
| 새로 추가한 “기본 목록 미노출” 단정 | 5건 |
| 코드 수정이 필요한 죽은 사용자 경로 | 0건 |

저널의 `journal-version-history-gap`은 revision 이력 패널이 아닌 별도 격차 가드이므로 대상에서 제외했다.

## spec별 판단표

| spec:줄 | 단정 내용 | 이 경로가 아직 사는가 | 갱신/코드수정 | 이유 |
|---|---|---|---|---|
| `estimate-version-history.spec.ts:74-121` | 견적 패널, 목록, row, 최신 복원 가드, confirm, toast, locked-note | 산다 | 버튼 클릭 + 기본 목록 0건 단정 | 목록·복원·권한/상태 가드를 모두 모달 안에서 계속 검증 |
| `partner-version-history.spec.ts:87-140` | 거래처 탭, 목록, row, 복원, toast, locked-note | 산다 | 공통 helper에서 버튼 클릭 + 기본 목록 0건 단정 | ACTIVE/TERMINATED 두 상태의 원래 복원 가드 보존 |
| `slip-version-history.spec.ts:74-117` | 전표 목록, 필드 변경, 복원, confirm, toast | 산다 | 버튼 클릭 + 목록 0건; 접힌 변경항목 DOM을 열고 필드 단정 | S2의 `<details>` 접기까지 반영하면서 필드/셀 도달성 보존 |
| `phase-2-4-partner-order-restore.spec.ts:99-360` | 주문 7개 시나리오의 목록, 배지, 복원, locked-note, UUID, toast | 산다 | helper에서 버튼 클릭; 복원 dialog를 `주문 복원`으로 명시 | 이력 모달과 confirm 모달이 동시에 있어 strict locator만 수정 |
| `phase-2-4-real-qa.spec.ts:359-470` | 실 주문 이력 캡처, API 응답, 복원, confirmed 상태 | 산다 | 실 QA 진입 시 버튼 클릭 | 실 QA가 기본 노출을 전제로 대기하지 않도록 사용자 경로 반영 |
| `31-history-unify-opus-round-real-qa.spec.ts:117-208` | 통합 패널, 복원 버튼, 모바일 통합/터치타겟, 중복 accordion 부재 | 산다 | h4 단정→버튼 클릭; modal 전역 locator; 모바일 버튼→모달 | S2 이후 h4/패널 내부에 목록이 상주하지 않으며 모바일도 동일 계약 |
| `937-fix7-history-total-domain-real-qa.spec.ts:105-252` | 실 전표 합계 도메인과 변경 필드 | 산다 | `openDetail`과 legacy 진입에서 버튼 클릭 | VAT 포함 합계/단가 불변식은 유지하고 조회 진입만 갱신 |
| `partner-accountant-4tab-guard.spec.ts:63-79` | 권한별 탭·패널·복원 버튼 가드 | 산다 | VIEW 보유 분기에서 버튼 클릭 | 권한 단정은 유지하고 modal 내부 복원 버튼을 계속 확인 |
| `slip-collab-panel.spec.ts:125-245` | 협업 일원화, row highlight, 코멘트↔이력 브리지 | 산다 | 일반 이력 검증은 버튼→닫기→편집; 브리지는 코멘트 클릭 자동 오픈; modal 전역 locator | 모달 backdrop이 편집 버튼을 막지 않게 하고 S3 브리지 경로는 보존 |
| `estimate-collab-real-qa.spec.ts:123-124` | 수정완료 후 견적 이력 표면 캡처 | 산다 | 버튼 클릭 추가 | 실 QA 캡처가 모달 안의 새 표면을 대상으로 하도록 갱신 |
| `estimate-collab-codex-round.spec.ts:109-110` | 수정완료 후 누적 이력 캡처 | 산다 | 버튼 클릭 추가 | 동일한 견적 협업 실 QA 경로 반영 |
| `partner-order-collab-panel.spec.ts:80-103` | 주문 협업 일원화, row highlight | 산다 | 버튼→row 확인→모달 닫기; 저장 후 다시 버튼 클릭 | portal modal을 전역에서 확인하고 이후 편집 경로를 unblock |
| `partner-order-collab-real-qa.spec.ts:121-122` | 수정완료 후 주문 이력 캡처 | 산다 | 버튼 클릭 추가 | 실 QA 캡처 대상 변경 |
| `sp-08-4-2-partner-order-edit-put.spec.ts:81-82` | 주문 이력 패널의 actor/time/summary 정적 계약 | 산다 | open testid와 `historyOpen` 계약 추가 | 신규 버튼·lazy query 계약이 코드에 존재함을 정적 가드 |

판정 결과 “경로가 살지 않았다”에 해당하는 spec은 없었다. 따라서 S3 유형의 production code 수정은 하지 않았다.

## 불변식 ③·④ 확인

새로 추가한 기본 비노출 단정은 다음 다섯 곳이다.

- 견적 복원 가능/locked 두 테스트: `estimate-version-history-list`가 버튼 전 `0건`
- 거래처 helper: 탭 진입 직후 `partner-version-history-list`가 버튼 전 `0건`
- 전표 기본 spec: `slip-version-history-list`가 버튼 전 `0건`
- Slip 브리지: 코멘트 클릭 전 `slip-version-history-list`가 `0건`

모든 목록·row·restore·confirm·toast 검증은 버튼 클릭 또는 S3 브리지의 코멘트 클릭 이후 모달에서 수행한다. 단정을 삭제하거나 `toBeAttached`로 완화한 변경은 없다.

## 검증 결과

로컬에서 mock Playwright를 재실행했다. CI job 자체는 이 워크트리에서 commit/push 없이 재발화하지 않았다.

```text
13 passed — estimate-version-history, partner-version-history,
            slip-version-history, phase-2-4-partner-order-restore
10 passed — slip-collab-panel, partner-order-collab-panel
12 passed — partner-accountant-4tab-guard, sp-08-4-2-partner-order-edit-put
```

추가로 `git diff --check`도 통과했다. 실서버 real-QA spec들은 외부 실행 환경을 건드리지 않기 위해 여기서 실행하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1091-s4-playwright-spec-update.md` (본 보고서)

수정된 spec 파일은 신규 파일이 아니며, 총 14개다.
