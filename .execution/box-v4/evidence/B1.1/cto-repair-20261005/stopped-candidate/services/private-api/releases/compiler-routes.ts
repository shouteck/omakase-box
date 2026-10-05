import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { ApprovedReleaseCompiler } from './compiler.js';

export function installCompilationRoutes(app: FastifyInstance, handlers: Pick<ReturnType<typeof authHandlers>, 'requirePermission'>, compiler: ApprovedReleaseCompiler) {
  app.post('/v1/release-candidates/:id/package', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'release.approve');
    if (!actor) return;
    try {
      const id = z.uuid().parse((request.params as { id: string }).id);
      const artifact = await compiler.compile(actor, id, request.body);
      return reply.header('Access-Control-Expose-Headers', 'X-Package-SHA256, X-Runtime-Readiness').header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="task-${artifact.taskId}-v${artifact.taskVersion}.zip"`).header('X-Package-SHA256', artifact.sha256).header('X-Runtime-Readiness', 'unverified').send(artifact.bytes);
    } catch (error) {
      if (error instanceof WorkflowError) return reply.code(error.code === 'forbidden_role' ? 403 : error.code === 'stale_version' ? 409 : 422).send({ error: error.code });
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_input' });
      return reply.code(503).send({ error: 'package_unavailable' });
    }
  });
}
