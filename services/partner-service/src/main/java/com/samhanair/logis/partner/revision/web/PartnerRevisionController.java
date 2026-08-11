package com.samhanair.logis.partner.revision.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.revision.service.PartnerRevisionService;
import com.samhanair.logis.partner.revision.web.dto.PartnerRevisionResponse;
import com.samhanair.logis.partner.tab.dto.PartnerFullResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
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
 * 거래처 버전이력 REST endpoint — 권한 재편 Phase 2.3 Task 4.
 *
 * <p>endpoint ({@code @RequestMapping("/api/v1/partners/{partnerCode}")} 기준,
 * {@link com.samhanair.logis.partner.tab.web.Partner4TabController} prefix 일관):
 * <ul>
 *   <li>{@code GET  /revisions} — 버전 타임라인 (최신 우선) + changeSummary</li>
 *   <li>{@code POST /revisions/{revisionNo}/restore} — 특정 revision 시점 복원</li>
 * </ul>
 *
 * <p>권한 매트릭스 (page = {@code partners.4tab.edit}):
 * <ul>
 *   <li>목록 조회 — {@link PermissionAction#VIEW}</li>
 *   <li>복원 — {@link PermissionAction#RESTORE}</li>
 * </ul>
 *
 * <p><b>partnerCode → partnerId 해석</b>: 거래처 도메인은 화면/URL 에 비즈니스 식별자(partnerCode)만
 * 노출하고 UUID 는 비공개한다 ({@code feedback_uuid_no_user_visibility}). 본 controller 는 path 의
 * partnerCode 를 {@link PartnerRepository#findByPartnerCode}로 partnerId(UUID) 로 변환한 뒤 service 에
 * 위임한다 — service 계층은 partnerId(UUID) 만 다룬다 (Task 2/3 일관). 미존재 시 404 NOT_FOUND.
 *
 * <p>actor 추출은 X-User-Id / X-User-Name / X-User-Color 헤더에서 한다 — actorId 는 UUID 파싱
 * 실패 시 system UUID(0,0) 폴백 (legacy employeeCode 대비), actorName/actorColor 는 그대로 전달한다.
 * 목록 응답 {@link PartnerRevisionResponse} 는 actorId 를 노출하지 않는다.
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.web.EstimateRevisionController} 미러
 * (estimateId(UUID path)→partnerCode(path)+partnerId 해석).
 */
@RestController
@RequestMapping("/api/v1/partners/{partnerCode}")
@RequiredArgsConstructor
public class PartnerRevisionController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final String CALLER_COLOR_HEADER = "X-User-Color";

    /** actor UUID 파싱 실패/미상 시 폴백 (Partner4TabService SYSTEM_ACTOR_ID 동형). */
    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);

    private final PartnerRevisionService revisionService;
    private final PartnerRepository partnerRepository;

    /**
     * 거래처 버전 타임라인 조회 — 최신 revision 우선, 각 항목에 직전 revision 대비 changeSummary 포함.
     *
     * @param partnerCode 대상 거래처 코드
     * @return revisionNo 내림차순 버전 목록 (changeSummary 포함)
     */
    @Operation(summary = "거래처 버전이력 목록",
            description = "Phase 2.3 Task 4 — 버전 타임라인 (최신 우선) + 직전 대비 변경요약")
    @GetMapping("/revisions")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerRevisionResponse>> listRevisions(
            @PathVariable String partnerCode) {
        UUID partnerId = resolvePartnerId(partnerCode);
        return ApiResponse.ok(revisionService.listWithSummary(partnerId));
    }

    /**
     * 거래처를 특정 revision 시점 스냅샷으로 복원한다 (복원도 신규 RESTORE revision 으로 추적).
     *
     * @param partnerCode 대상 거래처 코드
     * @param revisionNo 복원할 시점의 revisionNo
     * @param callerId 호출자 UUID 문자열 (X-User-Id, 선택)
     * @param callerName 호출자 표시명 (X-User-Name, 선택)
     * @param callerColor 호출자 색상 hex (X-User-Color, 선택)
     * @return 복원 후 거래처 4탭 전체 응답
     */
    @Operation(summary = "거래처 버전 복원",
            description = "Phase 2.3 Task 4 — 특정 revision 시점으로 복원. 복원도 신규 revision 으로 추적")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "복원 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처/revision 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "거래종료(TERMINATED) 거래처")
    })
    @PostMapping("/revisions/{revisionNo}/restore")
    @RequirePermission(page = "partners.4tab.edit", action = PermissionAction.RESTORE)
    public ApiResponse<PartnerFullResponse> restoreRevision(
            @PathVariable String partnerCode,
            @PathVariable int revisionNo,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName,
            @RequestHeader(value = CALLER_COLOR_HEADER, required = false) String callerColor) {
        UUID partnerId = resolvePartnerId(partnerCode);
        UUID actorId = parseActorId(callerId);
        String actorName = resolveName(callerId, callerName);
        return ApiResponse.ok(
                revisionService.restore(partnerId, revisionNo, actorId, actorName, callerColor));
    }

    /**
     * partnerCode 를 partnerId(UUID) 로 해석한다 (UUID 비공개 가드 — service 는 UUID 만 다룸).
     *
     * @throws BusinessException(NOT_FOUND) 거래처 미존재
     */
    private UUID resolvePartnerId(String partnerCode) {
        Partner partner = partnerRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처를 찾을 수 없습니다: " + partnerCode));
        return partner.getId();
    }

    /**
     * 감사용 actor UUID 파싱. X-User-Id 가 UUID 가 아닌 legacy employeeCode 등이면 system UUID(0,0)
     * 로 폴백한다 (revision actorId 일관성, Partner4TabService 동형).
     */
    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return SYSTEM_ACTOR_ID;
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return SYSTEM_ACTOR_ID;
        }
    }

    /**
     * actorName 결정 — X-User-Name 우선, 없으면 X-User-Id 문자열, 둘 다 없으면 null.
     */
    private String resolveName(String callerId, String callerName) {
        return ActorDisplayName.resolveNullable(callerId, callerName);
    }
}
