"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type TreeViewElement = {
  id: string
  name: string
  type?: "file" | "folder"
  isSelectable?: boolean
  children?: TreeViewElement[]
}

type TreeSortMode =
  | "default"
  | "none"
  | ((left: TreeViewElement, right: TreeViewElement) => number)

type Direction = "rtl" | "ltr"

type TreeContextProps = {
  selectedId: string | undefined
  expandedItems: string[]
  indicator: boolean
  selectItem: (id: string) => void
  setExpandedItems: (expandedItems: string[]) => void
  openIcon?: React.ReactNode
  closeIcon?: React.ReactNode
  direction: Direction
}

const TreeContext = React.createContext<TreeContextProps | null>(null)

function useTree() {
  const context = React.useContext(TreeContext)

  if (!context) {
    throw new Error("useTree must be used within a TreeProvider")
  }

  return context
}

function isFolderElement(element: TreeViewElement) {
  if (element.type) {
    return element.type === "folder"
  }

  return Array.isArray(element.children)
}

const treeCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
})

function defaultTreeComparator(left: TreeViewElement, right: TreeViewElement) {
  const leftIsFolder = isFolderElement(left)
  const rightIsFolder = isFolderElement(right)

  if (leftIsFolder !== rightIsFolder) {
    return leftIsFolder ? -1 : 1
  }

  return treeCollator.compare(left.name, right.name)
}

function getTreeComparator(sort: TreeSortMode) {
  if (sort === "none") {
    return undefined
  }

  if (sort === "default") {
    return defaultTreeComparator
  }

  return sort
}

function sortTreeElements(elements: TreeViewElement[], sort: TreeSortMode): TreeViewElement[] {
  const comparator = getTreeComparator(sort)
  const nextElements = elements.map((element) => {
    if (!Array.isArray(element.children)) {
      return element
    }

    return {
      ...element,
      children: sortTreeElements(element.children, sort),
    }
  })

  if (!comparator) {
    return nextElements
  }

  return [...nextElements].sort(comparator)
}

function renderTreeElements(elements: TreeViewElement[], sort: TreeSortMode): React.ReactNode {
  return sortTreeElements(elements, sort).map((element) => {
    if (isFolderElement(element)) {
      return (
        <Folder key={element.id} value={element.id} element={element.name} isSelectable={element.isSelectable}>
          {Array.isArray(element.children) ? renderTreeElements(element.children, sort) : null}
        </Folder>
      )
    }

    return (
      <File key={element.id} value={element.id} isSelectable={element.isSelectable}>
        <span>{element.name}</span>
      </File>
    )
  })
}

type TreeViewProps = {
  selectedId?: string
  initialSelectedId?: string
  onSelectedIdChange?: (id: string) => void
  indicator?: boolean
  elements?: TreeViewElement[]
  expandedItems?: string[]
  initialExpandedItems?: string[]
  onExpandedItemsChange?: (expandedItems: string[]) => void
  openIcon?: React.ReactNode
  closeIcon?: React.ReactNode
  sort?: TreeSortMode
} & Omit<
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>,
  "defaultValue" | "onValueChange" | "type" | "value"
>

const Tree = React.forwardRef<HTMLDivElement, TreeViewProps>(
  (
    {
      className,
      elements,
      selectedId: controlledSelectedId,
      initialSelectedId,
      onSelectedIdChange,
      expandedItems: controlledExpandedItems,
      initialExpandedItems,
      onExpandedItemsChange,
      children,
      indicator = true,
      openIcon,
      closeIcon,
      sort = "default",
      dir,
      ...props
    },
    ref
  ) => {
    const [uncontrolledSelectedId, setUncontrolledSelectedId] = React.useState<string | undefined>(
      initialSelectedId
    )
    const [uncontrolledExpandedItems, setUncontrolledExpandedItems] = React.useState<string[]>(
      initialExpandedItems ?? []
    )
    const selectedId = controlledSelectedId ?? uncontrolledSelectedId
    const expandedItems = controlledExpandedItems ?? uncontrolledExpandedItems

    const selectItem = React.useCallback(
      (id: string) => {
        if (controlledSelectedId === undefined) {
          setUncontrolledSelectedId(id)
        }

        onSelectedIdChange?.(id)
      },
      [controlledSelectedId, onSelectedIdChange]
    )

    const setExpandedItems = React.useCallback(
      (nextExpandedItems: string[]) => {
        if (controlledExpandedItems === undefined) {
          setUncontrolledExpandedItems(nextExpandedItems)
        }

        onExpandedItemsChange?.(nextExpandedItems)
      },
      [controlledExpandedItems, onExpandedItemsChange]
    )

    const direction: Direction = dir === "rtl" ? "rtl" : "ltr"
    const treeChildren = children ?? (elements ? renderTreeElements(elements, sort) : null)

    return (
      <TreeContext.Provider
        value={{
          selectedId,
          expandedItems,
          indicator,
          selectItem,
          setExpandedItems,
          openIcon,
          closeIcon,
          direction,
        }}
      >
        <ScrollArea ref={ref} className={cn("relative h-full", className)} dir={direction}>
          <AccordionPrimitive.Root
            {...props}
            type="multiple"
            value={expandedItems}
            onValueChange={setExpandedItems}
            className="flex flex-col gap-1"
            dir={direction}
          >
            {treeChildren}
          </AccordionPrimitive.Root>
        </ScrollArea>
      </TreeContext.Provider>
    )
  }
)

Tree.displayName = "Tree"

const TreeIndicator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { direction } = useTree()

    return (
      <div
        dir={direction}
        ref={ref}
        className={cn(
          "absolute top-0 bottom-0 left-1.5 w-px rounded-md bg-border rtl:right-1.5",
          className
        )}
        {...props}
      />
    )
  }
)

TreeIndicator.displayName = "TreeIndicator"

type FolderProps = {
  element: React.ReactNode
  isSelectable?: boolean
  isSelect?: boolean
  openIcon?: React.ReactNode
  closeIcon?: React.ReactNode
  triggerProps?: Omit<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>, "children">
  triggerClassName?: string
  contentClassName?: string
  childrenClassName?: string
  onSelect?: (value: string) => void
} & Omit<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>, "children"> & {
    children?: React.ReactNode
  }

const Folder = React.forwardRef<HTMLDivElement, FolderProps>(
  (
    {
      className,
      element,
      value,
      isSelectable = true,
      isSelect,
      children,
      openIcon,
      closeIcon,
      triggerProps,
      triggerClassName,
      contentClassName,
      childrenClassName,
      onSelect,
      ...props
    },
    ref
  ) => {
    const {
      direction,
      expandedItems,
      indicator,
      selectedId,
      selectItem,
      openIcon: treeOpenIcon,
      closeIcon: treeCloseIcon,
      setExpandedItems,
    } = useTree()
    const isSelected = isSelect ?? selectedId === value
    const isExpanded = expandedItems.includes(value)

    return (
      <AccordionPrimitive.Item
        ref={ref}
        {...props}
        value={value}
        className={cn("relative overflow-hidden", className)}
      >
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger
            {...triggerProps}
            className={cn(
              "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
              isSelected && isSelectable && "bg-accent text-accent-foreground",
              isSelectable && "cursor-pointer",
              triggerProps?.className,
              triggerClassName
            )}
            disabled={!isSelectable || triggerProps?.disabled}
            onClick={(event) => {
              selectItem(value)
              onSelect?.(value)
              triggerProps?.onClick?.(event)
            }}
          >
            <span className="shrink-0">
              {isExpanded
                ? (openIcon ?? treeOpenIcon ?? <FolderOpenIcon className="size-4" />)
                : (closeIcon ?? treeCloseIcon ?? <FolderIcon className="size-4" />)}
            </span>
            {element}
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content
          className={cn(
            "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down relative overflow-hidden text-sm",
            contentClassName
          )}
        >
          {indicator ? <TreeIndicator aria-hidden="true" /> : null}
          <AccordionPrimitive.Root
            dir={direction}
            type="multiple"
            className={cn("ml-5 flex flex-col gap-1 py-1 rtl:mr-5", childrenClassName)}
            value={expandedItems}
            onValueChange={setExpandedItems}
          >
            {children}
          </AccordionPrimitive.Root>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    )
  }
)

Folder.displayName = "Folder"

const File = React.forwardRef<
  HTMLButtonElement,
  {
    value: string
    handleSelect?: (id: string) => void
    isSelectable?: boolean
    isSelect?: boolean
    fileIcon?: React.ReactNode
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(
  (
    {
      value,
      className,
      handleSelect,
      onClick,
      isSelectable = true,
      isSelect,
      fileIcon,
      children,
      ...props
    },
    ref
  ) => {
    const { direction, selectedId, selectItem } = useTree()
    const isSelected = isSelect ?? selectedId === value

    return (
      <button
        ref={ref}
        type="button"
        disabled={!isSelectable}
        className={cn(
          "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          isSelected && isSelectable && "bg-accent text-accent-foreground",
          isSelectable ? "cursor-pointer" : "cursor-not-allowed opacity-50",
          direction === "rtl" ? "rtl" : "ltr",
          className
        )}
        onClick={(event) => {
          selectItem(value)
          handleSelect?.(value)
          onClick?.(event)
        }}
        {...props}
      >
        <span className="shrink-0">{fileIcon ?? <FileIcon className="size-4" />}</span>
        {children}
      </button>
    )
  }
)

File.displayName = "File"

export { File, Folder, Tree, type TreeViewElement }
export type { TreeSortMode }
