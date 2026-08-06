package com.samhanair.logis.arologis.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * S1 수신 표시 전용 계약의 관찰 가능성 가드.
 *
 * <p>이번 테스트는 삭제 대상 표면을 검사하지 않고, 표시 정본·멱등 수신·빈 목록·전송 상태
 * 관찰 표식이 소스 계약으로 고정되어 있는지 확인한다.
 */
class ReceiveOnlyContractTest {

    private static final Path MAIN = Path.of("src/main");

    @Test
    void received_group_endpoint_is_explicit_canonical_display_contract() throws Exception {
        String controller = read("java/com/samhanair/logis/arologis/web/ReceivedDispatchGroupController.java");
        String page = readFromRepo("clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx");

        assertThat(controller).contains("수신 표시 정본");
        assertThat(page).contains("수신 표시 정본");
    }

    @Test
    void receiver_observes_group_no_upsert() throws Exception {
        String service = read("java/com/samhanair/logis/arologis/service/dispatch/ReceivedDispatchGroupService.java");

        assertThat(service).contains("groupNo={} upsert=UPDATED");
        assertThat(service).contains("groupNo={} upsert=CREATED");
    }

    @Test
    void empty_received_read_is_explicitly_observable() throws Exception {
        String controller = read("java/com/samhanair/logis/arologis/web/ReceivedDispatchGroupController.java");

        assertThat(controller).contains("수신 그룹 0건");
    }

    @Test
    void sender_observes_sent_and_pending_retry_states() throws Exception {
        String service = readFromRepo("services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatchgroup/DispatchGroupService.java");

        assertThat(service).contains("groupNo={} status=SENT");
        assertThat(service).contains("groupNo={} status=PENDING");
    }

    private static String read(String relativePath) throws Exception {
        return Files.readString(MAIN.resolve(relativePath));
    }

    private static String readFromRepo(String relativePath) throws Exception {
        return Files.readString(Path.of("../../", relativePath).normalize());
    }
}
