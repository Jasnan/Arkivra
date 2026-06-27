import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

export type BinaryDiagnostic = {
  byteLength: number;
  sha256: string;
  pdfPageCount: number | null;
};

function isPdfFile({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  return mimeType.toLowerCase() === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function toExactUint8Array(data: Buffer): Uint8Array {
  return Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

export async function getPdfPageCount({
  fileData,
  fileName,
  mimeType,
}: {
  fileData: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<number | null> {
  if (!isPdfFile({ mimeType, fileName })) {
    return null;
  }

  try {
    const pdf = await PDFDocument.load(toExactUint8Array(fileData), { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

export async function buildBinaryDiagnostic({
  fileData,
  fileName,
  mimeType,
}: {
  fileData: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<BinaryDiagnostic> {
  return {
    byteLength: fileData.length,
    sha256: sha256Hex(fileData),
    pdfPageCount: await getPdfPageCount({ fileData, fileName, mimeType }),
  };
}
