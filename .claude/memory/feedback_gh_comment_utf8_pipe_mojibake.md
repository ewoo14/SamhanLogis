---
name: feedback-gh-comment-utf8-pipe-mojibake
description: "PR 게시/PATCH 시 한국어 깨짐 방지 — 파이프의 cp949 디코드가 원인, UTF-8 파일 경유+게시 직후 자가 검사 의무"
metadata:
  node_type: memory
  type: feedback
  originSessionId: c2ed01c8-fdc9-42e8-b0c2-4893fe025ab5
---

# PR 게시 한국어 인코딩 — 파이프 금지·파일 경유·사후 검사

## 🚨 2026-07-21 추가 함정 — **인용 없는 heredoc 은 백틱을 실행한다**

`cat > f.md <<EOF`(인용 없음)로 본문을 쓰면 bash 가 **백틱 코드스팬을 명령 치환으로 실행**한다. 결과: `` `totalDiscount` `` 같은 코드스팬이 **본문에서 통째로 사라진 채** 이슈/PR 이 게시된다. `command not found` 는 stderr 로만 흘러가 놓치기 쉽다. 실측: 이슈 4건 중 2건 본문 훼손(#873 `totalDiscount`·#874 `riUsage` 소실 → 사후 `gh issue edit --body-file` 로 복구).

⟹ 본문 파일은 **`Write` 도구로 작성**하거나, heredoc 을 쓸 거면 반드시 **인용형 `<<'EOF'`**. 변수 확장이 필요하다는 이유로 인용을 풀지 말고 Write 로 완성본을 써라.
⟹ **게시 직후 자가 검사에 "백틱 코드스팬 생존 확인"을 포함**: `gh issue view N --json body --jq '.body' | grep -oE '\`[^\`]+\`'` 로 코드스팬을 뽑아 원본과 대조. 한글 mojibake 검사만으로는 이 훼손을 못 잡는다(한글은 멀쩡하고 코드스팬만 사라진다).

2026-07-04 개발책임자 지적("PR 리뷰게시할때 한국어 깨지지 않도록 주의") — PR #724 코멘트 PATCH 2건이 mojibake 로 게시돼 있었음.

**Why:** Windows 에서 `gh api --jq .body | python -c "..."` 처럼 **파이프로 UTF-8 본문을 python inline 에 통과**시키면 stdin 이 cp949 로 디코드되어 한국어가 깨진다(ê°/ì/í/� 패턴). `gh ... --body "인라인"` 도 셸 환경에 따라 동일 위험.

**How to apply:**
1. 게시 = `gh pr comment --body-file <파일>` — 파일은 반드시 Write 도구(UTF-8)로 생성. 인라인 --body 는 짧은 ASCII 위주만.
2. PATCH = json 파일을 python(io.open encoding='utf-8', ensure_ascii=False)로 만들어 `gh api -X PATCH --input <파일>`. **본문을 파이프로 python -c 에 흘리는 것 절대 금지.**
3. **게시/PATCH 직후 자가 검사 의무**: `gh api .../comments/<id> --jq .body | grep -c 'ê°\|ì \|í \|�'` → 0 아니면 즉시 재PATCH.
4. 기존 규칙 [[feedback-powershell-utf8-writes]](body-file=Write/heredoc만)의 확장 — PATCH·파이프 경로까지.

사례: #724 코멘트 4880519014/4880525022 — SHA 정정 PATCH 가 깨뜨림 → 파일 경유 재PATCH 로 복원(각 코멘트에 자가 정정 이력 기재).
