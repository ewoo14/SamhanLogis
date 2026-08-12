---
name: feedback_isolated_clone_destroys_utf8
description: 🚨🚨 격리 QA 로 DB 를 복제할 때 pg_dump 를 PowerShell 파이프로 흘리면 한글이 전부 '?' 로 깨진다 — 그 라운드의 스크린샷은 문구·양식을 증명하지 못한다 (2026-08-12 실측)
metadata:
  type: feedback
---

# 🚨🚨 격리 QA 복제가 한글을 죽인다 — 스크린샷이 증명을 못 하게 된다

> 개발책임자 (2026-08-12): *"1158 문서화면에 왜 글자들이 '?'로 나오지?"* · *"상호도 전부 '?'로 나오네? 거래처관리에서 말야."*

## 실측

```text
공유 원본 (samhan-postgres)   실서버 QA — 6월 택배비 지출결의
격리 복제본 (recon845-pg)     ??? QA ? 6? ??? ????

공유 원본 거래처 상호          (주)한국냉동물류 · (주)서울택배 · 대한화물서비스(주)
격리 QA 화면                   ????? · ????
```

## 원인 — 앱도 폰트도 아니다

`?` 가 **데이터에만** 나오고 **정적 UI 문구는 멀쩡**하면 폰트가 아니다. 데이터 경로의 charset 손실이다.

세 곳을 갈라 짚으면 범인이 하나로 좁혀진다.

| 층 | 실측 | 판정 |
|---|---|---|
| 공유 DB 원문 | `실서버 QA — 6월 택배비 지출결의` | ✅ 정상 |
| 컨테이너 JVM | `LANG=en_US.UTF-8` · `file.encoding=UTF-8` · `sun.jnu.encoding=UTF-8` | ✅ 정상 |
| **격리 복제본** | `??? QA ? 6? ??? ????` | 🔴 **여기서 깨진다** |

⟹ `pg_dump | pg_restore` 를 **PowerShell 파이프**로 흘리면 파이프가 텍스트로 취급해 콘솔 코드페이지로 재인코딩한다. → [[feedback_powershell_utf8_writes]]

## 🔑 왜 이게 심각한가 — 증거가 조용히 무효가 된다

라운드는 **PASS 로 끝난다.** 테스트도 통과하고 스크린샷도 남는다. 그런데 그 스크린샷으로는

- 화면 **문구**가 맞는지
- 인쇄 양식이 **legacy 100% 매칭**인지
- 거래처·품목 **이름이 제대로 나오는지**

어느 것도 판정할 수 없다. **적대검증 두 라운드가 이 화면을 보고도 지적하지 않았고, 개발책임자가 스크린샷을 보고 즉시 잡았다.**

## How to apply

**복제할 때**
```
🚫 pg_dump ... | pg_restore ...        PowerShell 파이프 금지
✅ 파일로 떨어뜨렸다가 넣기            pg_dump -Fc -f dump.bin  → pg_restore dump.bin
✅ 컨테이너 간 직접 스트림             docker exec ... pg_dump | docker exec -i ... psql  (bash 에서)
```

**복제 직후 반드시**
```sql
SELECT name FROM partners WHERE name ~ '[가-힣]' LIMIT 3;
```
를 돌려 **한글이 멀쩡한지 확인하고 원문을 보고서에 남긴다.** 이 확인 없이 라이브QA 를 시작하지 않는다.

**브리핑에 넣을 문구**
> 복제 후 한글이 깨지지 않았는지 SELECT 로 확인하고 원문을 남기십시오. 깨졌으면 라이브QA 를 시작하지 말고 보고하십시오.

**스크린샷을 받을 때 (PM)**
데이터 자리에 `?` 가 보이면 **그 라운드의 문구·양식 판정은 무효**다. 도달성 판정은 살아 있을 수 있으나 텍스트 축은 다시 봐야 한다.

관련: [[feedback_powershell_utf8_writes]] · [[feedback_live_qa_artifacts_vanish_silently]] · [[feedback_qa_pass_is_not_defect_zero]] · [[feedback_real_server_check_screenshot]]
