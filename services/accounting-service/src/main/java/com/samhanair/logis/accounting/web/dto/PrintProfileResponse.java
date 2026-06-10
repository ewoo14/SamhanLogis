package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * 인쇄물 공개 공급자 정보 응답 DTO — {@code GET /accounting/supplier-profiles/print-profile}.
 *
 * <p>거래명세서·세금계산서 인쇄 시 공급자 블록에 출력되는 공개 정보만 포함.
 * 인쇄물에 공개되는 데이터이므로 권한 게이트 없이 JWT 인증만으로 접근한다
 * (SALES 등 비회계 role 도 인쇄 가능 — P1-C 사이클1 결정).
 *
 * <p>개인정보·민감정보 비포함 원칙:
 * <ul>
 *   <li>stamp PNG base64 — 인감은 이미 인쇄물에 찍혀 거래처에 전달되는 공개 정보</li>
 *   <li>logo PNG base64 — 마찬가지로 인쇄물 공개 정보</li>
 *   <li>bankAccounts — 입금계좌 안내 블록에 출력되는 공개 정보; {@code exposed=true} 계좌만 반환</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 준수 — id 미포함.
 */
@Schema(description = "인쇄물 공급자 정보 응답 (권한 게이트 없는 인쇄 전용 endpoint)")
public record PrintProfileResponse(

        @Schema(description = "상호", example = "（주）삼한공조시스템")
        String companyName,

        @Schema(description = "사업자등록번호 (10자리)", example = "2148720659")
        String businessNumber,

        @Schema(description = "종사업장번호 (4자리, 없으면 null)", example = "null")
        String subBusinessNumber,

        @Schema(description = "대표 성명", example = "김미선")
        String representativeName,

        @Schema(description = "사업장 주소", example = "서울특별시 서초구 마방로2길 9, 4층(양재동)")
        String businessAddress,

        @Schema(description = "업태", example = "도소매")
        String businessType,

        @Schema(description = "종목", example = "가전제품")
        String businessItem,

        @Schema(description = "사업자 이메일", example = "apjog09@daum.net")
        String email,

        @Schema(description = "전화번호", example = "02-3461-0000")
        String tel,

        @Schema(description = "FAX 번호", example = "02-3461-0001")
        String fax,

        @Schema(description = "입금계좌 목록 (exposed=true 계좌만 반환 — 인쇄 bankNotice 용)")
        List<BankAccountResponse> bankAccounts,

        @Schema(description = "인감 PNG Base64 (등록 시에만 포함, 미등록 시 null)")
        String stampPngBase64,

        @Schema(description = "로고 PNG Base64 (등록 시에만 포함, 미등록 시 null)")
        String logoPngBase64

) {}
