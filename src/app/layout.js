import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { TaskProvider } from "@/context/TaskContext";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Taskar — Personal Task Tracker",
  description:
    "A personal task tracker with Jira sync, auto documentation, and an auto-generated user guide.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <ClerkProvider>
          <TaskProvider>
            <AppShell>{children}</AppShell>
          </TaskProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
