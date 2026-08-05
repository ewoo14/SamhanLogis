package com.samhanair.logis.slip.client;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupTransferRequest;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
@Component
public class ArologisDispatchGroupClient {
    private final RestClient client; private final InternalAuthProperties auth;
    public ArologisDispatchGroupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder, InternalAuthProperties auth) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory(); f.setConnectTimeout((int)Duration.ofSeconds(2).toMillis()); f.setReadTimeout((int)Duration.ofSeconds(5).toMillis());
        client = builder.baseUrl("http://arologis-service").requestFactory(f).build(); this.auth = auth;
    }
    public void send(DispatchGroupTransferRequest request) { client.post().uri("/internal/arologis/dispatch-groups").header("X-Internal-Token", auth.getToken()).contentType(MediaType.APPLICATION_JSON).body(request).retrieve().toBodilessEntity(); }
}
