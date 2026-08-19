"use client"

import { useState, useEffect } from "react"
import { DataTable } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type RoomItem = {
  id: string
  name: string
  isOccupied: boolean
  note: string | null
  updatedByName: string | null
  locked: boolean
  disabled: boolean
  roomNumber: number | null
}

function derivedStatus(room: RoomItem): { label: string; className: string } {
  if (room.disabled) return { label: "Disabled", className: "neutral" }
  if (room.locked) return { label: "Locked", className: "warning" }
  if (room.isOccupied) return { label: "Occupied", className: "danger" }
  return { label: "Available", className: "vip" }
}

export function RoomsBoard({ venueId, canManage, rooms }: { venueId: string; canManage: boolean; rooms: RoomItem[] }) {
  const [localRooms, setLocalRooms] = useState(rooms)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingRoomNumberId, setEditingRoomNumberId] = useState<string | null>(null)
  const [roomNumberInput, setRoomNumberInput] = useState("")

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
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, isOccupied: nextOccupied, note: nextOccupied ? r.note : null } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: nextOccupied, note: nextOccupied ? room.note ?? "" : "" }),
      })
      if (!res.ok) throw new Error("request failed")
      const updated = await res.json()
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: updated.isOccupied, note: updated.note } : r))
      )
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, isOccupied: room.isOccupied } : r)))
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
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, note: trimmed || null } : r)))
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
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, note: prevNote } : r)))
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
      setLocalRooms((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          isOccupied: false,
          note: null,
          updatedByName: null,
          locked: false,
          disabled: false,
          roomNumber: null,
        },
      ])
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

  async function saveRoomNumber(room: RoomItem) {
    setEditingRoomNumberId(null)
    if (pendingIds.has(room.id)) return
    const raw = roomNumberInput.trim()
    setRoomNumberInput("")
    const roomNumber = raw === "" ? null : parseInt(raw, 10)
    if (raw !== "" && (isNaN(roomNumber!) || roomNumber! < 0 || roomNumber! > 999)) {
      alert("Room number must be 0–999.")
      return
    }
    if (roomNumber === room.roomNumber) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNumber = room.roomNumber
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, roomNumber } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, roomNumber: prevNumber } : r)))
      alert("Failed to update room number.")
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
            { label: "Room #", hideOnMobile: true },
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
                    <button type="button" className="tag neutral" onClick={() => saveRename(room)}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="tag neutral"
                      onClick={() => {
                        setRenamingId(null)
                        setRenameInput("")
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    {room.name}
                    {room.roomNumber != null && (
                      <span className="t-muted" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                        #{room.roomNumber}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="hide">
                {canManage ? (
                  editingRoomNumberId === room.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={roomNumberInput}
                        onChange={(e) => setRoomNumberInput(e.target.value)}
                        placeholder="—"
                        style={{ fontSize: "0.85rem", padding: "2px 6px", width: 60 }}
                        autoFocus
                      />
                      <button type="button" className="tag neutral" onClick={() => saveRoomNumber(room)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="tag neutral"
                        onClick={() => {
                          setEditingRoomNumberId(null)
                          setRoomNumberInput("")
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingRoomNumberId(room.id)
                        setRoomNumberInput(room.roomNumber?.toString() ?? "")
                      }}
                      style={{ cursor: "pointer" }}
                      className={room.roomNumber != null ? "" : "t-muted"}
                    >
                      {room.roomNumber != null ? `#${room.roomNumber}` : "Set #…"}
                    </span>
                  )
                ) : (
                  <span className="t-muted">{room.roomNumber != null ? `#${room.roomNumber}` : "—"}</span>
                )}
              </td>
              <td>
                {(() => {
                  const status = derivedStatus(room)
                  return (
                    <span className={`tag ${status.className}`}>{status.label}</span>
                  )
                })()}
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
                    <button type="button" className="tag neutral" onClick={() => saveNote(room)}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="tag neutral"
                      onClick={() => {
                        setEditingNoteId(null)
                        setNoteInput("")
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingNoteId(room.id)
                      setNoteInput(room.note ?? "")
                    }}
                    style={{ cursor: "pointer" }}
                    className={room.note ? "" : "t-muted"}
                  >
                    {room.note || "Add note…"}
                  </span>
                )}
              </td>
              <td className="hide t-muted">{room.updatedByName ?? "—"}</td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  {room.isOccupied && (
                    <button
                      type="button"
                      className="tag vip"
                      disabled={pendingIds.has(room.id)}
                      onClick={() => toggleStatus(room)}
                    >
                      Release
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        className="tag neutral"
                        onClick={() => {
                          setRenamingId(room.id)
                          setRenameInput(room.name)
                        }}
                      >
                        Rename
                      </button>
                      <button type="button" className="tag danger" onClick={() => deleteRoom(room)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      {canManage && (
        <div className="panel mt-4 p-4 flex items-center gap-3">
          <Input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="New room name…"
            className="max-w-[240px]"
            onKeyDown={(e) => e.key === "Enter" && addRoom()}
          />
          <Button type="button" size="sm" disabled={!newRoomName.trim() || adding} onClick={addRoom}>
            {adding ? "Adding…" : "Add Room"}
          </Button>
        </div>
      )}
    </div>
  )
}
