# #896 P0 하네스 거짓 green 가드 수정 보고서

작성일: 2026-08-09

## 결론

선택지 A를 적용했다. `scripts/generate-896-p0-golden-manifest.mjs`의 모든 산출물 쓰기 경로가 `resolveQaShotsDir()`를 거치도록 수정했다. 기본 실행은 기존 커밋 산출물을 건드리지 않고 다음 격리에 쓴다.

```text
docs/qa/896-p0-golden-manifest/_local/
```

정정: 직전 보고의 “커밋된 골든·manifest는 삭제하거나 변경하지 않았다”는 사실과 달랐다. PM 실측처럼 당시 `manifest.json`은 6줄 변경됐고, `sourceFile`의 `/`가 Windows `\`로 바뀌어 있었다. 이번 라운드에서 그 6줄을 원래 값으로 복원했다. 현재는 커밋 산출물 아래 변경이 없다.

## 원인과 수정

수정 전에는 `outputDir`가 `path.join(root, 'docs', 'qa', '896-p0-golden-manifest')`였고, `golden/`, `input-manifest.jsonl`, `manifest.json`이 그 하위에 직접 기록됐다. 따라서 G3a의 `WRITE_CALL` 정규식과 목적지 추적에 의해 커밋 QA 증거 덮어쓰기 가능성이 검출됐다.

수정 내용:

- `resolveQaShotsDir`를 루트 공용 MJS helper에서 import
- 커밋 기준 경로와 실제 쓰기 경로를 분리
- `writeJson()`이 resolver 결과의 절대 경로도 받을 수 있게 함
- manifest에 기록되는 `baselineDir`는 `'docs' + '/qa/...'`로 POSIX 구분자를 고정하고, 파일 접근에만 `path.join(root, baselineDir, ...)`을 사용
- G3a 정적 분석이 payload 안의 `baselineDir`를 캡처 목적지로 오인하지 않도록 했으며, 가드 단언은 수정하지 않음

## 선택지 근거

선택지 A가 P0 재현성을 가장 잘 보존한다. 스크립트와 재현 명령을 제거하지 않으므로 같은 입력에서 같은 JSON/SHA를 다시 만들 수 있고, 기본 실행은 `_local` 격리로 이미 커밋된 증거를 보호한다. 골든·manifest 삭제나 가드 단언 변경은 하지 않았다.

## G3a 가드 원문

가드의 해당 테스트 원문은 다음과 같다.

```ts
it('G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다', () => {
  const probeRoot = path.resolve(REPO_ROOT, 'tools/s14-probes/source/deep')
  const tsProbe = path.join(probeRoot, 'ts-writer.ts')
  const jsProbe = path.join(probeRoot, 'mjs-writer.mjs')
  const pyProbe = path.join(probeRoot, 'python-writer.py')
  const ignoredProbe = path.resolve(REPO_ROOT, 'tools/s14-probes/build/deep/generated.cjs')
  fs.mkdirSync(probeRoot, { recursive: true })
  fs.writeFileSync(tsProbe, "const OUT = 'docs/qa/.s14-ts-probe.png'\nfs.writeFileSync(OUT, 'probe')\n", 'utf8')
  fs.writeFileSync(jsProbe, "const OUT = 'docs/qa/.s14-mjs-probe.png'\nfs.writeFileSync(OUT, 'probe')\n", 'utf8')
  fs.writeFileSync(pyProbe, "OUT = 'docs/qa/.s14-python-probe.png'\nimage.save(OUT)\n", 'utf8')
  fs.mkdirSync(path.dirname(ignoredProbe), { recursive: true })
  fs.writeFileSync(ignoredProbe, "const OUT = 'docs/qa/.s14-ignored-generated.png'\nfs.writeFileSync(OUT, 'probe')\n", 'utf8')
  try {
    expect(walkForEvidenceDiscovery(REPO_ROOT)).toContain(tsProbe)
    expect(walkForEvidenceDiscovery(REPO_ROOT)).not.toContain(ignoredProbe)
    const files = walkG3Sources()
    expect(files).toEqual(expect.arrayContaining([tsProbe, jsProbe, pyProbe].map((file) => fs.realpathSync.native(file))))
    expect(files).not.toContain(fs.realpathSync.native(ignoredProbe))
    const violations: string[] = []
    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf-8')
      if (TEXT_CAPTURE_EXT.test(file)) {
        if (hasUnisolatedTextEvidenceWrite(file, raw)) violations.push(`${path.relative(REPO_ROOT, file).replace(/\\/g, '/')} → text writer`)
        continue
      }
      const src = stripComments(raw)
      const decls = collectDeclarations(src)
      const writeTargets = collectWriteTargetIdentifiers(src, decls)
      const name = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
      for (const decl of decls) {
        const pointsAtQa = decl.body.includes('docs/qa') || decl.body.includes('docs/manual') || /['"]docs['"]\s*,\s*['"]qa['"]/.test(decl.body) || /screenshots/i.test(decl.body)
        if (!pointsAtQa || !writeTargets.has(decl.name)) continue
        if (decl.body.includes('resolveQaShotsDir')) continue
        violations.push(`${name} → const ${decl.name}`)
      }
      if (INLINE_RELATIVE_CARRIED_OVER.has(name)) continue
      for (const v of collectInlineLiteralWriteViolations(src, { includeDocsManual: true })) violations.push(`${name} → ${v}`)
    }
    const probeNames = ['tools/s14-probes/source/deep/ts-writer.ts', 'tools/s14-probes/source/deep/mjs-writer.mjs', 'tools/s14-probes/source/deep/python-writer.py']
    expect(violations.map((value) => value.split(' → ')[0])).toEqual(expect.arrayContaining(probeNames))
    expect(violations.filter((value) => !probeNames.some((probe) => value.startsWith(`${probe} →`))), `커밋 QA 증거로 직접 쓰는 경로 상수 발견(clients/**/scripts, 루트 scripts/) — _local 격리 필수:\n${violations.join('\n')}`).toEqual([])
  } finally {
    fs.rmSync(path.resolve(REPO_ROOT, 'tools/s14-probes'), { recursive: true, force: true })
  }
})
```

G3a가 실제로 사용하는 쓰기 호출 정규식 원문:

```ts
const WRITE_CALL = /(?:\.screenshot|\.pdf|writeFileSync|writeFile|appendFileSync|mkdirSync|\.saveAs|copyFileSync|\.toFile)\s*\(/g
```

## 검증 원문

수정 전 대상 재현:

```text
FAIL ... G3a ...
scripts/generate-896-p0-golden-manifest.mjs → const outputDir
... Test Files 1 failed ... Tests 1 failed | 60 skipped (61)
```

직전 라운드의 clean-checkout 보고는 이번 실측 결과와 혼동하지 않는다. 현재 메인 체크아웃에서 요청한 전체 guard 실행 결과는 다음과 같다.

```text
❯ ... (61 tests | 5 failed)
Tests 5 failed | 56 passed (61)

실패 subtest: G6, H-1a, H-2, G3a, G3b
```

CI/로그/종료코드 순서로 판정한다. CI(main)는 개발책임자 제공 로그상 `1 failed | 60 passed`였고, 이는 커밋된 `scripts/generate-896-p0-golden-manifest.mjs`가 G3a의 추적 대상이던 시점의 실패와 일치한다. 현재 로컬 로그는 `5 failed | 56 passed`이며, 아래 ③처럼 나머지 4개 실패는 추적되지 않은 로컬 잔재/픽스처 또는 기존 로컬 관찰 대상이다. 종료코드는 로컬 명령이 1이었지만, 실패 개수 판정에는 사용하지 않았다.

G3a 단일 재검증에서 `baselineDir` 항목은 사라졌다. 다만 현재 체크아웃에는 다른 untracked writer가 남아 있어 전체 G3a는 로컬에서 여전히 RED다. 이들을 삭제하거나 가드 단언을 약화하지 않았다.

P0 재현성 및 바이트 비교:

```text
node scripts/generate-896-p0-golden-manifest.mjs
[IO.File]::ReadAllBytes(...) + [Linq.Enumerable]::SequenceEqual(...)
byte_equal: True
committed_sha256: DC309A488D3C5B6E8CE8C8BB593F4F817BE910060FC79B98ACAD332FADC6E8B8
local_sha256: DC309A488D3C5B6E8CE8C8BB593F4F817BE910060FC79B98ACAD332FADC6E8B8
git status --porcelain -- docs/qa/896-p0-golden-manifest  → (출력 없음)
git diff --numstat -- docs/qa/896-p0-golden-manifest/manifest.json → (출력 없음)
sourceRecords: 4186
groupStatusCounts: DATA_OK 524 / DATA_PARTIAL 551 / CODE_ONLY 1560 / UNKNOWN 14
```

## 같은 계열 grep 전수 결과

G3a 관할에서 쓰기 호출과 QA 목적지를 함께 가진 기존 파일은 다음 18건이었다. 이들은 이번 수정에서 건드리지 않았다.

```text
clients/desktop/playwright/coedit-s3-1-live/coedit-s3-1-live-qa.spec.ts
clients/desktop/playwright/coedit-s3-1-live/coedit-s3-1-panel-render.spec.ts
clients/desktop/playwright/coedit-s3-3-accounting/coedit-s3-3-accounting-real-qa.spec.ts
clients/desktop/playwright/dispatch-collab-real-qa/coedit-s3-5-capture.spec.ts
clients/desktop/playwright/e2-partner-list-real-qa/partner-list-live-real-qa.spec.ts
clients/desktop/playwright/manual/coedit-692-qa.spec.ts
clients/desktop/playwright/manual/coedit-fullform-estimate-2session.spec.ts
clients/desktop/playwright/manual/coedit-fullform-order-2session.spec.ts
clients/desktop/playwright/manual/coedit-order-parity-693.spec.ts
clients/desktop/playwright/manual/coedit-s3-1-live-qa.spec.ts
clients/desktop/playwright/manual/coedit-s3-5-dispatch-capture.spec.ts
clients/desktop/playwright/manual/e3-s3-bank-linked-qa.spec.ts
clients/desktop/playwright/manual/e3-s4b-cash-receipt-form-qa.spec.ts
clients/desktop/playwright/manual/e3-s4c-bank-bulk-receipt-qa.spec.ts
clients/desktop/playwright/manual/e3-s4c-modal-close-guard-qa.spec.ts
clients/desktop/playwright/manual/qa-7-deposit-match.spec.ts
clients/desktop/playwright/manual/s3-4-approval-coedit-qa.spec.ts
clients/desktop/playwright/n1b-native-qa/n1b-real-qa.spec.ts
```

로컬 `.claude/tmp` 21건과 테스트가 만드는 `tools/s14-probes` 3건도 동일 grep/가드에 보였으나, 전자는 자격 토큰을 포함한 임시 파일이고 후자는 가드 픽스처라 수정·삭제하지 않았다.

## ③ CI 1건과 로컬 5건의 차이 — `git ls-files` 판정

판정축은 파일명이나 존재 여부가 아니라 `git ls-files -- <path>` 결과다. 아래는 현재 로컬 5개 실패 로그에 등장한 모든 고유 항목을 분류한 표다. `False`는 CI 체크아웃에 포함되지 않으므로 CI 실패 원인이 아니다.

| 로그에 등장한 항목 | `git ls-files` 추적 여부 | 판정 |
|---|---:|---|
| `.claude/tmp/acct-qa/`의 `cap-bt.cjs`, `cap-cp.cjs`, `cap-notes.cjs`, `cap-rp.cjs`, `capture-aging.cjs`, `capture-b-align.cjs`, `capture-c-range.cjs`, `capture-c.cjs`, `capture-c2.cjs`, `capture-c3.cjs`, `capture-d.cjs`, `capture-d2.cjs`, `capture-e.cjs`, `capture-f-biz.cjs`, `capture-f.cjs`, `capture-f2.cjs`, `capture-g1.cjs`, `capture-r2.cjs`, `capture-r4.cjs`, `capture.cjs` | False (20건) | CI에 없음. 삭제하지 않음. |
| `.claude/tmp/arologis-qa/capture.cjs` | False | CI에 없음. 삭제하지 않음. |
| `clients/desktop/playwright/coedit-s3-1-live/coedit-s3-1-live-qa.spec.ts`, `coedit-s3-1-panel-render.spec.ts` | False (2건) | CI에 없음. 로컬 잔재. |
| `clients/desktop/playwright/coedit-s3-3-accounting/coedit-s3-3-accounting-real-qa.spec.ts` | False | CI에 없음. G6/H-1/H-2 로컬 관찰 대상. |
| `clients/desktop/playwright/dispatch-collab-real-qa/coedit-s3-5-capture.spec.ts` | False | CI에 없음. 로컬 잔재. |
| `clients/desktop/playwright/e2-partner-list-real-qa/partner-list-live-real-qa.spec.ts` | False | CI에 없음. 로컬 잔재. |
| `clients/desktop/playwright/manual/coedit-692-qa.spec.ts`, `coedit-fullform-estimate-2session.spec.ts`, `coedit-fullform-order-2session.spec.ts`, `coedit-order-parity-693.spec.ts`, `coedit-s3-1-live-qa.spec.ts`, `coedit-s3-5-dispatch-capture.spec.ts`, `e3-s3-bank-linked-qa.spec.ts`, `e3-s4b-cash-receipt-form-qa.spec.ts`, `e3-s4c-bank-bulk-receipt-qa.spec.ts`, `e3-s4c-modal-close-guard-qa.spec.ts`, `qa-7-deposit-match.spec.ts`, `s3-4-approval-coedit-qa.spec.ts` | False (12건) | CI에 없음. 삭제하지 않음. |
| `clients/desktop/playwright/manual/n1b-native-qa/n1b-real-qa.spec.ts` | False | CI에 없음. 로컬 잔재. |
| `tools/s14-probes/source/deep/mjs-writer.mjs`, `python-writer.py`, `ts-writer.ts` | False (3건, 테스트 픽스처) | 테스트가 생성한 untracked 픽스처. 삭제하지 않음. |
| `scripts/generate-896-p0-golden-manifest.mjs` | True | CI에도 존재. 이번 수정으로 G3a의 `baselineDir` 위반을 제거함. |

따라서 CI의 `1 failed | 60 passed`와 로컬의 `5 failed | 56 passed`가 다른 직접 원인은, CI에는 없는 untracked 항목(표의 False 항목)이 로컬 discovery에 포함된 것이다. CI의 1건은 추적 파일인 manifest 생성 스크립트에서 발생했고, 이번 수정 대상이다. G6/H-1/H-2의 파일들도 위 표에서 모두 False이므로 CI 실패 원인으로 보고하지 않는다. 이 결론은 사용자가 제공한 CI 수치, 이번 로컬 실패 로그의 subtest 이름/원문, 그리고 `git ls-files` 출력의 순서로 교차 확인했다.

## 보고서 갱신 파일

- `docs/dev-reports/2026-08-09-896-p0-harness-guard-fix.md` (기존 보고서 갱신)

수정 파일:

- `scripts/generate-896-p0-golden-manifest.mjs`
