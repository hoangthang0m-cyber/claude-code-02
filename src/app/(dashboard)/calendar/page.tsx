import { CalendarAccessGate } from "@/modules/team-calendar/components/CalendarAccessGate"
import { CalendarDataProvider } from "@/modules/team-calendar/context/CalendarDataProvider"
import { CalendarPage } from "@/modules/team-calendar/components/CalendarPage"

// Team Activity Calendar (docs/team-activity-calendar-spec.md). The shared
// AuthGuard (dashboard layout) requires sign-in and deep-links back here after
// login (task 11.1); CalendarAccessGate blocks a signed-in non-member (task
// 11.2). Both wrap the data provider so `members` is available to the gate.
export default function TeamCalendarPage() {
  return (
    <CalendarDataProvider>
      <CalendarAccessGate>
        <CalendarPage />
      </CalendarAccessGate>
    </CalendarDataProvider>
  )
}
