package com.samhanair.logis.slip.web.dispatch;

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
 */
@Tag(name = "Dispatch Task (Admin)")
@RestController
@RequestMapping("/admin/dispatch-tasks")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('ROLE_DISPATCH','ROLE_MANAGER','ROLE_MASTER')")
public class DispatchTaskAdminController {

    private final DispatchTaskService taskService;
    private final DispatchTaskCompletionService completionService;
    private final DispatchTaskModificationRequestService modificationRequestService;
    private final DispatchTaskCancellationRequestService cancellationRequestService;

    @Operation(summary = "DispatchTask 생성 (DRAFT)")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DispatchTaskResponse create(@Valid @RequestBody CreateDispatchTaskRequest req,
                                       @RequestHeader(value = "X-User-Id", required = false) String actor) {
        return DispatchTaskResponse.from(taskService.createTask(req.dispatchDate()));
    }

    @Operation(summary = "차량 그룹 추가")
    @PostMapping("/{taskId}/vehicle-groups")
    @ResponseStatus(HttpStatus.CREATED)
    public DispatchVehicleGroupResponse addGroup(
            @PathVariable UUID taskId,
            @Valid @RequestBody AddVehicleGroupRequest req,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        return DispatchVehicleGroupResponse.from(taskService.addVehicleGroup(taskId, req.vehicleType()));
    }

    @Operation(summary = "차량 그룹 삭제")
    @DeleteMapping("/{taskId}/vehicle-groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeGroup(@PathVariable UUID taskId,
                            @PathVariable UUID groupId,
                            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        taskService.removeVehicleGroup(taskId, groupId, actor != null ? actor : "system");
    }

    @Operation(summary = "그룹에 slip 추가")
    @PostMapping("/{taskId}/vehicle-groups/{groupId}/slips")
    @ResponseStatus(HttpStatus.CREATED)
    public DispatchVehicleGroupSlipResponse assignSlip(
            @PathVariable UUID taskId,
            @PathVariable UUID groupId,
            @Valid @RequestBody AssignSlipToGroupRequest req,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        return DispatchVehicleGroupSlipResponse.from(taskService.assignSlip(taskId, groupId, req.slipId()));
    }

    @Operation(summary = "그룹 내 slip 순서 재정렬")
    @PutMapping("/{taskId}/vehicle-groups/{groupId}/slips/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorderSlips(@PathVariable UUID taskId,
                             @PathVariable UUID groupId,
                             @Valid @RequestBody ReorderSlipsRequest req,
                             @RequestHeader(value = "X-User-Id", required = false) String actor) {
        taskService.reorderSlips(groupId, req.orderedSlipIds());
    }

    @Operation(summary = "그룹에서 slip 제거")
    @DeleteMapping("/{taskId}/vehicle-groups/{groupId}/slips/{slipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeSlip(@PathVariable UUID taskId,
                           @PathVariable UUID groupId,
                           @PathVariable UUID slipId,
                           @RequestHeader(value = "X-User-Id", required = false) String actor) {
        taskService.removeSlipFromGroup(groupId, slipId, actor != null ? actor : "system");
    }

    @Operation(summary = "배차 완료 trigger (DRAFT → DISPATCHING → arologis 발송)")
    @PostMapping("/{taskId}/dispatch")
    public DispatchTaskResponse dispatch(@PathVariable UUID taskId,
                                         @RequestHeader(value = "X-User-Id", required = false) String actor) {
        return DispatchTaskResponse.from(completionService.dispatch(taskId));
    }

    // ---------- Phase C (배차 수정/취소 요청, D-DC-02 / D-DC-07) ----------

    @Operation(summary = "배차 수정 요청 발송 (DISPATCHED → MODIFICATION_REQUESTED)",
            description = "DISPATCHED 상태의 DispatchTask 에 대해 아로로지스로 수정 요청을 발송. " +
                    "권한 = ROLE_DISPATCH / ROLE_MANAGER / ROLE_MASTER (D-DC-07).")
    @PostMapping("/{taskId}/modification-request")
    public DispatchTaskResponse requestModification(
            @PathVariable UUID taskId,
            @Valid @RequestBody ModificationRequestBody req,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        String actorOrSystem = actor != null ? actor : "system";
        return DispatchTaskResponse.from(
                modificationRequestService.request(taskId, req.reason(), actorOrSystem));
    }

    @Operation(summary = "배차 취소 요청 발송 (DISPATCHED → CANCEL_REQUESTED)",
            description = "DISPATCHED 상태의 DispatchTask 에 대해 아로로지스로 취소 요청을 발송.")
    @PostMapping("/{taskId}/cancellation-request")
    public DispatchTaskResponse requestCancellation(
            @PathVariable UUID taskId,
            @Valid @RequestBody CancellationRequestBody req,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        String actorOrSystem = actor != null ? actor : "system";
        return DispatchTaskResponse.from(
                cancellationRequestService.request(taskId, req.reason(), actorOrSystem));
    }

    /** 수정 요청 body — 사유 (선택, 0~500자). */
    public record ModificationRequestBody(@Size(max = 500) String reason) {}

    /** 취소 요청 body — 사유 (선택, 0~500자). */
    public record CancellationRequestBody(@Size(max = 500) String reason) {}
}
