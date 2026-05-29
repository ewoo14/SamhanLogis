package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.dto.DispatchReconcileResponse;
import com.samhanair.logis.arologis.service.DispatchReconcileService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 운송사 실배차 비교 endpoint — Phase 10 PR-F1 BE-2 (legacy GAS 11번).
 *
 * <p>Samhan Public 이식 — 운송사 엑셀 업로드 유지 + 자체 dispatch 자동 조회. 사용자 명시 패턴
 * (운송사 엑셀 자동 수집 X). 다수 vendor 엑셀 multipart 업로드 + 자체 dispatch from/to 자동 조회 →
 * (날짜 + 슬립번호) 매칭 + TRUE/FALSE_LEFT/FALSE_RIGHT 분류.
 *
 * <p>권한 매트릭스 (memory ROLE 풀네임 의무):
 * <ul>
 *   <li>POST /admin/arologis/dispatch/reconcile — MASTER / MANAGER / DISPATCH</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 응답에는 비즈니스 식별자 (slipNo / dispatchDate / vendorName /
 * partnerName) 만. 내부 dispatchId / vehicleId / stopId 는 미노출.
 *
 * <p>upload size limit — application.yml 에서 max-file-size=50MB (multipart total ≥50MB).
 */
@RestController
@RequestMapping("/admin/arologis/dispatch")
@RequiredArgsConstructor
public class DispatchReconcileController {

    private final DispatchReconcileService dispatchReconcileService;

    /**
     * 운송사 실배차 비교 — multipart 다중 vendor 엑셀 + 자체 dispatch 자동 조회 + 매칭 + 분류.
     *
     * @param files 운송사 엑셀 (.xlsx) multipart 파일들 (필수, 최소 1개, 최대 50MB/파일)
     * @param from  자체 dispatch 자동 조회 시작일 (yyyy-MM-dd, 필수)
     * @param to    자체 dispatch 자동 조회 종료일 (yyyy-MM-dd, 필수, from 이후)
     * @return 매칭 + mismatch 결과 ({@link DispatchReconcileResponse})
     */
    @Operation(summary = "운송사 실배차 비교 (Admin, PR-F1 BE-2)",
            description = "다수 운송사 엑셀 업로드 + 자체 dispatch 자동 조회 → "
                    + "(날짜+슬립번호) left-join → TRUE/FALSE_LEFT/FALSE_RIGHT 분류")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200", description = "비교 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "400",
                    description = "엑셀 형식 오류 / 파일 비어있음 / from-to 누락 또는 역순"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "401", description = "인증 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "403", description = "권한 부족 (MASTER/MANAGER/DISPATCH 외)")
    })
    @PostMapping(value = "/reconcile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "arologis.dispatch.ops", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<DispatchReconcileResponse> reconcile(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.ok(
                dispatchReconcileService.reconcile(files, from, to),
                "운송사 실배차 비교 완료");
    }
}
