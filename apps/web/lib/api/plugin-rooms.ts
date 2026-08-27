import type { Room } from "@/lib/api/xvm-api"

/**
 * Translates xvm-api's Room shape to the plugin's fixed C# DTO
 * (VenueManager/XIVAppApiModels.cs — already shipped, not ours to change).
 * `IsOccupied` derives from `status` rather than mirroring a field xvm-api
 * doesn't have under that name.
 */
export function toPluginRoom(room: Room) {
  return {
    id: String(room.id),
    name: room.name ?? "",
    // xvm-api's status vocabulary is disabled/reserved/locked/available -
    // "reserved" is the live-hold state, there's no "occupied".
    isOccupied: room.status === "reserved",
    note: room.notes,
    locked: room.locked,
    disabled: room.disabled,
    roomNumber: room.room_number ?? 0,
  }
}

export function parsePluginRoomId(roomId: string): number | null {
  const id = Number(roomId)
  return Number.isInteger(id) ? id : null
}
