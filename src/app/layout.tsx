import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/montserrat/400.css";
import "@fontsource/anton/400.css";
import "@fontsource/poppins/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/roboto-condensed/400.css";
import "../hyperframes-studio.generated.css";
import "../styles.css";
import "../editor-parity.css";
import "../high-contrast.css";
import "../provider-page.css";
import "../docs.css";
import "../fake-text.css";

export const metadata: Metadata = { title: "DialogueLab Local", description: "A local-first dialogue video studio" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
