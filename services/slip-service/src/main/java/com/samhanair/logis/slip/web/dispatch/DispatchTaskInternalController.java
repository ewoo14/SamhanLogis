package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.slip.dto.dispatch.DispatchTaskConfirmRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskUnavailableRequest;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskConfirmService;
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
 * arologis → Samhan Public 회신 receive — BE Task B11.
 *
 * <p>X-Internal-Token (shared/security 의 InternalTokenFilter) 으로 ROLE_MASTER 부여 →
 * {@code @PreAuthorize("hasAuthority('ROLE_MASTER')")} 가드.
 *
 * <p>endpoint:
 * <ul>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/confirm — 매칭 완료</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/unavailable — 매칭 불가</li>
 * </ul>
 */
@Tag(name = "Dispatch Task (Internal, arologis 회신 receive)")
@RestController
@RequestMapping("/internal/slip/dispatch-tasks")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_MASTER')")
public class DispatchTaskInternalController {

    private final DispatchTaskConfirmService confirmService;
    private final DispatchTaskUnavailableService unavailableService;

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
}
