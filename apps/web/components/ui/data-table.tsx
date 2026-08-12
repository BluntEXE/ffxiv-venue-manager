"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface DataTableColumn {
  label: string
  hideOnMobile?: boolean
  align?: "right"
}

interface DataTableProps {
  columns: DataTableColumn[]
  isEmpty: boolean
  emptyMessage: string
  children: ReactNode
}

export function DataTable({ columns, isEmpty, emptyMessage, children }: DataTableProps) {
  if (isEmpty) {
    return <p className="text-center text-sm text-muted-foreground py-12">{emptyMessage}</p>
  }

  return (
    <table className="dtable">
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th key={i} className={cn(col.hideOnMobile && "hide", col.align === "right" && "t-num")}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}
