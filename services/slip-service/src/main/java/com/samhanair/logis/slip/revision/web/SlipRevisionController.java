package com.samhanair.logis.slip.revision.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 전표 버전이력 REST endpoint — 권한 재편 Phase 2.1 Task 4.
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET  /slips/{slipId}/revisions} — 버전 타임라인 (최신 revision 우선) + changeSummary</li>
 *   <li>{@code POST /slips/{slipId}/revisions/{revisionNo}/restore} — 특정 revision 시점 복원</li>
 * </ul>
 *
 * <p>권한 매트릭스 (page = {@code slip.audit-revert}):
 * <ul>
 *   <li>목록 조회 — {@link PermissionAction#VIEW}</li>
 *   <li>복원 — {@link PermissionAction#RESTORE}</li>
 * </ul>
 *
 * <p>actor 추출 헤더 상수/규칙은 {@link com.samhanair.logis.slip.audit.web.SlipAuditLogController}
 * 와 정합한다 (X-User-Id / X-User-Name). UUID 비공개 가드: 목록 응답
 * {@link SlipRevisionResponse} 는 actorId 를 노출하지 않는다.
 *
 * <p>{@code @RequestMapping("/slips/{slipId}")} 기준 — gateway 가 {@code /api/v1} prefix 부여.
 * 응답 형식 = {@link ApiResponse} wrapper.
 */
@RestController
@RequestMapping("/slips/{slipId}")
@RequiredArgsConstructor
public class SlipRevisionController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final SlipRevisionService revisionService;
    private final SlipService slipService;

    /**
     * 전표 버전 타임라인 조회 — 최신 revision 우선, 각 항목에 직전 revision 대비 changeSummary 포함.
     *
     * @param slipId 대상 전표 UUID
     * @return revisionNo 내림차순 버전 목록 (changeSummary 포함)
     */
    @Operation(summary = "전표 버전이력 목록",
            description = "Phase 2.1 Task 4 — 버전 타임라인 (최신 우선) + 직전 대비 변경요약")
    @GetMapping("/revisions")
    @RequirePermission(page = "slip.audit-revert", action = PermissionAction.VIEW)
    public ApiResponse<List<SlipRevisionResponse>> listRevisions(@PathVariable UUID slipId) {
        return ApiResponse.ok(revisionService.listWithSummary(slipId));
    }

    /**
     * 전표를 특정 revision 시점 스냅샷으로 복원한다 (신규 RESTORE revision 으로 영원 추적).
     *
     * <p>actor 추출은 {@link com.samhanair.logis.slip.audit.web.SlipAuditLogController} 와 동일하게
     * X-User-Id / X-User-Name 헤더를 그대로 {@link SlipService#restoreToRevision} 에 위임한다
     * (UUID 파싱/actorName fallback 은 service 책임).
     *
     * @param slipId 대상 전표 UUID
     * @param revisionNo 복원할 시점의 revisionNo
     * @param callerId 호출자 UUID 문자열 (X-User-Id, 선택)
     * @param callerName 호출자 표시명 (X-User-Name, 선택)
     * @return 복원 후 전표 상세 응답
     */
    @Operation(summary = "전표 버전 복원",
            description = "Phase 2.1 Task 4 — 특정 revision 시점으로 복원. 복원도 신규 revision 으로 추적")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "복원 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립/revision 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "마감 lock")
    })
    @PostMapping("/revisions/{revisionNo}/restore")
    @RequirePermission(page = "slip.audit-revert", action = PermissionAction.RESTORE)
    public ApiResponse<SlipDetailResponse> restoreRevision(
            @PathVariable UUID slipId,
            @PathVariable int revisionNo,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(slipService.restoreToRevision(slipId, revisionNo, callerId, callerName));
    }
}
