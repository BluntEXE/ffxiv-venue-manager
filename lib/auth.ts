import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import DiscordProvider from "next-auth/providers/discord"
import { prisma } from "@/lib/prisma"

const isProduction = process.env.NODE_ENV === "production"
// Use secure cookies only in production AND when not on localhost
const useSecureCookies = isProduction && process.env.NEXTAUTH_URL?.startsWith("https://")

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Allow sign in if user exists or can be created
      if (!user?.email && !account?.providerAccountId) {
        console.error("SignIn callback: No user email or provider account ID")
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
  // Enable secure cookies only when using HTTPS
  useSecureCookies: useSecureCookies,
  cookies: {
    // CSRF Token Cookie - NextAuth handles CSRF automatically
    csrfToken: {
      name: useSecureCookies ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    // Session Token Cookie
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    // Callback URL Cookie
    callbackUrl: {
      name: useSecureCookies ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  // Enable debug mode if NEXTAUTH_DEBUG is set, or in development
  debug: process.env.NEXTAUTH_DEBUG === "true" || process.env.NODE_ENV === "development",
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
