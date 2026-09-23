"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import styles from "./staff.module.css";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className={styles.login}>
      <label htmlFor="staff-password" className={styles.label}>
        Staff password
      </label>
      <input
        id="staff-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className={styles.input}
        aria-describedby={state.error ? "login-error" : undefined}
        aria-invalid={state.error ? true : undefined}
      />
      {state.error && (
        <p id="login-error" className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
