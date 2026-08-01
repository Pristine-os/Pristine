"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/dashboard",
    });
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


        <button
          className="bg-black text-white px-4 py-2 rounded w-full"
        >
          Login
        </button>


      </form>

    </div>
  );
}