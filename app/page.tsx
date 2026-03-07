"use client"

import { useState, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { SignIn } from "@/components/auth/sign-in"
import { Unauthorized } from "@/components/auth/unauthorized"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { ResetPassword } from "@/components/auth/reset-password"
import { TabBar } from "@/components/tab-bar"
import { TasksTab } from "@/components/tabs/tasks-tab"
import { GoalsTab } from "@/components/tabs/goals-tab"
import { PeopleTab } from "@/components/tabs/people-tab"
import { BacklogTab } from "@/components/tabs/backlog-tab"
import { ProfileTab } from "@/components/tabs/profile-tab"
import type { TabId } from "@/lib/chief-of-staff-types"

// Export content column ref type for FAB positioning
export type ContentColumnRef = React.RefObject<HTMLDivElement | null>

export default function Page() {
  const { user, loading: authLoading, isAuthorized, isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('tasks')
  const contentColumnRef = useRef<HTMLDivElement>(null)

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background py-12">
        <div className="content-column">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    )
  }

  // Show sign-in page if not authenticated
  if (!user) {
    return <SignIn />
  }

  // Show password reset form if in recovery mode
  if (isPasswordRecovery) {
    return <ResetPassword onComplete={clearPasswordRecovery} />
  }

  // Show unauthorized page if user email is not whitelisted
  if (!isAuthorized) {
    return <Unauthorized />
  }

  return (
    <main className="min-h-screen bg-background py-8 pb-20">
      <div ref={contentColumnRef} className="content-column">
        {/* Header with hamburger menu - show on all tabs except profile */}
        {activeTab !== 'profile' && (
          <div className="flex justify-end mb-6">
            <HamburgerMenu />
          </div>
        )}

        {/* Tab content */}
        <div
          id={`tab-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'tasks' && <TasksTab contentColumnRef={contentColumnRef} />}
          {activeTab === 'goals' && <GoalsTab contentColumnRef={contentColumnRef} />}
          {activeTab === 'people' && <PeopleTab contentColumnRef={contentColumnRef} />}
          {activeTab === 'backlog' && <BacklogTab contentColumnRef={contentColumnRef} />}
          {activeTab === 'profile' && <ProfileTab />}
        </div>
      </div>

      {/* Bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  )
}
