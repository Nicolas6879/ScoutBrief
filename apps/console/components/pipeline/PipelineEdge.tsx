'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export interface ScoutEdgeData {
  state: 'idle' | 'flowing' | 'ok' | 'blocked'
}

const STROKE_BY_STATE: Record<NonNullable<ScoutEdgeData['state']>, string> = {
  idle: 'rgba(255,255,255,0.12)',
  flowing: 'url(#flow-gradient)',
  ok: 'rgba(34,197,94,0.55)',
  blocked: 'rgba(239,68,68,0.55)',
}

export function PipelineEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: EdgeProps): React.ReactElement {
  const d = (data as unknown as ScoutEdgeData | undefined) ?? { state: 'idle' }

  // Bezier curves look smoother than smooth-step for the arc layout
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35,
  })

  const stroke = STROKE_BY_STATE[d.state]
  const animated = d.state === 'flowing'

  return (
    <>
      <defs>
        <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: animated ? 2.5 : 1.5,
          strokeLinecap: 'round',
          filter: animated ? 'drop-shadow(0 0 6px rgba(124,92,255,0.6))' : 'none',
        }}
        className={animated ? 'flow-active' : ''}
      />
      {animated && (
        <circle r={3} fill="#22d3ee" filter="drop-shadow(0 0 4px #22d3ee)">
          <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  )
}
