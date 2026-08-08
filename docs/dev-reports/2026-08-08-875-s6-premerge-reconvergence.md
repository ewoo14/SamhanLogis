# PR #1056 (#875) S6 머지 전 재수렴 적대검증

- 대상 HEAD: `c3726ddec7e85b4864f3d3eb76945a99f960bb03`
- 대상 PR: #1056
- 직전 결함: 저장분 복원·재렌더 뒤 사용자 `절삭`이 `500`이 아니라 `-500`으로 표시
- 최종 판정: **FAIL — 기능 결함은 재수렴했으나 머지 차단 1건**

## 결론

S4가 낸 표시 부호 결함은 현재 HEAD의 payload 수준 재현에서 고쳐졌다. 네 탭 모두
저장·계산 상태 `-500`을 표시 변환하면 `500`이고, `buildSendRows()`와
`getStructuredQuoteData()`에는 계속 `-500`이 남아 총액을 깎았다. 복원 후 수정·재저장,
0 삭제, 사용자 절삭과 자동 절삭 동시 발동, 양수 운임도 모두 계약과 일치했다.

그러나 S3/S5 회귀 테스트인
`clients/web/estimate-app/test/special-row-inheritance.test.js`가 Git 미추적 상태이며 PR 파일
목록에도 없다. 로컬 `192/192` 통과에는 이 미추적 파일의 6개 테스트가 포함된다. 현재
PR만 머지하면 S3/S5가 세운 자동 회귀 단정이 저장소에 남지 않으므로 머지를 차단한다.

## S4 재현 절차 재실행

### RED-A — 복원·재렌더 표시

실제 HEAD EJS에서 `formatSpecialPriceForDisplay()`와 네 렌더 함수의 배선을 읽어 실행했다.

| 탭 | 복원된 custom price | 표시 변환 |
|---|---:|---:|
| 홈 | `-500` | `500` |
| 싱글 | `-500` | `500` |
| 상업 | `-500` | `500` |
| 구형 | `-500` | `500` |

로컬 앱은 `http://127.0.0.1:5183/`에서 HTTP 200으로 응답했다. 서버가 실제 반환한 HTML에는
helper 정의 1개와 네 렌더 함수의 helper 호출 4개가 있었다. 다만 연결 가능한 브라우저가
0개여서 실제 입력 DOM과 픽셀 화면은 확인하지 못했다. 따라서 실제 화면 실측은
**판정 불가**이고, 위 결과는 서버 렌더 원문과 함수 실행 수준이다.

### RED-B — 합계와 두 payload의 음수 보존

복원 상태를 네 탭에 각각 주입하고 실제 EJS에서 추출한 두 함수를 직접 실행했다.

| 탭 | `buildSendRows()` 절삭 | `getStructuredQuoteData()` 절삭 | 합계 기여 |
|---|---:|---:|---:|
| 홈 | `-500` | `-500` (`sub=-500`) | `-500` |
| 싱글 | `-500` | `-500` (`sub=-500`) | `-500` |
| 상업 | `-500` | `-500` (`sub=-500`) | `-500` |
| 구형 | `-500` | `-500` (`sub=-500`) | `-500` |

네 행 모두 `qty=1`, `source=CATALOG_SPECIAL`을 유지했다. 표시 helper는 숫자를 반환할 뿐
custom price map을 변경하지 않았고, 두 payload는 map의 음수 값을 직접 사용했다.

## 위험 왕복 경로

### 복원 → 수정 → 재저장 → 재복원

복원 화면의 표시값 `500`을 사용자가 `750`으로 수정하는 경로를
`handleFreightInput()`으로 실행했다. 네 탭 모두 입력칸은 `750`, custom price map은
`-750`, 수량은 `1`이 됐다. 이를 snapshot과 동일한 `[key, value]` 배열로 직렬화한 뒤
새 map에 복원했다.

복원된 두 payload에서 네 탭 모두 절삭 단가와 소계는 `-750`이었다. 표시 절댓값이 저장
값으로 되돌아갈 때 부호가 소실되거나 양수로 반전되지 않았다.

### 복원 후 0으로 삭제

복원된 절삭을 `0`으로 입력한 결과는 네 탭에서 동일했다.

- 입력칸: 빈 문자열
- custom price: `0`
- 수량: `0`
- 카탈로그 배열: 절삭 행 유지
- `buildSendRows()`: 절삭 행 제외
- `getStructuredQuoteData()`: 절삭 행 제외

화면의 실제 행 존속 픽셀은 브라우저 부재로 판정 불가지만, 렌더 입력인 카탈로그 배열에는
행이 남고 두 payload에서만 제외되는 상태를 확인했다.

## 사용자 절삭과 자동 절삭 동시 발동

### 일반 품목이 자동 절삭 대상인 경우

각 탭의 복원 state에 다음 값을 주입했다.

```text
일반 품목       +10,500
운임               +300
사용자 절삭         -200
자동 절삭 단위     1,000
```

`buildSendRows()`와 `getStructuredQuoteData()` 모두 일반 품목을 `9,900`으로 조정하고,
카탈로그 운임 `+300`과 카탈로그 절삭 `-200`을 그대로 보존했다. 네 탭의 두 payload 최종
합계는 모두 `10,000`이었다. 사용자 절삭이 자동 절삭 대상으로 흡수되거나 양수로 바뀌지
않았다.

### 별도 자동 절삭 행이 필요한 경우

일반 품목 없이 카탈로그 운임 `+300`, 사용자 절삭 `-200`, 절삭 단위 `1,000`을 복원했다.
네 탭의 두 payload 모두 다음 세 행을 별도로 유지했다.

- 운임 `+300`, `source=CATALOG_SPECIAL`
- 사용자 절삭 `-200`, `source=CATALOG_SPECIAL`
- 자동 절삭 `-100`, `source=AUTO_CUTOFF`, `identity=auto-cutoff:...`

최종 합계는 0이다. 사용자 절삭과 자동 절삭은 이름이 같아도 병합되지 않았다.

## 운임 회귀

네 탭에서 운임 `400`을 복원하면 표시 변환은 `400`, 두 payload 단가는 `+400`, 수량은
`1`, 출처는 `CATALOG_SPECIAL`이었다. 동시 절삭 시나리오에서도 운임 `+300`은 양수로
유지됐다. S5 표시 helper가 정상 양수 운임의 부호를 바꾸지 않았다.

## RED-C 재확인

| 계약 | 홈 | 싱글 | 상업 | 구형 |
|---|---|---|---|---|
| 금액 0 특수행은 카탈로그 state에 남고 두 payload에서 제외 | 통과 | 통과 | 통과 | 통과 |
| 금액이 있으면 수량 1로 두 payload에 포함 | 통과 | 통과 | 통과 | 통과 |
| 사용자 절삭과 자동 절삭이 별도 source/identity로 유지 | 통과 | 통과 | 통과 | 통과 |
| 운임 양수, 사용자 절삭 음수 | 통과 | 통과 | 통과 | 통과 |

## 머지 차단 1 — 회귀 테스트가 PR에 없다

`git ls-files --error-unmatch clients/web/estimate-app/test/special-row-inheritance.test.js`는
`pathspec ... did not match any file(s) known to git`으로 실패했다. `gh pr view 1056`의
파일 목록에도 해당 테스트가 없고, PR의 유일한 앱 코드 파일은
`clients/web/estimate-app/views/index.ejs`다.

반면 로컬 대상 테스트 `6/6`과 전체 `192/192`는 이 미추적 파일을 Jest가 발견해 실행한
결과다. S5 보고서의 RED-A/RED-B와 S3의 q=0/q=1/source 분리 단정은 현재 PR의 재현 가능한
자동 테스트가 아니다. 테스트 파일을 PR에 포함해 CI에서 같은 단정을 실행하기 전에는
S3·S5 회귀 가드가 세워졌다고 판정할 수 없다.

## 검증 명령과 운영 상태

- `npx jest test/special-row-inheritance.test.js --runInBand`: `6/6` 통과
- `npm test -- --runInBand`: `12 suites`, `192/192` 통과
- `npm run typecheck`: `typecheck OK: 16 JavaScript files`
- HEAD와 원격 PR head: 모두 `c3726ddec7e85b4864f3d3eb76945a99f960bb03`
- GitHub checks: 진행 중이던 Desktop Playwright까지 종료 후 실패 0, 전체 완료;
  `mergeStateStatus=CLEAN`
- 공유 Docker: 24개 running, 기존 `samhan-nginx` unhealthy만 확인; 재기동하지 않음
- S6가 시작한 로컬 estimate-app PID `77764` 회수 후 5183 listener 0개 확인
- DB 직접 쓰기, 스프레드시트·GAS 쓰기, commit, push, 코드 수정 없음

PR 범위에 대한 `git diff origin/main...HEAD --check`는 기존 보고서 3개의 5개 줄에서 trailing
whitespace를 검출했다. 런타임 금액 결함은 아니므로 위 머지 차단 건수에는 추가하지 않았지만,
S5 보고서의 `git diff --check 출력 없음`은 작업 트리 diff만 검사한 결과이며 PR 전체 범위를
증명하지 않는다.

## 신규 파일

- `docs/dev-reports/2026-08-08-875-s6-premerge-reconvergence.md` — 이 보고서 1개

검증 시작 전부터 존재한 미추적 파일
`clients/web/estimate-app/test/special-row-inheritance.test.js`,
`docs/superpowers/plans/2026-08-08-875-s3-special-row-inheritance.md`는 수정하지 않았다.

## 이 라운드가 보지 않은 것

- 연결 가능한 브라우저가 없어 실제 마우스·키보드 입력, DOM 재렌더 결과와 픽셀 화면은 보지
  못했다. 해당 화면 실측은 판정 불가다.
- 공유 Docker 서비스를 현재 HEAD 이미지로 재빌드·재기동하지 않았다.
- DB를 조회하거나 쓰지 않았다.
- 스프레드시트·GAS는 읽거나 쓰지 않았다.
- 거래처 발송 주문서의 별도 특수행 제외 정책은 이번 S5 표시 fix 범위가 아니어서 보지 않았다.
