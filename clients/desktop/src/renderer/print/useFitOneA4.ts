/**
 * 한 A4 자동 비율 축소 훅 — 개발책임자 요구(2026-06-10):
 * "품목이 많아지면 전표가 길어질 수 있음. 가급적 하나의 A4 에 들어오도록 자동 비율 조정."
 *
 * 콘텐츠 자연 높이를 측정해 A4 인쇄 가용 높이를 넘으면 CSS `zoom` 으로 비율 축소한다.
 * Chromium(Electron/Edge) 의 `zoom` 은 layout 에 반영되므로 화면 미리보기·인쇄 양쪽
 * 동일하게 줄어든다. 가독 하한(minZoom, 기본 0.5) 아래로 떨어질 분량이면 하한에서
 * 멈추고 자연 다페이지로 넘긴다(품목행 page-break-inside: avoid 는 CSS 담당).
 */
import { useLayoutEffect, useRef, useState } from 'react'

/** A4 세로 인쇄 가용 높이 px — 297mm - 상하여백 24mm = 273mm ≈ 1032px (96dpi). */
const A4_PORTRAIT_CONTENT_PX = 1032

export function useFitOneA4<T extends HTMLElement>(
  deps: readonly unknown[],
  opts?: { targetPx?: number; minZoom?: number },
): { ref: React.RefObject<T>; zoom: number } {
  const ref = useRef<T>(null)
  const [zoom, setZoom] = useState(1)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // zoom 1 상태의 자연 높이 측정 후 비율 계산 (재실행 대비 일시 리셋)
    const style = el.style as CSSStyleDeclaration & { zoom?: string }
    const prevZoom = style.zoom
    style.zoom = '1'
    const naturalHeight = el.scrollHeight
    style.zoom = prevZoom ?? ''
    const target = opts?.targetPx ?? A4_PORTRAIT_CONTENT_PX
    const minZoom = opts?.minZoom ?? 0.5
    const next = naturalHeight > target ? Math.max(minZoom, target / naturalHeight) : 1
    setZoom((cur) => (Math.abs(cur - next) > 0.01 ? next : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ref, zoom }
}
