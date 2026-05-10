package com.samhanair.logis.partner.service;

import com.samhanair.logis.common.excel.ExcelColumn;
import com.samhanair.logis.common.excel.ExcelExportRequest;
import com.samhanair.logis.common.excel.ExcelExporter;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.repository.PartnerRepository;
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
 * 거래처 Excel 다운로드 서비스 — P1-6.
 *
 * <p>복합 필터 (q / status) 로 조회한 거래처 목록을 Apache POI 기반 .xlsx 바이트 배열로 변환.
 * UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — partnerCode / name / bizNo 만 출력,
 * 내부 UUID 미포함.
 *
 * <p>최대 10,000 행 제한 — 그 이상은 운영팀이 DB 직접 쿼리 권장.
 */
@Service
@RequiredArgsConstructor
public class PartnerExcelExportService {

    private static final int MAX_ROWS = 10_000;

    private final PartnerRepository partnerRepository;

    /** Excel 컬럼 정의 — 한국어 헤더, UUID 미포함 비즈니스 식별자만. */
    private static final List<ExcelColumn> COLUMNS = List.of(
            ExcelColumn.text("거래처코드",  "partnerCode",  4_500),
            ExcelColumn.text("거래처명",    "name",         8_000),
            ExcelColumn.text("사업자번호",  "bizNo",        4_500),
            ExcelColumn.text("연락처",      "phone",        4_500),
            ExcelColumn.text("주소",        "address",      10_000),
            ExcelColumn.text("분류1",       "partnerGroup1", 4_000),
            ExcelColumn.text("분류2",       "partnerGroup2", 4_000),
            ExcelColumn.text("상태",        "status",       3_500),
            ExcelColumn.numeric("신용한도", "creditLimit"),
            ExcelColumn.numeric("미수금",   "outstandingBalance")
    );

    /**
     * 복합 필터로 거래처를 조회하여 .xlsx 바이트 배열 반환.
     *
     * @param q      partnerCode / name / bizNo / phone LIKE 부분 일치 검색어 (null 이면 전체)
     * @param status 거래 상태 필터 (null 이면 전체)
     * @return xlsx 바이트 배열
     */
    @Transactional(readOnly = true)
    public byte[] export(String q, PartnerStatus status) {
        Pageable pageable = PageRequest.of(0, MAX_ROWS, Sort.by(Sort.Direction.ASC, "partnerCode"));
        Page<Partner> page = partnerRepository.searchAdmin(q, status, pageable);

        List<Map<String, Object>> rows = page.getContent().stream()
                .map(PartnerExcelExportService::toRow)
                .toList();

        ExcelExportRequest req = new ExcelExportRequest("거래처목록", COLUMNS, rows);
        return ExcelExporter.export(req);
    }

    /** Partner → row Map 변환. Map.of() 10인수 제한 우회를 위해 HashMap 사용. */
    private static Map<String, Object> toRow(Partner p) {
        Map<String, Object> row = new HashMap<>();
        row.put("partnerCode",         p.getPartnerCode());
        row.put("name",                p.getName());
        row.put("bizNo",               nvl(p.getBizNo()));
        row.put("phone",               nvl(p.getPhone()));
        row.put("address",             nvl(p.getAddress()));
        row.put("partnerGroup1",       nvl(p.getPartnerGroup1()));
        row.put("partnerGroup2",       nvl(p.getPartnerGroup2()));
        row.put("status",              p.getStatus() != null ? statusLabel(p.getStatus()) : "");
        row.put("creditLimit",         p.getCreditLimit());
        row.put("outstandingBalance",  p.getOutstandingBalance());
        return row;
    }

    private static String nvl(String val) {
        return val != null ? val : "";
    }

    private static String statusLabel(PartnerStatus status) {
        return switch (status) {
            case ACTIVE     -> "거래중";
            case SUSPENDED  -> "거래정지";
            case TERMINATED -> "거래종료";
        };
    }
}
