import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./context";
import { Layout } from "./components/layout";
import { Empty } from "./components/ui";
import Overview from "./pages/Overview";
import ReviewExplorer from "./pages/ReviewExplorer";
import Sentiment from "./pages/Sentiment";
import {
  Products,
  Recommendations,
  Segments,
  Topics,
  Trends,
} from "./pages/Intelligence";
import { DataManagement, ModelCenter, Reports } from "./pages/Operations";
import { Account, Settings } from "./pages/Account";
import "./styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function DatasetRoutes() {
  const { dataset, profile } = useWorkspace();
  return (
    <Routes key={`${dataset?.id || "demo"}-${profile?.email || "guest"}`}>
      <Route path="/login" element={<Account key="login" mode="login" />} />
      <Route
        path="/register"
        element={<Account key="register" mode="register" />}
      />
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="reviews" element={<ReviewExplorer />} />
        <Route path="sentiment" element={<Sentiment />} />
        <Route path="products" element={<Products />} />
        <Route path="topics" element={<Topics />} />
        <Route path="segments" element={<Segments />} />
        <Route path="trends" element={<Trends />} />
        <Route path="recommendations" element={<Recommendations />} />
        <Route path="models" element={<ModelCenter />} />
        <Route path="data" element={<DataManagement />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="*"
          element={
            <>
              <Empty
                title="Page unavailable"
                text="The requested workspace page could not be found."
              />
              <Link className="button ghost" to="/">
                Back to overview
              </Link>
            </>
          }
        />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <WorkspaceProvider>
          <DatasetRoutes />
        </WorkspaceProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
