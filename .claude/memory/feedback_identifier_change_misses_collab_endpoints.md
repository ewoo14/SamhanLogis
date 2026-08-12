---
name: feedback_identifier_change_misses_collab_endpoints
description: 🚨 식별자 축(UUID→token, 문서번호→id)을 바꾸면 collab/comments·presence·edits·stream 계열이 반복해서 빠진다 — 상세 화면이 내는 요청을 전수로 훑는 테스트가 아니면 매번 샌다 (2026-08-13 하루 3트랙 실측)
metadata:
  type: feedback
---

# 🚨 식별자를 바꿀 때 `collab/*` 가 매번 빠진다

## 실측 — 하루에 세 트랙

| 트랙 | 바꾼 축 | 적용한 곳 | 빠진 곳 |
|---|---|---|---|
| `#1092` | 문서번호 → 하이픈 path id | 상세 API | `collab/comments`·`presence`·`stream`·`coedit`·`revision` → **`400`/`403`** |
| `#1072` | UUID → opaque token | 목록·상세 | `collab/comments`·`presence`·`edits` → **`400 INVALID_INPUT`** |
| `#999` | UUID → opaque token | 응답 본문 | **요청 URL** → UUID 노출 |

`#1092` 는 이걸로 **다섯 라운드**를 썼다. `404 → 500 → 400(상세만) → 2건 → 축 전환`.

## 왜 반복되는가

식별자를 바꾸는 사람은 **자기가 보는 화면의 주 경로**(목록·상세)를 고친다. 그런데 상세 화면은 **자기가 열릴 때 곁가지 요청을 여럿 낸다** — 코멘트·접속자·수정이력·스트림·리비전. 이것들은
- 화면에 **조용히 실패**해도 티가 안 난다 (코멘트가 안 뜰 뿐)
- 단위 테스트가 **주 경로만** 커버한다
- 개발자가 **그 경로를 목록으로 갖고 있지 않다**

`#1092` 는 *"25개 경로 전수 sweep"* 이라고 보고했는데도 실 GUI 에서 `400` 이 남았다. **목록을 만드는 것과 적용하는 것은 다르다.**

## How to apply

**fix 브리핑에 이 문장을 넣는다**
> 🔑 먼저 전수로 세십시오 — 상세 화면이 호출하는 **모든 엔드포인트**를 찾아 목록과 처리 표를 보고서에 남기십시오. `collab/*` 계열이 반복해서 빠집니다.

**테스트 형태를 지정한다**
> ⚠️ 한 경로만 테스트하지 마십시오. **상세 화면이 내는 요청 전부를 한 테스트에서 훑는** 형태로 만드십시오.

**라이브QA 브리핑에 넣는다**
> 🚩 상세 화면을 열고 **네트워크 요청을 전수로 관찰**하십시오. `400`·`403`·`404`·`500` 이 하나라도 있으면 목록이 불완전한 것입니다.

이 문구를 넣은 라운드에서 처음으로 `collab/*` 누락이 잡혔다.

## 🔑 축을 바꿀 거면 처음부터 opaque token 으로

`#1092` 가 네 번 실패한 뒤 `#1143`·`#1072` 가 쓴 **URL-safe opaque token** 으로 갈아탔다. 문서번호(`2026/08/10-9`)를 URL 에 넣으면 슬래시가 경로 구분자라 프런트·gateway·서버 어디서든 새 지점이 생긴다. **인코딩으로는 못 막는다** — `%2F` 를 서버 경계가 `/` 로 되돌려 `NoResourceFoundException` 이 났다.

관련: [[feedback_defect_family_sweep_fix]] · [[feedback_uuid_no_user_visibility]] · [[feedback_fix_closes_symptoms_not_denominator]]
