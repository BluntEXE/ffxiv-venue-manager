"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

interface Transaction {
  id: string
  amount: number
  customerName: string | null
  notes: string | null
  createdAt: string
  service: {
    id: string
    name: string
    price: number
  } | null
  event: {
    id: string
    title: string
  } | null
  staff: {
    id: string
    name: string | null
  } | null
}

interface TransactionsListProps {
  initialTransactions: Transaction[]
  initialNextCursor: string | null
  initialHasMore: boolean
  venueId: string
}

export function TransactionsList({
  initialTransactions,
  initialNextCursor,
  initialHasMore,
  venueId,
}: TransactionsListProps) {
  const [transactions, setTransactions] = useState(initialTransactions)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const loadMoreTransactions = async () => {
    if (!nextCursor || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      const response = await fetch(
        `/api/venues/${venueId}/transactions?limit=50&cursor=${nextCursor}`
      )

      if (response.ok) {
        const data = await response.json()
        setTransactions([...transactions, ...data.transactions])
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
    } catch (err) {
      console.error("Failed to load more transactions:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const exportToCSV = () => {
    // CSV Headers
    const headers = ["Date", "Service", "Amount (gil)", "Event"]

    // CSV Rows
    const rows = transactions.map((transaction) => {
      const date = format(new Date(transaction.createdAt), "yyyy-MM-dd HH:mm:ss")
      const service = transaction.service?.name || "Manual Sale"
      const amount = parseFloat(transaction.amount.toString())
      const event = transaction.event?.title || ""

      return [date, service, amount, event]
    })

    // Combine headers and rows
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n")

    // Create download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    link.setAttribute("href", url)
    link.setAttribute("download", `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`)
    link.style.visibility = "hidden"

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <>
      {/* Export Button */}
      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          onClick={exportToCSV}
          disabled={transactions.length === 0}
          className="gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export to CSV
        </Button>
      </div>

      <div className="space-y-4">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {transaction.service ? (
                  <p className="font-semibold">{transaction.service.name}</p>
                ) : (
                  <p className="font-semibold">Manual Sale</p>
                )}
                {transaction.event && (
                  <Badge variant="outline">{transaction.event.title}</Badge>
                )}
              </div>
              {transaction.customerName && (
                <p className="text-sm text-muted-foreground">
                  Customer: {transaction.customerName}
                </p>
              )}
              {transaction.notes && (
                <p className="text-sm text-muted-foreground">{transaction.notes}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span>{format(new Date(transaction.createdAt), "PPp")}</span>
                {transaction.staff && <span>• by {transaction.staff.name}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {parseFloat(transaction.amount.toString()).toLocaleString()} gil
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={loadMoreTransactions}
            disabled={isLoadingMore}
            className="w-full sm:w-auto"
          >
            {isLoadingMore ? "Loading..." : "Load More Transactions"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Showing {transactions.length} of many transactions
          </p>
        </div>
      )}
    </>
  )
}
