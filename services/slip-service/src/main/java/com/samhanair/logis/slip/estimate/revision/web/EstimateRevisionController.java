package com.samhanair.logis.slip.estimate.revision.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService;
import com.samhanair.logis.slip.estimate.revision.web.dto.EstimateRevisionResponse;
import com.samhanair.logis.slip.estimate.service.EstimateService;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
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
 * 견적 버전이력 REST endpoint — 권한 재편 Phase 2.2 Task 4.
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET  /slips/estimates/{estimateId}/revisions} — 버전 타임라인 (최신 우선) + changeSummary</li>
 *   <li>{@code POST /slips/estimates/{estimateId}/revisions/{revisionNo}/restore} — 특정 revision 시점 복원</li>
 * </ul>
 *
 * <p>권한 매트릭스 (page = {@code estimates.list}):
 * <ul>
 *   <li>목록 조회 — {@link PermissionAction#VIEW}</li>
 *   <li>복원 — {@link PermissionAction#RESTORE}</li>
 * </ul>
 *
 * <p>actor 추출은 X-User-Id / X-User-Name 헤더를 그대로 service 에 위임한다. UUID 비공개 가드:
 * 목록 응답 {@link EstimateRevisionResponse} 는 actorId 를 노출하지 않는다.
 *
 * <p>{@code @RequestMapping("/slips/estimates/{estimateId}")} 기준 — gateway 가 {@code /api/v1}
 * prefix 부여. 응답 형식 = {@link ApiResponse} wrapper.
 *
 * <p>{@link com.samhanair.logis.slip.revision.web.SlipRevisionController} 미러.
 */
@RestController
@RequestMapping("/slips/estimates/{estimateId}")
@RequiredArgsConstructor
public class EstimateRevisionController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final EstimateRevisionService revisionService;
    private final EstimateService estimateService;

    /**
     * 견적 버전 타임라인 조회 — 최신 revision 우선, 각 항목에 직전 revision 대비 changeSummary 포함.
     *
     * @param estimateId 대상 견적 UUID
     * @return revisionNo 내림차순 버전 목록 (changeSummary 포함)
     */
    @Operation(summary = "견적 버전이력 목록",
            description = "Phase 2.2 Task 4 — 버전 타임라인 (최신 우선) + 직전 대비 변경요약")
    @GetMapping("/revisions")
    @RequirePermission(page = "estimates.list", action = PermissionAction.VIEW)
    public ApiResponse<List<EstimateRevisionResponse>> listRevisions(
            @PathVariable String estimateId) {
        return ApiResponse.ok(revisionService.listWithSummary(estimateService.resolveId(estimateId)));
    }

    /**
     * 견적을 특정 revision 시점 스냅샷으로 복원한다 (신규 RESTORE revision 으로 영원 추적).
     *
     * <p>actor 추출은 X-User-Id / X-User-Name 헤더를 그대로
     * {@link EstimateService#restoreToRevision} 에 위임한다 (UUID 파싱/actorName fallback 은
     * service 책임).
     *
     * @param estimateId 대상 견적 UUID
     * @param revisionNo 복원할 시점의 revisionNo
     * @param callerId 호출자 UUID 문자열 (X-User-Id, 선택)
     * @param callerName 호출자 표시명 (X-User-Name, 선택)
     * @return 복원 후 견적 상세 응답
     */
    @Operation(summary = "견적 버전 복원",
            description = "Phase 2.2 Task 4 — 특정 revision 시점으로 복원. 복원도 신규 revision 으로 추적")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "복원 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "견적/revision 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "편집 불가 단계")
    })
    @PostMapping("/revisions/{revisionNo}/restore")
    @RequirePermission(page = "estimates.list", action = PermissionAction.RESTORE)
    public ApiResponse<EstimateDetailResponse> restoreRevision(
            @PathVariable String estimateId,
            @PathVariable int revisionNo,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(
                estimateService.restoreToRevision(estimateService.resolveId(estimateId), revisionNo, callerId, callerName));
    }
}
