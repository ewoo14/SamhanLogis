package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatchExclusion;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchExclusionRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.HomtaxRow;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchHistoryResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.GZIPOutputStream;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세금계산서 일괄발행 배치 서비스 — GAS 계산서일괄등록양식 생성 BE 이식.
 *
 * <p>GAS 원본 기능 4탭을 BE 로 이식:
 * <ol>
 *   <li>판매조회 데이터 → 홈택스 양식 변환 (미리보기)</li>
 *   <li>100건 단위 분할 .xlsx 생성 (Apache POI)</li>
 *   <li>제외 거래처 코드 CRUD (Notion → RDB)</li>
 *   <li>저장 이력 조회 (Notion → RDB)</li>
 * </ol>
 *
 * <p>외부 의존:
 * <ul>
 *   <li>{@link SlipQueryClient} — slip-service 판매조회 fetch</li>
 * </ul>
 *
 * <p>Notion API 의존 제거 — 모든 데이터 {@code accounting_db} 저장.
 *
 * <p>공급자 정보 동적 조회 — 기존 GAS 하드코딩을 제거하고
 * {@link SupplierProfileRepository#findByIsPrimaryTrueAndIsDeletedFalse()} 로 교체.
 * 메서드 진입 시 1회 fetch 후 모든 row 변환에 재사용 (반복 DB 조회 방지).
 * primary 사업자 미존재 시 legacy 하드코딩 fallback 값 사용.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceBatchService {

    /** 홈택스 양식 한 파일당 최대 데이터 행 수. */
    public static final int ROWS_PER_FILE = 100;

    // legacy fallback 공급자 정보 — primary 사업자 미존재 시 사용 (GAS 원본 하드코딩 값 보존)
    static final String FALLBACK_REG_NO      = "2148720659";
    static final String FALLBACK_NAME         = "（주）삼한공조시스템";
    static final String FALLBACK_CEO          = "김미선";
    static final String FALLBACK_ADDRESS      = "서울특별시 서초구 마방로2길 9, 4층(양재동)";
    static final String FALLBACK_BIZ_TYPE     = "도소매";
    static final String FALLBACK_BIZ_ITEM     = "가전제품";
    static final String FALLBACK_EMAIL        = "apjog09@daum.net";

    /** 홈택스 양식 컬럼 헤더 (GAS HEADER_LIST 59종). */
    private static final String[] HOMTAX_HEADERS = {
            "전자(세금)계산서 종류 (01:일반, 02:영세율)", "작성일자",
            "공급자 등록번호 (\"-\" 없이 입력)", "공급자 종사업장번호",
            "공급자 상호", "공급자 성명", "공급자 사업장주소", "공급자 업태",
            "공급자 종목", "공급자 이메일",
            "공급받는자 등록번호 (\"-\" 없이 입력)", "공급받는자 종사업장번호",
            "공급받는자 상호", "공급받는자 성명", "공급받는자 사업장주소", "공급받는자 업태",
            "공급받는자 종목", "공급받는자 이메일1", "공급받는자 이메일2",
            "공급가액", "세액", "비고",
            "일자1 (2자리, 작성년월 제외)", "품목1", "규격1", "수량1", "단가1",
            "공급가액1", "세액1", "품목비고1",
            "일자2 (2자리, 작성년월 제외)", "품목2", "규격2", "수량2", "단가2",
            "공급가액2", "세액2", "품목비고2",
            "일자3 (2자리, 작성년월 제외)", "품목3", "규격3", "수량3", "단가3",
            "공급가액3", "세액3", "품목비고3",
            "일자4 (2자리, 작성년월 제외)", "품목4", "규격4", "수량4", "단가4",
            "공급가액4", "세액4", "품목비고4",
            "현금", "수표", "어음", "외상미수금", "영수(01),청구(02)"
    };

    private final TaxInvoiceBatchRepository batchRepository;
    private final TaxInvoiceBatchExclusionRepository exclusionRepository;
    private final SlipQueryClient slipQueryClient;
    private final ObjectMapper objectMapper;
    private final SupplierProfileRepository supplierProfileRepository;
    private final TaxInvoiceBatchNoGenerator batchNoGenerator;

    // =========================================================================
    // A. 일괄발행 미리보기
    // =========================================================================

    /**
     * 판매조회 데이터 → 홈택스 양식 변환 미리보기.
     *
     * <p>변환 로직 (GAS Index.html {@code runProcess()} 동등):
     * <ol>
     *   <li>slip-service 에서 [fromDate, toDate] 판매조회 전체 fetch</li>
     *   <li>excludeUnconfirmed=true 이면 회계반영일자 없는 row 제외</li>
     *   <li>DB 마스터 제외 거래처 + 요청 임시 제외 거래처 합산 필터</li>
     *   <li>SlipRow → HomtaxRow 59컬럼 매핑</li>
     *   <li>100건 단위 splitFileCount 계산</li>
     *   <li>배치 entity 저장 (COMPLETED) + dataSnapshotJson gzip+base64</li>
     * </ol>
     *
     * @param fromDate             판매조회 시작일
     * @param toDate               판매조회 종료일
     * @param excludeUnconfirmed   회계반영일자 미전표 제외 여부
     * @param requestExcludeCodes  요청 임시 제외 거래처 코드 (nullable)
     * @param actorUserId          작업자 UUID (X-User-Id)
     * @return 미리보기 응답 (batchNo, totalRowCount, splitFileCount, rows)
     * @throws BusinessException(INTERNAL_ERROR) JSON 직렬화 / gzip 실패
     */
    public TaxInvoiceBatchPreviewResponse preview(LocalDate fromDate, LocalDate toDate,
                                                   boolean excludeUnconfirmed,
                                                   List<String> requestExcludeCodes,
                                                   UUID actorUserId) {
        // 0) 공급자 정보 1회 fetch (매 row 반복 조회 방지)
        SupplierProfile supplier = supplierProfileRepository
                .findByIsPrimaryTrueAndIsDeletedFalse().orElse(null);

        // 1) 판매조회 fetch
        List<Map<String, Object>> rawRows = slipQueryClient.fetchAllSalesRows(fromDate, toDate);

        // 2) 제외 거래처 코드 합산
        Set<String> exclusionSet = new HashSet<>(exclusionRepository.findAllActiveCodes());
        if (requestExcludeCodes != null) {
            exclusionSet.addAll(requestExcludeCodes);
        }

        // 3) 변환 + 필터
        List<HomtaxRow> homtaxRows = new ArrayList<>();
        for (Map<String, Object> raw : rawRows) {
            // 회계반영일자 필터
            if (excludeUnconfirmed) {
                String accDate = safeStr(raw.get("accountingDate"));
                if (accDate.isBlank()) {
                    continue;
                }
            }
            // 거래처 코드 제외 필터
            String partnerCode = safeStr(raw.get("partnerCode"));
            if (exclusionSet.contains(partnerCode)) {
                continue;
            }
            homtaxRows.add(toHomtaxRow(raw, supplier));
        }

        // 4) 100건 분할 수 계산
        int total = homtaxRows.size();
        int splitCount = total == 0 ? 0 : (int) Math.ceil((double) total / ROWS_PER_FILE);

        // 5) gzip+base64 스냅샷
        String snapshotJson = serializeAndCompress(homtaxRows);

        // 6) 배치 채번 + 저장
        String batchNo = batchNoGenerator.next(fromDate);
        UUID resolvedActor = actorUserId != null ? actorUserId : UUID.fromString("00000000-0000-0000-0000-000000000000");
        TaxInvoiceBatch batch = TaxInvoiceBatch.create(batchNo, fromDate, toDate, resolvedActor);
        String exclusionCsv = exclusionSet.isEmpty() ? null : String.join(",", exclusionSet);
        batch.complete(total, splitCount, null, exclusionCsv, snapshotJson);
        TaxInvoiceBatch saved = batchRepository.save(batch);

        return TaxInvoiceBatchPreviewResponse.of(saved, homtaxRows, new ArrayList<>(exclusionSet));
    }

    // =========================================================================
    // B. .xlsx 다운로드 (100건 분할)
    // =========================================================================

    /**
     * 저장된 배치 데이터로 홈택스 양식 .xlsx binary 생성.
     *
     * <p>GAS {@code exportToExcel()} 로직 동등 구현:
     * <ul>
     *   <li>5~6행 홈택스 표준 안내문 삽입</li>
     *   <li>6행 컬럼 헤더 (색상: 황색/적색/녹색)</li>
     *   <li>7행~ 데이터 (최대 100건)</li>
     *   <li>추가 시트: 항목설명 / 올바른예시 / 잘못된예시</li>
     * </ul>
     *
     * @param batchId   배치 UUID
     * @param fileIndex 분할 파일 인덱스 (0-based)
     * @return .xlsx binary
     * @throws BusinessException(NOT_FOUND) 배치 미존재
     * @throws BusinessException(INTERNAL_ERROR) 직렬화 실패
     */
    public byte[] generateExcel(UUID batchId, int fileIndex) {
        TaxInvoiceBatch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "배치를 찾을 수 없습니다: " + batchId));

        // 스냅샷 복원
        List<HomtaxRow> allRows = decompressAndDeserialize(batch.getDataSnapshotJson());

        // fileIndex 에 해당하는 100건 슬라이스
        int fromIdx = fileIndex * ROWS_PER_FILE;
        if (fromIdx >= allRows.size() && !allRows.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "fileIndex " + fileIndex + " 는 범위를 초과합니다 (총 " + batch.getSplitFileCount() + "개)");
        }
        int toIdx = Math.min(fromIdx + ROWS_PER_FILE, allRows.size());
        List<HomtaxRow> chunk = allRows.isEmpty() ? List.of() : allRows.subList(fromIdx, toIdx);

        byte[] xlsx = buildXlsx(chunk);

        // 다운로드 마킹
        batch.markDownloaded();
        batchRepository.save(batch);

        return xlsx;
    }

    // =========================================================================
    // C. 제외 거래처 CRUD
    // =========================================================================

    /**
     * 제외 거래처 목록 조회.
     *
     * @return 활성 제외 거래처 목록 (등록일 DESC)
     */
    @Transactional(readOnly = true)
    public List<TaxInvoiceBatchExclusionResponse> listExclusions() {
        return exclusionRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(TaxInvoiceBatchExclusionResponse::of)
                .toList();
    }

    /**
     * 제외 거래처 등록.
     *
     * @param partnerCode 거래처 코드 (active 기준 unique)
     * @param partnerName 거래처 명칭 스냅샷
     * @param reason      제외 사유
     * @param actorUserId 작업자 식별자 (createdBy)
     * @return 등록된 제외 거래처 응답
     * @throws BusinessException(CONFLICT) 이미 등록된 거래처 코드
     */
    public TaxInvoiceBatchExclusionResponse addExclusion(String partnerCode, String partnerName,
                                                          String reason, String actorUserId) {
        exclusionRepository.findByPartnerCode(partnerCode).ifPresent(ex -> {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 등록된 제외 거래처 코드입니다: " + partnerCode);
        });
        TaxInvoiceBatchExclusion entity = TaxInvoiceBatchExclusion.create(partnerCode, partnerName, reason);
        return TaxInvoiceBatchExclusionResponse.of(exclusionRepository.save(entity));
    }

    /**
     * 제외 거래처 삭제 (Soft Delete).
     *
     * @param partnerCode 거래처 코드
     * @param actorUserId 작업자 식별자 (deletedBy)
     * @throws BusinessException(NOT_FOUND) 등록되지 않은 거래처 코드
     */
    public void removeExclusion(String partnerCode, String actorUserId) {
        TaxInvoiceBatchExclusion entity = exclusionRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "제외 거래처를 찾을 수 없습니다: " + partnerCode));
        entity.markDeleted(actorUserId);
        exclusionRepository.save(entity);
    }

    // =========================================================================
    // D. 저장 이력
    // =========================================================================

    /**
     * 저장 이력 목록 조회 (페이지네이션).
     *
     * @param fromDate 조회 시작일 (sourceFromDate 기준)
     * @param toDate   조회 종료일 (sourceToDate 기준)
     * @param pageable 페이지 정보
     * @return 이력 목록 페이지
     */
    @Transactional(readOnly = true)
    public Page<TaxInvoiceBatchHistoryResponse> listHistory(LocalDate fromDate, LocalDate toDate,
                                                             Pageable pageable) {
        return batchRepository.findByDateRange(fromDate, toDate, pageable)
                .map(TaxInvoiceBatchHistoryResponse::ofSummary);
    }

    /**
     * 저장 이력 단건 조회 — dataSnapshotJson 포함.
     *
     * @param batchId 배치 UUID
     * @return 이력 상세 (스냅샷 포함)
     * @throws BusinessException(NOT_FOUND) 배치 미존재
     */
    @Transactional(readOnly = true)
    public TaxInvoiceBatchHistoryResponse getHistoryDetail(UUID batchId) {
        TaxInvoiceBatch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "배치를 찾을 수 없습니다: " + batchId));
        return TaxInvoiceBatchHistoryResponse.ofDetail(batch);
    }

    // =========================================================================
    // 내부 — 변환 로직
    // =========================================================================

    /**
     * SlipRow Map → HomtaxRow 59컬럼 매핑.
     *
     * <p>GAS {@code runProcess()} switch 문 동등 구현:
     * <ul>
     *   <li>공급자 정보: {@link SupplierProfile} 동적 조회값 사용.
     *       null(primary 미설정) 이면 legacy fallback 상수 사용.</li>
     *   <li>공급받는자: partnerCode → 숫자만, partnerName → cleanCustomerName 처리</li>
     *   <li>작성일자: accountingDate 또는 slipDate (yyyyMMdd)</li>
     *   <li>일자1 (2자리): 작성년월 제외한 dd 부분</li>
     *   <li>영수/청구: "02" (청구) 고정</li>
     * </ul>
     *
     * @param raw      slip-service 판매조회 row Map
     * @param supplier 공급자 프로필 (null 이면 fallback 사용)
     * @return 홈택스 양식 행
     */
    HomtaxRow toHomtaxRow(Map<String, Object> raw, SupplierProfile supplier) {
        String dateStr = resolveWriteDate(raw);
        String day2 = dateStr.length() >= 8 ? dateStr.substring(6, 8) : "01";

        // 공급자 정보 — DB 값 우선, 미설정 시 legacy fallback
        String supplierRegNo  = supplier != null ? supplier.getBusinessNumber()    : FALLBACK_REG_NO;
        String supplierSubNo  = supplier != null && supplier.getSubBusinessNumber() != null
                                ? supplier.getSubBusinessNumber() : "";
        String supplierName   = supplier != null ? supplier.getCompanyName()        : FALLBACK_NAME;
        String supplierCeo    = supplier != null ? supplier.getRepresentativeName() : FALLBACK_CEO;
        String supplierAddr   = supplier != null ? supplier.getBusinessAddress()    : FALLBACK_ADDRESS;
        String supplierBizTp  = supplier != null && supplier.getBusinessType() != null
                                ? supplier.getBusinessType() : FALLBACK_BIZ_TYPE;
        String supplierBizIt  = supplier != null && supplier.getBusinessItem() != null
                                ? supplier.getBusinessItem() : FALLBACK_BIZ_ITEM;
        String supplierEmail  = supplier != null && supplier.getEmail() != null
                                ? supplier.getEmail() : FALLBACK_EMAIL;

        String buyerRegNo = safeStr(raw.get("businessNumber")).replaceAll("[^0-9]", "");
        String buyerName = cleanCustomerName(safeStr(raw.get("partnerName")));
        String buyerCeo = safeStr(raw.get("representativeName"));
        String buyerAddress = safeStr(raw.get("address"));
        String buyerBizType = safeStr(raw.get("bizType"));
        String buyerBizItem = safeStr(raw.get("bizItem"));
        String buyerEmail1 = safeStr(raw.get("email"));

        BigDecimal supplyAmount = toBigDecimal(raw.get("supplyAmount"));
        BigDecimal vatAmount = toBigDecimal(raw.get("vatAmount"));
        String remark = safeStr(raw.get("deliveryAddress"));
        String itemName1 = safeStr(raw.get("itemName"));
        String slipNo = safeStr(raw.get("slipNo"));

        return new HomtaxRow(
                "01",           // invoiceType: 일반
                dateStr,        // writeDate
                supplierRegNo,
                supplierSubNo,
                supplierName,
                supplierCeo,
                supplierAddr,
                supplierBizTp,
                supplierBizIt,
                supplierEmail,
                buyerRegNo,     // col10
                "",             // buyerSubNo
                buyerName,
                buyerCeo,
                buyerAddress,
                buyerBizType,
                buyerBizItem,
                buyerEmail1,
                "",             // buyerEmail2
                supplyAmount,   // col19
                vatAmount,      // col20
                remark,         // col21
                day2,           // col22: 일자1
                itemName1,      // col23: 품목1
                "",             // 규격1
                null,           // 수량1
                null,           // 단가1
                supplyAmount,   // 공급가액1
                vatAmount,      // 세액1
                "",             // 품목비고1
                // 품목2~4 빈값
                "", "", "", null, null, null, null, "",
                "", "", "", null, null, null, null, "",
                "", "", "", null, null, null, null, "",
                null, null, null, null,  // 현금/수표/어음/외상미수금
                "02",           // 영수(01),청구(02)
                slipNo          // 내부용 전표번호
        );
    }

    /**
     * GAS cleanCustomerName 동등 — 괄호 안 내용 제거, '-' 이후 제거.
     *
     * @param name 원본 거래처명
     * @return 정제된 거래처명
     */
    static String cleanCustomerName(String name) {
        if (name == null || name.isBlank()) return "";
        String txt = name.replaceAll("\\((?!주\\)).*?\\)", "");
        int dashIdx = txt.indexOf('-');
        if (dashIdx > -1) {
            txt = txt.substring(0, dashIdx);
        }
        return txt.replace("구)", "").replace("*", "").trim();
    }

    // =========================================================================
    // 내부 — 채번
    // =========================================================================

    // =========================================================================
    // 내부 — gzip+base64 직렬화
    // =========================================================================

    /**
     * HomtaxRow 리스트 → JSON 직렬화 → gzip+base64 압축.
     *
     * <p>GAS {@code compressString()} 동등.
     *
     * @param rows 변환된 홈택스 행 목록
     * @return gzip+base64 문자열
     */
    private String serializeAndCompress(List<HomtaxRow> rows) {
        try {
            String json = objectMapper.writeValueAsString(rows);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(baos)) {
                gzip.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            return Base64.getEncoder().encodeToString(baos.toByteArray());
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "배치 스냅샷 JSON 직렬화 실패: " + ex.getMessage(), ex);
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "배치 스냅샷 gzip 압축 실패: " + ex.getMessage(), ex);
        }
    }

    /**
     * gzip+base64 → 복원 → JSON 역직렬화.
     *
     * <p>GAS {@code decompressString()} 동등.
     *
     * @param b64 gzip+base64 문자열
     * @return HomtaxRow 목록
     */
    private List<HomtaxRow> decompressAndDeserialize(String b64) {
        if (b64 == null || b64.isBlank()) return Collections.emptyList();
        try {
            byte[] compressed = Base64.getDecoder().decode(b64);
            java.io.ByteArrayInputStream bais = new java.io.ByteArrayInputStream(compressed);
            java.util.zip.GZIPInputStream gzip = new java.util.zip.GZIPInputStream(bais);
            String json = new String(gzip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, HomtaxRow.class));
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "배치 스냅샷 복원 실패: " + ex.getMessage(), ex);
        }
    }

    // =========================================================================
    // 내부 — Apache POI xlsx 생성
    // =========================================================================

    /**
     * HomtaxRow 청크 → 홈택스 표준 양식 .xlsx 생성.
     *
     * <p>GAS {@code exportToExcel()} ExcelJS 로직 동등 구현:
     * <ul>
     *   <li>1~5행: 홈택스 표준 안내문 (행 높이 / 색상 / wrapText)</li>
     *   <li>6행: 컬럼 헤더 (황색/적색/녹색 배경)</li>
     *   <li>7행~: 데이터 행 (텍스트 형식 강제 / 숫자 컬럼 오른쪽 정렬)</li>
     *   <li>추가 시트: 항목설명 / 올바른예시 / 잘못된예시</li>
     * </ul>
     *
     * @param rows 100건 이하의 홈택스 행 청크
     * @return .xlsx binary
     */
    private byte[] buildXlsx(List<HomtaxRow> rows) {
        try (XSSFWorkbook wb = new XSSFWorkbook();
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {

            Sheet sheet = wb.createSheet("엑셀 업로드 양식(전자세금계산서-일반(영세율))");

            // 1행: 제목
            Row r1 = sheet.createRow(0);
            r1.setHeightInPoints(31.5f);
            Cell title = r1.createCell(0);
            title.setCellValue("엑셀 업로드 양식(전자세금계산서-일반(영세율))");
            title.setCellStyle(buildTitleStyle(wb));
            sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 6));

            // 2~5행: 홈택스 안내문
            String[] notices = {
                    "★주황색으로 표시된 부분은 필수입력항목으로 반드시 입력하셔야 합니다.\n★아래 '항목설명' 시트를 참고하여 작성하시기 바랍니다.",
                    "★실제 업로드할 DATA는 7행부터 입력하여야 합니다. 최대 100건까지 입력이 가능하나, 발급은 최대 10건씩 처리가 됩니다.(100건 초과 자료는 처리 안됨)\n★임의로 행을 추가하거나 삭제하는 경우 파일을 제대로 읽지 못하는 경우가 있으므로, 주어진 양식안에 반드시 작성을 하시기 바랍니다.",
                    "★전자(세금)계산서 종류는 엑셀 업로드 양식에 따라 해당 전자(세금)계산서 종류코드를 반드시 입력하셔야 합니다.\n★품목은 1건이상 입력해야 합니다.\n★공급받는자 등록번호는 사업자등록번호, 주민등록번호를 입력할 수 있습니다.",
                    "★처음 일괄발급을 이용하시는 분들은 '올바른 예시' 시트에 있는 내용을 수정하거나 그대로 복사하시면 오류 없이 쉽게 발급하실 수 있습니다.\n★발급가능한 파일 확장자는 XLS, XLSX 입니다."
            };
            float[] noticeHeights = {42f, 45f, 90.75f, 115.5f};
            for (int i = 0; i < notices.length; i++) {
                Row nr = sheet.createRow(i + 1);
                nr.setHeightInPoints(noticeHeights[i]);
                Cell nc = nr.createCell(0);
                nc.setCellValue(notices[i]);
                CellStyle ns = buildNoticeStyle(wb, i == notices.length - 1);
                nc.setCellStyle(ns);
                sheet.addMergedRegion(new CellRangeAddress(i + 1, i + 1, 0, 11));
            }

            // 6행: 컬럼 헤더
            Row headerRow = sheet.createRow(5);
            headerRow.setHeightInPoints(46.5f);
            for (int c = 0; c < HOMTAX_HEADERS.length; c++) {
                Cell hc = headerRow.createCell(c);
                hc.setCellValue(HOMTAX_HEADERS[c]);
                hc.setCellStyle(buildHeaderCellStyle(wb, c));
            }

            // 7행~: 데이터
            // GAS textCols 인덱스 (텍스트 형식 강제 컬럼)
            Set<Integer> textCols = Set.of(0, 2, 3, 10, 11, 58);

            for (int ri = 0; ri < rows.size(); ri++) {
                Row dr = sheet.createRow(6 + ri);
                dr.setHeightInPoints(24f);
                HomtaxRow row = rows.get(ri);
                Object[] values = toValueArray(row);
                for (int c = 0; c < values.length; c++) {
                    if (values[c] instanceof BigDecimal bd) {
                        Cell dc = dr.createCell(c, CellType.NUMERIC);
                        dc.setCellValue(bd.doubleValue());
                        dc.setCellStyle(buildDataNumStyle(wb));
                    } else {
                        // 텍스트 컬럼은 CellType.STRING 으로 강제 (deprecated setCellType 대신 createCell 인자 사용)
                        CellType ct = textCols.contains(c) ? CellType.STRING : CellType.STRING;
                        Cell dc = dr.createCell(c, ct);
                        dc.setCellValue(values[c] != null ? values[c].toString() : "");
                        dc.setCellStyle(buildDataTextStyle(wb));
                    }
                }
            }

            // 추가 시트 (홈택스 양식 표준)
            wb.createSheet("항목설명").createRow(0).createCell(0).setCellValue("항목설명 참조");
            wb.createSheet("올바른 예시").createRow(0).createCell(0).setCellValue("올바른 예시 참조");
            wb.createSheet("잘못된 예시").createRow(0).createCell(0).setCellValue("잘못된 예시 참조");

            wb.write(baos);
            return baos.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "홈택스 양식 xlsx 생성 실패: " + ex.getMessage(), ex);
        }
    }

    /** HomtaxRow → Object[] 59컬럼 배열 변환 (POI row 직렬화용). */
    private Object[] toValueArray(HomtaxRow r) {
        return new Object[]{
                r.invoiceType(), r.writeDate(), r.supplierRegNo(), r.supplierSubNo(),
                r.supplierName(), r.supplierCeo(), r.supplierAddress(), r.supplierBizType(),
                r.supplierBizItem(), r.supplierEmail(),
                r.buyerRegNo(), r.buyerSubNo(), r.buyerName(), r.buyerCeo(),
                r.buyerAddress(), r.buyerBizType(), r.buyerBizItem(),
                r.buyerEmail1(), r.buyerEmail2(),
                r.supplyAmount(), r.vatAmount(), r.remark(),
                r.itemDate1(), r.itemName1(), r.itemSpec1(),
                r.itemQty1(), r.itemPrice1(), r.itemSupply1(), r.itemVat1(), r.itemRemark1(),
                r.itemDate2(), r.itemName2(), r.itemSpec2(),
                r.itemQty2(), r.itemPrice2(), r.itemSupply2(), r.itemVat2(), r.itemRemark2(),
                r.itemDate3(), r.itemName3(), r.itemSpec3(),
                r.itemQty3(), r.itemPrice3(), r.itemSupply3(), r.itemVat3(), r.itemRemark3(),
                r.itemDate4(), r.itemName4(), r.itemSpec4(),
                r.itemQty4(), r.itemPrice4(), r.itemSupply4(), r.itemVat4(), r.itemRemark4(),
                r.cash(), r.check(), r.bill(), r.credit(), r.receiptType()
        };
    }

    // =========================================================================
    // 내부 — POI 스타일 빌더
    // =========================================================================

    private CellStyle buildTitleStyle(XSSFWorkbook wb) {
        CellStyle s = wb.createCellStyle();
        Font f = wb.createFont();
        f.setFontName("돋움");
        f.setFontHeightInPoints((short) 24);
        f.setColor(IndexedColors.BLUE.getIndex());
        f.setBold(true);
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.CENTER);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        return s;
    }

    private CellStyle buildNoticeStyle(XSSFWorkbook wb, boolean isGreen) {
        CellStyle s = wb.createCellStyle();
        Font f = wb.createFont();
        f.setFontName("돋움");
        f.setFontHeightInPoints(isGreen ? (short) 16 : (short) 14);
        f.setColor(isGreen ? IndexedColors.GREEN.getIndex() : IndexedColors.RED.getIndex());
        s.setFont(f);
        s.setWrapText(true);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        return s;
    }

    /** GAS yellowCols / redCols / 기본(녹색) 에 따른 헤더 배경색. */
    private CellStyle buildHeaderCellStyle(XSSFWorkbook wb, int colIdx) {
        // yellowCols: [1, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 27, 28, 58]
        Set<Integer> yellowCols = Set.of(1, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 27, 28, 58);
        Set<Integer> redCols = Set.of(0, 2, 4, 5);

        CellStyle s = wb.createCellStyle();
        Font f = wb.createFont();
        f.setFontName("돋움");
        f.setFontHeightInPoints((short) 10);
        f.setBold(true);
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.CENTER);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        s.setWrapText(true);

        short bgColor;
        if (yellowCols.contains(colIdx)) {
            bgColor = IndexedColors.YELLOW.getIndex();
        } else if (redCols.contains(colIdx)) {
            bgColor = IndexedColors.ROSE.getIndex();
        } else {
            bgColor = IndexedColors.LIGHT_GREEN.getIndex();
        }
        s.setFillForegroundColor(bgColor);
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return s;
    }

    private CellStyle buildDataTextStyle(XSSFWorkbook wb) {
        CellStyle s = wb.createCellStyle();
        Font f = wb.createFont();
        f.setFontName("돋움");
        f.setFontHeightInPoints((short) 10);
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.LEFT);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        return s;
    }

    private CellStyle buildDataNumStyle(XSSFWorkbook wb) {
        CellStyle s = wb.createCellStyle();
        Font f = wb.createFont();
        f.setFontName("돋움");
        f.setFontHeightInPoints((short) 10);
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.RIGHT);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        s.setDataFormat(wb.createDataFormat().getFormat("#,##0"));
        return s;
    }

    // =========================================================================
    // 내부 — 유틸
    // =========================================================================

    /** 작성일자 결정 — accountingDate 우선, 없으면 slipDate. yyyyMMdd 형식. */
    private String resolveWriteDate(Map<String, Object> raw) {
        String accDate = safeStr(raw.get("accountingDate")).replaceAll("[^0-9]", "");
        if (accDate.length() >= 8) return accDate.substring(0, 8);
        String slipDate = safeStr(raw.get("slipDate")).replaceAll("[^0-9]", "");
        if (slipDate.length() >= 8) return slipDate.substring(0, 8);
        return LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
    }

    private static String safeStr(Object v) {
        return v == null ? "" : v.toString().trim();
    }

    private static BigDecimal toBigDecimal(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(v.toString().replace(",", "").trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    /**
     * IT 테스트용 — 외부 client 없이 미리보기 수행 (stub rows 직접 주입).
     *
     * @param rows         변환된 홈택스 행 목록 (직접 주입)
     * @param fromDate     시작일
     * @param toDate       종료일
     * @param actorUserId  작업자 UUID
     * @return 미리보기 응답
     */
    public TaxInvoiceBatchPreviewResponse previewWithRows(List<HomtaxRow> rows,
                                                           LocalDate fromDate,
                                                           LocalDate toDate,
                                                           UUID actorUserId) {
        int total = rows.size();
        int splitCount = total == 0 ? 0 : (int) Math.ceil((double) total / ROWS_PER_FILE);
        String snapshotJson = serializeAndCompress(rows);
        String batchNo = batchNoGenerator.next(fromDate);
        UUID resolvedActorForPreview = actorUserId != null ? actorUserId : UUID.fromString("00000000-0000-0000-0000-000000000000");
        TaxInvoiceBatch batch = TaxInvoiceBatch.create(batchNo, fromDate, toDate, resolvedActorForPreview);
        batch.complete(total, splitCount, null, null, snapshotJson);
        batchRepository.save(batch);
        return TaxInvoiceBatchPreviewResponse.of(batch, rows, List.of());
    }

    /**
     * IT 테스트용 — stub rows 를 SlipQueryClient 응답 형식 Map 으로 변환 후 preview 실행.
     *
     * <p>SlipQueryClient 를 MockBean 으로 대체할 때, 실제 변환 로직(toHomtaxRow)을 검증하기
     * 위해 Map 형식의 rawRows 를 직접 주입한다.
     *
     * @param rawRows      slip-service 응답 형식 Map 리스트
     * @param fromDate     시작일
     * @param toDate       종료일
     * @param excludeUnconfirmed 회계반영일자 미전표 제외
     * @param excludeCodes 제외 거래처 코드
     * @param actorUserId  작업자 UUID
     * @return 미리보기 응답
     */
    public TaxInvoiceBatchPreviewResponse previewFromRawRows(List<Map<String, Object>> rawRows,
                                                              LocalDate fromDate,
                                                              LocalDate toDate,
                                                              boolean excludeUnconfirmed,
                                                              List<String> excludeCodes,
                                                              UUID actorUserId) {
        // 공급자 정보 1회 fetch
        SupplierProfile supplier = supplierProfileRepository
                .findByIsPrimaryTrueAndIsDeletedFalse().orElse(null);

        Set<String> exclusionSet = new HashSet<>(exclusionRepository.findAllActiveCodes());
        if (excludeCodes != null) exclusionSet.addAll(excludeCodes);

        List<HomtaxRow> homtaxRows = new ArrayList<>();
        for (Map<String, Object> raw : rawRows) {
            if (excludeUnconfirmed) {
                String accDate = safeStr(raw.get("accountingDate"));
                if (accDate.isBlank()) continue;
            }
            String partnerCode = safeStr(raw.get("partnerCode"));
            if (exclusionSet.contains(partnerCode)) continue;
            homtaxRows.add(toHomtaxRow(raw, supplier));
        }

        int total = homtaxRows.size();
        int splitCount = total == 0 ? 0 : (int) Math.ceil((double) total / ROWS_PER_FILE);
        String snapshotJson = serializeAndCompress(homtaxRows);
        String batchNo = batchNoGenerator.next(fromDate);
        UUID resolvedActorRaw = actorUserId != null ? actorUserId : UUID.fromString("00000000-0000-0000-0000-000000000000");
        TaxInvoiceBatch batch = TaxInvoiceBatch.create(batchNo, fromDate, toDate, resolvedActorRaw);
        String exclusionCsv = exclusionSet.isEmpty() ? null : String.join(",", exclusionSet);
        batch.complete(total, splitCount, null, exclusionCsv, snapshotJson);
        batchRepository.save(batch);
        return TaxInvoiceBatchPreviewResponse.of(batch, homtaxRows, new ArrayList<>(exclusionSet));
    }
}
