/**
 * Type definitions for Chief of Staff features
 */

export interface Goal {
  id: string
  title: string
  description: string
  priority: number // 1=P0, 2=P1, 3=P2
  status: 'active' | 'completed' | 'at_risk' | 'archived'
  metrics: string
  deadline: string | null
  risks: string
  position: number
  createdAt?: string
  completedAt?: string | null
}

export interface Person {
  id: string
  name: string
  role: string
  relationship: 'manager' | 'report' | 'stakeholder'
  context: string
  strengths: string
  growthAreas: string
  motivations: string
  communicationStyle: string
  currentFocus: string
  risksConcerns: string
  position: number
  createdAt?: string
}

export interface BacklogItem {
  id: string
  title: string
  description: string
  category: 'question' | 'decision' | 'process' | 'idea' | 'action'
  status: 'open' | 'resolved'
  position: number
  createdAt?: string
  resolvedAt?: string | null
  snoozedUntil?: string | null
}

export interface UserProfile {
  id: string
  name: string
  roleTitle: string
  roleDescription: string
  communicationStyle: string
  thinkingStyle: string
  blindSpots: string
  energyDrains: string
  aiInstructions: string
}

export type TabId = 'tasks' | 'goals' | 'people' | 'backlog' | 'profile'

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'P0',
  2: 'P1',
  3: 'P2',
}

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950',
  2: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950',
  3: 'text-primary bg-primary/10',
}

export const CATEGORY_LABELS: Record<string, string> = {
  question: 'Question',
  decision: 'Decision',
  process: 'Process',
  idea: 'Idea',
  action: 'Action',
}

export const CATEGORY_COLORS: Record<string, string> = {
  question: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950',
  decision: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950',
  process: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950',
  idea: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950',
  action: 'text-primary bg-primary/10',
}

export const RELATIONSHIP_LABELS: Record<string, string> = {
  manager: 'Manager',
  report: 'Report',
  stakeholder: 'Stakeholder',
}

export const RELATIONSHIP_COLORS: Record<string, string> = {
  manager: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950',
  report: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950',
  stakeholder: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950',
}
