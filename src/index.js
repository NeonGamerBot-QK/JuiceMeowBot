require("dotenv").config();
const { App } = require("@slack/bolt");
// const dayjs = require('dayjs');
const { readFileSync } = require("node:fs");
// use keyv sqlite
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");

// Load the relativeTime plugin
dayjs.extend(relativeTime);

const Database = require("keyv").default;
const SQLiteStore = require("@keyv/sqlite").default;
const db = new Database({
  compression: true,
  store: new SQLiteStore("./data.db"),
});
// Initialize the Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN, // Bot token
  appToken: process.env.SLACK_APP_TOKEN, // App-level token
  socketMode: true, // Enables Socket Mode
});
async function getStuffFromEmail(email) {
  if (!email)
    return `Hmm no email found... maybe ask them for there email if u need it??`;
  const data = await fetch(
    "https://juice.hackclub.com/api/get-user-omg-moments?email=" +
      encodeURIComponent(email),
  );
  if (data.status !== 200)
    return `Hmm no email found... maybe ask them for there email if u need it??`;
  const json = await data.json();
  if (!Array.isArray(json))
    return `Hmm no data from email found... maybe ask them for there email if u need it??`;
  return json
    .reverse()
    .map(
      (e, i) =>
        `- *${i + 1}* ${
          e.status == "Pending" ? ":clock1:" : ":white_check_mark:"
        } \`${e.id}\`, description: \`\`\`${e.description}\`\`\` ${
          e.video ? `<${e.video}|Video>` : ""
        } -- Created at: ${dayjs(e.created_at).format(
          `YYYY-MM-DD`,
        )} (${dayjs().to(dayjs(e.created_at))}) `,
    )
    .join("\n");
}
// juice help thing
app.event("message", async ({ message, say }) => {
  if (message.channel === "C08AXLAASJK") {
    const userInfo = await app.client.users.info({ user: message.user });
    if (message.thread_ts) {
      if (await db.get(`help_request_${message.thread_ts}`)) {
        // console.log(message.user)
        const helper_side_message_ts = (
          await db.get(`help_request_${message.thread_ts}`)
        ).helper_side_message_ts;
        app.client.chat.postMessage({
          channel: `C08B5HW0TU6`,
          text: message.text,
          // as_user: true,
          icon_url: userInfo.user.profile.image_72,
          username: userInfo.user.real_name,
          // icon_url: ,
          thread_ts: helper_side_message_ts,
        });
      }
    } else {
      // if(message.type !== "message") return;
      app.client.reactions.add({
        channel: message.channel,
        timestamp: message.ts,
        name: "neocat_mug",
      });
      // send the default message for like instant stuff
      app.client.chat.postMessage({
        channel: message.channel,
        text: readFileSync("./src/default.mrkdwn", "utf8").toString(),
        thread_ts: message.ts,
      });
      const helper_side_message = await app.client.chat.postMessage({
        channel: `C08B5HW0TU6`,
        text: `:neocat: New help request :3\n${await app.client.chat
          .getPermalink({
            channel: `C08AXLAASJK`,
            message_ts: message.ts,
          })
          .then((d) => d.permalink)}`,
      });
      let oldReqs = [];
      for (const e of (await db.get(`old_help_${message.user}`)) || []) {
        if (!e.message_link)
          e.message_link = await app.client.chat.getPermalink({
            channel: `C08AXLAASJK`,
            message_ts: e.message_ts,
          });
        oldReqs.push({ link: e.message_link, ts: e.message_ts });
      }
      oldReqs = oldReqs.slice(oldReqs.length - 5);
      await db.set(
        `old_help_${message.user}`,
        ((await db.get(`old_help_${message.user}`)) || []).map((e) => {
          if (oldReqs.find((e) => e.ts === e.message_ts))
            e.message_link = oldReqs.find((e) => e.ts === e.message_ts).link;
          return e;
        }),
      );
      // console.log(oldReqs)
      console.log(userInfo.user);
      const stuffFromEmail = await getStuffFromEmail(
        userInfo.user.profile.email,
      );
      // await app.client.chat.postMessage({
      //   channel: helper_side_message.channel,
      //   text: `${stuffFromEmail}\n\n<pretend i have airtable creds and cool metadata ab user is here>`,
      //   thread_ts: helper_side_message.ts,
      // });
      await app.client.chat.postMessage({
        channel: helper_side_message.channel,
        thread_ts: helper_side_message.ts,
        text: `User email: \`${userInfo.user.profile.email}\``,
      });
      // await app.client.chat.postMessage({
      //     channel: `C08B5HW0TU6`,
      //     text: message.text,
      //     // as_user: true,
      //     icon_url: userInfo.user.profile.image_72,
      //     username: userInfo.user.real_name,
      //     // icon_url: ,
      //     thread_ts: helper_side_message.ts,
      // })
      await app.client.chat.postMessage({
        thread_ts: helper_side_message.ts,
        channel: helper_side_message.channel,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Use the buttons below`,
            },
          },
          {
            // buttons
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Mark as done",
                  emoji: true,
                },
                value: message.thread_ts,
                action_id: "mark-done-" + message.ts,
              },
            ],
          },
        ],
      });

      const data_to_store = {
        message_ts: message.ts,
        helper_side_message_ts: helper_side_message.ts,
        user: message.user,
      };
      db.set(`help_request_${message.ts}`, data_to_store);
      db.set(`help_request_${helper_side_message.ts}`, data_to_store);
    }
  }
});
app.event("message", async ({ message, say }) => {
  if (message.channel !== "C08B5HW0TU6") return;
  if (!message.thread_ts) return;
  if (!message.text) return;
  if (message.text.startsWith("!")) return;
  const userInfo = await app.client.users.info({ user: message.user });
  const d = await db.get(`help_request_${message.thread_ts}`);
  if (!d || !d.message_ts) return;
  const thread_ts = d.message_ts;
  if (message.text.startsWith("?m")) {
    const name = message.text.slice("?m".length).trim();
    const macro = ((await db.get(`macros_${message.user}`)) || []).find(
      (e) => e.name === name,
    );
    if (!macro)
      return app.client.chat.postEphemeral({
        channel: message.channel,
        text: `Macro \`${name}\` not found`,
        user: message.user,
        thread_ts: message.thread_ts,
      });
    app.client.chat.postMessage({
      channel: `C08B5HW0TU6`,
      text: macro.macroText,
      // as_user: true,
      icon_url: userInfo.user.profile.image_72,
      username: userInfo.user.real_name,
      thread_ts: message.thread_ts,
    });
    await app.client.chat.postMessage({
      channel: `C08AXLAASJK`,
      text: macro.macroText,
      // as_user: true,
      icon_url: userInfo.user.profile.image_72,
      username: userInfo.user.real_name,
      thread_ts: thread_ts,
    });
    return;
  }

  app.client.chat.postMessage({
    channel: `C08AXLAASJK`,
    text: message.text,
    // as_user: true,
    icon_url: userInfo.user.profile.image_72,
    username: userInfo.user.real_name,
    thread_ts: thread_ts,
  });
  // react w/ checkmark
  app.client.reactions.add({
    channel: message.channel,
    timestamp: message.ts,
    name: "done",
  });
});
app.event("reaction_added", async ({ event, say }) => {
  console.debug(`#reaction_added`, event);
  if (event.reaction !== "white_check_mark") return;
  const entry = await db.get(`help_request_${event.item.ts}`);
  console.log(entry);
  if (!entry) return;
  if (entry.user !== event.user) return;
  if (event.item.ts !== entry.message_ts) return;
  // close moment
  console.log(`This is the right message.. right?`);
  const data = entry;
  app.client.chat.postMessage({
    channel: `C08AXLAASJK`,
    text: `:neocat: Help request marked as done by <@${event.user}> :3`,
    // as_user: true,
    thread_ts: data.message_ts,
  });
  app.client.chat.postMessage({
    channel: `C08B5HW0TU6`,
    text: `:neocat: Help request marked as done by <@${event.user}> :3`, // as_user: true,
    thread_ts: data.helper_side_message_ts,
  });
  await app.client.reactions.remove({
    channel: `C08AXLAASJK`,
    timestamp: data.message_ts,
    name: "neocat_mug",
  });
  await app.client.reactions.add({
    channel: `C08AXLAASJK`,
    timestamp: data.message_ts,
    name: "done",
  });

  // get message link
  // app.client
  data.message_link = await app.client.chat.getPermalink({
    channel: `C08AXLAASJK`,
    message_ts: data.message_ts,
  });
  db.set(`old_help_${data.user}`, [
    ...((await db.get(`old_help_${data.user}`)) || []),
    data,
  ]);
  await db.delete(`help_request_${entry.message_ts}`);
  await db.delete(`help_request_${data.helper_side_message_ts}`);
});

// handle dms to create macros
app.event("message", async ({ message, say }) => {
  console.log(message.text, `111`);
  if (!message.text) return;
  if (!message.text.startsWith("?crm")) return;
  if (message.channel_type !== "im")
    return app.client.chat.postEphemeral({
      channel: message.channel,
      text: "This command can only be used in DMs",
      user: message.user,
      thread_ts: message.thread_ts,
    });
  // text to macro
  const [_, name, ...macroText] = message.text.slice("?crm".length).split(/ +/);
  // await db.delete(`macros_${message.user}`)
  await db.set(`macros_${message.user}`, [
    ...((await db.get(`macros_${message.user}`)) || []),
    {
      name,
      macroText: macroText.join(" "),
    },
  ]);
  app.client.chat.postMessage({
    channel: message.channel,
    text: `:neocat: Macro \`${name}\` created`,
  });
});
// button to close it = mark as done
app.action(/mark-done-\w/i, async ({ body, ack, say }) => {
  const data = await db.get(`help_request_${body.message.thread_ts}`);
  if (!data) return;
  //   console.log(data, body, body.message.thread_ts)
  app.client.chat.postMessage({
    channel: `C08AXLAASJK`,
    text: `:neocat: Help request marked as done by <@${body.user.id}> :3`,
    // as_user: true,
    thread_ts: data.message_ts,
  });
  app.client.chat.postMessage({
    channel: `C08B5HW0TU6`,
    text: `:neocat: Help request marked as done by <@${body.user.id}> :3`, // as_user: true,
    thread_ts: data.helper_side_message_ts,
  });
  await app.client.reactions.remove({
    channel: `C08AXLAASJK`,
    timestamp: data.message_ts,
    name: "neocat_mug",
  });
  await app.client.reactions.add({
    channel: `C08AXLAASJK`,
    timestamp: data.message_ts,
    name: "done",
  });

  // get message link
  // app.client
  data.message_link = await app.client.chat.getPermalink({
    channel: `C08AXLAASJK`,
    message_ts: data.message_ts,
  });
  db.set(`old_help_${data.user}`, [
    ...((await db.get(`old_help_${data.user}`)) || []),
    data,
  ]);
  // await db.delete(`help_request_${body.value}`);
  // await db.delete(`help_request_${data.helper_side_message_ts}`);
  ack();
});
// Start the app
(async () => {
  await app.start();
  console.log("⚡ Slack Bolt app is running!");
})();

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});
process.on("uncaughtException", (error) => {
  console.error("Unhandled exception:", error);
});
