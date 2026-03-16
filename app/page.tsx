"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { createClient } from "@/lib/supabase-browser"
import { SignIn } from "@/components/auth/sign-in"
import { Unauthorized } from "@/components/auth/unauthorized"
import { ResetPassword } from "@/components/auth/reset-password"
import { Onboarding } from "@/components/onboarding"
import { TabBar } from "@/components/tab-bar"
import { GoalsTab } from "@/components/tabs/goals-tab"
import { PeopleTab } from "@/components/tabs/people-tab"
import { BacklogTab } from "@/components/tabs/backlog-tab"
import { ProfileTab } from "@/components/tabs/profile-tab"
import { ActionItemsTab } from "@/components/tabs/action-items-tab"
import type { TabId } from "@/lib/chief-of-staff-types"

// Export content column ref type for FAB positioning
export type ContentColumnRef = React.RefObject<HTMLDivElement | null>

const VALID_TABS: readonly TabId[] = ['goals', 'people', 'backlog', 'action-items', 'profile']

function getInitialTab(): TabId {
  if (typeof window === 'undefined') return 'action-items'
  const param = new URLSearchParams(window.location.search).get('tab') as TabId
  return VALID_TABS.includes(param) ? param : 'action-items'
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
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)

  // Check if user needs onboarding (no name set in profile)
  useEffect(() => {
    if (!user || !isAuthorized) return
    const supabase = createClient()
    supabase
      .from('user_profile')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // On error, skip onboarding so existing users aren't blocked
          setNeedsOnboarding(false)
          return
        }
        // Only onboard if row exists but has no name, or no row at all
        setNeedsOnboarding(!data?.name)
      })
  }, [user, isAuthorized])

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

  // Show onboarding for new users (profile name not yet set)
  if (needsOnboarding === null) {
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

  if (needsOnboarding) {
    return <Onboarding onComplete={() => setNeedsOnboarding(false)} />
  }

  return (
    <main className="min-h-screen bg-background py-8 pb-20">
      <div ref={contentColumnRef} className="content-column">
        {/* Tab content */}
        <div id="tab-panel-action-items" role="tabpanel" aria-labelledby="tab-action-items" className={activeTab !== 'action-items' ? 'hidden' : undefined}>
          <ActionItemsTab contentColumnRef={contentColumnRef} />
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
          <ProfileTab contentColumnRef={contentColumnRef} />
        </div>
      </div>

      {/* Bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  )
}
