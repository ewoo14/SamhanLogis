# R7 — revision UI stale 흡수 fix

## 결론

`SalesPartnerOrderDetailPage`의 direct PUT 성공 경로가 상세 query만 무효화하고 버전 이력 query를 무효화하지 않던 것이 R6 진단과 일치했다. 같은 화면의 revision 생성 경로를 전수 대조한 뒤, direct 수정·협업 수정완료·원격 협업 이벤트·삭제 경로에도 필요한 `['partner-order-revisions', orderId]`만 추가했다.

복원 경로는 이미 상세·목록·버전 이력을 모두 무효화하고 있어 변경하지 않았다. 보류/해제 및 부분 전환은 현재 백엔드에서 revision을 생성하지 않아 추가 무효화를 하지 않았다.

## 뮤테이션 × query key 전수 표 (RED-B)

| 화면 경로 | revision 생성 여부 | 성공 시 기존 무효화 | R7 조치 |
|---|---:|---|---|
| direct 수정 PUT (`updateMutation`) | EDIT | `['partner-order', id]` | `['partner-order-revisions', orderId]` 추가 |
| 협업 수정완료 (`commitMutation`) | EDIT | `['partner-order', orderId]`, `['partner-orders']` | `['partner-order-revisions', orderId]` 추가 |
| 협업 원격 이벤트 수신 | 다른 사용자의 EDIT 반영 | `partnerOrderCollabComments`, `['partner-order', orderId]`, `['partner-orders']` | `['partner-order-revisions', orderId]` 추가 |
| 삭제 (`deleteMutation`) | DELETE | `['partner-orders']` 후 목록 이동 | 이동 전 `['partner-order-revisions', orderId]` 추가 |
| 복원 (`restoreMutation`) | RESTORE | `['partner-order', orderId]`, `['partner-orders']`, `['partner-order-revisions', orderId]` | 이미 계약 충족, 변경 없음 |
| 보류 (`holdMutation`) | 생성하지 않음 | `['partner-orders']`, 상세는 `setQueryData` | 변경 없음 |
| 보류 해제 (`releaseMutation`) | 생성하지 않음 | `['partner-orders']`, 상세는 `setQueryData` | 변경 없음 |
| 부분 전환 (`convertMutation`) | 생성하지 않음 | `['partner-orders']`, `['partner-order', id]` | 변경 없음 |
| 댓글 추가/삭제/해결 | revision 생성하지 않음 | 댓글 query | 변경 없음 |

백엔드 근거: `PartnerOrderUpdateService`는 direct 및 협업 overlay 저장에서 EDIT를 캡처하고, `PartnerOrderDeleteService`는 DELETE를 캡처한다. `PartnerOrderRevisionService`의 RESTORE 경로는 이미 패널에서 무효화한다. `PartnerOrderHoldService`는 actor 인자를 미래 revision 훅 대비로만 보존하고 현재 캡처하지 않으며, convert 서비스도 revision 캡처를 하지 않는다.

## RED 확인

- RED-A: direct 저장 성공 후 버전 패널이 재조회할 수 있도록 `['partner-order-revisions', orderId]`를 성공 콜백에서 무효화한다. 회귀 테스트를 추가했다.
- RED-B: 위 전수 표로 direct·협업·원격 협업·삭제·복원 및 revision 비생성 경로를 모두 대조했다. 누락된 생성 경로는 함께 닫았다.
- RED-C: 전역 무효화 없이 revision query 한 개만 추가했다. 기존 상세/목록 무효화는 유지했다.
- RED-D: 상세 재조회, 목록 재조회, 복원 무효화 계약은 유지했다. 백엔드·Docker·서비스에는 손대지 않았다.

## 실행 원문

명령:

```powershell
npm run test -- --run src/renderer/routes/SalesPartnerOrderDetailPage
npm run typecheck
```

결과:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
- file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts. cd ..\\web\\design-system; npm run build
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다: out\\main\\index.js. npm run build
```

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
- file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts. cd ..\\web\\design-system; npm run build
```

추가로 pretest를 우회한 `npx vitest run src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx`도 `vitest/config` 패키지가 없어 시작하지 못했다. 지정된 환경 제약에 따라 npm ci, 재빌드, Docker 기동은 실행하지 않았다.

## 남은 차단

- 로컬 `node_modules` 및 design-system/Electron 파생물이 없어 지정 테스트와 typecheck가 가드 단계에서 중단됐다.
- CI가 이 변경의 테스트·타입 검증 권위이며, PM 커밋/푸시 및 CI 확인이 남아 있다.
