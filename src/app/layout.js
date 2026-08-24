import "./globals.css";
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
        <TaskProvider>
          <AppShell>{children}</AppShell>
        </TaskProvider>
      </body>
    </html>
  );
}
