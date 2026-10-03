import type { Account, Habit, Provider, QuestionAnswer, Reflection, Settings, Snapshot, Task } from './types'

export type SecretName = 'anthropicApiKey' | 'geminiApiKey' | 'googleClientSecret' | 'notionToken'

export type TaskInput = Partial<Omit<Task, 'createdAt' | 'updatedAt' | 'completedAt' | 'notion'>> & { title: string }

/** Funciones que la interfaz puede pedir al proceso principal. */
export interface Api {
  getSnapshot(): Promise<Snapshot>

  addAccount(input: { provider: Provider; email: string; label: string; color: string }): Promise<Account>
  connectAccount(accountId: string): Promise<Account>
  disconnectAccount(accountId: string): Promise<void>
  updateAccount(accountId: string, changes: Partial<Pick<Account, 'label' | 'color' | 'email'>>): Promise<void>
  removeAccount(accountId: string): Promise<void>
  setActiveAccount(accountId: string): Promise<void>
  refreshAccount(accountId?: string): Promise<void>

  saveTask(input: TaskInput): Promise<Task>
  deleteTask(taskId: string): Promise<void>

  saveHabit(input: { id?: string; name: string; emoji: string }): Promise<Habit>
  archiveHabit(habitId: string): Promise<void>
  moveHabit(habitId: string, direction: -1 | 1): Promise<void>
  toggleHabit(date: string, habitId: string): Promise<void>
  saveReflection(month: string, answers: QuestionAnswer[]): Promise<Reflection>

  updateSettings(changes: Partial<Settings>): Promise<void>
  setSecret(name: SecretName, value: string): Promise<void>
  testAi(): Promise<string>
  testNotification(): Promise<void>
  notionCreateDatabase(parentPageUrl: string): Promise<string>
  notionSyncNow(): Promise<string>

  setBadge(key: string, count: number): Promise<void>
  openExternal(url: string): Promise<void>
}

export type ApiMethod = keyof Api

export type InvokeResult = { ok: true; value: unknown } | { ok: false; error: string }

/** Lo que el preload expone como window.cdm */
export interface Bridge {
  invoke(method: ApiMethod, args: unknown[]): Promise<InvokeResult>
  onSnapshot(cb: (s: Snapshot) => void): () => void
  onNavigate(cb: (view: string) => void): () => void
}
