import { CalendarDataProvider } from "@/modules/team-calendar/context/CalendarDataProvider"
import { CalendarPage } from "@/modules/team-calendar/components/CalendarPage"

// Team Activity Calendar (docs/team-activity-calendar-spec.md). Auth + the
// "must be an active member" gate land in group 11 (task 11.1 / 11.2).
export default function TeamCalendarPage() {
  return (
    <CalendarDataProvider>
      <CalendarPage />
    </CalendarDataProvider>
  )
}
