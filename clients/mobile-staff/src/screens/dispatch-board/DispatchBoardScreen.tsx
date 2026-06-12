/**
 * DispatchBoardScreen — mobile-staff Samhan Public 배차 메뉴 (FE-F6).
 *
 * <p>spec § 5.2: 모바일은 좌우 split 대신 **tab 전환** ([미배차 전표] / [차량 그룹]).
 *
 * <p>UI 흐름:
 *  1) [미배차 전표] tab — 50/page 페이지네이션 + 날짜 ±1일 default + 상태 default UNDISPATCHED.
 *     각 슬립을 long-press 250ms → "차량 그룹 선택" sheet 표시 → 선택 시 assignSlip API.
 *  2) [차량 그룹] tab — 차량 그룹 list + [+ 차량 추가] + [✓ 배차 완료].
 *
 * <p>Phase A 모바일 드래그 우회 결정:
 *  - 사용자 명세 "터치 앤 드래그" — `@dnd-kit/core` 의 TouchSensor 가 명시되었으나 본 라이브러리는 web DOM 전용
 *    이므로 React Native 환경에서는 동작하지 않음.
 *  - 본 화면은 RN 친화적 long-press 250ms + "그룹 선택 sheet" 패턴으로 동등한 결과 (slip→그룹 할당) 를
 *    제공한다. 실제 두 손가락 드래그 UX 가 필요한 경우 추후 `react-native-gesture-handler` +
 *    `react-native-reanimated` 도입하여 본 화면을 확장한다 (TM 검토 → Phase B 후보).
 *  - long-press 시 시각적 highlight + 한국어 안내 ("출고전표 SL-001 — 차량 그룹을 선택하세요").
 *
 * <p>UUID 비공개 (feedback_uuid_no_user_visibility.md):
 *  - 화면 노출 = slipNumber / partnerCode / partnerName / taskCode / driverCode / 차량 종류 라벨.
 *  - id (slip/group/task UUID) 는 API path 와 RN state 내부 이동에만 사용.
 *
 * <p>accessibility:
 *  - 모든 TouchableOpacity 에 한국어 `accessibilityLabel`.
 *  - tab 전환 = AccessibilityRole 'tab' + state 'selected'.
 *  - long-press = `accessibilityHint` 로 사용 안내.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import {
  addVehicleGroup,
  assignSlipToGroup,
  canRequestModificationOrCancel,
  createDispatchTask,
  deleteVehicleGroup,
  DISPATCH_TASK_STATUS_LABEL,
  DISPATCH_VEHICLE_TYPE_LABEL,
  DISPATCH_VEHICLE_TYPE_OPTIONS,
  dispatchToArologis,
  getDispatchTask,
  isEditableStatus,
  listUnDispatchedSlips,
  offsetIsoSeoul,
  removeSlipFromGroup,
  requestCancellation,
  requestModification,
  SLIP_DISPATCH_STATUS_LABEL,
  todayIsoSeoul,
  type DispatchTaskResponse,
  type DispatchTaskStatus,
  type DispatchVehicleType,
  type SlipBoardResponse,
  type SlipDispatchStatus,
} from '../../api/dispatchBoard';

interface Props {
  /** JWT access token — backend gateway 가 ROLE_DISPATCH/MANAGER/MASTER 검증 후 slip-service 로 forward. */
  token: string | null;
}

type Tab = 'undispatched' | 'groups';

const PAGE_SIZE = 50;
const DEFAULT_STATUSES: SlipDispatchStatus[] = ['UNDISPATCHED'];

function getSlipDisplayNo(slip: { slipNo?: string; slipNumber?: string }): string {
  return slip.slipNo ?? slip.slipNumber ?? '-';
}

function getSlipStatusLabel(status: SlipDispatchStatus | null | undefined): string {
  return status ? SLIP_DISPATCH_STATUS_LABEL[status] : '-';
}

export default function DispatchBoardScreen({ token }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('undispatched');

  // ---- DispatchTask state ---------------------------------------------------
  const [task, setTask] = useState<DispatchTaskResponse | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);

  // ---- 미배차 슬립 list state ------------------------------------------------
  const [slips, setSlips] = useState<SlipBoardResponse[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState<string>(() => offsetIsoSeoul(todayIsoSeoul(), -1));
  const [to, setTo] = useState<string>(() => offsetIsoSeoul(todayIsoSeoul(), 1));
  const [slipsLoading, setSlipsLoading] = useState(true);
  const [slipsRefreshing, setSlipsRefreshing] = useState(false);
  const [slipsError, setSlipsError] = useState<string | null>(null);

  // ---- slip → 그룹 할당 sheet -----------------------------------------------
  const [selectedSlip, setSelectedSlip] = useState<SlipBoardResponse | null>(null);

  // ---- 차량 추가 sheet ------------------------------------------------------
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);

  // ---- 배차 완료 확인 dialog -----------------------------------------------
  const [completeOpen, setCompleteOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // ---- Phase C — DispatchTask 상세 + 수정/취소 요청 sheet ---------------------
  const [detailOpen, setDetailOpen] = useState(false);
  const [modificationOpen, setModificationOpen] = useState(false);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [modificationReason, setModificationReason] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [modificationSubmitting, setModificationSubmitting] = useState(false);
  const [cancellationSubmitting, setCancellationSubmitting] = useState(false);

  const refreshTask = useCallback(async () => {
    if (!task?.id) return;
    try {
      const updated = await getDispatchTask(token, task.id);
      setTask(updated);
    } catch (e) {
      setTaskError(e instanceof Error ? e.message : String(e));
    }
  }, [task?.id, token]);

  // 진입 직후 빈 DispatchTask(DRAFT) 자동 생성.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setTaskLoading(true);
        const created = await createDispatchTask(token, todayIsoSeoul());
        if (!alive) return;
        setTask(created);
      } catch (e) {
        if (!alive) return;
        setTaskError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setTaskLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // 미배차 슬립 page load.
  const loadSlips = useCallback(async () => {
    try {
      setSlipsError(null);
      const res = await listUnDispatchedSlips(token, {
        from,
        to,
        statuses: DEFAULT_STATUSES,
        page,
        size: PAGE_SIZE,
      });
      setSlips(res.content);
      setTotalPages(res.totalPages);
      setTotalElements(res.totalElements);
    } catch (e) {
      setSlipsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSlipsLoading(false);
      setSlipsRefreshing(false);
    }
  }, [from, page, to, token]);

  useEffect(() => {
    setSlipsLoading(true);
    loadSlips();
  }, [loadSlips]);

  const handleRefreshSlips = () => {
    setSlipsRefreshing(true);
    loadSlips();
  };

  const handleAssignSlipToGroup = async (groupId: string) => {
    if (!task || !selectedSlip) return;
    try {
      await assignSlipToGroup(token, task.id, groupId, selectedSlip.id);
      setSelectedSlip(null);
      await Promise.all([refreshTask(), loadSlips()]);
      setTab('groups');
    } catch (e) {
      Alert.alert('할당 실패', e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddVehicle = async (vt: DispatchVehicleType) => {
    if (!task) return;
    try {
      await addVehicleGroup(token, task.id, vt);
      setAddVehicleOpen(false);
      await refreshTask();
    } catch (e) {
      Alert.alert('차량 추가 실패', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!task) return;
    try {
      await deleteVehicleGroup(token, task.id, groupId);
      await refreshTask();
    } catch (e) {
      Alert.alert('그룹 삭제 실패', e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveSlip = async (groupId: string, slipId: string) => {
    if (!task) return;
    try {
      await removeSlipFromGroup(token, task.id, groupId, slipId);
      await Promise.all([refreshTask(), loadSlips()]);
    } catch (e) {
      Alert.alert('슬립 제거 실패', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDispatch = async () => {
    if (!task) return;
    try {
      setDispatching(true);
      const updated = await dispatchToArologis(token, task.id);
      setTask(updated);
      setCompleteOpen(false);
    } catch (e) {
      Alert.alert('발송 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setDispatching(false);
    }
  };

  // 모바일 편집/발송 = DRAFT 만 (Round D — MODIFICATION_ACCEPTED 재배차는 데스크톱
  // 배차현황 Option A 한정, api/dispatchBoard.ts isEditableStatus 참조).
  const vehicleGroups = task?.vehicleGroups ?? [];
  const assignedSlipCount = vehicleGroups.reduce(
    (sum, group) => sum + (group.slips?.length ?? 0),
    0,
  );
  const canEdit = !!task && isEditableStatus(task.status);
  const canDispatch =
    canEdit &&
    vehicleGroups.length > 0 &&
    vehicleGroups.some((g) => (g.slips?.length ?? 0) > 0);

  // Phase C — DISPATCHED 이후 상태에서 상세 sheet 진입 가능.
  const canOpenDetail =
    !!task && task.status !== 'DRAFT' && task.status !== 'DISPATCHING';
  const showRequestButtons = !!task && canRequestModificationOrCancel(task.status);

  const handleRequestModification = async () => {
    if (!task) return;
    const trimmed = modificationReason.trim();
    if (trimmed.length === 0) {
      Alert.alert('사유 입력 필요', '수정 요청 사유를 입력해주세요.');
      return;
    }
    try {
      setModificationSubmitting(true);
      const updated = await requestModification(token, task.id, trimmed);
      setTask(updated);
      setModificationReason('');
      setModificationOpen(false);
      setDetailOpen(false);
    } catch (e) {
      Alert.alert('수정 요청 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setModificationSubmitting(false);
    }
  };

  const handleRequestCancellation = async () => {
    if (!task) return;
    const trimmed = cancellationReason.trim();
    if (trimmed.length === 0) {
      Alert.alert('사유 입력 필요', '취소 요청 사유를 입력해주세요.');
      return;
    }
    try {
      setCancellationSubmitting(true);
      const updated = await requestCancellation(token, task.id, trimmed);
      setTask(updated);
      setCancellationReason('');
      setCancellationOpen(false);
      setDetailOpen(false);
    } catch (e) {
      Alert.alert('취소 요청 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setCancellationSubmitting(false);
    }
  };

  const matchedByGroup = useMemo(() => {
    const m = new Map<number, string>();
    // 수정/취소 요청 mutation 은 slim 응답(matchedDrivers 미포함)을 반환하므로 옵셔널 체이닝 가드.
    task?.matchedDrivers?.forEach((d) => {
      m.set(
        d.vehicleGroupSequence,
        `${d.driverName} (${d.driverCode}) ${d.driverPhoneNumber}`,
      );
    });
    return m;
  }, [task]);

  if (taskLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.action.brand} />
        <Text style={styles.muted}>배차 작업을 준비하는 중…</Text>
      </SafeAreaView>
    );
  }

  if (taskError || !task) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorMessage}>
          배차 작업 초기화 실패: {taskError ?? '알 수 없는 오류'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Tab bar — [미배차 전표] / [차량 그룹] */}
      <View style={styles.tabBar} accessibilityRole="tablist">
        <TabButton
          label={`미배차 전표 (${totalElements})`}
          active={tab === 'undispatched'}
          onPress={() => setTab('undispatched')}
          testID="dispatch-board-mobile-tab-undispatched"
        />
        <TabButton
          label={`차량 그룹 (${vehicleGroups.length})`}
          active={tab === 'groups'}
          onPress={() => setTab('groups')}
          testID="dispatch-board-mobile-tab-groups"
        />
      </View>

      {/* Task status badge — 모든 탭 상단 공통. Phase C: DISPATCHED 이후 tap → 상세 sheet. */}
      <View style={styles.statusRow}>
        <Text style={styles.taskCode}>{task.taskCode}</Text>
        {canOpenDetail ? (
          <TouchableOpacity
            style={[styles.statusBadge, statusBadgeStyle(task.status)]}
            onPress={() => setDetailOpen(true)}
            accessibilityLabel={`배차 작업 상세 보기 — 현재 상태: ${DISPATCH_TASK_STATUS_LABEL[task.status]}`}
            testID="dispatch-board-mobile-status-badge"
          >
            <Text style={styles.statusBadgeText}>
              {DISPATCH_TASK_STATUS_LABEL[task.status]} ⓘ
            </Text>
          </TouchableOpacity>
        ) : (
          <View
            style={[styles.statusBadge, statusBadgeStyle(task.status)]}
            accessibilityLabel={`배차 상태: ${DISPATCH_TASK_STATUS_LABEL[task.status]}`}
          >
            <Text style={styles.statusBadgeText}>
              {DISPATCH_TASK_STATUS_LABEL[task.status]}
            </Text>
          </View>
        )}
      </View>
      {task.status === 'FAILED' && task.failureReason ? (
        <View style={styles.failureBanner}>
          <Text style={styles.failureText}>배차 불가 사유: {task.failureReason}</Text>
        </View>
      ) : null}
      {/* Phase C — 상태별 안내 배너 */}
      {task.status === 'MODIFICATION_ACCEPTED' ? (
        <View style={styles.acceptedBanner}>
          <Text style={styles.acceptedBannerText}>
            수정 수락됨 — 재배차(차량/슬립 수정 후 재발송)는 데스크톱 배차현황에서 진행하세요. 모바일에서는 재배차를 시작할 수 없습니다.
          </Text>
        </View>
      ) : null}
      {(task.status === 'MODIFICATION_REQUESTED' ||
        task.status === 'CANCEL_REQUESTED') &&
      task.modificationReason ? (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>
            아로로지스 회신 대기: {task.modificationReason}
          </Text>
        </View>
      ) : null}
      {(task.status === 'MODIFICATION_REJECTED' ||
        task.status === 'CANCEL_REJECTED') &&
      task.rejectionReason ? (
        <View style={styles.failureBanner}>
          <Text style={styles.failureText}>거부 사유: {task.rejectionReason}</Text>
        </View>
      ) : null}

      {tab === 'undispatched' ? (
        <UndispatchedTab
          slips={slips}
          loading={slipsLoading}
          refreshing={slipsRefreshing}
          error={slipsError}
          page={page}
          totalPages={totalPages}
          from={from}
          to={to}
          onChangeFrom={(v) => {
            setPage(0);
            setFrom(v);
          }}
          onChangeTo={(v) => {
            setPage(0);
            setTo(v);
          }}
          onPrevPage={() => setPage((p) => Math.max(0, p - 1))}
          onNextPage={() => setPage((p) => p + 1)}
          onRefresh={handleRefreshSlips}
          onLongPressSlip={(s) => canEdit && setSelectedSlip(s)}
        />
      ) : (
        <GroupsTab
          task={task}
          matchedByGroup={matchedByGroup}
          canEdit={!!canEdit}
          canDispatch={!!canDispatch}
          onAddVehicle={() => setAddVehicleOpen(true)}
          onCompleteDispatch={() => setCompleteOpen(true)}
          onDeleteGroup={handleDeleteGroup}
          onRemoveSlip={handleRemoveSlip}
        />
      )}

      {/* slip 선택 → 그룹 선택 sheet */}
      <Modal
        visible={!!selectedSlip}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSlip(null)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              출고전표 {selectedSlip ? getSlipDisplayNo(selectedSlip) : '-'} — 차량 그룹 선택
            </Text>
            <Text style={styles.sheetSub}>
              {selectedSlip?.partnerName} ({selectedSlip?.partnerCode})
            </Text>
            <ScrollView style={styles.sheetBody}>
              {vehicleGroups.length === 0 ? (
                <Text style={styles.muted}>
                  차량 그룹이 없습니다. 먼저 [차량 그룹] 탭에서 [+ 차량 추가] 를 사용하세요.
                </Text>
              ) : (
                vehicleGroups.map((g) => {
                  const groupSlipCount = g.slips?.length ?? 0;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={styles.sheetGroupRow}
                      onPress={() => handleAssignSlipToGroup(g.id)}
                      accessibilityLabel={`차량 ${DISPATCH_VEHICLE_TYPE_LABEL[g.vehicleType]} #${g.sequence} 그룹에 할당`}
                      testID={`dispatch-board-mobile-assign-group-${g.sequence}`}
                    >
                      <Text style={styles.sheetGroupLabel}>
                        {DISPATCH_VEHICLE_TYPE_LABEL[g.vehicleType]} #{g.sequence}
                      </Text>
                      <Text style={styles.muted}>({groupSlipCount}건)</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setSelectedSlip(null)}
              accessibilityLabel="할당 취소"
            >
              <Text style={styles.sheetCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 차량 추가 sheet */}
      <Modal
        visible={addVehicleOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddVehicleOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>차량 추가</Text>
            <Text style={styles.sheetSub}>배차에 사용할 차량 종류 선택</Text>
            <ScrollView contentContainerStyle={styles.vehicleGrid}>
              {DISPATCH_VEHICLE_TYPE_OPTIONS.map((vt) => (
                <TouchableOpacity
                  key={vt}
                  style={styles.vehicleCell}
                  onPress={() => handleAddVehicle(vt)}
                  accessibilityLabel={`차량 종류 ${DISPATCH_VEHICLE_TYPE_LABEL[vt]} 추가`}
                  testID={`dispatch-board-mobile-add-vehicle-${vt}`}
                >
                  <Text style={styles.vehicleCellText}>
                    {DISPATCH_VEHICLE_TYPE_LABEL[vt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setAddVehicleOpen(false)}
            >
              <Text style={styles.sheetCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 배차 완료 확인 dialog */}
      <Modal
        visible={completeOpen}
        animationType="fade"
        transparent
        onRequestClose={() => !dispatching && setCompleteOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.confirmDialog}>
            <Text style={styles.sheetTitle}>배차 완료 — 아로로지스 발송</Text>
            <Text style={styles.sheetSub}>
              {task.taskCode} 작업을 아로로지스로 발송합니다.
            </Text>
            <Text style={styles.muted}>
              차량 {vehicleGroups.length}대 / 슬립 {assignedSlipCount}건
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                onPress={() => setCompleteOpen(false)}
                disabled={dispatching}
              >
                <Text style={styles.confirmBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                onPress={handleDispatch}
                disabled={dispatching}
                accessibilityLabel="아로로지스로 배차 발송"
              >
                <Text style={[styles.confirmBtnText, styles.confirmBtnTextPrimary]}>
                  {dispatching ? '발송 중…' : '✓ 발송하기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Phase C — DispatchTask 상세 sheet (DISPATCHED 이후) */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              배차 작업 {task.taskCode} — 상세
            </Text>
            <Text style={styles.sheetSub}>
              {DISPATCH_TASK_STATUS_LABEL[task.status]}
            </Text>
            <ScrollView style={styles.sheetBody}>
              <Text style={styles.muted}>배차 일자: {task.dispatchDate}</Text>
              <Text style={styles.muted}>
                차량 {vehicleGroups.length}대 · 슬립 {assignedSlipCount}건
              </Text>
              {task.modificationReason ? (
                <Text style={styles.muted}>
                  요청 사유: {task.modificationReason}
                </Text>
              ) : null}
              {task.rejectionReason ? (
                <Text style={styles.failureText}>
                  거부 사유: {task.rejectionReason}
                </Text>
              ) : null}
            </ScrollView>
            {showRequestButtons ? (
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.requestBtnModification]}
                  onPress={() => {
                    setDetailOpen(false);
                    setModificationOpen(true);
                  }}
                  accessibilityLabel={`배차 작업 ${task.taskCode} 수정 요청 발송`}
                  testID="dispatch-board-mobile-request-modification"
                >
                  <Text style={styles.confirmBtnTextPrimary}>✏ 수정 요청</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.requestBtnCancellation]}
                  onPress={() => {
                    setDetailOpen(false);
                    setCancellationOpen(true);
                  }}
                  accessibilityLabel={`배차 작업 ${task.taskCode} 취소 요청 발송`}
                  testID="dispatch-board-mobile-request-cancellation"
                >
                  <Text style={styles.confirmBtnTextPrimary}>✗ 취소 요청</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setDetailOpen(false)}
              accessibilityLabel="배차 작업 상세 닫기"
            >
              <Text style={styles.sheetCancelText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Phase C — 수정 요청 sheet */}
      <Modal
        visible={modificationOpen}
        animationType="slide"
        transparent
        onRequestClose={() =>
          !modificationSubmitting && setModificationOpen(false)
        }
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>수정 요청</Text>
            <Text style={styles.sheetSub}>
              {task.taskCode} — 아로로지스로 배차 수정 요청 발송
            </Text>
            <Text style={styles.requestLabel}>
              사유 (필수, 최대 500자)
            </Text>
            <TextInput
              style={styles.requestReasonInput}
              value={modificationReason}
              onChangeText={setModificationReason}
              placeholder="예: 슬립 추가 + 정차 순서 조정"
              multiline
              maxLength={500}
              accessibilityLabel="배차 수정 요청 사유"
              testID="dispatch-board-mobile-modification-reason"
              editable={!modificationSubmitting}
            />
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                onPress={() => setModificationOpen(false)}
                disabled={modificationSubmitting}
              >
                <Text style={styles.confirmBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.requestBtnModification]}
                onPress={handleRequestModification}
                disabled={
                  modificationSubmitting ||
                  modificationReason.trim().length === 0
                }
                accessibilityLabel="배차 수정 요청 발송"
                testID="dispatch-board-mobile-modification-submit"
              >
                <Text style={styles.confirmBtnTextPrimary}>
                  {modificationSubmitting ? '발송 중…' : '✏ 요청 발송'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Phase C — 취소 요청 sheet */}
      <Modal
        visible={cancellationOpen}
        animationType="slide"
        transparent
        onRequestClose={() =>
          !cancellationSubmitting && setCancellationOpen(false)
        }
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>취소 요청</Text>
            <Text style={styles.sheetSub}>
              {task.taskCode} — 아로로지스로 배차 취소 요청 발송. 수락 시 슬립은
              미배차로 복귀됩니다.
            </Text>
            <Text style={styles.requestLabel}>
              사유 (필수, 최대 500자)
            </Text>
            <TextInput
              style={styles.requestReasonInput}
              value={cancellationReason}
              onChangeText={setCancellationReason}
              placeholder="예: 거래처 일정 변경"
              multiline
              maxLength={500}
              accessibilityLabel="배차 취소 요청 사유"
              testID="dispatch-board-mobile-cancellation-reason"
              editable={!cancellationSubmitting}
            />
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                onPress={() => setCancellationOpen(false)}
                disabled={cancellationSubmitting}
              >
                <Text style={styles.confirmBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.requestBtnCancellation]}
                onPress={handleRequestCancellation}
                disabled={
                  cancellationSubmitting ||
                  cancellationReason.trim().length === 0
                }
                accessibilityLabel="배차 취소 요청 발송"
                testID="dispatch-board-mobile-cancellation-submit"
              >
                <Text style={styles.confirmBtnTextPrimary}>
                  {cancellationSubmitting ? '발송 중…' : '✗ 요청 발송'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// 미배차 탭.
// ---------------------------------------------------------------------------

interface UndispatchedTabProps {
  slips: SlipBoardResponse[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  from: string;
  to: string;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onRefresh: () => void;
  onLongPressSlip: (slip: SlipBoardResponse) => void;
}

function UndispatchedTab({
  slips,
  loading,
  refreshing,
  error,
  page,
  totalPages,
  from,
  to,
  onChangeFrom,
  onChangeTo,
  onPrevPage,
  onNextPage,
  onRefresh,
  onLongPressSlip,
}: UndispatchedTabProps): JSX.Element {
  return (
    <View style={{ flex: 1 }}>
      {/* 일자 필터 — 모바일은 단순 TextInput (yyyy-MM-dd) — 정식 picker 는 Phase B 도입 */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>날짜</Text>
        <TextInput
          style={styles.dateInput}
          value={from}
          onChangeText={onChangeFrom}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="조회 시작일"
          testID="dispatch-board-mobile-filter-from"
        />
        <Text style={styles.filterLabel}>~</Text>
        <TextInput
          style={styles.dateInput}
          value={to}
          onChangeText={onChangeTo}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="조회 종료일"
          testID="dispatch-board-mobile-filter-to"
        />
      </View>
      <Text style={styles.hint}>
        슬립을 길게 누르면 차량 그룹 선택 화면이 열립니다.
      </Text>
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={slips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.action.brand} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.muted}>조건에 해당하는 미배차 전표가 없습니다</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <SlipRow
            slip={item}
            onLongPress={() => onLongPressSlip(item)}
          />
        )}
      />
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.pageBtn, page <= 0 && styles.pageBtnDisabled]}
          onPress={onPrevPage}
          disabled={page <= 0}
          accessibilityLabel="이전 페이지"
          testID="dispatch-board-mobile-prev-page"
        >
          <Text style={styles.pageBtnText}>◀ 이전</Text>
        </TouchableOpacity>
        <Text style={styles.muted}>
          {totalPages === 0 ? 0 : page + 1} / {totalPages} (50/회)
        </Text>
        <TouchableOpacity
          style={[styles.pageBtn, page + 1 >= totalPages && styles.pageBtnDisabled]}
          onPress={onNextPage}
          disabled={page + 1 >= totalPages}
          accessibilityLabel="다음 페이지"
          testID="dispatch-board-mobile-next-page"
        >
          <Text style={styles.pageBtnText}>다음 ▶</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SlipRow({
  slip,
  onLongPress,
}: {
  slip: SlipBoardResponse;
  onLongPress: () => void;
}): JSX.Element {
  const slipNo = getSlipDisplayNo(slip);
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={250}
      style={({ pressed }) => [
        styles.slipRow,
        pressed && { backgroundColor: colors.surface.selected },
      ]}
      accessibilityLabel={`출고전표 ${slipNo} ${slip.partnerName} 길게 눌러서 차량 그룹에 추가`}
      accessibilityHint="250ms 이상 길게 누르면 차량 그룹 선택 화면이 열립니다"
      testID={`dispatch-board-mobile-slip-${slipNo}`}
    >
      <Text style={styles.slipNumber}>{slipNo}</Text>
      <Text style={styles.slipPartner}>
        {slip.partnerName}{' '}
        <Text style={styles.muted}>({slip.partnerCode})</Text>
      </Text>
      <Text style={styles.slipStatus}>
        {getSlipStatusLabel(slip.dispatchStatus)}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 차량 그룹 탭.
// ---------------------------------------------------------------------------

interface GroupsTabProps {
  task: DispatchTaskResponse;
  matchedByGroup: Map<number, string>;
  canEdit: boolean;
  canDispatch: boolean;
  onAddVehicle: () => void;
  onCompleteDispatch: () => void;
  onDeleteGroup: (groupId: string) => void;
  onRemoveSlip: (groupId: string, slipId: string) => void;
}

function GroupsTab({
  task,
  matchedByGroup,
  canEdit,
  canDispatch,
  onAddVehicle,
  onCompleteDispatch,
  onDeleteGroup,
  onRemoveSlip,
}: GroupsTabProps): JSX.Element {
  const vehicleGroups = task.vehicleGroups ?? [];
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, !canEdit && styles.actionBtnDisabled]}
          disabled={!canEdit}
          onPress={onAddVehicle}
          accessibilityLabel="차량 추가"
          testID="dispatch-board-mobile-add-vehicle"
        >
          <Text style={styles.actionBtnText}>+ 차량 추가</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {vehicleGroups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>
              차량 그룹이 없습니다. [+ 차량 추가] 로 시작하세요.
            </Text>
          </View>
        ) : (
          vehicleGroups.map((g) => {
            const slips = g.slips ?? [];
            return (
              <View
                key={g.id}
                style={styles.groupCard}
                accessibilityLabel={`차량 ${DISPATCH_VEHICLE_TYPE_LABEL[g.vehicleType]} #${g.sequence} 그룹, ${slips.length}건`}
              >
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>
                  {DISPATCH_VEHICLE_TYPE_LABEL[g.vehicleType]} #{g.sequence}
                </Text>
                <Text style={styles.muted}>({slips.length}건)</Text>
                {matchedByGroup.has(g.sequence) ? (
                  <Text style={styles.driverText}>
                    {matchedByGroup.get(g.sequence)}
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.groupDeleteBtn,
                      (!canEdit || slips.length > 0) && styles.actionBtnDisabled,
                    ]}
                    disabled={!canEdit || slips.length > 0}
                    onPress={() => onDeleteGroup(g.id)}
                    accessibilityLabel={`${DISPATCH_VEHICLE_TYPE_LABEL[g.vehicleType]} #${g.sequence} 그룹 삭제`}
                  >
                    <Text style={styles.groupDeleteBtnText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
              {slips.length === 0 ? (
                <Text style={styles.muted}>
                  슬립이 없습니다. [미배차 전표] 탭에서 슬립을 길게 눌러 할당하세요.
                </Text>
              ) : (
                slips.map((row) => {
                  const slipNo = getSlipDisplayNo(row.slip);
                  return (
                    <View key={row.id ?? row.slipId} style={styles.groupSlipRow}>
                      <Text style={styles.muted}>{row.sequence}.</Text>
                      <Text style={styles.slipNumberSmall}>{slipNo}</Text>
                      <Text style={styles.slipPartnerSmall}>{row.slip.partnerName}</Text>
                      {canEdit ? (
                        <TouchableOpacity
                          onPress={() => onRemoveSlip(g.id, row.slipId)}
                          accessibilityLabel={`${slipNo} 그룹에서 제거`}
                        >
                          <Text style={styles.removeText}>제거</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )}
              </View>
            );
          })
        )}
      </ScrollView>
      {/* Round C P1-3 — MODIFICATION_ACCEPTED 직접 편집 모델의 '수정 배차 완료' 구 라벨 제거.
          수정수락 후 재발송은 [재배차 시작](start-redispatch) → DRAFT 복귀 후 일반
          [배차 완료] 만 사용한다 (D-DMR-01 — BE 가 MODIFICATION_ACCEPTED 직접 발송을 409 차단). */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.completeBtn, !canDispatch && styles.actionBtnDisabled]}
          disabled={!canDispatch}
          onPress={onCompleteDispatch}
          accessibilityLabel="배차 완료 — 아로로지스 발송"
          testID="dispatch-board-mobile-complete"
        >
          <Text style={styles.completeBtnText}>✓ 배차 완료</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 작은 유틸 컴포넌트 — TabButton.
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      testID={testID}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function statusBadgeStyle(status: DispatchTaskStatus) {
  switch (status) {
    case 'DRAFT':
      return { backgroundColor: colors.surface.subtle };
    case 'DISPATCHING':
      return { backgroundColor: colors.state.infoBg };
    case 'DISPATCHED':
    case 'MODIFICATION_ACCEPTED':
    case 'CANCEL_ACCEPTED':
      return { backgroundColor: colors.state.successBg };
    case 'FAILED':
    case 'MODIFICATION_REJECTED':
    case 'CANCEL_REJECTED':
      return { backgroundColor: colors.state.dangerBg };
    case 'MODIFICATION_REQUESTED':
    case 'CANCEL_REQUESTED':
      // RN 토큰에 보라색이 없으므로 infoBg 위에 borderColor 로 구분.
      return { backgroundColor: colors.state.infoBg };
    case 'CANCELLED':
      return { backgroundColor: colors.surface.subtle };
    default:
      return { backgroundColor: colors.surface.subtle };
  }
}

// ---------------------------------------------------------------------------
// Styles.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
    backgroundColor: colors.surface.app,
  },
  muted: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  hint: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  errorMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
  },
  errorCard: {
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.state.dangerBg,
    borderRadius: radii.card,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.action.brand,
  },
  tabLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  tabLabelActive: {
    color: colors.action.brand,
    fontWeight: typography.fontWeight.semibold,
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  taskCode: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  statusBadge: {
    marginLeft: 'auto',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.button,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  failureBanner: {
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.state.dangerBg,
    borderRadius: radii.card,
  },
  failureText: {
    fontSize: typography.fontSize.sm,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  filterLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },

  // Slip list
  list: {
    padding: spacing[2],
    gap: spacing[2],
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    marginBottom: spacing[2],
  },
  slipNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  slipPartner: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  slipStatus: {
    fontSize: 11,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  empty: {
    padding: spacing[6],
    alignItems: 'center',
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    backgroundColor: colors.surface.card,
  },
  pageBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    backgroundColor: colors.surface.card,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },

  // Groups tab
  actionRow: {
    flexDirection: 'row',
    padding: spacing[3],
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    backgroundColor: colors.surface.subtle,
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.onPrimary,
    fontFamily: typography.fontFamily.sans,
  },
  groupCard: {
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.card,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  groupTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  groupDeleteBtn: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.state.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupDeleteBtnText: {
    fontSize: 16,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
  },
  driverText: {
    marginLeft: 'auto',
    fontSize: 11,
    color: colors.state.success,
    fontFamily: typography.fontFamily.sans,
  },
  groupSlipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
  slipNumberSmall: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  slipPartnerSmall: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  removeText: {
    fontSize: typography.fontSize.xs,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
  },

  // Bottom action
  bottomRow: {
    padding: spacing[3],
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
  completeBtn: {
    paddingVertical: spacing[3],
    backgroundColor: colors.state.success,
    borderRadius: radii.button,
    alignItems: 'center',
  },
  completeBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.onPrimary,
    fontFamily: typography.fontFamily.sans,
  },

  // Sheet (slip→group + add vehicle)
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing[4],
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    marginBottom: spacing[1],
  },
  sheetSub: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    marginBottom: spacing[3],
  },
  sheetBody: {
    maxHeight: 320,
  },
  sheetGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  sheetGroupLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  sheetCancel: {
    marginTop: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.button,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },

  // Vehicle add grid
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  vehicleCell: {
    width: '31%',
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    alignItems: 'center',
    backgroundColor: colors.surface.card,
  },
  vehicleCellText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },

  // Confirm dialog
  confirmDialog: {
    margin: spacing[6],
    padding: spacing[4],
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    alignSelf: 'center',
    width: '90%',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radii.button,
    alignItems: 'center',
  },
  confirmBtnCancel: {
    backgroundColor: colors.surface.subtle,
  },
  confirmBtnPrimary: {
    backgroundColor: colors.state.success,
  },
  confirmBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  confirmBtnTextPrimary: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
  },

  // Phase C banners + 요청 dialog
  acceptedBanner: {
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.state.successBg,
    borderRadius: radii.card,
  },
  acceptedBannerText: {
    fontSize: typography.fontSize.sm,
    color: colors.state.success,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.semibold,
  },
  pendingBanner: {
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: colors.state.infoBg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.state.info,
  },
  pendingBannerText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  requestLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    marginBottom: spacing[1],
  },
  requestReasonInput: {
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    padding: spacing[3],
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing[2],
  },
  requestBtnModification: {
    // arologis-teal Phase A 일관 — RN 토큰에 보라색이 없으므로 brand 컬러 활용.
    backgroundColor: colors.action.brand,
  },
  requestBtnCancellation: {
    backgroundColor: colors.state.danger,
  },
});
