import { ReactNode } from "react"
import { ExploreLayout } from "@/components/explore-layout"

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <ExploreLayout>
      {children}
    </ExploreLayout>
  )
}
