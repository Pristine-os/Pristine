"use client";

import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();

  function login() {
    document.cookie = "loggedIn=true; path=/";
    router.push("/dashboard");
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Login</h1>

      <button
        onClick={login}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: "#111827",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Login
      </button>
    </div>
  );
}