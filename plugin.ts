import { AbstractPlugin } from "../../src/plugin-host/plugin/plugin";
import { PLUGIN_EVENT } from "../../src/plugin-host/plugin-events/plugin-event-types"
import { UserScoreChangedPluginEventArguments } from "../../src/plugin-host/plugin-events/event-arguments/user-score-changed-plugin-event-arguments";
import { PrePostMessagePluginEventArguments } from "../../src/plugin-host/plugin-events/event-arguments/pre-post-message-plugin-event-arguments";
import { LeaderboardResetPluginEventArguments } from "../../src/plugin-host/plugin-events/event-arguments/leaderboard-reset-plugin-event-arguments";
import { TimerTickPluginEventArguments } from "../../src/plugin-host/plugin-events/event-arguments/timer-tick-plugin-event-arguments";

class Reminder
{
  readonly Initiated: Date;
  readonly Trigger: Date;
  readonly Reason: string;

  constructor(_time: number, _reason: string)
  {
    this.Initiated = new Date();
    this.Trigger = new Date();
    this.Trigger.setTime(this.Trigger.getTime() + 1000);
    console.log("Set a new trigger for: " + this.Trigger);
    this.Reason = _reason;
  }
}

/**
 * Danktimes RemindMe!
 */
export class Plugin extends AbstractPlugin
{
  readonly Pattern: RegExp = /^.*\@DankTimesBot RemindMe! (\d+)\s(hours)(.*)$/;
  Reminders: Reminder[] = [];

  /**
   * A plugin should call its base constructor to
   * provide it with an identifier, a version
   * and some optional data.
   */
  constructor()
  {
    super("RemindMe!", "1.0.0", {});

    this.subscribeToPluginEvent(PLUGIN_EVENT.PLUGIN_EVENT_TIMER_TICK, (_data: TimerTickPluginEventArguments) => {
      let output: string[] = [];
      let expired: Reminder[] = [];

      this.Reminders.forEach(reminder => {
        if((new Date()) > reminder.Trigger)
          {
            output.push("RememberMe? " + reminder.Reason);
            expired.push(reminder);
          }
      });

      console.log(expired);
      expired.forEach(_exp => this.Reminders.slice(this.Reminders.indexOf(_exp), 1));
      return output;
    });

    this.subscribeToPluginEvent(PLUGIN_EVENT.PLUGIN_EVENT_PRE_MESSAGE, (_data: PrePostMessagePluginEventArguments) =>
    {
      if(this.Pattern.test(_data.Message))
      {
        let match: RegExpExecArray = this.Pattern.exec(_data.Message);
        let hours: number = +match[1];
        if(hours < 1) return;

        let format: string = match[2];
        if(format.toUpperCase() !== "HOURS") return;

        let reason: string = match[3];
        if(reason.length === 0) return;

        this.Reminders.push(new Reminder(hours, reason));
        return "Okay, added a new reminder!~";
      }
    }); 
  }
} 