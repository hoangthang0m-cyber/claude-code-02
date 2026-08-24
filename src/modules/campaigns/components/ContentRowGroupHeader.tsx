import { TableCell, TableRow } from "@/components/ui/table"

export function ContentRowGroupHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <TableRow className="bg-muted/50 hover:bg-muted/50">
      <TableCell colSpan={colSpan} className="py-1.5 text-xs font-semibold text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  )
}
