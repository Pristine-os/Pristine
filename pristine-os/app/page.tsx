import Image from "next/image";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f6f8",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: "48px",
          fontWeight: "bold",
          marginBottom: "10px",
        }}
      >
        Pristine OS
      </h1>

      <p
        style={{
          fontSize: "22px",
          color: "#555",
          marginBottom: "40px",
        }}
      >
        The Operating System for Modern Dry Cleaners
      </p>

      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "700px",
          boxShadow: "0 4px 12px rgba(0,0,0,.08)",
        }}
      >
        <h2>🚀 Development Progress</h2>

        <ul style={{ lineHeight: 2 }}>
          <li>✅ Next.js Installed</li>
          <li>✅ Git Repository Connected</li>
          <li>✅ Development Server Running</li>
          <li>⬜ Login Screen</li>
          <li>⬜ Dashboard</li>
          <li>⬜ Customers</li>
          <li>⬜ Orders</li>
          <li>⬜ Garment Tracking</li>
          <li>⬜ Payments</li>
        </ul>
      </div>
    </main>
  );
}