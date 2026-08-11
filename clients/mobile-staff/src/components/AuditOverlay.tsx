/**
 * AuditOverlay — Phase 12 PR-H2 신규 (mobile-staff FE-2).
 *
 * SlipDetailScreen 의 단일 필드 옆에 "변경 이력" 을 시각적으로 보여준다.
 *
 * 표시 규칙 (desktop FE-1 AuditOverlay 와 1:1 동등):
 *   1. 현재 값 (currentValue) — 그대로 표시.
 *   2. 직전 변경 1건이 있으면 — 그 값을 **취소선** 으로 작게 표시 + 수정자 dot/이름.
 *   3. 변경 이력이 더 있으면 "외 N건" 라벨로 추가 노출 (테스트용 testID 만, 화면 컴팩트).
 *
 * RN 호환 차이:
 *   - desktop = HTML <s> + CSS color-dot. mobile = `Text` + `textDecorationLine: 'line-through'` + `View` dot.
 *   - 색상 = `userIdToColor(actorId)` (동일 hash → web/mobile 색상 일치 보장).
 *
 * UUID 비공개:
 *   - `actorId` 는 색상 hash 입력으로만 사용. UI 에 표시 X.
 *   - 사용자에게는 actorFullName + actorRole 만 노출.
 *
 * 한국어 UI / ROLE 풀네임 일관.
 *
 * data-testid (RN testID, -mobile suffix):
 *   - `audit-overlay-mobile-${field}`
 *   - `audit-overlay-mobile-${field}-current`
 *   - `audit-overlay-mobile-${field}-previous`
 *   - `audit-overlay-mobile-${field}-actor`
 *   - `audit-overlay-mobile-${field}-more` (3건 이상일 때)
 */

import { StyleSheet, Text, View } from 'react-native';
import type { SlipAuditLogResponse } from '../api/slipAudit';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { userIdToColor } from '../utils/userColorHash';
import { resolveActorDisplayName } from '../utils/actorDisplayName';

export interface AuditOverlayProps {
  /** 필드 식별자 (예: 'partnerName'). testID 접미사로도 사용. */
  field: string;
  /** 현재 값 — null/undefined 시 placeholder ("(비어있음)") 표시. */
  currentValue: string | number | null | undefined;
  /**
   * 본 필드에 해당하는 audit log 이력 (createdAt asc 가정 — listSlipAuditLogs 가 보장).
   * AuditOverlay 가 자체적으로 reverse 하여 최신순 사용.
   * 빈 배열 시 currentValue 만 표시 (취소선/수정자 영역 비표시).
   */
  history: SlipAuditLogResponse[];
}

function formatValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '(비어있음)';
  if (typeof v === 'number') return String(v);
  return v;
}

export default function AuditOverlay({ field, currentValue, history }: AuditOverlayProps): JSX.Element {
  const sorted = [...history].reverse(); // 최신순 (createdAt desc).
  const latest = sorted[0] ?? null;
  const moreCount = Math.max(0, sorted.length - 1);

  const dotColor = latest ? userIdToColor(latest.actorId) : colors.line.default;

  return (
    <View style={styles.root} testID={`audit-overlay-mobile-${field}`}>
      <Text style={styles.current} testID={`audit-overlay-mobile-${field}-current`}>
        {formatValue(currentValue)}
      </Text>

      {latest ? (
        <View style={styles.historyRow}>
          <Text
            style={styles.previous}
            testID={`audit-overlay-mobile-${field}-previous`}
          >
            {formatValue(latest.previousValue)}
          </Text>
          <View style={[styles.actorDot, { backgroundColor: dotColor }]} />
          <Text style={styles.actor} testID={`audit-overlay-mobile-${field}-actor`}>
            {resolveActorDisplayName(latest.actorFullName) ?? '변경자 미상'} ({latest.actorRole})
          </Text>
          {moreCount > 0 ? (
            <Text style={styles.more} testID={`audit-overlay-mobile-${field}-more`}>
              외 {moreCount}건
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[1],
  },
  current: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  previous: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    textDecorationLine: 'line-through',
  },
  actorDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  actor: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  more: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
});
