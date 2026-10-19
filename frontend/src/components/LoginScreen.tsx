import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, LogIn, ShieldCheck, UserRound } from "lucide-react";

import type { CagnardDataState } from "../api/useCagnardData";
import type { AuthProviderMetadata } from "../api/types";
import { cagnardApi } from "../api/client";
import { AppearanceSelector } from "./AppearanceSelector";
import { BrandMark } from "./BrandMark";

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
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const selectedProvider = staticProviders.find((provider) => provider.id === selectedProviderId) ?? staticProviders[0];
  const [ssoPending, setSSOPending] = useState<string>();
  const [ssoError, setSSOError] = useState<string>();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("authError")) {
      setSSOError("SSO sign-in could not be completed. Please try again.");
      url.searchParams.delete("authError");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  async function startSSO(providerId: string) {
    setSSOPending(providerId); setSSOError(undefined);
    try {
      const result = await cagnardApi.startOIDC(providerId);
      window.location.assign(result.authorizationUrl);
    } catch {
      setSSOError("SSO is temporarily unavailable. Please try again.");
      setSSOPending(undefined);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Sign in">
        <div className="login-appearance">
          <AppearanceSelector compact />
        </div>
        <div className="brand login-brand">
          <BrandMark />
          <div>
            <strong>Cagnard</strong>
            <span>Storage browser</span>
          </div>
        </div>

        {staticProviders.length > 1 ? <label className="login-field">Account provider<select value={selectedProvider?.id} onChange={(event) => setSelectedProviderId(event.target.value)}>{staticProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label> : null}
        {selectedProvider ? <StaticProviderForm key={selectedProvider.id} provider={selectedProvider} state={state} /> : null}

        {externalProviders.length > 0 ? (
          <div className="external-provider-list">
            {externalProviders.map((provider) => (
              <button type="button" className="provider-button" disabled={Boolean(ssoPending)} aria-busy={ssoPending === provider.id} onClick={() => void startSSO(provider.id)} key={provider.id}>
                <ShieldCheck size={17} />
                <span>{ssoPending === provider.id ? "Connecting…" : provider.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        {ssoError ? <div className="error-banner" role="alert">{ssoError}</div> : null}

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

      {state.loginError ? <div className="error-banner" role="alert">{state.loginError}</div> : null}

      <button className="primary-button" disabled={state.loginLoading} type="submit">
        <LogIn size={18} />
        <span>{state.loginLoading ? "Signing in" : "Sign in"}</span>
      </button>
    </form>
  );
}
