import { Refine } from "@refinedev/core";
import { FolderOpen, Home, LogOut, ShieldCheck } from "lucide-react";

import { LoginScreen } from "./components/LoginScreen";
import { StorageBrowser } from "./components/StorageBrowser";
import { AppearanceSelector } from "./components/AppearanceSelector";
import { BrandMark } from "./components/BrandMark";
import { useCagnardData } from "./api/useCagnardData";

export function App() {
  const data = useCagnardData();

  return (
    <Refine
      resources={[{ name: "storage" }]}
    >
      {data.authenticated ? (
        <div className="app-shell">
          <aside className="sidebar" aria-label="Storage navigation">
            <div className="brand">
              <BrandMark />
              <div>
                <strong>Cagnard</strong>
                <span>Storage browser</span>
              </div>
            </div>

            <section className="nav-section session-section">
              <div className="nav-title">
                <ShieldCheck size={16} />
                Session
              </div>
              <div className="session-card">
                <div>
                  <strong>{data.session?.user.displayName ?? "Loading"}</strong>
                  <span>{data.session ? `${data.session.user.providerId} / ${data.session.user.subject}` : "..."}</span>
                </div>
                <button className="icon-button compact" onClick={data.logout} title="Sign out of Cagnard on this browser" aria-label="Sign out of Cagnard on this browser" type="button">
                  <LogOut size={15} />
                </button>
              </div>
            </section>

            {data.navigation?.personal && data.navigation.personal.roots.length > 0 ? (
              <section className="nav-section storage-section personal-section">
                <div className="nav-title">
                  <Home size={16} />
                  {data.navigation.personal.label}
                </div>
                {data.navigation.personal.roots.map((root) => (
                  <button
                    className={data.selectedRoot?.id === root.id ? "nav-item active" : "nav-item"}
                    key={root.id}
                    onClick={() => data.selectRoot(root)}
                    type="button"
                  >
                    {root.label}
                  </button>
                ))}
              </section>
            ) : null}

            {data.navigation?.global && data.navigation.global.roots.length > 0 ? (
              <section className="nav-section storage-section global-section">
                <div className="nav-title">
                  <FolderOpen size={16} />
                  {data.navigation.global.label}
                </div>
                {data.navigation.global.roots.map((root) => (
                  <button
                    className={data.selectedRoot?.id === root.id ? "nav-item active" : "nav-item"}
                    key={root.id}
                    onClick={() => data.selectRoot(root)}
                    type="button"
                  >
                    {root.label}
                  </button>
                ))}
              </section>
            ) : null}

            <div className="sidebar-appearance">
              <AppearanceSelector />
            </div>
          </aside>

          {!data.loading && !data.session?.personalEnabled && !data.session?.globalEnabled ? (
            <main className="no-storage-access" aria-labelledby="no-storage-title">
              <ShieldCheck size={32} aria-hidden="true" />
              <h1 id="no-storage-title">You’re signed in</h1>
              <p>Your account has no storage access yet. Ask your Cagnard administrator to assign access.</p>
              <button className="primary-button" type="button" onClick={() => void data.logout()}>Sign out of Cagnard</button>
            </main>
          ) : <StorageBrowser state={data} />}
        </div>
      ) : (
        <LoginScreen state={data} />
      )}
    </Refine>
  );
}
