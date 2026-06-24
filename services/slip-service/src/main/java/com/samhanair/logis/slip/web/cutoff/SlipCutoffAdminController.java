package com.samhanair.logis.slip.web.cutoff;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.dto.cutoff.CreateSlipCutoffRequest;
import com.samhanair.logis.slip.dto.cutoff.DeliveryTagOption;
import com.samhanair.logis.slip.dto.cutoff.SlipCutoffResponse;
import com.samhanair.logis.slip.dto.cutoff.UpdateSlipCutoffRequest;
import com.samhanair.logis.slip.service.cutoff.SlipOutboundCutoffService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 출고전표 마감시각 설정 admin API.
 *
 * <p>인사(HR) 메뉴 "출고 마감시간 설정" 화면의 CRUD 엔드포인트를 제공한다.
 * page-code {@code hr.slip-cutoff}, 권한 MASTER/MANAGER(account-mode) 적용.
 *
 * <p>UUID 는 라우팅 내부용이며 사용자 화면 식별자는 배송태그 한국어 라벨이다
 * (feedback_uuid_no_user_visibility 가드).
 */
@RestController
@RequestMapping("/admin/slip-cutoffs")
@RequiredArgsConstructor
public class SlipCutoffAdminController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipOutboundCutoffService service;

    /**
     * 출고 마감시각 목록 조회. 태그 이름 오름차순 정렬.
     *
     * @return 마감시각 목록
     */
    @GetMapping
    @RequirePermission(page = SlipCutoffPageCodes.HR_SLIP_CUTOFF, action = PermissionAction.VIEW)
    public ApiResponse<List<SlipCutoffResponse>> list() {
        return ApiResponse.ok(service.list());
    }

    /**
     * OUTBOUND 방향 배송태그 목록 조회 — FE 드롭다운 바인딩용.
     *
     * @return OUTBOUND 배송태그 옵션 목록
     */
    @GetMapping("/delivery-tags")
    @RequirePermission(page = SlipCutoffPageCodes.HR_SLIP_CUTOFF, action = PermissionAction.VIEW)
    public ApiResponse<List<DeliveryTagOption>> availableOutboundTags() {
        return ApiResponse.ok(service.availableOutboundTags());
    }

    /**
     * 출고 마감시각 신규 등록.
     *
     * @param request 등록 요청 (deliveryTag + cutoffTime 필수)
     * @return 등록된 마감시각 응답
     */
    @PostMapping
    @RequirePermission(page = SlipCutoffPageCodes.HR_SLIP_CUTOFF, action = PermissionAction.CREATE)
    public ApiResponse<SlipCutoffResponse> create(
            @Valid @RequestBody CreateSlipCutoffRequest request
    ) {
        return ApiResponse.ok(service.create(request));
    }

    /**
     * 출고 마감시각 부분 수정.
     *
     * @param id      마감시각 UUID (내부 라우팅용)
     * @param request 수정 요청 (null 필드는 미변경)
     * @return 수정된 마감시각 응답
     */
    @PatchMapping("/{id}")
    @RequirePermission(page = SlipCutoffPageCodes.HR_SLIP_CUTOFF, action = PermissionAction.UPDATE)
    public ApiResponse<SlipCutoffResponse> update(
            @PathVariable UUID id,
            @RequestBody UpdateSlipCutoffRequest request
    ) {
        return ApiResponse.ok(service.update(id, request));
    }

    /**
     * 출고 마감시각 soft-delete.
     *
     * @param id       마감시각 UUID (내부 라우팅용)
     * @param callerId 호출자 user-id (X-User-Id 헤더, 감사 목적)
     * @return 빈 성공 응답
     */
    @DeleteMapping("/{id}")
    @RequirePermission(page = SlipCutoffPageCodes.HR_SLIP_CUTOFF, action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerId
    ) {
        service.delete(id, callerId);
        return ApiResponse.ok(null);
    }
}
