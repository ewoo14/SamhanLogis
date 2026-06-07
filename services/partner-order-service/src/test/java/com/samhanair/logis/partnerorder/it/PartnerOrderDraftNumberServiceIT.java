package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.partnerorder.web.dto.DraftCreateRequest;
import com.samhanair.logis.partnerorder.web.dto.DraftResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 임시저장 draftSeq 동시 채번 회귀 테스트.
 *
 * <p>D-LOAD-05 fix8: {@code partner_order_drafts.draft_seq} 는 partnerCode 별 {@code max+1}
 * 로 계산하므로, 같은 거래처의 병렬 draft 생성은 partnerCode 단위 advisory lock 안에서
 * 번호 계산과 INSERT 를 끝내야 한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class PartnerOrderDraftNumberServiceIT extends AbstractPostgresIT {

    @Autowired private PartnerOrderDraftService draftService;

    /** 외부 client 는 서브클래스에서 전부 MockBean 으로 격리한다. */
    @MockBean private EstimateClient estimateClient;
    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("D-LOAD-05 fix8: 같은 거래처 병렬 draft 생성은 draftSeq 중복 없이 저장된다")
    void create_samePartnerParallelCreation_returnsUniqueDraftSeqForEveryCaller() throws Exception {
        String partnerCode = "P-DRAFT-FIX8-" + UUID.randomUUID().toString().substring(0, 8);
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Long>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            int labelSeed = i;
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 임시저장 생성 시작 latch timeout");
                }
                DraftResponse draft = draftService.create(
                        partnerCode,
                        "user-fix8",
                        new DraftCreateRequest("동시 임시저장 " + labelSeed, "{\"items\":[]}"));
                return draft.draftSeq();
            });
        }

        try {
            List<Future<Long>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Long> draftSeqs = new ArrayList<>();
            for (Future<Long> future : futures) {
                draftSeqs.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(draftSeqs).hasSize(workers);
            assertThat(draftSeqs).doesNotHaveDuplicates();
            assertThat(draftSeqs.stream().sorted().toList())
                    .containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L);
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    private static void shutdownAndAwaitTermination(ExecutorService executor) throws InterruptedException {
        executor.shutdown();
        try {
            if (executor.awaitTermination(10, TimeUnit.SECONDS)) {
                return;
            }
            executor.shutdownNow();
            fail("parallel draft number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
