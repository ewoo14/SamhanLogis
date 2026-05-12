package com.samhanair.logis.dcconfig.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 데스크탑 영업 "거래처 DC 설정" 화면의 인라인 PATCH 요청 — 4b 백로그 정식 구현.
 *
 * <p>frontend 가 디스플레이 문자열 그대로 송신한다 ({@code "46%"}, {@code "₩70,000"},
 * {@code "Yes"}/{@code "No"}, 자유 텍스트). 각 필드는 nullable — null/blank 시 그 컬럼은
 * 변경 없음 (no-op). PartnerDcConfigsController 가 본 DTO 를 DcConfigService 로 위임하면
 * 서비스가 외부 문자열 → 내부 BigDecimal/Boolean/Integer 로 파싱한다.
 *
 * <p>partnerCode 는 path param 으로 받으므로 본 DTO 에는 포함하지 않는다.
 */
@Schema(description = "거래처 DC 설정 인라인 수정 요청 (외부 표시 문자열 그대로)")
public record UpdatePartnerDcConfigRequest(
        @Schema(description = "홈멀티 DC율 — '46%' 형식", example = "46%") String homeMultiDc,
        @Schema(description = "상업멀티 DC율 — '47%' 형식", example = "47%") String commercialMultiDc,
        @Schema(description = "유연호스(I) — 'Yes' 또는 'No'", example = "Yes") String flexibleHoseTypeI,
        @Schema(description = "360 옵션 정액 DC — '₩70,000' 형식", example = "₩70,000") String threeSixty,
        @Schema(description = "4way 옵션 정액 DC") String fourWay,
        @Schema(description = "1way 옵션 정액 DC") String oneWay,
        @Schema(description = "스탠드 옵션 정액 DC") String stand,
        @Schema(description = "디럭스 옵션 정액 DC") String deluxe,
        @Schema(description = "1등급 옵션 정액 DC") String firstGrade,
        @Schema(description = "단위처리 — 'Yes' 또는 'No'", example = "Yes") String unitProcess,
        @Schema(description = "특이사항 자유 텍스트") String remark
) {}
