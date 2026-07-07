package com.samhanair.logis.accounting.it.collab;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.AuthAccountLookupClient;
import com.samhanair.logis.accounting.client.NotificationClient;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.it.AbstractPostgresIT;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.transaction.annotation.Transactional;

/**
 * 입금보고서 Yjs coedit relay 통합 테스트.
 *
 * <p>원장 Journal 은 만들지 않고 CashReceipt DRAFT 헤더 문서만 대상으로 한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "cash-coedit-user", authorities = {"ROLE_ACCOUNTANT"})
class CashReceiptCoeditIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ACTOR_ID = "20000000-0000-0000-0000-000000000011";
    private static final UUID PARTNER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final AtomicInteger SEQ = new AtomicInteger(100);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private CashReceiptRepository cashReceiptRepository;

    @MockBean private AuthAccountLookupClient authAccountLookupClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    /** DRAFT 수기 입금보고서는 update snapshot 누적과 awareness relay 를 허용한다. */
    @Test
    void coedit_update_accumulates_andAwarenessIsEphemeral_forDraftManualReceipt() throws Exception {
        UUID receiptId = seedDraftManualReceipt("20990707-CED-" + SEQ.getAndIncrement()).getId();

        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/coedit", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/update", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isOk());

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/awareness", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "Y3Vyc29y"))))
                .andExpect(status().isOk());

        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/coedit", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(1))
                .andExpect(jsonPath("$.data.updates[0]").value("dXBkYXRl"));
    }

    /** VIEW/UPDATE 권한 가드는 입금보고서 page-code(accounting.cash-receipts)를 사용한다. */
    @Test
    void coedit_permissionGuards_useCashReceiptPageCode() throws Exception {
        UUID readDeniedId = seedDraftManualReceipt("20990707-CVR-" + SEQ.getAndIncrement()).getId();
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.cash-receipts"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/coedit", readDeniedId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isForbidden());

        UUID writeDeniedId = seedDraftManualReceipt("20990707-CUW-" + SEQ.getAndIncrement()).getId();
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.cash-receipts"), eq(PermissionAction.VIEW)))
                .thenReturn(true);
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.cash-receipts"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/update", writeDeniedId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isForbidden());
    }

    /** CONFIRMED, BANK_LINKED, CANCELLED 입금보고서는 coedit relay 자체를 409 로 거부한다. */
    @Test
    void coedit_rejectsNonDraftOrBankLinkedReceipt_onAllEndpoints() throws Exception {
        CashReceipt confirmed = seedDraftManualReceipt("20990707-CONF-" + SEQ.getAndIncrement());
        confirmed.confirm();
        cashReceiptRepository.saveAndFlush(confirmed);

        UUID bankLinkedId = cashReceiptRepository.saveAndFlush(CashReceipt.createBankLinked(
                "20990707-BANK-" + SEQ.getAndIncrement(),
                PARTNER_ID,
                BigDecimal.valueOf(90000),
                LocalDate.of(2099, 7, 7),
                "통장연계",
                "102",
                "110")).getId();

        CashReceipt cancelled = seedDraftManualReceipt("20990707-CAN-" + SEQ.getAndIncrement());
        cancelled.confirm();
        cancelled.cancel();
        cashReceiptRepository.saveAndFlush(cancelled);

        // DRAFT + DEPOSIT_REPORT: 앱 팩토리(fromMig7Staging)로는 항상 CONFIRMED 라 정상경로로는 도달 불가하나,
        // allow-list(status != DRAFT || kind != MANUAL_RECEIPT) fail-closed 가드를 reflection 으로 DRAFT
        // DEPOSIT_REPORT 상태를 만들어 고정한다(향후 kind 조건이 실수로 완화돼도 CI 가 잡도록).
        CashReceipt draftDeposit = seedDraftManualReceipt("20990707-DEP-" + SEQ.getAndIncrement());
        java.lang.reflect.Field kindField = CashReceipt.class.getDeclaredField("kind");
        kindField.setAccessible(true);
        kindField.set(draftDeposit, com.samhanair.logis.accounting.domain.CashReceiptKind.DEPOSIT_REPORT);
        cashReceiptRepository.saveAndFlush(draftDeposit);

        assertAllCoeditEndpointsReturn(confirmed.getId(), status().isConflict());
        assertAllCoeditEndpointsReturn(bankLinkedId, status().isConflict());
        assertAllCoeditEndpointsReturn(cancelled.getId(), status().isConflict());
        assertAllCoeditEndpointsReturn(draftDeposit.getId(), status().isConflict());
    }

    /** soft-delete 된 입금보고서는 coedit relay 모든 표면에서 404 로 숨긴다. */
    @Test
    void coedit_rejectsSoftDeletedReceipt_onAllEndpoints() throws Exception {
        CashReceipt deleted = seedDraftManualReceipt("20990707-DEL-" + SEQ.getAndIncrement());
        deleted.softDeleteDraft(ACTOR_ID);
        cashReceiptRepository.saveAndFlush(deleted);

        assertAllCoeditEndpointsReturn(deleted.getId(), status().isNotFound());
    }

    /** 빈 coedit payload 는 400 으로 거부되고 snapshot 에 누적되지 않는다. */
    @Test
    void coedit_update_nullOrEmptyBody_returns400_andNotPersisted() throws Exception {
        UUID receiptId = seedDraftManualReceipt("20990707-CUN-" + SEQ.getAndIncrement()).getId();

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/update", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/update", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/coedit", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));
    }

    /** SSE stream 도 VIEW 권한 가드를 적용해 미인가자를 403 으로 거부한다. */
    @Test
    void coedit_stream_deniedWithoutViewPermission_returns403() throws Exception {
        UUID receiptId = seedDraftManualReceipt("20990707-CSD-" + SEQ.getAndIncrement()).getId();
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.cash-receipts"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/stream", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isForbidden());
    }

    /** awareness 도 VIEW 권한 가드를 적용해 미인가자를 403 으로 거부한다. */
    @Test
    void coedit_awareness_deniedWithoutViewPermission_returns403() throws Exception {
        UUID denyId = seedDraftManualReceipt("20990707-CAD-" + SEQ.getAndIncrement()).getId();
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.cash-receipts"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/awareness", denyId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "Y3Vyc29y"))))
                .andExpect(status().isForbidden());
    }

    private CashReceipt seedDraftManualReceipt(String slipNo) {
        return cashReceiptRepository.saveAndFlush(CashReceipt.createManual(
                slipNo,
                PARTNER_ID,
                BigDecimal.valueOf(120000),
                LocalDate.of(2099, 7, 7),
                "수기 입금",
                "102",
                "110"));
    }

    private void assertAllCoeditEndpointsReturn(UUID receiptId, ResultMatcher expectedStatus) throws Exception {
        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/coedit", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(expectedStatus);

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/update", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(expectedStatus);

        mvc.perform(post("/accounting/cash-receipts/{receiptId}/collab/coedit/awareness", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "Y3Vyc29y"))))
                .andExpect(expectedStatus);

        mvc.perform(get("/accounting/cash-receipts/{receiptId}/collab/stream", receiptId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .accept(MediaType.TEXT_EVENT_STREAM, MediaType.APPLICATION_JSON))
                .andExpect(expectedStatus);
    }
}
