import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, endpoint } from "./services/api";
import type { Dataset, Profile } from "./types";

type Workspace = {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  dataset: Dataset | undefined;
  datasets: Dataset[];
  selectDataset: (id?: number) => void;
  theme: string;
  setTheme: (theme: string) => void;
  threshold: number;
  setThreshold: (threshold: number) => void;
  notify: (message: string, kind?: "error" | "success") => void;
  health: { accounts_enabled: boolean; durable_storage: boolean } | undefined;
};
const Context = createContext<Workspace | null>(null);

function readProfile() {
  try {
    return JSON.parse(
      sessionStorage.getItem("verdictra-session") || "null",
    ) as Profile | null;
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [profile, updateProfile] = useState(readProfile);
  const [chosen, selectDataset] = useState<number>();
  const [theme, updateTheme] = useState(
    () => localStorage.getItem("verdictra-theme") || "dark",
  );
  const [threshold, updateThreshold] = useState(
    () => Number(localStorage.getItem("verdictra-threshold")) || 15,
  );
  const [notice, setNotice] = useState<{
    message: string;
    kind: string;
    id: number;
  }>();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api<Workspace["health"]>("/health"),
  });
  const inventory = useQuery({
    queryKey: ["datasets", profile?.email],
    queryFn: () => api<Dataset[]>("/datasets", profile?.access_token),
  });
  const datasets = inventory.data || [];
  const dataset =
    datasets.find((item) => item.id === chosen) ||
    datasets.find((item) => item.is_demo);
  function setProfile(next: Profile | null) {
    client.removeQueries();
    updateProfile(next);
    selectDataset(undefined);
    if (next) sessionStorage.setItem("verdictra-session", JSON.stringify(next));
    else sessionStorage.removeItem("verdictra-session");
  }
  function setTheme(next: string) {
    updateTheme(next);
    localStorage.setItem("verdictra-theme", next);
  }
  function setThreshold(next: number) {
    updateThreshold(next);
    localStorage.setItem("verdictra-threshold", String(next));
  }
  function notify(message: string, kind: "error" | "success" = "success") {
    const id = Date.now();
    setNotice({ message, kind, id });
    window.setTimeout(
      () => setNotice((current) => (current?.id === id ? undefined : current)),
      4500,
    );
  }
  return (
    <Context.Provider
      value={{
        profile,
        setProfile,
        dataset,
        datasets,
        selectDataset,
        theme,
        setTheme,
        threshold,
        setThreshold,
        notify,
        health: health.data,
      }}
    >
      <div data-theme={theme} className="workspace-root">
        {children}
        {notice && (
          <button
            className={`toast ${notice.kind}`}
            role="status"
            onClick={() => setNotice(undefined)}
          >
            {notice.message}
            <span aria-hidden>×</span>
          </button>
        )}
      </div>
    </Context.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider is missing");
  return value;
}

export function useData<T>(
  path: string,
  filters: Record<string, string | number | boolean | undefined> = {},
  enabled = true,
  poll?: number,
) {
  const { dataset, profile } = useWorkspace();
  const url = endpoint(path, dataset?.id, filters);
  return useQuery({
    queryKey: ["api", url, profile?.email],
    queryFn: () => api<T>(url, profile?.access_token),
    enabled,
    refetchInterval: poll,
  });
}
