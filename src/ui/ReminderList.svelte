<script lang="typescript">
  import type { GroupedReminder, Reminder } from "../model/reminder";
  import type { DateTime } from "../model/time";
  import type { PanelTodo } from "../plugin/filesystem";
  import type { TodoGroup } from "../plugin/ui/reminder-list";
  import ReminderListByDate from "./ReminderListByDate.svelte";
  import Markdown from "./Markdown.svelte";

  export let groups: Array<GroupedReminder>;
  export let todoGroups: Array<TodoGroup> = [];
  export let onOpenReminder: (reminder: Reminder) => void;
  export let onComplete: (reminder: Reminder) => void = () => {};
  export let onChangeTime: (reminder: Reminder, time: DateTime) => void =
    () => {};
  export let onCompleteTodo: (todo: PanelTodo) => void = () => {};
  export let onOpenTodo: (todo: PanelTodo) => void = () => {};
  export let generateLink: (reminder: Reminder) => string;

  function fileName(path: string): string {
    const p = path.split(/[/\\]/);
    return p[p.length - 1]!.replace(/\.md$/, "");
  }
</script>

<main>
  <div>
    {#each groups as group}
      <div class="group-name" class:group-name-overdue={group.isOverdue}>
        {group.name}
      </div>
      <ReminderListByDate
        reminders={group.reminders}
        {onOpenReminder}
        {onComplete}
        {onChangeTime}
        timeToString={(time) => group.timeToString(time)}
        {generateLink}
      />
    {/each}
  </div>

  {#if todoGroups.length > 0}
    <div class="todo-section">
      <div class="group-name todo-header">To Do:</div>
      {#each todoGroups as group}
        <details class="todo-folder">
          <summary>{group.folder} ({group.todos.length})</summary>
          {#each group.todos as todo}
            <div class="todo-item hover-highlight">
              <input
                type="checkbox"
                class="todo-check"
                aria-label={`Complete ${todo.body}`}
                on:change={() => onCompleteTodo(todo)}
              />
              <button class="todo-open" on:click={() => onOpenTodo(todo)}>
                <span class="todo-title">
                  <Markdown markdown={todo.body} sourcePath={todo.file} />
                </span>
                <span class="todo-file">{fileName(todo.file)}</span>
              </button>
            </div>
          {/each}
        </details>
      {/each}
    </div>
  {/if}
</main>

<style>
  .group-name {
    font-size: 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .group-name-overdue {
    color: var(--text-accent);
  }
  .todo-section {
    margin-top: 1.5rem;
  }
  .todo-header {
    font-weight: 600;
  }
  .todo-folder {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 0.3rem;
  }
  .todo-folder summary {
    cursor: pointer;
    padding: 2px 0;
    color: var(--text-normal);
  }
  .todo-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 3px 3px 3px 1rem;
    width: 100%;
  }
  .todo-item:hover {
    color: var(--text-normal);
    background-color: var(--background-secondary-alt);
  }
  .todo-check {
    flex-shrink: 0;
    margin: 0;
  }
  .todo-open {
    background-color: transparent;
    box-shadow: none;
    justify-content: flex-start;
    gap: 0.3rem;
    display: inline-flex;
    align-items: center;
    flex-grow: 1;
    overflow: hidden;
    padding: 0;
    text-align: left;
  }
  .todo-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
  }
  .todo-file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-faint);
  }
</style>
