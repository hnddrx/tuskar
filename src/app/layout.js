import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { TaskProvider } from "@/context/TaskContext";
import AppShell from "@/components/AppShell";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: "Taskar — Personal & Team Task Tracker",
  description:
    "Track your own work and your team's on shared boards, with a calendar, invites, Jira sync, and auto documentation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ClerkProvider>
          <ConfirmProvider>
            <TaskProvider>
              <AppShell>{children}</AppShell>
            </TaskProvider>
          </ConfirmProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
