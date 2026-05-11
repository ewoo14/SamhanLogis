/**
 * InspectionPhotoScreen — P1 배송 기사 / 창고 직원 검수 사진 첨부.
 *
 * <p>입고 슬립 검수 시 화물 상태 / 수량 차이 / 불량 사진을 첨부합니다.
 * 기존 {@link SignaturePhotoScreen} 의 배송 사진(DELIVERY)과 별개로,
 * 검수 사진(INSPECTION)은 창고 직원 / 기사가 입고 검수 과정에서 촬영합니다.
 *
 * <p>흐름:
 * <ol>
 *   <li>슬립 번호 / 창고 정보 확인.</li>
 *   <li>{@link PhotoAttachmentCapture} 로 카메라 / 갤러리 → 다중 첨부 (최대 5장).</li>
 *   <li>"사진 업로드" → BE POST {@code /api/v1/inventory/inspections/{slipId}/attachments} multipart.</li>
 *   <li>업로드 완료 후 검수 흐름 계속 진행 (검수 수량 입력 → 완료).</li>
 * </ol>
 *
 * <p>BE endpoint: {@code POST /api/v1/inventory/inspections/{slipId}/attachments}
 *
 * <p>UUID 비공개:
 * <ul>
 *   <li>{@code slipId} 는 API path 전용 — 사용자에게는 slipNo 만 표시.</li>
 *   <li>응답 attachment id 는 UI 미노출.</li>
 * </ul>
 *
 * <p>매뉴얼: {@code docs/manual/04-모바일/04-사진-첨부.md} §4-1.
 */

import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttachmentApiError, uploadInspectionAttachment } from '../../api/attachmentApi';
import PhotoAttachmentCapture, { type PhotoItem } from '../../components/PhotoAttachmentCapture';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  /**
   * 슬립 UUID — BE API path 전용, 사용자 화면 미노출.
   * 미제공 시 업로드 비활성 (viewer only).
   */
  slipId: string | null;
  /** 슬립 번호 (e.g. S-2026-00321) — 사용자 노출 식별자. */
  slipNo: string;
  /** JWT access token. */
  token: string | null;
  /** 창고명 — 사용자 노출 (UUID 미포함). */
  warehouseName?: string | null;
  /** 거래처명 — 사용자 노출 (UUID 미포함). */
  partnerName?: string | null;
  /** 업로드 완료 후 부모 callback. */
  onUploaded?: () => void;
}

interface UploadStatus {
  uploading: boolean;
  uploaded: boolean;
  error?: string | null;
}

export default function InspectionPhotoScreen({
  slipId, slipNo, token, warehouseName, partnerName, onUploaded,
}: Props): JSX.Element {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const [busy, setBusy] = useState(false);

  const handleChange = useCallback((next: PhotoItem[]) => {
    setPhotos(next);
    setStatuses((prev) => {
      const out: UploadStatus[] = [];
      next.forEach((p, i) => {
        const matched = prev.find((_, j) => j < prev.length && photos[j]?.uri === p.uri);
        out.push(matched ?? { uploading: false, uploaded: false });
      });
      return out;
    });
  }, [photos]);

  const uploadAll = useCallback(async () => {
    if (!slipId) {
      Alert.alert('업로드 불가', '전표 ID 가 없습니다. 담당자에게 문의해주세요.');
      return;
    }
    if (!token) {
      Alert.alert('업로드 불가', '로그인 토큰이 없습니다. 다시 로그인해주세요.');
      return;
    }
    if (photos.length === 0) {
      Alert.alert('첨부된 사진 없음', '먼저 촬영 또는 갤러리에서 사진을 선택해주세요.');
      return;
    }
    setBusy(true);
    const next: UploadStatus[] = photos.map((_, i) => statuses[i] ?? { uploading: false, uploaded: false });
    let successCount = 0;
    for (let i = 0; i < photos.length; i += 1) {
      if (next[i]?.uploaded) { successCount += 1; continue; }
      next[i] = { uploading: true, uploaded: false, error: null };
      setStatuses([...next]);
      try {
        await uploadInspectionAttachment(token, slipId, {
          uri: photos[i].uri,
          fileName: photos[i].fileName,
          mimeType: photos[i].mimeType,
          exifGpsLat: photos[i].exifGpsLat ?? null,
          exifGpsLng: photos[i].exifGpsLng ?? null,
          capturedAt: photos[i].capturedAt ?? null,
        });
        next[i] = { uploading: false, uploaded: true };
        successCount += 1;
      } catch (e) {
        const msg = e instanceof AttachmentApiError
          ? e.message
          : (e instanceof Error ? e.message : String(e));
        next[i] = { uploading: false, uploaded: false, error: msg };
      }
      setStatuses([...next]);
    }
    setBusy(false);
    const failedCount = next.filter((s) => s.error).length;
    if (failedCount === 0) {
      Alert.alert('업로드 완료', `검수 사진 ${successCount}장 업로드가 완료되었습니다.`);
      onUploaded?.();
    } else {
      Alert.alert(
        '일부 사진 업로드 실패',
        `${successCount}장 성공 / ${failedCount}장 실패 — 실패한 사진은 [사진 업로드] 를 다시 눌러주세요.`,
      );
    }
  }, [slipId, token, photos, statuses, onUploaded]);

  const summary = photos.length > 0
    ? { total: photos.length, done: statuses.filter((s) => s?.uploaded).length, failed: statuses.filter((s) => s?.error).length }
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>검수 사진 첨부</Text>
        <Text style={styles.subtitle}>
          입고 화물의 검수 사진을 첨부합니다. 불량 / 수량 차이 발생 시 증빙 사진을 첨부해주세요.
        </Text>

        {/* 슬립 정보 */}
        <View style={styles.infoCard}>
          <InfoRow label="전표번호" value={slipNo} />
          {warehouseName && <InfoRow label="입고 창고" value={warehouseName} />}
          {partnerName && <InfoRow label="거래처" value={partnerName} />}
        </View>

        {/* 사진 첨부 컴포넌트 */}
        <PhotoAttachmentCapture
          value={photos}
          onChange={handleChange}
          title="검수 사진 (INSPECTION)"
          itemStatus={statuses}
          maxItems={5}
        />

        {/* 업로드 현황 */}
        {summary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryHead}>업로드 현황</Text>
            <View style={styles.summaryRow}>
              <Text style={badgeStyle('info')}>전체 {summary.total}</Text>
              <Text style={badgeStyle('sliceSuccess')}>완료 {summary.done}</Text>
              {summary.failed > 0 && (
                <Text style={badgeStyle('warn')}>실패 {summary.failed}</Text>
              )}
            </View>
          </View>
        )}

        {/* 토큰 없음 경고 */}
        {!slipId && (
          <View style={styles.warnCard}>
            <Text style={badgeStyle('warn')}>전표 ID 없음</Text>
            <Text style={styles.warnText}>
              전표 정보가 전달되지 않았습니다. 담당자에게 문의해주세요.
            </Text>
          </View>
        )}

        {/* 업로드 버튼 */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.btn, styles.btnPrimary,
              (busy || !slipId || !token || photos.length === 0) && styles.btnDisabled,
            ]}
            onPress={uploadAll}
            disabled={busy || !slipId || !token || photos.length === 0}
            testID="inspection-upload-button"
          >
            <Text style={styles.btnPrimaryText}>
              {busy ? '업로드 중…' : `검수 사진 ${photos.length}장 업로드`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 안내 */}
        <View style={styles.infoCallout}>
          <Text style={styles.infoCalloutTitle}>PC 화면에서 확인 가능</Text>
          <Text style={styles.infoCalloutText}>
            업로드된 사진은 desktop 입고 검수 화면에서 썸네일로 확인할 수 있습니다.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------
// 서브 컴포넌트
// -----------------------------------------------------------------------

interface InfoRowProps { label: string; value: string; }
function InfoRow({ label, value }: InfoRowProps): JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// -----------------------------------------------------------------------
// 스타일
// -----------------------------------------------------------------------

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
    lineHeight: typography.fontSize.sm * typography.lineHeight.base,
  },
  infoCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.line.default,
    paddingVertical: spacing[1],
  },
  infoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  infoValue: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  summaryCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    gap: spacing[2],
  },
  summaryHead: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  warnCard: {
    backgroundColor: colors.state.warningBg,
    padding: spacing[3],
    borderRadius: radii.card,
    gap: spacing[1],
    borderLeftWidth: 4,
    borderLeftColor: colors.state.warning,
  },
  warnText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  btn: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radii.button,
    alignItems: 'center',
    flex: 1,
  },
  btnPrimary: { backgroundColor: colors.action.brand },
  btnPrimaryText: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
  },
  btnDisabled: { opacity: 0.5 },
  infoCallout: {
    backgroundColor: colors.action.brandSubtle,
    borderRadius: radii.card,
    padding: spacing[3],
    borderLeftWidth: 4,
    borderLeftColor: colors.action.brand,
    gap: spacing[1],
  },
  infoCalloutTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.action.brandActive,
    fontFamily: typography.fontFamily.sans,
  },
  infoCalloutText: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.xs * typography.lineHeight.relaxed,
  },
});
