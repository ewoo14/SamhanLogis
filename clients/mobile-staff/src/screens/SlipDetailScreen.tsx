/**
 * SlipDetailScreen — Phase 12 PR-H1 신규 (mobile-staff FE-2).
 * Phase 12 PR-H2 보강 — slip 헤더 필드에 AuditOverlay (변경 이력 취소선 + 수정자 색상) 적용.
 * Phase 12 PR-H3 보강 — slip 수정 요청 / 수락 / 거절 워크플로우 UI 분기.
 *
 * mobile-staff D-AX-19 이후 = estimate WebView 단일 진입. 본 화면은 후속 영업/창고 native 진입 후보로 보존.
 * 본 화면은 PR-H1 의 SSE 실시간 + 코멘트 의 사용처로서 신규되었고, PR-H2 에서 audit overlay
 * 컴포넌트가 추가되어 partnerName / statusLabel 등 헤더 필드의 변경 이력을 시각적으로 노출한다.
 * PR-H3 에서는 사용자 ROLE 에 따라 수정 요청 (SALES) 또는 PENDING 요청 list (WAREHOUSE) UI 가
 * 동일 화면에서 분기 노출되며, SSE `slip.edit-request.*` 이벤트로 양방향 알림이 표시된다.
 *
 * 범위:
 *   - slip 정보 영역 (slipNo / 상태 / 거래처명 — UUID 미노출)
 *   - **AuditOverlay (PR-H2)** — partnerName / statusLabel 변경 이력 취소선 + 수정자 hash 색상
 *   - **수정 횟수 헤더 (PR-H2)** — "수정 N회" 라벨 (DRIVER / SALES 도 모두 노출, read-only)
 *   - **복원 버튼 (PR-H2)** — MASTER / MANAGER ROLE 만 노출 (DRIVER 대상에서는 비표시)
 *   - **수정 요청 버튼 (PR-H3)** — SALES 사용자만 노출, 사유 입력 모달.
 *   - **PENDING 요청 카드 (PR-H3)** — WAREHOUSE 사용자만 노출, 본 slip 의 PENDING 요청 + 수락/거절.
 *   - **요청 이력 (PR-H3)** — APPROVED / REJECTED 요청 이력은 모든 ROLE 에 read-only 표시.
 *   - 코멘트 영역 (목록 + 입력창 + 전송 버튼)
 *   - SSE 구독 (`subscribeToSlip`) 으로 코멘트/`slip.edit`/`slip.edit-request.*` 실시간 반영
 *     - 작성자 (SALES) 가 보고 있는 화면: approved/rejected 도착 시 Alert 알림.
 *     - 창고 (WAREHOUSE) 가 보고 있는 화면: created 도착 시 Alert 알림.
 *
 * 한국어 UI / ROLE 풀네임 / UUID 비공개 가드 일관.
 *
 * data-testid (PR-H1 + PR-H2 + PR-H3 추가):
 *   - `slip-detail-comment-list-mobile`
 *   - `slip-detail-comment-input-mobile`
 *   - `slip-detail-comment-submit-mobile`
 *   - `slip-detail-comment-item-mobile-${id}` (id = 코멘트 식별자, UI 미노출 — testID only)
 *   - `slip-detail-edit-count-mobile` (PR-H2)
 *   - `slip-detail-audit-revert-mobile-${auditLogId}` (PR-H2, MASTER/MANAGER 만)
 *   - `slip-detail-edit-request-button-mobile` (PR-H3, SALES 만)
 *   - `slip-detail-edit-request-reason-input-mobile` (PR-H3, SALES 모달)
 *   - `slip-detail-edit-request-submit-mobile` (PR-H3, SALES 모달)
 *   - `slip-detail-edit-request-cancel-mobile` (PR-H3, SALES 모달)
 *   - `slip-detail-edit-request-approve-mobile-${requestId}` (PR-H3, WAREHOUSE)
 *   - `slip-detail-edit-request-reject-mobile-${requestId}` (PR-H3, WAREHOUSE)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveActorDisplayName } from '../utils/actorDisplayName';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuditOverlay from '../components/AuditOverlay';
import {
  listSlipAuditLogs,
  revertSlipAuditLog,
  type SlipAuditActorRole,
  type SlipAuditLogResponse,
} from '../api/slipAudit';
import {
  createSlipComment,
  deleteSlipComment,
  listSlipComments,
  type SlipCommentResponse,
} from '../api/slipComment';
import {
  approveSlipEdit,
  listSlipEditRequests,
  rejectSlipEdit,
  requestSlipEdit,
  type SlipEditRequestResponse,
} from '../api/slipEditRequest';
import { subscribeToSlip, type SlipRealtimeEvent } from '../realtime/SlipRealtimeClient';
import { badgeStyle, colors, radii, spacing, typography } from '../theme/tokens';

interface Props {
  /** JWT access token — 호출 화면 진입 시점에 user-service `/auth/me` 로 확인 후 보관. */
  token: string | null;
  /** slip 식별자 — path 만, UI 미노출. */
  slipId: string;
  /** 헤더 표시용 slip 번호 (사용자 노출 식별자). 미전달 시 placeholder. */
  slipNo?: string;
  /** 헤더 표시용 거래처명. */
  partnerName?: string | null;
  /** 헤더 표시용 상태 라벨 (예: "출고", "검수 중"). */
  statusLabel?: string;
  /** 뒤로가기 콜백 — 미전달 시 버튼 미표시. */
  onBack?: () => void;
  /**
   * 현재 로그인 사용자 ROLE — PR-H2 복원 버튼 + PR-H3 수정 요청 / 수락 분기 가드.
   * - MASTER / MANAGER : 복원 + 수정 요청 + 수락 / 거절 모두 가능 (관리자 대행).
   * - SALES            : 수정 요청 버튼 노출.
   * - WAREHOUSE        : 본 slip 의 PENDING 요청 카드 + 수락 / 거절 노출.
   * - DRIVER / 그 외   : 모두 비표시 (read-only).
   * 미전달 시 모두 비표시 (안전 default).
   */
  currentUserRole?: SlipAuditActorRole | null;
}

export default function SlipDetailScreen({
  token,
  slipId,
  slipNo,
  partnerName,
  statusLabel,
  onBack,
  currentUserRole,
}: Props): JSX.Element {
  const [comments, setComments] = useState<SlipCommentResponse[]>([]);
  const [auditLogs, setAuditLogs] = useState<SlipAuditLogResponse[]>([]);
  const [editRequests, setEditRequests] = useState<SlipEditRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reverting, setReverting] = useState(false);
  // PR-H3 — 수정 요청 모달 (SALES) / 거절 사유 모달 (WAREHOUSE) state.
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestReasonDraft, setRequestReasonDraft] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>(
    'connecting',
  );
  const listRef = useRef<FlatList<SlipCommentResponse>>(null);

  // PR-H3 — ROLE 가드 helper.
  const canRequestEdit =
    currentUserRole === 'SALES' ||
    currentUserRole === 'MASTER' ||
    currentUserRole === 'MANAGER';
  const canResolveEdit =
    currentUserRole === 'WAREHOUSE' ||
    currentUserRole === 'MASTER' ||
    currentUserRole === 'MANAGER';

  // ----------------------------------------------------------------------
  // load — 코멘트 + audit logs + edit requests 병렬 조회 (PR-H3: edit requests 추가).
  // 한쪽 실패 시 다른 한쪽은 표시 (실패한 쪽만 error 노출, 우선순위: comment > audit > edit-request).
  // ----------------------------------------------------------------------
  const load = useCallback(async () => {
    setError(null);
    try {
      const [commentsData, auditData, editReqData] = await Promise.allSettled([
        listSlipComments(token, slipId),
        listSlipAuditLogs(token, slipId),
        listSlipEditRequests(token, slipId),
      ]);
      if (commentsData.status === 'fulfilled') {
        setComments(commentsData.value);
      } else {
        setError(
          commentsData.reason instanceof Error
            ? commentsData.reason.message
            : String(commentsData.reason),
        );
      }
      if (auditData.status === 'fulfilled') {
        setAuditLogs(auditData.value);
      } else if (commentsData.status === 'fulfilled') {
        // 코멘트는 성공한 경우에만 audit 실패 메시지 노출 (코멘트 에러 우선).
        setError(
          auditData.reason instanceof Error
            ? auditData.reason.message
            : String(auditData.reason),
        );
      }
      if (editReqData.status === 'fulfilled') {
        setEditRequests(editReqData.value);
      } else if (
        commentsData.status === 'fulfilled' &&
        auditData.status === 'fulfilled'
      ) {
        setError(
          editReqData.reason instanceof Error
            ? editReqData.reason.message
            : String(editReqData.reason),
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, slipId]);

  // ----------------------------------------------------------------------
  // PR-H2: field 별 audit log group + 수정 횟수 + 복원 권한.
  // ----------------------------------------------------------------------
  const auditByField = useMemo<Record<string, SlipAuditLogResponse[]>>(() => {
    const grouped: Record<string, SlipAuditLogResponse[]> = {};
    for (const log of auditLogs) {
      if (!grouped[log.field]) grouped[log.field] = [];
      grouped[log.field].push(log);
    }
    return grouped;
  }, [auditLogs]);

  const editCount = auditLogs.length;
  const canRevert = currentUserRole === 'MASTER' || currentUserRole === 'MANAGER';

  useEffect(() => {
    load();
  }, [load]);

  // SSE 구독 — comment.* + slip.edit (PR-H2) + slip.edit-request.* (PR-H3) 도착 시 invalidate.
  // React Query 미사용 환경 (mobile-staff) 이므로 cache invalidate = load() 재호출 방식.
  // PR-H3: 본 PR 의 푸시 알림은 foreground only — Alert API 로 표시. background 푸시는 후속 PR.
  useEffect(() => {
    const sub = subscribeToSlip(slipId, token, (evt: SlipRealtimeEvent) => {
      if (evt.type === 'heartbeat') {
        setRealtimeStatus('live');
        return;
      }
      if (
        evt.type === 'comment.created' ||
        evt.type === 'comment.updated' ||
        evt.type === 'comment.deleted' ||
        evt.type === 'slip.edit'
      ) {
        setRealtimeStatus('live');
        load();
        return;
      }
      // PR-H3 — 양방향 푸시 (foreground Alert).
      if (evt.type === 'slip.edit-request.created') {
        setRealtimeStatus('live');
        load();
        // 창고 직원이 보고 있는 경우에만 알림 (작성자 본인 발행은 noisy).
        if (canResolveEdit) {
          Alert.alert(
            '신규 수정 요청',
            `전표 ${slipNo ?? ''} 에 대한 수정 요청이 도착했습니다. 화면 상단에서 수락 / 거절을 진행하세요.`,
          );
        }
        return;
      }
      if (
        evt.type === 'slip.edit-request.approved' ||
        evt.type === 'slip.edit-request.rejected'
      ) {
        setRealtimeStatus('live');
        load();
        // 작성자 (SALES) 가 보고 있는 경우에만 알림.
        if (canRequestEdit && !canResolveEdit) {
          const verb = evt.type === 'slip.edit-request.approved' ? '수락' : '거절';
          Alert.alert(
            `수정 요청 ${verb}`,
            `전표 ${slipNo ?? ''} 에 대한 수정 요청이 ${verb}되었습니다.`,
          );
        }
        return;
      }
    });
    return () => sub.close();
  }, [slipId, token, load, canRequestEdit, canResolveEdit, slipNo]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onSubmit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSlipComment(token, slipId, { body: trimmed });
      setDraft('');
      // 낙관적 append — SSE 가 곧 도착하지만 즉시 반영.
      setComments((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (commentId: string) => {
    try {
      await deleteSlipComment(token, slipId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // ----------------------------------------------------------------------
  // PR-H3 — 수정 요청 (SALES) 발행.
  // ----------------------------------------------------------------------
  const onOpenRequestModal = () => {
    if (!canRequestEdit) return;
    setRequestReasonDraft('');
    setRequestModalOpen(true);
  };

  const onSubmitEditRequest = async () => {
    const trimmed = requestReasonDraft.trim();
    if (trimmed.length === 0 || requestSubmitting) return;
    setRequestSubmitting(true);
    setError(null);
    try {
      await requestSlipEdit(token, slipId, { reason: trimmed });
      setRequestModalOpen(false);
      setRequestReasonDraft('');
      await load();
      Alert.alert('수정 요청 발행', '창고 직원의 수락을 기다립니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRequestSubmitting(false);
    }
  };

  // ----------------------------------------------------------------------
  // PR-H3 — PENDING 요청 수락 (WAREHOUSE).
  // ----------------------------------------------------------------------
  const onApproveEditRequest = async (requestId: string) => {
    if (!canResolveEdit || approvingId !== null) return;
    setApprovingId(requestId);
    setError(null);
    try {
      await approveSlipEdit(token, slipId, requestId);
      await load();
      Alert.alert('수락 완료', '영업직원에게 알림이 전송되며, 전표가 수정 가능 상태로 전환됩니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovingId(null);
    }
  };

  // ----------------------------------------------------------------------
  // PR-H3 — PENDING 요청 거절 (WAREHOUSE) — 사유 모달.
  // ----------------------------------------------------------------------
  const onOpenRejectModal = (requestId: string) => {
    if (!canResolveEdit) return;
    setRejectTargetId(requestId);
    setRejectReasonDraft('');
    setRejectModalOpen(true);
  };

  const onSubmitReject = async () => {
    const trimmed = rejectReasonDraft.trim();
    if (trimmed.length === 0 || rejectTargetId == null || rejectSubmitting) return;
    setRejectSubmitting(true);
    setError(null);
    try {
      await rejectSlipEdit(token, slipId, rejectTargetId, { rejectionReason: trimmed });
      setRejectModalOpen(false);
      setRejectTargetId(null);
      setRejectReasonDraft('');
      await load();
      Alert.alert('거절 완료', '영업직원에게 거절 사유가 전달됩니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRejectSubmitting(false);
    }
  };

  // PR-H3 — 본 slip 의 PENDING 요청 (창고 카드용) + 처리 완료 이력.
  const pendingRequests = useMemo(
    () => editRequests.filter((r) => r.status === 'PENDING'),
    [editRequests],
  );
  const resolvedRequests = useMemo(
    () => editRequests.filter((r) => r.status !== 'PENDING'),
    [editRequests],
  );

  // ----------------------------------------------------------------------
  // PR-H2 복원 — MASTER / MANAGER 만 호출 가능 (canRevert 가드).
  // BE 가 audit log 1건을 추가 기록하므로 success 시 load() 로 재조회.
  // ----------------------------------------------------------------------
  const onRevert = async (auditLogId: string) => {
    if (!canRevert || reverting) return;
    setReverting(true);
    setError(null);
    try {
      await revertSlipAuditLog(token, slipId, auditLogId);
      await load();
      Alert.alert('복원 완료', '선택한 시점의 값으로 복원되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReverting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} testID="slip-detail-back-mobile">
            <Text style={styles.backLabel}>{'< 뒤로'}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.h1}>전표 {slipNo ?? '상세'}</Text>
            {/* PR-H2: 수정 횟수 헤더 — DRIVER / SALES 도 모두 노출 (read-only). */}
            <Text style={styles.editCount} testID="slip-detail-edit-count-mobile">
              수정 {editCount}회
            </Text>
          </View>

          {/* PR-H2: AuditOverlay — partnerName / statusLabel 변경 이력 표시. */}
          <View style={styles.auditFieldRow}>
            <Text style={styles.auditFieldLabel}>거래처</Text>
            <View style={styles.auditFieldValue}>
              <AuditOverlay
                field="partnerName"
                currentValue={partnerName ?? null}
                history={auditByField['partnerName'] ?? []}
              />
              {canRevert && (auditByField['partnerName']?.length ?? 0) > 0 ? (
                <TouchableOpacity
                  onPress={() => onRevert(auditByField['partnerName']![auditByField['partnerName']!.length - 1].id)}
                  disabled={reverting}
                  style={styles.revertBtn}
                  testID={`slip-detail-audit-revert-mobile-${auditByField['partnerName']![auditByField['partnerName']!.length - 1].id}`}
                >
                  <Text style={styles.revertLabel}>{reverting ? '복원 중…' : '직전 값으로 복원'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.auditFieldRow}>
            <Text style={styles.auditFieldLabel}>상태</Text>
            <View style={styles.auditFieldValue}>
              {statusLabel ? (
                <Text style={badgeStyle('info')}>{statusLabel}</Text>
              ) : (
                <Text style={styles.subtitle}>(상태 미지정)</Text>
              )}
              {(auditByField['status']?.length ?? 0) > 0 ? (
                <AuditOverlay
                  field="status"
                  currentValue={statusLabel ?? null}
                  history={auditByField['status'] ?? []}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.headerSub}>
            <Text style={[styles.subtitle, styles.realtimeBadge]}>
              {realtimeStatus === 'live'
                ? '실시간 연결됨'
                : realtimeStatus === 'connecting'
                  ? '실시간 연결 중…'
                  : '오프라인'}
            </Text>
            {/* PR-H3 — SALES (또는 관리자 대행) 수정 요청 버튼. */}
            {canRequestEdit ? (
              <TouchableOpacity
                onPress={onOpenRequestModal}
                style={styles.requestBtn}
                testID="slip-detail-edit-request-button-mobile"
              >
                <Text style={styles.requestBtnLabel}>수정 요청</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* PR-H3 — WAREHOUSE 본 slip PENDING 요청 카드 (수락 / 거절). */}
      {canResolveEdit && pendingRequests.length > 0 ? (
        <View style={styles.pendingPanel}>
          <Text style={styles.pendingHeading}>
            대기 중 수정 요청 {pendingRequests.length}건
          </Text>
          {pendingRequests.map((req) => (
            <View key={req.id} style={styles.pendingCard}>
              <View style={styles.pendingHead}>
                <Text style={styles.pendingAuthor}>{req.requesterFullName}</Text>
                <Text style={badgeStyle('info')}>{req.requesterRole}</Text>
                <Text style={styles.pendingTime}>{formatTime(req.createdAt)}</Text>
              </View>
              <Text style={styles.pendingReason}>{req.reason}</Text>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  onPress={() => onApproveEditRequest(req.id)}
                  disabled={approvingId !== null}
                  style={[
                    styles.approveBtn,
                    approvingId !== null && styles.btnDisabled,
                  ]}
                  testID={`slip-detail-edit-request-approve-mobile-${req.id}`}
                >
                  <Text style={styles.approveBtnLabel}>
                    {approvingId === req.id ? '수락 중…' : '수락'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onOpenRejectModal(req.id)}
                  disabled={approvingId !== null}
                  style={[
                    styles.rejectBtn,
                    approvingId !== null && styles.btnDisabled,
                  ]}
                  testID={`slip-detail-edit-request-reject-mobile-${req.id}`}
                >
                  <Text style={styles.rejectBtnLabel}>거절</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* PR-H3 — 작성자 (SALES) 가 자신의 PENDING 요청을 보고 있는 경우의 안내. */}
      {canRequestEdit && !canResolveEdit && pendingRequests.length > 0 ? (
        <View style={styles.pendingNotice} testID="slip-detail-edit-request-pending-notice-mobile">
          <Text style={styles.pendingNoticeText}>
            창고 직원의 수락 대기 중 ({pendingRequests.length}건)
          </Text>
        </View>
      ) : null}

      {/* PR-H3 — 처리 완료 (APPROVED / REJECTED) 이력 — 모든 ROLE read-only. */}
      {resolvedRequests.length > 0 ? (
        <View style={styles.resolvedPanel}>
          <Text style={styles.resolvedHeading}>처리 완료 이력</Text>
          {resolvedRequests.slice(0, 3).map((req) => (
            <View key={req.id} style={styles.resolvedRow}>
              <Text style={styles.resolvedRowText}>
                {req.requesterFullName} ({req.requesterRole}) · {formatTime(req.createdAt)} → {req.status === 'APPROVED' ? '수락' : req.status === 'REJECTED' ? '거절' : '취소'}
                {req.resolverFullName ? ` (${req.resolverFullName})` : ''}
              </Text>
              {req.status === 'REJECTED' && req.rejectionReason ? (
                <Text style={styles.resolvedRowReason}>거절 사유: {req.rejectionReason}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {error && (
        <View style={styles.errorCard} testID="slip-detail-error-mobile">
          <Text style={[styles.errorText, badgeStyle('warn')]}>오류</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.action.brand} />
            <Text style={styles.muted}>코멘트 불러오는 중…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            testID="slip-detail-comment-list-mobile"
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.muted}>아직 코멘트가 없습니다</Text>
              </View>
            }
            renderItem={({ item }) => (
              <CommentItem item={item} onDelete={() => onDelete(item.id)} />
            )}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="코멘트를 입력하세요 (최대 2000자)"
            placeholderTextColor={colors.ink.tertiary}
            multiline
            maxLength={2000}
            editable={!submitting}
            testID="slip-detail-comment-input-mobile"
          />
          <TouchableOpacity
            onPress={onSubmit}
            disabled={submitting || draft.trim().length === 0}
            style={[
              styles.submitBtn,
              (submitting || draft.trim().length === 0) && styles.submitBtnDisabled,
            ]}
            testID="slip-detail-comment-submit-mobile"
          >
            <Text style={styles.submitLabel}>{submitting ? '전송 중…' : '전송'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* PR-H3 — SALES 수정 요청 사유 입력 모달. */}
      <Modal
        visible={requestModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRequestModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>수정 요청 사유</Text>
            <Text style={styles.modalDescription}>
              창고 직원이 사유를 확인하고 수락 / 거절을 처리합니다. (최대 500자)
            </Text>
            <TextInput
              style={styles.modalInput}
              value={requestReasonDraft}
              onChangeText={setRequestReasonDraft}
              placeholder="예: 거래처 요청으로 수량 정정 필요"
              placeholderTextColor={colors.ink.tertiary}
              multiline
              maxLength={500}
              editable={!requestSubmitting}
              testID="slip-detail-edit-request-reason-input-mobile"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setRequestModalOpen(false)}
                disabled={requestSubmitting}
                style={styles.modalCancelBtn}
                testID="slip-detail-edit-request-cancel-mobile"
              >
                <Text style={styles.modalCancelLabel}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSubmitEditRequest}
                disabled={requestSubmitting || requestReasonDraft.trim().length === 0}
                style={[
                  styles.modalSubmitBtn,
                  (requestSubmitting || requestReasonDraft.trim().length === 0) &&
                    styles.btnDisabled,
                ]}
                testID="slip-detail-edit-request-submit-mobile"
              >
                <Text style={styles.modalSubmitLabel}>
                  {requestSubmitting ? '전송 중…' : '요청 발행'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* PR-H3 — WAREHOUSE 거절 사유 입력 모달. */}
      <Modal
        visible={rejectModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRejectModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>거절 사유</Text>
            <Text style={styles.modalDescription}>
              영업직원에게 거절 사유가 전달됩니다. (최대 500자)
            </Text>
            <TextInput
              style={styles.modalInput}
              value={rejectReasonDraft}
              onChangeText={setRejectReasonDraft}
              placeholder="예: 이미 출고 완료된 전표로 수정 불가"
              placeholderTextColor={colors.ink.tertiary}
              multiline
              maxLength={500}
              editable={!rejectSubmitting}
              testID="slip-detail-edit-request-reject-reason-input-mobile"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setRejectModalOpen(false);
                  setRejectTargetId(null);
                }}
                disabled={rejectSubmitting}
                style={styles.modalCancelBtn}
                testID="slip-detail-edit-request-reject-cancel-mobile"
              >
                <Text style={styles.modalCancelLabel}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSubmitReject}
                disabled={rejectSubmitting || rejectReasonDraft.trim().length === 0}
                style={[
                  styles.modalSubmitBtn,
                  styles.modalRejectBtn,
                  (rejectSubmitting || rejectReasonDraft.trim().length === 0) &&
                    styles.btnDisabled,
                ]}
                testID="slip-detail-edit-request-reject-submit-mobile"
              >
                <Text style={styles.modalSubmitLabel}>
                  {rejectSubmitting ? '전송 중…' : '거절'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

interface CommentItemProps {
  item: SlipCommentResponse;
  onDelete: () => void;
}

function CommentItem({ item, onDelete }: CommentItemProps): JSX.Element {
  const time = formatTime(item.createdAt);
  return (
    <View style={styles.commentCard} testID={`slip-detail-comment-item-mobile-${item.id}`}>
      <View style={styles.commentHead}>
        <Text style={styles.commentAuthor}>{resolveActorDisplayName(item.authorFullName) ?? '변경자 미상'}</Text>
        <Text style={badgeStyle('info')}>{item.authorRole}</Text>
        <Text style={styles.commentTime}>{time}</Text>
      </View>
      <Text style={styles.commentBody}>
        {item.deleted ? '(삭제된 코멘트)' : item.body}
      </Text>
      {!item.deleted ? (
        <TouchableOpacity onPress={onDelete} style={styles.commentDelBtn}>
          <Text style={styles.commentDelLabel}>삭제</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  headerInfo: { flex: 1 },
  headerSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[1],
    flexWrap: 'wrap',
  },
  backBtn: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  backLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  editCount: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  auditFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing[2],
    gap: spacing[2],
  },
  auditFieldLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    width: 48,
    paddingTop: spacing[1],
  },
  auditFieldValue: {
    flex: 1,
    gap: spacing[1],
  },
  revertBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing[1],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
  },
  revertLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.action.brand,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.semibold,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  realtimeBadge: {
    color: colors.ink.tertiary,
    fontSize: typography.fontSize.xs,
  },
  list: { padding: spacing[4], gap: spacing[2] },
  empty: { alignItems: 'center', paddingTop: spacing[10] },
  muted: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    marginTop: spacing[2],
    fontFamily: typography.fontFamily.sans,
  },
  commentCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
    flexWrap: 'wrap',
  },
  commentAuthor: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  commentTime: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  commentBody: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.base * typography.lineHeight.base,
  },
  commentDelBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing[2],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  commentDelLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing[3],
    gap: spacing[2],
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    backgroundColor: colors.surface.app,
  },
  submitBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
  },
  submitBtnDisabled: {
    backgroundColor: colors.line.default,
  },
  submitLabel: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
  },
  errorCard: {
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.state.warningBg,
    borderRadius: radii.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.state.warning,
  },
  errorText: { alignSelf: 'flex-start' },
  errorMessage: {
    marginTop: spacing[2],
    color: colors.ink.primary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
  },
  // PR-H3 — 수정 요청 / 수락 / 거절 styles.
  requestBtn: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
  },
  requestBtnLabel: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.xs,
  },
  pendingPanel: {
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.state.warningBg,
    borderRadius: radii.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.state.warning,
    gap: spacing[2],
  },
  pendingHeading: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  pendingCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    gap: spacing[2],
  },
  pendingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  pendingAuthor: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  pendingTime: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  pendingReason: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    lineHeight: typography.fontSize.base * typography.lineHeight.base,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'flex-end',
  },
  approveBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.state.success,
    borderRadius: radii.button,
  },
  approveBtnLabel: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
  },
  rejectBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.state.danger,
    borderRadius: radii.button,
  },
  rejectBtnLabel: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  pendingNotice: {
    marginHorizontal: spacing[3],
    marginTop: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.state.infoBg,
    borderRadius: radii.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.state.info,
  },
  pendingNoticeText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  resolvedPanel: {
    marginHorizontal: spacing[3],
    marginTop: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    gap: spacing[1],
  },
  resolvedHeading: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  resolvedRow: {
    paddingVertical: spacing[1],
  },
  resolvedRowText: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  resolvedRowReason: {
    fontSize: typography.fontSize.xs,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    maxHeight: '80%',
  },
  modalContent: {
    padding: spacing[4],
    gap: spacing[2],
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  modalDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  modalInput: {
    minHeight: 100,
    maxHeight: 200,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    backgroundColor: colors.surface.app,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  modalCancelBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
  },
  modalCancelLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.medium,
  },
  modalSubmitBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
  },
  modalRejectBtn: {
    backgroundColor: colors.state.danger,
  },
  modalSubmitLabel: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
  },
});
