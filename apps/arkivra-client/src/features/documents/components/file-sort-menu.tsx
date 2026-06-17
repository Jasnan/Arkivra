import { DocumentSortMenu } from '@/features/documents/components/document-sort-menu';
import type { DocumentSortOption } from '@/features/documents/components/document-sort-menu';
import type { FileBrowserSort } from '@/features/file-browser/components/vault-browser.types';

const fileSortOptions: Array<DocumentSortOption<FileBrowserSort>> = [
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
  { value: 'updated_desc', label: 'Recent' },
  { value: 'updated_asc', label: 'Oldest' },
  { value: 'size_desc', label: 'Largest' },
  { value: 'size_asc', label: 'Smallest' },
];

export function FileSortMenu({
  ariaLabel = 'Sort folder items',
  hideLabel = false,
  onValueChange,
  size = 'md',
  value,
}: {
  ariaLabel?: string;
  hideLabel?: boolean;
  onValueChange: (value: FileBrowserSort) => void;
  size?: 'sm' | 'md';
  value: FileBrowserSort;
}) {
  return (
    <DocumentSortMenu
      ariaLabel={ariaLabel}
      value={value}
      onValueChange={onValueChange}
      options={fileSortOptions}
      size={size}
      variant="toolbar"
      hideLabel={hideLabel}
      iconOnlyOnMobile
      buttonProps={{
        flexShrink: 0,
        w: hideLabel ? 'auto' : { base: 'auto', sm: 'auto' },
      }}
    />
  );
}
