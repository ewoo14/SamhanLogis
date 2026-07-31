# Issue #978 C-1 문서 양식 이미지 표면 재검증

## 결론

**도달 가능 결함이 있다. 2개 계열이다.**

1. Chromium이 정상 디코드하는 저장소 실재 SVG/GIF 파일을 파일 업로드 경로가 거부한다. 특히 기본으로 인쇄되는 `print-logo.svg` 자체도 파일로 다시 선택하면 거부된다. 기본 파일 선택기에서는 이 파일들이 필터에 가려지는데, 화면에는 사전 형식 안내가 없다.
2. 이미지당 50KB 상한보다 먼저 문서 JSON 64KB 예산이 걸려 신규 기본 양식의 실효 상한이 48,666B가 되고, 이미지가 누적되면 더 줄어든다. 저장소의 정상 PNG/JPEG가 단일 이미지 또는 세 번째 이미지에서 실제로 거부된다.

한편, **허용 형식·예산을 통과해 draft에 들어간 data URL**에 대해서는 편집 저장 경로와 `DocumentRenderer`가 모두 `isAllowedImageSource`와 Chromium `HTMLImageElement.decode()`를 사용한다. 이 범위에서는 별도의 편집/인쇄 판정 불일치를 찾지 못했다. 단, 실제 Electron 화면→인쇄 PDF 교차 실행은 아래 미조사 영역으로 남겼다.

## 기준점과 동시 변경 확인

조사 시작 시 HEAD와 `origin/main`은 `ad5b8d3749ee6b8d522ca9dc87c3c6fb9ae62943`로 같았다. 조사 도중 다른 작업이 조기 기획 커밋을 이 브랜치에 추가하고 `origin/main`도 이동했다. 이미지 처리 핵심 파일의 blob은 시작 기준, 현재 HEAD, 현재 `origin/main`에서 모두 같으므로 아래 판정에는 영향이 없다.

실행 명령:

```powershell
$refs=@('ad5b8d3749ee6b8d522ca9dc87c3c6fb9ae62943','72713f16bafcc86e2e021141d97d0312f804e537','506ebe7423574d6cc68ec37b8aa65bbe980f77f3'); $files=@('clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx','clients/desktop/src/renderer/print/DocumentRenderer.tsx','clients/desktop/src/renderer/print/templateSchema.ts','clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx'); foreach($f in $files){$hashes=@($refs|ForEach-Object{git rev-parse "$_`:$f"}); "$f`t$($hashes -join "`t")"}
```

출력 원문:

```text
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx	d2ed3697612400daa98cf8d00ed0878468018ac3	d2ed3697612400daa98cf8d00ed0878468018ac3	d2ed3697612400daa98cf8d00ed0878468018ac3
clients/desktop/src/renderer/print/DocumentRenderer.tsx	a0f807b2d5cc8c0ca16c432c12cddf367c7600d0	a0f807b2d5cc8c0ca16c432c12cddf367c7600d0	a0f807b2d5cc8c0ca16c432c12cddf367c7600d0
clients/desktop/src/renderer/print/templateSchema.ts	3f97922535c387afb178c0fe87e0b10c0875a6b6	3f97922535c387afb178c0fe87e0b10c0875a6b6	3f97922535c387afb178c0fe87e0b10c0875a6b6
clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx	cbf0157a0b6feb2217aac4afee966224c5a5b84a	cbf0157a0b6feb2217aac4afee966224c5a5b84a	cbf0157a0b6feb2217aac4afee966224c5a5b84a
```

## 결함 1 — 브라우저가 표시하는 실재 SVG/GIF를 업로드기가 거부하며, 기본 선택 경로에는 이유가 보이지 않는다

### 사용한 실재 자산

- `clients/desktop/public/print-logo.svg` — 975B, Chromium `decode()` PASS, 240×60
- `clients/desktop/public/pwa-icon-source.svg` — 460B, Chromium `decode()` PASS, 512×512
- `docs/architecture/ARCHITECTURE.svg` — 24,896B, Chromium `decode()` PASS, 1280×900
- `docs/character/KakaoTalk_20260519_162341631.gif` — 3,682,585B, Chromium `decode()` PASS, 1496×1051

`print-logo.svg`는 현재 양식의 기본 IMAGE source인 `/print-logo.svg`로는 명시적으로 통과한다. 그러나 사용자가 같은 파일을 `파일에서 선택`으로 고르면 `FileReader`가 `data:image/svg+xml;base64,...`로 만들고, 그 값은 PNG/JPEG/WebP 정규식에 들어가지 못해 거부된다. 즉 같은 실제 그림이 내부 경로 표현에서는 편집·인쇄되고 파일 업로드 표현에서는 거부된다.

### 실 사용자 재현 절차

1. `groupware.approval-templates` UPDATE 권한이 있는 사용자로 로그인한다.
2. 사이드바 `그룹웨어` → `결재 문서 양식`으로 이동한다.
3. `신규 문서 양식`을 누르고 문서 유형과 양식명을 입력한다.
4. 팔레트에서 `이미지/로고`를 추가하고 해당 요소를 선택한다.
5. `파일에서 선택`을 연다.
6. 기본 파일 형식 필터에서는 위 SVG/GIF가 보이지 않거나 선택 불가 상태가 된다. 이때 편집 화면에는 허용 형식 안내가 없다.
7. 운영체제 파일 선택기에서 `모든 파일`로 바꾸어 위 파일을 강제로 선택할 수 있는 환경에서는, 선택 후 `이미지 파일이 비어 있거나 지원되는 PNG/JPEG/WebP 형식이 아니어서 저장할 수 없습니다.`가 표시되고 source가 바뀌지 않는다.

### 실행한 명령과 출력 원문

실행 명령:

```powershell
$p='clients/desktop/src/renderer/print/templateSchema.ts'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; 397..421 | ForEach-Object { '{0}: {1}' -f $_,$lines[$_-1] }; $p='clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; 249..280 | ForEach-Object { '{0}: {1}' -f $_,$lines[$_-1] }
```

출력 원문:

```text
397: function parseImageSource(value: unknown): string | DocumentTemplateParseError {
398:   if (value === '/print-logo.svg') return value
399:   if (typeof value !== 'string') {
400:     return { code: 'INVALID_IMAGE_SOURCE', message: 'IMAGE 요소 src가 유효하지 않습니다.' }
401:   }
402:   const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
403:   if (!match) {
404:     return { code: 'INVALID_IMAGE_SOURCE', message: 'IMAGE 요소는 PNG/JPEG/WebP data URL 또는 기본 로고만 허용합니다.' }
405:   }
406:   const base64 = match[2] ?? ''
407:   const bytes = imageDataUrlByteLength(value)
408:   if (bytes <= 0 || bytes > MAX_IMAGE_BYTES || !hasImageSignature(match[1]!, base64)) {
409:     return { code: 'INVALID_IMAGE_SOURCE', message: 'IMAGE 요소는 허용된 PNG/JPEG/WebP data URL이고 50KB 이하여야 합니다.' }
410:   }
411:   return value
412: }
413: 
414: /** 파일 크기 제한과 분리된 형식·signature 판정. 큰 지원 형식은 용량 사유를 유지해야 한다. */
415: export function isAllowedImageSourceFormat(value: unknown): value is string {
416:   if (value === '/print-logo.svg') return true
417:   if (typeof value !== 'string') return false
418:   const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
419:   if (!match) return false
420:   const base64 = match[2] ?? ''
421:   return imageDataUrlByteLength(value) > 0 && hasImageSignature(match[1]!, base64)
249:           <label>
250:             파일에서 선택
251:             <input
252:               type="file"
253:               accept="image/png,image/jpeg,image/webp"
254:               disabled={!canEdit}
255:               onChange={(event) => {
256:                 const file = event.target.files?.[0]
257:                 if (!file) return
258:                 const reader = new FileReader()
259:                 reader.onload = async () => {
260:                   const src = String(reader.result ?? '')
261:                   const base64 = src.split(',')[1] ?? ''
262:                   const decodedBytes = Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.match(/=+$/)?.[0].length ?? 0))
263:                   if (!isAllowedImageSourceFormat(src)) {
264:                     setImageError('이미지 파일이 비어 있거나 지원되는 PNG/JPEG/WebP 형식이 아니어서 저장할 수 없습니다.')
265:                     return
266:                   }
267:                   if (decodedBytes > imageMaxBytes) {
268:                     setImageError(`현재 양식 기준 이미지 최대 ${imageMaxKilobytes}KB까지 저장할 수 있습니다.`)
269:                     return
270:                   }
271:                   if (!(await canDecodeImageSource(src))) {
272:                     setImageError('이 이미지는 현재 화면에서 표시할 수 없어 저장할 수 없습니다. 다른 이미지를 선택하세요.')
273:                     return
274:                   }
275:                   setImageError(null)
276:                   onUpdate({ src })
277:                 }
278:                 reader.onerror = () => setImageError('이미지 파일을 읽지 못했습니다.')
279:                 reader.readAsDataURL(file)
280:               }}
```

실재 자산 Chromium 판정 출력 중 해당 행 원문:

```text
clients/desktop/public/print-logo.svg	975	svg	PASS	240x60	REJECT	FORMAT_NOT_ALLOWED	/print-logo.svg=PASS
clients/desktop/public/pwa-icon-source.svg	460	svg	PASS	512x512	REJECT	FORMAT_NOT_ALLOWED	NONE
docs/architecture/ARCHITECTURE.svg	24896	svg	PASS	1280x900	REJECT	FORMAT_NOT_ALLOWED	NONE
docs/character/KakaoTalk_20260519_162341631.gif	3682585	gif	PASS	1496x1051	REJECT	FORMAT_NOT_ALLOWED	NONE
```

### 왜 도달 가능한가

- 사이드바와 라우트가 실제로 연결되어 있다.
  - `AppLayout.tsx:1311-1316` — `/groupware/document-templates` 메뉴
  - `routes/index.tsx:400-404` — `:id/edit` 라우트
  - `GroupwareDocumentTemplateAdminPage.tsx:65` — 권한 보유자에게 `신규 문서 양식` 버튼
- `IMAGE`는 singleton 목록에 없으므로 실제 팔레트에서 추가할 수 있다.
- 거부는 서버나 비정상 직접 API 호출이 아니라 `ElementInspector`의 일반 파일 선택 `onChange`에서 일어난다.
- 네 파일 모두 저장소 추적 파일이고 Chromium 실 `decode()`가 성공했다. 손상 파일이나 합성 이미지를 사용하지 않았다.

### 사용자가 이유와 다음 행동을 아는가

- 기본 파일 선택기 경로: `accept` 필터가 먼저 적용되므로 파일이 보이지 않는데, 화면에는 PNG/JPEG/WebP 사전 안내가 없다. 이 경로는 이유와 다음 행동이 보이지 않는다.
- `모든 파일`로 강제 선택한 뒤: PNG/JPEG/WebP만 지원한다는 오류가 표시되므로 이유는 알 수 있고 다른 형식으로 바꾸어야 한다는 행동도 추론할 수 있다.

## 결함 2 — 64KB 누적 예산이 정상 실재 PNG/JPEG를 단일 또는 세 번째 이미지에서 거부한다

### 사용한 실재 자산

단일 이미지 거부:

- `docs/character/char_01.png` — 102,522B, Chromium `decode()` PASS, 432×432
- 같은 폴더 `char_02.png`~`char_08.png` — 92,039B~112,610B, 전부 Chromium `decode()` PASS
- `docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.54.05.JPG` — 62,487B, Chromium `decode()` PASS, 522×1096
- `docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.07.JPG` — 70,379B, Chromium `decode()` PASS, 522×1096

누적 예산 거부:

- 첫 번째: `clients/desktop/android/app/src/main/res/drawable-land-xxxhdpi/splash.png` — 17,683B
- 두 번째: `clients/desktop/android/app/src/main/res/drawable-port-xxxhdpi/splash.png` — 17,489B
- 세 번째: `clients/desktop/android/app/src/main/res/drawable-land-xxhdpi/splash.png` — 13,984B

세 PNG는 각각 신규 기본 양식의 단일 이미지 실효 상한 48,666B 아래이고 Chromium 디코드도 성공한다. 그러나 앞의 두 이미지를 넣으면 세 번째 이미지의 실효 상한이 13,314B로 줄어 13,984B 자산이 거부된다.

### 실 사용자 재현 절차 A — 단일 정상 이미지

1. 결함 1과 같은 실제 메뉴 경로로 신규 문서 양식 편집기에 들어간다.
2. `이미지/로고` 요소를 하나 추가한다.
3. `docs/character/char_01.png`를 `파일에서 선택`으로 고른다.
4. 파일은 PNG이고 Chromium이 432×432로 정상 디코드하지만 source는 갱신되지 않는다.
5. `현재 양식 기준 이미지 최대 47KB까지 저장할 수 있습니다.`가 표시된다.

같은 절차에서 위 62,487B/70,379B 원본 JPEG도 형식·디코드는 통과하지만 크기에서 거부된다.

### 실 사용자 재현 절차 B — 각각은 작은 PNG 세 장

1. 신규 문서 양식에서 `이미지/로고` 요소를 세 개 추가한다. IMAGE는 singleton이 아니므로 세 개 모두 추가된다.
2. 첫 번째 요소에 `drawable-land-xxxhdpi/splash.png`를 고른다. 통과한다.
3. 두 번째 요소에 `drawable-port-xxxhdpi/splash.png`를 고른다. 통과한다.
4. 세 번째 요소에 `drawable-land-xxhdpi/splash.png`를 고른다.
5. 세 번째 파일은 13,984B의 정상 PNG지만 현재 문서 예산 13,314B를 넘으므로 거부되고, `현재 양식 기준 이미지 최대 13KB까지 저장할 수 있습니다.`가 표시된다.

### 실행한 명령과 출력 원문

신규 기본 양식 단일 IMAGE의 실효 상한 계산 명령:

```powershell
@'
const document={paper:'A4_PORTRAIT',bands:[{key:'approval-header',kind:'HEADER',elements:[{key:'approval-title',type:'TITLE'},{key:'approval-meta',type:'META_ROWS'},{key:'approval-grid',type:'APPROVAL_GRID'},{key:'image-1',type:'IMAGE',src:'data:image/png;base64,',alt:'회사 로고',geometry:{x:70,y:0,w:25,h:15}}]},{key:'approval-body',kind:'BODY',elements:[{key:'approval-content',type:'CONTENT_PARAGRAPHS'},{key:'approval-fields',type:'FIELD_TABLE'},{key:'approval-attachments',type:'ATTACHMENT_TABLE'}]},{key:'approval-footer',kind:'FOOTER',elements:[{key:'approval-closing',type:'CLOSING'}]}]};
const baseBytes=new TextEncoder().encode(JSON.stringify(document)).byteLength;
const remaining=64*1024-baseBytes;
const decoded=Math.min(50*1024,Math.floor(remaining/4)*3);
console.log(`baseBytes=${baseBytes}`); console.log(`remainingEncodedCharacters=${remaining}`); console.log(`maxImageBytesForDocument=${decoded}`); console.log(`shownKilobytes=${Math.floor(decoded/1024)}`);
'@ | node -
```

출력 원문:

```text
baseBytes=645
remainingEncodedCharacters=64891
maxImageBytesForDocument=48666
shownKilobytes=47
```

세 PNG 누적 계산 명령:

```powershell
@'
const fs=require('node:fs'); const max=64*1024;
const files=['clients/desktop/android/app/src/main/res/drawable-land-xxxhdpi/splash.png','clients/desktop/android/app/src/main/res/drawable-port-xxxhdpi/splash.png','clients/desktop/android/app/src/main/res/drawable-land-xxhdpi/splash.png'];
const img=(key)=>({key,type:'IMAGE',src:'/print-logo.svg',alt:'회사 로고',geometry:{x:70,y:0,w:25,h:15}});
const doc={paper:'A4_PORTRAIT',bands:[{key:'approval-header',kind:'HEADER',elements:[{key:'approval-title',type:'TITLE'},{key:'approval-meta',type:'META_ROWS'},{key:'approval-grid',type:'APPROVAL_GRID'},img('image-1'),img('image-2'),img('image-3')]},{key:'approval-body',kind:'BODY',elements:[{key:'approval-content',type:'CONTENT_PARAGRAPHS'},{key:'approval-fields',type:'FIELD_TABLE'},{key:'approval-attachments',type:'ATTACHMENT_TABLE'}]},{key:'approval-footer',kind:'FOOTER',elements:[{key:'approval-closing',type:'CLOSING'}]}]};
function cap(key){const d=structuredClone(doc);for(const b of d.bands)for(const e of b.elements)if(e.key===key&&e.type==='IMAGE')e.src='data:image/png;base64,';const base=new TextEncoder().encode(JSON.stringify(d)).byteLength;return {base,cap:Math.min(50*1024,Math.floor(Math.max(0,max-base)/4)*3)}}
for(let n=0;n<files.length;n++){const key=`image-${n+1}`,c=cap(key),b=fs.readFileSync(files[n]);console.log(`${key}\tbeforeBase=${c.base}\tshownMaxKiB=${Math.floor(c.cap/1024)}\texactMax=${c.cap}\tassetBytes=${b.length}\tdecision=${b.length<=c.cap?'PASS':'REJECT'}\t${files[n]}`);if(b.length<=c.cap)doc.bands[0].elements.find(e=>e.key===key).src=`data:image/png;base64,${b.toString('base64')}`}
console.log(`finalDocumentBytes=${new TextEncoder().encode(JSON.stringify(doc)).byteLength}`)
'@ | node -
```

출력 원문:

```text
image-1	beforeBase=867	shownMaxKiB=47	exactMax=48501	assetBytes=17683	decision=PASS	clients/desktop/android/app/src/main/res/drawable-land-xxxhdpi/splash.png
image-2	beforeBase=24454	shownMaxKiB=30	exactMax=30810	assetBytes=17489	decision=PASS	clients/desktop/android/app/src/main/res/drawable-port-xxxhdpi/splash.png
image-3	beforeBase=47781	shownMaxKiB=13	exactMax=13314	assetBytes=13984	decision=REJECT	clients/desktop/android/app/src/main/res/drawable-land-xxhdpi/splash.png
finalDocumentBytes=47774
```

핵심 자산의 저장소 blob 식별 명령:

```powershell
$assets=@('clients/desktop/public/pwa-icon-source.svg','docs/character/KakaoTalk_20260519_162341631.gif','docs/character/char_01.png','clients/desktop/android/app/src/main/res/drawable-land-xxxhdpi/splash.png','clients/desktop/android/app/src/main/res/drawable-port-xxxhdpi/splash.png','clients/desktop/android/app/src/main/res/drawable-land-xxhdpi/splash.png','docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.54.05.JPG','docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.07.JPG'); foreach($p in $assets){$i=Get-Item -LiteralPath $p; $h=git hash-object -- $p; "$p`t$($i.Length)`t$h"}
```

출력 원문:

```text
clients/desktop/public/pwa-icon-source.svg	460	6863259f4a16e58793441eb4f3e3613e8fbd9445
docs/character/KakaoTalk_20260519_162341631.gif	3682585	c154350fcc99af445c0f791b376c1cb23669d60f
docs/character/char_01.png	102522	25e14137fe68d680bbc0255c79f425b1d86067cd
clients/desktop/android/app/src/main/res/drawable-land-xxxhdpi/splash.png	17683	244ca2506dbe0fd8f6a05520ac7d1a629ea81438
clients/desktop/android/app/src/main/res/drawable-port-xxxhdpi/splash.png	17489	6929071268eb03ee0f088142b6523566b78550e2
clients/desktop/android/app/src/main/res/drawable-land-xxhdpi/splash.png	13984	14c6c8fe39fcd51a0414866ad28cbe8ff3acb060
docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.54.05.JPG	62487	47ef41a01e6849368f3fee0e5e18fe95f10a90ba
docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.07.JPG	70379	31531b023ad3fcf284323f1187df69f0974f9738
```

### 왜 도달 가능한가

- `MAX_REQUEST_BYTES=64*1024`, `MAX_IMAGE_BYTES=50*1024`이며, 파일 선택기는 현재 document 전체 직렬화 크기에서 남은 예산을 다시 계산한다.
- 신규 기본 양식에도 메타데이터가 있으므로 첫 이미지부터 50KB가 아니라 48,666B가 최대다.
- `IMAGE`는 singleton 집합에 포함되지 않아 사용자는 정상 UI로 여러 이미지를 추가할 수 있다.
- 크기 판정은 `ElementInspector`의 일반 파일 선택 처리에서 실행된다. 서버, DB, 직접 API 조작이 필요 없다.
- 사용한 PNG/JPEG는 모두 저장소 추적 파일이고 Chromium 실 `decode()`가 성공했다.

### 사용자가 이유와 다음 행동을 아는가

- 거부 후에는 `현재 양식 기준 이미지 최대 NKB`가 표시되므로 조용한 실패는 아니다.
- 다만 선택 전에는 현재 남은 이미지 예산이 보이지 않고, 세 번째 이미지의 상한이 47KB→30KB→13KB로 줄어드는 이유가 “앞선 이미지가 문서 64KB 예산을 사용했기 때문”이라고 설명되지 않는다. 사용자는 더 작은 파일을 다시 고를 수는 있지만, 앞선 이미지를 제거·압축하면 예산이 회복된다는 원인은 화면에서 알 수 없다.

## 편집 경로와 인쇄 경로 교차 판정

실행 명령:

```powershell
rg -n -C 2 'canDecodeImageSource|image.decode\(\)|findUndecodableImages|isAllowedImageSource\(element.src\)|img.decode\(\)|visibility: decodeStatus|display: ''none''' clients/desktop/src/renderer/print/templateSchema.ts clients/desktop/src/renderer/print/DocumentRenderer.tsx clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx
```

출력 원문:

```text
clients/desktop/src/renderer/print/DocumentRenderer.tsx-316-  const reporter = useContext(imageDecodeIssueReporterContext)
clients/desktop/src/renderer/print/DocumentRenderer.tsx-317-  const issue = useMemo(() => ({ key: element.key, alt: element.alt, bandLabel }), [bandLabel, element.alt, element.key])
clients/desktop/src/renderer/print/DocumentRenderer.tsx:318:  const sourceIsAllowed = isAllowedImageSource(element.src)
clients/desktop/src/renderer/print/DocumentRenderer.tsx-319-  const [decodeState, setDecodeState] = useState<{ src: string; status: ImageDecodeStatus }>(() => ({
clients/desktop/src/renderer/print/DocumentRenderer.tsx-320-    src: element.src,
--
clients/desktop/src/renderer/print/DocumentRenderer.tsx-352-      return () => { cancelled = true }
clients/desktop/src/renderer/print/DocumentRenderer.tsx-353-    }
clients/desktop/src/renderer/print/DocumentRenderer.tsx:354:    img.decode().then(markDecoded, markFailed)
clients/desktop/src/renderer/print/DocumentRenderer.tsx-355-    return () => {
clients/desktop/src/renderer/print/DocumentRenderer.tsx-356-      cancelled = true
--
clients/desktop/src/renderer/print/DocumentRenderer.tsx-365-
clients/desktop/src/renderer/print/DocumentRenderer.tsx-366-  if (!sourceIsAllowed || decodeStatus === 'failed') {
clients/desktop/src/renderer/print/DocumentRenderer.tsx:367:    return <span aria-hidden="true" {...placeholderAttribute} style={{ display: 'none' }} />
clients/desktop/src/renderer/print/DocumentRenderer.tsx-368-  }
clients/desktop/src/renderer/print/DocumentRenderer.tsx-369-
--
clients/desktop/src/renderer/print/DocumentRenderer.tsx-388-        display: 'block',
clients/desktop/src/renderer/print/DocumentRenderer.tsx-389-        objectFit: 'contain',
clients/desktop/src/renderer/print/DocumentRenderer.tsx:390:        visibility: decodeStatus === 'decoded' ? 'visible' : 'hidden',
clients/desktop/src/renderer/print/DocumentRenderer.tsx-391-      }}
clients/desktop/src/renderer/print/DocumentRenderer.tsx-392-    />
--
clients/desktop/src/renderer/print/templateSchema.ts-446- * createImageBitmap처럼 별도 픽셀 버퍼를 요구하는 API는 사용하지 않는다.
clients/desktop/src/renderer/print/templateSchema.ts-447- */
clients/desktop/src/renderer/print/templateSchema.ts:448:export async function canDecodeImageSource(value: string): Promise<boolean> {
clients/desktop/src/renderer/print/templateSchema.ts-449-  if (value === '/print-logo.svg') return true
clients/desktop/src/renderer/print/templateSchema.ts-450-  if (!isAllowedImageSource(value) || typeof Image === 'undefined') return false
--
clients/desktop/src/renderer/print/templateSchema.ts-452-  image.src = value
clients/desktop/src/renderer/print/templateSchema.ts-453-  try {
clients/desktop/src/renderer/print/templateSchema.ts:454:    await image.decode()
clients/desktop/src/renderer/print/templateSchema.ts-455-    return true
clients/desktop/src/renderer/print/templateSchema.ts-456-  } catch {
--
clients/desktop/src/renderer/print/templateSchema.ts-460-
clients/desktop/src/renderer/print/templateSchema.ts-461-/** 저장 직전에 모든 IMAGE source를 실제 renderer의 디코드 경로로 재확인하고 사용자 식별 정보를 보존한다. */
clients/desktop/src/renderer/print/templateSchema.ts:462:export async function findUndecodableImages(document: DocumentPayload): Promise<UndecodableImageInfo[]> {
clients/desktop/src/renderer/print/templateSchema.ts-463-  const issues: UndecodableImageInfo[] = []
clients/desktop/src/renderer/print/templateSchema.ts-464-  for (const band of document.bands) {
clients/desktop/src/renderer/print/templateSchema.ts-465-    for (const element of band.elements) {
clients/desktop/src/renderer/print/templateSchema.ts-466-      if (element.type !== 'IMAGE') continue
clients/desktop/src/renderer/print/templateSchema.ts:467:      if (!(await canDecodeImageSource(element.src))) {
clients/desktop/src/renderer/print/templateSchema.ts-468-        issues.push({ key: element.key, alt: element.alt, src: element.src, bandKind: band.kind })
clients/desktop/src/renderer/print/templateSchema.ts-469-      }
--
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx-138-  const save = useMutation({
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx-139-    mutationFn: async () => {
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx:140:      const undecodableImages = await findUndecodableImages(input.document)
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx-141-      if (undecodableImages.length > 0) throw new ImageSourceDecodeError(undecodableImages)
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx-142-      return isNew ? createDocumentTemplate(input) : updateDocumentTemplate(id!, input)
```

판정:

- data URL 형식·크기 검사를 통과한 파일은 파일 선택 시 `canDecodeImageSource()`로 Chromium decode를 확인한다.
- 저장 직전에도 `findUndecodableImages()`가 같은 함수를 다시 호출한다.
- 렌더러도 같은 allowlist와 `img.decode()`를 사용하며 실패 이미지는 화면·인쇄 용지에서 `display:none` placeholder로 바꾼다.
- 따라서 **허용되어 저장된 data URL 자산**에서 편집은 통과하지만 인쇄만 사라지는 별도 경로는 현재 소스 추적에서 확인되지 않았다.
- 단, `print-logo.svg` 파일 업로드 거부와 내부 `/print-logo.svg` 경로 통과의 표현별 불일치는 결함 1에 포함했다.

## 저장소 실재 이미지 자산 수집

전체 검색은 `git ls-files`로 했다. 사용자 지시로 `clients/web/**`는 판정 대상에서 제외했다.

실행 명령:

```powershell
$paths=git ls-files | Where-Object { $_ -notlike 'clients/web/*' -and $_ -match '(?i)\.(png|jpe?g|webp|gif|svg|bmp|ico|avif|tiff?|heic|heif)$' }; "COUNT=$($paths.Count)"; $paths|Group-Object{[IO.Path]::GetExtension($_).ToLowerInvariant()}|Sort-Object Name|ForEach-Object{"EXT=$($_.Name)`tCOUNT=$($_.Count)"}; $paths|ForEach-Object{if($_ -like 'docs/qa/*'){'docs/qa'}elseif($_ -like 'docs/design/*'){'docs/design'}elseif($_ -like 'docs/dev-reports/*'){'docs/dev-reports'}elseif($_ -like 'docs/manual/*'){'docs/manual'}elseif($_ -like 'docs/migration/*'){'docs/migration'}elseif($_ -like 'clients/desktop/android/*'){'clients/desktop/android'}elseif($_ -like 'clients/desktop/playwright/*'){'clients/desktop/playwright'}elseif($_ -like 'clients/desktop/public/*'){'clients/desktop/public'}elseif($_ -like 'docs/character/*'){'docs/character'}elseif($_ -like 'docs/architecture/*'){'docs/architecture'}else{'other'}}|Group-Object|Sort-Object Name|ForEach-Object{"GROUP=$($_.Name)`tCOUNT=$($_.Count)"}; "WEBP_EXCLUDED="; git ls-files | Where-Object { $_ -like 'clients/web/*' -and $_ -match '(?i)\.webp$' }
```

출력 원문:

```text
COUNT=3969
EXT=.gif	COUNT=1
EXT=.jpg	COUNT=5
EXT=.png	COUNT=3960
EXT=.svg	COUNT=3
GROUP=clients/desktop/android	COUNT=26
GROUP=clients/desktop/playwright	COUNT=14
GROUP=clients/desktop/public	COUNT=6
GROUP=docs/architecture	COUNT=1
GROUP=docs/character	COUNT=9
GROUP=docs/design	COUNT=13
GROUP=docs/dev-reports	COUNT=20
GROUP=docs/manual	COUNT=9
GROUP=docs/migration	COUNT=16
GROUP=docs/qa	COUNT=3855
WEBP_EXCLUDED=
clients/web/design-system/src/assets/mascot/samhani.webp
```

3969개 중 대부분은 `docs/qa/**` 검증 캡처다. 형식 판정의 실사용 근거로는 다음 47개를 사용했다.

- 실제 클라이언트 배포/source 자산: `clients/desktop/public/**`, Android PNG 26개
- 개발책임자 제공 원본: `docs/character/**`
- 실제 SVG 원본: `docs/architecture/ARCHITECTURE.svg`
- 합성 fixture가 아닌 레거시 원본 JPEG 캡처: `docs/qa/legacy-original/**`

그 밖의 QA/디자인/매뉴얼 캡처는 개수를 수집했지만, 합성·생성 캡처를 실사용 형식 근거로 세우지 않기 위해 아래 개별 판정표에는 넣지 않았다.

## 실재 자산 47개 각각의 판정

`CHROMIUM_DECODE`는 설치된 Chrome의 실제 `HTMLImageElement.decode()` 결과다. `FILE_UPLOAD_DECISION`은 같은 실제 바이트에 현재 `ElementInspector`의 허용 형식과 신규 기본 양식 실효 예산 48,666B를 적용한 결과다. `INTERNAL_PATH_EXCEPTION`은 파일 업로드가 아니라 하드코딩 경로만 통과하는 예외다.

실행 명령:

```powershell
@'
const {spawn,execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const root=process.cwd(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'samhan-978-c1-chrome-')),sleep=ms=>new Promise(r=>setTimeout(r,ms));const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true});
(async()=>{let a;for(let i=0;i<100&&!a;i++){const p=path.join(profile,'DevToolsActivePort');if(fs.existsSync(p))a=fs.readFileSync(p,'utf8').trim().split(/\r?\n/);else await sleep(50)}let ts;for(let i=0;i<100&&!ts;i++){try{const x=await(await fetch(`http://127.0.0.1:${Number(a[0])}/json/list`)).json();if(x.length)ts=x}catch{}if(!ts)await sleep(50)}const ws=new WebSocket(ts.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});let id=0;const q=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){q.get(m.id)(m.result);q.delete(m.id)}});const send=(method,params={})=>new Promise(r=>{const n=++id;q.set(n,r);ws.send(JSON.stringify({id:n,method,params}))});await send('Runtime.enable');const files=execFileSync('git',['ls-files','clients/desktop/public','clients/desktop/android/app/src/main/res','docs/character','docs/architecture','docs/qa/legacy-original'],{encoding:'utf8',maxBuffer:20*1024*1024}).trim().split(/\r?\n/).filter(p=>/\.(png|jpe?g|webp|gif|svg)$/i.test(p));console.log(`ASSET_COUNT=${files.length}`);console.log('PATH\tBYTES\tMAGIC\tCHROMIUM_DECODE\tDIMENSIONS\tFILE_UPLOAD_DECISION\tREASON\tINTERNAL_PATH_EXCEPTION');for(const rel of files){const b=fs.readFileSync(rel);let f='other',m='application/octet-stream';if(b.length>=8&&b[0]===0x89&&b.subarray(1,4).toString('ascii')==='PNG'){f='png';m='image/png'}else if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255){f='jpeg';m='image/jpeg'}else if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP'){f='webp';m='image/webp'}else if(b.length>=6&&b.subarray(0,3).toString('ascii')==='GIF'){f='gif';m='image/gif'}else if(b.subarray(0,Math.min(300,b.length)).toString('utf8').includes('<svg')){f='svg';m='image/svg+xml'}const d=`data:${m};base64,${b.toString('base64')}`,e=`new Promise(r=>{const i=new Image();i.src=${JSON.stringify(d)};i.decode().then(()=>r({ok:true,w:i.naturalWidth,h:i.naturalHeight}),()=>r({ok:false,w:i.naturalWidth,h:i.naturalHeight}))})`,x=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}),v=x.result.value;let decision='REJECT',reason='FORMAT_NOT_ALLOWED';if(['png','jpeg','webp'].includes(f)){if(b.length>48666)reason='FRESH_DOCUMENT_LIMIT_48666_EXCEEDED';else if(!v.ok)reason='CHROMIUM_DECODE_FAILED';else{decision='PASS';reason='FORMAT_SIZE_DECODE_OK'}}const special=rel==='clients/desktop/public/print-logo.svg'?'/print-logo.svg=PASS':'NONE';console.log(`${rel}\t${b.length}\t${f}\t${v.ok?'PASS':'FAIL'}\t${v.w}x${v.h}\t${decision}\t${reason}\t${special}`)}ws.close()})().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(async()=>{try{child.kill()}catch{}await sleep(200);const r=path.resolve(profile),t=path.resolve(os.tmpdir());if(r.startsWith(t+path.sep)&&path.basename(r).startsWith('samhan-978-c1-chrome-'))fs.rmSync(r,{recursive:true,force:true})});
'@ | node -
```

출력 원문:

```text
ASSET_COUNT=47
PATH	BYTES	MAGIC	CHROMIUM_DECODE	DIMENSIONS	FILE_UPLOAD_DECISION	REASON	INTERNAL_PATH_EXCEPTION
clients/desktop/android/app/src/main/res/drawable-land-hdpi/splash.png	7705	png	PASS	800x480	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-land-mdpi/splash.png	4040	png	PASS	480x320	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-land-xhdpi/splash.png	9251	png	PASS	1280x720	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-land-xxhdpi/splash.png	13984	png	PASS	1600x960	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-land-xxxhdpi/splash.png	17683	png	PASS	1920x1280	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-port-hdpi/splash.png	7934	png	PASS	480x800	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-port-mdpi/splash.png	4096	png	PASS	320x480	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-port-xhdpi/splash.png	9875	png	PASS	720x1280	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-port-xxhdpi/splash.png	13346	png	PASS	960x1600	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable-port-xxxhdpi/splash.png	17489	png	PASS	1280x1920	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/drawable/splash.png	4040	png	PASS	480x320	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-hdpi/ic_launcher.png	2786	png	PASS	72x72	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png	3450	png	PASS	162x162	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png	4341	png	PASS	72x72	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-mdpi/ic_launcher.png	1869	png	PASS	48x48	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png	2110	png	PASS	108x108	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png	2725	png	PASS	48x48	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png	3981	png	PASS	96x96	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png	5036	png	PASS	216x216	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png	6593	png	PASS	96x96	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png	6644	png	PASS	144x144	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png	9793	png	PASS	324x324	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png	10455	png	PASS	144x144	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png	9441	png	PASS	192x192	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png	15529	png	PASS	432x432	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png	15916	png	PASS	192x192	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/public/apple-touch-icon.png	2600	png	PASS	180x180	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/public/print-logo.svg	975	svg	PASS	240x60	REJECT	FORMAT_NOT_ALLOWED	/print-logo.svg=PASS
clients/desktop/public/pwa-192.png	2743	png	PASS	192x192	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/public/pwa-512.png	9707	png	PASS	512x512	PASS	FORMAT_SIZE_DECODE_OK	NONE
clients/desktop/public/pwa-icon-source.svg	460	svg	PASS	512x512	REJECT	FORMAT_NOT_ALLOWED	NONE
clients/desktop/public/pwa-maskable-512.png	9707	png	PASS	512x512	PASS	FORMAT_SIZE_DECODE_OK	NONE
docs/architecture/ARCHITECTURE.svg	24896	svg	PASS	1280x900	REJECT	FORMAT_NOT_ALLOWED	NONE
docs/character/KakaoTalk_20260519_162341631.gif	3682585	gif	PASS	1496x1051	REJECT	FORMAT_NOT_ALLOWED	NONE
docs/character/char_01.png	102522	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_02.png	111878	png	PASS	458x458	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_03.png	112610	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_04.png	111094	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_05.png	104996	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_06.png	93035	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_07.png	92039	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/character/char_08.png	105499	png	PASS	432x432	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.54.05.JPG	62487	jpeg	PASS	522x1096	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.07.JPG	70379	jpeg	PASS	522x1096	REJECT	FRESH_DOCUMENT_LIMIT_48666_EXCEEDED	NONE
docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.29.JPG	37993	jpeg	PASS	522x1096	PASS	FORMAT_SIZE_DECODE_OK	NONE
docs/qa/legacy-original/partner-order/Screenshot 2026-05-05 at 20.17.37.JPG	44271	jpeg	PASS	549x1169	PASS	FORMAT_SIZE_DECODE_OK	NONE
docs/qa/legacy-original/partner-order/Screenshot 2026-05-05 at 20.17.55.JPG	44956	jpeg	PASS	549x1169	PASS	FORMAT_SIZE_DECODE_OK	NONE
```

## 이 라운드가 조사하지 않은 영역

아래 영역은 결함 0으로 세지 않았다.

- `clients/web/**` 전체. 저장소 유일 WebP `clients/web/design-system/src/assets/mascot/samhani.webp`도 지시상 경로만 확인하고 바이트·Chromium 판정은 하지 않았다. 따라서 이번 라운드는 애니메이션 WebP의 현재 통과 여부를 주장하지 않는다.
- `services/**` 코드, 서비스 빌드, 서버 validator 실호출, Docker, DB.
- 실제 Electron 앱 기동과 운영체제 네이티브 파일 선택기 캡처.
- 실제 `DocumentRenderer` React 화면과 `window.print()`/PDF의 픽셀·DOM 교차 실행. 현재 판정은 핵심 소스 경로 추적과 동일 Chromium 엔진의 실제 자산 `decode()` 실측까지다.
- Electron 패키징(`build:win`).
- 모바일/Android 앱 화면 동작. Android PNG는 문서 양식 업로드 입력 자산으로만 사용했다.
- `docs/qa/**` 3855개와 기타 문서 캡처의 개별 브라우저 판정. 합성·생성 캡처를 실사용 형식 근거로 세우지 않았고, `legacy-original/**` 실제 원본 JPEG 5개만 포함했다.
- 문서 양식 이미지 외의 인쇄 화면, 공급자 프로필 로고/인감 업로드, 앱 공지 이미지, OCR/첨부 이미지 경로.
- 테스트 강도, 문서 주장, 회귀 가드 등 검증 품질.

## 작업 제한 준수

- 코드 수정 없음.
- 산출물은 이 보고서 1개뿐이다.
- Docker·DB·서비스 빌드·`clients/web/**` 내용 조사·Electron 패키징·git 커밋/브랜치 조작·GitHub 쓰기 없음.
