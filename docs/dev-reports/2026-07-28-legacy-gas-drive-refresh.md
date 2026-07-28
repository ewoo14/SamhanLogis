# 레거시 GAS 정본 갱신 (Drive 라이브 → 저장소) + 마스킹 게이트화

> 2026-07-28 · 개발책임자 지시 *"재마스킹 필요. 회사PC처럼 진행."*
> 브랜치 `chore/legacy-gas-drive-refresh`

---

## 1. 발단

개발책임자 지시로 GAS 소스를 구글 드라이브에서 전량 재다운로드해 저장소 사본과 대조한 결과, **정본이 라이브와 어긋나 있고 일부는 손상돼 있었다.**

Drive Apps Script 프로젝트 **27개** 전수 열거(페이지네이션 2회 · `nextPageToken` 소진 확인).

| 판정 | 건수 |
|---|---:|
| 바이트 동일 | **1** |
| 드리프트 — 시크릿 치환만 | 13 |
| **드리프트 — 기능 변경 포함** | **11** |
| Drive 전용(저장소에 없음) | 1 — `영업수수료 계산` |
| 미확보 | 1 — `종합견적서` |

## 2. 🚨 이 작업이 무게이트 표면임을 먼저 확인했다

저장소 사본은 시크릿을 `REDACTED_*` 로 **의도적으로 마스킹**해 두었으나, **그 마스킹을 강제하는 CI 게이트가 없다.**

`scripts/check-credential-plaintext.sh:126` 의 화이트리스트에 `'tools/legacy-gas/'` 가 있다(주석 28행 *"레거시 스냅샷"*).

**PM 실측 프로브** — `tools/legacy-gas/` 에 가짜 Notion 토큰을 심고 가드를 실행:
```text
$ printf "const NOTION_TOKEN = 'ntn_FAKE1234567890abcdefghijklmnopqrstuvwxyz';\n" \
    > tools/legacy-gas/__guard_probe__.js
$ bash scripts/check-credential-plaintext.sh
EXIT=0
 [PASS] 자격 평문 비공개 — 위반 없음
```
⟹ **평문 시크릿이 들어가도 CI 는 green 이다.** 마스킹이 사람 손에만 의존하고 있었다.

이 상태로 27개 프로젝트를 갱신하면 **실 시크릿이 git 이력에 영구 각인**될 수 있다. 갱신과 게이트화는 분리할 수 없다 → 같은 슬라이스로 처리한다.
([[feedback_ungated_surface_and_mock_covering_defect]] — *"CI green 을 세기 전에 그 CI 가 검사하지 않는 표면을 명시하라"*)

## 3. 범위

### 3-A. 정본 갱신
- Drive 라이브 26개 프로젝트를 `tools/legacy-gas/<기존 저장소 폴더명>/` 에 반영
- **폴더명은 저장소 기존 이름을 유지**한다. Drive 와 15건이 다르지만(`가배차분류 리스트`↔`가배차분류리스트`, `거래처 주문서`↔`거래처 발송 주문서`, `이카운트-DPS 입고기록분석`↔`DPS 입고기록 비교` 등) 이름을 바꾸면 diff 가 폭발하고 기존 참조가 끊긴다. **매핑표를 본 문서에 기록**한다
- `영업수수료 계산` — Drive 전용 신규. 신규 폴더로 추가
- `종합견적서` — **미확보**. Apps Script `script+json` export 가 `File too large for export` 로 실패. 원인은 `NanumGothic.html`/`NanumGothicBold.html`(base64 내장 폰트) 2개만 **12.4MB** 이고 API 가 프로젝트 전체를 단일 JSON blob 으로 묶기 때문. **이 슬라이스에서 갱신하지 않고 사유를 기록**한다(추측으로 채우지 않는다)

### 3-B. 재마스킹 (🚨 최우선 제약)
저장소 사본의 마스킹은 **의미 기반**이다 — 변수명으로 placeholder 를 고르며, 같은 placeholder 가 여러 실 토큰을 대체한다(비가역).

| placeholder | 출현 |
|---|---:|
| `REDACTED_NOTION_TOKEN` | 62 |
| `REDACTED_ECOUNT_API_CERT_KEY` | 4 |
| `REDACTED_NAVER_MAP_KEY_ID` · `REDACTED_NAVER_MAP_KEY` | 각 2 |
| `REDACTED_ROAD_API_KEY` · `REDACTED_NAVER_SEARCH_SECRET` · `REDACTED_NAVER_SEARCH_ID` · `REDACTED_NAVER_SEARCH_CLIENT_SECRET` · `REDACTED_NAVER_SEARCH_CLIENT_ID` · `REDACTED_JUSO_ROAD_API_KEY` · `REDACTED_JUSO_BUILDING_API_KEY` · `REDACTED_GOOGLE_API_KEY` · `REDACTED_BUILDING_API_KEY` | 각 1 |

⟹ **비가역이라 값 대조로는 검증할 수 없다.** 검증은 "평문 시크릿이 0인가" 로만 가능하다.

### 3-C. 게이트화
`check-credential-plaintext.sh` 의 `tools/legacy-gas/` 화이트리스트를 제거하고, `REDACTED_*` placeholder 는 line 단위 허용에 추가한다.

## 4. 불변식

> **G-1** 저장소에 들어가는 `tools/legacy-gas/**` 에 **평문 시크릿이 0건**이다 — Notion 토큰·이카운트 인증키·Google/Naver/주소 API 키 전부.
> **G-2** 마스킹은 **의미를 보존**한다 — 어느 변수가 어떤 종류의 자격인지 placeholder 이름으로 알 수 있고, 기존 13종 규약을 그대로 쓴다.
> **G-3** 시크릿 외의 **모든 로직·문자열은 Drive 원본 그대로** 반영된다 — 마스킹을 핑계로 코드를 고치지 않는다.
> **G-4** 갱신 이후 **평문 시크릿이 들어오면 CI 가 RED** 가 된다 — 사람 손에 의존하지 않는다.
> **G-5** 못 가져온 것(`종합견적서`)은 **가져온 것처럼 보이지 않는다** — 파일을 건드리지 않고 사유를 문서에 남긴다.

## 5. 🚩 갱신이 드러낸 실질 드리프트 (별건 판단 대상)

정본이 낡아 있었다는 것은 **SP-08 레거시 GAS 동등성 검증의 기준이 낡았다**는 뜻이다([[project_sp_08_legacy_gas_parity]] 가 `tools/legacy-gas/**` 를 read-only 정본으로 삼는다).

| 항목 | 내용 | 영향 |
|---|---|---|
| **거래처 주문서** | 가격 우선순위가 `출고가 우선` → **`납품가 우선` 으로 반전**, 단가인상 기준일 `04-01`→`07-01` | **금액 직접** |
| **일마감 프로그램** | 단가인상 기준일 `07-01` 로 갱신 | **금액 직접** |
| **교육안내 자동상태변경** | 저장소본이 `신청불가` → `신청綈가` 로 **인코딩 손상된 채 커밋**돼 있음. Drive 원본은 정상 | 손상 정본 |
| **입출고 내역** | 저장소본 파일명이 `이카운트입출고내엮.xlsx` **오타**(Drive 는 `내역`) | 저장소본대로면 파일 미발견 |
| 그 외 | 미배차리스트·가배차분류리스트·가입고처리·에어디자이너 주문서 인식·계산서업로드양식·내일자 전표 이미지 생성에 UI·로직 신규 기능 | — |

⚠️ **본 슬라이스는 정본을 라이브와 맞추는 것까지**다. 위 드리프트가 제품 코드(estimate-app / order-app)의 동등성 판정에 미치는 영향은 **개발책임자 판단 후 별건**으로 다룬다 — 새 이슈 등록은 사전 허락이 필요하다.

## 6. 검증 계획

| # | 검증 | 방법 |
|---|---|---|
| V1 | **평문 시크릿 0** | 화이트리스트 제거 후 `check-credential-plaintext.sh` EXIT=0. **추가로** 고엔트로피 문자열 리터럴 전수 스캔(Notion `ntn_`/`secret_`, Google `AIza`, 32자+ base62 등) |
| V2 | **게이트가 실제로 잡는다** | 가짜 토큰을 심고 가드가 **RED** 를 내는지 확인 후 제거 (RED-first) |
| V3 | **placeholder 허용** | 13종 `REDACTED_*` 가 들어간 상태에서 가드 EXIT=0 |
| V4 | **로직 무훼손** | 마스킹 라인을 제외한 diff 가 Drive 원본과 일치 |
| V5 | **미확보 정직성** | `종합견적서` 파일이 **무변경**임을 `git diff` 로 확인 |

---

## 7. 매핑표 · 프로젝트별 반영 결과

(구현 단계에서 채운다)
