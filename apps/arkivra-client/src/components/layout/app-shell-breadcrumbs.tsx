/* eslint-disable react-refresh/only-export-components */
import { Fragment as ReactFragment } from 'react';
import { Link } from '@tanstack/react-router';
import { Text } from '@chakra-ui/react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ROUTES } from '@/app/routes';
import { adminNavItems, isChatPath, settingsNavItems } from '@/components/layout/app-shell-navigation';

export interface BreadcrumbEntry {
  label: string;
  to?: string;
}

function truncateBreadcrumbLabel(label: string, maxLength = 10) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 3).trimEnd()}...`;
}

function getVisibleBreadcrumbs(breadcrumbs: BreadcrumbEntry[]) {
  if (breadcrumbs.length <= 4) {
    return breadcrumbs;
  }

  return [
    breadcrumbs[0],
    breadcrumbs[1],
    null,
    breadcrumbs.at(-2)!,
    breadcrumbs.at(-1)!,
  ];
}

export function buildBreadcrumbs({
  pathname,
  transferVaultId,
  vaultName,
  documentName,
}: {
  pathname: string;
  transferVaultId?: string | null;
  vaultName?: string;
  documentName?: string;
}): BreadcrumbEntry[] {
  const parts = pathname.split('/').filter(Boolean);
  const currentDocumentLabel = documentName ?? 'Document';

  if (parts.length === 0 || pathname === ROUTES.vaults) return [{ label: 'Vaults' }];
  if (isChatPath(pathname)) return [{ label: 'Chat' }];
  if (pathname === ROUTES.trash) return [{ label: 'Trash' }];
  if (parts[0] === 'trash' && parts[1]) return [{ label: 'Trash', to: ROUTES.trash }, { label: currentDocumentLabel }];
  if (pathname === ROUTES.tags) return [{ label: 'Tags' }];
  if (pathname === ROUTES.search) return [{ label: 'Search' }];
  if (parts[0] === 'settings') {
    if (pathname === ROUTES.twoFactorSetup) {
      return [
        { label: 'Settings', to: ROUTES.settingsAccount },
        { label: 'Security', to: ROUTES.settingsSecurity },
        { label: 'Set up 2FA' },
      ];
    }

    if (pathname === ROUTES.twoFactorManage) {
      return [
        { label: 'Settings', to: ROUTES.settingsAccount },
        { label: 'Security', to: ROUTES.settingsSecurity },
        { label: 'Manage 2FA' },
      ];
    }

    const sectionLabel = settingsNavItems.find((item) => item.to === pathname)?.label;
    return sectionLabel ? [{ label: 'Settings', to: ROUTES.settingsAccount }, { label: sectionLabel }] : [{ label: 'Settings' }];
  }
  if (parts[0] === 'admin') {
    const sectionLabel = adminNavItems.find((item) => item.to === pathname)?.label;
    return sectionLabel ? [{ label: 'Admin', to: ROUTES.adminOverview }, { label: sectionLabel }] : [{ label: 'Admin' }];
  }
  if (pathname === ROUTES.transfers) {
    if (!transferVaultId) return [{ label: 'Upload' }];

    return [
      { label: 'Vaults', to: ROUTES.vaults },
      { label: vaultName ?? 'Vault', to: ROUTES.vaultRoot(transferVaultId) },
      { label: 'Upload' },
    ];
  }

  if (parts[0] === 'vaults' && parts[1]) {
    const vaultLabel = vaultName ?? 'Vault';
    const vaultRootPath = ROUTES.vaultRoot(parts[1]);
    const base: BreadcrumbEntry[] = [
      { label: 'Vaults', to: ROUTES.vaults },
      { label: vaultLabel, to: vaultRootPath },
    ];

    if (parts.length === 2) return base;
    if (parts[2] === 'members') return [...base, { label: 'Members' }];
    if (parts[2] === 'settings') return [...base, { label: 'Settings' }];
    if (parts[2] === 'activity') return [...base, { label: 'Activity' }];
    if (parts[2] === 'chat') return [...base, { label: 'Chat' }];
    if (parts[3] === 'chat') return [...base, { label: currentDocumentLabel }, { label: 'Chat' }];
    if (parts[2]) return [...base, { label: currentDocumentLabel }];

    return base;
  }

  return [{ label: 'Arkivra' }];
}


export function DefaultBreadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbEntry[] }) {
  const visibleBreadcrumbs = getVisibleBreadcrumbs(breadcrumbs);

  return (
    <Breadcrumb minW="0">
      <BreadcrumbList flexWrap="nowrap" color="shell.inactiveForeground">
        {visibleBreadcrumbs.map((item, index) => {
          const isLast = index === visibleBreadcrumbs.length - 1;

          if (item === null) {
            return (
              <ReactFragment key="breadcrumb-ellipsis">
                {index > 0 ? <BreadcrumbSeparator color="shell.inactiveForeground" /> : null}
                <BreadcrumbItem flexShrink={0}>
                  <Text aria-hidden="true" color="shell.inactiveForeground">...</Text>
                </BreadcrumbItem>
              </ReactFragment>
            );
          }

          const label = truncateBreadcrumbLabel(item.label);

          return (
            <ReactFragment key={`${item.to ?? item.label}-${item.label}`}>
              {index > 0 ? <BreadcrumbSeparator color="shell.inactiveForeground" /> : null}
              <BreadcrumbItem minW="0" flexShrink={isLast ? 1 : 0}>
                {item.to && !isLast ? (
                  <Link to={item.to} style={{ minWidth: 0, color: 'inherit' }}>
                    <Text title={item.label} truncate fontWeight="medium" transition="colors" _hover={{ color: 'shell.foreground' }}>
                      {label}
                    </Text>
                  </Link>
                ) : (
                  <BreadcrumbPage title={item.label} className="truncate" color="shell.foreground">{label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </ReactFragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
