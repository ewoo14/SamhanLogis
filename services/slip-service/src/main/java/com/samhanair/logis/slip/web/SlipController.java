package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryBulkItemResponse;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryResponse;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.service.NextDaySlipImageService;
import com.samhanair.logis.slip.service.SlipCleanupService;
import com.samhanair.logis.slip.service.SlipDuplicateService;
import com.samhanair.logis.slip.service.SlipExcelExportService;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.dto.AddLineRequest;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse;
import com.samhanair.logis.slip.web.dto.PartnerProductPriceMemoryBulkRequest;
import com.samhanair.logis.slip.web.dto.RejectRequest;
import com.samhanair.logis.slip.web.dto.SlipCleanupResponse;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import com.samhanair.logis.slip.web.dto.SlipSearchResult;
import com.samhanair.logis.slip.web.dto.UpdateSlipDriverRequest;
import com.samhanair.logis.slip.web.dto.UpdateSlipRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 전표 CRUD + 상태 전이 + Inventory 연계 endpoint.
 *
 * <p>권한 매트릭스 (Plan §4):
 * <ul>
 *   <li>조회 — 모든 인증 사용자</li>
 *   <li>작성/수정/저장/전송/취소 — SALES, MANAGER, MASTER</li>
 *   <li>수락/처리/완료/배송/배송완료 — WAREHOUSE, INVENTORY, MANAGER, MASTER</li>
 *   <li>확정 — ACCOUNTANT, MANAGER, MASTER</li>
 *   <li>반려 — MANAGER, MASTER</li>
 * </ul>
 *
 * <p>SP-D6-6 권한 가드:
 * <ul>
 *   <li>사용자-facing write/print/cleanup endpoint 는 {@code @RequirePermission} 으로 보호</li>
 *   <li>매입 슬립 목록 (purchases.slip.list) — GET /slips?slipType=INBOUND 진입 시 checkViewPermission</li>
 *   <li>매출 슬립 목록 (sales.slip.list) — GET /slips?slipType=OUTBOUND 진입 시 checkViewPermission</li>
 *   <li>기존 slipType 기반 동적 가드는 목록/호환 경로의 보조 가드로 유지</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipController {

    /** SP-D3 — 매입 슬립 목록 페이지 코드. */
    private static final String PURCHASES_SLIP_LIST_PAGE_CODE = "purchases.slip.list";
    /** 매입 전표 변경 권한 페이지 코드. */
    private static final String PURCHASES_SLIP_EDIT_PAGE_CODE = "purchases.slip.edit";
    /** SP-D3 — 매출 슬립 목록 페이지 코드. */
    private static final String SALES_SLIP_LIST_PAGE_CODE = "sales.slip.list";
    /** 매출 전표 생성 권한 페이지 코드. */
    private static final String SALES_SLIP_CREATE_PAGE_CODE = "sales.slip.create";
    /** 매출 전표 변경 권한 페이지 코드. */
    private static final String SALES_SLIP_EDIT_PAGE_CODE = "sales.slip.edit";
    /** 매출 전표 확정 권한 페이지 코드. */
    private static final String SALES_SLIP_CONFIRM_PAGE_CODE = "sales.slip.confirm";
    /** 매출 전표 취소 권한 페이지 코드. */
    private static final String SALES_SLIP_CANCEL_PAGE_CODE = "sales.slip.cancel";
    /** 견적 작성/수정 권한 페이지 코드. */
    private static final String ESTIMATES_LIST_PAGE_CODE = "estimates.list";
    /** SP-D3 — 입고 검수 페이지 코드. */
    private static final String INBOUND_INSPECTION_PAGE_CODE = "inbound.inspection";

    private static final String CALLER_HEADER = "X-User-Id";
    /**
     * 버전이력 actorName 표시용 헤더 ([[uuid-no-user-visibility]]). gateway 가 주입하는 표시명을
     * 그대로 service 로 위임하고, UUID 비공개 가드(UUID 형태면 null)는 service 가 책임진다.
     */
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final SlipService slipService;
    /** R6-H2 — 전표 서버측 복사 (세트 계보 승계 + 구성품 가격기억 제외). */
    private final SlipDuplicateService slipDuplicateService;
    private final NextDaySlipImageService nextDaySlipImageService;
    private final SlipCleanupService slipCleanupService;
    private final SlipExcelExportService slipExcelExportService;
    private final PartnerProductPriceMemoryService priceMemoryService;
    private final DynamicPermissionClient dynamicPermissionClient;
    private final PermissionGuardMetrics permissionGuardMetrics;

    /**
     * 전표 페이지 조회 — PR-E1 BE-A0 (PR #117) 확장 + deliveryTag 멀티셀렉 필터 신규.
     *
     * <p>지원 query (모두 선택, 비어있으면 무시):
     * <ul>
     *   <li>{@code slipType} OUTBOUND / INBOUND</li>
     *   <li>{@code status} DRAFT/SAVED/...</li>
     *   <li>{@code from} / {@code to} 날짜 범위 (ISO {@code YYYY-MM-DD}) — slip_date BETWEEN.
     *       한쪽만 지정해도 작동 (>= from 또는 &lt;= to)</li>
     *   <li>{@code partnerCode} 정확 일치 (V15 신규 컬럼)</li>
     *   <li>{@code driverPhone} like 매칭 ({@code %phone%})</li>
     *   <li>{@code regionGroup} 정확 일치 (V15 신규 컬럼, arologis 가배차 그룹명)</li>
     *   <li>{@code deliveryTag} 멀티셀렉 (반복 param 허용 — {@code ?deliveryTag=DAY&deliveryTag=RENTAL}).
     *       {@code slipType} 과 정합되지 않는 태그 포함 시 400 BAD_REQUEST.</li>
     * </ul>
     *
     * @param deliveryTags 배송 태그 목록 (null/empty 이면 무시). 태그-slipType 정합 불일치 시 400.
     * @return 200, Page&lt;SlipResponse&gt; — slip 요약 응답 (라인 미포함, deliveryTagLabel 포함)
     */
    @Operation(summary = "전표 페이지 조회 (deliveryTag 멀티셀렉 확장)",
            description = "slipType/status/날짜범위/partnerCode/driverPhone/regionGroup/deliveryTag 동적 조합 필터. " +
                    "deliveryTag-slipType 정합 불일치 시 400.")
    @GetMapping
    public ApiResponse<Page<SlipResponse>> list(
            @RequestParam(required = false, name = "type") SlipType typeAlias,
            @RequestParam(required = false) SlipType slipType,
            @RequestParam(required = false) SlipStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) String driverPhone,
            @RequestParam(required = false) String regionGroup,
            @RequestParam(required = false, name = "deliveryTag") java.util.List<DeliveryTag> deliveryTags,
            @RequestParam(defaultValue = "false") boolean includeDeleted,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Groups", required = false) String userGroups,
            @RequestHeader(value = "X-Is-System-Master", required = false) String isSystemMaster) {
        SlipType effectiveSlipType = slipType != null ? slipType : typeAlias;
        // 1단계: 명시적 타입 지정 시 권한 가드 (Phase C5-4: 그룹/isSystemMaster OR 경로 추가)
        SlipPurchaseAccessGuard.guardInboundPurchaseRead(effectiveSlipType, role, userGroups, isSystemMaster);
        SlipSalesAccessGuard.guardOutboundSalesRead(effectiveSlipType, role, userGroups, isSystemMaster);
        // 2단계: 타입 미지정 시 역할에 따라 가시 범위 축소
        effectiveSlipType = SlipPurchaseAccessGuard.restrictInboundWhenTypeOmitted(effectiveSlipType, role,
                userGroups, isSystemMaster);
        effectiveSlipType = SlipSalesAccessGuard.restrictOutboundWhenTypeOmitted(effectiveSlipType, role,
                userGroups, isSystemMaster);
        // 3단계: restrict 결과에 대해 재가드 (null→OUTBOUND 후 OUTBOUND 차단 역할 검증)
        SlipSalesAccessGuard.guardOutboundSalesRead(effectiveSlipType, role, userGroups, isSystemMaster);
        // 4단계: SP-D3 동적 권한 VIEW 가드 (slipType 확정 후 적용)
        if (SlipType.INBOUND.equals(effectiveSlipType)) {
            checkViewPermission(role, PURCHASES_SLIP_LIST_PAGE_CODE);
        } else if (SlipType.OUTBOUND.equals(effectiveSlipType)) {
            checkViewPermission(role, SALES_SLIP_LIST_PAGE_CODE);
        }
        Pageable pageable = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("slipDate"), Sort.Order.desc("seqNo")));
        // E2 삭제행(취소선) 노출은 OUTBOUND(판매전표) 목록 화면 전용 — INBOUND·기타 소비처는 활성전용.
        boolean effectiveIncludeDeleted = SlipType.OUTBOUND.equals(effectiveSlipType) && includeDeleted;
        return ApiResponse.ok(slipService.list(effectiveSlipType, status, from, to,
                partnerCode, driverPhone, regionGroup, deliveryTags, effectiveIncludeDeleted, pageable));
    }

    /**
     * 전표번호 자동완성 검색.
     *
     * <p>그룹웨어 결재 전표 첨부에서 자유입력 대신 실제 전표를 선택하도록 제공하는 경량 검색이다.
     * 응답은 UUID 를 포함하지 않고 전표번호, 유형, 거래처명, 합계금액, 전표일자만 반환한다.
     *
     * <p>권한은 전표 목록 조회 권한을 재사용한다. 매출 목록 권한자는 출고전표만, 매입 목록
     * 권한자는 입고전표만 검색할 수 있으며, 둘 다 가진 역할은 양쪽을 검색한다. {@code slipType}
     * 을 지정하면 해당 유형으로 한 번 더 필터한다.
     *
     * @param q 전표번호 또는 거래처명 키워드
     * @param slipType 전표유형 필터 (OUTBOUND/INBOUND)
     * @param limit 결과 개수 (기본 10, 최대 20)
     * @return 200, UUID 없는 전표 검색 결과 목록
     */
    @Operation(summary = "전표번호 자동완성 검색",
            description = "slipNo 또는 partnerName 부분일치 검색. UUID 없이 slipNo/slipType/partnerName/totalAmount/slipDate 만 반환.")
    @GetMapping("/search")
    public ApiResponse<List<SlipSearchResult>> search(
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(required = false) SlipType slipType,
            @RequestParam(defaultValue = "10") int limit,
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Groups", required = false) String userGroups,
            @RequestHeader(value = "X-Is-System-Master", required = false) String isSystemMaster) {
        EnumSet<SlipType> visibleTypes = resolveSearchVisibleTypes(role, userGroups, isSystemMaster);
        if (visibleTypes.isEmpty()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 전표 목록 조회 권한이 차단되었습니다.");
        }
        List<SlipType> searchTypes = resolveRequestedSearchTypes(visibleTypes, slipType);
        return ApiResponse.ok(slipService.searchBySlipNo(q, limit, searchTypes));
    }

    /**
     * 거래처+품목 최근 수동단가 조회.
     *
     * <p>브라우저 호출용 사용자 대면 endpoint 이므로 {@code /internal} 이 아니다. partnerId/productId 는
     * 화면 표시 금지 UUID 이며 hidden state/API payload 전용이다. 응답 단가는 전표/견적 입력 필드와
     * 동일한 VAT 포함 단가라서 그대로 자동채움한다.
     */
    @Operation(summary = "거래처+품목 최근 수동단가 조회",
            description = "partnerId/productId 기준 최근 저장 라인 단가(VAT 포함 입력단가)를 조회한다. 없으면 204.")
    @GetMapping("/price-memory")
    public ResponseEntity<ApiResponse<PartnerProductPriceMemoryResponse>> getPriceMemory(
            @RequestParam UUID partnerId,
            @RequestParam UUID productId,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        checkPriceMemoryReadPermission(callerHeader, role);
        return priceMemoryService.find(partnerId, productId)
                .map(response -> ResponseEntity.ok(ApiResponse.ok(response)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * 거래처 한 곳의 N개 품목 최근 수동단가 bulk 조회.
     *
     * <p>최대 100 UUID 를 query string 으로 보내면 약 3.7KB 이상이 되어 보수적 2KB request-line
     * 경계를 넘으므로 조회용 POST body 를 사용한다. 응답은 hit 만 요청 순서로 반환하고 miss 는
     * 생략한다. 전체 miss 도 {@code 200 data=[]} 이며, 요청당 인가 판정은 한 번만 수행한다.
     */
    @Operation(summary = "거래처+품목 최근 수동단가 bulk 조회",
            description = "최대 100개 productIds 중 기억값 hit 만 요청 순서의 배열로 반환한다. "
                    + "miss 는 생략하며 전체 miss 도 200 data=[]. 단가는 VAT 포함 입력단가다.")
    @PostMapping("/price-memory/bulk")
    public ApiResponse<List<PartnerProductPriceMemoryBulkItemResponse>> getPriceMemories(
            @Valid @RequestBody PartnerProductPriceMemoryBulkRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        checkPriceMemoryReadPermission(callerHeader, role);
        return ApiResponse.ok(priceMemoryService.findAll(request.partnerId(), request.productIds()));
    }

    /**
     * 전표 단건 상세 조회.
     *
     * @return 200, SlipDetailResponse / 404 NOT_FOUND
     */
    @Operation(summary = "전표 단건 조회", description = "라인 포함 상세")
    @GetMapping("/{id}")
    public ApiResponse<SlipDetailResponse> getOne(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Groups", required = false) String userGroups,
            @RequestHeader(value = "X-Is-System-Master", required = false) String isSystemMaster,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        SlipDetailResponse response = slipService.getOne(id, userId);
        SlipPurchaseAccessGuard.guardInboundPurchaseRead(response.slipType(), role, userGroups, isSystemMaster);
        boolean approvalLineAllowed = !SlipSalesAccessGuard.canReadOutboundSales(role, userGroups, isSystemMaster)
                && response.canInspect();
        SlipSalesAccessGuard.guardOutboundSalesRead(response.slipType(), response.status(), role, userGroups,
                isSystemMaster, approvalLineAllowed);
        return ApiResponse.ok(response);
    }

    /**
     * 전표 신규 생성 (DRAFT 상태). 라인 productId 일괄 검증 + 자동 메모 적용.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: slipType 이 OUTBOUND 면 sales.slip.list,
     * INBOUND 면 purchases.slip.list EDIT 권한을 검증한다.
     *
     * @return 201, SlipDetailResponse
     */
    @Operation(summary = "전표 생성", description = "DRAFT 상태로 생성. 라인 productId 일괄 검증")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "라인/입력 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "productId 미존재")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SlipDetailResponse> create(
            @Valid @RequestBody CreateSlipRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // SP-D3 동적 권한 EDIT 가드 — slipType 기반 pageCode 분기
        checkCreatePermission(callerHeader, request.slipType());
        return ApiResponse.ok(slipService.create(request, callerOrSystem(callerHeader), callerName));
    }

    /**
     * 전표 서버측 복사 — 원본 헤더 일부 + 라인(세트 계보 포함)을 승계한 신규 DRAFT 전표 생성 (R6-H2).
     *
     * <p>FE 평면 재-POST 복사는 세트 계보 소실 + 구성품 배분가 가격기억 각인을 재생산했다.
     * 본 endpoint 는 서버가 원본 영속 라인에서 직접 복사하며 구성품은 가격기억에서 제외한다.
     * 권한은 신규 생성과 동일하다 (OUTBOUND=sales.slip.create CREATE / INBOUND=purchases.slip.edit
     * UPDATE — 원본 slipType 기준).
     *
     * @return 201, SlipDetailResponse (복사본, status=DRAFT)
     */
    @Operation(summary = "전표 복사", description = "원본 라인·세트 계보를 서버측 승계한 신규 DRAFT 전표 생성. "
            + "구성품 라인은 가격기억(LINE_SAVE) 대상에서 제외.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "복사 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "생성 권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "원본 미존재/삭제"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "OUTBOUND 당일 마감 초과")
    })
    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SlipDetailResponse> duplicate(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // 신규 생성과 동일 권한 — 원본 slipType 을 서버에서 조회해 pageCode 분기 (404 우선 처리 포함)
        checkCreatePermission(callerHeader, resolveSlipType(id));
        return ApiResponse.ok(slipDuplicateService.duplicate(id, callerOrSystem(callerHeader), callerName));
    }

    /**
     * 헤더 부분 수정 — DRAFT/SAVED 만.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     */
    @Operation(summary = "헤더 수정", description = "DRAFT/SAVED 단계만. null 필드는 보존")
    @PatchMapping("/{id}/header")
    public ApiResponse<SlipDetailResponse> editHeader(
            @PathVariable UUID id,
            @Valid @RequestBody EditHeaderRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.editHeader(id, request, callerOrSystem(callerHeader), callerName));
    }

    /**
     * 기사 정보 부분 수정 — DRAFT/SAVED 단계만.
     *
     * <p>FE {@code updateSlipDriver()} 가 호출하는 {@code PATCH /slips/{id}/driver}. 출고 슬립의
     * 배송 기사명/연락처만 부분 갱신한다. null 필드는 보존. 기존 전표 편집과 동일한 권한
     * ({@code sales.slip.edit} EDIT + slipType 기반 동적 EDIT 가드) 을 적용한다.
     *
     * @return 200, SlipDetailResponse
     */
    @Operation(summary = "기사 정보 부분 수정",
            description = "DRAFT/SAVED 단계만. driverName/driverPhone 부분 갱신, null 필드는 보존")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "전표 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT/SAVED 이외 단계")
    })
    @PatchMapping("/{id}/driver")
    public ApiResponse<SlipDetailResponse> editDriver(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateSlipDriverRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.editDriver(id, request, callerOrSystem(callerHeader), callerName));
    }

    /**
     * 전표 헤더 + V20 프로젝트 정보 통합 수정 — DRAFT/SAVED 단계만.
     *
     * <p>V20 신규 5 필드 (deliveryAddress / supervisionAddress / projectName / recipientPhone /
     * paymentDueDate) 를 포함한 통합 수정 endpoint. null 필드는 보존 (부분 갱신).
     * businessNumber 는 partnerId 로 partner-service Feign 자동 resolve (사용자 직접 입력 X).
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     *
     * @return 200, SlipDetailResponse (V20 필드 포함)
     */
    @Operation(summary = "전표 V20 통합 수정",
            description = "헤더 + V20 프로젝트 정보 (deliveryAddress/supervisionAddress/projectName/" +
                    "recipientPhone/paymentDueDate) 통합 수정. DRAFT/SAVED 단계만. null 필드 보존.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "전표 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT/SAVED 이외 단계")
    })
    @PatchMapping("/{id}/v20")
    public ApiResponse<SlipDetailResponse> updateV20(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateSlipRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.updateSlip(id, request, callerOrSystem(callerHeader), callerName));
    }

    /**
     * 라인 추가 — DRAFT/SAVED 만.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     */
    @Operation(summary = "라인 추가", description = "DRAFT/SAVED 단계만")
    @PostMapping("/{id}/lines")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SlipDetailResponse> addLine(
            @PathVariable UUID id,
            @Valid @RequestBody AddLineRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.CREATE);
        return ApiResponse.ok(slipService.addLine(id, request, callerOrSystem(callerHeader), callerName));
    }

    /**
     * 라인 제거 — DRAFT/SAVED 만. 204 No Content.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     */
    @Operation(summary = "라인 제거", description = "DRAFT/SAVED 단계만, orphan removal")
    @DeleteMapping("/{id}/lines/{lineId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeLine(
            @PathVariable UUID id,
            @PathVariable UUID lineId,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.DELETE);
        slipService.removeLine(id, lineId, callerOrSystem(callerHeader), callerName);
    }

    /**
     * DRAFT → SAVED.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     */
    @Operation(summary = "저장", description = "DRAFT → SAVED")
    @PostMapping("/{id}/save")
    public ApiResponse<SlipDetailResponse> save(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.save(id, callerOrSystem(callerHeader)));
    }

    /**
     * SAVED → SENT.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     */
    @Operation(summary = "전송", description = "SAVED → SENT")
    @PostMapping("/{id}/send")
    public ApiResponse<SlipDetailResponse> send(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.send(id));
    }

    /** SENT → ACCEPTED. OUTBOUND 면 inventory reserve. */
    @Operation(summary = "수락", description = "SENT → ACCEPTED. OUTBOUND 면 라인별 inventory reserve")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수락 + reserve 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치 또는 재고 부족")
    })
    @PostMapping("/{id}/accept")
    @RequirePermission(page = "slip.transfer.process", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> accept(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.accept(id, callerOrSystem(callerHeader)));
    }

    /** ACCEPTED → PROCESSING. */
    @Operation(summary = "처리 시작", description = "ACCEPTED → PROCESSING")
    @PostMapping("/{id}/process")
    @RequirePermission(page = "slip.transfer.process", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> process(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.process(id));
    }

    /**
     * PROCESSING → INSPECTING — Slice A (sales-polish-2) 신규 단계.
     * 검수자가 picking 결과 검증 시작. inspectorUserId/SignedAt 자동 기입.
     *
     * <p>SP-D3 동적 권한: 입고(INBOUND) 전표에만 {@code inbound.inspection} 페이지 코드 EDIT 가드 적용.
     */
    @Operation(summary = "검수 시작",
            description = "PROCESSING → INSPECTING. inspectorUserId/SignedAt 자동 기입 (Slice A 신규)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "검수 시작 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치")
    })
    @PostMapping("/{id}/inspect")
    public ApiResponse<SlipDetailResponse> inspect(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        SlipDetailResponse current = slipService.getOne(id);
        SlipType slipType = current.slipType();
        boolean approvalLineMember = slipService.isOutboundInspectApprovalMember(
                slipType, current.status(), callerHeader);
        if (!approvalLineMember) {
            requireAccountPermission(callerHeader, "slip.transfer.process", PermissionAction.UPDATE);
        }
        if (SlipType.INBOUND.equals(slipType)) {
            requireAccountPermission(callerHeader, INBOUND_INSPECTION_PAGE_CODE, PermissionAction.UPDATE);
        }
        return ApiResponse.ok(slipService.inspect(id, callerOrSystem(callerHeader)));
    }

    /** INSPECTING → COMPLETED. OUTBOUND 면 deduct, INBOUND 면 inbound. */
    @Operation(summary = "처리 완료", description = "INSPECTING → COMPLETED. OUTBOUND deduct / INBOUND inbound")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "완료 + 재고 갱신 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치 또는 재고 부족")
    })
    @PostMapping("/{id}/complete")
    @RequirePermission(page = "slip.transfer.process", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> complete(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.complete(id));
    }

    /** COMPLETED → SHIPPING (출고전표 한정). */
    @Operation(summary = "배송 시작", description = "COMPLETED → SHIPPING (OUTBOUND only)")
    @PostMapping("/{id}/ship")
    @RequirePermission(page = "slip.transfer.process", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> ship(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.ship(id));
    }

    /** SHIPPING → DELIVERED (출고전표 한정). */
    @Operation(summary = "배송 완료", description = "SHIPPING → DELIVERED (OUTBOUND only)")
    @PostMapping("/{id}/deliver")
    @RequirePermission(page = "slip.transfer.process", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> deliver(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.deliver(id));
    }

    /** 확정 — DELIVERED→CONFIRMED (출고) / COMPLETED→CONFIRMED (입고). */
    @Operation(summary = "확정", description = "출고 DELIVERED→CONFIRMED / 입고 COMPLETED→CONFIRMED")
    @PostMapping("/{id}/confirm")
    public ApiResponse<SlipDetailResponse> confirm(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_CONFIRM_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.confirm(id, callerOrSystem(callerHeader)));
    }

    /** 반려 — SENT/ACCEPTED→REJECTED. ACCEPTED 였고 OUTBOUND 면 inventory release. */
    @Operation(summary = "반려", description = "SENT/ACCEPTED → REJECTED. ACCEPTED 였으면 release")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "반려 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "사유 누락")
    })
    @PostMapping("/{id}/reject")
    @RequirePermission(page = "slip.reject", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> reject(
            @PathVariable UUID id,
            @Valid @RequestBody RejectRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(
                slipService.reject(id, callerOrSystem(callerHeader), callerName, request.reason()));
    }

    /**
     * 취소 — DRAFT/SAVED/SENT→CANCELED.
     *
     * <p>SP-D3 동적 권한 EDIT 가드: 기존 전표 slipType 을 조회하여 pageCode 를 결정한다.
     */
    @Operation(summary = "취소", description = "DRAFT/SAVED/SENT → CANCELED")
    @PostMapping("/{id}/cancel")
    public ApiResponse<SlipDetailResponse> cancel(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        // SP-D3 동적 권한 EDIT 가드 — 기존 전표 slipType 조회 후 pageCode 분기
        checkSlipMutationPermission(callerHeader, resolveSlipType(id),
                SALES_SLIP_CANCEL_PAGE_CODE, PermissionAction.UPDATE);
        return ApiResponse.ok(slipService.cancel(id, callerOrSystem(callerHeader)));
    }

    /**
     * PR-E1 BE-A5 — 다음날자 전표 이미지 데이터 조회.
     *
     * <p>legacy GAS 6번 "내일자 전표 이미지 생성" 의 자체 자동 조회 이식 (이카운트 의존 0).
     * FE 가 응답을 받아 이미지 렌더링 (window.print 또는 html2canvas).
     *
     * <p>5 way 정보 동봉:
     * <ul>
     *   <li>slip — 다음날자 (date+1) 활성 슬립 전체</li>
     *   <li>partner_code — slip.partnerCode (V15 snapshot)</li>
     *   <li>chat_room — notification-service GET /api/v1/notification/admin/chat-rooms?partnerCode= (Feign)</li>
     *   <li>block — partner-service GET /api/v1/partners/admin/blocks (Feign, Set bulk)</li>
     *   <li>region — slip.classifiedRegionGroup (V15 snapshot)</li>
     * </ul>
     *
     * <p>외부 service 실패 시 graceful fallback (chat=empty / blocked=false).
     *
     * @param date 기준 날짜 (선택, 미입력 시 today). 응답의 targetDate = date+1.
     * @return 200, NextDaySlipImageResponse (지역 그룹별 묶음)
     */
    @Operation(summary = "다음날자 전표 이미지 데이터 (BE-A5)",
            description = "GAS B 이식 — 자체 출고전표 자동 조회 + 단톡방/발송금지/지역 5 way join")
    @GetMapping("/next-day-image-data")
    @RequirePermission(page = "slip.print.next-day", action = com.samhanair.logis.security.permission.PermissionAction.PRINT)
    public ApiResponse<NextDaySlipImageResponse> nextDayImageData(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate date) {
        return ApiResponse.ok(nextDaySlipImageService.buildImageData(date));
    }

    /**
     * PR-E1 BE-A6 — 전표정리리스트 조회 (legacy GAS 13번).
     *
     * <p>기간 내 활성 슬립 전체 + 정합성 검증 flag 4종 + status/partner 그룹핑.
     *
     * <p>flag 4종 (각 슬립별 boolean):
     * <ul>
     *   <li>partnerCodeMissing — partner_code NULL</li>
     *   <li>amountZero — 라인 합계 = 0</li>
     *   <li>linesMissing — 라인 0건</li>
     *   <li>regionMissing — classified_region_group NULL</li>
     * </ul>
     *
     * @param from 기간 시작일 (필수, ISO YYYY-MM-DD)
     * @param to 기간 종료일 (필수, ISO YYYY-MM-DD)
     * @return 200, SlipCleanupResponse (status/partner 카운트 + 슬립별 flag)
     */
    @Operation(summary = "전표정리리스트 (BE-A6)",
            description = "GAS B 이식 — 기간 내 활성 슬립 + 정합성 flag (4종) + status/partner 그룹핑")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "from/to 누락 또는 to < from")
    })
    @GetMapping("/cleanup")
    @RequirePermission(page = "slip.cleanup", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<SlipCleanupResponse> cleanup(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return ApiResponse.ok(slipCleanupService.buildCleanupReport(from, to));
    }

    /**
     * P1-6 — 전표 목록 Excel(.xlsx) 다운로드.
     *
     * <p>복합 필터 (slipType / status / from / to / partnerCode / deliveryTag / includeDeleted /
     * search*) 로 조회한 전표 목록을 .xlsx 파일로 반환.
     * UUID 비공개 가드 — slipNo / partnerName 등 비즈니스 식별자만 출력, partnerId 등 UUID 미포함.
     * 최대 10,000 행.
     *
     * <p>#907 재수렴 R — search* 파라미터(판매/구매관리 검색모달)와 deliveryTag/includeDeleted
     * (판매전표목록 배송태그·삭제행 포함)를 신규 추가. 화면이 조회에 쓰는 조건이 파일에도 그대로
     * 반영되어야 한다(P-1) — 이전에는 이 파라미터들을 export 가 받지 않아 화면에서 검색/필터를
     * 좁혀도 파일은 slipType/기간만으로 전체가 나왔다.
     *
     * @param slipType              전표 유형 필터 (null 이면 전체)
     * @param status                상태 필터 (null 이면 전체)
     * @param from                  전표일자 시작 (null 이면 하한 없음)
     * @param to                    전표일자 종료 (null 이면 상한 없음)
     * @param partnerCode           거래처코드 필터 (null 이면 전체)
     * @param deliveryTags          배송 태그 필터 (판매전표목록 화면 셀렉트, 반복 param 허용)
     * @param includeDeleted        soft-delete 포함 여부 (판매전표목록 OUTBOUND 화면 파리티)
     * @param searchPartnerName     거래처명 부분 검색 (판매/구매관리 검색모달)
     * @param searchPartnerCode     거래처코드 부분 검색
     * @param searchBusinessNumber  사업자등록번호 부분 검색
     * @param searchSlipNo          전표번호 부분 검색
     * @param searchProjectName     프로젝트명 부분 검색
     * @param searchDeliveryAddress 배송주소 부분 검색
     * @return 200 + xlsx binary
     */
    @Operation(summary = "전표 목록 Excel 다운로드 (P1-6)",
            description = "slipType/status/from/to/partnerCode/deliveryTag/includeDeleted/search* 복합 필터. 최대 10,000 행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음")
    })
    @GetMapping("/export.xlsx")
    @RequirePermission(page = "slip.print.export", action = com.samhanair.logis.security.permission.PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) SlipType slipType,
            @RequestParam(required = false) SlipStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false, name = "deliveryTag") List<DeliveryTag> deliveryTags,
            @RequestParam(defaultValue = "false") boolean includeDeleted,
            @RequestParam(required = false) String searchPartnerName,
            @RequestParam(required = false) String searchPartnerCode,
            @RequestParam(required = false) String searchBusinessNumber,
            @RequestParam(required = false) String searchSlipNo,
            @RequestParam(required = false) String searchProjectName,
            @RequestParam(required = false) String searchDeliveryAddress) {
        byte[] xlsx = slipExcelExportService.export(slipType, status, from, to, partnerCode,
                deliveryTags, includeDeleted,
                searchPartnerName, searchPartnerCode, searchBusinessNumber,
                searchSlipNo, searchProjectName, searchDeliveryAddress);
        String filename = "전표목록-" + LocalDate.now() + ".xlsx";
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(filename, java.nio.charset.StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }

    // =========================================================================
    // SP-D3 동적 권한 헬퍼
    // =========================================================================

    /** 기존 전표 변경은 서버에서 조회한 실제 slipType 기준으로 계정 권한을 검증한다. */
    private void checkViewPermission(String actorRole, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, pageCode);
        if (!canView) {
            log.warn("[SP-D3] dynamic VIEW permission denied roleCode={} pageCode={}", actorRole, pageCode);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 전표 목록 조회 권한이 차단되었습니다.");
        }
    }

    private EnumSet<SlipType> resolveSearchVisibleTypes(String role, String userGroups, String isSystemMaster) {
        if ("true".equalsIgnoreCase(isSystemMaster)
                || ((role == null || role.isBlank()) && (userGroups == null || userGroups.isBlank()))) {
            return EnumSet.allOf(SlipType.class);
        }
        EnumSet<SlipType> visibleTypes = EnumSet.noneOf(SlipType.class);
        if (SlipSalesAccessGuard.canReadOutboundSales(role, userGroups, isSystemMaster)
                && canViewPermission(role, SALES_SLIP_LIST_PAGE_CODE)) {
            visibleTypes.add(SlipType.OUTBOUND);
        }
        if (SlipPurchaseAccessGuard.canReadInboundPurchase(role, userGroups, isSystemMaster)
                && canViewPermission(role, PURCHASES_SLIP_LIST_PAGE_CODE)) {
            visibleTypes.add(SlipType.INBOUND);
        }
        return visibleTypes;
    }

    private List<SlipType> resolveRequestedSearchTypes(EnumSet<SlipType> visibleTypes, SlipType requestedType) {
        if (requestedType == null) {
            return List.copyOf(visibleTypes);
        }
        if (!visibleTypes.contains(requestedType)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 해당 전표 유형 조회 권한이 차단되었습니다.");
        }
        return List.of(requestedType);
    }

    private boolean canViewPermission(String actorRole, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return true;
        }
        return dynamicPermissionClient.canView(actorRole, pageCode);
    }

    /** 신규 전표 생성은 요청 slipType 기준으로 계정 권한을 검증한다. */
    private void checkCreatePermission(String callerHeader, SlipType slipType) {
        if (SlipType.INBOUND.equals(slipType)) {
            requireAccountPermission(callerHeader, PURCHASES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
            return;
        }
        requireAccountPermission(callerHeader, SALES_SLIP_CREATE_PAGE_CODE, PermissionAction.CREATE);
    }

    private void checkSlipMutationPermission(
            String callerHeader, SlipType slipType, String outboundPageCode, PermissionAction outboundAction) {
        if (SlipType.INBOUND.equals(slipType)) {
            requireAccountPermission(callerHeader, PURCHASES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE);
            return;
        }
        requireAccountPermission(callerHeader, outboundPageCode, outboundAction);
    }

    /**
     * 가격기억 조회는 품목 선택 시 자동채움 보조 API 이므로 전표/견적 작성 권한 중 하나를 요구한다.
     * OUTBOUND 생성, INBOUND 작성, 견적 생성/수정 권한 중 하나가 있으면 통과한다.
     */
    private void checkPriceMemoryReadPermission(String callerHeader, String role) {
        UUID accountId = parseAccountId(callerHeader);
        // 의미는 기존 4종 OR 와 동일하다. 한 권한이 true 면 뒤의 auth-service 동기 호출은 생략한다.
        boolean allowed = accountId != null
                && (dynamicPermissionClient.check(
                                accountId, SALES_SLIP_CREATE_PAGE_CODE, PermissionAction.CREATE)
                        || dynamicPermissionClient.check(
                                accountId, PURCHASES_SLIP_EDIT_PAGE_CODE, PermissionAction.UPDATE)
                        || dynamicPermissionClient.check(
                                accountId, ESTIMATES_LIST_PAGE_CODE, PermissionAction.CREATE)
                        || dynamicPermissionClient.check(
                                accountId, ESTIMATES_LIST_PAGE_CODE, PermissionAction.UPDATE));
        if (!allowed) {
            permissionGuardMetrics.incrementDenied(
                    "slip-service", SALES_SLIP_CREATE_PAGE_CODE, role, PermissionAction.CREATE.name());
            log.warn("[#809] price-memory permission denied accountId={}", accountId);
            throw new BusinessException(ErrorCode.FORBIDDEN, "전표 생성 권한이 없습니다.");
        }
    }

    /** 권한 분기 전에 전표 유형을 서버 저장값으로 확정한다. */
    private SlipType resolveSlipType(UUID id) {
        return slipService.getOne(id).slipType();
    }

    /** X-User-Id 계정 UUID 기반 권한 검증. 헤더 누락/파싱 실패/권한 없음은 모두 403으로 차단한다. */
    private void requireAccountPermission(String callerHeader, String pageCode, PermissionAction action) {
        UUID accountId = parseAccountId(callerHeader);
        if (accountId == null || !dynamicPermissionClient.check(accountId, pageCode, action)) {
            log.warn("[M4] slip mutation permission denied accountId={} pageCode={} action={}",
                    accountId, pageCode, action);
            throw new BusinessException(ErrorCode.FORBIDDEN, "전표 변경 권한이 없습니다.");
        }
    }

    private UUID parseAccountId(String callerHeader) {
        if (callerHeader == null || callerHeader.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(callerHeader);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
