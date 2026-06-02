import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { GetStartedWizard } from "./wizard"

export default async function GetStartedPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin?callbackUrl=/get-started")

  return <GetStartedWizard userName={session.user.name ?? ""} />
}
