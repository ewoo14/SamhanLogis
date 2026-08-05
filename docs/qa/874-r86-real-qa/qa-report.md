# R86 머지 전 라이브QA 보고서 — PR #1057 · 이슈 #874

## 환경 확인

| 확인 항목 | 실측 | 판정 |
|---|---|---|
| 렌더러 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t874\clients\desktop`에서 기동 | PASS |
| 렌더러 주소/포트 | `http://localhost:5313/`; `--host localhost --port 5313 --strictPort`. 기동 전 5313 빈 포트 확인. 기존 5173은 사용 중이어서 건드리지 않음 | PASS |
| 화면의 실제 API 네트워크 확인 | Playwright request/response 이벤트로 화면이 호출한 `/api/v1/partner-dc-configs/{code}`, 상품 검색, `/slips/price-memory`, `/slips/price-memory/bulk`, `POST /slips` 요청 URL·본문과 응답 본문 기록 | PASS |
| 배포본 시각 | `docker inspect -f '{{.Created}}' samhan-product-service` → `2026-08-05T17:31:13.740980474Z`; `samhan-dc-config-service` → `2026-08-05T17:31:13.74187812Z` | 재빌드·재배포 없음 |
| 이름 차이 | 요청의 `product-service`·`dc-config-service` 축약 컨테이너명은 없었고, 실제 컨테이너명은 각각 `samhan-product-service`·`samhan-dc-config-service`였음 | 기록 |
| 검증 HEAD | `d2b6701831df3a6c05aa47b88d0e1f4f87e239a4` | 일치 |
| UUID 화면 노출 | A~D 시나리오 본문에서 UUID 정규식 미검출 | PASS |

## 최종 판정

**PASS — 게이트 ③ 라이브QA 통과. 머지 권고.**

R78·R82·R84 대상인 단가 권위, 거래처 변경 재가격, A→B→A 경합 가드, DC 지연 fallback을 실서버 API와 실제 화면에서 재실행했다. 화면 캡처 15장과 네트워크 원문 4세트를 확보했다.

## 시나리오 결과

| 시나리오 | 기대 | 실측 | 판정 |
|---|---|---|---|
| A-1 `AX17B17NNDB-86` | 정가 204,000, 할인 문구 없음 | 화면 단가 `204,000`; 저장 응답·재조회 모두 VAT 포함 `204000`; 변동DC=f 품목의 전역DC 미적용 | PASS |
| A-2 `AJ060MXHNBC1` | 전역DC 48%, 1,355,640 | 화면 `1,355,640`; 저장 응답 `unitPriceWithVat=1355640`; `discountInfo`에 `거래처 전역DC 48% 적용` | PASS |
| A-3 `AJ020FERPBC2` | 고정DC 45% 우선, 1,089,000 | 화면 `1,089,000`; 저장 응답 `unitPriceWithVat=1089000`; `품목 고정DC 45% 적용` | PASS |
| A-4 기억 없는 조합 `AY047BA1SBA` | 정가 939,400 수렴 | 화면 `939,400`, `판매가`; 전역DC 미적용 | PASS |
| A-5 혼합 전표 | 라인별 규칙, POST 201, 재조회 동일 | 저장 `201`, 전표 `2026/08/06-21`; 저장 응답과 GET 재조회 `200`의 네 라인 값 동일 | PASS |
| B 거래처 변경 | A 48% → B 45%에서 자동단가 1,433,850 | `1,355,640` → `1,433,850`; 저장 응답 `201`, B `discountInfo=거래처 전역DC 45% 적용` | PASS |
| B 사용자 입력 보존 | 거래처 변경에도 직접 입력값 유지 | 직접 입력 `777,777`이 변경 전·후 화면과 저장 payload/응답에 동일 | PASS |
| B 변동DC=f 반대급부 | 거래처 변경에도 전역DC 미적용 | `AX17B17NNDB-86` 직접 입력값 유지, B 전역DC가 덮지 않음 | PASS |
| C 경합 중 | 늦은 응답이 A 라인을 덮지 않음, 저장 disabled | B bulk 응답을 지연하고 A DC GET을 지연한 동안 단가 `1,355,640` 유지, live `최근단가 확인 중…`, 저장 `disabled=true` | PASS |
| C 정상 변경 반대급부 | 평범한 변경은 재가격되고 저장 enabled | A DC 완료 후 단가 유지 상태에서 저장 `enabled`; 측정은 거래처 선택 시작부터 settled까지가 아니라 경합 단계 종료 후 enabled 상태를 확인 | PASS |
| D DC 지연 fallback | 품목 확정 후 5초 안에 정가 fallback·저장 enabled | DC GET 응답을 6초 이상 지연한 채 `AY047BA1SBA`가 `939,400`; **품목 확정 클릭부터 저장 enabled까지 4,273ms** | PASS |

## 시간 측정 기준

- B의 `2,458ms`는 `1012555999` 거래처 검색 input `fill` 시작부터 자동 재가격 완료까지다.
- D의 통과 수치 `4,273ms`는 상품 검색 결과에서 `AY047BA1SBA`를 **선택 확정한 시각부터** 저장 버튼이 enabled가 된 시각까지다. DC GET은 계속 지연 중이었고, 지연 응답 도착 전 fallback을 확인했다.
- C는 이미 활성화된 버튼을 첫 polling에서 재는 방식이 아니라, A 선택 후 A DC GET pending 상태에서 B bulk 반환 직후의 `disabled=true`와 A DC 완료 후 `enabled`를 각각 직접 확인했다.

## 네트워크·저장 원문

- [network-ab.json](network-ab.json), [network-b.json](network-b.json), [network-c.json](network-c.json), [network-d.json](network-d.json)
- [a-save-response.txt](a-save-response.txt), [a-requery-response.txt](a-requery-response.txt)
- [b-save-response.txt](b-save-response.txt), [b-requery-response.txt](b-requery-response.txt)
- 저장 응답 및 재조회에는 내부 UUID가 포함될 수 있으나, 이는 원문 증거 파일이며 화면에는 노출되지 않았다.

## 캡처

캡처는 15장이다. A 단계별 7장, B 단계별 4장, C 경합 단계 3장, D fallback 1장을 `screenshots/`에 보존했다. 캡처 0장 PASS가 아니다.

## 신규 파일 목록

- `docs/qa/874-r86-real-qa/qa-report.md`
- `docs/qa/874-r86-real-qa/screenshots/` 아래 15개 PNG
- `docs/qa/874-r86-real-qa/network-ab.json`
- `docs/qa/874-r86-real-qa/network-b.json`
- `docs/qa/874-r86-real-qa/network-c.json`
- `docs/qa/874-r86-real-qa/network-d.json`
- `docs/qa/874-r86-real-qa/a-save-response.txt`, `a-requery-response.txt`
- `docs/qa/874-r86-real-qa/b-save-response.txt`, `b-requery-response.txt`
- 시나리오별 화면 원문·판정 JSON: `01`~`15` 단계 txt, `a-before.json`, `a-after.json`, `b-result.json`, `c-result.json`, `d-result.json`, `login-response.txt`

드라이버는 `os.tmpdir()` 아래에만 생성했으며 저장소에는 만들거나 커밋하지 않았다. Git 쓰기·커밋·푸시, DB 직접 쓰기, Docker 재빌드·재배포·중지, vendor 발송은 수행하지 않았다.
