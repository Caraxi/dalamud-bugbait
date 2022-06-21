/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

//const { Configuration, OpenAIApi } = require("openai");

import { OpenAIApi, Configuration } from "openai";
import { fetchAdapter } from "@vespaiach/axios-fetch-adapter";

async function readRequestBody(request) {
  const { headers } = request
  const contentType = headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    return await request.json();
  }
  else {
    return null;
  }
}

function checkForbidden(input) {
  return input.includes("@everyone") || input.includes("@here") || input.includes("<@");
}

async function handleRequest(request, env) {
  const reqBody = await readRequestBody(request)

  if (!reqBody) {
    return new Response(`no body`, { status: 400 });
  }

  if (!reqBody.content || !reqBody.version || !reqBody.name || !reqBody.dhash) {
    return new Response(`no content`, { status: 400 });
  }

  if (checkForbidden(reqBody.content) || checkForbidden(reqBody.name) || checkForbidden(reqBody.version) || checkForbidden(reqBody.dhash)) {
    return new Response(`You are in violation of the following internatiÿÿÿÿ`, { status: 451 });
  }

  let res = await sendWebHook(reqBody.content, reqBody.name, reqBody.version, reqBody.reporter, reqBody.exception, reqBody.dhash, env);
  console.log(res);
  if (res == true) {
    return new Response();
  }
  else {
    return new Response(`dispatch failed`, { status: 400 });
  }
}

async function condenseText(body, token) {
  const configuration = new Configuration({
    apiKey: token,
  });
  const openai = new OpenAIApi(configuration);

  const prompt = `The following is user feedback:\n\n${body}\n\nPlease summarise it as one line.\n`

  const completion = await openai.createCompletion({
    model: "text-davinci-002",
    prompt: prompt,
    temperature: 0.7,
    max_tokens: 256,
  },
  {
    adapter: fetchAdapter,
  });

  return completion.data.choices[0].text;
}

async function sendWebHook(content, name, version, reporter, exception, dhash, env) {
  var condensed = "User Feedback";
  if (content.length > 100) {
    condensed = await condenseText(content, env.OPENAI_TOKEN);
  }

  let body = {
    "content": `${name}: ${condensed}`,
    "embeds": [
      {
        "title": "Feedback for " + name,
        "description": content,
        "color": 11289400,
        "timestamp": new Date().toISOString(),
        "footer": {
          "text": version,
        },
        "thumbnail": {
          "url": "https://raw.githubusercontent.com/goatcorp/DalamudPlugins/api5/plugins/" + name + "/images/icon.png"
        },
        "fields": [
          {
            "name": "Dalamud commit#",
            "value": dhash
          }
        ]
      }
    ]
  };

  if (reporter && !checkForbidden(reporter)) {
    body.embeds[0].author = {
      "name": reporter
    };
  }

  if (exception && !checkForbidden(exception)) {
    body.embeds[0].fields[1] = {
      "name": "Exception",
      "value": "```" + exception.substring(0, 950) + "```"
    };
  }

  const init = {
    body: JSON.stringify(body),
    method: "POST",
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
  }
  const response = await fetch(env.DEFAULT_WEBHOOK, init)

  console.log(response);

  return response.status === 204;
}

export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      return handleRequest(request, env);
    }
    else if (request.method === "GET") {
      return new Response(`unsupported`, { status: 400 });
    }
  },
};
