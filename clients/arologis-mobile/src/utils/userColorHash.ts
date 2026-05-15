/**
 * 사용자 ID → HSL 색상 (PR-H2 audit overlay 의 수정자 색상 표시용).
 *
 * `clients/web/design-system/src/utils/userColorHash.ts` 의 1:1 RN 복제.
 *
 * 복제 사유:
 *   - RN 앱은 web design-system (Vite + Storybook 환경) 을 직접 import 하기 어려움
 *     (RN bundler = Metro, web bundler = Vite — 모듈 해석 불일치).
 *   - 본 유틸은 **순수 함수** (DOM/CSS-in-JS 무관) 이므로 동일 알고리즘 1:1 복제로 충분.
 *   - 동일 userId 는 web (desktop) / mobile (RN) 양쪽에서 항상 동일 색상 보장.
 *
 * 동작:
 *   - hash(userId) → hue (0~360)
 *   - saturation 70% / lightness 50% (대비 균형 — 흰 배경 + 검정 텍스트 모두 가독성 확보)
 *   - 랜덤 시드는 userId 자체 (별도 seed 불필요, 재현 가능)
 *
 * Phase 12 시리즈 공유 자산:
 *   - PR-H2 audit overlay 의 "수정자 색상 dot"
 *   - PR-H3 코멘트 author avatar 배경색
 *
 * @example
 * userIdToColor('user-123') // → 'hsl(157, 70%, 50%)'
 * userIdToColor('user-123') // → 'hsl(157, 70%, 50%)' (동일)
 * userIdToColor('user-456') // → 'hsl(42, 70%, 50%)'
 */
export function userIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0; // 32-bit int 강제
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
