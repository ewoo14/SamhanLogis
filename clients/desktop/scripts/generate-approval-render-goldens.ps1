<#
  DS-1 committed HTML golden 생성 전용 명시 스크립트.
  일반 vitest 실행과 vitest -u는 golden을 갱신하지 않는다.
#>
$env:DS1_GOLDEN_UPDATE = '1'
try {
  npm exec vitest run src/renderer/print/approvalRenderGoldenGeneration.test.tsx
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Remove-Item Env:DS1_GOLDEN_UPDATE -ErrorAction SilentlyContinue
}
