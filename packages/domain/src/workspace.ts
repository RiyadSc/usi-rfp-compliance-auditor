import { z } from 'zod';

export const workspaceStatusSchema = z.enum(['active', 'archived']);
export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;

/** Empty form fields arrive as ''; normalize to undefined before validation. */
const emptyToUndefined = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v));

/** Input contract for creating an opportunity workspace (PRD FR-001). */
export const workspaceCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(120, 'Workspace name must be at most 120 characters'),
  customer: emptyToUndefined
    .refine((v) => v === undefined || v.length <= 120, 'Customer must be at most 120 characters')
    .optional(),
  deadline: emptyToUndefined
    .refine(
      (v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'Deadline must be an ISO date (YYYY-MM-DD)',
    )
    .optional(),
  description: emptyToUndefined
    .refine(
      (v) => v === undefined || v.length <= 2000,
      'Description must be at most 2000 characters',
    )
    .optional(),
});

export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
