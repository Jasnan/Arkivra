export type StructuredTextLanguage =
  | 'bash'
  | 'docker'
  | 'ini'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'sql'
  | 'toml'
  | 'tsx'
  | 'typescript'
  | 'xml'
  | 'yaml';

interface LanguageDefinition {
  language: StructuredTextLanguage;
  mimeTypes: readonly string[];
  extensions: readonly string[];
}

const languageDefinitions: readonly LanguageDefinition[] = [
  {
    language: 'json',
    mimeTypes: ['application/json', 'text/json'],
    extensions: ['json'],
  },
  {
    language: 'yaml',
    mimeTypes: ['application/yaml', 'application/x-yaml', 'text/yaml', 'text/x-yaml'],
    extensions: ['yaml', 'yml'],
  },
  {
    language: 'xml',
    mimeTypes: ['application/xml', 'text/xml'],
    extensions: ['xml'],
  },
  {
    language: 'toml',
    mimeTypes: ['application/toml', 'text/toml'],
    extensions: ['toml'],
  },
  {
    language: 'ini',
    mimeTypes: ['text/ini'],
    extensions: ['ini'],
  },
  {
    language: 'sql',
    mimeTypes: ['application/sql', 'text/sql'],
    extensions: ['sql'],
  },
  {
    language: 'javascript',
    mimeTypes: ['application/javascript', 'application/x-javascript', 'text/javascript'],
    extensions: ['cjs', 'js', 'mjs'],
  },
  {
    language: 'typescript',
    mimeTypes: ['application/typescript', 'text/typescript'],
    extensions: ['ts'],
  },
  {
    language: 'tsx',
    mimeTypes: [],
    extensions: ['tsx'],
  },
  {
    language: 'bash',
    mimeTypes: ['application/x-sh', 'text/x-shellscript'],
    extensions: ['bash', 'sh', 'shell', 'zsh'],
  },
  {
    language: 'docker',
    mimeTypes: [],
    extensions: ['dockerfile'],
  },
  {
    language: 'markdown',
    mimeTypes: ['application/markdown', 'application/x-markdown', 'text/markdown', 'text/x-markdown'],
    extensions: ['markdown', 'md', 'mdown', 'mkd'],
  },
];

function getDocumentFileExtension(name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName === 'dockerfile' || normalizedName.endsWith('.dockerfile')) {
    return 'dockerfile';
  }

  const extension = normalizedName.split('.').pop();
  return extension && extension !== normalizedName ? extension : '';
}

export function getStructuredTextLanguage({
  mimeType,
  name,
  originalName,
}: {
  mimeType: string;
  name: string;
  originalName: string;
}): StructuredTextLanguage | null {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const extensions = [name, originalName].map(getDocumentFileExtension);

  if (normalizedMimeType.endsWith('+json')) {
    return 'json';
  }

  if (normalizedMimeType.endsWith('+xml')) {
    return 'xml';
  }

  const definition = languageDefinitions.find(
    (candidate) =>
      candidate.mimeTypes.includes(normalizedMimeType) ||
      extensions.some((extension) => candidate.extensions.includes(extension)),
  );

  return definition?.language ?? null;
}

export function isStructuredTextDocument(input: {
  mimeType: string;
  name: string;
  originalName: string;
}) {
  return getStructuredTextLanguage(input) !== null;
}

export function getStructuredTextDisplayText({
  content,
  language,
}: {
  content: string;
  language: StructuredTextLanguage;
}) {
  if (language !== 'json') {
    return content;
  }

  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
