# PR #985 라이브 파생 라인 확인 결과

## 1. A/B 판정

**A/B 판정: 판정 불가. 인증 게이트에서 주문 경로에 진입하지 못했다.**

이번 라운드의 실제 사업자번호 `1068689215`(`주식회사 중앙유통`)는 다음 순서로 막혔다.

1. 실제 order-app에서 사업자번호를 입력하고 `조회`를 눌렀다.
2. 실 API의 `partner-status`는 `NOT_FOUND_AUTH`를 반환했고 화면에 `미승인 사업자번호`와 `승인요청 보내기`가 표시됐다.
3. 화면의 `승인요청 보내기`를 실제로 눌렀다. UI가 보낸 실 요청은 `POST /api/v1/auth/partner-register`이며 본문은 사업자번호 하나였다.
4. 실서버가 HTTP 500을 반환했다. 화면은 주문 화면으로 넘어가지 않고 로딩 상태/인증 게이트에 남았다.

따라서 `360 CST UV`(`AC060CS6PBH1SY`) 선택, `실외기 받침대 포함` 체크, 자동 파생 `발통세트` 표시, draft 생성, confirm, `partner_order_lines` 저장값은 이번 실 사용자 경로에서 관찰할 수 없었다. 이 결과는 파생 라인이 confirm을 막는다는 A의 증거도, confirm이 성공한다는 B의 증거도 아니다. 현재 확인된 결함은 파생 검증보다 앞선 **실 승인 요청 API 500**이다.

## 2. 시각 및 검증 대상

- 검증 대상 이미지의 기존 no-cache 재빌드: `2026-07-29 15:23:28 +09:00` ~ `2026-07-29 15:23:59 +09:00` (앞 라운드 기록).
- 이 라운드 재빌드: **하지 않음**. 사용자 지시대로 이미지 재빌드를 하지 않았다.
- 이 라운드 GUI 검증: `2026-07-29 17:09:31 +09:00` ~ `2026-07-29 17:15:01 +09:00`.
- 대상: 실 order-app `http://localhost:5184/` → 실 API `http://localhost:8080/api/v1`.
- 합성 데이터, fixture, 인증 DB 직접 수정은 사용하지 않았다.

## 3. 스크린샷 목록

기존 파일 `01`~`03`은 PM이 준비한 증거이며 보존했다.

- `01-order-app-initial.png`, `01-order-app-initial-annotated.png`: 기존 order-app 초기 화면.
- `01-catalog-initial.png`, `01-catalog-initial-annotated.png`: 기존 카탈로그 초기 화면.
- `02-catalog-loaded.png`, `02-catalog-loaded-annotated.png`: 기존 카탈로그 로드 화면.
- `03-pm-partner-gate-NOT_FOUND_AUTH.png`: 기존 `NOT_FOUND_AUTH` 미승인 게이트.
- `04-initial-gate.png`: 이번 라운드 실 order-app 최초 사업자등록번호 게이트.
- `05-auth-status-not-found.png`: `1068689215` 조회 후 실 `NOT_FOUND_AUTH` 응답에 따른 `승인요청 보내기` 화면.
- `06-auth-request-result.png`: 실제 승인 요청 직후 화면에 표시된 `데이터를 불러오는 중입니다` 상태.
- `07-auth-request-500-final.png`: HTTP 500 뒤에도 주문 화면으로 전환되지 않고 로딩 화면에 남은 전체 캡처.
- `07-auth-request-500-gate.png`: 같은 실패 뒤 `pageBizGate` 영역 캡처. DOM 상태는 미승인 게이트에 남았고, 실제 캡처에는 해제되지 않은 로딩 overlay가 보인다.

품목 선택, 받침대 체크, 파생 라인 표시, 확정 직전, 확정 성공/500 화면 캡처는 인증 게이트를 넘지 못했으므로 존재하지 않는다.

## 4. 실행 명령과 출력 원문

### 4.1 order-app 기동 확인

실행 명령:

```powershell
Get-NetTCPConnection -LocalPort 5184 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess; Get-Process -Id ((Get-NetTCPConnection -LocalPort 5184 -State Listen -ErrorAction SilentlyContinue).OwningProcess) -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path
```

출력 원문:

```text

LocalAddress LocalPort OwningProcess
------------ --------- -------------
::                5184         16288
```

실행 명령:

```powershell
Get-Process -Id 16288 -ErrorAction SilentlyContinue | Format-List Id,ProcessName,Path,StartTime
```

출력 원문:

```text


Id          : 16288
ProcessName : node
Path        : C:\Program Files\nodejs\node.exe
StartTime   : 2026-07-29 오후 5:02:44
```

### 4.2 GUI에서 실행한 인증 경로

브라우저에서 수행한 핵심 동작 명령:

```javascript
await page985c.goto("http://localhost:5184/",{waitUntil:"domcontentloaded",timeout:30000});
await page985c.screenshot({path:"D:\\dev\\Samhan-Public\\.claude\\worktrees\\t8-985\\docs\\qa\\985-live-derived-line\\screenshots\\04-initial-gate.png",fullPage:true});
await page985d.goto("http://localhost:5184/",{waitUntil:"commit",timeout:30000});
await page985d.locator("#bizGateInput").fill("1068689215",{timeout:5000});
await page985d.evaluate(()=>document.querySelector("#btnBizQuery").click());
await page985d.screenshot({path:"D:\\dev\\Samhan-Public\\.claude\\worktrees\\t8-985\\docs\\qa\\985-live-derived-line\\screenshots\\05-auth-status-not-found.png",fullPage:true});
await page985d.evaluate(()=>document.querySelector("#btnAuthAction").click());
await page985d.screenshot({path:"D:\\dev\\Samhan-Public\\.claude\\worktrees\\t8-985\\docs\\qa\\985-live-derived-line\\screenshots\\06-auth-request-result.png",fullPage:true});
await page985d.screenshot({path:"D:\\dev\\Samhan-Public\\.claude\\worktrees\\t8-985\\docs\\qa\\985-live-derived-line\\screenshots\\07-auth-request-500-final.png",fullPage:true});
await page985d.locator("#pageBizGate").screenshot({path:"D:\\dev\\Samhan-Public\\.claude\\worktrees\\t8-985\\docs\\qa\\985-live-derived-line\\screenshots\\07-auth-request-500-gate.png"});
```

`page985c`와 `page985d`는 각각 실제 Playwright Chromium 페이지 객체이며, 위 경로는 실행 시 사용한 절대 경로다.

실 `partner-status` 응답 원문:

```text
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"NOT_FOUND_AUTH","partnerName":"주식회사 중앙유통","message":"인증 정보가 없습니다 — 가입 신청 필요"},"timestamp":"2026-07-29T08:11:11.176203056Z"}
```

실 `partner-register` 응답 원문:

```text
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-07-29T08:11:45.732360115Z"}
```

실 승인 요청의 HTTP 요청 관찰 원문:

```text
[
  {
    "method": "POST",
    "url": "http://localhost:8080/api/v1/auth/partner-register",
    "postData": "1068689215"
  }
]
```

실패 뒤 GUI 상태 관찰 원문:

```text
{
  "ready": "complete",
  "gate": [
    {
      "id": "pageBizGate",
      "display": "flex",
      "text": "🛑\n미승인 사업자번호\n삼한공조시스템에는 등록되었으나\n사용승인되지 않은 사업자번호입니다.\n승인요청하시겠습니까?\n취소\n승인요청 보내기\n<주문서 이용 시 참고사항>\n① 품목수량 기입하기\n홈멀티, 상업멀티는 실외기, 실내기 수량만 입력해주세요.\n관련 부자재(판넬, 리모컨, 유연호스 등) 수량이 자동 기입됩니다.\n② 전체 견적보기\n원하시는 품목에 수량을 기입 후 상단 '견적/주문하기' 버튼을 누르세요.\n선택하신 품목들의 전체 견적을 확인할 수 있습니다.\n③ 견적/주문하기\n미리보기 화면에서 '주문하기' 버튼을 누르세요.\n발송하신 주문내역 확인 후 연락드리겠습니다."
    },
    {
      "id": "stepAuthAction",
      "display": "block",
      "text": "🛑\n미승인 사업자번호\n삼한공조시스템에는 등록되었으나\n사용승인되지 않은 사업자번호입니다.\n승인요청하시겠습니까?\n취소\n승인요청 보내기\n<주문서 이용 시 참고사항>\n① 품목수량 기입하기\n홈멀티, 상업멀티는 실외기, 실내기 수량만 입력해주세요.\n관련 부자재(판넬, 리모컨, 유연호스 등) 수량이 자동 기입됩니다.\n② 전체 견적보기\n원하시는 품목에 수량을 기입 후 상단 '견적/주문하기' 버튼을 누르세요.\n선택하신 품목들의 전체 견적을 확인할 수 있습니다.\n③ 견적/주문하기\n미리보기 화면에서 '주문하기' 버튼을 누르세요.\n발송하신 주문내역 확인 후 연락드리겠습니다."
    },
    {
      "id": "authSubMsg",
      "display": "block",
      "text": ""
    }
  ],
  "loading": [
    {
      "id": "pageLoading",
      "display": "flex",
      "text": "🕒\n\n데이터를 불러오는 중입니다.\n잠시만 기다려주세요."
    }
  ],
  "bodyClass": "no-active"
}
```

검증 시각 명령:

```powershell
Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

출력 원문:

```text
2026-07-29 17:15:01 +09:00
```

### 4.3 인증 DB 원문

실행 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_auth_db -P pager=off -c "SELECT biz_no, partner_code, status, deleted_at, is_deleted FROM partner_auth WHERE is_deleted = false ORDER BY biz_no;"
```

출력 원문:

```text
   biz_no   | partner_code |    status     | deleted_at | is_deleted 
------------+--------------+---------------+------------+------------
 8428102605 | 8428102605   | NEED_PW_INPUT |            | f
(1 row)
```

실행 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_auth_db -P pager=off -c "SELECT biz_no, partner_code, status, deleted_at, is_deleted FROM partner_auth WHERE biz_no = '1068689215';"
```

출력 원문:

```text
 biz_no | partner_code | status | deleted_at | is_deleted 
--------+--------------+--------+------------+------------
(0 rows)
```

### 4.4 `partner_order_lines` 원문

확정까지 가지 못했지만, 파생 대상 4개가 새로 저장됐는지 확인하기 위해 실제 DB를 조회했다.

실행 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_order_db -P pager=off -c "SELECT model_name, product_name, quantity, price_vat, subtotal, created_at FROM partner_order_lines WHERE model_name IN ('FH-LFHIF','발통세트','운임','절삭') OR product_name IN ('FH-LFHIF','발통세트','운임','절삭') ORDER BY created_at;"
```

출력 원문:

```text
 model_name | product_name | quantity | price_vat | subtotal | created_at 
------------+--------------+----------+-----------+----------+------------
(0 rows)
```

참고로 같은 조회 범위에 `AC060CS6PBH1SY`를 함께 넣었을 때의 기존 행은 다음과 같다. 이는 이번 인증 실패 뒤 생성된 행이 아니며, 파생 4개 행은 포함하지 않는다.

실행 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_order_db -P pager=off -c "SELECT model_name, product_name, quantity, price_vat, subtotal, created_at FROM partner_order_lines WHERE model_name IN ('AC060CS6PBH1SY','FH-LFHIF','발통세트','운임','절삭') OR product_name IN ('FH-LFHIF','발통세트','운임','절삭') ORDER BY created_at;"
```

출력 원문:

```text
   model_name   | product_name | quantity | price_vat  |  subtotal  |         created_at         
----------------+--------------+----------+------------+------------+----------------------------
 AC060CS6PBH1SY | 360 CST UV   |        1 | 1590000.00 | 1590000.00 | 2026-07-29 15:14:20.02192
 AC060CS6PBH1SY | 360 CST UV   |        1 | 1590000.00 | 1590000.00 | 2026-07-29 16:14:24.081802
(2 rows)
```

## 5. 이 라운드가 보지 않은 것

- 인증 게이트 이후의 실제 싱글중대형 화면.
- `360 CST UV` 수량 입력과 `실외기 받침대 포함` 체크.
- 화면에 자동 생성되는 `발통세트`, `FH-LFHIF`, `운임`, `절삭` 파생 라인과 표시 단가.
- 실제 draft 생성, confirm 성공/실패 결과, 확정 직후 저장된 `partner_order_lines`.
- 따라서 파생 라인의 0원 저장 여부와 화면 단가-확정 단가 차이.

이 항목들은 인증 승인 상태를 실 제품 경로로 만들 수 있어야 후속 실측할 수 있다. 이번 라운드에서는 DB 직접 수정이나 인증 헤더 주입으로 우회하지 않았다.
