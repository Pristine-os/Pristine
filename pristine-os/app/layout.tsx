import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/search/GlobalSearch";
import SidebarNav from "@/components/nav/SidebarNav";

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

            <SidebarNav />
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