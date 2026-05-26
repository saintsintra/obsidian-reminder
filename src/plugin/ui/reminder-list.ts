import { ItemView, TFile, View, WorkspaceLeaf } from "obsidian";
import ReminderListView from "ui/ReminderList.svelte";
import type ReminderPlugin from "main";
import { Reminder, groupReminders } from "../../model/reminder";
import type { DateTime } from "../../model/time";
import type { PanelTodo } from "../filesystem";
import { VIEW_TYPE_REMINDER_LIST } from "./constants";

export type TodoGroup = { folder: string; todos: Array<PanelTodo> };

class ReminderListItemView extends ItemView {
  private view?: ReminderListView;

  constructor(
    private plugin: ReminderPlugin,
    leaf: WorkspaceLeaf,
    private onOpenReminder: (reminder: Reminder) => void,
    private onComplete: (reminder: Reminder) => void,
    private onChangeTime: (reminder: Reminder, time: DateTime) => void,
    private onCompleteTodo: (todo: PanelTodo) => void,
    private onOpenTodo: (todo: PanelTodo) => void,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_REMINDER_LIST;
  }

  getDisplayText(): string {
    return "Reminders";
  }

  override getIcon(): string {
    return "clock";
  }

  override async onOpen(): Promise<void> {
    this.view = new ReminderListView({
      target: (this as any).contentEl,
      props: {
        groups: this.remindersForView(),
        todoGroups: [],
        childrenByTask: {},
        onOpenReminder: this.onOpenReminder,
        onComplete: this.onComplete,
        onChangeTime: this.onChangeTime,
        onCompleteTodo: this.onCompleteTodo,
        onOpenTodo: this.onOpenTodo,
        generateLink: (reminder: Reminder): string => {
          const aFile = this.app.vault.getAbstractFileByPath(reminder.file);
          const destinationFile = this.app.workspace.getActiveFile();
          let linkMd: string;
          if (!(aFile instanceof TFile) || destinationFile == null) {
            linkMd = `[[${reminder.getFileName()}]]`;
          } else {
            linkMd = this.app.fileManager.generateMarkdownLink(
              aFile,
              destinationFile.path,
            );
          }
          return `${reminder.title} - ${linkMd}`;
        },
      },
    });
    this.refreshTodos();
  }

  reload() {
    if (this.view == null) {
      return;
    }
    this.view.$set({
      groups: this.remindersForView(),
      onOpenReminder: this.onOpenReminder,
      onComplete: this.onComplete,
      onChangeTime: this.onChangeTime,
    });
    this.refreshTodos();
  }

  // Async-scan undated To Do checkboxes and push them to the view grouped by
  // top-level PARA folder. Kept separate from reminders (which are in-memory).
  private async refreshTodos() {
    if (this.view == null) {
      return;
    }
    const { childrenByTask, todos } =
      await this.plugin.fileSystem.collectPanelTasks();
    const byFolder = new Map<string, Array<PanelTodo>>();
    for (const todo of todos) {
      const folder = todo.file.split("/")[0] ?? "";
      if (!byFolder.has(folder)) {
        byFolder.set(folder, []);
      }
      byFolder.get(folder)!.push(todo);
    }
    const todoGroups: Array<TodoGroup> = [...byFolder.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, items]) => ({
        folder,
        todos: items.sort((a, b) =>
          a.file === b.file
            ? a.lineIndex - b.lineIndex
            : a.file.localeCompare(b.file),
        ),
      }));
    if (this.view != null) {
      this.view.$set({ todoGroups, childrenByTask });
    }
  }

  private remindersForView() {
    return groupReminders(
      this.plugin.reminders.reminders,
      this.plugin.settings.reminderTime.value,
      {
        yearMonthFormat: this.plugin.settings.yearMonthDisplayFormat.value,
        monthDayFormat: this.plugin.settings.monthDayDisplayFormat.value,
        shortDateWithWeekdayFormat:
          this.plugin.settings.shortDateWithWeekdayDisplayFormat.value,
        timeFormat: this.plugin.settings.timeDisplayFormat.value,
      },
    );
  }

  override onClose(): Promise<void> {
    if (this.view) {
      this.view.$destroy();
    }
    return Promise.resolve();
  }
}

export class ReminderListItemViewProxy {
  // valid is a flag which means that this view should be re-rendered if true;
  private valid: boolean = false;

  constructor(
    private plugin: ReminderPlugin,
    private onOpenReminder: (reminder: Reminder) => void,
    private onComplete: (reminder: Reminder) => void,
    private onChangeTime: (reminder: Reminder, time: DateTime) => void,
    private onCompleteTodo: (todo: PanelTodo) => void,
    private onOpenTodo: (todo: PanelTodo) => void,
  ) {
    // Automatically reflect display format changes in the Reminder List UI
    const formats = [
      this.plugin.settings.yearMonthDisplayFormat,
      this.plugin.settings.monthDayDisplayFormat,
      this.plugin.settings.shortDateWithWeekdayDisplayFormat,
      this.plugin.settings.timeDisplayFormat,
    ];
    formats.forEach((fmt) => {
      fmt.rawValue.onChanged(() => {
        this.invalidate();
        this.reload(true);
      });
    });
  }

  createView(leaf: WorkspaceLeaf): View {
    return new ReminderListItemView(
      this.plugin,
      leaf,
      this.onOpenReminder,
      this.onComplete,
      this.onChangeTime,
      this.onCompleteTodo,
      this.onOpenTodo,
    );
  }

  openView(): void {
    if (
      this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER_LIST).length
    ) {
      // reminder list view is already in workspace
      return;
    }
    // Create new view
    this.plugin.app.workspace.getRightLeaf(false)?.setViewState({
      type: VIEW_TYPE_REMINDER_LIST,
    });
  }

  reload(force: boolean = false) {
    if (force || !this.valid) {
      const views = this.getViews();
      if (views.length > 0) {
        views.forEach((view) => view?.reload());
        this.valid = true;
      } else {
        this.valid = false;
        console.debug("view is null.  Skipping reminder list view reload");
      }
    }
  }

  private getViews() {
    return this.plugin.app.workspace
      .getLeavesOfType(VIEW_TYPE_REMINDER_LIST)
      .map((leaf) => {
        if (leaf && leaf.view instanceof ReminderListItemView) {
          return leaf.view as ReminderListItemView;
        }
        return null;
      })
      .filter((view) => view != null);
  }

  invalidate() {
    this.valid = false;
  }
}
