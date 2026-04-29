import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { VAULT_MEMBER_PERMISSIONS } from '@/features/vaults/vaults.types';
import type { VaultMemberPermission } from '@/features/vaults/vaults.types';

export function PermissionCheckboxGrid({
  idPrefix,
  selectedPermissions,
  onSelectedPermissionsChange,
  defaultSelectedPermissions,
  inputName,
  disabled,
  cardClassName,
}: {
  idPrefix: string;
  selectedPermissions?: VaultMemberPermission[];
  onSelectedPermissionsChange?: (permissions: VaultMemberPermission[]) => void;
  defaultSelectedPermissions?: VaultMemberPermission[];
  inputName?: string;
  disabled?: boolean;
  cardClassName?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {VAULT_MEMBER_PERMISSIONS.map((permission) => {
        const id = `${idPrefix}-${permission}`;
        const isControlled =
          selectedPermissions !== undefined && onSelectedPermissionsChange !== undefined;

        return (
          <Label
            key={permission}
            htmlFor={id}
            className={cn(
              'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-normal text-foreground',
              cardClassName,
            )}
          >
            <Checkbox
              id={id}
              name={inputName}
              value={permission}
              checked={isControlled ? selectedPermissions.includes(permission) : undefined}
              defaultChecked={
                !isControlled ? defaultSelectedPermissions?.includes(permission) : undefined
              }
              onCheckedChange={
                isControlled
                  ? (checked) => {
                      if (checked) {
                        onSelectedPermissionsChange([
                          ...new Set([...selectedPermissions, permission]),
                        ]);
                        return;
                      }

                      onSelectedPermissionsChange(
                        selectedPermissions.filter((item) => item !== permission),
                      );
                    }
                  : undefined
              }
              disabled={disabled}
            />
            <span>{permission}</span>
          </Label>
        );
      })}
    </div>
  );
}
