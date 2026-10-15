import { createRequire } from "node:module";
import path from "node:path";
import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { HttpError } from "../config.js";

const pdf = createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js") as typeof import("pdf-parse");
const maxArchiveSize = 25 * 1024 * 1024;

function validateDocxArchive(buffer: Buffer): void {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const directorySignature = 0x02014b50;
  const endOffset = buffer.lastIndexOf(endSignature);
  if (endOffset < 0 || endOffset + 22 > buffer.length) {
    throw new HttpError(422, "The DOCX document is not a valid Office archive.", "INVALID_DOCUMENT");
  }
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const directoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entries = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0 || directoryDisk !== 0 || entries > 500
    || directoryOffset + directorySize > endOffset
    || entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff
  ) {
    throw new HttpError(422, "The DOCX archive structure is not supported.", "INVALID_DOCUMENT");
  }

  let offset = directoryOffset;
  let totalUncompressed = 0;
  let hasDocumentXml = false;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > directoryOffset + directorySize || buffer.readUInt32LE(offset) !== directorySignature) {
      throw new HttpError(422, "The DOCX archive directory is invalid.", "INVALID_DOCUMENT");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + filenameLength + extraLength + commentLength;
    if (nextOffset > directoryOffset + directorySize || (flags & 1) !== 0 || (method !== 0 && method !== 8)) {
      throw new HttpError(422, "The DOCX archive uses an unsupported or encrypted entry.", "INVALID_DOCUMENT");
    }
    if (
      compressedSize === 0xffffffff || uncompressedSize === 0xffffffff
      || uncompressedSize > maxArchiveSize
      || (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > 100)
    ) {
      throw new HttpError(413, "The DOCX archive expands beyond the permitted size.", "DOCUMENT_TOO_LARGE");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxArchiveSize) {
      throw new HttpError(413, "The DOCX archive expands beyond the permitted size.", "DOCUMENT_TOO_LARGE");
    }
    const name = buffer.toString("utf8", offset + 46, offset + 46 + filenameLength);
    if (name === "word/document.xml") hasDocumentXml = true;
    offset = nextOffset;
  }
  if (!hasDocumentXml) {
    throw new HttpError(422, "The DOCX archive does not contain a readable document.", "INVALID_DOCUMENT");
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const xml = await new Promise<string>((resolve, reject) => {
    let foundDocument = false;
    let documentSize = 0;
    const chunks: Uint8Array[] = [];
    const unzip = new Unzip((file) => {
      if (file.name !== "word/document.xml") {
        file.terminate();
        return;
      }
      foundDocument = true;
      file.ondata = (error, chunk, final) => {
        if (error) {
          reject(new HttpError(422, "The DOCX document could not be decompressed.", "INVALID_DOCUMENT"));
          return;
        }
        documentSize += chunk.length;
        if (documentSize > 10 * 1024 * 1024) {
          file.terminate();
          reject(new HttpError(413, "The DOCX document text is too large to process.", "DOCUMENT_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
        if (final) resolve(Buffer.concat(chunks.map((part) => Buffer.from(part)), documentSize).toString("utf8"));
      };
    });
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    try {
      unzip.push(buffer, true);
      if (!foundDocument) reject(new HttpError(422, "The DOCX archive does not contain a readable document.", "INVALID_DOCUMENT"));
    } catch {
      reject(new HttpError(422, "The DOCX archive could not be read.", "INVALID_DOCUMENT"));
    }
  });
  const decodeXml = (value: string) => value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs.map((paragraph) => {
    const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXml(match[1] ?? ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    return text;
  }).filter(Boolean).join("\n");
}

const allowedTypes = new Map([
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
]);

export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const extension = path.extname(filename).toLowerCase();
  if (allowedTypes.get(extension) !== mimetype) {
    throw new HttpError(415, "Upload a PDF, DOCX, TXT or Markdown document.", "UNSUPPORTED_FILE_TYPE");
  }

  let text: string;
  if (extension === ".pdf") {
    const result = await pdf(buffer, { max: 250 });
    text = result.text;
  } else if (extension === ".docx") {
    validateDocxArchive(buffer);
    text = await extractDocxText(buffer);
  } else {
    text = buffer.toString("utf8");
  }

  const cleaned = text.replace(/\u0000/g, "").trim();
  if (!cleaned) throw new HttpError(422, "No readable text was found in this document.", "EMPTY_DOCUMENT");
  return cleaned.slice(0, 120_000);
}
