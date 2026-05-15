/**
 * SalesEstimatePhotoScreen — P2 (Phase 12 예정) estimate mode 사진 첨부 stub.
 * Phase 12 PR-H4c 보강 — audit overlay 적용 예정 안내 stub 추가 (estimate → slip 변환 후 활성).
 *
 * <p>현재 진입 시점은 placeholder 화면 — 영업 직원 견적 답사 시
 * 현장 사진 첨부 흐름을 향후 활성화하기 위한 stub.
 *
 * <p>사용자 결정 (옵션 C 하이브리드 — 매뉴얼 §6) 일관:
 * <ul>
 *   <li>D-AX-19 이후 배송기사 사진은 `clients/arologis-mobile` 이 전담한다.</li>
 *   <li>estimate mode 견적 사진 (ESTIMATE) = P2 — Phase 12 별도 PR.</li>
 * </ul>
 *
 * <p>활성 시점 (Phase 12) 변경 사항:
 * <ul>
 *   <li>이름 = ESTIMATE (slip-service {@code SlipAttachmentType.ESTIMATE}).</li>
 *   <li>업로드 경로 = 인증 기반 {@code POST /slips/{slipId}/attachments} (estimate → slip 변환 후 ID 확보).</li>
 *   <li>견적서 인쇄 시 사진 부록 페이지 자동 첨부 (desktop-print 의 견적 양식 확장).</li>
 *   <li>최대 첨부 수 = 10장 (견적 답사 사진 다수).</li>
 *   <li>(PR-H4c) 첨부 변경 시 SlipDetailScreen 동등 audit overlay (사용자 색상 dot + 시각).</li>
 * </ul>
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/04-사진-첨부.md} §2-2 / §6.
 *
 * <p>TODO (Phase 12 활성):
 * <ul>
 *   <li>견적 webview 와 deeplink 연결 ({@code estimate://photos?estimateNo=Q-2026-00045}).</li>
 *   <li>{@code uploadAttachmentAuthenticated()} 호출 — JWT + slipId 필요.</li>
 *   <li>견적 작성 form 의 "현장 사진" 버튼 → 본 화면 진입.</li>
 *   <li>(PR-H4c) {@link AuditOverlay} import + history props — slip-service audit log 와 wire-up.</li>
 * </ul>
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { badgeStyle, colors, radii, spacing, typography } from '../theme/tokens';
import { userIdToColor } from '../utils/userColorHash';

interface Props {
  /** 견적 번호 (e.g. Q-2026-00045) — UI 표시용. 본 stub 은 안내 메시지만. */
  estimateNo?: string;
}

export default function SalesEstimatePhotoScreen({ estimateNo }: Props): JSX.Element {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>견적 현장 사진</Text>
        <Text style={styles.subtitle}>영업 답사 시 설치 위치 / 현장 사진 첨부 (Phase 12 활성 예정)</Text>

        {estimateNo && (
          <View style={styles.labelCard}>
            <Text style={styles.labelHead}>견적 번호</Text>
            <Text style={styles.labelBody}>{estimateNo}</Text>
          </View>
        )}

        <View style={styles.statusCard}>
          <Text style={badgeStyle('slicePending')}>P2 — Phase 12 예정</Text>
          <Text style={styles.statusText}>
            본 화면은 추후 영업 직원의 견적 답사 사진 첨부를 위한 placeholder 입니다.
            {'\n\n'}현재는 다음 우회를 사용해주세요:
            {'\n'}1. 핸드폰 기본 카메라로 촬영
            {'\n'}2. 사내 카카오톡 그룹 (예: 삼한물류 - 견적증빙) 에 업로드
            {'\n'}3. 메시지 본문에 견적 번호 / 거래처명 / 일자 명시
          </Text>
        </View>

        <View style={styles.refCard}>
          <Text style={styles.refHead}>관련 매뉴얼</Text>
          <Text style={styles.refBody}>docs/manual/04-모바일/04-사진-첨부.md §2-2 (시나리오 2)</Text>
          <Text style={styles.refBody}>docs/manual/04-모바일/04-사진-첨부.md §6 (옵션 C 하이브리드)</Text>
        </View>

        {/* PR-H4c — audit overlay 적용 예정 안내 (estimate → slip 변환 시점부터 활성). */}
        <View style={styles.auditPreview} testID="sales-estimate-photo-audit-preview-mobile">
          <Text style={styles.auditPreviewHead}>변경 이력 표시 (Phase 12 활성 예정)</Text>
          <View style={styles.auditPreviewRow}>
            <View style={[styles.auditPreviewDot, { backgroundColor: userIdToColor('sales-preview') }]} />
            <Text style={styles.auditPreviewBody}>
              사진 첨부 / 삭제 시 SlipDetailScreen 과 동일한 색상 dot + 작성자 + 시각 audit overlay 가
              표시됩니다 (estimate → slip 변환 후 slip-service audit log 와 자동 연결).
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  content: { padding: spacing[4], gap: spacing[3] },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.sans,
  },
  labelCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
  },
  labelHead: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  labelBody: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  statusCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.line.default,
    gap: spacing[2],
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.sm * typography.lineHeight.relaxed,
  },
  refCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[1],
  },
  refHead: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  refBody: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.mono,
  },
  // PR-H4c — audit overlay 적용 예정 안내 (stub).
  auditPreview: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[2],
  },
  auditPreviewHead: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  auditPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  auditPreviewDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    marginTop: spacing[1],
  },
  auditPreviewBody: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.xs * typography.lineHeight.relaxed,
  },
});
