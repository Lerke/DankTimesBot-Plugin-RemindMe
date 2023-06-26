// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import TelegramBot from "node-telegram-bot-api";
import { BotCommand } from "../../src/bot-commands/bot-command";
import { Chat } from "../../src/chat/chat";
import { User } from "../../src/chat/user/user";
import { ChatResetEventArguments } from "../../src/plugin-host/plugin-events/event-arguments/chat-reset-event-arguments";
import { EmptyEventArguments } from "../../src/plugin-host/plugin-events/event-arguments/empty-event-arguments";
import { PluginEvent } from "../../src/plugin-host/plugin-events/plugin-event-types";
import { AbstractPlugin } from "../../src/plugin-host/plugin/plugin";

interface RemindMeStateCache {
    chatId: number;
    reminders: RemindMeReminder[];
}

interface RemindMeReminder {
    user: number;
    reason: string;
    reminded: boolean;
    remindUserAt: Date;
    messageId: number;
}

/**
 * Example of the simplest DankTimesBot
 * plugin. Can be used as a template to
 * build new plugins.
 */
export class Plugin extends AbstractPlugin {

    private static readonly REMIND_ME_DATA_FILE = "remind-me-data.json";

    private static readonly qtyUnitPattern = /^\/remindme\s+(?<qty>-?\d+)\s+(?<unit>\w+)\s+(?<reason>.+)$/mi;
    private static readonly hourMinutePattern = /^\/remindme\s+(?<hour>\d{2}):(?<minute>\d{2})\s+(?<reason>.+)$/mi;

    private remindMeData: { [chatId: number]: RemindMeStateCache } = {};

    private static _sCheckInProgress = false;
    private static _runningChecks = false;

    constructor() {
        super("RemindMe Plugin", "1.0.0");

        this.subscribeToPluginEvent(PluginEvent.BotStartup, this.onBotStartup.bind(this));

        this.subscribeToPluginEvent(PluginEvent.ChatReset, this.clearRemindersForChat.bind(this));

        this.subscribeToPluginEvent(PluginEvent.BotShutdown, (data: EmptyEventArguments) => {
            Plugin._runningChecks = false;
            this.saveState();
        });
    }

    /**
     * @override
     */
    public getPluginSpecificCommands(): BotCommand[] {
        const remindMeCommand = new BotCommand(["remindme"], "Have DankTimesBot remind you of something", this.remindMe.bind(this));
        return [remindMeCommand];
    }

    private onBotStartup(eventArgs: EmptyEventArguments): void {
        const data = this.loadDataFromFile<{ [chatId: number]: RemindMeStateCache }>(Plugin.REMIND_ME_DATA_FILE) ?? {};
        this.remindMeData = data;
        Plugin._runningChecks = true;

        setTimeout(this.doReminderMeChecks.bind(this), 1 * 1000);
    }

    private remindMe(chat: Chat, user: User, msg: TelegramBot.Message, match: string): string {
        let reply = "";

        if (Plugin.qtyUnitPattern.test(msg.text)) {
            const {qty, unit, reason} = Plugin.qtyUnitPattern.exec(msg.text).groups;
            reply = this.setReminderForUserAfterQtyUnit(user, chat, msg, +qty, unit, reason);
        } else if (Plugin.hourMinutePattern.test(msg.text)) {
            const {hour, minute, reason} = Plugin.hourMinutePattern.exec(msg.text).groups;
            reply = this.setReminderForUserAtHourAndMinute(user, chat, msg, +hour, +minute, reason);
        } else {
            reply = "⏰ Usage: /remindme [hh:mm] [reason] | /remindme [number] [seconds|minutes|hours|days] [reason]";
        }

        this.telegramBotClient.sendMessage(chat.id, reply, {reply_to_message_id: msg.message_id});
        return "";
    }

    private setReminderForUserAfterQtyUnit(user: User, chat: Chat, message: TelegramBot.Message, qty: number, unit: string, reason: string) {
        if (qty <= 0) {
            return "⚠️ I can't remind you of something in the past";
        }

        const duration = {
            "second": 1000,
            "seconds": 1000,
            "minute": 60000,
            "minutes": 60000,
            "hour": 3600000,
            "hours": 3600000,
            "day": 86400000,
            "days": 86400000
        };

        const offset = -1 * (new Date()).getTimezoneOffset() * 60000;

        const reminderDuration = duration[unit] * qty;
        if (!reminderDuration) {
            return "⚠️ I don't know this unit. Use second(s), minute(s), hour(s) or day(s)";
        }

        if (!this.remindMeData[chat.id]) {
            this.remindMeData[chat.id] = {
                chatId: chat.id,
                reminders: []
            };
        }

        const setDate = (new Date(new Date().valueOf() + +reminderDuration));
        this.remindMeData[chat.id].reminders.push({
            reminded: false,
            reason: reason,
            messageId: message.message_id,
            remindUserAt: setDate,
            user: user.id
        });

        const s = new Date(setDate.valueOf() + offset).toISOString().split("T");
        const t = s[1].split("Z")[0];
        return `⏰ Set a reminder for ${s[0]} on ${t}`;
    }

    private setReminderForUserAtHourAndMinute(user: User, chat: Chat, message: TelegramBot.Message, hour: number, minute: number, reason: string) {
        if (hour < 0 || hour > 23) {
            return "⚠️ Enter an hour between 0 and 23";
        } else if (minute < 0 || minute > 59) {
            return "⚠️ Enter a minute between 0 and 59";
        }

        const now = new Date();
        const offset = (-1 * now.getTimezoneOffset()) * 60000;
        const isTommorow = hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes());
        const setDate = new Date();
        setDate.setDate(setDate.getDate() + (isTommorow ? 1:0));
        setDate.setHours(+hour);
        setDate.setMinutes(+minute);
        const s = new Date(setDate.valueOf() + offset).toISOString().split("T");
        const t = s[1].split("Z")[0];

        if (!this.remindMeData[chat.id]) {
            this.remindMeData[chat.id] = {
                chatId: chat.id,
                reminders: []
            };
        }

        this.remindMeData[chat.id].reminders.push({
            reminded: false,
            reason: reason,
            messageId: message.message_id,
            remindUserAt: setDate,
            user: user.id
        });

        return `⏰ Set a reminder for ${s[0]} on ${t}`;
    }

    private doReminderMeChecks() {
        if (!Plugin._sCheckInProgress && Plugin._runningChecks) {
            try {
                Plugin._sCheckInProgress = true;
                let save = false;
                for (const c in this.remindMeData) {
                    const now = new Date();
                    const remindersToSend = this.remindMeData[+c].reminders.filter(r => !r.reminded && new Date(r.remindUserAt) < now);
                    for (const r of remindersToSend) {

                        const timeAgo = ((new Date().getTime() - new Date(r.remindUserAt).getTime()) / 60000);
                        // Only send messages which aren't older than 15 minutes or so
                        if (timeAgo <= 15) {
                            this.telegramBotClient.sendMessage(+c, `⏰ Reminder: ${r.reason}`, {
                                reply_to_message_id: r.messageId
                            }).then();
                        }
                        r.reminded = true;
                        save = true;
                    }

                    this.remindMeData[+c].reminders = this.remindMeData[+c].reminders.filter(r => !r.reminded);
                }

                if(save) {
                    this.saveState();
                }
            } catch (e) {
                console.log("err", e);
            } finally {
                Plugin._sCheckInProgress = false;
            }
        }

        setTimeout(this.doReminderMeChecks.bind(this), 1000);
    }

    private saveState() {
        this.saveDataToFile(Plugin.REMIND_ME_DATA_FILE, this.remindMeData);
    }

    private clearRemindersForChat(data: ChatResetEventArguments) {
        if (this.remindMeData[+(data.chat.id)]) {
            delete this.remindMeData[+(data.chat.id)];
        }
        this.saveState();
    }
}
