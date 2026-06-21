'use client'

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PipelineNodeKey, PipelineNodeState } from '@/lib/types'
import { PIPELINE_EDGES, PIPELINE_NODES, nodeConfig } from '@/lib/pipeline'
import { PipelineNode } from './PipelineNode'
import { PipelineEdge } from './PipelineEdge'

const nodeTypes = { scoutNode: PipelineNode }
const edgeTypes = { scoutEdge: PipelineEdge }

const NUM_NODES = PIPELINE_NODES.length // 7
const NODE_GAP = 12     // px between nodes
const NODE_HEIGHT = 96  // approximate card height

// Arc (rainbow) shape constants
const ARC_AMPLITUDE   = 100  // how high the peak rises above endpoints (px in graph space)
const ARC_BASE_Y      = 200  // top-left y of endpoint nodes (graph space)

// Horizontal layout constants
const H_CONTAINER_H = 240
const H_Y = Math.floor((H_CONTAINER_H - NODE_HEIGHT) / 2)

export type PipelineLayout = 'horizontal' | 'arc'

interface Props {
  states: Record<PipelineNodeKey, PipelineNodeState>
  selectedKey: PipelineNodeKey | null
  onSelect: (key: PipelineNodeKey) => void
  interactive?: boolean
  layout?: PipelineLayout
}

function arcY(i: number): number {
  return ARC_BASE_Y - ARC_AMPLITUDE * Math.sin((Math.PI * i) / (NUM_NODES - 1))
}

export function Pipeline({
  states,
  selectedKey,
  onSelect,
  interactive = false,
  layout = 'arc',
}: Props): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(960)

  // Sync to real container width before first paint, then track changes
  useLayoutEffect(() => {
    if (wrapRef.current) setContainerW(wrapRef.current.clientWidth)
  }, [])
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(Math.floor(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fluid node width: fill the container exactly, min 80px
  const nodeWidth = Math.max(80, Math.floor((containerW - (NUM_NODES - 1) * NODE_GAP) / NUM_NODES))

  // Re-key ReactFlow when layout or nodeWidth tier changes so fitView+viewport reset
  // Quantise to 60 px buckets to avoid excessive remounts on smooth resize
  const rfKey = `${layout}-${Math.round(nodeWidth / 60) * 60}`

  const nodes = useMemo<Node[]>(() => {
    return PIPELINE_NODES.map((cfg, i) => {
      const x = i * (nodeWidth + NODE_GAP)
      const y = layout === 'arc' ? arcY(i) : H_Y
      return {
        id: cfg.key,
        type: 'scoutNode',
        position: { x, y },
        style: { width: nodeWidth },
        draggable: false,
        selectable: false,
        data: {
          friendlyLabel: cfg.friendlyLabel,
          technicalLabel: cfg.technicalLabel,
          friendlyDescription: cfg.friendlyDescription,
          technicalDescription: cfg.technicalDescription,
          icon: cfg.icon,
          hue: cfg.hue,
          status: states[cfg.key]?.status ?? 'idle',
          selected: selectedKey === cfg.key,
          onSelect: () => onSelect(cfg.key),
          nodeWidth,
        },
      }
    })
  }, [states, selectedKey, onSelect, layout, nodeWidth])

  const edges = useMemo<Edge[]>(() => {
    return PIPELINE_EDGES.map((e) => {
      const src = states[e.from]?.status ?? 'idle'
      const dst = states[e.to]?.status ?? 'idle'
      let state: 'idle' | 'flowing' | 'ok' | 'blocked' = 'idle'
      if (src === 'blocked') state = 'blocked'
      else if (src === 'ok' && (dst === 'active' || dst === 'held')) state = 'flowing'
      else if (src === 'ok') state = 'ok'
      return {
        id: `${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        type: 'scoutEdge',
        data: { state },
        animated: state === 'flowing',
      }
    })
  }, [states])

  const containerH = layout === 'arc' ? 'h-[320px]' : 'h-[240px]'

  return (
    <div
      ref={wrapRef}
      className={`relative ${containerH} w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] transition-[height] duration-300`}
    >
      <ReactFlowProvider>
        <ReactFlow
          key={rfKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          // Nodes are sized to fill the container at zoom=1 — no fitView compression
          fitView={false}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          panOnDrag={interactive}
          panOnScroll={false}
          zoomOnScroll={interactive}
          zoomOnPinch={interactive}
          zoomOnDoubleClick={interactive}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(255,255,255,0.06)"
          />
          {interactive && (
            <Controls
              showInteractive={false}
              className="
                !bg-white/[0.04] !border-white/[0.08] !rounded-xl !shadow-none
                [&>button]:!bg-transparent [&>button]:!border-white/[0.07]
                [&>button]:!text-white/55 [&>button:hover]:!bg-white/[0.08]
                [&>button:hover]:!text-white [&>button]:!rounded-lg
                [&>button+button]:!mt-0.5
              "
            />
          )}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

export { nodeConfig }
