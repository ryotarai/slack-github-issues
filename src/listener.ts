import * as bolt from '@slack/bolt';
import * as webApi from '@slack/web-api';
import { Octokit } from "@octokit/rest";

const titleMaxLength: number = 40;

interface SlackCommandExtendedArgs extends bolt.SlackCommandMiddlewareArgs {
  context: any;
  body: any;
}

interface SlackViewExtendedArgs extends bolt.SlackViewMiddlewareArgs<bolt.ViewSubmitAction> {
  context: any;
}

export interface ListenerArgs {
  commandName: string;
  owner: string;
  repo: string;
  labels: string[];
  modalTitle: string;
  modalDescription: string;
  modalSubmissionMessage: string;
}

export class GitHubListener {
  app: bolt.App;
  args: ListenerArgs;
  octokit: Octokit;
  viewCallbackId: string;

  constructor(app: bolt.App, args: ListenerArgs, octokit: Octokit) {
    this.app = app;
    this.args = args;
    this.octokit = octokit;
    this.viewCallbackId = `view_${this.args.commandName}`;

    this.app.command(`/${this.args.commandName}`, this.handleCommand.bind(this));
    this.app.view(this.viewCallbackId, this.handleViewSubmit.bind(this));
  }

  async handleCommand(args: SlackCommandExtendedArgs) {
    if (args.command.text === "") {
      await this.handleCommandModal(args);
    } else {
      await this.handleCommandInline(args);
    }
  }

  async handleCommandModal({command, ack, respond, say, context, body}: SlackCommandExtendedArgs) {
    ack();

    try {
      const result = await this.app.client.views.open({
        token: context.botToken,
        trigger_id: body.trigger_id,
        view: this.generateModalView(),
      });
    }
    catch (error) {
      console.error(error);
    }
  }

  async handleCommandInline({command, ack, respond, say, context, body}: SlackCommandExtendedArgs) {
    ack({
      text: "",
      response_type: "in_channel",
    });

    command.user_name

    let issueBody, title: string;
    title = `@${command.user_name}: `;
    if (command.text.length <= titleMaxLength) {
      title += command.text;
      issueBody = "";
    } else {
      title += command.text.substring(0, titleMaxLength) + "...";
      issueBody = "..." + command.text.substring(titleMaxLength);
    }
    issueBody += `\n---\nPosted from #${command.channel_name}`

    try {
      const {data: issue} = await this.octokit.issues.create({
        owner: this.args.owner,
        repo: this.args.repo,
        labels: this.args.labels,
        title: title,
        body: issueBody,
      });

      respond({
        text: `Opened ${issue.html_url}`,
        response_type: "in_channel",
      });
    }
    catch (error) {
      console.error(error);
    }
  }

  async handleViewSubmit({ack, body, view, context, payload}: SlackViewExtendedArgs) {
    await ack({
      response_action: "update",
      view: {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: this.args.modalTitle,
        },
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Now submitting... :outbox_tray:",
            },
          },
        ]
      }
    });

    const title = `@${body['user']['name']}: ${view.state.values["input_title"]["input"]["value"]}`;
    const issueBody = view.state.values["input_body"]["input"]["value"];

    try {
      const {data: issue} = await this.octokit.issues.create({
        owner: this.args.owner,
        repo: this.args.repo,
        labels: this.args.labels,
        title: title,
        body: issueBody,
      });

      const result = await this.app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: this.args.modalTitle,
          },
          blocks: [
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": `Opened <${issue.html_url}|${issue.html_url}>`,
              },
            },
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": this.args.modalSubmissionMessage,
              },
            },
          ]
        }
      });

      await this.app.client.chat.postMessage({
        token: context.botToken,
        channel: body['user']['id'],
        text: `Opened ${issue.html_url}`,
      });
    }
    catch (error) {
      console.error(error);
    }
  }

  generateModalView(): webApi.View {
    const labelOptions = this.args.labels.map((label): webApi.Option => {
      return {
        "text": {
          "type": "plain_text",
          "text": label,
          "emoji": true,
        },
        "value": label,
      };
    });

    return {
      type: 'modal',
      callback_id: this.viewCallbackId,

      "title": {
        "type": "plain_text",
        "text": this.args.modalTitle,
      },
      "submit": {
        "type": "plain_text",
        "text": "Submit"
      },
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": this.args.modalDescription,
          }
        },
        {
          "type": "input",
          "block_id": "input_title",
          "element": {
            "action_id": "input",
            "type": "plain_text_input"
          },
          "label": {
            "type": "plain_text",
            "text": "Title",
            "emoji": true
          }
        },
        {
          "type": "input",
          "block_id": "input_body",
          "element": {
            "action_id": "input",
            "type": "plain_text_input",
            "multiline": true
          },
          "label": {
            "type": "plain_text",
            "text": "Body",
            "emoji": true
          },
          "optional": true,
        },
      ],
    }
  }
}
