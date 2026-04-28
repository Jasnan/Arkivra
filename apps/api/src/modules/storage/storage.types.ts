export type StorageDriver = {
  write: (key: string, data: Buffer) => Promise<void>;
  read: (key: string) => Promise<Buffer>;
  remove: (key: string) => Promise<void>;
  removePrefix?: (prefix: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
};
