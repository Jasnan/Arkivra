export type DocumentConversionInput = {
  fileName: string;
  mimeType: string;
  fileData: Buffer;
};

export type DocumentConversionResult = {
  fileData: Buffer;
  fileName: string;
  mimeType: 'application/pdf';
  converter: string;
  converterVersion: string | null;
};

export type DocumentConverterHealth =
  | {
      configured: false;
      healthy: false;
      provider: null;
      url: null;
      checkedAt: null;
      error: null;
    }
  | {
      configured: true;
      healthy: boolean;
      provider: string;
      url: string;
      checkedAt: string;
      error: string | null;
    };

export type DocumentConverter = {
  provider: string;
  baseUrl: string;
  checkHealth: () => Promise<DocumentConverterHealth>;
  convertToPdf: (input: DocumentConversionInput) => Promise<DocumentConversionResult>;
};
