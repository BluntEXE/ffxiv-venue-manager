"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageLoading } from "@/components/ui/loading-spinner"

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration. Please check NEXTAUTH_URL and other environment variables.",
    AccessDenied: "You denied access to your account.",
    Verification: "The verification token has expired or has already been used.",
    Callback: "There was a problem with the OAuth callback. This usually means the Discord redirect URI doesn't match, or there's a session/cookie issue. Please try clearing your cookies and signing in again.",
    OAuthCallback: "OAuth callback error. Please verify your Discord app's redirect URI is set to the correct URL.",
    OAuthSignin: "Error starting the OAuth sign-in flow.",
    OAuthAccountNotLinked: "This email is already associated with another account.",
    Default: "An error occurred during authentication.",
  }

  const message = error ? errorMessages[error] || errorMessages.Default : errorMessages.Default

  return (
    <div className="container mx-auto flex items-center justify-center min-h-screen p-4">
      <div className="xiv-card rounded-2xl w-full max-w-md p-8 space-y-6 border-destructive/30">
        <div className="text-center space-y-2">
          <h1 className="font-cinzel text-2xl font-bold tracking-wide text-destructive">
            Authentication Error
          </h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        <div className="text-center space-y-3">
          <Button asChild className="xiv-btn-shimmer font-semibold" className="xiv-cta">
            <Link href="/auth/signin">Try Again</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto flex items-center justify-center min-h-screen p-4">
        <PageLoading />
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}
