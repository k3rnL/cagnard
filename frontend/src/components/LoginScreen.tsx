import { FormEvent, useMemo, useState } from "react";
import { KeyRound, LogIn, ShieldCheck, UserRound } from "lucide-react";

import type { CagnardDataState } from "../api/useCagnardData";
import type { AuthProviderMetadata } from "../api/types";

interface LoginScreenProps {
  state: CagnardDataState;
}

export function LoginScreen({ state }: LoginScreenProps) {
  const staticProviders = useMemo(
    () => state.authProviders.filter((provider) => provider.kind === "static"),
    [state.authProviders]
  );
  const externalProviders = useMemo(
    () => state.authProviders.filter((provider) => provider.kind !== "static"),
    [state.authProviders]
  );
  const selectedProvider = staticProviders[0];

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Sign in">
        <div className="brand login-brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>Cagnard</strong>
            <span>Storage browser</span>
          </div>
        </div>

        {selectedProvider ? <StaticProviderForm provider={selectedProvider} state={state} /> : null}

        {externalProviders.length > 0 ? (
          <div className="external-provider-list">
            {externalProviders.map((provider) => (
              <a className="provider-button" href={provider.loginUrl ?? "#"} key={provider.id}>
                <ShieldCheck size={17} />
                <span>{provider.label}</span>
              </a>
            ))}
          </div>
        ) : null}

        {!state.loading && state.authProviders.length === 0 ? (
          <div className="error-banner">No login provider is available.</div>
        ) : null}

        {state.error && state.authProviders.length === 0 ? <div className="error-banner">{state.error}</div> : null}
      </section>
    </main>
  );
}

function StaticProviderForm({ provider, state }: { provider: AuthProviderMetadata; state: CagnardDataState }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const usernameField = provider.fields.find((field) => field.name === "username");
  const passwordField = provider.fields.find((field) => field.name === "password");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await state.login(provider.id, username, password);
  }

  return (
    <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="login-heading">
        <KeyRound size={20} />
        <h1>{provider.label}</h1>
      </div>

      <label className="login-field">
        <span>{usernameField?.label ?? "User"}</span>
        <div className="login-input">
          <UserRound size={16} aria-hidden="true" />
          <input
            autoComplete="username"
            autoFocus
            onChange={(event) => setUsername(event.target.value)}
            required={usernameField?.required ?? true}
            type="text"
            value={username}
          />
        </div>
      </label>

      <label className="login-field">
        <span>{passwordField?.label ?? "Password"}</span>
        <div className="login-input">
          <KeyRound size={16} aria-hidden="true" />
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required={passwordField?.required ?? true}
            type="password"
            value={password}
          />
        </div>
      </label>

      {state.loginError ? <div className="error-banner">{state.loginError}</div> : null}

      <button className="primary-button" disabled={state.loginLoading} type="submit">
        <LogIn size={18} />
        <span>{state.loginLoading ? "Signing in" : "Sign in"}</span>
      </button>
    </form>
  );
}
