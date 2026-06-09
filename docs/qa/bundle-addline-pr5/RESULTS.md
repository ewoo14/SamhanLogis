# 기존 전표 라인추가(addLine) 세트 전개 — PR-5 (에픽 후속 #2)

> 세트→전표 전개 에픽 후속 #2. 기존 전표(DRAFT/SAVED)에 라인을 **추가**할 때도 신규 생성(create)
> 경로와 동일하게 BUNDLE(세트)를 구성품으로 전개한다. 종전 `addLine` 은 `SlipLine.create` 를
> 직접 호출해 세트가 1라인으로 그대로 들어가던 갭을 해소.

## 변경
- `SlipService.addLine` — `SlipLine.create` 직접삽입 → **`addSlipLinesExpanded`**(create 와 동일 단일 엔진) 호출. BUNDLE 이면 product-service expand 로 구성품 N라인(옵션 반영·6:4 재배분·첫 setHead+parentSetModel), 아니면 1라인.
- `AddLineRequest` (BE/FE) — `setOptions` 신규(7-arg 호환 생성자 유지).
- IT: `SlipControllerIT.addLine_bundle_expandedToComponents` (mock expand → 구성품 2라인, 총 1→3 + productName/unitPrice 단언).

> `updateSlip` 은 헤더/V20 필드만 수정(라인 미변경), 라인은 create/addLine/removeLine 뿐 → 본 PR 은 addLine 단일 갭. 견적은 update 가 이미 전개(PR-3a).
> FE `addLine` 은 API 만 존재(UI 미연결) → setOptions 타입만 추가, UI 화면 없음.

## 실서버 QA (재배포된 product+slip 컨테이너, 실 DB)

> stale 컨테이너(/expand 404, integrity 미존재)를 현재 코드로 `docker compose ... up -d --build product-service slip-service` 재배포 후 실 HTTP. [[feedback_real_server_check_screenshot]] 실 캡처 첨부.
> Testcontainers IT 는 Windows 로컬 skip → CI Linux 가 실행, 실서버 QA 로 로직 실증([[standalone-boot-real-qa]]).

흐름: `POST /slips`(SINGLE 라인 1) → `POST /slips/{id}/lines`(BUNDLE `AC052CS1PBH1SY`) → 슬립 상세 GET.

| 항목 | 결과 |
|---|---|
| addLine BUNDLE 전개 | 총 라인 **1 → 5** (원본 1 + 구성품 4) |
| 구성품/단가 | 실내기 478,495 + 실외기 719,010 + 판넬 118,580 + 무선리모컨 13,915 = **1,330,000**(세트가 보존, 6:4 재배분) |
| 메타 영속(slip_db) | 첫 구성품 `set_head=t`, 나머지 `f`, 전부 `parent_set_model=AC052CS1PBH1SY` |
| HTTP | create 201 / addLine 201 |

### 스크린샷
`addline-expanded.png` — 실 브라우저가 라이브 `:8086/slips/{id}` GET → 5라인(원본 SINGLE + BUNDLE 4구성품) JSON.

## 후속(비차단)
- `SlipDetailResponse.LineResponse` 가 `setHead`/`parentSetModel` 미노출(응답 None) — DB엔 정확 영속. FE 세트 그룹 표시용으로 추후 응답 확장 여지(에픽 #2 범위 외, convert 라인도 동일).

## 실사용자 UI 캡처 (실 Docker 스택 + 데스크톱 앱)

> 개발책임자 지시 — API JSON 이 아닌 **실사용자가 보는 화면** 캡처([[feedback_real_server_check_screenshot]]).
> 데스크톱 렌더러를 실 게이트웨이(:8080, VITE_MOCK_MODE 끔)에 붙이고 실 로그인(dev_master, 실 JWT)으로 수행.

| 화면 | 증빙 | 내용 |
|---|---|---|
| 출고전표 **상세** | `../bundle-real-ui/slip-detail-expanded.png` | 세트 전표가 **4개 구성품 라인으로 전개**되어 표시 — AC052CN1PBH1 478,495 / AC052CX1PBH1 719,010 / PC1BWSK3NW 118,580 / AR-EH05 13,915 |
| 새 출고전표 **작성폼** | `../bundle-real-ui/slip-form-bundle-picker.png` | BUNDLE 품목(AC052CS1PBH1SY) 선택 시 **세트 구성 옵션 picker**(실외기 제외/교체·판넬 선택/360형상·자재) 실 UI 노출 |

> addLine(기존 전표 라인추가)은 UI 미연결이라, 동일 전개 결과가 실 UI 에 보이는 **전표 상세 화면**으로 사용자-facing 증빙. addLine 자체의 실 HTTP 1→5 전개는 위 §실서버 QA 참조.
