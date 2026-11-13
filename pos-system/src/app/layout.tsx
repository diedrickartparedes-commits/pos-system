import "./styles.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "MyPOS | H&A Home Centre", description: "Business point of sale" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
