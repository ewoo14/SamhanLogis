package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.excel.ExcelColumn;
import com.samhanair.logis.common.excel.ExcelExportRequest;
import com.samhanair.logis.common.excel.ExcelExporter;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 목록 Excel 다운로드 서비스 — P1-6.
 *
 * <p>복합 필터 (slipType / status / from / to / partnerCode / deliveryTag / includeDeleted /
 * search*) 로 조회한 전표 목록을 Apache POI 기반 .xlsx 바이트 배열로 변환.
 * UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — slipNo / partnerName 등
 * 비즈니스 식별자만 출력.
 * requesterId / acceptedBy 는 내부 UUID 또는 내부 식별자이므로 Excel 컬럼에서 제외
 * (QA BUG-2 fix — PR #146).
 *
 * <h2>#907 재수렴 R — 화면 필터 파리티</h2>
 * <p>기존에는 항상 {@link SlipService#list} 만 위임해 출고전표목록(SlipListPage) 화면의
 * 배송태그 필터·삭제행 포함 여부는 반영됐어도, 판매/구매관리(SalesQueryPage/PurchaseQueryPage)
 * 검색모달의 자유검색(전표번호/거래처명/사업자번호/프로젝트명/배송주소)은 export 파라미터
 * 자체가 없어 화면에서 좁혀도 파일은 slipType/기간만으로 전체가 나왔다(예: 화면 1건 / 파일
 * 222행). 검색 필드가 1개라도 채워지면 {@link SlipQueryService#listForQuery} — 이미 화면
 * 조회(/slips/query)가 쓰는 동일 서비스·동일 리포지토리 쿼리 — 로 위임해 화면과 파일이 같은
 * 데이터 소스를 보게 한다. 검색 필드가 없으면 기존 {@link SlipService#list} 위임 경로를 그대로
 * 쓰되 deliveryTags/includeDeleted 를 새로 전달한다 — 두 경로 모두 신규 SQL 없이 기존
 * 리포지토리 쿼리(searchIncludingDeleted / listIncludingDeleted)를 그대로 재사용한다.
 *
 * <p>최대 10,000 행 제한.
 */
@Service
@RequiredArgsConstructor
public class SlipExcelExportService {

    private static final int MAX_ROWS = 10_000;

    private final SlipService slipService;
    private final SlipQueryService slipQueryService;

    /**
     * Excel 컬럼 정의 — 한국어 헤더, UUID 미포함.
     * requesterId / acceptedBy 컬럼 제외 (UUID 비공개 가드, QA BUG-2).
     */
    private static final List<ExcelColumn> COLUMNS = List.of(
            ExcelColumn.text("전표번호",   "slipNo",      5_000),
            ExcelColumn.text("전표일자",   "slipDate",    4_000),
            ExcelColumn.text("전표유형",   "slipType",    3_500),
            ExcelColumn.text("상태",       "status",      3_500),
            ExcelColumn.text("거래처명",   "partnerName", 8_000),
            ExcelColumn.text("배송태그",   "deliveryTag", 3_500),
            ExcelColumn.text("수락일시",   "acceptedAt",  5_000),
            ExcelColumn.text("완료일시",   "completedAt", 5_000),
            ExcelColumn.text("확정일시",   "confirmedAt", 5_000)
    );

    /**
     * 복합 필터로 전표 목록을 조회하여 .xlsx 바이트 배열 반환. 기존 5-param 오버로드는
     * 하위호환 유지(신규 필터 전부 미적용). — {@link #export(SlipType, SlipStatus, LocalDate,
     * LocalDate, String, List, boolean, String, String, String, String, String, String)} 위임.
     *
     * @param slipType    전표 유형 필터 (null 이면 전체)
     * @param status      상태 필터 (null 이면 전체)
     * @param from        전표일자 시작 (null 이면 하한 없음)
     * @param to          전표일자 종료 (null 이면 상한 없음)
     * @param partnerCode 거래처코드 필터 (null 이면 전체)
     * @return xlsx 바이트 배열
     */
    @Transactional(readOnly = true)
    public byte[] export(SlipType slipType, SlipStatus status,
                         LocalDate from, LocalDate to, String partnerCode) {
        return export(slipType, status, from, to, partnerCode, null, false,
                null, null, null, null, null, null);
    }

    /**
     * #907 재수렴 R 신규 — 화면 필터 파리티를 위한 확장 오버로드.
     *
     * <p>{@code search*} 파라미터가 1개라도 채워지면 {@link SlipQueryService#listForQuery} 로
     * 위임한다(판매/구매관리 검색모달 파리티 — deliveryTags/includeDeleted 는 이 경로에서 무시,
     * 두 화면 모두 해당 필터가 없음). 그렇지 않으면 기존 {@link SlipService#list} 위임 경로를
     * 쓰되 deliveryTags/includeDeleted 를 반영한다(출고전표목록 파리티).
     *
     * @param slipType              전표 유형 필터 (null 이면 전체)
     * @param status                상태 필터 (null 이면 전체)
     * @param from                  전표일자 시작 (null 이면 하한 없음)
     * @param to                    전표일자 종료 (null 이면 상한 없음)
     * @param partnerCode           거래처코드 필터 (null 이면 전체, search* 경로에서는 미사용)
     * @param deliveryTags          배송 태그 필터 (null/empty 이면 무시, search* 경로에서는 미사용)
     * @param includeDeleted        soft-delete 포함 여부 (search* 경로에서는 미사용 — 해당 리포지토리
     *                              쿼리가 항상 is_deleted=false, 화면(/slips/query)과 동일)
     * @param searchPartnerName     거래처명 부분 검색
     * @param searchPartnerCode     거래처코드 부분 검색
     * @param searchBusinessNumber  사업자등록번호 부분 검색
     * @param searchSlipNo          전표번호 부분 검색
     * @param searchProjectName     프로젝트명 부분 검색
     * @param searchDeliveryAddress 배송주소 부분 검색
     * @return xlsx 바이트 배열
     */
    @Transactional(readOnly = true)
    public byte[] export(SlipType slipType, SlipStatus status,
                         LocalDate from, LocalDate to, String partnerCode,
                         List<DeliveryTag> deliveryTags, boolean includeDeleted,
                         String searchPartnerName, String searchPartnerCode, String searchBusinessNumber,
                         String searchSlipNo, String searchProjectName, String searchDeliveryAddress) {
        Pageable pageable = PageRequest.of(0, MAX_ROWS, Sort.by(Sort.Direction.DESC, "slipDate"));

        boolean hasSearchFilter = hasText(searchPartnerName) || hasText(searchPartnerCode)
                || hasText(searchBusinessNumber) || hasText(searchSlipNo)
                || hasText(searchProjectName) || hasText(searchDeliveryAddress);

        Page<SlipResponse> page = hasSearchFilter
                ? slipQueryService.listForQuery(slipType, status, from, to, deliveryTags,
                        searchPartnerName, searchPartnerCode, searchBusinessNumber,
                        searchSlipNo, searchProjectName, searchDeliveryAddress, pageable)
                : slipService.list(slipType, status, from, to, partnerCode, null, null,
                        deliveryTags, includeDeleted, pageable);

        List<Map<String, Object>> rows = page.getContent().stream()
                .map(SlipExcelExportService::toRow)
                .toList();

        ExcelExportRequest req = new ExcelExportRequest("전표목록", COLUMNS, rows);
        return ExcelExporter.export(req);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /**
     * SlipResponse → row Map 변환.
     * UUID 필드 및 내부 사용자 식별자 (requesterId / acceptedBy) 제외,
     * 비즈니스 식별자만 포함 (QA BUG-2 fix).
     */
    private static Map<String, Object> toRow(SlipResponse s) {
        Map<String, Object> row = new HashMap<>();
        row.put("slipNo",      s.slipNo());
        row.put("slipDate",    s.slipDate());
        row.put("slipType",    s.slipType() != null ? slipTypeLabel(s.slipType()) : "");
        row.put("status",      s.status() != null ? statusLabel(s.status()) : "");
        row.put("partnerName", nvl(s.partnerName()));
        row.put("deliveryTag", s.deliveryTag() != null ? s.deliveryTag().name() : "");
        row.put("acceptedAt",  s.acceptedAt());
        row.put("completedAt", s.completedAt());
        row.put("confirmedAt", s.confirmedAt());
        return row;
    }

    private static String nvl(String val) {
        return val != null ? val : "";
    }

    private static String slipTypeLabel(SlipType type) {
        return switch (type) {
            case OUTBOUND -> "출고";
            case INBOUND  -> "입고";
        };
    }

    private static String statusLabel(SlipStatus status) {
        return switch (status) {
            case DRAFT      -> "작성중";
            case SAVED      -> "저장완료";
            case SENT       -> "전송완료";
            case ACCEPTED   -> "수락";
            case PROCESSING -> "처리중";
            case INSPECTING -> "검수중";
            case COMPLETED  -> "처리완료";
            case SHIPPING   -> "배송중";
            case DELIVERED  -> "배송완료";
            case CONFIRMED  -> "확정";
            case REJECTED   -> "반려";
            case CANCELED   -> "취소";
        };
    }
}
