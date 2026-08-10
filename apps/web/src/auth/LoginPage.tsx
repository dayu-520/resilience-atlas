import { useState } from "react";

export function LoginPage({
  message,
  onLogin,
}: {
  message?: string;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <p className="eyebrow">Research Asset Platform</p>
        <h1>企业内部科研资产平台</h1>
        <label>
          邮箱
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          密码
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {message && <p className="form-message">{message}</p>}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}
