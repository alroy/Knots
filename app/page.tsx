"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
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

const VALID_TABS: readonly TabId[] = ['tasks', 'goals', 'people', 'backlog', 'profile']

function getInitialTab(): TabId {
  if (typeof window === 'undefined') return 'tasks'
  const param = new URLSearchParams(window.location.search).get('tab') as TabId
  return VALID_TABS.includes(param) ? param : 'tasks'
}

export default function Page() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  )
}

function PageContent() {
  const { user, loading: authLoading, isAuthorized, isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab)
  const contentColumnRef = useRef<HTMLDivElement>(null)

  // Sync active tab when URL search params change (e.g., navigating back via Link)
  useEffect(() => {
    const param = searchParams.get('tab') as TabId
    if (param && VALID_TABS.includes(param)) {
      setActiveTab(param)
    }
  }, [searchParams])

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
        {/* Header with hamburger menu */}
        <div className="flex justify-end mb-6">
          <HamburgerMenu />
        </div>

        {/* Tab content */}
        <div id="tab-panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" className={activeTab !== 'tasks' ? 'hidden' : undefined}>
          <TasksTab contentColumnRef={contentColumnRef} />
        </div>
        <div id="tab-panel-goals" role="tabpanel" aria-labelledby="tab-goals" className={activeTab !== 'goals' ? 'hidden' : undefined}>
          <GoalsTab contentColumnRef={contentColumnRef} />
        </div>
        <div id="tab-panel-people" role="tabpanel" aria-labelledby="tab-people" className={activeTab !== 'people' ? 'hidden' : undefined}>
          <PeopleTab contentColumnRef={contentColumnRef} />
        </div>
        <div id="tab-panel-backlog" role="tabpanel" aria-labelledby="tab-backlog" className={activeTab !== 'backlog' ? 'hidden' : undefined}>
          <BacklogTab contentColumnRef={contentColumnRef} />
        </div>
        <div id="tab-panel-profile" role="tabpanel" aria-labelledby="tab-profile" className={activeTab !== 'profile' ? 'hidden' : undefined}>
          <ProfileTab />
        </div>
      </div>

      {/* Bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  )
}
