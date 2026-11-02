import type { Metadata } from "next";
import "./globals-new.css";

export const metadata: Metadata = {
  title: "Luz Clara · Rincón de Zapata",
  description: "Portal privado de lecturas, consumos y liquidaciones eléctricas.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
