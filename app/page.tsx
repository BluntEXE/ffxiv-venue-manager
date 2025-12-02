import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <div className="container mx-auto p-8">
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            FFXIV Venue Manager
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            A comprehensive web-based venue management system for Final Fantasy XIV roleplaying venues
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Multi-venue Management</CardTitle>
              <CardDescription>
                Manage multiple FFXIV venues from a single platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Event calendar with recurring events</li>
                <li>Staff management with custom roles</li>
                <li>Sales and transaction tracking</li>
                <li>Task management system</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Discord Integration</CardTitle>
              <CardDescription>
                Seamless notifications and webhooks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Event announcements</li>
                <li>Task completion notifications</li>
                <li>Staff activity updates</li>
                <li>Revenue summaries</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4 mt-8">
          {process.env.NODE_ENV === "development" && (
            <Button asChild size="lg" variant="secondary">
              <Link href="/test">
                Test Database Connection
              </Link>
            </Button>
          )}
          <Button asChild size="lg">
            <Link href="/dashboard">
              Go to Dashboard
            </Link>
          </Button>
        </div>

      </div>
    </div>
  )
}
