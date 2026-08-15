import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const definitions: Record<string, { packageJsonPath: string; fileName: string }> = {
  Inter: { packageJsonPath: require.resolve("@fontsource-variable/inter/package.json"), fileName: "inter-latin-wght-normal.woff2" },
  Montserrat: { packageJsonPath: require.resolve("@fontsource/montserrat/package.json"), fileName: "montserrat-latin-400-normal.woff2" },
  Anton: { packageJsonPath: require.resolve("@fontsource/anton/package.json"), fileName: "anton-latin-400-normal.woff2" },
  Poppins: { packageJsonPath: require.resolve("@fontsource/poppins/package.json"), fileName: "poppins-latin-400-normal.woff2" },
  "Bebas Neue": { packageJsonPath: require.resolve("@fontsource/bebas-neue/package.json"), fileName: "bebas-neue-latin-400-normal.woff2" },
  "Roboto Condensed": { packageJsonPath: require.resolve("@fontsource/roboto-condensed/package.json"), fileName: "roboto-condensed-latin-400-normal.woff2" },
  "Titan One": { packageJsonPath: require.resolve("@fontsource/titan-one/package.json"), fileName: "titan-one-latin-400-normal.woff2" },
  "DM Serif Display": { packageJsonPath: require.resolve("@fontsource/dm-serif-display/package.json"), fileName: "dm-serif-display-latin-400-normal.woff2" },
  "Luckiest Guy": { packageJsonPath: require.resolve("@fontsource/luckiest-guy/package.json"), fileName: "luckiest-guy-latin-400-normal.woff2" },
  Teko: { packageJsonPath: require.resolve("@fontsource/teko/package.json"), fileName: "teko-latin-700-normal.woff2" },
  Nunito: { packageJsonPath: require.resolve("@fontsource/nunito/package.json"), fileName: "nunito-latin-700-normal.woff2" },
  "IBM Plex Mono": { packageJsonPath: require.resolve("@fontsource/ibm-plex-mono/package.json"), fileName: "ibm-plex-mono-latin-600-normal.woff2" },
  "Playfair Display": { packageJsonPath: require.resolve("@fontsource/playfair-display/package.json"), fileName: "playfair-display-latin-600-normal.woff2" },
  "Lilita One": { packageJsonPath: require.resolve("@fontsource/lilita-one/package.json"), fileName: "lilita-one-latin-400-normal.woff2" },
  Caveat: { packageJsonPath: require.resolve("@fontsource/caveat/package.json"), fileName: "caveat-latin-600-normal.woff2" },
  Oswald: { packageJsonPath: require.resolve("@fontsource/oswald/package.json"), fileName: "oswald-latin-700-normal.woff2" },
  Manrope: { packageJsonPath: require.resolve("@fontsource/manrope/package.json"), fileName: "manrope-latin-700-normal.woff2" },
  "Inter Tight": { packageJsonPath: require.resolve("@fontsource/inter-tight/package.json"), fileName: "inter-tight-latin-700-normal.woff2" },
  "League Spartan": { packageJsonPath: require.resolve("@fontsource/league-spartan/package.json"), fileName: "league-spartan-latin-700-normal.woff2" },
  Rubik: { packageJsonPath: require.resolve("@fontsource/rubik/package.json"), fileName: "rubik-latin-800-normal.woff2" },
  "Fjalla One": { packageJsonPath: require.resolve("@fontsource/fjalla-one/package.json"), fileName: "fjalla-one-latin-400-normal.woff2" },
  Silkscreen: { packageJsonPath: require.resolve("@fontsource/silkscreen/package.json"), fileName: "silkscreen-latin-400-normal.woff2" },
};

export const captionFontFamilies = Object.keys(definitions);

export function captionFontPath(family: string) {
  const item = definitions[family]; if (!item) throw new Error("Bundled font not found.");
  const packageDirectory = dirname(item.packageJsonPath);
  return join(packageDirectory, "files", item.fileName);
}
export function captionFontFileName(family: string) { return `${family.toLowerCase().replaceAll(" ", "-")}.woff2`; }
