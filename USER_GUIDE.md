# Taskar User Guide

_Prose lives in `src/data/guideContent.js`; screenshots are refreshed by `npm run guide`._

## Two spaces: yours and your team's

_The one idea worth understanding before anything else._

Taskar keeps two completely separate sets of tasks. Your personal space is private to you — nobody else can see it, ever. A team space is shared with everyone in that team: the same board, the same tasks, the same comments.

They never mix. Personal tasks live in their own database tables and team tasks in theirs, so a team board can't accidentally surface your private work, and vice versa. The sidebar groups them under Personal and Team headings, and team screens are marked in indigo so you always know which space you're looking at.

- **Personal** — My Tasks, My Board, and Notes. Always just you.
- **Team** — Team Tasks and Team Board. Shared with every member.
- **Switching teams** — Use the switcher under the logo. Your personal tasks stay visible no matter which team is active — switching a team never hides your own work.
- **Multiple teams** — You can belong to as many as you like. Create one from the switcher; each gets its own separate board.

## Overview

_Where you land._

A summary of your personal space: how many tasks are open, completed, overdue, and high priority, plus the tasks you touched most recently and shortcuts into the rest of the app.

## My Tasks

_Your personal task table._

Every personal task in one sortable, filterable table. Click a column heading to sort by it. The search box matches titles, descriptions, assignees, statuses, priorities — and the text of comments, so you can find a task by something someone said on it.

Your search, filters, sort order, and page position all live in the URL. That means the browser's back button works the way you'd expect, and you can bookmark or share a particular view.

- **Filters** — Combine status, priority, assignee, source (Jira vs. manual), and due or created date ranges.
- **Columns** — The Columns picker shows or hides optional columns; your choice is remembered in this browser.
- **New task** — Always in the header — or the round button in the corner on a phone.

## My Board

_The same personal tasks, as a Kanban board._

One column per status, in the order you set under Configuration. Drag a card between columns to change its status — it saves immediately. Click a card to open the task in full.

## Task detail

_Editing, discussion, and history for a single task._

Every field edits in place: click it, change it, and it becomes a pending edit. Nothing is written until you press Save, and Discard reverts everything at once — so you can revise several fields and commit them together.

Below the description sits the comment and update thread, along with any subtasks. Export doc compiles the whole task — description, history, subtasks — into Markdown you can paste anywhere.

## Team Tasks and Team Board

_The shared equivalents, plus what's different about them._

These work exactly like My Tasks and My Board, on data everyone in the team can see and edit. Create a team from the switcher under the logo and invite people by email; Clerk handles the invitation and joining.

Two things behave differently from your personal space. First, a team task can be assigned to several people at once, picked from your actual team membership rather than a typed-in list of names — so an assignee is always a real person who's really in the team. Second, comments are always attributed to whoever is signed in; there's no free-text author box, because on a shared board it would be misleading.

- **Assignees** — Tick as many members as you need. Names show wherever a single assignee used to.
- **Membership** — Add and remove people through the switcher. The assignee list follows automatically.
- **No active team** — Open a team page without one selected and it'll simply point you at the switcher.

## Calendar

_Everything with a date, plus meeting invites._

A month view of your tasks by due date and any meetings you've scheduled. Personal items are grey, team items indigo, and meetings carry a filled dot to set them apart from task deadlines. The All / Personal / Team switch narrows it down. Click any day to see what's on it.

New invite creates a meeting: a title, a date, all-day or a start and end time, a location, and attendees — team members by checkbox, plus anyone else by email address. It's saved to the calendar and you get the invite file straight away.

- **Add to calendar** — Downloads a .ics for any task or meeting. Open it in Google Calendar, Outlook, or Apple Calendar.
- **Send invite** — For anything with attendees. Produces a proper invitation others can RSVP to, and opens an email draft addressed to them.
- **One manual step** — Email drafts can't carry an attachment, so attach the .ics your browser just downloaded before sending.

## Notes

_Free-form notes and meeting minutes. Personal only._

Two kinds: a plain note, or minutes with attendees, an agenda, and action items. Notes can link to a task, autosave as you move around, accept file attachments, and support dictation in several languages.

## Auto Docs

_Your tasks as written documentation._

Compiles descriptions and update histories into clean Markdown with no writing required — preview any single task, or export the whole project as one document.

## Jira Import

_A one-way pull from Jira. Personal space only._

Configure the connection here — base URL, email, API token, project or custom JQL. The token is encrypted and kept server-side; it's never sent to the browser. Test connection checks the credentials before you depend on them.

Import is strictly one-directional: issues come from Jira into Taskar, matched by ticket ID, and nothing you do in Taskar is ever written back. Tasks you created by hand are never touched by an import.

## Configuration

_The lists behind every dropdown._

Statuses (which also define your board's columns, in order), Priorities, and Task types apply to both spaces. The Assignees list is personal only — a team's assignees come from its real membership instead.
