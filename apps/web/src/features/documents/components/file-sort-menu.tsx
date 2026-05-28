import { DocumentSortMenu } from '@/features/documents/components/document-sort-menu';
import type { DocumentSortOption } from '@/features/documents/components/document-sort-menu';
import type { FileBrowserSort } from '@/features/file-browser/components/vault-browser.types';

export const fileSortOptions: Array<DocumentSortOption<FileBrowserSort>> = [
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
  value,
}: {
  ariaLabel?: string;
  hideLabel?: boolean;
  onValueChange: (value: FileBrowserSort) => void;
  value: FileBrowserSort;
}) {
  return (
    <DocumentSortMenu
      ariaLabel={ariaLabel}
      value={value}
      onValueChange={onValueChange}
      options={fileSortOptions}
      variant="toolbar"
      hideLabel={hideLabel}
      iconOnlyOnMobile
      buttonProps={{
        flexShrink: 0,
        w: hideLabel ? 'auto' : { base: '10', sm: '10rem' },
        minW: hideLabel ? '0' : { base: '10', sm: '10rem' },
        maxW: hideLabel ? 'none' : '10rem',
        px: hideLabel ? '3' : { base: '0', sm: '3' },
      }}
    />
  );
}
