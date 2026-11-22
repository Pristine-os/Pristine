"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setSubmitting(true);

    const result = await signIn("credentials", {
      email: email.trim(),
      password,
      callbackUrl: "/dashboard",
      redirect: false,
    });

    if (result?.ok && !result.error) {
      window.location.href = result.url ?? "/dashboard";
      return;
    }

    // One message for every failure — wrong password, unknown email, or a
    // temporary block after too many attempts — so the page never reveals
    // which emails have accounts.
    setError(
      "Sign-in failed. Check your email and password. After several failed attempts, sign-in is paused briefly."
    );
    setSubmitting(false);
  }


  return (
    <div className="min-h-screen flex items-center justify-center">

      <form
        onSubmit={handleLogin}
        className="border rounded-lg p-8 w-96 space-y-4"
      >

        <h1 className="text-2xl font-bold">
          Pristine OS Login
        </h1>


        <input
          className="border p-2 w-full"
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />


        <input
          className="border p-2 w-full"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />


        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          disabled={submitting}
          className="bg-black text-white px-4 py-2 rounded w-full disabled:opacity-50"
        >
          {submitting ? "Signing in..." : "Login"}
        </button>


      </form>

    </div>
  );
}