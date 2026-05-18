package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.ReceiptOcrClient;
import com.samhanair.logis.slip.client.ReceiptOcrResult;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * SP-09-3 영수증 OCR 파싱 shell 통합 테스트 (8 case).
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>DRY_RUN 성공 (WAREHOUSE) — 201 + slipNo notNullValue</li>
 *   <li>SALES 403 (권한 거부)</li>
 *   <li>빈 파일 422 (RECEIPT_FILE_INVALID)</li>
 *   <li>10MB 초과 422 (RECEIPT_FILE_INVALID)</li>
 *   <li>PDF 거부 422 (jpg/png/jpeg 만 허용)</li>
 *   <li>CLOVA mode + placeholder 차단 → 502 (OCR_SUBMIT_FAILED)</li>
 *   <li>DRY_RUN 시 자동 생성된 slip DRAFT 상태 확인</li>
 *   <li>audit log 기록 확인 (REQUIRES_NEW)</li>
 * </ol>
 *
 * <p>외부 client {@link ReceiptOcrClient} 는 {@code @MockBean} 으로 격리
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 * 다른 slip-service IT 와 호환성 유지: 모든 외부 client {@code @MockBean} + lenient stub.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ReceiptOcrShellIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private SlipAuditLogRepository auditLogRepository;

    // ---- 외부 client MockBean 격리 (feedback_it_mockbean_external_clients.md) ----

    @MockBean
    private ReceiptOcrClient receiptOcrClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private PartnerBlockClient partnerBlockClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    // ---- 테스트 픽스처 ----

    private static final String ACTOR_ID = UUID.randomUUID().toString();
    private static final byte[] TINY_PNG = new byte[]{
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A // PNG 매직 바이트 (8바이트)
    };

    @BeforeEach
    void setUp() {
        // ReceiptOcrClient DRY_RUN mock 응답 — lenient (모든 케이스 공통 셋업)
        Mockito.lenient().when(receiptOcrClient.submit(any(), anyString(), eq("DRY_RUN")))
                .thenReturn(ReceiptOcrResult.success(
                        "테스트마트",
                        new BigDecimal("12345"),
                        new BigDecimal("1234"),
                        LocalDate.now(),
                        "{\"mode\":\"DRY_RUN\"}"));

        // ProductClient lenient stub — 다른 IT 와 동일 패턴
        Mockito.lenient().when(productClient.lookup(any()))
                .thenReturn(List.of(new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));
        Mockito.lenient().when(productClient.requireExists(any()))
                .thenReturn(new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    // ── Case 1: DRY_RUN 성공 (WAREHOUSE) ──────────────────────────────────────

    /**
     * Case 1: WAREHOUSE 권한으로 DRY_RUN 모드 OCR 파싱 → 201 + slipNo 반환.
     */
    @Test
    void case1_dryRun_warehouse_success_201() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "receipt.png", MediaType.IMAGE_PNG_VALUE, TINY_PNG);

        mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(file)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipNo", notNullValue()))
                .andExpect(jsonPath("$.data.vendorName", is("테스트마트")))
                .andExpect(jsonPath("$.data.submitMethod", is("DRY_RUN")));
    }

    // ── Case 2: SALES 권한 거부 403 ───────────────────────────────────────────

    /**
     * Case 2: SALES 역할은 매입 권한 없음 → 403 Forbidden.
     */
    @Test
    void case2_sales_role_forbidden_403() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "receipt.png", MediaType.IMAGE_PNG_VALUE, TINY_PNG);

        mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(file)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // ── Case 3: 빈 파일 422 ───────────────────────────────────────────────────

    /**
     * Case 3: 빈 파일 업로드 → 422 RECEIPT_FILE_INVALID.
     */
    @Test
    void case3_emptyFile_422() throws Exception {
        MockMultipartFile emptyFile = new MockMultipartFile(
                "file", "empty.png", MediaType.IMAGE_PNG_VALUE, new byte[0]);

        mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(emptyFile)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isUnprocessableEntity());
    }

    // ── Case 4: 10MB 초과 422 ─────────────────────────────────────────────────

    /**
     * Case 4: 10MB 초과 파일 → 422 RECEIPT_FILE_INVALID.
     *
     * <p>실제 10MB+1 파일 생성 대신 MockMultipartFile 의 크기 조작으로 검증.
     */
    @Test
    void case4_fileSizeExceeded_422() throws Exception {
        // 10MB + 1 byte 파일 생성 (테스트용 — 실제 내용 무관)
        byte[] oversized = new byte[10 * 1024 * 1024 + 1];
        oversized[0] = (byte) 0x89; // PNG 매직 바이트 prefix (Content-Type 통과를 위해)
        MockMultipartFile bigFile = new MockMultipartFile(
                "file", "big.png", MediaType.IMAGE_PNG_VALUE, oversized);

        mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(bigFile)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isUnprocessableEntity());
    }

    // ── Case 5: PDF 포맷 거부 422 ─────────────────────────────────────────────

    /**
     * Case 5: PDF 파일 업로드 → 422 RECEIPT_FILE_INVALID (jpg/png/jpeg 만 허용).
     */
    @Test
    void case5_pdfFormat_422() throws Exception {
        MockMultipartFile pdfFile = new MockMultipartFile(
                "file", "receipt.pdf", MediaType.APPLICATION_PDF_VALUE,
                new byte[]{0x25, 0x50, 0x44, 0x46}); // %PDF 매직 바이트

        mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(pdfFile)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isUnprocessableEntity());
    }

    // ── Case 6: CLOVA + placeholder 차단 502 ─────────────────────────────────

    /**
     * Case 6: CLOVA 모드 + placeholder 키 → {@link ReceiptOcrClient#submit} 이
     * {@code OCR_SUBMIT_FAILED} 를 던지도록 stub → 502.
     */
    @Test
    void case6_clovaMode_placeholderBlocked_502() throws Exception {
        // CLOVA mode → OCR_SUBMIT_FAILED 예외 stub
        Mockito.when(receiptOcrClient.submit(any(), anyString(), eq("CLOVA")))
                .thenThrow(new com.samhanair.logis.common.exception.BusinessException(
                        com.samhanair.logis.common.exception.ErrorCode.OCR_SUBMIT_FAILED,
                        "CLOVA_OCR_API_KEY 가 placeholder 입니다."));

        MockMultipartFile file = new MockMultipartFile(
                "file", "receipt.jpg", MediaType.IMAGE_JPEG_VALUE, TINY_PNG);

        mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(file)
                        .param("submitMethod", "CLOVA")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isBadGateway());
    }

    // ── Case 7: DRY_RUN 후 slip DRAFT 상태 확인 ─────────────────────────────

    /**
     * Case 7: DRY_RUN 성공 후 DB 에 INBOUND DRAFT 전표가 생성됨을 확인.
     */
    @Test
    void case7_dryRun_createsInboundDraftSlip() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "receipt.png", MediaType.IMAGE_PNG_VALUE, TINY_PNG);

        MvcResult result = mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(file)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isCreated())
                .andReturn();

        // slipNo 추출
        String responseBody = result.getResponse().getContentAsString();
        String slipNo = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(responseBody).get("data").get("slipNo").asText();

        // DB 에 INBOUND DRAFT 전표 존재 확인
        List<Slip> slips = slipRepository.findAll().stream()
                .filter(s -> s.getSlipNo().equals(slipNo))
                .toList();
        assertThat(slips).hasSize(1);
        Slip slip = slips.get(0);
        assertThat(slip.getSlipType()).isEqualTo(SlipType.INBOUND);
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.DRAFT);
        assertThat(slip.getPartnerName()).isEqualTo("테스트마트");
    }

    // ── Case 8: audit log 기록 확인 ──────────────────────────────────────────

    /**
     * Case 8: DRY_RUN 성공 후 audit log 1건 기록 확인 (REQUIRES_NEW 패턴).
     *
     * <p>audit recorder 는 REQUIRES_NEW 별도 트랜잭션이나, @Transactional IT 환경에서는
     * 동일 SessionFactory 컨텍스트 내 가시성 확인 가능 (slip 저장과 같은 EntityManager scope).
     */
    @Test
    void case8_dryRun_auditLogRecorded() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "receipt.png", MediaType.IMAGE_PNG_VALUE, TINY_PNG);

        MvcResult result = mockMvc.perform(multipart("/slips/receipt-ocr")
                        .file(file)
                        .param("submitMethod", "DRY_RUN")
                        .header("X-User-Id", ACTOR_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isCreated())
                .andReturn();

        // slipNo 추출 후 slipId 조회
        String responseBody = result.getResponse().getContentAsString();
        String slipNo = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(responseBody).get("data").get("slipNo").asText();

        List<Slip> slips = slipRepository.findAll().stream()
                .filter(s -> s.getSlipNo().equals(slipNo))
                .toList();
        assertThat(slips).isNotEmpty();

        UUID slipId = slips.get(0).getId();

        // audit log 기록 확인 (REQUIRES_NEW 트랜잭션 독립 커밋 — IT 환경 가시성 허용)
        // @Transactional IT 는 테스트 후 롤백이므로, REQUIRES_NEW 가 이미 커밋한 audit row 는
        // 동일 IT 내에서 auditLogRepository 로 조회 가능
        var auditLogs = auditLogRepository.findAll().stream()
                .filter(a -> slipId.equals(a.getSlipId()))
                .toList();
        assertThat(auditLogs).isNotEmpty();
    }
}
