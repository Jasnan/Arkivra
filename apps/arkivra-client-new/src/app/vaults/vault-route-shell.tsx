"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react"
import { Outlet, useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VaultSidebarTree, VAULT_TREE_ROOT_VALUE, type BrowserDropTarget } from "./components/vault-sidebar-tree"
import {
  getVault,
  listFolderTree,
  type FileBrowserItem,
  type FolderTreeDocumentEntry,
  type FolderTreeEntry,
  type VaultDetail,
} from "./vaults.api"

interface VaultRouteHeaderConfig {
  icon: ReactNode
  iconKey?: string
  contentKey?: string
  title: ReactNode
  badge?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

interface VaultRouteSidebarConfig {
  currentFolderId: string | null
  currentDocumentId?: string | null
  onSelectVault?: (vaultId: string) => void
  onSelectFolder?: (folderId: string | null) => void
  onSelectDocument?: (vaultId: string, documentId: string) => void
  onOpenVaultContextMenu?: (event: MouseEvent<HTMLElement>, vaultId: string) => void
  canMoveItems?: boolean
  itemMutationPending?: boolean
  draggedItems?: FileBrowserItem[]
  dropTarget?: BrowserDropTarget | null
  onDragStartItem?: (event: DragEvent<HTMLElement>, item: FileBrowserItem) => void
  onDragEndItem?: () => void
  onDragOverFolder?: (event: DragEvent<HTMLElement>, folderId: string | null) => void
  onDragLeaveFolder?: (event: DragEvent<HTMLElement>, folderId: string | null) => void
  onDropOnFolder?: (event: DragEvent<HTMLElement>, folderId: string | null) => void
  onMoveItems?: (input: { targets: FileBrowserItem[]; destinationId: string | null }) => void
}

interface VaultRouteShellContextValue {
  vaultId: string
  vault: VaultDetail | null
  folders: FolderTreeEntry[]
  treeDocuments: FolderTreeDocumentEntry[]
  loadingTree: boolean
  treeError: string | null
  setFolders: Dispatch<SetStateAction<FolderTreeEntry[]>>
  setTreeDocuments: Dispatch<SetStateAction<FolderTreeDocumentEntry[]>>
  refreshVaultShell: () => Promise<void>
  setHeaderConfig: Dispatch<SetStateAction<VaultRouteHeaderConfig | null>>
  setSidebarConfig: Dispatch<SetStateAction<VaultRouteSidebarConfig>>
}

const VaultRouteShellContext = createContext<VaultRouteShellContextValue | null>(null)

const defaultSidebarConfig: VaultRouteSidebarConfig = {
  currentFolderId: null,
  currentDocumentId: null,
}

export function useOptionalVaultRouteShell() {
  return useContext(VaultRouteShellContext)
}

export function useVaultRouteShell() {
  const context = useOptionalVaultRouteShell()

  if (context === null) {
    throw new Error("useVaultRouteShell must be used inside VaultRouteShell.")
  }

  return context
}

export default function VaultRouteShell() {
  const { vaultId = "" } = useParams()
  const navigate = useNavigate()
  const [vault, setVault] = useState<VaultDetail | null>(null)
  const [folders, setFolders] = useState<FolderTreeEntry[]>([])
  const [treeDocuments, setTreeDocuments] = useState<FolderTreeDocumentEntry[]>([])
  const [loadingTree, setLoadingTree] = useState(true)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [vaultTreeExpandedValue, setVaultTreeExpandedValue] = useState<string[]>([
    VAULT_TREE_ROOT_VALUE,
  ])
  const [headerConfig, setHeaderConfig] = useState<VaultRouteHeaderConfig | null>(null)
  const [sidebarConfig, setSidebarConfig] = useState<VaultRouteSidebarConfig>(defaultSidebarConfig)

  const refreshVaultShell = useCallback(async () => {
    if (!vaultId) return

    const [vaultResult, treeResult] = await Promise.all([
      getVault({ vaultId }),
      listFolderTree({ vaultId }),
    ])

    setVault(vaultResult.vault)
    setFolders(treeResult.folders)
    setTreeDocuments(treeResult.documents)
  }, [vaultId])

  useEffect(() => {
    let ignore = false

    async function loadShell() {
      setLoadingTree(true)
      setTreeError(null)

      try {
        const [vaultResult, treeResult] = await Promise.all([
          getVault({ vaultId }),
          listFolderTree({ vaultId }),
        ])

        if (!ignore) {
          setVault(vaultResult.vault)
          setFolders(treeResult.folders)
          setTreeDocuments(treeResult.documents)
        }
      } catch (error) {
        if (!ignore) {
          setTreeError(error instanceof Error ? error.message : "Unable to load vault.")
        }
      } finally {
        if (!ignore) {
          setLoadingTree(false)
        }
      }
    }

    if (vaultId) {
      void loadShell()
    }

    return () => {
      ignore = true
    }
  }, [vaultId])

  const contextValue = useMemo<VaultRouteShellContextValue>(() => ({
    vaultId,
    vault,
    folders,
    treeDocuments,
    loadingTree,
    treeError,
    setFolders,
    setTreeDocuments,
    refreshVaultShell,
    setHeaderConfig,
    setSidebarConfig,
  }), [folders, loadingTree, refreshVaultShell, treeDocuments, treeError, vault, vaultId])

  const selectVault = sidebarConfig.onSelectVault ?? ((selectedVaultId: string) => {
    navigate(`/vaults/${selectedVaultId}`)
  })
  const selectFolder = sidebarConfig.onSelectFolder ?? ((folderId: string | null) => {
    navigate(folderId ? `/vaults/${vaultId}?folderId=${folderId}` : `/vaults/${vaultId}`)
  })
  const selectDocument = sidebarConfig.onSelectDocument ?? ((selectedVaultId: string, documentId: string) => {
    navigate(`/vaults/${selectedVaultId}/${documentId}`)
  })
  const headerIconKey = headerConfig?.iconKey ?? "vault-route-header-icon"
  const headerContentKey =
    headerConfig?.contentKey ??
    (headerConfig && typeof headerConfig.title === "string" ? headerConfig.title : "vault-route-header-content")

  return (
    <BaseLayout>
      <VaultRouteShellContext.Provider value={contextValue}>
        <div className="-mt-4 md:-mt-6">
          <section className="flex h-[calc(100vh-var(--header-height))] min-h-[640px] flex-col overflow-hidden bg-background">
            <header className="flex h-20 shrink-0 items-center gap-3 overflow-hidden border-b bg-background px-3 py-2">
              {headerConfig ? (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div key={headerIconKey} className="subtle-opacity-enter shrink-0">
                    {headerConfig.icon}
                  </div>
                  <div key={headerContentKey} className="subtle-opacity-enter min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight md:text-2xl">
                        {headerConfig.title}
                      </h1>
                      {headerConfig.badge}
                    </div>
                    {headerConfig.subtitle ? (
                      <div className="mt-1 flex max-h-10 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden text-sm text-muted-foreground">
                        {headerConfig.subtitle}
                        </div>
                      ) : null}
                    </div>
                  {headerConfig.actions ? <div className="flex shrink-0 items-center gap-2">{headerConfig.actions}</div> : null}
                </div>
              ) : (
                <div className="flex min-h-12 flex-1 items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading vault...
                </div>
              )}
            </header>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <aside className="flex h-56 shrink-0 flex-col border-b bg-muted/20 md:h-auto md:w-80 md:border-r md:border-b-0">
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-3">
                    {loadingTree ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Loading tree...</div>
                    ) : treeError ? (
                      <div className="px-2 py-3 text-sm text-destructive">{treeError}</div>
                    ) : (
                      <VaultSidebarTree
                        vaults={vault ? [{ id: vault.id, name: vault.name }] : []}
                        activeVaultId={vaultId}
                        activeVaultRootOnly
                        expandedValue={vaultTreeExpandedValue}
                        onExpandedValueChange={setVaultTreeExpandedValue}
                        currentFolderId={sidebarConfig.currentFolderId}
                        currentDocumentId={sidebarConfig.currentDocumentId}
                        folders={folders}
                        documents={treeDocuments}
                        onSelectVault={selectVault}
                        onSelectFolder={selectFolder}
                        onSelectDocument={selectDocument}
                        onOpenVaultContextMenu={sidebarConfig.onOpenVaultContextMenu}
                        canMoveItems={sidebarConfig.canMoveItems}
                        itemMutationPending={sidebarConfig.itemMutationPending}
                        draggedItems={sidebarConfig.draggedItems}
                        dropTarget={sidebarConfig.dropTarget}
                        onDragStartItem={sidebarConfig.onDragStartItem}
                        onDragEndItem={sidebarConfig.onDragEndItem}
                        onDragOverFolder={sidebarConfig.onDragOverFolder}
                        onDragLeaveFolder={sidebarConfig.onDragLeaveFolder}
                        onDropOnFolder={sidebarConfig.onDropOnFolder}
                        onMoveItems={sidebarConfig.onMoveItems}
                      />
                    )}
                  </div>
                </ScrollArea>
              </aside>
              <main className="flex min-w-0 flex-1 flex-col">
                <Outlet />
              </main>
            </div>
          </section>
        </div>
      </VaultRouteShellContext.Provider>
    </BaseLayout>
  )
}
