'use client'

import { useState } from 'react'
import KnotCard from '@/components/knot-card'

interface Knot {
  id: string
  title: string
  description: string
  status: 'active' | 'completed'
}

export default function Home() {
  const [knots, setKnots] = useState<Knot[]>([
    {
      id: '1',
      title: 'Review Q1 budget proposal',
      description: 'Check the finance team\'s budget proposal for next quarter and provide feedback by EOD',
      status: 'active'
    },
    {
      id: '2',
      title: 'Update project documentation',
      description: 'Add new API endpoints to the developer documentation',
      status: 'active'
    },
    {
      id: '3',
      title: 'Schedule team standup',
      description: 'Find a time that works for everyone next week',
      status: 'completed'
    },
    {
      id: '4',
      title: 'Respond to customer inquiry',
      description: 'Customer is asking about integration options with their CRM system',
      status: 'active'
    }
  ])

  const handleToggle = (id: string) => {
    setKnots(knots.map(knot =>
      knot.id === id
        ? { ...knot, status: knot.status === 'active' ? 'completed' : 'active' }
        : knot
    ))
  }

  const handleDelete = (id: string) => {
    setKnots(knots.filter(knot => knot.id !== id))
  }

  const activeKnots = knots.filter(k => k.status === 'active')
  const completedKnots = knots.filter(k => k.status === 'completed')

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Knots
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Your intelligent task manager
          </p>
        </div>

        {/* Active Knots */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Active ({activeKnots.length})
          </h2>
          <div className="flex flex-col gap-3">
            {activeKnots.length > 0 ? (
              activeKnots.map(knot => (
                <KnotCard
                  key={knot.id}
                  id={knot.id}
                  title={knot.title}
                  description={knot.description}
                  status={knot.status}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No active knots. Great job! 🎉
              </p>
            )}
          </div>
        </div>

        {/* Completed Knots */}
        {completedKnots.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Completed ({completedKnots.length})
            </h2>
            <div className="flex flex-col gap-3">
              {completedKnots.map(knot => (
                <KnotCard
                  key={knot.id}
                  id={knot.id}
                  title={knot.title}
                  description={knot.description}
                  status={knot.status}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
