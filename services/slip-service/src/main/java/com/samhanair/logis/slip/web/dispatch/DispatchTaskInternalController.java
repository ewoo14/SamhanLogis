package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.slip.dto.dispatch.DispatchTaskCancellationAcceptedRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskCancellationRejectedRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskConfirmRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskModificationAcceptedRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskModificationRejectedRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskUnavailableRequest;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskCancellationDecisionService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskConfirmService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskModificationDecisionService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskUnavailableService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * arologis → Samhan Public 회신 receive — BE Task B11 (Phase A) + B6 (Phase C).
 *
 * <p>X-Internal-Token (shared/security 의 InternalTokenFilter) 으로 ROLE_MASTER 부여 →
 * {@code @PreAuthorize("hasAuthority('ROLE_MASTER')")} 가드.
 *
 * <p>endpoint (Phase A):
 * <ul>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/confirm — 매칭 완료</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/unavailable — 매칭 불가</li>
 * </ul>
 *
 * <p>endpoint (Phase C — 수정/취소 회신, D-DC-04 ~ D-DC-06):
 * <ul>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/modification-accepted</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/modification-rejected</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/cancellation-accepted</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/cancellation-rejected</li>
 * </ul>
 */
@Tag(name = "Dispatch Task (Internal, arologis 회신 receive)")
@RestController
@RequestMapping("/internal/slip/dispatch-tasks")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_MASTER')")
public class DispatchTaskInternalController {

    private static final String AROLOGIS_ACTOR = "arologis-service";

    private final DispatchTaskConfirmService confirmService;
    private final DispatchTaskUnavailableService unavailableService;
    private final DispatchTaskModificationDecisionService modificationDecisionService;
    private final DispatchTaskCancellationDecisionService cancellationDecisionService;

    @Operation(summary = "arologis 매칭 완료 회신 receive")
    @PostMapping("/{taskId}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirm(@PathVariable UUID taskId,
                        @Valid @RequestBody DispatchTaskConfirmRequest req) {
        confirmService.confirm(taskId, req);
    }

    @Operation(summary = "arologis 매칭 불가 회신 receive")
    @PostMapping("/{taskId}/unavailable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unavailable(@PathVariable UUID taskId,
                            @Valid @RequestBody DispatchTaskUnavailableRequest req) {
        unavailableService.unavailable(taskId, req);
    }

    // ---------- Phase C 회신 endpoint 4종 ----------

    @Operation(summary = "arologis 수정 수락 회신 receive (Phase C)",
            description = "MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED.")
    @PostMapping("/{taskId}/modification-accepted")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void modificationAccepted(@PathVariable UUID taskId,
                                       @Valid @RequestBody DispatchTaskModificationAcceptedRequest req) {
        modificationDecisionService.accept(taskId, AROLOGIS_ACTOR);
    }

    @Operation(summary = "arologis 수정 거부 회신 receive (Phase C)",
            description = "MODIFICATION_REQUESTED → MODIFICATION_REJECTED + rejectionReason.")
    @PostMapping("/{taskId}/modification-rejected")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void modificationRejected(@PathVariable UUID taskId,
                                       @Valid @RequestBody DispatchTaskModificationRejectedRequest req) {
        modificationDecisionService.reject(taskId, req.rejectionReason(), AROLOGIS_ACTOR);
    }

    @Operation(summary = "arologis 취소 수락 회신 receive (Phase C)",
            description = "CANCEL_REQUESTED → CANCEL_ACCEPTED → CANCELLED + slip UNDISPATCHED 복귀.")
    @PostMapping("/{taskId}/cancellation-accepted")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancellationAccepted(@PathVariable UUID taskId,
                                       @Valid @RequestBody DispatchTaskCancellationAcceptedRequest req) {
        cancellationDecisionService.accept(taskId, AROLOGIS_ACTOR);
    }

    @Operation(summary = "arologis 취소 거부 회신 receive (Phase C)",
            description = "CANCEL_REQUESTED → CANCEL_REJECTED + rejectionReason.")
    @PostMapping("/{taskId}/cancellation-rejected")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancellationRejected(@PathVariable UUID taskId,
                                       @Valid @RequestBody DispatchTaskCancellationRejectedRequest req) {
        cancellationDecisionService.reject(taskId, req.rejectionReason(), AROLOGIS_ACTOR);
    }
}
