package com.samhanair.logis.arologis.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Phase F (D-DF-04) — Signature 사본 4 column + markCopySent 가드 단위 테스트.
 */
class SignatureCopyTest {

    private Signature newAppSignature() {
        return Signature.of(UUID.randomUUID(), SignatureSource.APP, "image-ref",
                LocalDateTime.now(), null, null);
    }

    @Test
    void markCopySent_set_path_phone_and_now() {
        Signature sig = newAppSignature();
        sig.markCopySent("/var/lib/arologis/signature-copies/abc.png", "01012345678");

        assertThat(sig.getCopySentAt()).isNotNull();
        assertThat(sig.getCopyImagePath()).isEqualTo("/var/lib/arologis/signature-copies/abc.png");
        assertThat(sig.getCopyRecipientPhone()).isEqualTo("01012345678");
        assertThat(sig.isCopySent()).isTrue();
    }

    @Test
    void markCopySent_twice_throws_IllegalStateException() {
        Signature sig = newAppSignature();
        sig.markCopySent("/var/lib/arologis/signature-copies/abc.png", "01012345678");

        assertThatThrownBy(() -> sig.markCopySent("/another.png", "01099999999"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 사본 발송 완료");
    }

    @Test
    void markCopyFailure_increment_count_no_sent_set() {
        Signature sig = newAppSignature();
        sig.markCopyFailure();
        sig.markCopyFailure();

        assertThat(sig.getCopySendFailureCount()).isEqualTo(2);
        assertThat(sig.getCopySentAt()).isNull();
        assertThat(sig.isCopySent()).isFalse();
    }
}
