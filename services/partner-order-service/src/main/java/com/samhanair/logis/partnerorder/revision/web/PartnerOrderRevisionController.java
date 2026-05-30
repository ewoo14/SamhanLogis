package com.samhanair.logis.partnerorder.revision.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRestoreResult;
import com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRestoreResponse;
import com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionDetailResponse;
import com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionResponse;
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
 * 거래처 주문 버전이력 REST endpoint — Phase 2.4 Task 7.
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET  /api/v1/partner-orders/{id}/revisions} — 버전 타임라인 (최신 우선) + changeSummary</li>
 *   <li>{@code GET  /api/v1/partner-orders/{id}/revisions/{no}} — 단일 스냅샷 상세</li>
 *   <li>{@code POST /api/v1/partner-orders/{id}/revisions/{no}/restore} — 특정 revision 시점 복원</li>
 * </ul>
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>목록/상세 조회 — {@code page = "sales.partner-order.history.view"},
 *       {@link PermissionAction#VIEW}</li>
 *   <li>복원 — {@code page = "sales.partner-order.revisions"},
 *       {@link PermissionAction#RESTORE}</li>
 * </ul>
 *
 * <p>page code 선택 근거:
 * <ul>
 *   <li>VIEW: {@code sales.partner-order.history.view} 는 V38 seed 에서 이미 전 역할(MASTER~DRIVER)
 *       에 {@code can_view=TRUE} 가 부여된 기존 page 다. 버전 타임라인 조회는 audit log 조회와
 *       동일 접근 레벨이므로 재사용한다 — 신규 page 추가를 최소화하는 설계서 권장 방침과 일치.</li>
 *   <li>RESTORE: 복원 작업은 주문 데이터를 변경하는 write 권한이므로, audit log 조회 전용인
 *       {@code history.view} 에 RESTORE action 을 얹으면 의미가 부적절해진다.
 *       신규 {@code sales.partner-order.revisions} page 를 분리해 RESTORE 권한을 독립 관리한다.
 *       V40 auth-service migration 으로 MASTER/MANAGER/SALES 역할에 RESTORE grant 시드 추가.</li>
 * </ul>
 *
 * <p>actor 추출은 X-User-Id / X-User-Name 헤더를 그대로 service 에 위임한다. UUID 비공개 가드:
 * 응답 DTO ({@link PartnerOrderRevisionResponse}, {@link PartnerOrderRevisionDetailResponse}) 는
 * actorId 를 노출하지 않는다.
 *
 * <p>{@code @RequestMapping("/api/v1/partner-orders/{id}")} 기준 — 기존 컨트롤러와 동일 prefix.
 * 게이트웨이 StripPrefix 정책상 {@code /api/v1} 은 서비스 내부 경로에 포함된다
 * ({@link com.samhanair.logis.partnerorder.audit.web.PartnerOrderAuditLogController} 확인).
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.web.EstimateRevisionController} 미러.
 */
@RestController
@RequestMapping("/api/v1/partner-orders/{id}")
@RequiredArgsConstructor
public class PartnerOrderRevisionController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final PartnerOrderRevisionService revisionService;

    /**
     * 거래처 주문 버전 타임라인 조회 — 최신 revision 우선, 각 항목에 직전 revision 대비 changeSummary 포함.
     *
     * @param id 대상 거래처 주문 UUID (경로 변수)
     * @return revisionNo 내림차순 버전 목록 (changeSummary 포함)
     */
    @Operation(summary = "거래처 주문 버전이력 목록",
            description = "Phase 2.4 Task 7 — 버전 타임라인 (최신 우선) + 직전 대비 변경요약 (changeSummary)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping("/revisions")
    @RequirePermission(page = "sales.partner-order.history.view", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerOrderRevisionResponse>> listRevisions(
            @PathVariable UUID id) {
        return ApiResponse.ok(revisionService.listWithSummary(id));
    }

    /**
     * 거래처 주문 특정 revision 단일 스냅샷 상세 조회.
     *
     * @param id  대상 거래처 주문 UUID (경로 변수)
     * @param no  조회할 버전 번호 (경로 변수)
     * @return 단일 스냅샷 헤더 + 라인 상세
     */
    @Operation(summary = "거래처 주문 버전이력 단일 스냅샷",
            description = "Phase 2.4 Task 7 — 특정 revisionNo 의 헤더+라인 full-snapshot 조회")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "revision 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping("/revisions/{no}")
    @RequirePermission(page = "sales.partner-order.history.view", action = PermissionAction.VIEW)
    public ApiResponse<PartnerOrderRevisionDetailResponse> getRevision(
            @PathVariable UUID id,
            @PathVariable int no) {
        return ApiResponse.ok(revisionService.getRevisionDetail(id, no));
    }

    /**
     * 거래처 주문을 특정 revision 시점 스냅샷으로 복원한다 (신규 RESTORE revision 으로 영구 추적).
     *
     * <p>복원 허용 상태: DRAFT / CONFIRMED (제외목록 방식).
     * CONFIRMING / CANCELED → 409 CONFLICT.
     *
     * <p>CONFIRMED 상태 주문을 복원한 경우, 응답 {@code slipResyncRequired=true} 로
     * 연결 출고전표 재발행 여부를 담당자에게 안내한다.
     *
     * <p>actor 추출은 X-User-Id / X-User-Name 헤더를 그대로
     * {@link PartnerOrderRevisionService#restore} 에 위임한다.
     * UUID 파싱/actorName 비공개 가드는 service 책임.
     *
     * @param id         대상 거래처 주문 UUID (경로 변수)
     * @param no         복원할 시점의 revisionNo (경로 변수)
     * @param callerId   호출자 UUID 문자열 (X-User-Id, 선택)
     * @param callerName 호출자 표시명 (X-User-Name, 선택)
     * @return 복원 후 주문 상세 + slipResyncRequired 플래그 ({@link PartnerOrderRestoreResponse})
     */
    @Operation(summary = "거래처 주문 버전 복원",
            description = "Phase 2.4 복원 가드 정책 변경 — DRAFT/CONFIRMED 허용, CONFIRMING/CANCELED 거부. "
                    + "CONFIRMED 복원 시 slipResyncRequired=true 반환. 복원도 신규 RESTORE revision 으로 추적")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "복원 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "주문 또는 revision 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "CONFIRMING/CANCELED 상태(복원 불가) 또는 동시 채번 충돌"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @PostMapping("/revisions/{no}/restore")
    @RequirePermission(page = "sales.partner-order.revisions", action = PermissionAction.RESTORE)
    public ApiResponse<PartnerOrderRestoreResponse> restoreRevision(
            @PathVariable UUID id,
            @PathVariable int no,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {

        UUID actorId = callerId != null ? tryParseUuid(callerId) : null;
        PartnerOrderRestoreResult result = revisionService.restore(id, no, actorId, callerName, null);
        return ApiResponse.ok(PartnerOrderRestoreResponse.from(result));
    }

    /**
     * 문자열을 UUID 로 변환한다. 파싱 실패 시 null 을 반환한다 (비-UUID 문자열 안전 처리).
     */
    private static UUID tryParseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
