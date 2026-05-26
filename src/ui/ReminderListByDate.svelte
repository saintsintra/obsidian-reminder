<script lang="typescript">
  import { DateTime } from "../model/time";
  import type { Reminder } from "../model/reminder";
  import Markdown from "./Markdown.svelte";
  import IconText from "./IconText.svelte";

  export let reminders: Array<Reminder>;
  export let onOpenReminder: (reminder: Reminder) => void = () => {};
  export let onComplete: (reminder: Reminder) => void = () => {};
  export let onChangeTime: (reminder: Reminder, time: DateTime) => void =
    () => {};
  export let timeToString = (time: DateTime) => time.format("HH:MM");
  export let generateLink: (reminder: Reminder) => string = () => "";

  // Key of the reminder whose inline date editor is currently open.
  let editingKey: string | null = null;

  function inputValue(reminder: Reminder): string {
    return reminder.time.hasTimePart
      ? reminder.time.format("YYYY-MM-DDTHH:mm")
      : reminder.time.format("YYYY-MM-DD");
  }

  function applyDate(reminder: Reminder, value: string) {
    editingKey = null;
    if (!value) {
      return;
    }
    // datetime-local uses "T"; DateTime.parse expects a space separator.
    const parsed = DateTime.parse(value.replace("T", " "));
    if (parsed.isValid()) {
      onChangeTime(reminder, parsed);
    }
  }
</script>

<div class="reminder-group">
  {#if reminders.length === 0}
    <div class="reminder-list-item no-reminders">No reminders</div>
  {:else}
    <div>
      {#each reminders as reminder}
        <div class="reminder-list-item hover-highlight">
          <input
            type="checkbox"
            class="reminder-check"
            aria-label={`Complete ${reminder.title}`}
            on:change={() => onComplete(reminder)}
          />
          <button
            class="reminder-open"
            aria-label={`[${reminder.time.toString()}] ${
              reminder.title
            } - ${reminder.getFileName()}`}
            draggable="true"
            on:dragstart={(e) => {
              e.dataTransfer?.setData("text/plain", generateLink(reminder));
            }}
            on:click={() => {
              onOpenReminder(reminder);
            }}
          >
            <span class="reminder-time">
              {timeToString(reminder.time)}
            </span>
            <div class="reminder-title-container">
              <span class="reminder-title">
                <Markdown markdown={reminder.title} sourcePath={reminder.file} />
              </span>
              <span class="reminder-file">
                {reminder.getFileName()}
              </span>
            </div>
          </button>
          {#if editingKey === reminder.key()}
            <!-- svelte-ignore a11y-autofocus -->
            <input
              type={reminder.time.hasTimePart ? "datetime-local" : "date"}
              class="reminder-date-edit"
              autofocus
              value={inputValue(reminder)}
              on:change={(e) => applyDate(reminder, e.currentTarget.value)}
              on:blur={() => (editingKey = null)}
            />
          {:else}
            <button
              class="reminder-reschedule"
              aria-label={`Reschedule ${reminder.title}`}
              on:click={() => (editingKey = reminder.key())}
            >
              <IconText icon="clock" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .reminder-group {
    margin-bottom: 1rem;
    font-size: 13px;
    color: var(--text-muted);
  }
  .reminder-list-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 3px;
    width: 100%;
  }
  .reminder-list-item:hover {
    color: var(--text-normal);
    background-color: var(--background-secondary-alt);
  }
  .reminder-check {
    flex-shrink: 0;
    margin: 0;
  }
  .reminder-open {
    background-color: transparent;
    box-shadow: none;
    justify-content: flex-start;
    gap: 0.3rem;
    display: inline-flex;
    align-items: center;
    flex-grow: 1;
    overflow: hidden;
    padding: 0;
  }
  .reminder-time {
    display: inline-block;
    font-size: 14px;
    font-family: monospace, serif;
  }
  .reminder-title-container {
    display: inline-flex;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
    justify-content: flex-start;
    align-items: center;
  }
  .reminder-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
    text-align: left;
  }
  .reminder-file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-faint);
  }
  .reminder-reschedule {
    flex-shrink: 0;
    background-color: transparent;
    box-shadow: none;
    padding: 2px 4px;
    color: var(--text-faint);
    cursor: pointer;
  }
  .reminder-reschedule:hover {
    color: var(--text-normal);
  }
  .reminder-date-edit {
    flex-shrink: 0;
    max-width: 11rem;
    font-size: 12px;
  }
  .no-reminders {
    font-style: italic;
  }
  .no-reminders:hover {
    color: var(--text-muted);
    background-color: transparent;
  }
</style>
