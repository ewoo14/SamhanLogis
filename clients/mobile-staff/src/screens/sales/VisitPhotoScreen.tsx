/**
 * VisitPhotoScreen — P1 영업 직원 거래처 방문 사진 첨부.
 *
 * <p>영업 직원이 거래처 방문 시 설치 위치 / 현장 / 상담 내용 사진 및
 * 메모를 함께 기록합니다.
 *
 * <p>흐름:
 * <ol>
 *   <li>거래처명 / 방문일 확인.</li>
 *   <li>방문 메모 입력 (선택).</li>
 *   <li>{@link PhotoAttachmentCapture} 로 카메라 / 갤러리 → 다중 첨부 (최대 5장).</li>
 *   <li>"사진 업로드" → BE POST {@code /api/v1/partners/{partnerId}/visit-attachments} multipart.</li>
 * </ol>
 *
 * <p>BE endpoint: {@code POST /api/v1/partners/{partnerId}/visit-attachments}
 *
 * <p>UUID 비공개:
 * <ul>
 *   <li>{@code partnerId} 는 API path 전용, 사용자에게는 partnerCode + partnerName 표시.</li>
 *   <li>응답 attachment id 는 UI 미노출.</li>
 * </ul>
 *
 * <p>매뉴얼: {@code docs/manual/04-모바일/04-사진-첨부.md} §4-3.
 */

import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttachmentApiError, uploadVisitAttachment } from '../../api/attachmentApi';
import PhotoAttachmentCapture, { type PhotoItem } from '../../components/PhotoAttachmentCapture';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  /**
   * 거래처 UUID — BE API path 전용, 사용자 화면 미노출.
   * 미제공 시 업로드 비활성.
   */
  partnerId: string | null;
  /** 거래처 코드 (e.g. P-0042) — 사용자 노출. */
  partnerCode: string;
  /** 거래처명 — 사용자 노출. */
  partnerName: string;
  /** JWT access token. */
  token: string | null;
  /** 업로드 완료 callback. */
  onUploaded?: () => void;
  /** 뒤로가기 callback. */
  onBack?: () => void;
}

interface UploadStatus {
  uploading: boolean;
  uploaded: boolean;
  error?: string | null;
}

/** 오늘 날짜 YYYY년 MM월 DD일 포맷 */
function todayKo(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function VisitPhotoScreen({
  partnerId, partnerCode, partnerName, token, onUploaded, onBack,
}: Props): JSX.Element {
  const [memo, setMemo] = useState('');
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
    if (!partnerId) {
      Alert.alert('업로드 불가', '거래처 ID 가 없습니다. 담당자에게 문의해주세요.');
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
        await uploadVisitAttachment(token, partnerId, {
          uri: photos[i].uri,
          fileName: photos[i].fileName,
          mimeType: photos[i].mimeType,
          exifGpsLat: photos[i].exifGpsLat ?? null,
          exifGpsLng: photos[i].exifGpsLng ?? null,
          capturedAt: photos[i].capturedAt ?? null,
          memo: memo.trim() || null,
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
      Alert.alert(
        '업로드 완료',
        `방문 사진 ${successCount}장 업로드가 완료되었습니다.`,
        [{ text: '확인', onPress: () => onUploaded?.() }],
      );
    } else {
      Alert.alert(
        '일부 사진 업로드 실패',
        `${successCount}장 성공 / ${failedCount}장 실패 — 실패한 사진은 [사진 업로드] 를 다시 눌러주세요.`,
      );
    }
  }, [partnerId, token, photos, statuses, memo, onUploaded]);

  const summary = photos.length > 0
    ? {
        total: photos.length,
        done: statuses.filter((s) => s?.uploaded).length,
        failed: statuses.filter((s) => s?.error).length,
      }
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 헤더 */}
        <View style={styles.headerRow}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn} testID="visit-photo-back">
              <Text style={styles.backBtnText}>이전</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.h1}>방문 사진 첨부</Text>
        </View>
        <Text style={styles.subtitle}>
          거래처 방문 시 현장 / 설치 위치 / 상담 관련 사진을 첨부합니다.
        </Text>

        {/* 거래처 정보 */}
        <View style={styles.partnerCard}>
          <View style={styles.partnerRow}>
            <Text style={styles.partnerLabel}>거래처 코드</Text>
            <Text style={styles.partnerValue}>{partnerCode}</Text>
          </View>
          <View style={styles.partnerRow}>
            <Text style={styles.partnerLabel}>거래처명</Text>
            <Text style={styles.partnerValue}>{partnerName}</Text>
          </View>
          <View style={styles.partnerRow}>
            <Text style={styles.partnerLabel}>방문일</Text>
            <Text style={styles.partnerValue}>{todayKo()}</Text>
          </View>
        </View>

        {/* 방문 메모 */}
        <View style={styles.memoSection}>
          <Text style={styles.memoLabel}>방문 메모 (선택)</Text>
          <TextInput
            style={styles.memoInput}
            value={memo}
            onChangeText={setMemo}
            placeholder="상담 내용 / 특이사항을 입력해주세요 (선택)"
            placeholderTextColor={colors.ink.tertiary}
            multiline
            numberOfLines={3}
            testID="visit-photo-memo"
            maxLength={500}
          />
          <Text style={styles.memoCount}>{memo.length} / 500</Text>
        </View>

        {/* 사진 첨부 컴포넌트 */}
        <PhotoAttachmentCapture
          value={photos}
          onChange={handleChange}
          title="방문 사진"
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

        {/* 경고 */}
        {!partnerId && (
          <View style={styles.warnCard}>
            <Text style={badgeStyle('warn')}>거래처 ID 없음</Text>
            <Text style={styles.warnText}>
              거래처 정보가 전달되지 않았습니다. 거래처 검색 후 방문 사진을 첨부해주세요.
            </Text>
          </View>
        )}

        {/* 업로드 버튼 */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.btn, styles.btnPrimary,
              (busy || !partnerId || !token || photos.length === 0) && styles.btnDisabled,
            ]}
            onPress={uploadAll}
            disabled={busy || !partnerId || !token || photos.length === 0}
            testID="visit-photo-upload-button"
          >
            <Text style={styles.btnPrimaryText}>
              {busy ? '업로드 중…' : `방문 사진 ${photos.length}장 업로드`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 보관 안내 */}
        <View style={styles.retentionCard}>
          <Text style={styles.retentionTitle}>사진 보관 정책</Text>
          <Text style={styles.retentionText}>
            업로드된 방문 사진은 거래처 단위로 5년간 보관됩니다 (한국 회계 표준).
            {'\n'}S3 스토리지 저장 후 desktop 영업 화면에서 조회 가능합니다.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------
// 스타일
// -----------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  content: { padding: spacing[4], gap: spacing[3] },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  backBtn: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  backBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    flex: 1,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.sm * typography.lineHeight.base,
    marginBottom: spacing[1],
  },
  partnerCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[2],
  },
  partnerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.line.default,
    paddingVertical: spacing[1],
  },
  partnerLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  partnerValue: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  memoSection: {
    gap: spacing[1],
  },
  memoLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  memoInput: {
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.card,
    padding: spacing[3],
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.surface.card,
  },
  memoCount: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.mono,
    textAlign: 'right',
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
  retentionCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[1],
  },
  retentionTitle: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  retentionText: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.xs * typography.lineHeight.relaxed,
  },
});
