package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.service.NextDaySlipImageService;
import com.samhanair.logis.slip.service.SlipCleanupService;
import com.samhanair.logis.slip.service.SlipExcelExportService;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.dto.AddLineRequest;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import com.samhanair.logis.slip.web.dto.LockByPeriodRequest;
import com.samhanair.logis.slip.web.dto.LockByPeriodResponse;
import com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse;
import com.samhanair.logis.slip.web.dto.RejectRequest;
import com.samhanair.logis.slip.web.dto.SlipCleanupResponse;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import com.samhanair.logis.slip.web.dto.UpdateSlipRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
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
import org.springframework.security.access.prepost.PreAuthorize;
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
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipService slipService;
    private final NextDaySlipImageService nextDaySlipImageService;
    private final SlipCleanupService slipCleanupService;
    private final SlipExcelExportService slipExcelExportService;

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
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        SlipType effectiveSlipType = slipType != null ? slipType : typeAlias;
        SlipPurchaseAccessGuard.guardInboundPurchaseRead(effectiveSlipType, role);
        effectiveSlipType = SlipPurchaseAccessGuard.restrictInboundWhenTypeOmitted(effectiveSlipType, role);
        Pageable pageable = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("slipDate"), Sort.Order.desc("seqNo")));
        return ApiResponse.ok(slipService.list(effectiveSlipType, status, from, to,
                partnerCode, driverPhone, regionGroup, deliveryTags, pageable));
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
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        SlipDetailResponse response = slipService.getOne(id);
        SlipPurchaseAccessGuard.guardInboundPurchaseRead(response.slipType(), role);
        return ApiResponse.ok(response);
    }

    /**
     * 전표 신규 생성 (DRAFT 상태). 라인 productId 일괄 검증 + 자동 메모 적용.
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
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> create(
            @Valid @RequestBody CreateSlipRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.create(request, callerOrSystem(callerHeader)));
    }

    /** 헤더 부분 수정 — DRAFT/SAVED 만. */
    @Operation(summary = "헤더 수정", description = "DRAFT/SAVED 단계만. null 필드는 보존")
    @PatchMapping("/{id}/header")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> editHeader(
            @PathVariable UUID id,
            @Valid @RequestBody EditHeaderRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.editHeader(id, request, callerOrSystem(callerHeader)));
    }

    /**
     * 전표 헤더 + V20 프로젝트 정보 통합 수정 — DRAFT/SAVED 단계만.
     *
     * <p>V20 신규 5 필드 (deliveryAddress / supervisionAddress / projectName / recipientPhone /
     * paymentDueDate) 를 포함한 통합 수정 endpoint. null 필드는 보존 (부분 갱신).
     * businessNumber 는 partnerId 로 partner-service Feign 자동 resolve (사용자 직접 입력 X).
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
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> updateV20(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateSlipRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.updateSlip(id, request, callerOrSystem(callerHeader)));
    }

    /** 라인 추가 — DRAFT/SAVED 만. */
    @Operation(summary = "라인 추가", description = "DRAFT/SAVED 단계만")
    @PostMapping("/{id}/lines")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> addLine(
            @PathVariable UUID id,
            @Valid @RequestBody AddLineRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.addLine(id, request, callerOrSystem(callerHeader)));
    }

    /** 라인 제거 — DRAFT/SAVED 만. 204 No Content. */
    @Operation(summary = "라인 제거", description = "DRAFT/SAVED 단계만, orphan removal")
    @DeleteMapping("/{id}/lines/{lineId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public void removeLine(
            @PathVariable UUID id,
            @PathVariable UUID lineId,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        slipService.removeLine(id, lineId, callerOrSystem(callerHeader));
    }

    /** DRAFT → SAVED. */
    @Operation(summary = "저장", description = "DRAFT → SAVED")
    @PostMapping("/{id}/save")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> save(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.save(id, callerOrSystem(callerHeader)));
    }

    /** SAVED → SENT. */
    @Operation(summary = "전송", description = "SAVED → SENT")
    @PostMapping("/{id}/send")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> send(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.send(id));
    }

    /** SENT → ACCEPTED. OUTBOUND 면 inventory reserve. */
    @Operation(summary = "수락", description = "SENT → ACCEPTED. OUTBOUND 면 라인별 inventory reserve")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수락 + reserve 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치 또는 재고 부족")
    })
    @PostMapping("/{id}/accept")
    @PreAuthorize("hasAnyRole('WAREHOUSE','INVENTORY','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> accept(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.accept(id, callerOrSystem(callerHeader)));
    }

    /** ACCEPTED → PROCESSING. */
    @Operation(summary = "처리 시작", description = "ACCEPTED → PROCESSING")
    @PostMapping("/{id}/process")
    @PreAuthorize("hasAnyRole('WAREHOUSE','INVENTORY','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> process(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.process(id));
    }

    /**
     * PROCESSING → INSPECTING — Slice A (sales-polish-2) 신규 단계.
     * 검수자가 picking 결과 검증 시작. inspectorUserId/SignedAt 자동 기입.
     */
    @Operation(summary = "검수 시작",
            description = "PROCESSING → INSPECTING. inspectorUserId/SignedAt 자동 기입 (Slice A 신규)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "검수 시작 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치")
    })
    @PostMapping("/{id}/inspect")
    @PreAuthorize("hasAnyRole('WAREHOUSE','INVENTORY','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> inspect(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.inspect(id, callerOrSystem(callerHeader)));
    }

    /** INSPECTING → COMPLETED. OUTBOUND 면 deduct, INBOUND 면 inbound. */
    @Operation(summary = "처리 완료", description = "INSPECTING → COMPLETED. OUTBOUND deduct / INBOUND inbound")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "완료 + 재고 갱신 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "상태 불일치 또는 재고 부족")
    })
    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAnyRole('WAREHOUSE','INVENTORY','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> complete(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.complete(id));
    }

    /** COMPLETED → SHIPPING (출고전표 한정). */
    @Operation(summary = "배송 시작", description = "COMPLETED → SHIPPING (OUTBOUND only)")
    @PostMapping("/{id}/ship")
    @PreAuthorize("hasAnyRole('WAREHOUSE','INVENTORY','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> ship(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.ship(id));
    }

    /** SHIPPING → DELIVERED (출고전표 한정). */
    @Operation(summary = "배송 완료", description = "SHIPPING → DELIVERED (OUTBOUND only)")
    @PostMapping("/{id}/deliver")
    @PreAuthorize("hasAnyRole('WAREHOUSE','INVENTORY','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> deliver(@PathVariable UUID id) {
        return ApiResponse.ok(slipService.deliver(id));
    }

    /** 확정 — DELIVERED→CONFIRMED (출고) / COMPLETED→CONFIRMED (입고). */
    @Operation(summary = "확정", description = "출고 DELIVERED→CONFIRMED / 입고 COMPLETED→CONFIRMED")
    @PostMapping("/{id}/confirm")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> confirm(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
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
    @PreAuthorize("hasAnyRole('MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> reject(
            @PathVariable UUID id,
            @Valid @RequestBody RejectRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.reject(id, callerOrSystem(callerHeader), request.reason()));
    }

    /** 취소 — DRAFT/SAVED/SENT→CANCELED. */
    @Operation(summary = "취소", description = "DRAFT/SAVED/SENT → CANCELED")
    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> cancel(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(slipService.cancel(id, callerOrSystem(callerHeader)));
    }

    /**
     * 기간 마감 lock — accounting-service Feign 호출 endpoint (P1-8 Stage 4 신규).
     *
     * <p>해당 기간의 지정 status 슬립을 일괄 lock_flag=true 로 update. 이미 lock 된 슬립은
     * idempotent 자동 제외. 본 endpoint 는 internal token 인증만 (ACCOUNTANT/MANAGER/MASTER 도 호출 가능).
     *
     * @return 200, lockedCount 포함 응답
     */
    @Operation(summary = "기간 마감 lock",
            description = "accounting-service 마감 처리용 — 기간 + status 조합 일괄 lock_flag=true. idempotent")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "기간 누락")
    })
    @PostMapping("/lock-by-period")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<LockByPeriodResponse> lockByPeriod(
            @jakarta.validation.Valid @RequestBody LockByPeriodRequest request) {
        int locked = slipService.lockByPeriod(request.startDate(), request.endDate(),
                request.status());
        String statusName = request.status() == null ? "CONFIRMED" : request.status().name();
        return ApiResponse.ok(new LockByPeriodResponse(
                request.startDate(), request.endDate(), statusName, locked));
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
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
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
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
    public ApiResponse<SlipCleanupResponse> cleanup(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return ApiResponse.ok(slipCleanupService.buildCleanupReport(from, to));
    }

    /**
     * P1-6 — 전표 목록 Excel(.xlsx) 다운로드.
     *
     * <p>복합 필터 (slipType / status / from / to / partnerCode) 로 조회한 전표 목록을 .xlsx 파일로 반환.
     * UUID 비공개 가드 — slipNo / partnerName 등 비즈니스 식별자만 출력, partnerId 등 UUID 미포함.
     * 최대 10,000 행.
     *
     * @param slipType    전표 유형 필터 (null 이면 전체)
     * @param status      상태 필터 (null 이면 전체)
     * @param from        전표일자 시작 (null 이면 하한 없음)
     * @param to          전표일자 종료 (null 이면 상한 없음)
     * @param partnerCode 거래처코드 필터 (null 이면 전체)
     * @return 200 + xlsx binary
     */
    @Operation(summary = "전표 목록 Excel 다운로드 (P1-6)",
            description = "slipType/status/from/to/partnerCode 복합 필터. 최대 10,000 행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음")
    })
    @GetMapping("/export.xlsx")
    @PreAuthorize("hasAnyRole('MANAGER','MASTER')")
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) SlipType slipType,
            @RequestParam(required = false) SlipStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode) {
        byte[] xlsx = slipExcelExportService.export(slipType, status, from, to, partnerCode);
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

}