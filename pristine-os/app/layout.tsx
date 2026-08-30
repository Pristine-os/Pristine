import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/search/GlobalSearch";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "Pristine OS",
  description: "Dry Cleaning Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body style={{ margin: 0, fontFamily: "Arial" }}>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          
          {/* Sidebar */}
          <aside
            className="print:hidden"
            style={{
              width: "220px",
              background: "#111827",
              color: "white",
              padding: "20px",
            }}
          >
            <h2 style={{ marginBottom: "20px" }}>Pristine OS</h2>

            <nav
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <a href="/counter" style={{ color: "white", textDecoration: "none", fontWeight: "bold" }}>
                Counter
              </a>
              <a href="/production" style={{ color: "white", textDecoration: "none", fontWeight: "bold" }}>
                Production
              </a>
              <a href="/dashboard" style={{ color: "white", textDecoration: "none" }}>
                Dashboard
              </a>
              <a href="/customers" style={{ color: "white", textDecoration: "none" }}>
                Customers
              </a>
              <a href="/orders" style={{ color: "white", textDecoration: "none" }}>
                Orders
              </a>
              <a href="/garments" style={{ color: "white", textDecoration: "none" }}>
                Garments
              </a>
              <a href="/payments" style={{ color: "white", textDecoration: "none" }}>
                Payments
              </a>

              <div style={{ marginTop: "20px" }}>
                <a
                  href="/login"
                  style={{ color: "#f87171", textDecoration: "none" }}
                >
                  Logout
                </a>
              </div>
            </nav>
          </aside>

          {/* Main Content */}
          <main
            style={{
              flex: 1,
              background: "#f3f4f6",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <div className="border-b bg-white px-4 py-3 flex justify-center print:hidden">
              <GlobalSearch />
            </div>

            <div style={{ flex: 1, padding: "10px" }}>
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}