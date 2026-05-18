package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.service.TaxInvoiceEmitService;
import com.samhanair.logis.accounting.service.TaxInvoiceService;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceRequest;
import com.samhanair.logis.accounting.web.dto.EmitNtsRequest;
import com.samhanair.logis.accounting.web.dto.EmitNtsResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceCancelRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceCreateRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceDetailResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoicePrintResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceSummaryResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 세금계산서 endpoint (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>매뉴얼 출처: {@code docs/manual/03-회계/03-세금계산서.md}.
 *
 * <p>권한 매트릭스 — ACCOUNTANT, MASTER 만 (매뉴얼 §1 + 메모리 ROLE 풀네임 의무):
 *
 * <ul>
 *   <li>POST   /accounting/tax-invoices             — DRAFT 생성</li>
 *   <li>PUT    /accounting/tax-invoices/{id}        — DRAFT 수정</li>
 *   <li>POST   /accounting/tax-invoices/{id}/issue  — DRAFT → ISSUED + 자동 분개</li>
 *   <li>POST   /accounting/tax-invoices/{id}/cancel — ISSUED → CANCELLED + 자동 역분개</li>
 *   <li>GET    /accounting/tax-invoices             — 페이지 조회 (status/period/partner)</li>
 *   <li>GET    /accounting/tax-invoices/{id}        — 단건 + lines</li>
 * </ul>
 *
 * <p>응답은 ApiResponse 래핑. UUID 는 mutation path 에만 사용 — 사용자 표시는 tax_invoice_no.
 */
@RestController
@RequestMapping("/accounting/tax-invoices")
@RequiredArgsConstructor
public class TaxInvoiceController {

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";

    private final TaxInvoiceService taxInvoiceService;
    private final TaxInvoiceEmitService taxInvoiceEmitService;

    /** DRAFT 생성. */
    @Operation(summary = "세금계산서 신규 생성", description = "DRAFT 상태로 생성. 라인 1개 이상 필수")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<TaxInvoiceDetailResponse> create(
            @Valid @RequestBody CreateTaxInvoiceRequest request) {
        return ApiResponse.ok(taxInvoiceService.create(request));
    }

    /** DRAFT 수정 — 헤더 + 라인 일괄 교체. */
    @Operation(summary = "세금계산서 수정", description = "DRAFT 상태에서만 가능. 헤더 + 라인 일괄 교체")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT 가 아닐 때")
    })
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<TaxInvoiceDetailResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody CreateTaxInvoiceRequest request) {
        return ApiResponse.ok(taxInvoiceService.update(id, request));
    }

    /** ISSUED 전이 + tax_invoice_no 발급 + 자동 분개 (110/255/400). */
    @Operation(summary = "세금계산서 발행",
            description = "DRAFT → ISSUED. 발행번호 채번 + 자동 분개 (110 외상매출금 / 255 부가세예수금 / 400 매출)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "발행 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT 가 아니거나 라인 0건/금액 0")
    })
    @PostMapping("/{id}/issue")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<TaxInvoiceDetailResponse> issue(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(taxInvoiceService.issue(id, callerOrSystem(callerHeader)));
    }

    /**
     * CANCELLED 전이 + 자동 역분개 (P0-4 — 취소 사유 의무).
     *
     * <p>취소 사유 5자 이상 필수. 도메인 {@code TaxInvoice.cancel(reason, actorUserId)} 에서 검증.
     */
    @Operation(summary = "세금계산서 취소",
            description = "ISSUED → CANCELLED. 취소 사유 5자 이상 필수. 자동 역분개 생성")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "취소 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "취소 사유 미입력 또는 5자 미만"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "ISSUED 가 아닐 때")
    })
    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<TaxInvoiceDetailResponse> cancel(
            @PathVariable UUID id,
            @Valid @RequestBody TaxInvoiceCancelRequest cancelRequest,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(taxInvoiceService.cancelWithReason(
                id, cancelRequest, callerOrSystem(callerHeader)));
    }

    /**
     * 세금계산서 신규 발행 DRAFT 생성 (P0-4 신규 DTO).
     *
     * <p>기존 {@code POST /accounting/tax-invoices} 와 같은 URL 이지만
     * P0-4 {@link TaxInvoiceCreateRequest} DTO 를 사용. invoiceType / partnerBusinessNumber /
     * unit 필드 포함.
     */
    @Operation(summary = "세금계산서 신규 발행 (P0-4)",
            description = "DRAFT 생성. invoiceType(SALES/PURCHASE) / 사업자번호 형식 검증 / unit 포함")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패 (사업자번호 형식 / lines 미입력)")
    })
    @PostMapping("/issue-request")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<TaxInvoiceDetailResponse> createP04(
            @Valid @RequestBody TaxInvoiceCreateRequest request) {
        return ApiResponse.ok(taxInvoiceService.createFromRequest(request));
    }

    /**
     * 발행 history 페이지 조회 (P0-4 — type 필터 추가).
     *
     * <p>5 필터: status / type / fromDate / toDate / partnerId. 모두 optional.
     * 응답: {@link TaxInvoiceSummaryResponse} Page (Slice C 패턴).
     */
    @Operation(summary = "세금계산서 발행 목록 조회 (P0-4)",
            description = "status / type(SALES|PURCHASE) / fromDate / toDate / partnerId 필터. "
                    + "정렬: 발행일자 DESC")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
    })
    @GetMapping("/history")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<Page<TaxInvoiceSummaryResponse>> history(
            @RequestParam(required = false) TaxInvoiceStatus status,
            @RequestParam(required = false) TaxInvoiceType type,
            @RequestParam(required = false)
                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false)
                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) UUID partnerId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(
                taxInvoiceService.listWithType(status, type, fromDate, toDate, partnerId, pageable));
    }

    /**
     * 인쇄용 데이터 조회 (P0-4).
     *
     * <p>공급자 (회사) + 공급받는자 (거래처 snapshot) + 라인 + 합계 + 한글 금액.
     * DRAFT 상태 차단 (ISSUED / CANCELLED 만 인쇄 가능).
     */
    @Operation(summary = "세금계산서 인쇄 데이터",
            description = "인쇄 양식에 필요한 전체 데이터. DRAFT 상태 차단. 한글 금액 포함")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "인쇄 데이터 반환"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT 상태 — 발행 후 인쇄 가능")
    })
    @GetMapping("/{id}/print")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<TaxInvoicePrintResponse> print(@PathVariable UUID id) {
        return ApiResponse.ok(taxInvoiceService.print(id));
    }

    /** 페이지 조회 — 4 필터 (status, from, to, partnerId). 기존 호환용. */
    @Operation(summary = "세금계산서 페이지 조회 (기존)",
            description = "status / 공급일자 [from, to] / partnerId 필터. P0-4 이후 /history 권장")
    @GetMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<Page<TaxInvoiceResponse>> list(
            @RequestParam(required = false) TaxInvoiceStatus status,
            @RequestParam(required = false)
                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID partnerId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(taxInvoiceService.list(status, from, to, partnerId, pageable));
    }

    /** 단건 조회 (라인 포함). */
    @Operation(summary = "세금계산서 단건 조회", description = "라인 포함 상세")
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<TaxInvoiceDetailResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(taxInvoiceService.getOne(id));
    }

    /**
     * e-Tax NTS 홈택스 실 발행 (SP-09-1).
     *
     * <p>ISSUED 상태 세금계산서를 NTS 홈택스에 전송한다.
     * DRY_RUN 모드(기본): 실제 API 호출 없이 즉시 성공.
     * NTS 모드: Phase 11 sandbox 연동 후 활성화.
     *
     * <p>상태 전이 없음 — ISSUED 유지. eTaxExternalId 만 저장됨.
     *
     * <p>권한: ACCOUNTANT / MASTER 만 (MANAGER 미허용 — 세금계산서 발행 권한 정책).
     */
    @Operation(summary = "e-Tax NTS 실 발행 (SP-09-1)",
            description = "ISSUED 세금계산서를 NTS 홈택스에 전송. DRY_RUN(기본) 또는 NTS 실 발행. "
                    + "DRAFT/CANCELLED → 422, 중복 발행 → 409, ETaxClient 오류 → 502")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "e-Tax 전송 성공 — eTaxExternalId 저장"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "세금계산서 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "이미 e-Tax 전송된 세금계산서"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422",
                    description = "ISSUED 상태가 아닌 세금계산서 (DRAFT/CANCELLED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "502",
                    description = "NTS API 오류")
    })
    @PostMapping("/{id}/emit-nts")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<EmitNtsResponse> emitNts(
            @PathVariable UUID id,
            @Valid @RequestBody EmitNtsRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(taxInvoiceEmitService.emitNts(id, request,
                callerOrSystem(callerHeader), roleHeader));
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
