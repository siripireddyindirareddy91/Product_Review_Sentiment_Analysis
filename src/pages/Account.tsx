import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, LockKeyhole, Moon, Sun } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Brand } from "../components/layout";
import { Failure, Heading, Panel, Tag } from "../components/ui";
import { useWorkspace } from "../context";
import { api } from "../services/api";
import type { Profile } from "../types";

export function Account({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setProfile, health, notify } = useWorkspace();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: ({ demo }: { demo?: boolean }) =>
      api<Profile>(`/auth/${demo ? "login" : mode}`, undefined, {
        method: "POST",
        body: JSON.stringify(
          demo
            ? { email: "demo@verdictra.example", password: "VerdictraDemo2026" }
            : { email, password },
        ),
      }),
    onSuccess: (profile) => {
      setProfile(profile);
      notify(
        profile.role === "viewer" ? "Signed in as demo viewer." : "Signed in.",
      );
      navigate(register ? "/data" : "/");
    },
  });
  return (
    <div className="account-page">
      <Brand />
      <div className="account-card panel">
        <span className="metric-icon positive">
          <LockKeyhole size={21} />
        </span>
        <h1>{register ? "Create your account" : "Sign in to VERDICTRA"}</h1>
        <p>
          {register
            ? "Create a private workspace for your review datasets."
            : "Access your datasets and sentiment reports."}
        </p>
        {health?.accounts_enabled === false && (
          <div className="alert-inline">
            Personal accounts are unavailable in this deployment. You can still
            use the demo.
          </div>
        )}
        {mutation.error && <Failure error={mutation.error} />}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({});
          }}
        >
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={mutation.isPending || health?.accounts_enabled === false}
          >
            {mutation.isPending
              ? "Please wait…"
              : register
                ? "Create account"
                : "Sign in"}{" "}
            <ArrowRight size={16} />
          </button>
        </form>
        {!register && (
          <button
            className="button ghost"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ demo: true })}
          >
            Sign in as demo viewer
          </button>
        )}
        <div className="split">
          <Link className="text-link" to={register ? "/login" : "/register"}>
            {register ? "Back to sign in" : "Create an account"}
          </Link>
          <Link className="text-link" to="/">
            Browse demo <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const {
    theme,
    setTheme,
    threshold,
    setThreshold,
    profile,
    setProfile,
    health,
  } = useWorkspace();
  return (
    <>
      <Heading
        title="Settings"
        description="Manage your profile, display preferences, and alert threshold."
      />
      <Panel
        title="Account"
        subtitle={
          profile
            ? "Current workspace identity"
            : "You are browsing the public demo."
        }
      >
        {profile ? (
          <div className="split">
            <div className="chips">
              <strong>{profile.email}</strong>
              <Tag label={profile.role} />
            </div>
            <button className="button ghost" onClick={() => setProfile(null)}>
              Sign out
            </button>
          </div>
        ) : (
          <Link to="/login" className="button primary">
            Sign in <ArrowRight size={15} />
          </Link>
        )}
        {health?.durable_storage === false && (
          <div className="panel-note">
            This deployment uses read-only demo storage.
          </div>
        )}
      </Panel>
      <Panel title="Appearance" subtitle="The theme is saved in this browser.">
        <div className="actions">
          <button
            className={`button ${theme === "dark" ? "primary" : "ghost"}`}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme("dark")}
          >
            <Moon size={16} /> Dark
          </button>
          <button
            className={`button ${theme === "light" ? "primary" : "ghost"}`}
            aria-pressed={theme === "light"}
            onClick={() => setTheme("light")}
          >
            <Sun size={16} /> Light
          </button>
        </div>
      </Panel>
      <Panel
        title="Negative sentiment alerts"
        subtitle="Alert when the negative review share rises by at least this many percentage points."
      >
        <label className="inline-field">
          Threshold{" "}
          <input
            type="number"
            min="1"
            max="100"
            value={threshold}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (value >= 1 && value <= 100) setThreshold(value);
            }}
          />
        </label>
      </Panel>
    </>
  );
}
