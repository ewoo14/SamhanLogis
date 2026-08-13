---
name: feedback_tracked_file_inside_gitignored_build
description: 🚨 gitignore 된 build/ 안에 강제 추적된 파일이 있으면 라운드마다 '삭제됨' 으로 뜬다 — 복구는 git add -f 여야 하고, 위생 점검을 보고도 add -A 로 담으면 커밋된다 (2026-08-12 하루 7회 실측)
metadata:
  type: feedback
---

# 🚨 `tracked-writer.mjs` 가 하루에 일곱 번 지워진 이유

## 증상

라운드가 끝날 때마다 워크트리에 이게 뜬다.

```
 D tools/.s24-build-only/build/deep/tracked-writer.mjs
```

2026-08-12 하루에 **일곱 번** 나왔다. 여섯 번은 커밋 전에 복구했고 **한 번은 놓쳐서 커밋됐다**.

## 원인 — 규칙이 서로 어긋나 있다

```
tools/.s24-build-only/build/   ← .gitignore 대상
  └─ deep/tracked-writer.mjs   ← 그런데 강제 추적(add -f)돼 있다
```

⟹ 빌드/QA 라운드가 `build/` 를 정리하면 파일이 사라지고, git 은 **추적 파일 삭제**로 본다.
⟹ 되돌리려고 `git checkout --` 한 뒤 `git add` 하면 **gitignore 때문에 거부**된다.

```text
$ git add tools/.s24-build-only/build/deep/tracked-writer.mjs
The following paths are ignored by one of your .gitignore files:
tools/.s24-build-only/build
hint: Use -f if you really want to add them.
```

## How to apply

**복구는 `-f` 여야 한다**
```bash
git checkout origin/main -- tools/.s24-build-only/build/deep/tracked-writer.mjs
git add -f tools/.s24-build-only/build/deep/tracked-writer.mjs
```

**🚨 위생 점검을 "보는 것" 과 "거르는 것" 은 다르다**

2026-08-12 에 PM 이 커밋 직전 점검에서 ` D tracked-writer.mjs` 를 **출력으로 보고도**
바로 다음 줄에서 `git add -A` 로 그대로 담았다. 점검이 **차단하지 않으면 점검이 아니다.**

⟹ 스테이징 전에 이렇게 한다.
```bash
git status --porcelain | grep '^ D' && echo "🚩 삭제 있음 — 복구 먼저"   # 있으면 add 하지 말 것
git add <구체 경로들>          # 🚫 add -A 로 쓸어 담지 않는다
```

**codex 브리핑에 넣는다**
> 라운드 종료 시 삭제된 추적 파일이 없는지 확인하고 보고서에 한 줄 적으십시오.
> 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`.

이 문구를 넣은 라운드는 codex 가 스스로 복구하고 보고했다. 안 넣은 라운드에서 지워졌다.

## 근본 해법 (별도 트랙 후보)

`build/` 안에 추적 파일을 두는 구조 자체가 함정이다. 둘 중 하나여야 한다.
- 파일을 `build/` **밖**으로 옮긴다
- 또는 추적을 끊고 생성물로 다룬다

⚠️ 다만 이 파일은 **하네스 거짓 green 가드**가 쓰는 것으로 보이므로, 옮기기 전에 그 가드가 무엇을 보는지 확인해야 한다 → [[feedback_qa_harness_commit_breaks_ci]]

관련: [[feedback_check_tracked_before_delete]] · [[feedback_pm_copy_untracked_files]] · [[feedback_git_add_all_swallows_concurrent_round]]
