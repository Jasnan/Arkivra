import { Box, Grid } from '@chakra-ui/react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { VAULT_MEMBER_PERMISSIONS } from '@/features/vaults/vaults.types';
import type { VaultMemberPermission } from '@/features/vaults/vaults.types';

export function PermissionCheckboxGrid({
  idPrefix,
  selectedPermissions,
  onSelectedPermissionsChange,
  defaultSelectedPermissions,
  inputName,
  disabled,
  cardBg,
}: {
  idPrefix: string;
  selectedPermissions?: VaultMemberPermission[];
  onSelectedPermissionsChange?: (permissions: VaultMemberPermission[]) => void;
  defaultSelectedPermissions?: VaultMemberPermission[];
  inputName?: string;
  disabled?: boolean;
  cardBg?: string;
}) {
  return (
    <Grid gap="2" templateColumns={{ base: '1fr', sm: '1fr 1fr' }}>
      {VAULT_MEMBER_PERMISSIONS.map((permission) => {
        const id = `${idPrefix}-${permission}`;
        const isControlled =
          selectedPermissions !== undefined && onSelectedPermissionsChange !== undefined;

        return (
          <Label
            key={permission}
            htmlFor={id}
            display="flex"
            alignItems="center"
            gap="3"
            rounded="lg"
            px="4"
            py="3"
            fontSize="sm"
            fontWeight="normal"
            color="fg"
            bg={cardBg}
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
            <Box as="span">{permission}</Box>
          </Label>
        );
      })}
    </Grid>
  );
}
