import { ArrowUpRight, Building2, ShieldCheck } from 'lucide-react';

type Props = {
  busy: boolean;
  error: string;
  onLogin: (email: string, password: string) => Promise<void>;
};

/** Пароль передаётся SDK входа и не сохраняется в состоянии приложения или журналах. */
export default function LoginPage({ busy, error, onLogin }: Props) {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand">
          <Building2 />
          <span>
            контур<span className="brand-caption">ОБЪЕКТЫ И ЗАДАЧИ</span>
          </span>
        </div>
        <h1>С возвращением</h1>
        <p className="muted">Войдите в рабочее пространство команды.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            void onLogin(String(fields.get('email')).trim(), String(fields.get('password')));
          }}
        >
          <label>
            Email
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Пароль
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            Войти
            <ArrowUpRight size={18} />
          </button>
        </form>
        <p className="login-note">
          <ShieldCheck size={16} />
          Доступ выдаёт администратор. Открытая регистрация отсутствует.
        </p>
      </div>
    </main>
  );
}
