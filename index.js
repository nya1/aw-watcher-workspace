const { AWClient } = require("aw-client");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const os = require("os");
const hostname = os.hostname();

// constants
const WATCHER_ENV_PREFIX = "AW_WATCHER_WORKSPACE";
const CLIENT_NAME =
  process.env[`${WATCHER_ENV_PREFIX}_CLIENT_NAME`] || "aw-watcher-workspace";
const DEFAULT_TITLE_NAME = "excluded";

// ignore = do not log events
const ignoreWorkspacesEnv = process.env[`${WATCHER_ENV_PREFIX}_IGNORE`];
const IGNORE_WORKSPACES = ignoreWorkspacesEnv
  ? JSON.parse(ignoreWorkspacesEnv)
  : [];
if (!Array.isArray(IGNORE_WORKSPACES)) {
  throw new Error(`expected ${ignoreWorkspacesEnv} to be an array`);
}
// redact = remove just the title
const redactWorkspacesEnv = process.env[`${WATCHER_ENV_PREFIX}_REDACT`];
const REDACT_WORKSPACES = redactWorkspacesEnv
  ? JSON.parse(redactWorkspacesEnv)
  : [];
if (!Array.isArray(REDACT_WORKSPACES)) {
  throw new Error(`expected ${redactWorkspacesEnv} to be an array`);
}

const client = new AWClient(CLIENT_NAME, {
  testing: process.env[`${WATCHER_ENV_PREFIX}_TESTING`] ? true : false,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseXProp(keyName, stdout, type) {
  const regex = new RegExp(
    `${keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.=.(.*)`
  );
  const valMatch = stdout.match(regex);
  if (!valMatch || typeof valMatch[1] === "undefined") {
    throw new Error(`parseXProp unable to find ${keyName} in string ${stdout}`);
  }
  const value = valMatch[1].replace("●", "").trim();
  if (type === "number") {
    return Number(value);
  } else if (type === "array") {
    return JSON.parse(`[${value}]`);
  } else if (type === "string") {
    return value.replace(/^"(.*)"$/, "$1");
  } else {
    throw new Error(`parseXProp type "${type}" not supported`);
  }
}

async function main() {
  const pollTime = 1.5;

  const eventType = "currentwindow";
  const bucketId = `${CLIENT_NAME}_${hostname}`;
  try {
    await client.createBucket(bucketId, eventType, hostname);
  } catch (err) {
    if (err.response.status !== 304) {
      console.error(err);
      throw new Error(err);
    }
  }

  // load initial workspace names
  const xpropDesktopNames = "_NET_DESKTOP_NAMES";
  const { stdout, stderr } = await exec(
    `xprop -root -notype ${xpropDesktopNames}`
  );
  if (stderr || !stdout) {
    throw new Error(`error while getting workspaces names: ${stderr}`);
  }
  const workspacesNames = parseXProp(xpropDesktopNames, stdout, "array");
  if (!Array.isArray(workspacesNames)) {
    throw new Error(`unable to load workspaces names`);
  }
  console.log(`loaded workspaces: ${workspacesNames.join(", ")}`);

  // activity watch loop
  for (;;) {
    await sleep(pollTime * 1000);

    let focusedWindow;
    try {
      focusedWindow = await exec(`xprop -id $(xdotool getwindowfocus)`);
    } catch (err) {
      // unable to get focused window (e.g. terminal)
    }

    let activeDesktopIndex;
    let focusedWindowTitle = DEFAULT_TITLE_NAME;
    let focusedApp;

    if (focusedWindow && focusedWindow.stdout) {
      activeDesktopIndex = parseXProp(
        "_NET_WM_DESKTOP(CARDINAL)",
        focusedWindow.stdout,
        "number"
      );
      focusedWindowTitle = parseXProp(
        "WM_NAME(UTF8_STRING)",
        focusedWindow.stdout,
        "string"
      );
      focusedApp = parseXProp(
        "WM_CLASS(STRING)",
        focusedWindow.stdout,
        "array"
      ).pop();
    } else {
      // try to get at least active workspace and app with alternative commands
      try {
        const activeWorkspace = await exec(
          `xprop -root -notype _NET_CURRENT_DESKTOP`
        );
        activeDesktopIndex = parseXProp(
          "_NET_CURRENT_DESKTOP",
          activeWorkspace.stdout,
          "number"
        );

        const focusedAppDbusRes = await exec(
          `gdbus call -e -d org.gnome.Shell -o /org/gnome/Shell --method org.gnome.Shell.Eval "global.display.focus_window.get_wm_class()" | cut -d'"' -f 2`
        );
        focusedApp = focusedAppDbusRes.stdout.replace("\n", "").trim();
      } catch (err) {
        console.error(err);
      }
    }

    const now = new Date();

    if (typeof activeDesktopIndex === "undefined" || !focusedApp) {
      // not valid, skip
      continue;
    }

    // prettify
    if (focusedApp.startsWith("gnome-terminal-server")) {
      focusedApp = "terminal";
    }

    const activeDesktopName = workspacesNames[activeDesktopIndex];

    const newData = {
      workspace: activeDesktopName,
      title: focusedWindowTitle,
      app: focusedApp,
      // activeWorkspaceIndex: activeDesktopIndex
    };

    if (REDACT_WORKSPACES.includes(newData.workspace)) {
      newData.title = DEFAULT_TITLE_NAME;
    }

    if (IGNORE_WORKSPACES.includes(newData.workspace)) {
      // skip
      continue;
    }

    // send
    await client.heartbeat(bucketId, pollTime + 1, {
      timestamp: now,
      data: newData,
    });
  }
}

main();
