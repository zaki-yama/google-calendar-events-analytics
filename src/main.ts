function run() {
  const googleEvents = fetchGoogleEvents();
  const events = convertGoogleEvents(googleEvents);

  const config = getConfig();
  const durationInHoursByCategory = aggregateDurationsByCategory(
    events,
    config
  );

  writeToSpreadSheet(durationInHoursByCategory);

  postToSlack(events, durationInHoursByCategory);
}

type EventColor = GoogleAppsScript.Calendar.EventColor;

function fetchGoogleEvents(): GoogleAppsScript.Calendar.CalendarEvent[] {
  const today = new Date();
  const events = CalendarApp.getEventsForDay(today);

  // filter events so that:
  // - include only accepted events
  // - exclude allday events
  return events.filter(
    (event) =>
      !event.isAllDayEvent() &&
      (event.getMyStatus() === CalendarApp.GuestStatus.OWNER ||
        event.getMyStatus() === CalendarApp.GuestStatus.YES)
  );
}

type Event = {
  title: string;
  startTime: GoogleAppsScript.Base.Date;
  endTime: GoogleAppsScript.Base.Date;
  color: ColorId;
};

function convertGoogleEvents(
  googleEvents: GoogleAppsScript.Calendar.CalendarEvent[]
): Event[] {
  return googleEvents.map((googleEvent) => ({
    title: googleEvent.getTitle(),
    color: googleEvent.getColor() || "default",
    startTime: googleEvent.getStartTime(),
    endTime: googleEvent.getEndTime(),
  }));
}

function aggregateDurationsByCategory(
  events: Event[],
  config: Config
): Map<Category, number> {
  const durationInHoursByCategory = new Map<Category, number>();
  events.forEach((event) => {
    const colorId = event.color;
    const category = config.get(colorId);
    if (!category) {
      console.log(`[skip] ${event.title} (color: ${event.color}`);
      return;
    }
    const durationInHours =
      (event.endTime.getTime() - event.startTime.getTime()) / (60 * 60 * 1000);
    console.log(`[${category}] ${event.title}: ${durationInHours}`);
    const totalDurationInHours =
      durationInHours + (durationInHoursByCategory.get(category) || 0);
    console.log("totalDuration", totalDurationInHours);
    durationInHoursByCategory.set(category, totalDurationInHours);
  });
  return durationInHoursByCategory;
}

function writeToSpreadSheet(durationInHoursByCategory: Map<Category, number>) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("data");
  if (!sheet) {
    throw new Error("data sheet not found");
  }
  const range = sheet.getDataRange();
  console.log(range.getNumRows(), range.getNumColumns());
  const row = sheet.getRange(
    range.getNumRows() + 1,
    1,
    1,
    range.getNumColumns()
  );
  const categories: Category[] = sheet
    .getRange(1, 1, 1, range.getNumColumns())
    .getValues()[0];
  const values = categories.map((category) =>
    durationInHoursByCategory.get(category)
  );
  // @ts-ignore
  values[0] = new Date();
  console.log("values", values);
  row.setValues([values]);
}

type CalendarEvent = {
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  color: string;
};

function createConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("config") || ss.insertSheet("config");

  const headerCells = sheet.getRange(1, 1, 1, 2);
  headerCells.setValues([["Color", "Category"]]);

  const dataCells = sheet.getRange(2, 1, EVENT_COLORS.length + 1, 2);
  dataCells.setBackgrounds([
    ...EVENT_COLORS.map((eventColor) => [eventColor, null]),
    ["white", null],
  ]);
  dataCells.setValues([
    ...EVENT_COLORS.map((_, idx) => [idx + 1, null]),
    ["default", null],
  ]);
}

// ref. https://sakidesign.com/gapi-calendar/
const EVENT_COLORS = [
  "#7986CB", // ラベンダー Lavender
  "#33B679", // セージ Sage
  "#8E24AA", // グレープ Grape
  "#E67C73", // フラミンゴ Flamingo
  "#F6BF26", // バナナ Banana
  "#F4511E", // ミカン Tangerine
  "#039BE5", // ピーコック Peacock
  "#616161", // グラファイト Graphite
  "#3F51B5", // ブルーベリー Blueberry
  "#0B8043", // バジル Basil
  "#D50000", // トマト Tomato
];

type Category = string;
type ColorId = string;
type Config = Map<ColorId, Category>;

function getConfig(): Config {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("config");

  const cells = sheet?.getRange(
    2,
    1,
    sheet.getLastRow(),
    sheet.getLastColumn()
  );
  const res = new Map<string, string>();
  cells?.getValues().forEach((row) => {
    row[1] && res.set(row[0].toString(), row[1]);
  });
  console.log(res);
  return res;
}

const SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/xxxx";

function postToSlack(
  events: Event[],
  durationInHoursByCategory: Map<Category, number>
) {
  const eventsText = events
    .map((event) => {
      return `${toHHmmString(event.startTime)}〜${toHHmmString(
        event.endTime
      )}: ${event.title}`;
    })
    .join("\n");
  const message = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "今日の作業",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`${eventsText}\`\`\``,
        },
      },
    ],
  };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(message),
  } as const;
  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, options);
}

function toHHmmString(date) {
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
}
