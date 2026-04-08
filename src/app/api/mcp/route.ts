export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import crypto from 'crypto'
import { getUserByMcpKeyHash } from '@/lib/db/queries/users'
import { mcpTools } from '@/lib/mcp/tools'

function resolveUser(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const match = auth.match(/^Bearer (.+)$/)
  if (!match) return null

  const rawKey = match[1]
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex')
  return getUserByMcpKeyHash(hash) ?? null
}

async function createMcpResponse(req: NextRequest) {
  const user = resolveUser(req)
  if (!user || !user.isActive) {
    return new NextResponse(null, { status: 401 })
  }

  const server = new McpServer({ name: 'wiselogger', version: '1.0.0' })

  for (const tool of mcpTools) {
    server.tool(tool.name, tool.description, tool.schema.shape, async (args) => {
      const result = tool.execute(args as Record<string, unknown>, user.id)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    })
  }

  // Stateless transport — new instance per request, per-user isolation
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  })

  await server.connect(transport)
  return transport.handleRequest(req)
}

export async function GET(req: NextRequest) {
  return createMcpResponse(req)
}

export async function POST(req: NextRequest) {
  return createMcpResponse(req)
}

export async function DELETE(req: NextRequest) {
  return createMcpResponse(req)
}
