import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { TaskProvider } from "@/context/TaskContext";
import { ChatProvider } from "@/context/ChatContext";
import AppShell from "@/components/AppShell";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: "Taskar — Personal & Team Task Tracker",
  description:
    "Track your own work and your team's on shared boards, with a calendar, invites, Jira sync, and auto documentation.",
  appleWebApp: {
    title: "Taskar",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning covers this one element's own attributes, and
    // nothing below it. The theme script in <head> runs before React hydrates
    // and adds the dark class to <html>, which the server could not have
    // rendered — it has no localStorage and no media query to read. That
    // difference is the whole point of the script, which exists so the page
    // does not flash light on every load, so React is told to expect it here
    // rather than reporting it as a fault. A real mismatch anywhere else,
    // including on <body>, still warns.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ClerkProvider>
          <ConfirmProvider>
            <TaskProvider>
              <ChatProvider>
                <AppShell>{children}</AppShell>
              </ChatProvider>
            </TaskProvider>
          </ConfirmProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
