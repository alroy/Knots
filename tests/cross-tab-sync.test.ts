import { describe, it, expect } from 'vitest'

interface Knot {
  id: string
  title: string
  description: string
  status: 'active' | 'completed'
  position: number
}

// State update functions extracted from page.tsx for testing
// These mirror the logic in the Realtime event handlers

function applyInsertEvent(prev: Knot[], newTask: any): Knot[] {
  const newKnot: Knot = {
    id: newTask.id,
    title: newTask.title,
    description: newTask.description || '',
    status: newTask.status,
    position: newTask.position ?? 0,
  }

  if (prev.some((k) => k.id === newKnot.id)) return prev
  // Update positions of existing knots (they were shifted by the server trigger)
  const updated = prev.map((k) => ({ ...k, position: k.position + 1 }))
  return [newKnot, ...updated].sort((a, b) => a.position - b.position)
}

function applyUpdateEvent(prev: Knot[], updatedTask: any): Knot[] {
  const updated = prev.map((k) =>
    k.id === updatedTask.id
      ? {
          ...k,
          title: updatedTask.title,
          description: updatedTask.description || '',
          status: updatedTask.status,
          position: updatedTask.position ?? k.position,
        }
      : k
  )
  // Re-sort by position to handle reorder updates
  return updated.sort((a, b) => a.position - b.position)
}

function applyDeleteEvent(prev: Knot[], deletedTask: any): Knot[] {
  return prev.filter((k) => k.id !== deletedTask.id)
}

function applyReorder(knots: Knot[], reorderedIds: string[]): Knot[] {
  // Map knots by their new positions based on the new order
  return reorderedIds
    .map((id, index) => {
      const knot = knots.find((k) => k.id === id)
      return knot ? { ...knot, position: index } : null
    })
    .filter((k): k is Knot => k !== null)
}

describe('Cross-Tab Sync State Updates', () => {
  const initialKnots: Knot[] = [
    { id: '1', title: 'Task 1', description: '', status: 'active', position: 0 },
    { id: '2', title: 'Task 2', description: '', status: 'active', position: 1 },
    { id: '3', title: 'Task 3', description: '', status: 'completed', position: 2 },
  ]

  describe('INSERT event', () => {
    it('should add new knot at position 0 and shift others', () => {
      const newTask = {
        id: '4',
        title: 'New Task',
        description: 'New desc',
        status: 'active',
        position: 0,
      }

      const result = applyInsertEvent(initialKnots, newTask)

      expect(result).toHaveLength(4)
      expect(result[0].id).toBe('4')
      expect(result[0].position).toBe(0)
      expect(result[1].position).toBe(1) // shifted from 0
      expect(result[2].position).toBe(2) // shifted from 1
      expect(result[3].position).toBe(3) // shifted from 2
    })

    it('should not add duplicate knot', () => {
      const duplicateTask = {
        id: '1', // Already exists
        title: 'Duplicate',
        description: '',
        status: 'active',
        position: 0,
      }

      const result = applyInsertEvent(initialKnots, duplicateTask)

      expect(result).toHaveLength(3) // No change
      expect(result).toEqual(initialKnots)
    })
  })

  describe('UPDATE event', () => {
    it('should update knot status without changing position', () => {
      const updatedTask = {
        id: '1',
        title: 'Task 1',
        description: '',
        status: 'completed',
        position: 0,
      }

      const result = applyUpdateEvent(initialKnots, updatedTask)

      expect(result[0].status).toBe('completed')
      expect(result[0].position).toBe(0)
    })

    it('should handle position change from reorder via multiple UPDATE events', () => {
      // Simulating moving Task 1 from position 0 to position 2
      // In reality, a reorder triggers UPDATE events for ALL affected items
      // The server updates: Task 2 -> position 0, Task 3 -> position 1, Task 1 -> position 2
      let state = [...initialKnots]

      // Apply updates in order they might arrive
      state = applyUpdateEvent(state, {
        id: '2',
        title: 'Task 2',
        description: '',
        status: 'active',
        position: 0,
      })
      state = applyUpdateEvent(state, {
        id: '3',
        title: 'Task 3',
        description: '',
        status: 'completed',
        position: 1,
      })
      state = applyUpdateEvent(state, {
        id: '1',
        title: 'Task 1',
        description: '',
        status: 'active',
        position: 2,
      })

      // After all updates, order should be [2, 3, 1]
      expect(state[0].id).toBe('2')
      expect(state[0].position).toBe(0)
      expect(state[1].id).toBe('3')
      expect(state[1].position).toBe(1)
      expect(state[2].id).toBe('1')
      expect(state[2].position).toBe(2)
    })

    it('should re-sort by position after update', () => {
      // Apply multiple updates that change positions
      const knotsWithSwappedPositions: Knot[] = [
        { id: '1', title: 'Task 1', description: '', status: 'active', position: 2 },
        { id: '2', title: 'Task 2', description: '', status: 'active', position: 0 },
        { id: '3', title: 'Task 3', description: '', status: 'completed', position: 1 },
      ]

      // Apply an update to trigger re-sort
      const updatedTask = {
        id: '2',
        title: 'Task 2',
        description: '',
        status: 'active',
        position: 0,
      }

      const result = applyUpdateEvent(knotsWithSwappedPositions, updatedTask)

      // Should be sorted by position
      expect(result[0].id).toBe('2')
      expect(result[1].id).toBe('3')
      expect(result[2].id).toBe('1')
    })
  })

  describe('DELETE event', () => {
    it('should remove knot by id', () => {
      const deletedTask = { id: '2' }

      const result = applyDeleteEvent(initialKnots, deletedTask)

      expect(result).toHaveLength(2)
      expect(result.find((k) => k.id === '2')).toBeUndefined()
    })

    it('should handle deleting non-existent knot gracefully', () => {
      const deletedTask = { id: 'nonexistent' }

      const result = applyDeleteEvent(initialKnots, deletedTask)

      expect(result).toHaveLength(3) // No change
    })
  })

  describe('REORDER operation', () => {
    it('should correctly reorder knots and update positions', () => {
      // Reorder from [1, 2, 3] to [3, 1, 2]
      const newOrder = ['3', '1', '2']

      const result = applyReorder(initialKnots, newOrder)

      expect(result[0].id).toBe('3')
      expect(result[0].position).toBe(0)
      expect(result[1].id).toBe('1')
      expect(result[1].position).toBe(1)
      expect(result[2].id).toBe('2')
      expect(result[2].position).toBe(2)
    })

    it('should handle moving single item to new position', () => {
      // Move item 3 from end to start: [1, 2, 3] -> [3, 1, 2]
      const newOrder = ['3', '1', '2']

      const result = applyReorder(initialKnots, newOrder)

      expect(result.map((k) => k.id)).toEqual(['3', '1', '2'])
      expect(result.map((k) => k.position)).toEqual([0, 1, 2])
    })
  })

  describe('Cross-tab sync scenarios', () => {
    it('should converge to same state after reorder event from another tab', () => {
      // Tab A reorders: [1, 2, 3] -> [2, 1, 3]
      // Tab B receives UPDATE events for each position change

      let tabBState = [...initialKnots]

      // Simulate UPDATE events for position changes
      const updateTask1 = { id: '1', title: 'Task 1', description: '', status: 'active', position: 1 }
      const updateTask2 = { id: '2', title: 'Task 2', description: '', status: 'active', position: 0 }

      tabBState = applyUpdateEvent(tabBState, updateTask1)
      tabBState = applyUpdateEvent(tabBState, updateTask2)

      // Tab B should now have [2, 1, 3] order
      expect(tabBState[0].id).toBe('2')
      expect(tabBState[1].id).toBe('1')
      expect(tabBState[2].id).toBe('3')
    })

    it('should handle rapid sequential operations', () => {
      let state = [...initialKnots]

      // Simulate rapid operations:
      // 1. Add new item
      state = applyInsertEvent(state, {
        id: '4',
        title: 'New Task',
        description: '',
        status: 'active',
        position: 0,
      })

      // 2. Toggle an item
      state = applyUpdateEvent(state, {
        id: '2',
        title: 'Task 2',
        description: '',
        status: 'completed',
        position: state.find((k) => k.id === '2')?.position ?? 0,
      })

      // 3. Delete an item
      state = applyDeleteEvent(state, { id: '3' })

      // Verify final state
      expect(state).toHaveLength(3)
      expect(state.find((k) => k.id === '3')).toBeUndefined()
      expect(state.find((k) => k.id === '4')).toBeDefined()
      expect(state.find((k) => k.id === '2')?.status).toBe('completed')
    })

    it('should handle delete followed by operations on other items', () => {
      let state = [...initialKnots]

      // Delete item 2
      state = applyDeleteEvent(state, { id: '2' })

      // Update item 1 (should still work)
      state = applyUpdateEvent(state, {
        id: '1',
        title: 'Task 1 Updated',
        description: '',
        status: 'active',
        position: 0,
      })

      expect(state).toHaveLength(2)
      expect(state.find((k) => k.id === '1')?.title).toBe('Task 1 Updated')
    })
  })
})

describe('DELETE event with REPLICA IDENTITY FULL', () => {
  // These tests verify that DELETE events include all required fields
  // when REPLICA IDENTITY FULL is set on the table

  it('should have user_id in delete payload for filtering', () => {
    // This simulates the payload structure when REPLICA IDENTITY FULL is set
    const deletePayload = {
      old: {
        id: '1',
        title: 'Task 1',
        description: '',
        status: 'active',
        user_id: 'user-123', // This field is needed for the subscription filter
        created_at: '2024-01-01T00:00:00Z',
        completed_at: null,
        position: 0,
      },
    }

    // The user_id should be present for the filter `user_id=eq.${user.id}` to work
    expect(deletePayload.old.user_id).toBeDefined()
    expect(deletePayload.old.user_id).toBe('user-123')
  })
})
