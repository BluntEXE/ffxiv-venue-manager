"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DateTimePickerProps {
  date?: Date
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
}

/** A native time input reports "" while a segment is mid-entry, never a partial string. */
function parseTime(value: string): [number, number] | [null, null] {
  const [hoursStr, minutesStr] = value.split(":")
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  if (!hoursStr || !minutesStr || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return [null, null]
  }
  return [hours, minutes]
}

export function DateTimePicker({ date, onDateChange, placeholder = "Pick a date and time" }: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date)
  const [time, setTime] = React.useState<string>(date ? format(date, "HH:mm") : "00:00")

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      const [hours, minutes] = parseTime(time)
      if (hours === null || minutes === null) {
        setSelectedDate(newDate)
        onDateChange(undefined)
        return
      }
      newDate.setHours(hours, minutes)
      setSelectedDate(newDate)
      onDateChange(newDate)
    }
  }

  const handleTimeChange = (newTime: string) => {
    setTime(newTime)
    if (selectedDate) {
      const [hours, minutes] = parseTime(newTime)
      if (hours === null || minutes === null) {
        onDateChange(undefined)
        return
      }
      const updatedDate = new Date(selectedDate)
      updatedDate.setHours(hours, minutes)
      setSelectedDate(updatedDate)
      onDateChange(updatedDate)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn("flex-1 justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : <span>{placeholder}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} initialFocus />
          </PopoverContent>
        </Popover>
        <Input type="time" value={time} onChange={(e) => handleTimeChange(e.target.value)} className="w-32" />
      </div>
      <p className="text-xs text-muted-foreground">Your local time — 24-hour format (00:00 = midnight, 12:00 = noon)</p>
    </div>
  )
}
