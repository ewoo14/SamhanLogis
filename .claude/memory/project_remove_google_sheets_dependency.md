---
name: project-remove-google-sheets-dependency
description: 개발책임자 방향 — 품목 데이터 원천이 구글 시트면 안 된다. 시트 접근은 1회성 이전 다리로만 쓰고 그 뒤 제거한다
metadata:
  type: project
---

# 🚨 구글 의존성 제거 — 시트는 **1회성 이전 다리**로만

2026-08-08 개발책임자:

> *"품목 데이터 원천이 구글 시트면 안되는거지. **구글 의존성을 없애려는건데**"*

이어서 범위를 **"1회성 이전 다리로만"** 으로 확정했다.

```
1  시트 전체를 DB 로 1회 이전 (품목·단가·세트·구성품·옵션)
2  이전 전후 금액 대조 — 회귀 0 확인
3  #896 수식을 DB 규칙으로 전환
4  estimate-app 의 apps-script-shim 제거
5  GoogleSheetsClient · SheetSync 제거

SA 키 필요 구간 = 1~2 뿐
대가(수용됨): 이전 시점 이후의 시트 수정은 반영되지 않는다 — 그게 목표이기도 하다
```

## 실측한 의존성 지도 (2026-08-08)

```
① product-service        GoogleSheetsClient · ProductSheetSyncService
                         ProductLookupSheetSyncService · ProductAdminController
② partner-order-service  GoogleSheetsClient · BootstrapService · ProductCatalogLookupClient
③ clients/web/estimate-app/lib/
     google-sheets-client.js · apps-script-shim.js · code.js
```

🔑 **③이 가장 깊다.** 종합견적서 웹앱은 우리 서버(Express+EJS)에서 돌지만 **그 안에서 Apps Script shim 을 통해 시트를 직접 읽는다.** 호스팅만 우리 것으로 옮겼고 데이터 원천은 그대로 구글이었다.

## 🔑 그래서 `#896` 이 곧 이 작업이다

`#896`(GAS 하드코딩 수식을 동적 전환)은 별개 기능 개선이 아니라 **구글 의존성 제거의 본체**다. 수식마다 붙이는 판정이 정확히 "DB 로 옮길 수 있는가" 이다.

```
DATA_OK / DATA_PARTIAL / CODE_ONLY / UNKNOWN
```

## 🚩 프레이밍 주의 — `#978 슬1`(SA 키 복구)

핸드오프에 *"`#978` 슬1(SA 키)이 최우선 — 시트 동기화가 죽어 `#1095` 라이브QA 를 막는다"* 로 적혀 있었고 PM 이 그대로 옮겼다. **그 프레이밍은 "시트 동기화를 되살린다" 를 목표로 전제한다.** 방향이 제거라면 키는 **이전 다리 구간에만** 필요하다.

⚠️ 문서에 적힌 우선순위를 그대로 옮기기 전에 **그 목표가 현재 방향과 맞는지** 물을 것.

## SA 키 위치 (집PC)

```
C:\dev\samhan-homepage-260f8ae469cc.json        ← 프로젝트 바로 앞(상위 폴더)
같은 폴더: 기초품목.xlsx · 거래처목록.xlsx
```
GCP 표준 작명 `<프로젝트>-<키ID>.json` 이고, `.github/workflows/sa-rotation-reminder.yml:36` 의 `samhan@samhan-homepage.iam.gserviceaccount.com` 과 같은 프로젝트다.

🔑 **프로젝트 안만 뒤져서 못 찾았다.** 개발책임자가 *"프로젝트 바로 앞"* 이라고 했을 때 그것은 **상위 폴더**를 뜻했다. 시크릿은 레포 밖에 두는 것이 정상이므로 다음엔 상위 폴더부터 볼 것.

기대 경로는 `GOOGLE_SERVICE_ACCOUNT_KEY=/etc/samhan/sa-key.json`(기본값)이라 **컨테이너에 마운트하거나 env 로 경로를 넘겨야** 한다. 현재 product-service 컨테이너에는 `/etc/samhan` 도 `GOOGLE_*` env 도 없다.

## 함께

- [[feedback_gas_full_inheritance_definition]] — 계승 정의(기능·표현 데이터는 복사, 디자인 자유)
- [[feedback_estimate_order_item_requires_base_product]] — 계승 기준을 살아있는 시트로 잡지 말 것
