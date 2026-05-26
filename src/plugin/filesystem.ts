import type ReminderPlugin from "main";
import { Content } from "model/content";
import { MarkdownDocument } from "model/format";
import type { Reminder, Reminders } from "model/reminder";
import type { DateTime } from "model/time";
import { TAbstractFile, TFile, Vault } from "obsidian";

// An undated, open checkbox living under a "To Do" folder.
export type PanelTodo = {
  file: string;
  lineIndex: number;
  body: string;
};

// A direct child of a reminder: a subtask (checkbox) or a comment (text line).
export type PanelChild = PanelTodo & { kind: "subtask" | "comment" };

function isInToDoFolder(path: string): boolean {
  return path.split("/").includes("To Do");
}

export class ReminderPluginFileSystem {
  constructor(
    private vault: Vault,
    private reminders: Reminders,
    private onRemindersChanged: () => void,
  ) {}

  onload(plugin: ReminderPlugin) {
    [
      this.vault.on("modify", async (file) => {
        if (await this.reloadRemindersInFile(file)) {
          this.onRemindersChanged();
        } else if (
          file instanceof TFile &&
          this.isMarkdownFile(file) &&
          (isInToDoFolder(file.path) ||
            this.reminders.fileToReminders.has(file.path))
        ) {
          // Reminders didn't change, but an undated checkbox in this file might
          // have — either a To Do item, or a subtask nested under a reminder.
          // Refresh so the panel's To Do section + nested children stay current.
          this.onRemindersChanged();
        }
      }),
      this.vault.on("delete", async (file) => {
        if (await this.removeRemindersByFile(file.path)) {
          this.onRemindersChanged();
        }
      }),
      this.vault.on("rename", async (file, oldPath) => {
        // We only reload the file if it CAN be deleted, otherwise this can
        // cause crashes.
        if (await this.removeRemindersByFile(oldPath)) {
          // We need to do the reload synchronously so as to avoid racing.
          await this.reloadRemindersInFile(file);
          this.onRemindersChanged();
        }
      }),
    ].forEach((eventRef) => {
      plugin.registerEvent(eventRef);
    });
  }

  async removeRemindersByFile(path: string): Promise<boolean> {
    console.debug("Remove file: path=%s", path);
    return this.reminders.removeByFile(path);
  }

  async reloadRemindersInFile(file: TAbstractFile) {
    console.debug("Reload file and collect reminders: file=%s", file.path);
    if (!(file instanceof TFile)) {
      console.debug("Cannot read file other than TFile: file=%o", file);
      return false;
    }
    if (!this.isMarkdownFile(file)) {
      console.debug("Not a markdown file: file=%o", file);
      return false;
    }
    const content = new Content(file.path, await this.vault.cachedRead(file));
    const reminders = content.getReminders();
    if (reminders.length > 0) {
      if (!this.reminders.replaceFile(file.path, reminders)) {
        return false;
      }
    } else {
      if (!this.reminders.removeByFile(file.path)) {
        return false;
      }
    }
    return true;
  }

  async reloadRemindersInAllFiles() {
    console.debug("Reload all files and collect reminders");
    this.reminders.clear();
    for (const file of this.vault.getMarkdownFiles()) {
      await this.reloadRemindersInFile(file);
    }
    this.onRemindersChanged();
  }

  isMarkdownFile(file: TFile) {
    return file.extension.toLowerCase() === "md";
  }

  async updateReminder(reminder: Reminder, checked: boolean) {
    const file = this.vault.getAbstractFileByPath(reminder.file);
    if (!(file instanceof TFile)) {
      console.error("file is not instance of TFile: %o", file);
      return;
    }
    const content = new Content(file.path, await this.vault.read(file));
    await content.updateReminder(reminder, {
      checked,
      time: reminder.time,
    });
    await this.vault.modify(file, content.getContent());
  }

  async updateReminderTime(reminder: Reminder, time: DateTime) {
    const file = this.vault.getAbstractFileByPath(reminder.file);
    if (!(file instanceof TFile)) {
      console.error("file is not instance of TFile: %o", file);
      return;
    }
    const content = new Content(file.path, await this.vault.read(file));
    await content.updateReminder(reminder, {
      checked: reminder.done,
      time,
    });
    await this.vault.modify(file, content.getContent());
  }

  // Scans files that contain reminders (anywhere) plus files under any "To Do"
  // folder, and splits undated open checkboxes into:
  //  - childrenByReminder: direct children of a dated reminder (keyed file::line)
  //  - todos: everything else (flat To Do section, To Do folders only)
  async collectPanelTasks(): Promise<{
    childrenByTask: Record<string, PanelChild[]>;
    todos: PanelTodo[];
  }> {
    const childrenByTask: Record<string, PanelChild[]> = {};
    const todos: PanelTodo[] = [];
    // Keys (file::line) of todos shown in the To Do section, so comments can
    // attach to them too (not only to reminders).
    const shownTodoKeys = new Set<string>();
    const CHECKBOX = /^((> ?)*)?\s*[-*][ ]+\[(.)\]\s+(.*)$/;
    const indentOf = (line: string) =>
      (line.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;

    const paths = new Set<string>(this.reminders.fileToReminders.keys());
    for (const f of this.vault.getMarkdownFiles()) {
      if (isInToDoFolder(f.path)) {
        paths.add(f.path);
      }
    }

    for (const path of paths) {
      const file = this.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        continue;
      }
      const text = await this.vault.cachedRead(file);
      const content = new Content(path, text);
      // Active (not-done) reminders only: a done reminder isn't shown in the
      // panel, so its children fall back to the To Do section instead of
      // nesting under a parent that's invisible.
      const reminderLines = new Set(
        content.getReminders().map((r) => r.rowNumber),
      );
      const inToDo = isInToDoFolder(path);

      // One node per non-blank line: a checkbox task, or a plain text line
      // (a potential "comment"). Indent drives parent/child nesting.
      const nodes: Array<{
        line: number;
        indent: number;
        isTask: boolean;
        checked: boolean;
        isReminder: boolean;
        body: string;
      }> = [];
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.trim() === "") {
          continue;
        }
        const m = line.match(CHECKBOX);
        nodes.push({
          line: i,
          indent: indentOf(line),
          isTask: m != null,
          checked: m != null && m[3] !== " ",
          isReminder: reminderLines.has(i),
          body: m != null ? m[4]! : line.trim(),
        });
      }

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        // Direct parent = nearest preceding *checkbox* with a smaller indent.
        let parent: (typeof nodes)[number] | null = null;
        for (let j = i - 1; j >= 0; j--) {
          if (nodes[j]!.isTask && nodes[j]!.indent < node.indent) {
            parent = nodes[j]!;
            break;
          }
        }
        const parentKey = parent ? `${path}::${parent.line}` : null;

        if (node.isTask) {
          if (node.isReminder || node.checked) {
            continue; // reminders show via their own rows; checked are done
          }
          // Open, undated checkbox: a subtask of a reminder, else a To Do item.
          if (parent && parent.isReminder && parentKey) {
            (childrenByTask[parentKey] ??= []).push({
              file: path,
              lineIndex: node.line,
              body: node.body,
              kind: "subtask",
            });
          } else if (inToDo) {
            todos.push({ file: path, lineIndex: node.line, body: node.body });
            shownTodoKeys.add(`${path}::${node.line}`);
          }
        } else if (
          parent &&
          parentKey &&
          (parent.isReminder || shownTodoKeys.has(parentKey))
        ) {
          // Text line = comment, attached to a shown task (reminder or To Do).
          (childrenByTask[parentKey] ??= []).push({
            file: path,
            lineIndex: node.line,
            body: node.body,
            kind: "comment",
          });
        }
      }
    }
    return { childrenByTask, todos };
  }

  async completeTodo(filePath: string, lineIndex: number) {
    const file = this.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      console.error("file is not instance of TFile: %o", file);
      return;
    }
    const doc = new MarkdownDocument(filePath, await this.vault.read(file));
    const todo = doc.getTodo(lineIndex);
    if (todo == null) {
      return;
    }
    todo.setChecked(true);
    await this.vault.modify(file, doc.toMarkdown());
  }
}
