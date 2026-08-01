import LogoutButton from "@/components/auth/LogoutButton";

export default function Dashboard() {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Dashboard</h1>
      <p>Welcome to Pristine OS</p>
      <LogoutButton />
    </div>
  );
}