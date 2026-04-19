import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import DiscordProvider from "next-auth/providers/discord"
import { prisma } from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Allow sign in if user exists or can be created
      if (!user?.email && !account?.providerAccountId) {
        return false
      }
      return true
    },
    async jwt({ token, user, account }) {
      // Initial sign in - user object is only available on first call
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }
      // Persist the OAuth access_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token
        token.provider = account.provider
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
    // Prevent open redirect attacks
    async redirect({ url, baseUrl }) {
      // Allow relative URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allow same origin URLs
      try {
        if (new URL(url).origin === baseUrl) return url
      } catch {
        // Invalid URL, return baseUrl
      }
      // Default to base URL for external redirects
      return baseUrl
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // Update session every 24 hours
  },
  // Trust the host header (important for proxies like Vercel)
  // @ts-ignore - trustHost is valid in NextAuth v4 but might be missing in type definitions
  trustHost: true,
  // Debug must be explicitly opted into. NODE_ENV is untrusted in prod
  // containers and can leak verbose auth logs if set wrong.
  debug: process.env.NEXTAUTH_DEBUG === "true",
  events: {
    async signIn(message) {
      console.log("NextAuth signIn event:", JSON.stringify(message, null, 2))
    },
    async signOut(message) {
      console.log("NextAuth signOut event")
    },
    async createUser(message) {
      console.log("NextAuth createUser event:", message.user?.id)
    },
    async linkAccount(message) {
      console.log("NextAuth linkAccount event:", message.account?.provider)
    },
    async session(message) {
      // Don't log session events in production to reduce noise
      if (process.env.NODE_ENV === "development") {
        console.log("NextAuth session event")
      }
    },
  },
}
