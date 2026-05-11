type DataTransferItemWithFileSystemHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandleLike | null>;
};

interface FileSystemHandleLike {
  kind: 'file' | 'directory';
  name: string;
}

interface FileSystemFileHandleLike extends FileSystemHandleLike {
  kind: 'file';
  getFile: () => Promise<File>;
}

interface FileSystemDirectoryHandleLike extends FileSystemHandleLike {
  kind: 'directory';
  values: () => AsyncIterable<FileSystemHandleLike>;
}

const PATH_EDGE_SLASHES_PATTERN = /^\/+|\/+$/g;

export interface DroppedFile {
  file: File;
  relativePath: string | null;
}

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

function joinPath(...parts: string[]) {
  return parts
    .map(part => part.replace(PATH_EDGE_SLASHES_PATTERN, ''))
    .filter(Boolean)
    .join('/');
}

async function readFileEntry(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(reader: FileSystemDirectoryReader) {
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      return entries;
    }

    entries.push(...batch);
  }
}

async function filesFromEntry(entry: FileSystemEntry): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    const fullPath = 'fullPath' in entry && typeof entry.fullPath === 'string'
      ? entry.fullPath
      : file.name;

    return [{
      file,
      relativePath: joinPath(fullPath) || file.name,
    }];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const directoryEntry = entry as FileSystemDirectoryEntry;
  const entries = await readDirectoryEntries(directoryEntry.createReader());
  const files = await Promise.all(entries.map(filesFromEntry));
  return files.flat();
}

async function filesFromHandle(handle: FileSystemHandleLike, parentPath = ''): Promise<DroppedFile[]> {
  if (handle.kind === 'file') {
    const file = await (handle as FileSystemFileHandleLike).getFile();
    return [{
      file,
      relativePath: joinPath(parentPath, file.name) || file.name,
    }];
  }

  const directoryPath = joinPath(parentPath, handle.name);
  const files: DroppedFile[] = [];
  for await (const entry of (handle as FileSystemDirectoryHandleLike).values()) {
    files.push(...await filesFromHandle(entry, directoryPath));
  }

  return files;
}

async function filesFromItem(item: DataTransferItemWithFileSystemHandle): Promise<DroppedFile[]> {
  if (item.kind !== 'file') {
    return [];
  }

  const entry = item.webkitGetAsEntry?.();
  if (entry) {
    return filesFromEntry(entry);
  }

  const handle = await item.getAsFileSystemHandle?.().catch(() => null);
  if (handle) {
    return filesFromHandle(handle);
  }

  const file = item.getAsFile();
  return file ? [fileToDroppedFile(file)] : [];
}

export function fileToDroppedFile(file: File): DroppedFile {
  const relativePath = (file as FileWithRelativePath).webkitRelativePath;

  return {
    file,
    relativePath: typeof relativePath === 'string' && relativePath.length > 0
      ? relativePath
      : null,
  };
}

export function filesToDroppedFiles(files: File[]) {
  return files.map(fileToDroppedFile);
}

export async function getDroppedFiles(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? []) as DataTransferItemWithFileSystemHandle[];
  if (items.length === 0) {
    return filesToDroppedFiles(Array.from(dataTransfer.files ?? []));
  }

  const files = (await Promise.all(items.map(filesFromItem))).flat();
  return files.length > 0 ? files : filesToDroppedFiles(Array.from(dataTransfer.files ?? []));
}
