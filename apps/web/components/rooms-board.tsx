"use client"

import { useState, useEffect } from "react"
import { DataTable } from "@/components/ui/data-table"

export type RoomItem = {
  id: string
  name: string
  isOccupied: boolean
  note: string | null
  updatedByName: string | null
}

export function RoomsBoard({
  venueId,
  canManage,
  rooms,
}: {
  venueId: string
  canManage: boolean
  rooms: RoomItem[]
}) {
  const [localRooms, setLocalRooms] = useState(rooms)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [adding, setAdding] = useState(false)

  // Live sync via SSE — same bus/stream route the Live Mode page uses.
  useEffect(() => {
    const es = new EventSource("/api/stream/" + venueId)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== "room_status") return
        setLocalRooms((prev) =>
          prev.map((r) =>
            r.id === msg.data.roomId
              ? { ...r, isOccupied: msg.data.isOccupied, note: msg.data.note, updatedByName: msg.data.updatedByName }
              : r
          )
        )
      } catch {}
    }
    return () => es.close()
  }, [venueId])

  async function toggleStatus(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    const nextOccupied = !room.isOccupied
    setPendingIds((prev) => new Set(prev).add(room.id))
    setLocalRooms((prev) =>
      prev.map((r) => (r.id === room.id ? { ...r, isOccupied: nextOccupied } : r))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: nextOccupied, note: room.note ?? undefined }),
      })
      if (!res.ok) throw new Error("request failed")
      const updated = await res.json()
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: updated.isOccupied, note: updated.note } : r))
      )
    } catch {
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: room.isOccupied } : r))
      )
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function saveNote(room: RoomItem) {
    const trimmed = noteInput.trim()
    setEditingNoteId(null)
    setNoteInput("")
    if (pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNote = room.note
    setLocalRooms((prev) =>
      prev.map((r) => (r.id === room.id ? { ...r, note: trimmed || null } : r))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: room.isOccupied, note: trimmed }),
      })
      if (!res.ok) throw new Error("request failed")
      const updated = await res.json()
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: updated.isOccupied, note: updated.note } : r))
      )
    } catch {
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, note: prevNote } : r))
      )
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function addRoom() {
    const name = newRoomName.trim()
    if (!name || adding) return
    setAdding(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || "Failed to add room")
        return
      }
      const created = await res.json()
      setLocalRooms((prev) => [...prev, { id: created.id, name: created.name, isOccupied: false, note: null, updatedByName: null }])
      setNewRoomName("")
    } catch {
      alert("Network error adding room.")
    } finally {
      setAdding(false)
    }
  }

  async function saveRename(room: RoomItem) {
    const name = renameInput.trim()
    setRenamingId(null)
    setRenameInput("")
    if (!name || name === room.name || pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevName = room.name
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name: prevName } : r)))
      alert("Failed to rename room.")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function deleteRoom(room: RoomItem) {
    if (!confirm(`Delete "${room.name}"? This can't be undone.`)) return
    const prevList = localRooms
    setLocalRooms((prev) => prev.filter((r) => r.id !== room.id))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms(prevList)
      alert("Failed to delete room.")
    }
  }

  return (
    <div>
      <div className="panel">
        <DataTable
          columns={[
            { label: "Room" },
            { label: "Status" },
            { label: "Note" },
            { label: "Last updated by", hideOnMobile: true },
            { label: "" },
          ]}
          isEmpty={localRooms.length === 0}
          emptyMessage="No rooms yet."
        >
          {localRooms.map((room) => (
                <tr key={room.id}>
                  <td className="t-name">
                    {renamingId === room.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          style={{ fontSize: "0.85rem", padding: "2px 6px", width: 140 }}
                          autoFocus
                        />
                        <button type="button" className="tag neutral" onClick={() => saveRename(room)}>Save</button>
                        <button type="button" className="tag neutral" onClick={() => { setRenamingId(null); setRenameInput("") }}>Cancel</button>
                      </div>
                    ) : (
                      room.name
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleStatus(room)}
                      disabled={pendingIds.has(room.id)}
                      className={`tag ${room.isOccupied ? "danger" : "vip"}`}
                      style={{ cursor: pendingIds.has(room.id) ? "default" : "pointer", opacity: pendingIds.has(room.id) ? 0.6 : 1 }}
                    >
                      {room.isOccupied ? "Occupied" : "Free"}
                    </button>
                  </td>
                  <td>
                    {editingNoteId === room.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          type="text"
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder="Note…"
                          style={{ fontSize: "0.85rem", padding: "2px 6px", width: 160 }}
                          autoFocus
                        />
                        <button type="button" className="tag neutral" onClick={() => saveNote(room)}>Save</button>
                        <button type="button" className="tag neutral" onClick={() => { setEditingNoteId(null); setNoteInput("") }}>Cancel</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => { setEditingNoteId(room.id); setNoteInput(room.note ?? "") }}
                        style={{ cursor: "pointer" }}
                        className={room.note ? "" : "t-muted"}
                      >
                        {room.note || "Add note…"}
                      </span>
                    )}
                  </td>
                  <td className="hide t-muted">{room.updatedByName ?? "—"}</td>
                  <td>
                    {canManage && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="tag neutral" onClick={() => { setRenamingId(room.id); setRenameInput(room.name) }}>Rename</button>
                        <button type="button" className="tag danger" onClick={() => deleteRoom(room)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
          ))}
        </DataTable>
      </div>

      {canManage && (
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="New room name…"
            style={{ fontSize: "0.85rem", padding: "4px 8px", width: 200 }}
          />
          <button type="button" className="tag vip" disabled={!newRoomName.trim() || adding} onClick={addRoom}>
            Add Room
          </button>
        </div>
      )}
    </div>
  )
}
