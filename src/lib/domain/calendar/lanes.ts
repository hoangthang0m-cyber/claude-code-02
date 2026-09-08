// Interval-graph lane assignment for overlapping timed items in the Day / Week
// grid (Mục B `calendar-views` — "các mục chồng giờ được xếp cạnh nhau chia đều
// bề ngang"; Mục D task 6.3). Pure.

export interface TimeSpan {
  id: string
  startMin: number
  endMin: number
}

export interface LaneAssignment {
  id: string
  lane: number // 0-based column within its overlap cluster
  laneCount: number // columns the cluster needs — item width = 1 / laneCount
}

export function packLanes(spans: readonly TimeSpan[]): LaneAssignment[] {
  const sorted = [...spans].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin
  )

  const out: LaneAssignment[] = []
  let cluster: { span: TimeSpan; lane: number }[] = []
  let clusterMaxEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    const laneCount = Math.max(...cluster.map((c) => c.lane)) + 1
    for (const c of cluster) {
      out.push({ id: c.span.id, lane: c.lane, laneCount })
    }
    cluster = []
    clusterMaxEnd = -Infinity
  }

  for (const span of sorted) {
    // no overlap with anything in the current cluster → start a new one
    if (span.startMin >= clusterMaxEnd) flush()

    const taken = new Set(
      cluster
        .filter((c) => c.span.endMin > span.startMin)
        .map((c) => c.lane)
    )
    let lane = 0
    while (taken.has(lane)) lane++

    cluster.push({ span, lane })
    clusterMaxEnd = Math.max(clusterMaxEnd, span.endMin)
  }
  flush()

  return out
}
