# #1051 R9 — 복원 직후 편집 초안 stale fix

## 결론

복원 성공을 버전 이력 패널에서 상세 페이지로 전달하는 `onRestored` 경계를 추가했다. 상위 페이지는 복원 완료 후 권위 있는 상세를 다시 조회하고, 편집 provider가 있으면 즉시 서버 값으로 재시드한다. 편집 provider가 아직 없으면 다음 편집 시작 때 서버 재시드를 강제한다.

일반 협업 문서 이벤트에는 이 경로를 적용하지 않는다. 따라서 복원과 무관한 CRDT 초안은 보존된다.

## RED 확인

테스트에 다음 회귀 사례를 추가했다.

- `SalesPartnerOrderDetailPage.coedit.test.tsx`
- 복원 전/복원 후 header memo가 다르고 provider 라인 수는 동일한 경우, 복원 완료 callback 뒤 정식 편집을 열면 provider header가 복원값으로 재시드되는지 검증한다.
- 기존 테스트로 `empty`, 라인 수 불일치 재시드와 `subscribeDoc` 원격 업데이트 반영을 계속 보존한다.

실행 결과는 아래와 같다.

```text
명령: npm run test -- --run src/renderer/routes/SalesPartnerOrderDetailPage
결과: 실행 불가
[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다.
- file: 의존 design-system dist이(가) 없습니다.
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다.
```

```text
명령: npx vitest run src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx --reporter=verbose
결과: 실행 불가
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

따라서 로컬에서 테스트가 실패한 것이 아니라 의존성/파생물 부재로 테스트 runner가 시작되지 않았다. Docker, 서비스 재기동, 재빌드는 수행하지 않았다.

## 변경 경계

| 경계 | 변경 | RED/B 보호 |
|---|---|---|
| 버전 이력 복원 성공 | `onRestored` 호출 | 복원은 명시적 서버 권위 사건으로 전달 |
| 협업 패널 | callback 전달 | 복원 사건만 상위 편집 화면에 전달 |
| 상세 편집 페이지 | 권위 상세 refetch 후 provider seed | RED-A: header-only 복원도 stale 제거 |
| 일반 provider subscription | 변경 없음 | RED-B: 일반 협업 초안 보존 |
| empty/라인 수 불일치 조건 | 변경 없음 | RED-C 유지 |
| 저장 성공 revision invalidate | 변경 없음 | RED-D 유지 |

## 서버 권위 사건 계열 표 — 열거만

| 사건 | 현재 화면의 처리 | 편집 초안 stale 가능성 |
|---|---|---|
| 버전 복원 | 이번 R9에서 상세 refetch + provider server-wins 재시드 | 있음. 명시적 서버 권위 사건이므로 조치함 |
| 직접 주문서 PUT 저장 | 편집 모달을 닫고 상세/버전이력 query invalidate | 현재 편집 세션은 종료되므로 stale 초안이 남지 않음 |
| 협업 수정완료(commit) | 상세/목록/버전이력 query invalidate, 패널 edit mode 종료 | 다른 정식 편집 provider가 열려 있으면 stale 가능성 있음. 이번 조치 범위 밖 |
| 실시간 다른 사용자 저장/코멘트 이벤트 | 상세/목록/버전이력 query invalidate | 있음. 일반 협업 초안을 무조건 버리면 안 되므로 조치하지 않음 |
| 보류/보류 해제 | 상세 query에 mutation 응답을 setQueryData하고 목록 invalidate | 상태만 바뀌는 경우 편집 초안 자체는 stale 가능. 별도 PM 판단 필요 |
| 부분 전환/전표 발행 | 상세·목록 query invalidate | 전환 수량·상태가 바뀌므로 편집 초안 stale 가능. 별도 PM 판단 필요 |
| 삭제 | 목록/버전이력 invalidate 후 목록으로 이동 | 같은 페이지 편집 초안의 지속성은 없음 |
| 409 충돌 후 최신 내용 불러오기 | 사용자가 명시적으로 reload를 누르면 상세 refetch + provider 재시드 | 이미 명시적 server-wins 경로가 있음 |

## 남은 차단

- 이 워크트리에는 `node_modules`의 필수 패키지와 design-system/Electron 파생물이 없어 지정 테스트 및 typecheck를 실행하지 못했다.
- CI에서 지정 Vitest와 typecheck를 실행해야 최종 판정할 수 있다.
- 저장 1회당 `/revisions` GET 중복 문제와 SUPPLY 배선은 건드리지 않았다.
