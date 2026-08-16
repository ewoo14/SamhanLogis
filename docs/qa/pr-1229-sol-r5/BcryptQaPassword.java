import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class BcryptQaPassword {
    public static void main(String[] args) {
        String password = System.getenv("QA_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("QA_PASSWORD 누락");
        }
        System.out.print(new BCryptPasswordEncoder().encode(password));
    }
}
