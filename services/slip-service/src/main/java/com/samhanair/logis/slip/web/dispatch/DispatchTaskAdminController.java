package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.DynamicPermissionClient;
import com.samhanair.logis.slip.dto.dispatch.AddVehicleGroupRequest;
import com.samhanair.logis.slip.dto.dispatch.AssignSlipToGroupRequest;
import com.samhanair.logis.slip.dto.dispatch.CreateDispatchTaskRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskResponse;
import com.samhanair.logis.slip.dto.dispatch.DispatchVehicleGroupResponse;
import com.samhanair.logis.slip.dto.dispatch.DispatchVehicleGroupSlipResponse;
import com.samhanair.logis.slip.dto.dispatch.ReorderSlipsRequest;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskCancellationRequestService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskCompletionService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskModificationRequestService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배차 메뉴 우측 패널 — DispatchTask + VehicleGroup + Slip 매핑 CRUD + dispatch trigger (BE Task B11).
 *
 * <p>SP-D3 동적 권한 이중 가드:
 * <ul>
 *   <li>{@code dispatch.board} 페이지 코드 — 모든 WRITE (POST/PUT/DELETE) 에 EDIT 가드 적용</li>
 *   <li>canEdit=false + canView=true → 403 (view-only override)</li>
 *   <li>canEdit=false + canView=false → fallback 통과</li>
 * </ul>
 */
@Slf4j
@Tag(name = "Dispatch Task (Admin)")
@RestController
@RequestMapping("/admin/dispatch-tasks")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('ROLE_DISPATCH','ROLE_MANAGER','ROLE_MASTER')")
public class DispatchTaskAdminController {

    /** SP-D3 — 배차 보드 페이지 코드. */
    private static final String DISPATCH_BOARD_PAGE_CODE = "dispatch.board";

    private final DispatchTaskService taskService;
    private final DispatchTaskCompletionService completionService;
    private final DispatchTaskModificationRequestService modificationRequestService;
    private final DispatchTaskCancellationRequestService cancellationRequestService;
    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * DispatchTask 생성 (DRAFT).
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "DispatchTask 생성 (DRAFT)")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DispatchTaskResponse create(@Valid @RequestBody CreateDispatchTaskRequest req,
                                       @RequestHeader(value = "X-User-Id", required = false) String actor,
                                       @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        return DispatchTaskResponse.from(taskService.createTask(req.dispatchDate()));
    }

    /**
     * 차량 그룹 추가.
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "차량 그룹 추가")
    @PostMapping("/{taskId}/vehicle-groups")
    @ResponseStatus(HttpStatus.CREATED)
    public DispatchVehicleGroupResponse addGroup(
            @PathVariable UUID taskId,
            @Valid @RequestBody AddVehicleGroupRequest req,
            @RequestHeader(value = "X-User-Id", required = false) String actor,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        return DispatchVehicleGroupResponse.from(taskService.addVehicleGroup(taskId, req.vehicleType()));
    }

    /**
     * 차량 그룹 삭제.
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "차량 그룹 삭제")
    @DeleteMapping("/{taskId}/vehicle-groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeGroup(@PathVariable UUID taskId,
                            @PathVariable UUID groupId,
                            @RequestHeader(value = "X-User-Id", required = false) String actor,
                            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        taskService.removeVehicleGroup(taskId, groupId, actor != null ? actor : "system");
    }

    /**
     * 그룹에 slip 추가.
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "그룹에 slip 추가")
    @PostMapping("/{taskId}/vehicle-groups/{groupId}/slips")
    @ResponseStatus(HttpStatus.CREATED)
    public DispatchVehicleGroupSlipResponse assignSlip(
            @PathVariable UUID taskId,
            @PathVariable UUID groupId,
            @Valid @RequestBody AssignSlipToGroupRequest req,
            @RequestHeader(value = "X-User-Id", required = false) String actor,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        return DispatchVehicleGroupSlipResponse.from(taskService.assignSlip(taskId, groupId, req.slipId()));
    }

    /**
     * 그룹 내 slip 순서 재정렬.
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "그룹 내 slip 순서 재정렬")
    @PutMapping("/{taskId}/vehicle-groups/{groupId}/slips/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorderSlips(@PathVariable UUID taskId,
                             @PathVariable UUID groupId,
                             @Valid @RequestBody ReorderSlipsRequest req,
                             @RequestHeader(value = "X-User-Id", required = false) String actor,
                             @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        taskService.reorderSlips(groupId, req.orderedSlipIds());
    }

    /**
     * 그룹에서 slip 제거.
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "그룹에서 slip 제거")
    @DeleteMapping("/{taskId}/vehicle-groups/{groupId}/slips/{slipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeSlip(@PathVariable UUID taskId,
                           @PathVariable UUID groupId,
                           @PathVariable UUID slipId,
                           @RequestHeader(value = "X-User-Id", required = false) String actor,
                           @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        taskService.removeSlipFromGroup(groupId, slipId, actor != null ? actor : "system");
    }

    /**
     * 배차 완료 trigger (DRAFT → DISPATCHING → arologis 발송).
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "배차 완료 trigger (DRAFT → DISPATCHING → arologis 발송)")
    @PostMapping("/{taskId}/dispatch")
    public DispatchTaskResponse dispatch(@PathVariable UUID taskId,
                                         @RequestHeader(value = "X-User-Id", required = false) String actor,
                                         @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        return DispatchTaskResponse.from(completionService.dispatch(taskId));
    }

    // ---------- Phase C (배차 수정/취소 요청, D-DC-02 / D-DC-07) ----------

    /**
     * 배차 수정 요청 발송 (DISPATCHED → MODIFICATION_REQUESTED).
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "배차 수정 요청 발송 (DISPATCHED → MODIFICATION_REQUESTED)",
            description = "DISPATCHED 상태의 DispatchTask 에 대해 아로로지스로 수정 요청을 발송. " +
                    "권한 = ROLE_DISPATCH / ROLE_MANAGER / ROLE_MASTER (D-DC-07).")
    @PostMapping("/{taskId}/modification-request")
    public DispatchTaskResponse requestModification(
            @PathVariable UUID taskId,
            @Valid @RequestBody ModificationRequestBody req,
            @RequestHeader(value = "X-User-Id", required = false) String actor,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        String actorOrSystem = actor != null ? actor : "system";
        return DispatchTaskResponse.from(
                modificationRequestService.request(taskId, req.reason(), actorOrSystem));
    }

    /**
     * 배차 취소 요청 발송 (DISPATCHED → CANCEL_REQUESTED).
     *
     * <p>SP-D3 동적 권한 EDIT 가드 — dispatch.board 페이지 코드 적용.
     */
    @Operation(summary = "배차 취소 요청 발송 (DISPATCHED → CANCEL_REQUESTED)",
            description = "DISPATCHED 상태의 DispatchTask 에 대해 아로로지스로 취소 요청을 발송.")
    @PostMapping("/{taskId}/cancellation-request")
    public DispatchTaskResponse requestCancellation(
            @PathVariable UUID taskId,
            @Valid @RequestBody CancellationRequestBody req,
            @RequestHeader(value = "X-User-Id", required = false) String actor,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        // SP-D3 동적 권한 EDIT 가드 — dispatch.board
        checkEditPermission(roleHeader);
        String actorOrSystem = actor != null ? actor : "system";
        return DispatchTaskResponse.from(
                cancellationRequestService.request(taskId, req.reason(), actorOrSystem));
    }

    /** 수정 요청 body — 사유 (선택, 0~500자). */
    public record ModificationRequestBody(@Size(max = 500) String reason) {}

    /** 취소 요청 body — 사유 (선택, 0~500자). */
    public record CancellationRequestBody(@Size(max = 500) String reason) {}

    // =========================================================================
    // SP-D3 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D3 동적 EDIT 권한 검증 — dispatch.board 페이지 코드.
     *
     * <p>actorRole null/blank 이면 건너뜀.
     * canEdit=false + canView=true 이면 명시적 deny → 403 (view-only override).
     * canEdit=false + canView=false 이면 override row 없음(fallback) → 통과.
     *
     * @param actorRole 요청자 role (X-User-Role header)
     */
    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, DISPATCH_BOARD_PAGE_CODE);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, DISPATCH_BOARD_PAGE_CODE);
            if (canView) {
                log.warn("[SP-D3] 동적 권한 차단 (view-only override) — roleCode={} pageCode={}",
                        actorRole, DISPATCH_BOARD_PAGE_CODE);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 배차 작업 편집 권한이 차단되었습니다.");
            }
            log.debug("[SP-D3] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={}",
                    actorRole, DISPATCH_BOARD_PAGE_CODE);
        }
    }
}
