import { Refine } from "@refinedev/core";
import { FolderOpen, Home, LogOut, Plug, ShieldCheck } from "lucide-react";

import { LoginScreen } from "./components/LoginScreen";
import { StorageBrowser } from "./components/StorageBrowser";
import { useCagnardData } from "./api/useCagnardData";

export function App() {
  const data = useCagnardData();

  return (
    <Refine
      resources={[
        { name: "storage" },
        { name: "plugins" }
      ]}
    >
      {data.authenticated ? (
        <div className="app-shell">
          <aside className="sidebar" aria-label="Storage navigation">
            <div className="brand">
              <div className="brand-mark">C</div>
              <div>
                <strong>Cagnard</strong>
                <span>Storage browser</span>
              </div>
            </div>

            <section className="nav-section">
              <div className="nav-title">
                <ShieldCheck size={16} />
                Session
              </div>
              <div className="session-card">
                <div>
                  <strong>{data.session?.user.displayName ?? "Loading"}</strong>
                  <span>{data.session?.user.id ?? "..."}</span>
                </div>
                <button className="icon-button compact" onClick={data.logout} title="Logout" type="button">
                  <LogOut size={15} />
                </button>
              </div>
            </section>

            {data.navigation?.personal && data.navigation.personal.roots.length > 0 ? (
              <section className="nav-section">
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
              <section className="nav-section">
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

            <section className="nav-section">
              <div className="nav-title">
                <Plug size={16} />
                UI plugins
              </div>
              {data.uiPlugins.map((plugin) => (
                <div className="plugin-row" key={plugin.id}>
                  <span>{plugin.label}</span>
                  <small>{plugin.kind}</small>
                </div>
              ))}
            </section>
          </aside>

          <StorageBrowser state={data} />
        </div>
      ) : (
        <LoginScreen state={data} />
      )}
    </Refine>
  );
}
