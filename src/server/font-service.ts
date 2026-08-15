import type { ImportFontInput, LocalFontRecord } from "@/shared/contracts";
import { copyFile, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { db, dataDirectory } from "./database";
import { captionFontFamilies, captionFontFileName, captionFontPath } from "./font-assets";
import { projectService } from "./services";

interface FontRow { id: string; family: string; file_name: string; storage_name: string; mime_type: string; font_format: LocalFontRecord["format"]; created_at: string; }
interface StoredFont extends LocalFontRecord { storageName: string; path: string; }

const fontDirectory = join(dataDirectory, "fonts");
const formats = new Map([
  ["font/woff2", { extension: ".woff2", format: "woff2" as const }], ["font/woff", { extension: ".woff", format: "woff" as const }],
  ["font/ttf", { extension: ".ttf", format: "truetype" as const }], ["font/otf", { extension: ".otf", format: "opentype" as const }],
  ["application/font-woff", { extension: ".woff", format: "woff" as const }], ["application/x-font-ttf", { extension: ".ttf", format: "truetype" as const }],
]);

export const fontService = {
  list(): LocalFontRecord[] {
    const builtAt = "bundled";
    const bundled = captionFontFamilies.map((family) => ({ id: `bundled:${family}`, family, fileName: captionFontFileName(family), mimeType: "font/woff2",
      format: "woff2" as const, source: "bundled" as const, fontUrl: `/api/hyperframes/font?family=${encodeURIComponent(family)}`, createdAt: builtAt }));
    const imported = (db().prepare("SELECT * FROM fonts ORDER BY family COLLATE NOCASE").all() as unknown as FontRow[]).map(fromRow);
    return [...bundled, ...imported];
  },
  asset(family: string): { path: string; record: LocalFontRecord } | undefined {
    if (captionFontFamilies.includes(family)) return { path: captionFontPath(family), record: this.list().find((font) => font.family === family)! };
    const row = db().prepare("SELECT * FROM fonts WHERE family = ?").get(family) as unknown as FontRow | undefined;
    if (!row) return undefined; const stored = fromStoredRow(row); return { path: stored.path, record: stored };
  },
  async import(input: ImportFontInput): Promise<LocalFontRecord> {
    const family = input.family.trim().replace(/\s+/g, " ").slice(0, 80); if (!family) throw new Error("Enter a font family name.");
    if (this.list().some((font) => font.family.toLowerCase() === family.toLowerCase())) throw new Error("A font with that family name already exists.");
    const extension = extname(input.file.name).toLowerCase();
    const byExtension = extension === ".woff2" ? { extension, format: "woff2" as const } : extension === ".woff" ? { extension, format: "woff" as const }
      : extension === ".ttf" ? { extension, format: "truetype" as const } : extension === ".otf" ? { extension, format: "opentype" as const } : undefined;
    const details = formats.get(input.file.mimeType) ?? byExtension; if (!details) throw new Error("Choose a WOFF2, WOFF, TTF, or OTF font file.");
    if (!input.file.bytes.length || input.file.bytes.length > 20 * 1024 * 1024) throw new Error("Font files must be between 1 byte and 20 MB.");
    await mkdir(fontDirectory, { recursive: true }); const id = crypto.randomUUID(); const storageName = `${id}${details.extension}`; const target = join(fontDirectory, storageName);
    await writeFile(target, input.file.bytes); const createdAt = new Date().toISOString();
    try { db().prepare("INSERT INTO fonts(id, family, file_name, storage_name, mime_type, font_format, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, family, input.file.name, storageName, input.file.mimeType || mimeType(details.extension), details.format, createdAt); }
    catch (error) { await unlink(target).catch(() => undefined); throw error; }
    return this.list().find((font) => font.id === id)!;
  },
  async importFile(input: { family: string; path: string; mimeType?: string }): Promise<LocalFontRecord> {
    const fileName = input.path.split(/[\\/]/).pop() || "font.woff2"; const size = (await stat(input.path)).size;
    if (size > 20 * 1024 * 1024) throw new Error("Font files must be 20 MB or smaller.");
    const bytes = new Uint8Array(await import("node:fs/promises").then((fs) => fs.readFile(input.path)));
    return this.import({ family: input.family, file: { name: fileName, mimeType: input.mimeType || mimeType(extname(fileName).toLowerCase()), bytes } });
  },
  async remove(id: string): Promise<void> {
    if (id.startsWith("bundled:")) throw new Error("Bundled fonts cannot be removed.");
    const row = db().prepare("SELECT * FROM fonts WHERE id = ?").get(id) as unknown as FontRow | undefined; if (!row) return;
    const usedIn = projectService.list().filter((project) => project.editorState.captions.fontFamily === row.family);
    if (usedIn.length) throw new Error(`Choose another caption font in ${usedIn.map((project) => project.name).join(", ")} before removing it.`);
    await unlink(join(fontDirectory, row.storage_name)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); db().prepare("DELETE FROM fonts WHERE id = ?").run(id);
  },
};

function fromRow(row: FontRow): LocalFontRecord { const { storageName: _storage, path: _path, ...record } = fromStoredRow(row); return record; }
function fromStoredRow(row: FontRow): StoredFont { return { id: row.id, family: row.family, fileName: row.file_name, storageName: row.storage_name,
  path: join(fontDirectory, row.storage_name), mimeType: row.mime_type, format: row.font_format, source: "imported", fontUrl: `/api/hyperframes/font?family=${encodeURIComponent(row.family)}`, createdAt: row.created_at }; }
function mimeType(extension: string): string { return extension === ".woff2" ? "font/woff2" : extension === ".woff" ? "font/woff" : extension === ".otf" ? "font/otf" : "font/ttf"; }
