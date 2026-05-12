export interface Tag {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  documentsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
