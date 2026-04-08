import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type {
  users,
  entries,
  tasks,
  workScheduleRules,
  invitations,
} from '@db/schema'

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>

export type Entry = InferSelectModel<typeof entries>
export type NewEntry = InferInsertModel<typeof entries>

export type Task = InferSelectModel<typeof tasks>
export type NewTask = InferInsertModel<typeof tasks>

export type WorkScheduleRule = InferSelectModel<typeof workScheduleRules>
export type NewWorkScheduleRule = InferInsertModel<typeof workScheduleRules>

export type Invitation = InferSelectModel<typeof invitations>
export type NewInvitation = InferInsertModel<typeof invitations>

// Task with parsed tags
export type TaskWithTags = Omit<Task, 'tags'> & { tags: string[] }

export function parseTaskTags(task: Task): TaskWithTags {
  return { ...task, tags: JSON.parse(task.tags || '[]') }
}
