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

async function filesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await readFileEntry(entry as FileSystemFileEntry)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const directoryEntry = entry as FileSystemDirectoryEntry;
  const entries = await readDirectoryEntries(directoryEntry.createReader());
  const files = await Promise.all(entries.map(filesFromEntry));
  return files.flat();
}

async function filesFromHandle(handle: FileSystemHandleLike): Promise<File[]> {
  if (handle.kind === 'file') {
    return [(await (handle as FileSystemFileHandleLike).getFile())];
  }

  const files: File[] = [];
  for await (const entry of (handle as FileSystemDirectoryHandleLike).values()) {
    files.push(...await filesFromHandle(entry));
  }

  return files;
}

async function filesFromItem(item: DataTransferItemWithFileSystemHandle): Promise<File[]> {
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
  return file ? [file] : [];
}

export async function getDroppedFiles(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? []) as DataTransferItemWithFileSystemHandle[];
  if (items.length === 0) {
    return Array.from(dataTransfer.files ?? []);
  }

  const files = (await Promise.all(items.map(filesFromItem))).flat();
  return files.length > 0 ? files : Array.from(dataTransfer.files ?? []);
}
